import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { UserRole, UserStatus } from '../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

describe('AuthService (Unit Tests)', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockBrevoEmailService: any;

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
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      emailOtp: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      shop: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return await cb(mockPrisma);
        }
        if (Array.isArray(cb)) {
          return Promise.all(cb);
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
        if (key === 'JWT_SECRET') return 'test-hmac-secret-for-otp';
        if (key === 'NODE_ENV') return 'test';
        return null;
      }),
    };

    mockBrevoEmailService = {
      hasValidConfiguration: jest.fn().mockReturnValue(true),
      validateConfiguration: jest.fn(),
      sendOtpEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-mock-123' }),
      generateOtpHtml: jest.fn().mockReturnValue('<html>mock</html>'),
      generateOtpText: jest.fn().mockReturnValue('mock text'),
    };

    service = new AuthService(
      mockPrisma as any,
      mockJwtService as any,
      mockConfigService as any,
      mockBrevoEmailService as any,
    );
  });

  describe('Registration & Brevo OTP Flow', () => {
    it('should register a customer, generate a 6-digit OTP, store its hash, and send Brevo email', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // No collision
      const mockCreatedUser = {
        id: 'usr-new-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: UserRole.CUSTOMER,
        status: UserStatus.PENDING_VERIFICATION,
        isEmailVerified: false,
      };
      mockPrisma.user.create.mockResolvedValueOnce(mockCreatedUser);
      mockPrisma.emailOtp.create.mockResolvedValueOnce({});
      mockPrisma.emailVerificationToken.create.mockResolvedValueOnce({});

      const result = await service.register({
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(result.message).toContain('Registration successful');
      expect(result.user.email).toBe('test@example.com');
      expect(result.devOtp).toBeDefined();
      expect(result.devOtp).toMatch(/^\d{6}$/);

      // Verify emailOtp was saved with hash and not plain text
      expect(mockPrisma.emailOtp.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com',
            otpHash: expect.any(String),
            failedAttempts: 0,
            maxAttempts: 5,
          }),
        }),
      );

      // Verify Brevo transactional email was dispatched
      expect(mockBrevoEmailService.sendOtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: 'test@example.com',
          otp: result.devOtp,
        }),
      );
    });

    it('should throw ConflictException if email is already registered', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'usr-dup',
        email: 'existing@example.com',
      });

      await expect(
        service.register({
          email: 'existing@example.com',
          password: 'Password123!',
          firstName: 'Duplicate',
          lastName: 'User',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.emailOtp.create).not.toHaveBeenCalled();
      expect(mockBrevoEmailService.sendOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('OTP Verification (verifyOtp)', () => {
    it('should successfully verify email when correct OTP is provided', async () => {
      const email = 'verify@example.com';
      const otp = '482915';
      const secret = 'test-hmac-secret-for-otp';
      const otpHash = crypto
        .createHmac('sha256', secret)
        .update(`${email}:${otp}`)
        .digest('hex');

      const mockOtpRecord = {
        id: 'otp-rec-1',
        userId: 'usr-123',
        email,
        otpHash,
        failedAttempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 300000), // 5 min in future
        usedAt: null,
      };

      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce(mockOtpRecord);
      mockPrisma.emailOtp.update.mockResolvedValue({});
      mockPrisma.emailOtp.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.verifyOtp({ email, otp });

      expect(result.message).toContain('Email verified successfully');
      expect(mockPrisma.emailOtp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'otp-rec-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email },
          data: expect.objectContaining({
            isEmailVerified: true,
            status: UserStatus.ACTIVE,
          }),
        }),
      );
    });

    it('should reject incorrect OTP and increment failed attempts', async () => {
      const email = 'verify@example.com';
      const correctOtp = '482915';
      const wrongOtp = '000000';
      const secret = 'test-hmac-secret-for-otp';
      const otpHash = crypto
        .createHmac('sha256', secret)
        .update(`${email}:${correctOtp}`)
        .digest('hex');

      const mockOtpRecord = {
        id: 'otp-rec-1',
        userId: 'usr-123',
        email,
        otpHash,
        failedAttempts: 1,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 300000),
        usedAt: null,
      };

      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce(mockOtpRecord);
      mockPrisma.emailOtp.update.mockResolvedValueOnce({ failedAttempts: 2 });

      await expect(service.verifyOtp({ email, otp: wrongOtp })).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.emailOtp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'otp-rec-1' },
          data: { failedAttempts: { increment: 1 } },
        }),
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should reject and lock verification when 5 failed attempts have been exhausted', async () => {
      const email = 'locked@example.com';
      const mockOtpRecord = {
        id: 'otp-rec-locked',
        userId: 'usr-123',
        email,
        otpHash: 'dummy-hash',
        failedAttempts: 5,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 300000),
        usedAt: null,
      };

      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce(mockOtpRecord);

      await expect(service.verifyOtp({ email, otp: '123456' })).rejects.toThrow(
        /locked/i,
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should reject expired OTP (> 5 minutes)', async () => {
      const email = 'expired@example.com';
      const mockOtpRecord = {
        id: 'otp-rec-exp',
        userId: 'usr-123',
        email,
        otpHash: 'dummy-hash',
        failedAttempts: 0,
        maxAttempts: 5,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        usedAt: null,
      };

      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce(mockOtpRecord);

      await expect(service.verifyOtp({ email, otp: '123456' })).rejects.toThrow(
        /expired/i,
      );
    });

    it('should reject reused OTP (already marked usedAt)', async () => {
      const email = 'reused@example.com';
      // Query filters where usedAt is null, so returning null simulates no active OTP found
      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce(null);

      await expect(service.verifyOtp({ email, otp: '123456' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Resend & Rate Limiting (sendOtp / resendOtp)', () => {
    it('should enforce 60-second cooldown before allowing resend', async () => {
      const email = 'cooldown@example.com';
      mockPrisma.emailOtp.count.mockResolvedValueOnce(1); // Within hourly limit
      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce({
        id: 'otp-recent',
        email,
        lastSentAt: new Date(Date.now() - 25000), // Only 25 seconds elapsed
      });

      await expect(service.resendOtp({ email })).rejects.toThrow(HttpException);
      expect(mockBrevoEmailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('should enforce max 5 requests per hour rate limit', async () => {
      const email = 'ratelimit@example.com';
      mockPrisma.emailOtp.count.mockResolvedValueOnce(5); // 5 already in the past hour

      await expect(service.sendOtp({ email })).rejects.toThrow(HttpException);
      expect(mockBrevoEmailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('should return anti-enumeration generic message if email is already verified', async () => {
      const email = 'verified@example.com';
      mockPrisma.emailOtp.count.mockResolvedValueOnce(0);
      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'usr-active',
        email,
        isEmailVerified: true,
      });

      const result = await service.sendOtp({ email });
      expect(result.message).toContain('If the email address is eligible');
      expect(mockBrevoEmailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('should return anti-enumeration generic message if user does not exist', async () => {
      const email = 'nonexistent@example.com';
      mockPrisma.emailOtp.count.mockResolvedValueOnce(0);
      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.sendOtp({ email });
      expect(result.message).toContain('If the email address is eligible');
      expect(mockBrevoEmailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('should successfully resend OTP if cooldown and rate limits are respected', async () => {
      const email = 'resend-ok@example.com';
      mockPrisma.emailOtp.count.mockResolvedValueOnce(1);
      mockPrisma.emailOtp.findFirst.mockResolvedValueOnce({
        id: 'otp-old',
        email,
        lastSentAt: new Date(Date.now() - 75000), // 75 seconds elapsed
        resendCount: 1,
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'usr-pending',
        email,
        firstName: 'Pending',
        lastName: 'User',
        isEmailVerified: false,
      });
      mockPrisma.emailOtp.updateMany.mockResolvedValueOnce({ count: 1 });
      mockPrisma.emailOtp.create.mockResolvedValueOnce({});

      const result = await service.resendOtp({ email });
      expect(result.message).toContain('A 6-digit verification code has been sent');
      expect(result.devOtp).toBeDefined();
      expect(mockBrevoEmailService.sendOtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          toEmail: email,
          otp: result.devOtp,
        }),
      );
    });
  });

  describe('Unverified User Login Protection', () => {
    it('should reject login with UnauthorizedException if user email is not verified', async () => {
      const passwordHash = await argon2.hash('ValidPassword123!');
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'usr-unverified',
        email: 'unverified@example.com',
        passwordHash,
        isEmailVerified: false,
        status: UserStatus.PENDING_VERIFICATION,
        shop: null,
      });

      await expect(
        service.login({
          email: 'unverified@example.com',
          password: 'ValidPassword123!',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.userSession.create).not.toHaveBeenCalled();
    });
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
