import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, SellerOrderStatus } from '../generated/prisma/client.js';
import { OrdersService } from './orders.service.js';

describe('OrdersService (Unit Tests)', () => {
  let service: OrdersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      order: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      sellerOrder: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      shop: {
        findUnique: jest.fn(),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (cb: any) => await cb(mockPrisma)),
    };

    service = new OrdersService(mockPrisma as any);
  });

  // ===========================================================================
  // TASK A: CUSTOMER ORDER TESTS
  // ===========================================================================
  describe('Customer Orders (my-orders)', () => {
    it('should return paginated orders scoped strictly to authenticated customer', async () => {
      mockPrisma.order.count.mockResolvedValueOnce(2);
      mockPrisma.order.findMany.mockResolvedValueOnce([
        {
          id: 'ord-1',
          orderNumber: 'ORD-20261013-111111',
          status: OrderStatus.PENDING_PAYMENT,
          subtotalAmount: 500,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          totalAmount: 500,
          currency: 'INR',
          createdAt: new Date(),
          sellerOrders: [
            {
              id: 'so-1',
              subOrderNumber: 'ORD-20261013-111111-S1',
              status: SellerOrderStatus.PENDING_PAYMENT,
              totalAmount: 500,
              deliveryType: 'SELLER_MANAGED',
              shop: { id: 'shop-1', name: 'Alpha Shop', slug: 'alpha-shop' },
              _count: { items: 2 },
            },
          ],
        },
      ]);

      const result = await service.getCustomerOrders('user-cust-1', { page: 1, limit: 10 });
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'user-cust-1' },
          skip: 0,
          take: 10,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(2);
      expect(result.data[0].orderNumber).toBe('ORD-20261013-111111');
      expect(result.data[0].sellerOrders[0].shopName).toBe('Alpha Shop');
    });

    it('should throw NotFoundException if order does not exist', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getCustomerOrderByNumber('user-cust-1', 'ORD-NON-EXISTENT'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if order belongs to a different customer', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        id: 'ord-2',
        orderNumber: 'ORD-20261013-222222',
        customerId: 'different-customer-id',
      });

      await expect(
        service.getCustomerOrderByNumber('user-cust-1', 'ORD-20261013-222222'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return full order detail including multi-shop seller sub-orders for the owner', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce({
        id: 'ord-3',
        orderNumber: 'ORD-20261013-333333',
        customerId: 'user-cust-1',
        status: OrderStatus.PENDING_PAYMENT,
        subtotalAmount: 1000,
        discountAmount: 0,
        shippingFee: 0,
        taxAmount: 0,
        totalAmount: 1000,
        currency: 'INR',
        shippingAddressSnapshot: { city: 'Bengaluru' },
        billingAddressSnapshot: { city: 'Bengaluru' },
        sellerOrders: [
          {
            id: 'so-3-1',
            subOrderNumber: 'ORD-20261013-333333-S1',
            status: SellerOrderStatus.PENDING_PAYMENT,
            subtotalAmount: 600,
            shippingFee: 0,
            taxAmount: 0,
            totalAmount: 600,
            deliveryType: 'SELLER_MANAGED',
            shop: { id: 'shop-1', name: 'Alpha Shop', slug: 'alpha' },
            items: [
              {
                id: 'it-1',
                variantId: 'var-1',
                productTitleSnapshot: 'Alpha Item',
                skuSnapshot: 'A1',
                attributesSnapshot: {},
                quantity: 1,
                unitPriceSnapshot: 600,
                discountSnapshot: 0,
                gstRateSnapshot: 18,
                taxAmountSnapshot: 0,
                totalAmount: 600,
              },
            ],
            statusHistory: [],
          },
          {
            id: 'so-3-2',
            subOrderNumber: 'ORD-20261013-333333-S2',
            status: SellerOrderStatus.PENDING_PAYMENT,
            subtotalAmount: 400,
            shippingFee: 0,
            taxAmount: 0,
            totalAmount: 400,
            deliveryType: 'SELLER_MANAGED',
            shop: { id: 'shop-2', name: 'Beta Shop', slug: 'beta' },
            items: [
              {
                id: 'it-2',
                variantId: 'var-2',
                productTitleSnapshot: 'Beta Item',
                skuSnapshot: 'B1',
                attributesSnapshot: {},
                quantity: 1,
                unitPriceSnapshot: 400,
                discountSnapshot: 0,
                gstRateSnapshot: null,
                taxAmountSnapshot: 0,
                totalAmount: 400,
              },
            ],
            statusHistory: [],
          },
        ],
        statusHistory: [],
      });

      const order = await service.getCustomerOrderByNumber('user-cust-1', 'ORD-20261013-333333');
      expect(order.orderNumber).toBe('ORD-20261013-333333');
      expect(order.sellerOrders).toHaveLength(2);
      expect(order.sellerOrders[0].shop.name).toBe('Alpha Shop');
      expect(order.sellerOrders[1].shop.name).toBe('Beta Shop');
    });
  });

  // ===========================================================================
  // TASK B: SELLER ORDER TESTS
  // ===========================================================================
  describe('Seller Orders (seller/orders)', () => {
    it('should throw ForbiddenException if user has no registered shop profile', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getSellerOrders('seller-without-shop', { page: 1, limit: 10 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return seller orders filtered by shop and optional status', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-seller-1',
        name: 'Seller One Shop',
      });
      mockPrisma.sellerOrder.count.mockResolvedValueOnce(1);
      mockPrisma.sellerOrder.findMany.mockResolvedValueOnce([
        {
          id: 'so-10',
          subOrderNumber: 'ORD-100-S1',
          status: SellerOrderStatus.PENDING_PAYMENT,
          subtotalAmount: 300,
          totalAmount: 300,
          netSellerPayable: 300,
          deliveryType: 'SELLER_MANAGED',
          order: { orderNumber: 'ORD-100', currency: 'INR', createdAt: new Date() },
          items: [{ id: 'it-1', productTitleSnapshot: 'Item 1', skuSnapshot: 'S1', quantity: 1, totalAmount: 300 }],
        },
      ]);

      const result = await service.getSellerOrders('seller-1', {
        page: 1,
        limit: 10,
        status: SellerOrderStatus.PENDING_PAYMENT,
      });

      expect(mockPrisma.sellerOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopId: 'shop-seller-1', status: SellerOrderStatus.PENDING_PAYMENT },
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.data[0].parentOrderNumber).toBe('ORD-100');
    });

    it('should throw ForbiddenException when accessing a sub-order belonging to another shop', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-seller-1',
        name: 'My Shop',
      });
      mockPrisma.sellerOrder.findUnique.mockResolvedValueOnce({
        id: 'so-other',
        subOrderNumber: 'ORD-OTHER-S1',
        shopId: 'completely-different-shop',
      });

      await expect(
        service.getSellerOrderByNumber('seller-1', 'ORD-OTHER-S1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return full sub-order detail with items, statusHistory and shippingAddress for owner shop', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-seller-1',
        name: 'My Shop',
      });
      mockPrisma.sellerOrder.findUnique.mockResolvedValueOnce({
        id: 'so-my',
        subOrderNumber: 'ORD-MY-S1',
        shopId: 'shop-seller-1',
        status: SellerOrderStatus.CONFIRMED,
        subtotalAmount: 500,
        discountAmount: 0,
        shippingFee: 0,
        taxAmount: 0,
        totalAmount: 500,
        commissionAmount: 0,
        netSellerPayable: 500,
        deliveryType: 'SELLER_MANAGED',
        order: {
          orderNumber: 'ORD-MY',
          currency: 'INR',
          shippingAddressSnapshot: { fullName: 'Recipient Name', city: 'Mumbai' },
        },
        items: [
          {
            id: 'it-my',
            variantId: 'var-1',
            productTitleSnapshot: 'Product Snapshot',
            skuSnapshot: 'SKU-MY',
            attributesSnapshot: {},
            quantity: 1,
            unitPriceSnapshot: 500,
            discountSnapshot: 0,
            gstRateSnapshot: 18,
            taxAmountSnapshot: 0,
            totalAmount: 500,
          },
        ],
        statusHistory: [],
      });

      const result = await service.getSellerOrderByNumber('seller-1', 'ORD-MY-S1');
      expect(result.subOrderNumber).toBe('ORD-MY-S1');
      expect(result.shippingAddress.fullName).toBe('Recipient Name');
      expect(result.items[0].sku).toBe('SKU-MY');
    });

    it('should strictly BLOCK any fulfillment status transition while sub-order is in PENDING_PAYMENT', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-seller-1',
        name: 'My Shop',
      });

      // Sub-order locked with FOR UPDATE
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'so-pending',
          shopId: 'shop-seller-1',
          status: SellerOrderStatus.PENDING_PAYMENT,
          subOrderNumber: 'ORD-PENDING-S1',
        },
      ]);

      await expect(
        service.updateSellerOrderStatus('seller-1', 'ORD-PENDING-S1', {
          status: SellerOrderStatus.CONFIRMED,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.sellerOrder.update).not.toHaveBeenCalled();
      expect(mockPrisma.orderStatusHistory.create).not.toHaveBeenCalled();
    });

    it('should reject invalid transition sequence (e.g. PACKED directly to DELIVERED skipping SHIPPED)', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-seller-1',
        name: 'My Shop',
      });

      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'so-packed',
          shopId: 'shop-seller-1',
          status: SellerOrderStatus.PACKED,
          subOrderNumber: 'ORD-PACKED-S1',
        },
      ]);

      await expect(
        service.updateSellerOrderStatus('seller-1', 'ORD-PACKED-S1', {
          status: SellerOrderStatus.DELIVERED,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.sellerOrder.update).not.toHaveBeenCalled();
    });

    it('should successfully transition status and record OrderStatusHistory when transition is valid', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-seller-1',
        name: 'My Shop',
      });

      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'so-shipped',
          shopId: 'shop-seller-1',
          status: SellerOrderStatus.SHIPPED,
          subOrderNumber: 'ORD-SHIPPED-S1',
        },
      ]);

      mockPrisma.sellerOrder.update.mockResolvedValueOnce({
        id: 'so-shipped',
        subOrderNumber: 'ORD-SHIPPED-S1',
        status: SellerOrderStatus.DELIVERED,
        deliveredAt: new Date(),
      });

      mockPrisma.orderStatusHistory.create.mockResolvedValueOnce({ id: 'hist-deliv-1' });

      const result = await service.updateSellerOrderStatus('seller-1', 'ORD-SHIPPED-S1', {
        status: SellerOrderStatus.DELIVERED,
        notes: 'Delivered to customer front porch',
      });

      expect(result.status).toBe(SellerOrderStatus.DELIVERED);
      expect(result.previousStatus).toBe(SellerOrderStatus.SHIPPED);

      // Verify update in DB
      expect(mockPrisma.sellerOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'so-shipped' },
          data: expect.objectContaining({ status: SellerOrderStatus.DELIVERED }),
        }),
      );

      // Verify OrderStatusHistory record creation
      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sellerOrderId: 'so-shipped',
          status: SellerOrderStatus.DELIVERED,
          notes: 'Delivered to customer front porch',
          changedById: 'seller-1',
        }),
      });
    });
  });

  // ===========================================================================
  // TASK C: ADMIN ORDER TESTS
  // ===========================================================================
  describe('Admin Orders Management', () => {
    describe('getAdminOrders', () => {
      it('should return paginated orders across all customers with filters', async () => {
        mockPrisma.order.count.mockResolvedValueOnce(1);
        mockPrisma.order.findMany.mockResolvedValueOnce([
          {
            id: 'ord-admin-1',
            orderNumber: 'ORD-20261013-ADMIN1',
            status: OrderStatus.CONFIRMED,
            subtotalAmount: 1000,
            discountAmount: 100,
            shippingFee: 50,
            taxAmount: 90,
            totalAmount: 1040,
            currency: 'INR',
            createdAt: new Date('2026-10-13T12:00:00Z'),
            customer: {
              id: 'cust-1',
              firstName: 'Jane',
              lastName: 'Doe',
              email: 'jane@example.com',
              phone: '+919876543210',
            },
            sellerOrders: [
              {
                id: 'so-1',
                subOrderNumber: 'ORD-20261013-ADMIN1-S1',
                status: SellerOrderStatus.CONFIRMED,
                totalAmount: 1040,
                deliveryType: 'SELLER_MANAGED',
                shop: { id: 'shop-1', name: 'Alpha Shop', slug: 'alpha-shop' },
                _count: { items: 2 },
              },
            ],
          },
        ]);

        const result = await service.getAdminOrders({
          page: 1,
          limit: 10,
          status: OrderStatus.CONFIRMED,
          orderNumber: 'ADMIN1',
          startDate: '2026-10-01T00:00:00Z',
          endDate: '2026-10-31T23:59:59Z',
        });

        expect(mockPrisma.order.count).toHaveBeenCalledWith({
          where: expect.objectContaining({
            status: OrderStatus.CONFIRMED,
            orderNumber: { contains: 'ADMIN1', mode: 'insensitive' },
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        });

        expect(result.data).toHaveLength(1);
        expect(result.data[0].customer.email).toBe('jane@example.com');
        expect(result.data[0].totalAmount).toBe(1040);
        expect(result.meta).toEqual({
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        });
      });
    });

    describe('getAdminOrderByNumber', () => {
      it('should return full order details with customer, items, and status history', async () => {
        mockPrisma.order.findUnique.mockResolvedValueOnce({
          id: 'ord-admin-1',
          orderNumber: 'ORD-20261013-ADMIN1',
          status: OrderStatus.CONFIRMED,
          subtotalAmount: 500,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          totalAmount: 500,
          currency: 'INR',
          shippingAddressSnapshot: { city: 'Bengaluru' },
          billingAddressSnapshot: { city: 'Bengaluru' },
          createdAt: new Date(),
          updatedAt: new Date(),
          customer: {
            id: 'cust-1',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
            phone: '+919876543210',
            role: 'CUSTOMER',
            status: 'ACTIVE',
            createdAt: new Date(),
          },
          sellerOrders: [
            {
              id: 'so-1',
              subOrderNumber: 'ORD-20261013-ADMIN1-S1',
              status: SellerOrderStatus.CONFIRMED,
              subtotalAmount: 500,
              discountAmount: 0,
              shippingFee: 0,
              taxAmount: 0,
              totalAmount: 500,
              commissionAmount: 50,
              netSellerPayable: 450,
              deliveryType: 'SELLER_MANAGED',
              shop: {
                id: 'shop-1',
                name: 'Alpha Shop',
                slug: 'alpha-shop',
                status: 'APPROVED',
                sellerId: 'seller-1',
                seller: {
                  id: 'seller-1',
                  firstName: 'Bob',
                  lastName: 'Seller',
                  email: 'bob@example.com',
                  phone: '+919999999999',
                },
              },
              items: [
                {
                  id: 'item-1',
                  variantId: 'var-1',
                  productTitleSnapshot: 'Product A',
                  skuSnapshot: 'SKU-A',
                  attributesSnapshot: { size: 'M' },
                  quantity: 1,
                  unitPriceSnapshot: 500,
                  discountSnapshot: 0,
                  gstRateSnapshot: null,
                  taxAmountSnapshot: 0,
                  totalAmount: 500,
                },
              ],
              statusHistory: [],
            },
          ],
          statusHistory: [
            {
              id: 'hist-1',
              status: 'CONFIRMED',
              notes: 'Order placed',
              changedBy: null,
              createdAt: new Date(),
            },
          ],
          checkoutAttempt: {
            id: 'chk-1',
            status: 'COMPLETED',
            idempotencyKey: 'idemp-1',
            expiresAt: new Date(),
            createdAt: new Date(),
          },
        });

        const result = await service.getAdminOrderByNumber('ORD-20261013-ADMIN1');

        expect(result.orderNumber).toBe('ORD-20261013-ADMIN1');
        expect(result.customer.email).toBe('jane@example.com');
        expect(result.sellerOrders).toHaveLength(1);
        expect(result.sellerOrders[0].items[0].sku).toBe('SKU-A');
        expect(result.paymentSummary.totalPayable).toBe(500);
      });

      it('should throw NotFoundException if order does not exist', async () => {
        mockPrisma.order.findUnique.mockResolvedValueOnce(null);

        await expect(
          service.getAdminOrderByNumber('ORD-NON-EXISTENT'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('getAdminSubOrders', () => {
      it('should return suborders breakdown for an order', async () => {
        mockPrisma.order.findUnique.mockResolvedValueOnce({
          orderNumber: 'ORD-MULTI-SHOP',
          status: OrderStatus.PROCESSING,
          sellerOrders: [
            {
              id: 'so-1',
              subOrderNumber: 'ORD-MULTI-SHOP-S1',
              status: SellerOrderStatus.PROCESSING,
              deliveryType: 'SELLER_MANAGED',
              totalAmount: 600,
              netSellerPayable: 540,
              shop: { id: 'shop-1', name: 'Alpha' },
              items: [{ id: 'item-1', productTitleSnapshot: 'Item 1' }],
              statusHistory: [],
            },
            {
              id: 'so-2',
              subOrderNumber: 'ORD-MULTI-SHOP-S2',
              status: SellerOrderStatus.CONFIRMED,
              deliveryType: 'SELLER_MANAGED',
              totalAmount: 400,
              netSellerPayable: 360,
              shop: { id: 'shop-2', name: 'Beta' },
              items: [{ id: 'item-2', productTitleSnapshot: 'Item 2' }],
              statusHistory: [],
            },
          ],
        });

        const result = await service.getAdminSubOrders('ORD-MULTI-SHOP');

        expect(result.orderNumber).toBe('ORD-MULTI-SHOP');
        expect(result.totalSubOrders).toBe(2);
        expect(result.subOrders[0].subOrderNumber).toBe('ORD-MULTI-SHOP-S1');
        expect(result.subOrders[1].subOrderNumber).toBe('ORD-MULTI-SHOP-S2');
      });
    });

    describe('updateAdminOrderStatus', () => {
      it('should reject marking PENDING_PAYMENT order as CONFIRMED without payment confirmation', async () => {
        mockPrisma.order.findUnique.mockResolvedValueOnce({
          id: 'ord-unpaid',
          orderNumber: 'ORD-UNPAID',
          status: OrderStatus.PENDING_PAYMENT,
          sellerOrders: [],
        });

        await expect(
          service.updateAdminOrderStatus('admin-1', 'ORD-UNPAID', {
            status: OrderStatus.CONFIRMED,
          }),
        ).rejects.toThrow(
          'Cannot mark order as "CONFIRMED" while in PENDING_PAYMENT. Payment confirmation is required before fulfilling orders. Unpaid orders may only be CANCELLED.',
        );
      });

      it('should allow admin to CANCEL an unpaid PENDING_PAYMENT order and cascade to sub-orders', async () => {
        mockPrisma.order.findUnique.mockResolvedValueOnce({
          id: 'ord-unpaid',
          orderNumber: 'ORD-UNPAID',
          status: OrderStatus.PENDING_PAYMENT,
          sellerOrders: [
            {
              id: 'so-1',
              status: SellerOrderStatus.PENDING_PAYMENT,
            },
          ],
        });

        mockPrisma.order.update.mockResolvedValueOnce({
          id: 'ord-unpaid',
          orderNumber: 'ORD-UNPAID',
          status: OrderStatus.CANCELLED,
        });

        const result = await service.updateAdminOrderStatus('admin-1', 'ORD-UNPAID', {
          status: OrderStatus.CANCELLED,
          notes: 'Customer requested cancellation before payment',
        });

        expect(result.status).toBe(OrderStatus.CANCELLED);
        expect(mockPrisma.order.update).toHaveBeenCalledWith({
          where: { id: 'ord-unpaid' },
          data: expect.objectContaining({ status: OrderStatus.CANCELLED }),
        });
        expect(mockPrisma.sellerOrder.update).toHaveBeenCalledWith({
          where: { id: 'so-1' },
          data: expect.objectContaining({ status: SellerOrderStatus.CANCELLED }),
        });
        expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledTimes(2); // 1 for order, 1 for sub-order
      });

      it('should reject invalid transition (e.g. DELIVERED to CANCELLED)', async () => {
        mockPrisma.order.findUnique.mockResolvedValueOnce({
          id: 'ord-deliv',
          orderNumber: 'ORD-DELIV',
          status: OrderStatus.DELIVERED,
          sellerOrders: [],
        });

        await expect(
          service.updateAdminOrderStatus('admin-1', 'ORD-DELIV', {
            status: OrderStatus.CANCELLED,
          }),
        ).rejects.toThrow('Invalid status transition for Order');
      });
    });

    describe('updateAdminSubOrderStatus', () => {
      it('should update sub-order and sync parent order to DELIVERED when all sub-orders delivered', async () => {
        mockPrisma.sellerOrder.findUnique.mockResolvedValueOnce({
          id: 'so-1',
          subOrderNumber: 'ORD-EXP-S1',
          status: SellerOrderStatus.SHIPPED,
          orderId: 'ord-parent-1',
          order: {
            id: 'ord-parent-1',
            status: OrderStatus.SHIPPED,
            sellerOrders: [
              { id: 'so-1', status: SellerOrderStatus.SHIPPED },
              { id: 'so-2', status: SellerOrderStatus.DELIVERED },
            ],
          },
        });

        mockPrisma.sellerOrder.update.mockResolvedValueOnce({
          id: 'so-1',
          subOrderNumber: 'ORD-EXP-S1',
          status: SellerOrderStatus.DELIVERED,
          deliveredAt: new Date(),
        });

        const result = await service.updateAdminSubOrderStatus('admin-1', 'ORD-EXP-S1', {
          status: SellerOrderStatus.DELIVERED,
          notes: 'Delivered by courier partner',
        });

        expect(result.status).toBe(SellerOrderStatus.DELIVERED);
        expect(result.parentOrderStatus).toBe(OrderStatus.DELIVERED);
        expect(mockPrisma.order.update).toHaveBeenCalledWith({
          where: { id: 'ord-parent-1' },
          data: { status: OrderStatus.DELIVERED },
        });
      });
    });
  });
});

