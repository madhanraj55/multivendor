import {
  BadRequestException,
  Optional,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckoutStatus,
  MovementType,
  OrderStatus,
  ProductStatus,
  SellerOrderStatus,
  ShopStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import {
  CheckoutItemValidationResult,
  CheckoutValidationResponse,
} from './dto/checkout-validation.dto.js';
import { ReserveCheckoutDto } from './dto/reserve-checkout.dto.js';
import { Cron, CronExpression } from '@nestjs/schedule';

interface InventoryRowResult {
  id: string;
  variantId: string;
  availableQuantity: number;
  reservedQuantity: number;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  private readonly pricing: PricingService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() pricingService?: PricingService,
  ) {
    this.pricing = pricingService ?? new PricingService();
  }

  /**
   * Validates cart contents for the authenticated customer prior to checkout attempt.
   * - Reads cart directly from the database using authenticated customer's userId.
   * - Never trusts client-supplied prices, taxes, discounts, or quantities.
   * - Verifies shop approval, product publication, variant activity, and stock availability.
   * - Calculates trusted line subtotals and overall cart subtotal.
   * - Reports GST as UNCONFIGURED (null) when not configured, honoring schema rules.
   * - Performs no mutations: does not reserve inventory, create orders, or alter stock.
   */
  async validateCheckout(userId: string): Promise<CheckoutValidationResponse> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: {
                        id: true,
                        name: true,
                        slug: true,
                        status: true,
                      },
                    },
                    category: {
                      select: {
                        id: true,
                        defaultGstRate: true,
                      },
                    },
                  },
                },
                inventory: {
                  select: {
                    availableQuantity: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException(
        'Cart is empty. Add items to your cart before proceeding to checkout.',
      );
    }

    const itemResults: CheckoutItemValidationResult[] = [];
    const errors: string[] = [];
    let subtotalAmount = 0;
    let totalQuantity = 0;
    let anyUnconfiguredTax = false;

    for (const item of cart.items) {
      const variant = item.variant;
      const product = variant.product;
      const shop = product.shop;
      const inventory = variant.inventory;
      const availableStock = inventory?.availableQuantity ?? 0;

      // Ensure quantity is positive integer
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException(
          `Invalid quantity (${item.quantity}) for variant SKU "${variant.sku}". Must be a positive integer.`,
        );
      }

      totalQuantity += item.quantity;

      // BharatBazaar Pricing Model: Customer Price = Seller Base Price + Commission
      const sellerBasePrice = Number(variant.price);
      const mrp = Number(variant.mrp);
      const itemPricing = this.pricing.calculateItemPrice(sellerBasePrice, mrp);
      const unitPrice = itemPricing.customerPrice;
      const commissionAmount = itemPricing.commissionAmount;
      const lineSubtotal = this.pricing.round(unitPrice * item.quantity);
      subtotalAmount = this.pricing.round(subtotalAmount + lineSubtotal);

      // GST tax resolution (Product.gstRate -> Category.defaultGstRate -> null)
      const rawGstRate =
        product.gstRate ?? product.category?.defaultGstRate ?? null;
      const gstRate = rawGstRate !== null ? Number(rawGstRate) : null;
      const taxStatus: 'CONFIGURED' | 'UNCONFIGURED' =
        gstRate !== null ? 'CONFIGURED' : 'UNCONFIGURED';

      if (taxStatus === 'UNCONFIGURED') {
        anyUnconfiguredTax = true;
      }

      // Check item eligibility & availability
      let isItemValid = true;
      let rejectionReason: string | undefined;

      if (shop.status !== ShopStatus.APPROVED) {
        isItemValid = false;
        rejectionReason = `Shop "${shop.name}" is not approved or active (status: ${shop.status}).`;
      } else if (product.status !== ProductStatus.PUBLISHED) {
        isItemValid = false;
        rejectionReason = `Product "${product.title}" is not available for purchase (status: ${product.status}).`;
      } else if (!variant.isActive) {
        isItemValid = false;
        rejectionReason = `Variant "${variant.title}" (SKU: ${variant.sku}) is currently inactive.`;
      } else if (availableStock < item.quantity) {
        isItemValid = false;
        rejectionReason = `Insufficient stock for "${variant.title}" (SKU: ${variant.sku}). Requested: ${item.quantity}, Available: ${availableStock}.`;
      }

      if (!isItemValid && rejectionReason) {
        errors.push(rejectionReason);
      }

      itemResults.push({
        variantId: variant.id,
        productId: product.id,
        shopId: shop.id,
        shopName: shop.name,
        productTitle: product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        quantity: item.quantity,
        sellerBasePrice,
        commissionAmount,
        unitPrice,
        mrp,
        lineSubtotal,
        availableStock,
        isAvailable: isItemValid,
        gstRate,
        taxStatus,
        ...(rejectionReason ? { rejectionReason } : {}),
      });
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      canProceedToCheckout: isValid,
      currency: 'INR',
      cartId: cart.id,
      totalItems: itemResults.length,
      totalQuantity,
      subtotalAmount,
      platformFee: this.pricing.getSettings().platformFee,
      taxAmount: anyUnconfiguredTax ? null : 0,
      taxStatus: anyUnconfiguredTax ? 'UNCONFIGURED' : 'CONFIGURED',
      items: itemResults,
      errors,
    };
  }

  /**
   * Atomically reserves stock and creates a CheckoutAttempt record.
   * Concurrency & Safety Guarantee:
   * 1. Customer-scoped idempotency key check.
   * 2. Items sorted by variantId to prevent deadlocks under concurrency.
   * 3. Interactive PostgreSQL transaction with atomic conditional update:
   *    UPDATE "Inventory" SET availableQuantity = availableQuantity - $1, reservedQuantity = reservedQuantity + $1
   *    WHERE variantId = $2 AND availableQuantity >= $1 RETURNING ...
   * 4. Logs ORDER_RESERVATION InventoryMovement with exact balanceAfter.
   * 5. Complete rollback on any failure (insufficient stock, invalid variant, shop inactive).
   * 6. Configurable reservation expiry (default 15 minutes).
   */
  async reserveCheckout(userId: string, dto: ReserveCheckoutDto) {
    // 1. Idempotency Check: if attempt with (userId, idempotencyKey) already exists
    const existingAttempt = await this.prisma.checkoutAttempt.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
      include: {
        items: {
          include: {
            variant: {
              select: {
                sku: true,
                title: true,
              },
            },
          },
        },
      },
    });

    if (existingAttempt) {
      if (
        existingAttempt.status === CheckoutStatus.EXPIRED ||
        existingAttempt.status === CheckoutStatus.FAILED
      ) {
        throw new ConflictException(
          `Checkout attempt with idempotency key "${dto.idempotencyKey}" already ended in status ${existingAttempt.status}. Please initiate a new checkout with a fresh key.`,
        );
      }
      if (existingAttempt.status === CheckoutStatus.COMPLETED) {
        throw new ConflictException(
          `Checkout attempt with idempotency key "${dto.idempotencyKey}" is already completed.`,
        );
      }

      return {
        message: 'Existing active checkout reservation returned',
        isExisting: true,
        checkoutAttempt: existingAttempt,
      };
    }

    // 2. Fetch customer cart
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: { id: true, name: true, status: true, pickupAddress: true },
                    },
                    category: {
                      select: { id: true, defaultGstRate: true },
                    },
                  },
                },
                inventory: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cannot reserve stock: cart is empty');
    }

    // 3. Validate catalogue rules & positive quantities
    for (const item of cart.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException(
          `Invalid item quantity (${item.quantity}) for variant SKU "${item.variant.sku}".`,
        );
      }
      if (item.variant.product.shop.status !== ShopStatus.APPROVED) {
        throw new BadRequestException(
          `Shop "${item.variant.product.shop.name}" is not approved or active.`,
        );
      }
      if (item.variant.product.status !== ProductStatus.PUBLISHED) {
        throw new BadRequestException(
          `Product "${item.variant.product.title}" is not available for purchase.`,
        );
      }
      if (!item.variant.isActive) {
        throw new BadRequestException(
          `Variant "${item.variant.title}" (SKU: ${item.variant.sku}) is inactive.`,
        );
      }
      if (!item.variant.inventory) {
        throw new NotFoundException(
          `Inventory tracking record missing for variant "${item.variant.title}".`,
        );
      }
    }

    // 4. Sort items deterministically by variantId to prevent database deadlocks
    const sortedCartItems = [...cart.items].sort((a, b) =>
      a.variantId.localeCompare(b.variantId),
    );

    // Reservation duration from config (default 15 minutes)
    const expiryMinutes = Number(
      this.config.get<string>('CHECKOUT_RESERVATION_DURATION_MINUTES') ?? 15,
    );
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // BharatBazaar Multi-Vendor Package & Distance Delivery Calculation
    const shopGroupMap = new Map<
      string,
      {
        shop: { id: string; name: string; pickupAddress?: any };
        items: Array<{
          variantId: string;
          productTitle: string;
          sku: string;
          quantity: number;
          sellerBasePrice: number;
          mrp?: number;
        }>;
      }
    >();

    for (const item of sortedCartItems) {
      const shop = item.variant.product.shop;
      if (!shopGroupMap.has(shop.id)) {
        shopGroupMap.set(shop.id, {
          shop: {
            id: shop.id,
            name: shop.name,
            pickupAddress: (shop as any).pickupAddress ?? null,
          },
          items: [],
        });
      }
      shopGroupMap.get(shop.id)!.items.push({
        variantId: item.variantId,
        productTitle: item.variant.product.title,
        sku: item.variant.sku,
        quantity: item.quantity,
        sellerBasePrice: Number(item.variant.price),
        mrp: item.variant.mrp ? Number(item.variant.mrp) : undefined,
      });
    }

    const orderPricing = this.pricing.calculateOrderPricing(
      Array.from(shopGroupMap.values()),
      dto.shippingAddress,
    );

    let subtotalAmount = orderPricing.subtotalAmount;
    const checkoutItemsData: Array<{
      variantId: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      inventoryId: string;
      variantSku: string;
      variantTitle: string;
    }> = [];

    for (const pkg of orderPricing.packages) {
      for (const it of pkg.items) {
        const cartItem = sortedCartItems.find((c) => c.variantId === it.variantId)!;
        checkoutItemsData.push({
          variantId: it.variantId,
          quantity: it.quantity,
          unitPrice: it.customerUnitPrice,
          totalPrice: it.totalAmount,
          inventoryId: cartItem.variant.inventory!.id,
          variantSku: it.sku,
          variantTitle: it.productTitle,
        });
      }
    }

    const billingAddress = dto.billingAddress ?? dto.shippingAddress;

    // 5. Atomic Transaction: lock/update inventory conditionally, log movements, create CheckoutAttempt
    return this.prisma.$transaction(
      async (tx) => {
        // Atomic conditional reservation loop
        for (const itemData of checkoutItemsData) {
          const updatedRows = await tx.$queryRaw<InventoryRowResult[]>`
            UPDATE "Inventory"
            SET "availableQuantity" = "availableQuantity" - ${itemData.quantity},
                "reservedQuantity"  = "reservedQuantity" + ${itemData.quantity},
                "updatedAt"         = NOW()
            WHERE "variantId" = ${itemData.variantId}::uuid
              AND "availableQuantity" >= ${itemData.quantity}
            RETURNING "id", "variantId", "availableQuantity", "reservedQuantity";
          `;

          if (!updatedRows || updatedRows.length === 0) {
            throw new ConflictException(
              `Insufficient stock available to reserve variant "${itemData.variantTitle}" (SKU: ${itemData.variantSku}, requested: ${itemData.quantity}).`,
            );
          }

          const updatedInventory = updatedRows[0];

          // Record InventoryMovement
          await tx.inventoryMovement.create({
            data: {
              inventoryId: updatedInventory.id,
              movementType: MovementType.ORDER_RESERVATION,
              quantity: -itemData.quantity,
              balanceAfter: updatedInventory.availableQuantity,
              notes: `Stock reserved for checkout attempt (idempotencyKey: ${dto.idempotencyKey})`,
              createdById: userId,
            },
          });
        }

        // Create CheckoutAttempt and CheckoutItem records
        const checkoutAttempt = await tx.checkoutAttempt.create({
          data: {
            userId,
            idempotencyKey: dto.idempotencyKey,
            status: CheckoutStatus.STOCK_RESERVED,
            shippingAddressSnapshot: dto.shippingAddress as any,
            billingAddressSnapshot: billingAddress as any,
            subtotalAmount,
            taxAmount: 0,
            shippingFee: 0,
            discountAmount: 0,
            totalAmount: subtotalAmount,
            currency: 'INR',
            expiresAt,
            items: {
              create: checkoutItemsData.map((it) => ({
                variantId: it.variantId,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                totalPrice: it.totalPrice,
              })),
            },
          },
          include: {
            items: {
              include: {
                variant: {
                  select: {
                    sku: true,
                    title: true,
                  },
                },
              },
            },
          },
        });

        return {
          message: 'Stock successfully reserved for checkout',
          isExisting: false,
          checkoutAttempt,
        };
      },
      {
        timeout: 15000,
      },
    );
  }

  /**
   * Releases stock for expired checkout reservations.
   * Concurrency Safe:
   * Uses FOR UPDATE SKIP LOCKED to prevent multiple workers from processing
   * the same expired reservation simultaneously.
   *
   * @param overrideDate Optional date threshold (for unit testing or immediate evaluation)
   * @returns Release statistics
   */
  async releaseExpiredCheckouts(overrideDate?: Date) {
    const now = overrideDate ?? new Date();

    // 1. Concurrently safe scan: find candidates whose expiresAt <= now and status in (INITIATED, STOCK_RESERVED, PAYMENT_PENDING)
    // We process each candidate in its own atomic transaction with a row lock.
    const expiredCandidates = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "CheckoutAttempt"
      WHERE "expiresAt" <= ${now}
        AND "status" IN ('INITIATED', 'STOCK_RESERVED', 'PAYMENT_PENDING')
      ORDER BY "expiresAt" ASC
      LIMIT 100;
    `;

    if (!expiredCandidates || expiredCandidates.length === 0) {
      return {
        processedCount: 0,
        releasedCount: 0,
        failedCount: 0,
      };
    }

    let releasedCount = 0;
    let failedCount = 0;

    for (const candidate of expiredCandidates) {
      try {
        const released = await this.prisma.$transaction(
          async (tx) => {
            // Lock the CheckoutAttempt row with FOR UPDATE SKIP LOCKED
            const lockedAttempt = await tx.$queryRaw<
              Array<{
                id: string;
                userId: string;
                status: CheckoutStatus;
                idempotencyKey: string;
              }>
            >`
              SELECT "id", "userId", "status", "idempotencyKey"
              FROM "CheckoutAttempt"
              WHERE "id" = ${candidate.id}::uuid
                AND "status" IN ('INITIATED', 'STOCK_RESERVED', 'PAYMENT_PENDING')
              FOR UPDATE SKIP LOCKED;
            `;

            if (!lockedAttempt || lockedAttempt.length === 0) {
              // Another concurrent worker acquired or finalized this attempt
              return false;
            }

            const attempt = lockedAttempt[0];

            // Only release inventory if stock was actually reserved
            if (
              attempt.status === CheckoutStatus.STOCK_RESERVED ||
              attempt.status === CheckoutStatus.PAYMENT_PENDING
            ) {
              const items = await tx.checkoutItem.findMany({
                where: { checkoutAttemptId: attempt.id },
                orderBy: { variantId: 'asc' }, // consistent order
              });

              for (const item of items) {
                // Verify and atomically return stock:
                // Ensure reservedQuantity >= item.quantity. Do not use GREATEST(0, ...) to conceal inventory anomalies.
                const updatedRows = await tx.$queryRaw<InventoryRowResult[]>`
                  UPDATE "Inventory"
                  SET "availableQuantity" = "availableQuantity" + ${item.quantity},
                      "reservedQuantity"  = "reservedQuantity" - ${item.quantity},
                      "updatedAt"         = NOW()
                  WHERE "variantId" = ${item.variantId}::uuid
                    AND "reservedQuantity" >= ${item.quantity}
                  RETURNING "id", "variantId", "availableQuantity", "reservedQuantity";
                `;

                if (!updatedRows || updatedRows.length === 0) {
                  throw new InternalServerErrorException(
                    `Inventory mismatch: cannot release ${item.quantity} units for variant ${item.variantId} as reservedQuantity is insufficient. Transaction rolled back.`,
                  );
                }

                const updatedInventory = updatedRows[0];

                // Log InventoryMovement
                await tx.inventoryMovement.create({
                  data: {
                    inventoryId: updatedInventory.id,
                    movementType: MovementType.ORDER_CANCELLATION,
                    quantity: item.quantity,
                    balanceAfter: updatedInventory.availableQuantity,
                    notes: `Stock released due to checkout expiry (attemptId: ${attempt.id})`,
                    createdById: attempt.userId,
                  },
                });
              }
            }

            // Transition status to EXPIRED
            await tx.checkoutAttempt.update({
              where: { id: attempt.id },
              data: {
                status: CheckoutStatus.EXPIRED,
              },
            });

            return true;
          },
          {
            timeout: 10000,
          },
        );

        if (released) {
          releasedCount++;
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to release expired checkout attempt ${candidate.id}: ${err.message}`,
          err.stack,
        );
        failedCount++;
      }
    }

    return {
      processedCount: expiredCandidates.length,
      releasedCount,
      failedCount,
    };
  }

  /**
   * Automatic background scheduled job:
   * Scans for and releases expired checkout reservations back to available inventory.
   * Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredCheckoutsCleanup() {
    try {
      const stats = await this.releaseExpiredCheckouts();
      if (stats.releasedCount > 0 || stats.failedCount > 0) {
        this.logger.log(
          `[Scheduled Cleanup] Processed expired checkouts: ${stats.releasedCount} released, ${stats.failedCount} failed`,
        );
      }
    } catch (err) {
      this.logger.error('[Scheduled Cleanup] Error running expired checkouts cleanup job', err);
    }
  }

  /**
   * Places an order from a verified, unexpired stock-reserved checkout attempt.
   * Concurrency & Atomicity Guarantee:
   * 1. Validates caller ownership: checkoutAttempt.userId === authenticated userId.
   * 2. Row-locks the CheckoutAttempt using FOR UPDATE to prevent concurrent double-order placement.
   * 3. Verifies attempt.status is strictly STOCK_RESERVED and has not expired.
   * 4. Verifies inventory consistency: reservedQuantity >= requested quantity.
   * 5. Groups items by shopId: creates 1 parent Order and N child SellerOrders (one per shop).
   * 6. Uses immutable snapshots (title, sku, attributes, prices, tax) for OrderItem records.
   * 7. Logs initial PENDING_PAYMENT OrderStatusHistory records for Order and each SellerOrder.
   * 8. Transitions CheckoutAttempt.status to COMPLETED and links orderId.
   * 9. Empties purchased items from the customer's cart.
   * 10. Does NOT mark order as paid or execute payment gateway flows.
   */
  async placeOrder(
    userId: string,
    dto: { checkoutAttemptId: string; notes?: string; paymentMethod?: string },
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        // 1. Lock the CheckoutAttempt row using FOR UPDATE to prevent race conditions
        const lockedAttempts = await tx.$queryRaw<
          Array<{
            id: string;
            userId: string;
            status: CheckoutStatus;
            shippingAddressSnapshot: any;
            billingAddressSnapshot: any;
            subtotalAmount: any;
            taxAmount: any;
            shippingFee: any;
            discountAmount: any;
            totalAmount: any;
            currency: string;
            orderId: string | null;
            expiresAt: Date;
          }>
        >`
          SELECT "id", "userId", "status", "shippingAddressSnapshot", "billingAddressSnapshot",
                 "subtotalAmount", "taxAmount", "shippingFee", "discountAmount", "totalAmount",
                 "currency", "orderId", "expiresAt"
          FROM "CheckoutAttempt"
          WHERE "id" = ${dto.checkoutAttemptId}::uuid
          FOR UPDATE;
        `;

        if (!lockedAttempts || lockedAttempts.length === 0) {
          throw new NotFoundException('Checkout attempt not found');
        }

        const attempt = lockedAttempts[0];

        // 2. Ownership verification
        if (attempt.userId !== userId) {
          throw new ForbiddenException(
            'You do not have permission to place an order for this checkout attempt',
          );
        }

        // 3. Status and Expiry validation
        if (attempt.status === CheckoutStatus.COMPLETED && attempt.orderId) {
          // Idempotent return of the already placed order
          const existingOrder = await tx.order.findUnique({
            where: { id: attempt.orderId },
            include: {
              sellerOrders: {
                include: {
                  shop: {
                    select: { id: true, name: true, slug: true },
                  },
                  items: true,
                },
              },
            },
          });
          if (existingOrder) {
            return {
              message: 'Order already placed for this checkout attempt',
              isExisting: true,
              order: existingOrder,
            };
          }
        }

        if (attempt.status !== CheckoutStatus.STOCK_RESERVED) {
          throw new BadRequestException(
            `Cannot place order: checkout attempt is in "${attempt.status}" status (must be "${CheckoutStatus.STOCK_RESERVED}").`,
          );
        }

        const now = new Date();
        if (new Date(attempt.expiresAt) <= now) {
          throw new BadRequestException(
            'Cannot place order: stock reservation has expired. Please initiate a new checkout.',
          );
        }

        // 4. Fetch CheckoutItems with current variant, product, shop, and inventory details
        const checkoutItems = await tx.checkoutItem.findMany({
          where: { checkoutAttemptId: attempt.id },
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: { id: true, name: true, status: true },
                    },
                    category: {
                      select: { id: true, defaultGstRate: true },
                    },
                  },
                },
                inventory: {
                  select: { id: true, availableQuantity: true, reservedQuantity: true },
                },
              },
            },
          },
          orderBy: { variantId: 'asc' },
        });

        if (checkoutItems.length === 0) {
          throw new BadRequestException('Checkout attempt has no items');
        }

        // 5. Verify reserved stock consistency across all items
        for (const item of checkoutItems) {
          const inv = item.variant.inventory;
          if (!inv) {
            throw new InternalServerErrorException(
              `Inventory tracking missing for variant "${item.variant.title}"`,
            );
          }
          if (inv.reservedQuantity < item.quantity) {
            throw new ConflictException(
              `Stock reservation inconsistency for variant "${item.variant.title}". Reserved: ${inv.reservedQuantity}, Requested: ${item.quantity}.`,
            );
          }
        }

        // 6. Group items by Shop for SellerOrder creation
        const shopGroupMap = new Map<
          string,
          {
            shop: { id: string; name: string };
            items: typeof checkoutItems;
            subtotalAmount: number;
            totalAmount: number;
          }
        >();

        for (const item of checkoutItems) {
          const shop = item.variant.product.shop;
          const lineTotal = Number(item.totalPrice);

          if (!shopGroupMap.has(shop.id)) {
            shopGroupMap.set(shop.id, {
              shop,
              items: [],
              subtotalAmount: 0,
              totalAmount: 0,
            });
          }

          const group = shopGroupMap.get(shop.id)!;
          group.items.push(item);
          group.subtotalAmount = Number((group.subtotalAmount + lineTotal).toFixed(2));
          group.totalAmount = Number((group.totalAmount + lineTotal).toFixed(2));
        }

        // 7. Generate unique human-readable order number
        const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(100000 + Math.random() * 900000);
        const orderNumber = `ORD-${datePrefix}-${randomSuffix}`;

        // Cash on Delivery (COD) determination:
        // COD orders are automatically confirmed upon placement so sellers can immediately fulfill them.
        // Online payment orders remain in PENDING_PAYMENT to prevent unauthorized fulfillment before payment.
        const isCod =
          dto.paymentMethod?.toUpperCase() === 'COD' ||
          (dto.notes && /\[COD\]|\[Payment:\s*COD\]|Cash on Delivery/i.test(dto.notes));

        const initialOrderStatus = isCod ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT;
        const initialSellerStatus = isCod ? SellerOrderStatus.CONFIRMED : SellerOrderStatus.PENDING_PAYMENT;

        const effectiveNotes = isCod
          ? (dto.notes
              ? (dto.notes.includes('[Payment: COD]') ? dto.notes : `[Payment: COD] ${dto.notes}`)
              : '[Payment: COD]')
          : (dto.notes ?? null);

        // 8. Create Root Order
        const order = await tx.order.create({
          data: {
            orderNumber,
            customerId: userId,
            status: initialOrderStatus,
            subtotalAmount: attempt.subtotalAmount,
            discountAmount: attempt.discountAmount ?? 0,
            shippingFee: attempt.shippingFee ?? 0,
            taxAmount: attempt.taxAmount ?? 0,
            totalAmount: attempt.totalAmount,
            currency: attempt.currency,
            shippingAddressSnapshot: attempt.shippingAddressSnapshot,
            billingAddressSnapshot: attempt.billingAddressSnapshot,
            notes: effectiveNotes,
          },
        });

        // 9. Create Root OrderStatusHistory
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: initialOrderStatus,
            notes: isCod
              ? `Order created via Cash on Delivery (COD) from checkout attempt ${attempt.id}. Auto-confirmed.`
              : `Order created from checkout attempt ${attempt.id}. Awaiting payment confirmation.`,
            changedById: userId,
          },
        });

        // 10. Create SellerOrders & OrderItems per shop with BharatBazaar pricing snapshots
        const pricingSnapshot =
          attempt.billingAddressSnapshot &&
          typeof attempt.billingAddressSnapshot === 'object'
            ? (attempt.billingAddressSnapshot as any).pricingSnapshot
            : null;

        const createdSellerOrders: any[] = [];
        let subOrderIndex = 1;

        for (const [shopId, group] of shopGroupMap.entries()) {
          const subOrderNumber = `${orderNumber}-S${subOrderIndex++}`;

          const pkgPricing = pricingSnapshot?.packages?.find(
            (p: any) => p.shopId === shopId,
          );

          const packageSubtotal = pkgPricing ? Number(pkgPricing.subtotalAmount) : group.subtotalAmount;
          const packageShippingFee = pkgPricing ? Number(pkgPricing.deliveryFee) : 0;
          const packageCommission = pkgPricing ? Number(pkgPricing.commissionAmount) : 0;
          const packageNetSellerPayable = pkgPricing ? Number(pkgPricing.netSellerPayable) : group.subtotalAmount;
          const packageTotal = pkgPricing ? Number(pkgPricing.totalAmount) : Number((group.subtotalAmount + packageShippingFee).toFixed(2));

          const sellerOrder = await tx.sellerOrder.create({
            data: {
              orderId: order.id,
              shopId,
              subOrderNumber,
              status: initialSellerStatus,
              subtotalAmount: packageSubtotal,
              discountAmount: 0,
              shippingFee: packageShippingFee,
              taxAmount: 0,
              totalAmount: packageTotal,
              commissionAmount: packageCommission,
              netSellerPayable: packageNetSellerPayable,
              deliveryType: 'SELLER_MANAGED',
              items: {
                create: group.items.map((item) => {
                  const rawGstRate =
                    item.variant.product.gstRate ??
                    item.variant.product.category?.defaultGstRate ??
                    null;
                  const gstRate = rawGstRate !== null ? Number(rawGstRate) : null;

                  const pkgItem = pkgPricing?.items?.find(
                    (pi: any) => pi.variantId === item.variantId,
                  );

                  return {
                    variantId: item.variantId,
                    productTitleSnapshot: item.variant.product.title,
                    skuSnapshot: item.variant.sku,
                    attributesSnapshot: {
                      ...((item.variant.attributes as object) ?? {}),
                      sellerBasePrice: pkgItem ? pkgItem.sellerBasePrice : Number(item.unitPrice),
                      commissionAmount: pkgItem ? pkgItem.commissionAmount : 0,
                    },
                    quantity: item.quantity,
                    unitPriceSnapshot: item.unitPrice,
                    discountSnapshot: 0,
                    gstRateSnapshot: gstRate,
                    taxAmountSnapshot: 0,
                    totalAmount: item.totalPrice,
                  };
                }),
              },
            },
            include: {
              items: true,
            },
          });

          // Log SellerOrderStatusHistory
          await tx.orderStatusHistory.create({
            data: {
              sellerOrderId: sellerOrder.id,
              status: initialSellerStatus,
              notes: isCod
                ? `Sub-order confirmed automatically for Cash on Delivery (COD) for shop ${group.shop.name}. Ready for fulfillment.`
                : `Sub-order created for shop ${group.shop.name}. Awaiting parent order payment.`,
              changedById: userId,
            },
          });

          createdSellerOrders.push(sellerOrder);
        }

        // 11. Transition CheckoutAttempt to COMPLETED and associate orderId
        await tx.checkoutAttempt.update({
          where: { id: attempt.id },
          data: {
            status: CheckoutStatus.COMPLETED,
            orderId: order.id,
          },
        });

        // 12. Remove purchased items from the customer's cart
        const userCart = await tx.cart.findUnique({
          where: { userId },
          select: { id: true },
        });

        if (userCart) {
          const purchasedVariantIds = checkoutItems.map((it) => it.variantId);
          await tx.cartItem.deleteMany({
            where: {
              cartId: userCart.id,
              variantId: { in: purchasedVariantIds },
            },
          });
        }

        // Return complete placed order
        const finalOrder = await tx.order.findUnique({
          where: { id: order.id },
          include: {
            sellerOrders: {
              include: {
                shop: {
                  select: { id: true, name: true, slug: true },
                },
                items: true,
              },
            },
            statusHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        return {
          message: isCod ? 'Order placed successfully. Confirmed via Cash on Delivery.' : 'Order placed successfully. Awaiting payment.',
          isExisting: false,
          order: finalOrder,
        };
      },
      {
        timeout: 20000,
      },
    );
  }

  /**
   * Safe read-only recovery of a checkout attempt for an authenticated customer.
   * Performs strict ownership verification against the authenticated JWT userId.
   * Never mutates orders, inventory, or cart state.
   */
  async getCheckoutAttempt(userId: string, attemptId: string) {
    const attempt = await this.prisma.checkoutAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException('Checkout attempt not found');
    }

    const now = new Date();
    const isExpired =
      attempt.status === CheckoutStatus.EXPIRED ||
      (attempt.status === CheckoutStatus.STOCK_RESERVED &&
        new Date(attempt.expiresAt) <= now);

    // If completed and has associated order, verify order customer and return order with shops
    if (attempt.status === CheckoutStatus.COMPLETED && attempt.orderId) {
      const existingOrder = await this.prisma.order.findUnique({
        where: { id: attempt.orderId },
        include: {
          sellerOrders: {
            include: {
              shop: {
                select: { id: true, name: true, slug: true },
              },
              items: true,
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (existingOrder && existingOrder.customerId === userId) {
        return {
          id: attempt.id,
          status: attempt.status,
          isExpired: false,
          isExisting: true,
          expiresAt: attempt.expiresAt,
          order: existingOrder,
        };
      }
    }

    return {
      id: attempt.id,
      status: isExpired ? CheckoutStatus.EXPIRED : attempt.status,
      isExpired,
      isExisting: false,
      expiresAt: attempt.expiresAt,
      order: null,
    };
  }
}

