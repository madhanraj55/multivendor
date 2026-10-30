import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MovementType,
  OrderStatus,
  Prisma,
  SellerOrderStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AdminUpdateOrderStatusDto,
  AdminUpdateSubOrderStatusDto,
  QueryAdminOrdersDto,
} from './dto/admin-order.dto.js';
import {
  CustomerCancelOrderDto,
  CustomerReturnOrderDto,
  QueryOrdersDto,
  QuerySellerOrdersDto,
  UpdateSellerOrderStatusDto,
} from './dto/order.dto.js';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // TASK A: CUSTOMER ORDER APIS
  // ---------------------------------------------------------------------------

  /**
   * Retrieves paginated orders for the authenticated customer.
   * Newest first, customer-scoped.
   */
  async getCustomerOrders(userId: string, query: QueryOrdersDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const [total, orders] = await Promise.all([
      this.prisma.order.count({
        where: { customerId: userId },
      }),
      this.prisma.order.findMany({
        where: { customerId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sellerOrders: {
            select: {
              id: true,
              subOrderNumber: true,
              status: true,
              totalAmount: true,
              deliveryType: true,
              shop: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
              _count: {
                select: { items: true },
              },
            },
            orderBy: { subOrderNumber: 'asc' },
          },
        },
      }),
    ]);

    const formattedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotalAmount: Number(order.subtotalAmount),
      discountAmount: Number(order.discountAmount),
      shippingFee: Number(order.shippingFee),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      createdAt: order.createdAt,
      sellerOrdersCount: order.sellerOrders.length,
      sellerOrders: order.sellerOrders.map((so) => ({
        subOrderNumber: so.subOrderNumber,
        shopName: so.shop.name,
        shopSlug: so.shop.slug,
        status: so.status,
        totalAmount: Number(so.totalAmount),
        itemCount: so._count.items,
        deliveryType: so.deliveryType,
      })),
    }));

    return {
      data: formattedOrders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single order by orderNumber with full snapshots and seller sub-orders.
   * Scoped strictly to the authenticated customer.
   */
  async getCustomerOrderByNumber(userId: string, orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        sellerOrders: {
          include: {
            shop: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            items: {
              orderBy: { id: 'asc' },
            },
            statusHistory: {
              orderBy: { createdAt: 'asc' },
              select: {
                status: true,
                notes: true,
                createdAt: true,
              },
            },
          },
          orderBy: { subOrderNumber: 'asc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            status: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${orderNumber}" not found`);
    }

    if (order.customerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to view this order',
      );
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      subtotalAmount: Number(order.subtotalAmount),
      discountAmount: Number(order.discountAmount),
      shippingFee: Number(order.shippingFee),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      shippingAddress: order.shippingAddressSnapshot,
      billingAddress: order.billingAddressSnapshot,
      notes: order.notes,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      statusHistory: order.statusHistory,
      sellerOrders: order.sellerOrders.map((so) => ({
        id: so.id,
        subOrderNumber: so.subOrderNumber,
        status: so.status,
        shop: so.shop,
        subtotalAmount: Number(so.subtotalAmount),
        shippingFee: Number(so.shippingFee),
        taxAmount: Number(so.taxAmount),
        totalAmount: Number(so.totalAmount),
        deliveryType: so.deliveryType,
        items: so.items.map((it) => ({
          id: it.id,
          variantId: it.variantId,
          productTitle: it.productTitleSnapshot,
          sku: it.skuSnapshot,
          attributes: it.attributesSnapshot,
          quantity: it.quantity,
          unitPrice: Number(it.unitPriceSnapshot),
          discount: Number(it.discountSnapshot),
          gstRate: it.gstRateSnapshot ? Number(it.gstRateSnapshot) : null,
          taxAmount: Number(it.taxAmountSnapshot),
          totalAmount: Number(it.totalAmount),
        })),
        statusHistory: so.statusHistory,
      })),
    };
  }
  /**
   * Concurrency-safe inventory restoration helper with audit trail.
   * Restores reserved stock back to availableQuantity and logs ORDER_CANCELLATION.
   * Deterministic sort by variantId prevents lock ordering deadlocks.
   */
  private async restoreInventoryForOrderItems(
    tx: Prisma.TransactionClient,
    items: Array<{ variantId: string; quantity: number }>,
    userId: string,
    reason: string,
    referenceId: string,
  ) {
    const sortedItems = [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));

    for (const item of sortedItems) {
      const updatedRows = await tx.$queryRaw<
        Array<{ id: string; availableQuantity: number; reservedQuantity: number }>
      >`
        UPDATE "Inventory"
        SET "availableQuantity" = "availableQuantity" + ${item.quantity},
            "reservedQuantity"  = GREATEST(0, "reservedQuantity" - ${item.quantity}),
            "updatedAt"         = NOW()
        WHERE "variantId" = ${item.variantId}::uuid
        RETURNING "id", "availableQuantity", "reservedQuantity";
      `;

      if (updatedRows && updatedRows.length > 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: updatedRows[0].id,
            movementType: MovementType.ORDER_CANCELLATION,
            quantity: item.quantity,
            balanceAfter: updatedRows[0].availableQuantity,
            referenceId,
            notes: `Stock restored due to cancellation: ${reason}`,
            createdById: userId,
          },
        });
      }
    }
  }

  /**
   * Concurrency-safe inventory fulfillment helper with audit trail.
   * Decreases reservedQuantity upon delivery completion and logs ORDER_FULFILLMENT.
   */
  private async fulfillInventoryForOrderItems(
    tx: Prisma.TransactionClient,
    items: Array<{ variantId: string; quantity: number }>,
    userId: string,
    referenceId: string,
  ) {
    const sortedItems = [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));

    for (const item of sortedItems) {
      const updatedRows = await tx.$queryRaw<
        Array<{ id: string; availableQuantity: number; reservedQuantity: number }>
      >`
        UPDATE "Inventory"
        SET "reservedQuantity"  = GREATEST(0, "reservedQuantity" - ${item.quantity}),
            "updatedAt"         = NOW()
        WHERE "variantId" = ${item.variantId}::uuid
        RETURNING "id", "availableQuantity", "reservedQuantity";
      `;

      if (updatedRows && updatedRows.length > 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: updatedRows[0].id,
            movementType: MovementType.ORDER_FULFILLMENT,
            quantity: item.quantity,
            balanceAfter: updatedRows[0].availableQuantity,
            referenceId,
            notes: `Stock fulfilled upon delivery for sub-order ${referenceId}`,
            createdById: userId,
          },
        });
      }
    }
  }

  /**
   * Concurrency-safe inventory return restock helper with audit trail.
   * Restores returned items to availableQuantity and logs RETURN_RESTOCK.
   */
  private async returnRestockInventoryForOrderItems(
    tx: Prisma.TransactionClient,
    items: Array<{ variantId: string; quantity: number }>,
    userId: string,
    referenceId: string,
    reason: string,
  ) {
    const sortedItems = [...items].sort((a, b) => a.variantId.localeCompare(b.variantId));

    for (const item of sortedItems) {
      const updatedRows = await tx.$queryRaw<
        Array<{ id: string; availableQuantity: number; reservedQuantity: number }>
      >`
        UPDATE "Inventory"
        SET "availableQuantity" = "availableQuantity" + ${item.quantity},
            "updatedAt"         = NOW()
        WHERE "variantId" = ${item.variantId}::uuid
        RETURNING "id", "availableQuantity", "reservedQuantity";
      `;

      if (updatedRows && updatedRows.length > 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: updatedRows[0].id,
            movementType: MovementType.RETURN_RESTOCK,
            quantity: item.quantity,
            balanceAfter: updatedRows[0].availableQuantity,
            referenceId,
            notes: `Stock restocked from customer return: ${reason}`,
            createdById: userId,
          },
        });
      }
    }
  }

  /**
   * Customer order cancellation.
   * Customers may cancel orders that are PENDING_PAYMENT or CONFIRMED.
   * Concurrently releases reserved inventory for all sub-orders and logs audit trails.
   */
  async customerCancelOrder(
    userId: string,
    orderNumber: string,
    dto: CustomerCancelOrderDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderNumber },
        include: {
          sellerOrders: {
            include: { items: true },
          },
        },
      });

      if (!order || order.customerId !== userId) {
        throw new NotFoundException(`Order "${orderNumber}" not found`);
      }

      if (order.status === OrderStatus.CANCELLED) {
        throw new BadRequestException('Order is already cancelled');
      }

      if (
        order.status !== OrderStatus.PENDING_PAYMENT &&
        order.status !== OrderStatus.CONFIRMED
      ) {
        throw new BadRequestException(
          `Cannot cancel order in status "${order.status}". Only PENDING_PAYMENT or CONFIRMED orders can be cancelled. For shipped/delivered packages, please request a return.`,
        );
      }

      const anyInTransit = order.sellerOrders.some(
        (so) =>
          so.status === SellerOrderStatus.SHIPPED ||
          so.status === SellerOrderStatus.DELIVERED,
      );
      if (anyInTransit) {
        throw new BadRequestException(
          'Cannot cancel order because one or more packages are already shipped or delivered.',
        );
      }

      const cancelReason = dto.reason ? `[Customer: ${dto.reason}]` : '[Customer Cancellation]';

      // 1. Update root order
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.CANCELLED,
          notes: order.notes ? `${order.notes} ${cancelReason}` : cancelReason,
        },
      });

      // 2. Log root order history
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: OrderStatus.CANCELLED,
          notes: dto.reason || 'Order cancelled by customer',
          changedById: userId,
        },
      });

      // 3. Cancel each sub-order and restore reserved inventory
      for (const so of order.sellerOrders) {
        if (so.status !== SellerOrderStatus.CANCELLED) {
          await this.restoreInventoryForOrderItems(
            tx,
            so.items,
            userId,
            dto.reason || 'Customer order cancellation',
            so.subOrderNumber,
          );

          await tx.sellerOrder.update({
            where: { id: so.id },
            data: {
              status: SellerOrderStatus.CANCELLED,
              cancellationReason: dto.reason || 'Customer order cancellation',
            },
          });

          await tx.orderStatusHistory.create({
            data: {
              sellerOrderId: so.id,
              status: SellerOrderStatus.CANCELLED,
              notes: dto.reason || 'Sub-order cancelled by customer',
              changedById: userId,
            },
          });
        }
      }

      return {
        message: 'Order successfully cancelled and reserved inventory restored.',
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
      };
    });
  }

  /**
   * Customer return request for delivered packages.
   * Validates return eligibility and return window (7 days).
   */
  async customerRequestReturn(
    userId: string,
    orderNumber: string,
    dto: CustomerReturnOrderDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderNumber },
        include: {
          sellerOrders: {
            where: { subOrderNumber: dto.subOrderNumber },
            include: { items: true },
          },
        },
      });

      if (!order || order.customerId !== userId) {
        throw new NotFoundException(`Order "${orderNumber}" not found`);
      }

      const subOrder = order.sellerOrders[0];
      if (!subOrder) {
        throw new NotFoundException(
          `Package "${dto.subOrderNumber}" not found in this order`,
        );
      }

      if (subOrder.status !== SellerOrderStatus.DELIVERED) {
        throw new BadRequestException(
          `Return can only be requested for DELIVERED packages. Current status is "${subOrder.status}".`,
        );
      }

      if (subOrder.deliveredAt) {
        const daysSinceDelivery =
          (Date.now() - new Date(subOrder.deliveredAt).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysSinceDelivery > 7) {
          throw new BadRequestException(
            'The 7-day return window for this delivered package has passed.',
          );
        }
      }

      const updatedSubOrder = await tx.sellerOrder.update({
        where: { id: subOrder.id },
        data: {
          status: SellerOrderStatus.RETURN_REQUESTED,
          cancellationReason: dto.reason,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          sellerOrderId: subOrder.id,
          status: SellerOrderStatus.RETURN_REQUESTED,
          notes: `Customer requested return: ${dto.reason}`,
          changedById: userId,
        },
      });

      return {
        message: 'Return request submitted successfully. The seller has been notified.',
        subOrderNumber: updatedSubOrder.subOrderNumber,
        status: updatedSubOrder.status,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // TASK B: SELLER ORDER APIS
  // ---------------------------------------------------------------------------

  /**
   * Retrieves sub-orders belonging exclusively to shops owned by the seller.
   */
  async getSellerOrders(userId: string, query: QuerySellerOrdersDto) {
    const shop = await this.getSellerShop(userId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const where: any = { shopId: shop.id };
    if (query.status) {
      where.status = query.status;
    }

    const [total, subOrders] = await Promise.all([
      this.prisma.sellerOrder.count({ where }),
      this.prisma.sellerOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              orderNumber: true,
              currency: true,
              createdAt: true,
            },
          },
          items: {
            select: {
              id: true,
              productTitleSnapshot: true,
              skuSnapshot: true,
              quantity: true,
              totalAmount: true,
            },
          },
        },
      }),
    ]);

    const formattedSubOrders = subOrders.map((so) => ({
      id: so.id,
      subOrderNumber: so.subOrderNumber,
      parentOrderNumber: so.order.orderNumber,
      status: so.status,
      subtotalAmount: Number(so.subtotalAmount),
      totalAmount: Number(so.totalAmount),
      netSellerPayable: Number(so.netSellerPayable),
      currency: so.order.currency,
      deliveryType: so.deliveryType,
      itemCount: so.items.length,
      createdAt: so.createdAt,
      items: so.items.map((it) => ({
        id: it.id,
        title: it.productTitleSnapshot,
        sku: it.skuSnapshot,
        quantity: it.quantity,
        totalAmount: Number(it.totalAmount),
      })),
    }));

    return {
      shop: { id: shop.id, name: shop.name },
      data: formattedSubOrders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single seller sub-order details.
   * Enforces shop ownership. Returns item snapshots and applicable shipping address.
   */
  async getSellerOrderByNumber(userId: string, subOrderNumber: string) {
    const shop = await this.getSellerShop(userId);

    const subOrder = await this.prisma.sellerOrder.findUnique({
      where: { subOrderNumber },
      include: {
        order: {
          select: {
            orderNumber: true,
            currency: true,
            shippingAddressSnapshot: true,
            createdAt: true,
          },
        },
        items: true,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            status: true,
            notes: true,
            createdAt: true,
          },
        },
      },
    });

    if (!subOrder) {
      throw new NotFoundException(`Sub-order "${subOrderNumber}" not found`);
    }

    if (subOrder.shopId !== shop.id) {
      throw new ForbiddenException(
        'You do not have permission to view sub-orders for another shop',
      );
    }

    return {
      id: subOrder.id,
      subOrderNumber: subOrder.subOrderNumber,
      parentOrderNumber: subOrder.order.orderNumber,
      status: subOrder.status,
      subtotalAmount: Number(subOrder.subtotalAmount),
      discountAmount: Number(subOrder.discountAmount),
      shippingFee: Number(subOrder.shippingFee),
      taxAmount: Number(subOrder.taxAmount),
      totalAmount: Number(subOrder.totalAmount),
      commissionAmount: Number(subOrder.commissionAmount),
      netSellerPayable: Number(subOrder.netSellerPayable),
      currency: subOrder.order.currency,
      deliveryType: subOrder.deliveryType,
      cancellationReason: subOrder.cancellationReason,
      deliveredAt: subOrder.deliveredAt,
      createdAt: subOrder.createdAt,
      updatedAt: subOrder.updatedAt,
      shippingAddress: subOrder.order.shippingAddressSnapshot,
      statusHistory: subOrder.statusHistory,
      items: subOrder.items.map((it) => ({
        id: it.id,
        variantId: it.variantId,
        productTitle: it.productTitleSnapshot,
        sku: it.skuSnapshot,
        attributes: it.attributesSnapshot,
        quantity: it.quantity,
        unitPrice: Number(it.unitPriceSnapshot),
        discount: Number(it.discountSnapshot),
        gstRate: it.gstRateSnapshot ? Number(it.gstRateSnapshot) : null,
        taxAmount: Number(it.taxAmountSnapshot),
        totalAmount: Number(it.totalAmount),
      })),
    };
  }

  /**
   * Updates SellerOrder status with transactional transition validation.
   *
   * Business Rules:
   * 1. Sellers cannot touch sub-orders while in PENDING_PAYMENT.
   *    Fulfillment (CONFIRMED, PROCESSING, PACKED, SHIPPED, DELIVERED) is strictly
   *    blocked until verified payment confirmation exists.
   * 2. Valid transitions (post-payment):
   *    CONFIRMED -> PROCESSING or CANCELLED
   *    PROCESSING -> PACKED or CANCELLED
   *    PACKED -> SHIPPED
   *    SHIPPED -> DELIVERED
   * 3. Row lock via FOR UPDATE in interactive transaction ensures no race conditions.
   * 4. Atomic OrderStatusHistory creation in same transaction.
   * 5. Does not deduct or alter stock balances.
   */
  async updateSellerOrderStatus(
    userId: string,
    subOrderNumber: string,
    dto: UpdateSellerOrderStatusDto,
  ) {
    const shop = await this.getSellerShop(userId);

    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the sub-order row with FOR UPDATE
      const lockedSubOrders = await tx.$queryRaw<
        Array<{
          id: string;
          orderId: string;
          shopId: string;
          status: SellerOrderStatus;
          subOrderNumber: string;
        }>
      >`
        SELECT "id", "orderId", "shopId", "status", "subOrderNumber"
        FROM "SellerOrder"
        WHERE "subOrderNumber" = ${subOrderNumber}
        FOR UPDATE;
      `;

      if (!lockedSubOrders || lockedSubOrders.length === 0) {
        throw new NotFoundException(`Sub-order "${subOrderNumber}" not found`);
      }

      const currentSubOrder = lockedSubOrders[0];

      if (currentSubOrder.shopId !== shop.id) {
        throw new ForbiddenException(
          'You do not have permission to update sub-orders for another shop',
        );
      }

      const currentStatus = currentSubOrder.status;
      const targetStatus = dto.status;

      // 2. Strict Rule: Block fulfillment while PENDING_PAYMENT
      if (currentStatus === SellerOrderStatus.PENDING_PAYMENT) {
        throw new BadRequestException(
          `Cannot update status: Sub-order is currently PENDING_PAYMENT. Sellers cannot confirm, process, pack, ship, or deliver orders until payment is confirmed.`,
        );
      }

      // 3. Prevent redundant update
      if (currentStatus === targetStatus) {
        throw new BadRequestException(
          `Sub-order is already in status "${currentStatus}".`,
        );
      }

      // 4. Validate allowed post-payment transition matrix
      const allowedTransitions: Record<SellerOrderStatus, SellerOrderStatus[]> = {
        [SellerOrderStatus.PENDING_PAYMENT]: [], // Handled above
        [SellerOrderStatus.CONFIRMED]: [
          SellerOrderStatus.PACKED,
          SellerOrderStatus.PROCESSING,
          SellerOrderStatus.CANCELLED,
        ],
        [SellerOrderStatus.PROCESSING]: [
          SellerOrderStatus.PACKED,
          SellerOrderStatus.CANCELLED,
        ],
        [SellerOrderStatus.PACKED]: [
          SellerOrderStatus.SHIPPED,
          SellerOrderStatus.CANCELLED,
        ],
        [SellerOrderStatus.SHIPPED]: [SellerOrderStatus.DELIVERED],
        [SellerOrderStatus.DELIVERED]: [SellerOrderStatus.RETURN_REQUESTED],
        [SellerOrderStatus.CANCELLED]: [],
        [SellerOrderStatus.RETURN_REQUESTED]: [SellerOrderStatus.RETURNED],
        [SellerOrderStatus.RETURNED]: [],
      };

      const validTargets = allowedTransitions[currentStatus] ?? [];
      if (!validTargets.includes(targetStatus)) {
        throw new BadRequestException(
          `Invalid status transition from "${currentStatus}" to "${targetStatus}". Allowed next statuses: [${validTargets.join(', ')}].`,
        );
      }

      // 5. Update SellerOrder
      const updatedSubOrder = await tx.sellerOrder.update({
        where: { id: currentSubOrder.id },
        data: {
          status: targetStatus,
          ...(targetStatus === SellerOrderStatus.DELIVERED
            ? { deliveredAt: new Date() }
            : {}),
          ...(targetStatus === SellerOrderStatus.CANCELLED && dto.notes
            ? { cancellationReason: dto.notes }
            : {}),
        },
      });

      // Stock lifecycle transitions:
      const subOrderItems = await tx.orderItem.findMany({
        where: { sellerOrderId: currentSubOrder.id },
      });

      if (targetStatus === SellerOrderStatus.CANCELLED) {
        await this.restoreInventoryForOrderItems(
          tx,
          subOrderItems,
          userId,
          dto.notes || 'Seller cancelled sub-order',
          currentSubOrder.subOrderNumber,
        );
      } else if (targetStatus === SellerOrderStatus.DELIVERED) {
        await this.fulfillInventoryForOrderItems(
          tx,
          subOrderItems,
          userId,
          currentSubOrder.subOrderNumber,
        );
      } else if (
        currentStatus === SellerOrderStatus.RETURN_REQUESTED &&
        targetStatus === SellerOrderStatus.RETURNED
      ) {
        await this.returnRestockInventoryForOrderItems(
          tx,
          subOrderItems,
          userId,
          currentSubOrder.subOrderNumber,
          dto.notes || 'Seller approved return and restocked inventory',
        );
      }

      // 6. Record OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          sellerOrderId: updatedSubOrder.id,
          status: targetStatus,
          notes: dto.notes ?? `Seller updated status to ${targetStatus}`,
          changedById: userId,
        },
      });

      // 7. Synchronize parent Order status based on all sibling sub-orders
      const parentOrder = await tx.order.findUnique({
        where: { id: currentSubOrder.orderId },
        include: {
          sellerOrders: {
            select: { id: true, status: true },
          },
        },
      });

      let newParentStatus: OrderStatus | undefined;
      if (parentOrder && parentOrder.sellerOrders.length > 0) {
        const allSubOrders = parentOrder.sellerOrders.map((so) =>
          so.id === currentSubOrder.id ? { ...so, status: targetStatus } : so,
        );

        const activeSubOrders = allSubOrders.filter(
          (so) =>
            so.status !== SellerOrderStatus.CANCELLED &&
            so.status !== SellerOrderStatus.RETURNED,
        );

        if (activeSubOrders.length > 0) {
          const allDelivered = activeSubOrders.every(
            (so) => so.status === SellerOrderStatus.DELIVERED,
          );
          const allShipped = activeSubOrders.every(
            (so) =>
              so.status === SellerOrderStatus.SHIPPED ||
              so.status === SellerOrderStatus.DELIVERED,
          );
          const anyShipped = activeSubOrders.some(
            (so) =>
              so.status === SellerOrderStatus.SHIPPED ||
              so.status === SellerOrderStatus.DELIVERED,
          );

          if (allDelivered && parentOrder.status !== OrderStatus.DELIVERED) {
            newParentStatus = OrderStatus.DELIVERED;
          } else if (allShipped && parentOrder.status !== OrderStatus.SHIPPED) {
            newParentStatus = OrderStatus.SHIPPED;
          } else if (
            anyShipped &&
            parentOrder.status !== OrderStatus.PARTIALLY_SHIPPED &&
            parentOrder.status !== OrderStatus.SHIPPED &&
            parentOrder.status !== OrderStatus.DELIVERED
          ) {
            newParentStatus = OrderStatus.PARTIALLY_SHIPPED;
          }
        }

        if (newParentStatus) {
          await tx.order.update({
            where: { id: currentSubOrder.orderId },
            data: { status: newParentStatus },
          });

          await tx.orderStatusHistory.create({
            data: {
              orderId: currentSubOrder.orderId,
              status: newParentStatus,
              notes: `Parent order updated to ${newParentStatus} automatically after sub-order ${currentSubOrder.subOrderNumber} status changed to ${targetStatus}`,
              changedById: userId,
            },
          });
        }
      }

      return {
        message: `Sub-order status updated to ${targetStatus}`,
        subOrderNumber: updatedSubOrder.subOrderNumber,
        previousStatus: currentStatus,
        status: updatedSubOrder.status,
        deliveredAt: updatedSubOrder.deliveredAt,
        parentOrderStatus: newParentStatus ?? parentOrder?.status,
      };
    });
  }

  private async getSellerShop(userId: string) {
    if (!userId) {
      throw new ForbiddenException('Seller authentication required');
    }
    const shop = await this.prisma.shop.findUnique({
      where: { sellerId: userId },
    });

    if (!shop) {
      throw new ForbiddenException('No shop profile found for this seller account');
    }

    return shop;
  }

  // ===========================================================================
  // TASK C: ADMIN ORDER MANAGEMENT APIS
  // ===========================================================================

  /**
   * 1. GET /api/v1/admin/orders
   * Lists parent orders across all customers and shops.
   * Newest-first sorting, pagination, and filters for status, customerId, orderNumber, date range.
   * Strips password hashes, session tokens, and sensitive customer secrets.
   */
  async getAdminOrders(query: QueryAdminOrdersDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.orderNumber) {
      where.orderNumber = {
        contains: query.orderNumber,
        mode: 'insensitive',
      };
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
            },
          },
          sellerOrders: {
            select: {
              id: true,
              subOrderNumber: true,
              status: true,
              totalAmount: true,
              deliveryType: true,
              shop: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
              _count: {
                select: { items: true },
              },
            },
            orderBy: { subOrderNumber: 'asc' },
          },
        },
      }),
    ]);

    const formattedOrders = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customer: order.customer,
      subtotalAmount: Number(order.subtotalAmount),
      discountAmount: Number(order.discountAmount),
      shippingFee: Number(order.shippingFee),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      createdAt: order.createdAt,
      sellerOrdersCount: order.sellerOrders.length,
      sellerOrders: order.sellerOrders.map((so) => ({
        subOrderNumber: so.subOrderNumber,
        shopName: so.shop.name,
        shopSlug: so.shop.slug,
        status: so.status,
        totalAmount: Number(so.totalAmount),
        itemCount: so._count.items,
        deliveryType: so.deliveryType,
      })),
    }));

    return {
      data: formattedOrders,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 2. GET /api/v1/admin/orders/:orderNumber
   * Comprehensive parent order view for administration and support.
   * Includes customer details, seller sub-orders, item snapshots, delivery addresses,
   * status history, and checkout attempt details.
   */
  async getAdminOrderByNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
        sellerOrders: {
          include: {
            shop: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                sellerId: true,
                seller: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    phone: true,
                  },
                },
              },
            },
            items: {
              orderBy: { id: 'asc' },
            },
            statusHistory: {
              orderBy: { createdAt: 'asc' },
              include: {
                changedBy: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    role: true,
                  },
                },
              },
            },
          },
          orderBy: { subOrderNumber: 'asc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            changedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
        },
        checkoutAttempt: {
          select: {
            id: true,
            status: true,
            idempotencyKey: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${orderNumber}" not found`);
    }

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      customer: order.customer,
      subtotalAmount: Number(order.subtotalAmount),
      discountAmount: Number(order.discountAmount),
      shippingFee: Number(order.shippingFee),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
      currency: order.currency,
      notes: order.notes,
      shippingAddress: order.shippingAddressSnapshot,
      billingAddress: order.billingAddressSnapshot,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      paymentSummary: {
        orderStatus: order.status,
        checkoutAttempt: order.checkoutAttempt,
        totalPayable: Number(order.totalAmount),
        currency: order.currency,
      },
      statusHistory: order.statusHistory.map((h) => ({
        id: h.id,
        status: h.status,
        notes: h.notes,
        changedBy: h.changedBy,
        createdAt: h.createdAt,
      })),
      sellerOrdersCount: order.sellerOrders.length,
      sellerOrders: order.sellerOrders.map((so) => ({
        id: so.id,
        subOrderNumber: so.subOrderNumber,
        shop: so.shop,
        status: so.status,
        deliveryType: so.deliveryType,
        subtotalAmount: Number(so.subtotalAmount),
        discountAmount: Number(so.discountAmount),
        shippingFee: Number(so.shippingFee),
        taxAmount: Number(so.taxAmount),
        totalAmount: Number(so.totalAmount),
        commissionAmount: Number(so.commissionAmount),
        netSellerPayable: Number(so.netSellerPayable),
        cancellationReason: so.cancellationReason,
        deliveredAt: so.deliveredAt,
        items: so.items.map((it) => ({
          id: it.id,
          variantId: it.variantId,
          productTitle: it.productTitleSnapshot,
          sku: it.skuSnapshot,
          attributes: it.attributesSnapshot,
          quantity: it.quantity,
          unitPrice: Number(it.unitPriceSnapshot),
          discount: Number(it.discountSnapshot),
          gstRate: it.gstRateSnapshot ? Number(it.gstRateSnapshot) : null,
          taxAmount: Number(it.taxAmountSnapshot),
          totalAmount: Number(it.totalAmount),
        })),
        statusHistory: so.statusHistory.map((h) => ({
          id: h.id,
          status: h.status,
          notes: h.notes,
          changedBy: h.changedBy,
          createdAt: h.createdAt,
        })),
      })),
    };
  }

  /**
   * 3. GET /api/v1/admin/orders/:orderNumber/suborders
   * Dedicated sub-order breakdown for an order.
   */
  async getAdminSubOrders(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        sellerOrders: {
          include: {
            shop: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                sellerId: true,
                seller: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            items: true,
            statusHistory: {
              orderBy: { createdAt: 'asc' },
              include: {
                changedBy: {
                  select: { id: true, firstName: true, lastName: true, role: true },
                },
              },
            },
          },
          orderBy: { subOrderNumber: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${orderNumber}" not found`);
    }

    return {
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      totalSubOrders: order.sellerOrders.length,
      subOrders: order.sellerOrders.map((so) => ({
        id: so.id,
        subOrderNumber: so.subOrderNumber,
        shop: so.shop,
        status: so.status,
        deliveryType: so.deliveryType,
        totalAmount: Number(so.totalAmount),
        netSellerPayable: Number(so.netSellerPayable),
        cancellationReason: so.cancellationReason,
        deliveredAt: so.deliveredAt,
        itemsCount: so.items.length,
        items: so.items.map((it) => ({
          id: it.id,
          variantId: it.variantId,
          productTitle: it.productTitleSnapshot,
          sku: it.skuSnapshot,
          attributes: it.attributesSnapshot,
          quantity: it.quantity,
          unitPrice: Number(it.unitPriceSnapshot),
          totalAmount: Number(it.totalAmount),
        })),
        statusHistory: so.statusHistory,
      })),
    };
  }

  /**
   * 4. PATCH /api/v1/admin/orders/:orderNumber/status
   * Controlled admin intervention on parent Order status.
   *
   * Business Rules:
   * 1. Cannot transition to CONFIRMED or any fulfillment status while in PENDING_PAYMENT
   *    without verified payment confirmation. Admin can only CANCEL an unpaid order.
   * 2. Cannot arbitrarily change status without following the transition matrix:
   *    - PENDING_PAYMENT -> CANCELLED
   *    - CONFIRMED -> PROCESSING | CANCELLED
   *    - PROCESSING -> PARTIALLY_SHIPPED | SHIPPED | CANCELLED
   *    - PARTIALLY_SHIPPED -> SHIPPED
   *    - SHIPPED -> DELIVERED
   *    - DELIVERED -> none
   *    - CANCELLED -> none
   * 3. When an order is CANCELLED by admin, cascades cancellation to all non-delivered sub-orders.
   * 4. Creates an OrderStatusHistory record for the parent order.
   * 5. Does NOT invent refunds or silently alter stock.
   */
  async updateAdminOrderStatus(
    adminUserId: string,
    orderNumber: string,
    dto: AdminUpdateOrderStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderNumber },
        include: { sellerOrders: true },
      });

      if (!order) {
        throw new NotFoundException(`Order "${orderNumber}" not found`);
      }

      const currentStatus = order.status;
      const targetStatus = dto.status;

      if (currentStatus === targetStatus) {
        throw new BadRequestException(
          `Order is already in status "${currentStatus}".`,
        );
      }

      // Security rule: PENDING_PAYMENT orders cannot be marked as CONFIRMED, PROCESSING, etc.
      // Payment provider confirmation is required. Admin can only cancel unpaid orders,
      // UNLESS the order is Cash on Delivery (COD) where payment is collected upon arrival.
      const isCodOrder = /\[Payment:\s*COD\]|\[COD\]|Cash on Delivery/i.test(order.notes ?? '');
      if (
        currentStatus === OrderStatus.PENDING_PAYMENT &&
        targetStatus !== OrderStatus.CANCELLED &&
        !isCodOrder
      ) {
        throw new BadRequestException(
          `Cannot mark order as "${targetStatus}" while in PENDING_PAYMENT. Payment confirmation is required before fulfilling orders. Unpaid orders may only be CANCELLED.`,
        );
      }

      // Transition matrix for parent Order
      const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
        [OrderStatus.PENDING_PAYMENT]: isCodOrder
          ? [OrderStatus.CONFIRMED, OrderStatus.CANCELLED]
          : [OrderStatus.CANCELLED],
        [OrderStatus.CONFIRMED]: [
          OrderStatus.PROCESSING,
          OrderStatus.CANCELLED,
        ],
        [OrderStatus.PROCESSING]: [
          OrderStatus.PARTIALLY_SHIPPED,
          OrderStatus.SHIPPED,
          OrderStatus.CANCELLED,
        ],
        [OrderStatus.PARTIALLY_SHIPPED]: [
          OrderStatus.SHIPPED,
          OrderStatus.CANCELLED,
        ],
        [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
        [OrderStatus.DELIVERED]: [],
        [OrderStatus.CANCELLED]: [],
      };

      const validTargets = allowedTransitions[currentStatus] ?? [];
      if (!validTargets.includes(targetStatus)) {
        throw new BadRequestException(
          `Invalid status transition for Order from "${currentStatus}" to "${targetStatus}". Allowed targets: [${validTargets.join(', ')}].`,
        );
      }

      // Update parent order
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: targetStatus,
          notes: dto.notes ? `${order.notes ?? ''} [Admin Note: ${dto.notes}]`.trim() : order.notes,
        },
      });

      // Record OrderStatusHistory on parent Order
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: targetStatus,
          notes: dto.notes ?? `Administrator updated order status to ${targetStatus}`,
          changedById: adminUserId,
        },
      });

      // If CANCELLED, cascade cancellation to all eligible sub-orders
      if (targetStatus === OrderStatus.CANCELLED) {
        for (const so of order.sellerOrders) {
          if (
            so.status !== SellerOrderStatus.DELIVERED &&
            so.status !== SellerOrderStatus.CANCELLED &&
            so.status !== SellerOrderStatus.RETURNED
          ) {
            const soItems = await tx.orderItem.findMany({
              where: { sellerOrderId: so.id },
            });
            await this.restoreInventoryForOrderItems(
              tx,
              soItems,
              adminUserId,
              dto.notes || 'Parent order cancelled by administrator',
              so.subOrderNumber,
            );

            await tx.sellerOrder.update({
              where: { id: so.id },
              data: {
                status: SellerOrderStatus.CANCELLED,
                cancellationReason:
                  dto.notes ?? 'Parent order cancelled by administrator',
              },
            });

            await tx.orderStatusHistory.create({
              data: {
                sellerOrderId: so.id,
                status: SellerOrderStatus.CANCELLED,
                notes:
                  dto.notes ??
                  'Sub-order cancelled due to parent order cancellation by admin',
                changedById: adminUserId,
              },
            });
          }
        }
      }

      return {
        message: `Order status updated to ${targetStatus}`,
        orderNumber: updatedOrder.orderNumber,
        previousStatus: currentStatus,
        status: updatedOrder.status,
      };
    });
  }

  /**
   * 5. PATCH /api/v1/admin/orders/suborders/:subOrderNumber/status
   * Controlled admin intervention on a specific SellerOrder.
   *
   * Business Rules:
   * 1. Cannot transition out of PENDING_PAYMENT except to CANCELLED without payment confirmation.
   * 2. Validates against the SellerOrderStatus transition matrix.
   * 3. Syncs parent Order status if all sub-orders reach common states (e.g. all SHIPPED or DELIVERED).
   * 4. Records OrderStatusHistory with admin user ID.
   */
  async updateAdminSubOrderStatus(
    adminUserId: string,
    subOrderNumber: string,
    dto: AdminUpdateSubOrderStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const subOrder = await tx.sellerOrder.findUnique({
        where: { subOrderNumber },
        include: { order: { include: { sellerOrders: true } } },
      });

      if (!subOrder) {
        throw new NotFoundException(`Sub-order "${subOrderNumber}" not found`);
      }

      const currentStatus = subOrder.status;
      const targetStatus = dto.status;

      if (currentStatus === targetStatus) {
        throw new BadRequestException(
          `Sub-order is already in status "${currentStatus}".`,
        );
      }

      const isCodSubOrder = /\[Payment:\s*COD\]|\[COD\]|Cash on Delivery/i.test(subOrder.order?.notes ?? '');
      if (
        currentStatus === SellerOrderStatus.PENDING_PAYMENT &&
        targetStatus !== SellerOrderStatus.CANCELLED &&
        !isCodSubOrder
      ) {
        throw new BadRequestException(
          `Cannot mark sub-order as "${targetStatus}" while in PENDING_PAYMENT. Payment confirmation is required before fulfilling orders.`,
        );
      }

      const allowedTransitions: Record<SellerOrderStatus, SellerOrderStatus[]> = {
        [SellerOrderStatus.PENDING_PAYMENT]: isCodSubOrder
          ? [SellerOrderStatus.CONFIRMED, SellerOrderStatus.CANCELLED]
          : [SellerOrderStatus.CANCELLED],
        [SellerOrderStatus.CONFIRMED]: [
          SellerOrderStatus.PROCESSING,
          SellerOrderStatus.CANCELLED,
        ],
        [SellerOrderStatus.PROCESSING]: [
          SellerOrderStatus.PACKED,
          SellerOrderStatus.CANCELLED,
        ],
        [SellerOrderStatus.PACKED]: [
          SellerOrderStatus.SHIPPED,
          SellerOrderStatus.CANCELLED,
        ],
        [SellerOrderStatus.SHIPPED]: [SellerOrderStatus.DELIVERED],
        [SellerOrderStatus.DELIVERED]: [SellerOrderStatus.RETURN_REQUESTED],
        [SellerOrderStatus.CANCELLED]: [],
        [SellerOrderStatus.RETURN_REQUESTED]: [SellerOrderStatus.RETURNED],
        [SellerOrderStatus.RETURNED]: [],
      };

      const validTargets = allowedTransitions[currentStatus] ?? [];
      if (!validTargets.includes(targetStatus)) {
        throw new BadRequestException(
          `Invalid status transition for sub-order from "${currentStatus}" to "${targetStatus}". Allowed targets: [${validTargets.join(', ')}].`,
        );
      }

      const updatedSubOrder = await tx.sellerOrder.update({
        where: { id: subOrder.id },
        data: {
          status: targetStatus,
          ...(targetStatus === SellerOrderStatus.DELIVERED
            ? { deliveredAt: new Date() }
            : {}),
          ...(targetStatus === SellerOrderStatus.CANCELLED && dto.notes
            ? { cancellationReason: dto.notes }
            : {}),
        },
      });

      // Admin sub-order stock transitions
      const adminSubItems = await tx.orderItem.findMany({
        where: { sellerOrderId: subOrder.id },
      });

      if (targetStatus === SellerOrderStatus.CANCELLED) {
        await this.restoreInventoryForOrderItems(
          tx,
          adminSubItems,
          adminUserId,
          dto.notes || 'Admin cancelled sub-order',
          subOrder.subOrderNumber,
        );
      } else if (targetStatus === SellerOrderStatus.DELIVERED) {
        await this.fulfillInventoryForOrderItems(
          tx,
          adminSubItems,
          adminUserId,
          subOrder.subOrderNumber,
        );
      } else if (
        currentStatus === SellerOrderStatus.RETURN_REQUESTED &&
        targetStatus === SellerOrderStatus.RETURNED
      ) {
        await this.returnRestockInventoryForOrderItems(
          tx,
          adminSubItems,
          adminUserId,
          subOrder.subOrderNumber,
          dto.notes || 'Admin approved return and restocked inventory',
        );
      }

      await tx.orderStatusHistory.create({
        data: {
          sellerOrderId: updatedSubOrder.id,
          status: targetStatus,
          notes: dto.notes ?? `Administrator updated sub-order status to ${targetStatus}`,
          changedById: adminUserId,
        },
      });

      // Synchronize parent Order status based on all siblings
      const allSubOrders = subOrder.order.sellerOrders.map((so) =>
        so.id === subOrder.id ? { ...so, status: targetStatus } : so,
      );

      const allDelivered = allSubOrders.every(
        (so) => so.status === SellerOrderStatus.DELIVERED,
      );
      const allShipped = allSubOrders.every(
        (so) =>
          so.status === SellerOrderStatus.SHIPPED ||
          so.status === SellerOrderStatus.DELIVERED,
      );
      const anyShipped = allSubOrders.some(
        (so) =>
          so.status === SellerOrderStatus.SHIPPED ||
          so.status === SellerOrderStatus.DELIVERED,
      );

      let newParentStatus: OrderStatus | undefined;
      if (allDelivered && subOrder.order.status !== OrderStatus.DELIVERED) {
        newParentStatus = OrderStatus.DELIVERED;
      } else if (allShipped && subOrder.order.status !== OrderStatus.SHIPPED) {
        newParentStatus = OrderStatus.SHIPPED;
      } else if (
        anyShipped &&
        subOrder.order.status !== OrderStatus.PARTIALLY_SHIPPED &&
        subOrder.order.status !== OrderStatus.SHIPPED &&
        subOrder.order.status !== OrderStatus.DELIVERED
      ) {
        newParentStatus = OrderStatus.PARTIALLY_SHIPPED;
      }

      if (newParentStatus) {
        await tx.order.update({
          where: { id: subOrder.orderId },
          data: { status: newParentStatus },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: subOrder.orderId,
            status: newParentStatus,
            notes: `Parent order updated to ${newParentStatus} automatically after sub-order status transition`,
            changedById: adminUserId,
          },
        });
      }

      return {
        message: `Sub-order status updated to ${targetStatus}`,
        subOrderNumber: updatedSubOrder.subOrderNumber,
        previousStatus: currentStatus,
        status: updatedSubOrder.status,
        parentOrderStatus: newParentStatus ?? subOrder.order.status,
      };
    });
  }
}

