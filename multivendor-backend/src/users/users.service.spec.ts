import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ShopStatus, UserRole, UserStatus } from '../generated/prisma/client.js';
import { UsersService } from './users.service.js';

describe('UsersService (Unit Tests)', () => {
  let service: UsersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        updateMany: jest.fn(),
      },
      shop: {
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => await cb(mockPrisma)),
    };

    service = new UsersService(mockPrisma as any);
  });

  // ===========================================================================
  // 1. GET /api/v1/admin/users (Listing, Pagination, Filtering, Sensitive-field Scrubbing)
  // ===========================================================================
  describe('getAdminUsers', () => {
    it('should return paginated users ordered newest first with sensitive fields omitted', async () => {
      const mockUsers = [
        {
          id: 'user-1',
          email: 'customer@example.com',
          phone: '+919876543210',
          firstName: 'Alice',
          lastName: 'Smith',
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          isEmailVerified: true,
          isPhoneVerified: false,
          createdAt: new Date('2026-10-13T10:00:00Z'),
          updatedAt: new Date('2026-10-13T10:00:00Z'),
          shop: null,
        },
      ];

      mockPrisma.user.count.mockResolvedValueOnce(1);
      mockPrisma.user.findMany.mockResolvedValueOnce(mockUsers);

      const result = await service.getAdminUsers({ page: 1, limit: 10 });

      expect(mockPrisma.user.count).toHaveBeenCalledWith({ where: {} });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: expect.objectContaining({
          id: true,
          email: true,
          role: true,
          status: true,
        }),
      });

      // Confirm sensitive fields like passwordHash and refreshTokenHash are not included in select
      const selectArg = mockPrisma.user.findMany.mock.calls[0][0].select;
      expect(selectArg.passwordHash).toBeUndefined();
      expect(selectArg.sessions).toBeUndefined();
      expect(selectArg.emailTokens).toBeUndefined();
      expect(selectArg.passwordTokens).toBeUndefined();

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter by role and status when query parameters are provided', async () => {
      mockPrisma.user.count.mockResolvedValueOnce(0);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      await service.getAdminUsers({
        page: 2,
        limit: 5,
        role: UserRole.SELLER,
        status: UserStatus.SUSPENDED,
      });

      const expectedWhere = {
        role: UserRole.SELLER,
        status: UserStatus.SUSPENDED,
      };

      expect(mockPrisma.user.count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        skip: 5,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });
  });

  // ===========================================================================
  // 2. GET /api/v1/admin/users/:id (User Details, Sensitive-field Scrubbing)
  // ===========================================================================
  describe('getAdminUserById', () => {
    it('should return user details with shop summary and counts, omitting passwordHash', async () => {
      const mockUser = {
        id: 'seller-user-1',
        email: 'seller@example.com',
        phone: '+919999999999',
        firstName: 'Bob',
        lastName: 'Seller',
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        isEmailVerified: true,
        isPhoneVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        shop: {
          id: 'shop-1',
          name: 'Bob Crafts',
          slug: 'bob-crafts',
          status: ShopStatus.APPROVED,
          gstin: '29ABCDE1234F1Z5',
          createdAt: new Date(),
        },
        _count: {
          orders: 5,
          addresses: 2,
          sessions: 3,
        },
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const result = await service.getAdminUserById('seller-user-1');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'seller-user-1' },
        select: expect.objectContaining({
          id: true,
          email: true,
          shop: expect.any(Object),
          _count: expect.any(Object),
        }),
      });

      expect(result.id).toBe('seller-user-1');
      expect(result.shop?.name).toBe('Bob Crafts');
      expect(result.stats).toEqual({
        totalOrders: 5,
        totalAddresses: 2,
        activeOrTotalSessions: 3,
      });
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.getAdminUserById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================================================
  // 3. PATCH /api/v1/admin/users/:id/status (Transitions, Revocation, Invariants)
  // ===========================================================================
  describe('updateUserStatus', () => {
    it('should reject self-suspension or self-modification', async () => {
      await expect(
        service.updateUserStatus('admin-1', 'admin-1', {
          status: UserStatus.SUSPENDED,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if target user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateUserStatus('admin-1', 'target-404', {
          status: UserStatus.ACTIVE,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should block suspending or deactivating the last active administrator', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'other-admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        shop: null,
      });

      // No other active admins exist
      mockPrisma.user.count.mockResolvedValueOnce(0);

      await expect(
        service.updateUserStatus('admin-1', 'other-admin', {
          status: UserStatus.SUSPENDED,
        }),
      ).rejects.toThrow('Cannot suspend or deactivate the last active administrator');
    });

    it('should allow suspending an admin if another active administrator exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'other-admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        shop: null,
      });

      // 1 other active admin exists (the caller admin-1)
      mockPrisma.user.count.mockResolvedValueOnce(1);
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'other-admin',
        status: UserStatus.SUSPENDED,
      });
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 2 });

      const result = await service.updateUserStatus('admin-1', 'other-admin', {
        status: UserStatus.SUSPENDED,
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'other-admin' },
          data: { status: UserStatus.SUSPENDED },
        }),
      );
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'other-admin', isRevoked: false },
        data: { isRevoked: true },
      });
      expect(result.revokedSessions).toBe(2);
    });

    it('should suspend seller shop if an approved seller is suspended', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'seller-1',
        role: UserRole.SELLER,
        status: UserStatus.ACTIVE,
        shop: {
          id: 'shop-1',
          status: ShopStatus.APPROVED,
        },
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'seller-1',
        status: UserStatus.SUSPENDED,
      });
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.shop.update.mockResolvedValueOnce({
        id: 'shop-1',
        status: ShopStatus.SUSPENDED,
      });

      const result = await service.updateUserStatus('admin-1', 'seller-1', {
        status: UserStatus.SUSPENDED,
        reason: 'Violation of seller terms',
      });

      expect(mockPrisma.shop.update).toHaveBeenCalledWith({
        where: { id: 'shop-1' },
        data: {
          status: ShopStatus.SUSPENDED,
          rejectionReason: 'Violation of seller terms',
        },
      });
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'seller-1', isRevoked: false },
        data: { isRevoked: true },
      });
      expect(result.revokedSessions).toBe(1);
    });

    it('should activate a user without revoking sessions or touching shop', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-2',
        role: UserRole.CUSTOMER,
        status: UserStatus.PENDING_VERIFICATION,
        shop: null,
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'user-2',
        status: UserStatus.ACTIVE,
      });

      const result = await service.updateUserStatus('admin-1', 'user-2', {
        status: UserStatus.ACTIVE,
      });

      expect(mockPrisma.userSession.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.shop.update).not.toHaveBeenCalled();
      expect(result.revokedSessions).toBe(0);
    });
  });

  // ===========================================================================
  // 4. PATCH /api/v1/admin/users/:id/role (Role Updates, Self-demotion, Last-admin)
  // ===========================================================================
  describe('updateUserRole', () => {
    it('should prevent self-demotion or self role modification', async () => {
      await expect(
        service.updateUserRole('admin-1', 'admin-1', {
          role: UserRole.CUSTOMER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if target user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateUserRole('admin-1', 'target-not-found', {
          role: UserRole.SELLER,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if target user already has the requested role', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'target-1',
        role: UserRole.CUSTOMER,
      });

      await expect(
        service.updateUserRole('admin-1', 'target-1', {
          role: UserRole.CUSTOMER,
        }),
      ).rejects.toThrow('User already has the role "CUSTOMER"');
    });

    it('should block demoting the last active administrator', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'target-admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });

      // No other active admins
      mockPrisma.user.count.mockResolvedValueOnce(0);

      await expect(
        service.updateUserRole('admin-1', 'target-admin', {
          role: UserRole.CUSTOMER,
        }),
      ).rejects.toThrow('Cannot demote the last active administrator');
    });

    it('should successfully update role to SELLER if permitted', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'target-customer',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'target-customer',
        role: UserRole.SELLER,
      });

      const result = await service.updateUserRole('admin-1', 'target-customer', {
        role: UserRole.SELLER,
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'target-customer' },
        data: { role: UserRole.SELLER },
        select: expect.any(Object),
      });
      expect(result.message).toBe('User role successfully updated to SELLER');
    });

    it('should successfully promote a customer to ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'target-customer',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'target-customer',
        role: UserRole.ADMIN,
      });

      const result = await service.updateUserRole('admin-1', 'target-customer', {
        role: UserRole.ADMIN,
      });

      // Admin count check shouldn't trigger when promoting to ADMIN
      expect(mockPrisma.user.count).not.toHaveBeenCalled();
      expect(result.message).toBe('User role successfully updated to ADMIN');
    });
  });
});
