import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRole, UserStatus } from '../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

describe('AuthService (Unit Tests)', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockJwtService: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      emailVerificationToken: {
        findFirst: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      shop: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return await cb(mockPrisma);
        }
        return cb;
      }),
    };

    mockJwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-access-token'),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-secret';
        if (key === 'JWT_ACCESS_EXPIRATION') return '15m';
        return null;
      }),
    };

    service = new AuthService(
      mockPrisma as any,
      mockJwtService as any,
      mockConfigService as any,
    );
  });

  describe('getCurrentProfile', () => {
    it('should return sanitized current profile', async () => {
      const mockUser = {
        id: 'usr-1',
        email: 'customer@example.com',
        phone: '+919876543210',
        firstName: 'Customer',
        lastName: 'One',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        isEmailVerified: true,
        isPhoneVerified: false,
        shop: null,
        createdAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const result = await service.getCurrentProfile('usr-1');
      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'usr-1' },
        select: expect.objectContaining({
          id: true,
          email: true,
          role: true,
        }),
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.getCurrentProfile('missing-usr')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update profile fields and return updated user', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // No phone conflict
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'usr-1',
        email: 'customer@example.com',
        phone: '+919999999999',
        firstName: 'Updated',
        lastName: 'Name',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        isEmailVerified: true,
        isPhoneVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updateProfile('usr-1', {
        firstName: 'Updated',
        lastName: 'Name',
        phone: '+919999999999',
      });

      expect(result.message).toBe('Profile updated successfully');
      expect(result.user.firstName).toBe('Updated');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-1' },
          data: expect.objectContaining({
            firstName: 'Updated',
            lastName: 'Name',
            phone: '+919999999999',
          }),
        }),
      );
    });

    it('should throw ConflictException if phone number is taken by another user', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({ id: 'usr-2', phone: '+919999999999' });

      await expect(
        service.updateProfile('usr-1', { phone: '+919999999999' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('should update password and revoke active sessions when current password matches', async () => {
      const hashedOldPassword = await argon2.hash('OldPassword@123');
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'usr-1',
        passwordHash: hashedOldPassword,
      });

      const result = await service.changePassword('usr-1', {
        currentPassword: 'OldPassword@123',
        newPassword: 'NewSecurePassword@456',
      });

      expect(result.message).toContain('Password changed successfully');
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'usr-1' },
          data: expect.objectContaining({
            passwordHash: expect.any(String),
          }),
        }),
      );
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr-1', isRevoked: false },
        data: { isRevoked: true },
      });
    });

    it('should throw BadRequestException if current password is incorrect', async () => {
      const hashedOldPassword = await argon2.hash('OldPassword@123');
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'usr-1',
        passwordHash: hashedOldPassword,
      });

      await expect(
        service.changePassword('usr-1', {
          currentPassword: 'WrongPassword@999',
          newPassword: 'NewSecurePassword@456',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.changePassword('usr-none', {
          currentPassword: 'OldPassword@123',
          newPassword: 'NewSecurePassword@456',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('logout', () => {
    it('should revoke the specified session or all active sessions', async () => {
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.logout('usr-1', 'sess-1');
      expect(result.message).toBe('Logged out successfully');
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'sess-1', userId: 'usr-1' },
        data: { isRevoked: true },
      });
    });

    it('should revoke all active sessions if sessionId is omitted', async () => {
      mockPrisma.userSession.updateMany.mockResolvedValueOnce({ count: 2 });

      const result = await service.logout('usr-1');
      expect(result.message).toBe('Logged out successfully');
      expect(mockPrisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'usr-1' },
        data: { isRevoked: true },
      });
    });
  });
});
