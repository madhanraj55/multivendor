import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ShopStatus,
  UserRole,
  UserStatus,
  ProductStatus,
  OrderStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AdminUpdateUserRoleDto,
  AdminUpdateUserStatusDto,
  QueryAdminUsersDto,
} from './dto/user-admin.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. GET /api/v1/admin/users
   * Paginated listing of users, newest first, optional filtering by role and status.
   * Strips password hashes, raw tokens, and sensitive auth secrets.
   */
  async getAdminUsers(query: QueryAdminUsersDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (query.role) {
      where.role = query.role;
    }
    const searchParam = (query as any).search?.trim();
    if (searchParam) {
      where.OR = [
        { email: { contains: searchParam, mode: 'insensitive' } },
        { firstName: { contains: searchParam, mode: 'insensitive' } },
        { lastName: { contains: searchParam, mode: 'insensitive' } },
        { phone: { contains: searchParam, mode: 'insensitive' } },
      ];
    }
    if (query.status) {
      where.status = query.status;
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
          shop: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
      }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 2. GET /api/v1/admin/users/:id
   * Admin-only user details, including role, status, shop summary, address count, and order count.
   * Excludes password hashes and tokens.
   */
  async getAdminUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            gstin: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            orders: true,
            addresses: true,
            sessions: true,
          },
        },
        orders: {
          select: {
            id: true,
            orderNumber: true,
            totalAmount: true,
            status: true,
            createdAt: true,
          },
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      shop: user.shop,
      recentOrders: (user as any).orders || [],
      stats: {
        totalOrders: user._count.orders,
        totalAddresses: user._count.addresses,
        activeOrTotalSessions: user._count.sessions,
      },
    };
  }

  /**
   * 3. PATCH /api/v1/admin/users/:id/status
   * Updates account status.
   * Invariants:
   * - An administrator cannot change their own status (no self-suspension/deactivation).
   * - Cannot suspend or deactivate the last active administrator.
   * - When status is changed to SUSPENDED or DEACTIVATED, immediately revoke all active sessions.
   * - If an approved seller's account is SUSPENDED or DEACTIVATED, suspend their shop in the same transaction.
   * - Never deletes user, products, orders, or financial records.
   */
  async updateUserStatus(
    adminUserId: string,
    targetUserId: string,
    dto: AdminUpdateUserStatusDto,
  ) {
    if (adminUserId === targetUserId) {
      throw new BadRequestException('You cannot modify your own account status');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      include: { shop: true },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID "${targetUserId}" not found`);
    }

    const newStatus = dto.status;
    const isDeactivatingOrSuspending =
      newStatus === UserStatus.SUSPENDED || newStatus === UserStatus.DEACTIVATED;

    return await this.prisma.$transaction(async (tx) => {
      // If target user is currently an active ADMIN and being deactivated or suspended, protect the last active admin
      if (
        targetUser.role === UserRole.ADMIN &&
        targetUser.status === UserStatus.ACTIVE &&
        isDeactivatingOrSuspending
      ) {
        const otherActiveAdminsCount = await tx.user.count({
          where: {
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            id: { not: targetUserId },
          },
        });

        if (otherActiveAdminsCount === 0) {
          throw new BadRequestException(
            'Cannot suspend or deactivate the last active administrator',
          );
        }
      }

      // Update user status
      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: { status: newStatus },
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

      let revokedSessionsCount = 0;
      // Revoke sessions if suspended or deactivated
      if (isDeactivatingOrSuspending) {
        const revoked = await tx.userSession.updateMany({
          where: {
            userId: targetUserId,
            isRevoked: false,
          },
          data: {
            isRevoked: true,
          },
        });
        revokedSessionsCount = revoked.count;

        // If the user is a seller and has a shop, suspend their shop if it was APPROVED
        if (targetUser.shop && targetUser.shop.status === ShopStatus.APPROVED) {
          await tx.shop.update({
            where: { id: targetUser.shop.id },
            data: {
              status: ShopStatus.SUSPENDED,
              rejectionReason:
                dto.reason ??
                `Shop suspended automatically due to seller account ${newStatus.toLowerCase()}`,
            },
          });
        }
      }

      return {
        message: `User status successfully updated to ${newStatus}`,
        user: updatedUser,
        revokedSessions: revokedSessionsCount,
      };
    });
  }

  /**
   * 4. PATCH /api/v1/admin/users/:id/role
   * Updates user role.
   * Invariants:
   * - An administrator cannot change their own role (prevent self-demotion).
   * - Protect the last active administrator from demotion.
   * - Validates role change supported by UserRole enum.
   */
  async updateUserRole(
    adminUserId: string,
    targetUserId: string,
    dto: AdminUpdateUserRoleDto,
  ) {
    if (adminUserId === targetUserId) {
      throw new BadRequestException('You cannot modify your own role');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(`User with ID "${targetUserId}" not found`);
    }

    if (targetUser.role === dto.role) {
      throw new BadRequestException(`User already has the role "${dto.role}"`);
    }

    return await this.prisma.$transaction(async (tx) => {
      // If demoting an active ADMIN to SELLER or CUSTOMER, ensure there is at least one other active admin
      if (
        targetUser.role === UserRole.ADMIN &&
        targetUser.status === UserStatus.ACTIVE &&
        dto.role !== UserRole.ADMIN
      ) {
        const otherActiveAdminsCount = await tx.user.count({
          where: {
            role: UserRole.ADMIN,
            status: UserStatus.ACTIVE,
            id: { not: targetUserId },
          },
        });

        if (otherActiveAdminsCount === 0) {
          throw new BadRequestException(
            'Cannot demote the last active administrator',
          );
        }
      }

      const updatedUser = await tx.user.update({
        where: { id: targetUserId },
        data: { role: dto.role },
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
        message: `User role successfully updated to ${dto.role}`,
        user: updatedUser,
      };
    });
  }
  /**
   * 5. GET /api/v1/admin/dashboard/summary
   * Returns real aggregated metrics directly from PostgreSQL.
   */
  async getAdminDashboardSummary() {
    const [
      totalCustomers,
      totalSellers,
      totalAdmins,
      totalShops,
      pendingShops,
      approvedShops,
      suspendedShops,
      totalProducts,
      publishedProducts,
      totalOrders,
      revenueAggregation,
      recentOrders,
      pendingShopList,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      this.prisma.user.count({ where: { role: UserRole.SELLER } }),
      this.prisma.user.count({ where: { role: UserRole.ADMIN } }),
      this.prisma.shop.count(),
      this.prisma.shop.count({ where: { status: ShopStatus.PENDING_APPROVAL } }),
      this.prisma.shop.count({ where: { status: ShopStatus.APPROVED } }),
      this.prisma.shop.count({ where: { status: ShopStatus.SUSPENDED } }),
      this.prisma.product.count(),
      this.prisma.product.count({ where: { status: ProductStatus.PUBLISHED } }),
      this.prisma.order.count(),
      // Revenue and paid orders strictly require confirmed payment.
      // In the BharatBazaar state machine, orders begin in PENDING_PAYMENT.
      // Fulfillment statuses (CONFIRMED, PROCESSING, PARTIALLY_SHIPPED, SHIPPED, DELIVERED)
      // can only be entered after verified payment confirmation.
      this.prisma.order.aggregate({
        where: {
          status: {
            in: [
              OrderStatus.CONFIRMED,
              OrderStatus.PROCESSING,
              OrderStatus.PARTIALLY_SHIPPED,
              OrderStatus.SHIPPED,
              OrderStatus.DELIVERED,
            ],
          },
        },
        _sum: { totalAmount: true },
        _count: { id: true },
      }),
      this.prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          status: true,
          createdAt: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.shop.findMany({
        where: { status: ShopStatus.PENDING_APPROVAL },
        take: 5,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
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
      }),
    ]);

    const completedRevenue = Number(revenueAggregation._sum.totalAmount ?? 0);
    const paidOrdersCount = revenueAggregation._count.id;

    return {
      metrics: {
        totalCustomers,
        totalSellers,
        totalAdmins,
        totalShops,
        pendingShops,
        approvedShops,
        suspendedShops,
        totalProducts,
        publishedProducts,
        totalOrders,
        paidOrdersCount,
        completedRevenue,
      },
      recentOrders,
      pendingShops: pendingShopList,
    };
  }
}