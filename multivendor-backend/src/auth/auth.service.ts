import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { BrevoEmailService } from '../email/brevo-email.service.js';
import { UserRole, UserStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ResendOtpDto, SendOtpDto, VerifyOtpDto } from './dto/otp.dto.js';
import { ChangePasswordDto, UpdateProfileDto } from './dto/profile.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordDto, RefreshTokenDto, ResetPasswordDto, VerifyEmailDto } from './dto/token.dto.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
  private readonly MAX_OTP_ATTEMPTS = 5; // Max 5 verification attempts
  private readonly MAX_RESENDS_PER_HOUR = 5; // Max 5 resends per hour per email

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly brevoEmailService: BrevoEmailService,
  ) {}

  /**
   * Generates a cryptographically secure 6-digit numerical OTP.
   */
  private generateSecureOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Computes an HMAC-SHA256 hash of the OTP scoped to the email and secret.
   * Storing only this hash prevents precomputed rainbow-table lookups.
   */
  private hashOtp(email: string, otp: string): string {
    const secret =
      this.configService.get<string>('JWT_SECRET') ??
      this.configService.get<string>('JWT_ACCESS_SECRET') ??
      'bharatbazaar-secure-otp-hmac-salt';
    return crypto
      .createHmac('sha256', secret)
      .update(`${email.trim().toLowerCase()}:${otp.trim()}`)
      .digest('hex');
  }

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const normalizedPhone = dto.phone.trim();
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { phone: normalizedPhone },
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        throw new ConflictException('Email is already registered');
      }
      throw new ConflictException('Phone number is already registered');
    }

    const passwordHash = await argon2.hash(dto.password);
    const assignedRole = dto.role === UserRole.SELLER ? UserRole.SELLER : UserRole.CUSTOMER;

    // Generate cryptographically secure 6-digit OTP and legacy token
    const otp = this.generateSecureOtp();
    const otpHash = this.hashOtp(normalizedEmail, otp);
    const otpExpiresAt = new Date(Date.now() + this.OTP_EXPIRY_MS);

    const legacyToken = crypto.randomBytes(32).toString('hex');
    const legacyTokenHash = crypto.createHash('sha256').update(legacyToken).digest('hex');
    const legacyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user, shop, email verification token and email OTP in an atomic transaction
    const { user } = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          phone: normalizedPhone,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: assignedRole,
          status: UserStatus.PENDING_VERIFICATION,
          isEmailVerified: false,
        },
      });

      // If registered as SELLER, create the initial Shop record in PENDING_APPROVAL status
      if (assignedRole === UserRole.SELLER) {
        const baseSlug = `${dto.firstName}-${dto.lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`;
        await tx.shop.create({
          data: {
            sellerId: newUser.id,
            name: `${dto.firstName}'s Shop`,
            slug: uniqueSlug,
          },
        });
      }

      // Store secure hash of OTP with 5-minute expiry
      await tx.emailOtp.create({
        data: {
          userId: newUser.id,
          email: normalizedEmail,
          otpHash,
          expiresAt: otpExpiresAt,
          failedAttempts: 0,
          maxAttempts: this.MAX_OTP_ATTEMPTS,
          resendCount: 0,
          lastSentAt: new Date(),
        },
      });

      // Maintain legacy token for backward compatibility
      await tx.emailVerificationToken.create({
        data: {
          userId: newUser.id,
          tokenHash: legacyTokenHash,
          expiresAt: legacyExpiresAt,
        },
      });

      return { user: newUser };
    });

    // Send branded verification email via Brevo
    try {
      if (this.brevoEmailService.hasValidConfiguration()) {
        await this.brevoEmailService.sendOtpEmail({
          toEmail: user.email,
          recipientName: `${user.firstName} ${user.lastName}`,
          otp,
        });
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to deliver initial Brevo OTP email to ${user.email}: ${err?.message || err}`,
      );
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw err;
      }
    }

    return {
      message: 'Registration successful. A 6-digit verification code has been sent to your email.',
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone ?? null,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        isEmailVerified: Boolean(user.isEmailVerified),
        isPhoneVerified: Boolean(user.isPhoneVerified),
      },
      devVerificationToken:
        this.configService.get<string>('NODE_ENV') !== 'production' ? legacyToken : undefined,
      devOtp:
        this.configService.get<string>('NODE_ENV') !== 'production' ? otp : undefined,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      return {
        message:
          'If an account exists with that email address, a password reset link has been generated.',
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour validity

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return {
      message:
        'If an account exists with that email address, a password reset link has been generated.',
      devResetToken:
        this.configService.get<string>('NODE_ENV') !== 'production'
          ? rawToken
          : undefined,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    const resetRecord = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetRecord) {
      throw new NotFoundException('Invalid or expired password reset token');
    }

    if (resetRecord.usedAt) {
      throw new BadRequestException('Password reset token has already been used');
    }

    if (new Date() > resetRecord.expiresAt) {
      throw new BadRequestException('Password reset token has expired');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      // 1. Update user password
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash: newPasswordHash },
      });

      // 2. Mark reset token as used
      await tx.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      });

      // 3. Revoke all active sessions for security
      await tx.userSession.updateMany({
        where: { userId: resetRecord.userId, isRevoked: false },
        data: { isRevoked: true },
      });
    });

    return {
      message:
        'Password has been reset successfully. You can now log in with your new password.',
    };
  }

  /**
   * Request / Send registration OTP to an unverified email address.
   * Employs anti-enumeration protection and rate limiting.
   */
  async sendOtp(dto: SendOtpDto, ipAddress?: string) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Hourly rate limit check (max 5 resends per hour per email)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOtpCount = await this.prisma.emailOtp.count({
      where: {
        email: normalizedEmail,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtpCount >= this.MAX_RESENDS_PER_HOUR) {
      throw new HttpException(
        'Too many verification requests for this email address. Please wait an hour before requesting again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Resend cooldown check (60 seconds)
    const latestOtp = await this.prisma.emailOtp.findFirst({
      where: { email: normalizedEmail },
      orderBy: { createdAt: 'desc' },
    });

    if (latestOtp) {
      const elapsedMs = Date.now() - latestOtp.lastSentAt.getTime();
      if (elapsedMs < this.RESEND_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((this.RESEND_COOLDOWN_MS - elapsedMs) / 1000);
        throw new HttpException(
          `Please wait ${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'} before requesting a new code.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // 3. User verification state check (anti-enumeration: generic response if non-existent or already verified)
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || user.isEmailVerified) {
      return {
        message: 'If the email address is eligible for verification, a 6-digit code has been sent.',
        cooldownSeconds: 60,
      };
    }

    // 4. Generate new secure 6-digit OTP
    const otp = this.generateSecureOtp();
    const otpHash = this.hashOtp(normalizedEmail, otp);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MS);

    // 5. Atomic single-use transition: invalidate old OTPs and store new OTP
    await this.prisma.$transaction(async (tx) => {
      await tx.emailOtp.updateMany({
        where: { email: normalizedEmail, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.emailOtp.create({
        data: {
          userId: user.id,
          email: normalizedEmail,
          otpHash,
          expiresAt,
          failedAttempts: 0,
          maxAttempts: this.MAX_OTP_ATTEMPTS,
          resendCount: (latestOtp?.resendCount ?? 0) + 1,
          lastSentAt: new Date(),
          ipAddress,
        },
      });
    });

    // 6. Send transactional email via Brevo
    try {
      if (this.brevoEmailService.hasValidConfiguration()) {
        await this.brevoEmailService.sendOtpEmail({
          toEmail: user.email,
          recipientName: `${user.firstName} ${user.lastName}`,
          otp,
        });
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to deliver Brevo OTP email to ${user.email}: ${err?.message || err}`,
      );
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw err;
      }
    }

    return {
      message: 'A 6-digit verification code has been sent to your email address.',
      cooldownSeconds: 60,
      devOtp:
        this.configService.get<string>('NODE_ENV') !== 'production' ? otp : undefined,
    };
  }

  /**
   * Resends registration OTP respecting cooldown and rate limits.
   */
  async resendOtp(dto: ResendOtpDto, ipAddress?: string) {
    return this.sendOtp(dto, ipAddress);
  }

  /**
   * Verifies the 6-digit registration OTP.
   * Enforces 5-minute expiry, max 5 failed attempts, single-use invalidation,
   * and transactional account activation.
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const normalizedOtp = dto.otp.trim();

    // 1. Locate the latest unused OTP record for this email
    const otpRecord = await this.prisma.emailOtp.findFirst({
      where: {
        email: normalizedEmail,
        usedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: { user: true },
    });

    if (!otpRecord) {
      throw new BadRequestException(
        'Invalid or expired verification code. Please request a new code.',
      );
    }

    // 2. Check if attempts have been exhausted
    if (otpRecord.failedAttempts >= otpRecord.maxAttempts) {
      throw new BadRequestException(
        'Too many failed attempts. This verification code has been locked. Please request a new OTP.',
      );
    }

    // 3. Check if OTP has expired (5-minute window)
    if (new Date() > otpRecord.expiresAt) {
      throw new BadRequestException(
        'Verification code has expired. Please request a new OTP.',
      );
    }

    // 4. Verify OTP hash with constant-time equality comparison
    const computedHash = this.hashOtp(normalizedEmail, normalizedOtp);
    const hashBuffer = Buffer.from(computedHash, 'hex');
    const recordBuffer = Buffer.from(otpRecord.otpHash, 'hex');

    const isMatch =
      hashBuffer.length === recordBuffer.length &&
      crypto.timingSafeEqual(hashBuffer, recordBuffer);

    if (!isMatch) {
      const updated = await this.prisma.emailOtp.update({
        where: { id: otpRecord.id },
        data: { failedAttempts: { increment: 1 } },
      });

      const remainingAttempts = otpRecord.maxAttempts - updated.failedAttempts;
      if (remainingAttempts <= 0) {
        throw new BadRequestException(
          'Too many failed attempts. This verification code has been locked. Please request a new OTP.',
        );
      }

      throw new BadRequestException(
        `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`,
      );
    }

    // 5. Atomic activation in a Prisma transaction
    await this.prisma.$transaction(async (tx) => {
      // Mark this OTP record as used
      await tx.emailOtp.update({
        where: { id: otpRecord.id },
        data: { usedAt: new Date() },
      });

      // Invalidate any other active OTPs for this email
      await tx.emailOtp.updateMany({
        where: { email: normalizedEmail, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Activate user account and mark verified
      await tx.user.update({
        where: { email: normalizedEmail },
        data: {
          isEmailVerified: true,
          status: UserStatus.ACTIVE,
        },
      });

      // Also invalidate any legacy email verification tokens
      if (otpRecord.userId) {
        await tx.emailVerificationToken.updateMany({
          where: { userId: otpRecord.userId, usedAt: null },
          data: { usedAt: new Date() },
        });
      }
    });

    return {
      message: 'Email verified successfully. You can now log in.',
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');

    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new NotFoundException('Invalid or expired verification token');
    }

    if (tokenRecord.usedAt) {
      throw new BadRequestException('Verification token has already been used');
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new BadRequestException('Verification token has expired');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tokenRecord.userId },
        data: {
          isEmailVerified: true,
          status: UserStatus.ACTIVE,
        },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return {
      message: 'Email verified successfully. You can now log in.',
    };
  }

  async login(dto: LoginDto, meta?: { userAgent?: string; ipAddress?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { shop: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw new UnauthorizedException('Your account is inactive. Please contact support.');
    }

    return this.generateUserSession(user, meta);
  }

  async refreshToken(dto: RefreshTokenDto, meta?: { userAgent?: string; ipAddress?: string }) {
    const tokenHash = crypto.createHash('sha256').update(dto.refreshToken).digest('hex');

    const session = await this.prisma.userSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: { include: { shop: true } } },
    });

    if (!session || session.isRevoked || new Date() > session.expiresAt) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (
      session.user.status === UserStatus.SUSPENDED ||
      session.user.status === UserStatus.DEACTIVATED
    ) {
      throw new UnauthorizedException('Your account is inactive. Please contact support.');
    }

    // Revoke old session and issue a new one (Session Rotation)
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { isRevoked: true },
    });

    return this.generateUserSession(session.user, meta);
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: sessionId, userId },
        data: { isRevoked: true },
      });
    } else {
      await this.prisma.userSession.updateMany({
        where: { userId },
        data: { isRevoked: true },
      });
    }

    return { message: 'Logged out successfully' };
  }

  async getCurrentProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.phone) {
      const existingWithPhone = await this.prisma.user.findFirst({
        where: {
          phone: dto.phone,
          id: { not: userId },
        },
      });
      if (existingWithPhone) {
        throw new ConflictException('Phone number is already registered to another account');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName ? { firstName: dto.firstName } : {}),
        ...(dto.lastName ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: 'Profile updated successfully',
      user: updatedUser,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password does not match');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      // Revoke all active sessions to force re-login with new password
      await tx.userSession.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });
    });

    return {
      message: 'Password changed successfully. Please log in with your new password.',
    };
  }

  private async generateUserSession(
    user: any,
    meta?: { userAgent?: string; ipAddress?: string },
  ) {
    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent: meta?.userAgent,
        ipAddress: meta?.ipAddress,
        expiresAt: refreshExpiresAt,
      },
    });

    const jwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    };

    const accessToken = await this.jwtService.signAsync(jwtPayload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET') ?? 'default-secret-dev',
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRATION') ?? '15m') as any,
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone ?? null,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
        isEmailVerified: Boolean(user.isEmailVerified),
        isPhoneVerified: Boolean(user.isPhoneVerified),
        shop: user.shop
          ? {
              id: user.shop.id,
              name: user.shop.name,
              slug: user.shop.slug,
              status: user.shop.status,
            }
          : null,
      },
    };
  }
}
