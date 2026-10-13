import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ShopStatus } from '../generated/prisma/client.js';
import { ShopsService } from './shops.service.js';

describe('ShopsService (Unit Tests)', () => {
  let service: ShopsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      shop: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      address: {
        findUnique: jest.fn(),
      },
    };

    service = new ShopsService(mockPrisma as any);
  });

  // ===========================================================================
  // TASK 1: SELLER SHOP TESTS
  // ===========================================================================
  describe('Seller Shop Operations', () => {
    const validApplicationDto = {
      name: 'Organic Harvest',
      description: 'Fresh organic goods directly from farm',
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
    };

    it('should retrieve seller shop profile with pickup address', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        sellerId: 'seller-user-1',
        name: 'Organic Harvest',
        slug: 'organic-harvest',
        status: ShopStatus.PENDING_APPROVAL,
        pickupAddress: null,
      });

      const result = await service.getSellerShop('seller-user-1');
      expect(result.id).toBe('shop-1');
      expect(result.name).toBe('Organic Harvest');
      expect(result.status).toBe(ShopStatus.PENDING_APPROVAL);
    });

    it('should throw NotFoundException if seller has not submitted a shop application', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce(null);

      await expect(service.getSellerShop('seller-user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject duplicate shop application if seller already has a shop', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-existing',
        sellerId: 'seller-user-1',
        status: ShopStatus.APPROVED,
      });

      await expect(
        service.createShopApplication('seller-user-1', validApplicationDto),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.shop.create).not.toHaveBeenCalled();
    });

    it('should reject duplicate GSTIN if already registered to another shop', async () => {
      mockPrisma.shop.findUnique
        .mockResolvedValueOnce(null) // no existing shop for sellerId
        .mockResolvedValueOnce({ id: 'shop-other', gstin: '29ABCDE1234F1Z5' }); // duplicate GSTIN found

      await expect(
        service.createShopApplication('seller-user-1', validApplicationDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject pickup address if not owned by authenticated seller', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce(null); // no existing shop for seller
      mockPrisma.address.findUnique.mockResolvedValueOnce({
        id: 'addr-someone-else',
        userId: 'other-user',
      });

      await expect(
        service.createShopApplication('seller-user-1', {
          ...validApplicationDto,
          pickupAddressId: 'addr-someone-else',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create shop application with status strictly set to PENDING_APPROVAL and generated slug', async () => {
      mockPrisma.shop.findUnique
        .mockResolvedValueOnce(null) // seller has no shop
        .mockResolvedValueOnce(null) // GSTIN unique
        .mockResolvedValueOnce(null); // slug available

      mockPrisma.shop.create.mockResolvedValueOnce({
        id: 'shop-created-1',
        sellerId: 'seller-user-1',
        name: 'Organic Harvest',
        slug: 'organic-harvest',
        status: ShopStatus.PENDING_APPROVAL,
        pickupAddress: null,
      });

      const result = await service.createShopApplication('seller-user-1', validApplicationDto);
      expect(result.shop.status).toBe(ShopStatus.PENDING_APPROVAL);
      expect(mockPrisma.shop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ShopStatus.PENDING_APPROVAL,
            slug: 'organic-harvest',
          }),
        }),
      );
    });

    it('should forbid seller from updating details if shop is SUSPENDED', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        sellerId: 'seller-user-1',
        status: ShopStatus.SUSPENDED,
      });

      await expect(
        service.updateSellerShop('seller-user-1', { description: 'New description' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should automatically reset status to PENDING_APPROVAL if seller updates a REJECTED shop', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        sellerId: 'seller-user-1',
        status: ShopStatus.REJECTED,
        rejectionReason: 'Missing documentation',
      });

      mockPrisma.shop.update.mockResolvedValueOnce({
        id: 'shop-1',
        name: 'Organic Harvest Updated',
        status: ShopStatus.PENDING_APPROVAL,
        rejectionReason: null,
      });

      const result = await service.updateSellerShop('seller-user-1', {
        name: 'Organic Harvest Updated',
      });

      expect(mockPrisma.shop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shop-1' },
          data: expect.objectContaining({
            status: ShopStatus.PENDING_APPROVAL,
            rejectionReason: null,
          }),
        }),
      );
      expect(result.message).toContain('re-submitted for administrator approval');
    });
  });

  // ===========================================================================
  // TASK 2: ADMIN SHOP APPROVAL TESTS
  // ===========================================================================
  describe('Admin Shop Approval Operations', () => {
    it('should list pending shop applications with pagination', async () => {
      mockPrisma.shop.count.mockResolvedValueOnce(3);
      mockPrisma.shop.findMany.mockResolvedValueOnce([
        {
          id: 'shop-pend-1',
          name: 'Farmer Co',
          slug: 'farmer-co',
          status: ShopStatus.PENDING_APPROVAL,
          seller: { id: 'user-s1', email: 's1@example.com' },
          documents: [],
        },
      ]);

      const result = await service.getPendingShops({ page: 1, limit: 10 });
      expect(mockPrisma.shop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ShopStatus.PENDING_APPROVAL },
          skip: 0,
          take: 10,
        }),
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(3);
    });

    it('should mask seller bank account number when admin views shop detail', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        name: 'Alpha Store',
        status: ShopStatus.PENDING_APPROVAL,
        seller: { id: 'user-s1' },
        documents: [],
        bankAccount: {
          id: 'ba-1',
          bankName: 'HDFC Bank',
          accountHolderName: 'Alpha Store Pvt Ltd',
          accountNumber: '12345678901234',
          ifscCode: 'HDFC0001234',
          isVerified: false,
        },
      });

      const result = await service.getShopByIdForAdmin('shop-1');
      expect(result.bankAccount.accountNumber).toBe('••••••••1234');
    });

    it('should throw BadRequestException if approving an already approved shop', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        status: ShopStatus.APPROVED,
      });

      await expect(
        service.updateShopStatusByAdmin('admin-user-1', 'shop-1', {
          status: ShopStatus.APPROVED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if rejecting a shop without providing a reason', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        status: ShopStatus.PENDING_APPROVAL,
      });

      await expect(
        service.updateShopStatusByAdmin('admin-user-1', 'shop-1', {
          status: ShopStatus.REJECTED,
          reason: undefined,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should record approvedAt, approvedById, and clear rejectionReason upon APPROVAL', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        status: ShopStatus.PENDING_APPROVAL,
      });

      mockPrisma.shop.update.mockResolvedValueOnce({
        id: 'shop-1',
        name: 'Alpha Store',
        status: ShopStatus.APPROVED,
        approvedById: 'admin-user-1',
        approvedAt: new Date(),
        rejectionReason: null,
      });

      const result = await service.updateShopStatusByAdmin('admin-user-1', 'shop-1', {
        status: ShopStatus.APPROVED,
      });

      expect(result.shop.status).toBe(ShopStatus.APPROVED);
      expect(mockPrisma.shop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shop-1' },
          data: expect.objectContaining({
            status: ShopStatus.APPROVED,
            approvedById: 'admin-user-1',
            rejectionReason: null,
          }),
        }),
      );
    });

    it('should record rejectionReason and clear approval fields upon REJECTION', async () => {
      mockPrisma.shop.findUnique.mockResolvedValueOnce({
        id: 'shop-1',
        status: ShopStatus.PENDING_APPROVAL,
      });

      mockPrisma.shop.update.mockResolvedValueOnce({
        id: 'shop-1',
        name: 'Alpha Store',
        status: ShopStatus.REJECTED,
        rejectionReason: 'Invalid GST certificate provided',
        approvedById: null,
        approvedAt: null,
      });

      const result = await service.updateShopStatusByAdmin('admin-user-1', 'shop-1', {
        status: ShopStatus.REJECTED,
        reason: 'Invalid GST certificate provided',
      });

      expect(result.shop.status).toBe(ShopStatus.REJECTED);
      expect(mockPrisma.shop.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'shop-1' },
          data: expect.objectContaining({
            status: ShopStatus.REJECTED,
            rejectionReason: 'Invalid GST certificate provided',
            approvedById: null,
            approvedAt: null,
          }),
        }),
      );
    });
  });
});
