import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShopStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AdminUpdateShopStatusDto,
  CreateShopApplicationDto,
  QueryShopsDto,
  UpdateShopDetailsDto,
} from './dto/shop.dto.js';

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // TASK 1: SELLER SHOP APIS
  // ---------------------------------------------------------------------------

  /**
   * Retrieves the authenticated seller's shop profile and application status.
   */
  async getSellerShop(userId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { sellerId: userId },
      include: {
        pickupAddress: true,
      },
    });

    if (!shop) {
      throw new NotFoundException(
        'No shop application found for this seller account. Please submit a shop application.',
      );
    }

    return this.formatShopResponse(shop);
  }

  /**
   * Creates a new shop application for the authenticated seller.
   * Business Rules:
   * 1. 1 shop per seller account (enforced by DB unique constraint on sellerId).
   * 2. Status defaults strictly to PENDING_APPROVAL. Sellers cannot approve themselves.
   * 3. Slugs are automatically generated from shop name and checked for uniqueness.
   * 4. Validates pickup address belongs to the seller if specified.
   * 5. Checks GSTIN uniqueness if provided.
   */
  async createShopApplication(userId: string, dto: CreateShopApplicationDto) {
    const existing = await this.prisma.shop.findUnique({
      where: { sellerId: userId },
    });

    if (existing) {
      throw new ConflictException(
        `A shop application already exists for your seller account with status "${existing.status}". Multiple shops per seller are not permitted.`,
      );
    }

    if (dto.pickupAddressId) {
      const address = await this.prisma.address.findUnique({
        where: { id: dto.pickupAddressId },
      });
      if (!address || address.userId !== userId) {
        throw new BadRequestException('Selected pickup address not found or not owned by you');
      }
    }

    if (dto.gstin) {
      const gstinConflict = await this.prisma.shop.findUnique({
        where: { gstin: dto.gstin },
      });
      if (gstinConflict) {
        throw new ConflictException('This GSTIN is already registered to another shop');
      }
    }

    // Generate unique slug
    const baseSlug = dto.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = baseSlug;
    let count = 1;
    while (await this.prisma.shop.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${count++}`;
    }

    const createdShop = await this.prisma.shop.create({
      data: {
        sellerId: userId,
        name: dto.name,
        slug,
        description: dto.description ?? null,
        gstin: dto.gstin ?? null,
        pan: dto.pan ?? null,
        fssaiNumber: dto.fssaiNumber ?? null,
        pickupAddressId: dto.pickupAddressId ?? null,
        logoUrl: dto.logoUrl ?? null,
        bannerUrl: dto.bannerUrl ?? null,
        status: ShopStatus.PENDING_APPROVAL,
      },
      include: {
        pickupAddress: true,
      },
    });

    return {
      message: 'Shop application submitted successfully. Awaiting administrator review.',
      shop: this.formatShopResponse(createdShop),
    };
  }

  /**
   * Updates permitted shop details for the authenticated seller.
   * Prevents modifying approval status or slug directly.
   * If a rejected shop is updated, sets status back to PENDING_APPROVAL for re-review.
   */
  async updateSellerShop(userId: string, dto: UpdateShopDetailsDto) {
    const shop = await this.prisma.shop.findUnique({
      where: { sellerId: userId },
    });

    if (!shop) {
      throw new NotFoundException('No shop found for this seller account');
    }

    if (shop.status === ShopStatus.SUSPENDED) {
      throw new ForbiddenException(
        'Your shop has been suspended by an administrator. Updates are not permitted.',
      );
    }

    if (dto.pickupAddressId) {
      const address = await this.prisma.address.findUnique({
        where: { id: dto.pickupAddressId },
      });
      if (!address || address.userId !== userId) {
        throw new BadRequestException('Selected pickup address not found or not owned by you');
      }
    }

    if (dto.gstin && dto.gstin !== shop.gstin) {
      const gstinConflict = await this.prisma.shop.findUnique({
        where: { gstin: dto.gstin },
      });
      if (gstinConflict && gstinConflict.id !== shop.id) {
        throw new ConflictException('This GSTIN is already registered to another shop');
      }
    }

    // If shop was previously REJECTED, updating details re-submits for review
    const shouldReapply = shop.status === ShopStatus.REJECTED;

    const updatedShop = await this.prisma.shop.update({
      where: { id: shop.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.gstin !== undefined ? { gstin: dto.gstin } : {}),
        ...(dto.pan !== undefined ? { pan: dto.pan } : {}),
        ...(dto.fssaiNumber !== undefined ? { fssaiNumber: dto.fssaiNumber } : {}),
        ...(dto.pickupAddressId !== undefined ? { pickupAddressId: dto.pickupAddressId } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
        ...(dto.bannerUrl !== undefined ? { bannerUrl: dto.bannerUrl } : {}),
        ...(shouldReapply
          ? {
              status: ShopStatus.PENDING_APPROVAL,
              rejectionReason: null,
            }
          : {}),
      },
      include: {
        pickupAddress: true,
      },
    });

    return {
      message: shouldReapply
        ? 'Shop details updated and re-submitted for administrator approval.'
        : 'Shop details updated successfully.',
      shop: this.formatShopResponse(updatedShop),
    };
  }

  // ---------------------------------------------------------------------------
  // TASK 2: ADMIN SHOP APPROVAL APIS
  // ---------------------------------------------------------------------------

  /**
   * Lists pending shop applications for administrative review.
   */
  async getPendingShops(query: QueryShopsDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const skip = (page - 1) * limit;

    const statusFilter = query.status ?? ShopStatus.PENDING_APPROVAL;

    const [total, shops] = await Promise.all([
      this.prisma.shop.count({
        where: { status: statusFilter },
      }),
      this.prisma.shop.findMany({
        where: { status: statusFilter },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          seller: {
            select: {
              id: true,
              email: true,
              fullName: true,
              phone: true,
              isEmailVerified: true,
            },
          },
          pickupAddress: true,
          documents: true,
        },
      }),
    ]);

    return {
      data: shops.map((s) => ({
        ...this.formatShopResponse(s),
        seller: s.seller,
        documentsCount: s.documents.length,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single shop application details for administrative review.
   */
  async getShopByIdForAdmin(shopId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: {
        seller: {
          select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            isEmailVerified: true,
            createdAt: true,
          },
        },
        pickupAddress: true,
        approvedBy: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        documents: true,
        bankAccount: {
          select: {
            id: true,
            bankName: true,
            accountHolderName: true,
            ifscCode: true,
            isVerified: true,
            // Mask account number for security: show only last 4 digits
            accountNumber: true,
          },
        },
      },
    });

    if (!shop) {
      throw new NotFoundException(`Shop with ID "${shopId}" not found`);
    }

    const maskedBankAccount = shop.bankAccount
      ? {
          ...shop.bankAccount,
          accountNumber: shop.bankAccount.accountNumber
            ? `••••••••${shop.bankAccount.accountNumber.slice(-4)}`
            : null,
        }
      : null;

    return {
      ...this.formatShopResponse(shop),
      seller: shop.seller,
      approvedBy: shop.approvedBy,
      documents: shop.documents,
      bankAccount: maskedBankAccount,
    };
  }

  /**
   * Approves, rejects, or suspends a shop application.
   * Records reviewer (admin user ID) and approvedAt timestamp upon APPROVAL.
   * Records rejectionReason upon REJECTION.
   */
  async updateShopStatusByAdmin(
    adminUserId: string,
    shopId: string,
    dto: AdminUpdateShopStatusDto,
  ) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
    });

    if (!shop) {
      throw new NotFoundException(`Shop with ID "${shopId}" not found`);
    }

    const targetStatus = dto.status;

    // Validate transition
    if (targetStatus === ShopStatus.APPROVED) {
      if (shop.status === ShopStatus.APPROVED) {
        throw new BadRequestException('Shop is already approved.');
      }
    } else if (targetStatus === ShopStatus.REJECTED) {
      if (shop.status === ShopStatus.REJECTED) {
        throw new BadRequestException('Shop is already rejected.');
      }
      if (!dto.reason) {
        throw new BadRequestException('A rejection reason is required when rejecting a shop application.');
      }
    }

    const updatedShop = await this.prisma.shop.update({
      where: { id: shopId },
      data: {
        status: targetStatus,
        ...(targetStatus === ShopStatus.APPROVED
          ? {
              approvedAt: new Date(),
              approvedById: adminUserId,
              rejectionReason: null,
            }
          : {}),
        ...(targetStatus === ShopStatus.REJECTED
          ? {
              rejectionReason: dto.reason ?? 'Application did not meet requirements',
              approvedAt: null,
              approvedById: null,
            }
          : {}),
        ...(targetStatus === ShopStatus.SUSPENDED
          ? {
              rejectionReason: dto.reason ?? 'Shop suspended by administrator',
            }
          : {}),
      },
      include: {
        pickupAddress: true,
      },
    });

    return {
      message: `Shop "${updatedShop.name}" status updated to ${targetStatus}`,
      shop: this.formatShopResponse(updatedShop),
    };
  }

  private formatShopResponse(shop: any) {
    return {
      id: shop.id,
      sellerId: shop.sellerId,
      name: shop.name,
      slug: shop.slug,
      description: shop.description,
      logoUrl: shop.logoUrl,
      bannerUrl: shop.bannerUrl,
      status: shop.status,
      rejectionReason: shop.rejectionReason,
      approvedAt: shop.approvedAt,
      approvedById: shop.approvedById,
      gstin: shop.gstin,
      pan: shop.pan,
      fssaiNumber: shop.fssaiNumber,
      pickupAddress: shop.pickupAddress ?? null,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
    };
  }
}
