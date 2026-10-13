import { NotFoundException } from '@nestjs/common';
import {
  ProductStatus,
  SellerOrderStatus,
  ShopStatus,
} from '../generated/prisma/client.js';
import { SellerDashboardService } from './seller-dashboard.service.js';

describe('SellerDashboardService (Unit Tests)', () => {
  let service: SellerDashboardService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      shop: {
        findUnique: jest.fn(),
      },
      product: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      productVariant: {
        findMany: jest.fn(),
      },
      sellerOrder: {
        groupBy: jest.fn(),
        aggregate: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
      },
    };

    service = new SellerDashboardService(mockPrisma as any);
  });

  // ===========================================================================
  // 1. DASHBOARD SUMMARY TESTS
  // ===========================================================================
  describe('getDashboardSummary', () => {
    it('should throw NotFoundException if seller has no shop application', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce(null);

      await expect(service.getDashboardSummary('seller-no-shop')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return complete summary and strictly exclude unpaid and cancelled orders from completed sales', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        sellerId: 'seller-1',
        name: 'Organic Harvest',
        slug: 'organic-harvest',
        status: ShopStatus.APPROVED,
        rejectionReason: null,
      });

      // Product counts: total, published, draft, inactive, archived
      mockPrisma.product.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(7)  // published
        .mockResolvedValueOnce(1)  // draft
        .mockResolvedValueOnce(1)  // inactive
        .mockResolvedValueOnce(1); // archived

      // Variants with inventory thresholds
      mockPrisma.productVariant.findMany.mockResolvedValueOnce([
        {
          id: 'v1',
          inventory: { availableQuantity: 10, lowStockThreshold: 5 }, // healthy
        },
        {
          id: 'v2',
          inventory: { availableQuantity: 3, lowStockThreshold: 5 }, // low stock
        },
        {
          id: 'v3',
          inventory: { availableQuantity: 0, lowStockThreshold: 5 }, // out of stock / low stock
        },
      ]);

      // Suborders grouped by status
      mockPrisma.sellerOrder.groupBy.mockResolvedValueOnce([
        { status: SellerOrderStatus.PENDING_PAYMENT, _count: { id: 3 }, _sum: { totalAmount: 1500 } },
        { status: SellerOrderStatus.CONFIRMED, _count: { id: 2 }, _sum: { totalAmount: 1000 } },
        { status: SellerOrderStatus.DELIVERED, _count: { id: 5 }, _sum: { totalAmount: 2500 } },
        { status: SellerOrderStatus.CANCELLED, _count: { id: 1 }, _sum: { totalAmount: 500 } },
      ]);

      // Recent 30 days aggregate
      mockPrisma.sellerOrder.aggregate.mockResolvedValueOnce({
        _count: { id: 4 },
        _sum: { totalAmount: 2000 },
      });

      const summary = await service.getDashboardSummary('seller-1');

      // 1. Shop details
      expect(summary.shop).toEqual({
        id: 'shop-1',
        name: 'Organic Harvest',
        slug: 'organic-harvest',
        status: ShopStatus.APPROVED,
        rejectionReason: null,
        isApproved: true,
        isSuspended: false,
      });

      // 2. Catalog & Low stock metrics
      expect(summary.catalogOverview).toEqual({
        totalProducts: 10,
        publishedProducts: 7,
        draftProducts: 1,
        inactiveProducts: 1,
        archivedProducts: 1,
        totalVariants: 3,
        lowStockVariants: 2, // v2 (3 <= 5) and v3 (0 <= 5)
      });

      // 3. Order counts
      expect(summary.ordersOverview.totalSubOrders).toBe(11); // 3 + 2 + 5 + 1
      expect(summary.ordersOverview.fulfilledOrders).toBe(5);
      expect(summary.ordersOverview.byStatus[SellerOrderStatus.PENDING_PAYMENT]).toBe(3);
      expect(summary.ordersOverview.byStatus[SellerOrderStatus.DELIVERED]).toBe(5);

      // 4. Completed Gross Order Value (strictly excludes PENDING_PAYMENT ₹1500 and CANCELLED ₹500)
      // Confirmed (1000) + Delivered (2500) = 3500
      expect(summary.salesOverview.allTimeGrossOrderValue).toBe(3500);
      expect(summary.salesOverview.allTimeCompletedOrdersCount).toBe(7); // 11 - 3 - 1
      expect(summary.salesOverview.last30DaysGrossOrderValue).toBe(2000);
    });

    it('should handle empty shop with zero products and orders gracefully', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-empty',
        sellerId: 'seller-empty',
        name: 'Empty Shop',
        slug: 'empty-shop',
        status: ShopStatus.PENDING_APPROVAL,
        rejectionReason: null,
      });

      mockPrisma.product.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      mockPrisma.productVariant.findMany.mockResolvedValueOnce([]);
      mockPrisma.sellerOrder.groupBy.mockResolvedValueOnce([]);
      mockPrisma.sellerOrder.aggregate.mockResolvedValueOnce({
        _count: { id: 0 },
        _sum: { totalAmount: null },
      });

      const summary = await service.getDashboardSummary('seller-empty');

      expect(summary.shop.isApproved).toBe(false);
      expect(summary.catalogOverview.totalProducts).toBe(0);
      expect(summary.catalogOverview.lowStockVariants).toBe(0);
      expect(summary.ordersOverview.totalSubOrders).toBe(0);
      expect(summary.salesOverview.allTimeGrossOrderValue).toBe(0);
    });
  });

  // ===========================================================================
  // 2. PRODUCT & INVENTORY OVERVIEW TESTS
  // ===========================================================================
  describe('getSellerProducts', () => {
    it('should return paginated products scoped exclusively to seller shop', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        sellerId: 'seller-1',
      });

      mockPrisma.product.count.mockResolvedValueOnce(1);
      mockPrisma.product.findMany.mockResolvedValueOnce([
        {
          id: 'prod-1',
          title: 'Handmade Silk Saree',
          slug: 'handmade-silk-saree',
          status: ProductStatus.PUBLISHED,
          brand: 'Heritage Weaves',
          category: { id: 'cat-1', name: 'Apparel', slug: 'apparel' },
          images: [{ id: 'img-1', url: 'https://example.com/saree.jpg' }],
          variants: [
            {
              id: 'var-1',
              sku: 'SR-RED-01',
              title: 'Crimson Red',
              price: 2499,
              mrp: 3999,
              isActive: true,
              attributes: { color: 'Red' },
              weightGrams: 500,
              inventory: {
                availableQuantity: 2,
                reservedQuantity: 1,
                lowStockThreshold: 5,
              },
            },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.getSellerProducts('seller-1', {
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.product.count).toHaveBeenCalledWith({
        where: { shopId: 'shop-1' },
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isLowStock).toBe(true); // 2 <= 5
      expect(result.data[0].variants[0].inventory?.isLowStock).toBe(true);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter by low-stock threshold when lowStockOnly is true', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        sellerId: 'seller-1',
      });

      mockPrisma.product.count.mockResolvedValueOnce(0);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);

      await service.getSellerProducts('seller-1', {
        page: 1,
        limit: 10,
        lowStockOnly: true,
      });

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            shopId: 'shop-1',
            variants: {
              some: {
                inventory: {
                  availableQuantity: { lte: 5 },
                },
              },
            },
          },
        }),
      );
    });
  });

  // ===========================================================================
  // 3. INVENTORY MOVEMENTS AUDIT TESTS
  // ===========================================================================
  describe('getRecentInventoryMovements', () => {
    it('should return recent inventory movement history for the seller', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        sellerId: 'seller-1',
      });

      mockPrisma.inventoryMovement.findMany.mockResolvedValueOnce([
        {
          id: 'mov-1',
          movementType: 'RESTOCK',
          quantity: 25,
          balanceAfter: 35,
          notes: 'Restocked by supplier',
          referenceId: 'PO-999',
          createdAt: new Date(),
          inventory: {
            variant: {
              id: 'var-1',
              sku: 'SKU-001',
              title: 'Variant 1',
              product: { id: 'prod-1', title: 'Product 1', slug: 'product-1' },
            },
          },
        },
      ]);

      const movements = await service.getRecentInventoryMovements('seller-1', 10);

      expect(mockPrisma.inventoryMovement.findMany).toHaveBeenCalledWith({
        where: {
          inventory: {
            variant: {
              product: {
                shopId: 'shop-1',
              },
            },
          },
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });

      expect(movements).toHaveLength(1);
      expect(movements[0].movementType).toBe('RESTOCK');
      expect(movements[0].variant.sku).toBe('SKU-001');
    });
  });
});
