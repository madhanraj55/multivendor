import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
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
import { CheckoutService } from './checkout.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('CheckoutService (Unit Tests)', () => {
  let service: CheckoutService;
  let mockPrisma: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      checkoutAttempt: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      cart: {
        findUnique: jest.fn(),
      },
      cartItem: {
        deleteMany: jest.fn(),
      },
      checkoutItem: {
        findMany: jest.fn(),
      },
      order: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      sellerOrder: {
        create: jest.fn(),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback: any) => Promise.resolve().then(() => callback(mockPrisma))),
    };

    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'CHECKOUT_RESERVATION_DURATION_MINUTES') return '15';
        return null;
      }),
    };

    service = new CheckoutService(mockPrisma as any, mockConfig as any);
  });

  describe('reserveCheckout - Idempotency & Eligibility', () => {
    const validDto = {
      idempotencyKey: 'test-idemp-key-1',
      shippingAddress: {
        fullName: 'Jane Doe',
        phone: '9876543210',
        addressLine1: '123 Main St',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
      },
    };

    it('should return existing active reservation if attempt already exists in STOCK_RESERVED status', async () => {
      const existingAttempt = {
        id: 'attempt-uuid-1',
        userId: 'user-uuid-1',
        idempotencyKey: 'test-idemp-key-1',
        status: CheckoutStatus.STOCK_RESERVED,
        items: [],
      };
      mockPrisma.checkoutAttempt.findUnique.mockResolvedValue(existingAttempt);

      const result = await service.reserveCheckout('user-uuid-1', validDto);
      expect(result.isExisting).toBe(true);
      expect(result.checkoutAttempt).toBe(existingAttempt);
      expect(mockPrisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it('should reject retry with ConflictException if attempt previously ended in EXPIRED', async () => {
      mockPrisma.checkoutAttempt.findUnique.mockResolvedValue({
        id: 'attempt-uuid-1',
        status: CheckoutStatus.EXPIRED,
      });

      await expect(
        service.reserveCheckout('user-uuid-1', validDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject retry with ConflictException if attempt is already COMPLETED', async () => {
      mockPrisma.checkoutAttempt.findUnique.mockResolvedValue({
        id: 'attempt-uuid-1',
        status: CheckoutStatus.COMPLETED,
      });

      await expect(
        service.reserveCheckout('user-uuid-1', validDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if customer cart is empty', async () => {
      mockPrisma.checkoutAttempt.findUnique.mockResolvedValue(null);
      mockPrisma.cart.findUnique.mockResolvedValue({ id: 'cart-1', items: [] });

      await expect(
        service.reserveCheckout('user-uuid-1', validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should rollback and reject when shop is not APPROVED', async () => {
      mockPrisma.checkoutAttempt.findUnique.mockResolvedValue(null);
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            quantity: 2,
            variantId: 'var-1',
            variant: {
              sku: 'SKU1',
              title: 'Variant 1',
              price: 100,
              mrp: 120,
              isActive: true,
              inventory: { id: 'inv-1', availableQuantity: 10 },
              product: {
                title: 'Product 1',
                status: ProductStatus.PUBLISHED,
                shop: { id: 'shop-1', name: 'Unapproved Shop', status: ShopStatus.PENDING_APPROVAL },
              },
            },
          },
        ],
      });

      await expect(
        service.reserveCheckout('user-uuid-1', validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should rollback with ConflictException if stock update fails condition (insufficient stock)', async () => {
      mockPrisma.checkoutAttempt.findUnique.mockResolvedValue(null);
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            quantity: 5,
            variantId: 'var-1',
            variant: {
              sku: 'SKU1',
              title: 'Variant 1',
              price: 100,
              mrp: 120,
              isActive: true,
              inventory: { id: 'inv-1', availableQuantity: 10 },
              product: {
                title: 'Product 1',
                status: ProductStatus.PUBLISHED,
                shop: { id: 'shop-1', name: 'Approved Shop', status: ShopStatus.APPROVED },
              },
            },
          },
        ],
      });

      // Simulate atomic UPDATE returning 0 rows because availableQuantity was concurrently depleted
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.reserveCheckout('user-uuid-1', validDto),
      ).rejects.toThrow(ConflictException);

      // Verify that CheckoutAttempt was NOT created because transaction rolled back
      expect(mockPrisma.checkoutAttempt.create).not.toHaveBeenCalled();
    });

    it('should successfully reserve stock and log InventoryMovement when stock condition matches', async () => {
      mockPrisma.checkoutAttempt.findUnique.mockResolvedValue(null);
      mockPrisma.cart.findUnique.mockResolvedValue({
        id: 'cart-1',
        items: [
          {
            quantity: 2,
            variantId: 'var-1',
            variant: {
              sku: 'SKU1',
              title: 'Variant 1',
              price: 150,
              mrp: 200,
              isActive: true,
              inventory: { id: 'inv-1', availableQuantity: 10 },
              product: {
                title: 'Product 1',
                status: ProductStatus.PUBLISHED,
                shop: { id: 'shop-1', name: 'Approved Shop', status: ShopStatus.APPROVED },
              },
            },
          },
        ],
      });

      // Simulate successful atomic UPDATE
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          id: 'inv-1',
          variantId: 'var-1',
          availableQuantity: 8,
          reservedQuantity: 2,
        },
      ]);

      mockPrisma.inventoryMovement.create.mockResolvedValue({ id: 'mov-1' });
      mockPrisma.checkoutAttempt.create.mockResolvedValue({
        id: 'attempt-created-1',
        status: CheckoutStatus.STOCK_RESERVED,
        subtotalAmount: 300,
      });

      const result = await service.reserveCheckout('user-uuid-1', validDto);
      expect(result.isExisting).toBe(false);
      expect(result.checkoutAttempt.id).toBe('attempt-created-1');
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inventoryId: 'inv-1',
          movementType: MovementType.ORDER_RESERVATION,
          quantity: -2,
          balanceAfter: 8,
        }),
      });
    });
  });

  describe('releaseExpiredCheckouts - Strict Inventory Validation', () => {
    it('should return processedCount 0 if no candidates are found', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // no candidates
      const result = await service.releaseExpiredCheckouts();
      expect(result.processedCount).toBe(0);
      expect(result.releasedCount).toBe(0);
    });

    it('should throw and rollback if reservedQuantity is insufficient rather than concealing error', async () => {
      // 1. Candidate search returns 1 candidate
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'attempt-exp-1' }]);
      // 2. Lock attempt returns row
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: 'attempt-exp-1', userId: 'user-1', status: CheckoutStatus.STOCK_RESERVED },
      ]);
      mockPrisma.checkoutItem.findMany.mockResolvedValue([
        { variantId: 'var-1', quantity: 5 },
      ]);
      // 3. Update inventory condition fails (reservedQuantity < item.quantity)
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.releaseExpiredCheckouts();
      expect(result.failedCount).toBe(1);
      expect(result.releasedCount).toBe(0);
      // Attempt status must NOT transition to EXPIRED when stock release fails
      expect(mockPrisma.checkoutAttempt.update).not.toHaveBeenCalled();
    });

    it('should successfully restore inventory and transition status to EXPIRED', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ id: 'attempt-exp-1' }]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: 'attempt-exp-1', userId: 'user-1', status: CheckoutStatus.STOCK_RESERVED },
      ]);
      mockPrisma.checkoutItem.findMany.mockResolvedValue([
        { variantId: 'var-1', quantity: 3 },
      ]);
      // Successful inventory update
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { id: 'inv-1', variantId: 'var-1', availableQuantity: 10, reservedQuantity: 0 },
      ]);
      mockPrisma.inventoryMovement.create.mockResolvedValue({ id: 'mov-rel-1' });
      mockPrisma.checkoutAttempt.update.mockResolvedValue({ id: 'attempt-exp-1', status: CheckoutStatus.EXPIRED });

      const result = await service.releaseExpiredCheckouts();
      expect(result.releasedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          movementType: MovementType.ORDER_CANCELLATION,
          quantity: 3,
          balanceAfter: 10,
        }),
      });
      expect(mockPrisma.checkoutAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-exp-1' },
        data: { status: CheckoutStatus.EXPIRED },
      });
    });
  });

  describe('placeOrder - Order Placement and Seller Sub-Order Splitting', () => {
    const validPlaceOrderDto = {
      checkoutAttemptId: 'attempt-uuid-valid',
      notes: 'Please ring bell',
    };

    it('should throw NotFoundException if checkout attempt does not exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]); // no attempt found with FOR UPDATE

      let err: any;
      try {
        await service.placeOrder('user-1', validPlaceOrderDto);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(NotFoundException);
    });

    it('should throw ForbiddenException if customer is not the owner of the checkout attempt', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'attempt-uuid-valid',
          userId: 'other-user',
          status: CheckoutStatus.STOCK_RESERVED,
          expiresAt: new Date(Date.now() + 60000),
        },
      ]);

      let err: any;
      try {
        await service.placeOrder('user-1', validPlaceOrderDto);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ForbiddenException);
    });

    it('should return existing order idempotently if checkout attempt is already COMPLETED with orderId', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'attempt-uuid-valid',
          userId: 'user-1',
          status: CheckoutStatus.COMPLETED,
          orderId: 'existing-order-id',
          expiresAt: new Date(Date.now() + 60000),
        },
      ]);

      const existingOrder = {
        id: 'existing-order-id',
        orderNumber: 'ORD-20261013-111111',
        sellerOrders: [],
      };
      mockPrisma.order.findUnique.mockResolvedValueOnce(existingOrder);

      const result = await service.placeOrder('user-1', validPlaceOrderDto);
      expect(result.isExisting).toBe(true);
      expect(result.order).toBe(existingOrder);
      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it('should reject if checkout attempt is in status other than STOCK_RESERVED', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'attempt-uuid-valid',
          userId: 'user-1',
          status: CheckoutStatus.EXPIRED,
          expiresAt: new Date(Date.now() + 60000),
        },
      ]);

      await expect(
        service.placeOrder('user-1', validPlaceOrderDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if stock reservation has expired', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'attempt-uuid-valid',
          userId: 'user-1',
          status: CheckoutStatus.STOCK_RESERVED,
          expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        },
      ]);

      await expect(
        service.placeOrder('user-1', validPlaceOrderDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject with ConflictException if reserved inventory is inconsistent with requested quantity', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'attempt-uuid-valid',
          userId: 'user-1',
          status: CheckoutStatus.STOCK_RESERVED,
          expiresAt: new Date(Date.now() + 60000),
          subtotalAmount: 200,
          totalAmount: 200,
        },
      ]);

      mockPrisma.checkoutItem.findMany.mockResolvedValueOnce([
        {
          variantId: 'var-1',
          quantity: 2,
          totalPrice: 200,
          variant: {
            title: 'Variant 1',
            inventory: { reservedQuantity: 1 }, // Inconsistent: requested 2, reserved only 1
            product: { shop: { id: 'shop-1' } },
          },
        },
      ]);

      await expect(
        service.placeOrder('user-1', validPlaceOrderDto),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.order.create).not.toHaveBeenCalled();
    });

    it('should create exactly 1 parent Order and 2 SellerOrders when items span 2 distinct shops', async () => {
      const futureExpiry = new Date(Date.now() + 60000);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'attempt-uuid-valid',
          userId: 'user-1',
          status: CheckoutStatus.STOCK_RESERVED,
          expiresAt: futureExpiry,
          subtotalAmount: 350,
          discountAmount: 0,
          shippingFee: 0,
          taxAmount: 0,
          totalAmount: 350,
          currency: 'INR',
          shippingAddressSnapshot: { city: 'Bengaluru' },
          billingAddressSnapshot: { city: 'Bengaluru' },
        },
      ]);

      mockPrisma.checkoutItem.findMany.mockResolvedValueOnce([
        {
          variantId: 'var-1',
          quantity: 2,
          unitPrice: 100,
          totalPrice: 200,
          variant: {
            title: 'Variant 1',
            sku: 'SKU1',
            attributes: { size: 'M' },
            inventory: { reservedQuantity: 2 },
            product: {
              title: 'Product 1',
              gstRate: 18,
              shop: { id: 'shop-1', name: 'Alpha Shop' },
            },
          },
        },
        {
          variantId: 'var-2',
          quantity: 1,
          unitPrice: 150,
          totalPrice: 150,
          variant: {
            title: 'Variant 2',
            sku: 'SKU2',
            attributes: { color: 'Blue' },
            inventory: { reservedQuantity: 1 },
            product: {
              title: 'Product 2',
              gstRate: null,
              category: { defaultGstRate: 12 },
              shop: { id: 'shop-2', name: 'Beta Shop' },
            },
          },
        },
      ]);

      mockPrisma.order.create.mockResolvedValueOnce({
        id: 'ord-123',
        orderNumber: 'ORD-20261013-999999',
      });

      mockPrisma.orderStatusHistory.create.mockResolvedValue({ id: 'hist-1' });

      mockPrisma.sellerOrder.create
        .mockResolvedValueOnce({
          id: 'seller-ord-1',
          orderId: 'ord-123',
          shopId: 'shop-1',
          subOrderNumber: 'ORD-20261013-999999-S1',
          subtotalAmount: 200,
          totalAmount: 200,
        })
        .mockResolvedValueOnce({
          id: 'seller-ord-2',
          orderId: 'ord-123',
          shopId: 'shop-2',
          subOrderNumber: 'ORD-20261013-999999-S2',
          subtotalAmount: 150,
          totalAmount: 150,
        });

      mockPrisma.checkoutAttempt.update.mockResolvedValueOnce({
        id: 'attempt-uuid-valid',
        status: CheckoutStatus.COMPLETED,
      });

      mockPrisma.cart.findUnique.mockResolvedValueOnce({ id: 'cart-1' });
      mockPrisma.cartItem.deleteMany.mockResolvedValueOnce({ count: 2 });

      mockPrisma.order.findUnique.mockResolvedValueOnce({
        id: 'ord-123',
        orderNumber: 'ORD-20261013-999999',
        sellerOrders: [
          { id: 'seller-ord-1', shopId: 'shop-1' },
          { id: 'seller-ord-2', shopId: 'shop-2' },
        ],
      });

      const result = await service.placeOrder('user-1', validPlaceOrderDto);

      expect(result.isExisting).toBe(false);
      expect(result.order.id).toBe('ord-123');

      // Assert exactly 1 parent Order created
      expect(mockPrisma.order.create).toHaveBeenCalledTimes(1);

      // Assert exactly 2 SellerOrders created (one per distinct shop)
      expect(mockPrisma.sellerOrder.create).toHaveBeenCalledTimes(2);

      // Assert OrderStatusHistory logged for parent and both seller sub-orders (3 entries total)
      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledTimes(3);

      // Assert CheckoutAttempt transitioned to COMPLETED
      expect(mockPrisma.checkoutAttempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-uuid-valid' },
        data: {
          status: CheckoutStatus.COMPLETED,
          orderId: 'ord-123',
        },
      });

      // Assert cart items deleted
      expect(mockPrisma.cartItem.deleteMany).toHaveBeenCalledWith({
        where: {
          cartId: 'cart-1',
          variantId: { in: ['var-1', 'var-2'] },
        },
      });
    });
  });
});
