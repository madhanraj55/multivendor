import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProductStatus,
  SellerOrderStatus,
  ShopStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuerySellerProductsDto } from './dto/seller-dashboard.dto.js';

@Injectable()
export class SellerDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Resolves the seller's shop profile from the authenticated user ID.
   * Throws NotFoundException if no shop exists.
   */
  async getSellerShopOrThrow(userId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { sellerId: userId },
    });

    if (!shop) {
      throw new NotFoundException(
        'No shop application found for this seller account. Please submit a shop application first.',
      );
    }

    return shop;
  }

  /**
   * 1. GET /api/v1/seller/dashboard/summary
   * Returns:
   * - Shop status & approval info
   * - Product metrics: total, published, draft, inactive, archived, low-stock variants
   * - Order metrics: counts by SellerOrderStatus
   * - Completed sales totals (CONFIRMED, PROCESSING, PACKED, SHIPPED, DELIVERED)
   *   Strictly excludes PENDING_PAYMENT and CANCELLED orders from completed sales calculations.
   */
  async getDashboardSummary(userId: string) {
    const shop = await this.getSellerShopOrThrow(userId);

    // 1. Product & Variant aggregation
    const [
      totalProducts,
      publishedProducts,
      draftProducts,
      inactiveProducts,
      archivedProducts,
      sellerVariants,
    ] = await Promise.all([
      this.prisma.product.count({ where: { shopId: shop.id } }),
      this.prisma.product.count({
        where: { shopId: shop.id, status: ProductStatus.PUBLISHED },
      }),
      this.prisma.product.count({
        where: { shopId: shop.id, status: ProductStatus.DRAFT },
      }),
      this.prisma.product.count({
        where: { shopId: shop.id, status: ProductStatus.INACTIVE },
      }),
      this.prisma.product.count({
        where: { shopId: shop.id, status: ProductStatus.ARCHIVED },
      }),
      this.prisma.productVariant.findMany({
        where: { product: { shopId: shop.id } },
        select: {
          id: true,
          inventory: {
            select: {
              availableQuantity: true,
              lowStockThreshold: true,
            },
          },
        },
      }),
    ]);

    // Calculate low-stock variants using each variant's schema threshold (default 5)
    let lowStockVariantCount = 0;
    for (const v of sellerVariants) {
      if (v.inventory) {
        if (v.inventory.availableQuantity <= v.inventory.lowStockThreshold) {
          lowStockVariantCount++;
        }
      }
    }

    // 2. Order counts grouped by SellerOrderStatus
    const subOrdersGrouped = await this.prisma.sellerOrder.groupBy({
      by: ['status'],
      where: { shopId: shop.id },
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    const orderStatusCounts: Record<string, number> = {
      [SellerOrderStatus.PENDING_PAYMENT]: 0,
      [SellerOrderStatus.CONFIRMED]: 0,
      [SellerOrderStatus.PROCESSING]: 0,
      [SellerOrderStatus.PACKED]: 0,
      [SellerOrderStatus.SHIPPED]: 0,
      [SellerOrderStatus.DELIVERED]: 0,
      [SellerOrderStatus.CANCELLED]: 0,
      [SellerOrderStatus.RETURN_REQUESTED]: 0,
      [SellerOrderStatus.RETURNED]: 0,
    };

    let totalSubOrders = 0;
    let fulfilledOrdersCount = 0;
    let completedGrossOrderValue = 0;

    for (const group of subOrdersGrouped) {
      orderStatusCounts[group.status] = group._count.id;
      totalSubOrders += group._count.id;

      // Strict Rule: Do not count unpaid or cancelled orders in sales/revenue metrics
      if (
        group.status !== SellerOrderStatus.PENDING_PAYMENT &&
        group.status !== SellerOrderStatus.CANCELLED
      ) {
        completedGrossOrderValue += Number(group._sum.totalAmount ?? 0);
      }

      if (group.status === SellerOrderStatus.DELIVERED) {
        fulfilledOrdersCount += group._count.id;
      }
    }

    // 3. Orders in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCompletedOrders = await this.prisma.sellerOrder.aggregate({
      where: {
        shopId: shop.id,
        createdAt: { gte: thirtyDaysAgo },
        status: {
          notIn: [SellerOrderStatus.PENDING_PAYMENT, SellerOrderStatus.CANCELLED],
        },
      },
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    return {
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        status: shop.status,
        rejectionReason: shop.rejectionReason,
        isApproved: shop.status === ShopStatus.APPROVED,
        isSuspended: shop.status === ShopStatus.SUSPENDED,
      },
      catalogOverview: {
        totalProducts,
        publishedProducts,
        draftProducts,
        inactiveProducts,
        archivedProducts,
        totalVariants: sellerVariants.length,
        lowStockVariants: lowStockVariantCount,
      },
      ordersOverview: {
        totalSubOrders,
        fulfilledOrders: fulfilledOrdersCount,
        byStatus: orderStatusCounts,
      },
      salesOverview: {
        note: 'Completed orders exclude PENDING_PAYMENT and CANCELLED. Reflects gross order value for seller items before deductions.',
        allTimeCompletedOrdersCount:
          totalSubOrders -
          orderStatusCounts[SellerOrderStatus.PENDING_PAYMENT] -
          orderStatusCounts[SellerOrderStatus.CANCELLED],
        allTimeGrossOrderValue: Number(completedGrossOrderValue.toFixed(2)),
        last30DaysCompletedOrdersCount: recentCompletedOrders._count.id,
        last30DaysGrossOrderValue: Number(
          Number(recentCompletedOrders._sum.totalAmount ?? 0).toFixed(2),
        ),
      },
    };
  }

  /**
   * 2. GET /api/v1/seller/dashboard/products
   * Paginated view of the seller's own products and variants with stock information.
   * Supports filtering by status, search, and low-stock variants using the schema threshold.
   */
  async getSellerProducts(userId: string, query: QuerySellerProductsDto) {
    const shop = await this.getSellerShopOrThrow(userId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      shopId: shop.id,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // If filtering by lowStockOnly, we select products that have at least one variant with low stock
    if (query.lowStockOnly) {
      where.variants = {
        some: {
          inventory: {
            availableQuantity: {
              lte: 5, // Reliable schema default threshold
            },
          },
        },
      };
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          variants: {
            include: {
              inventory: {
                select: {
                  id: true,
                  availableQuantity: true,
                  reservedQuantity: true,
                  lowStockThreshold: true,
                  updatedAt: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    const formattedProducts = products.map((product) => {
      let isProductLowStock = false;
      const formattedVariants = product.variants.map((variant) => {
        const available = variant.inventory?.availableQuantity ?? 0;
        const threshold = variant.inventory?.lowStockThreshold ?? 5;
        const isLowStock = available <= threshold;
        if (isLowStock) isProductLowStock = true;

        return {
          id: variant.id,
          sku: variant.sku,
          title: variant.title,
          price: Number(variant.price),
          mrp: Number(variant.mrp),
          isActive: variant.isActive,
          attributes: variant.attributes,
          weightGrams: variant.weightGrams,
          inventory: variant.inventory
            ? {
                availableQuantity: variant.inventory.availableQuantity,
                reservedQuantity: variant.inventory.reservedQuantity,
                lowStockThreshold: variant.inventory.lowStockThreshold,
                isLowStock,
              }
            : null,
        };
      });

      return {
        id: product.id,
        title: product.title,
        slug: product.slug,
        status: product.status,
        brand: product.brand,
        category: product.category,
        images: product.images,
        isLowStock: isProductLowStock,
        variantsCount: product.variants.length,
        variants: formattedVariants,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    });

    return {
      data: formattedProducts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 3. GET /api/v1/seller/dashboard/inventory/movements
   * Returns recent inventory movement history for the seller's variants.
   */
  async getRecentInventoryMovements(userId: string, limitCount: number = 20) {
    const shop = await this.getSellerShopOrThrow(userId);
    const take = Math.max(1, Math.min(100, Number(limitCount) || 20));

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        inventory: {
          variant: {
            product: {
              shopId: shop.id,
            },
          },
        },
      },
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        inventory: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                title: true,
                product: {
                  select: { id: true, title: true, slug: true },
                },
              },
            },
          },
        },
      },
    });

    return movements.map((m) => ({
      id: m.id,
      movementType: m.movementType,
      quantity: m.quantity,
      balanceAfter: m.balanceAfter,
      notes: m.notes,
      referenceId: m.referenceId,
      createdAt: m.createdAt,
      variant: {
        id: m.inventory.variant.id,
        sku: m.inventory.variant.sku,
        title: m.inventory.variant.title,
        productTitle: m.inventory.variant.product.title,
      },
    }));
  }
}
