import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddToWishlistDto } from './dto/wishlist.dto.js';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves all wishlist items for the authenticated user with product details,
   * price range across active variants, thumbnail images, and stock availability.
   */
  async getWishlist(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            shop: {
              select: { id: true, name: true, slug: true, status: true },
            },
            category: {
              select: { id: true, name: true, slug: true },
            },
            images: {
              orderBy: { sortOrder: 'asc' },
            },
            variants: {
              where: { isActive: true },
              include: {
                inventory: {
                  select: { availableQuantity: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formattedItems = items.map((item) => {
      const activeVariants = item.product.variants;
      const prices = activeVariants.map((v) => Number(v.price));
      const mrps = activeVariants.map((v) => Number(v.mrp));

      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const minMrp = mrps.length > 0 ? Math.min(...mrps) : 0;
      const maxMrp = mrps.length > 0 ? Math.max(...mrps) : 0;

      const totalStock = activeVariants.reduce(
        (sum, v) => sum + (v.inventory?.availableQuantity ?? 0),
        0,
      );

      const isAvailable =
        item.product.status === ProductStatus.PUBLISHED &&
        item.product.shop.status === 'APPROVED' &&
        activeVariants.length > 0 &&
        totalStock > 0;

      const thumbnail =
        item.product.images.find((img) => img.isThumbnail)?.url ??
        item.product.images[0]?.url ??
        null;

      return {
        id: item.id,
        productId: item.productId,
        addedAt: item.createdAt,
        product: {
          id: item.product.id,
          title: item.product.title,
          slug: item.product.slug,
          brand: item.product.brand,
          status: item.product.status,
          thumbnailUrl: thumbnail,
          shop: item.product.shop,
          category: item.product.category,
          pricing: {
            minPrice,
            maxPrice,
            minMrp,
            maxMrp,
            currency: 'INR',
          },
          availability: {
            isInStock: totalStock > 0,
            totalAvailableStock: totalStock,
            isAvailableForPurchase: isAvailable,
          },
          variantCount: activeVariants.length,
        },
      };
    });

    return {
      userId,
      totalItems: formattedItems.length,
      items: formattedItems,
    };
  }

  /**
   * Adds a product to the authenticated user's wishlist.
   * If already present, gracefully returns the wishlist without duplicate rows or errors.
   */
  async addToWishlist(userId: string, dto: AddToWishlistDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: {
        shop: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException('Only published products can be added to wishlist');
    }

    if (product.shop.status !== 'APPROVED') {
      throw new BadRequestException('Vendor shop is not currently active');
    }

    // Idempotent upsert to handle duplicate requests cleanly
    await this.prisma.wishlistItem.upsert({
      where: {
        userId_productId: {
          userId,
          productId: dto.productId,
        },
      },
      create: {
        userId,
        productId: dto.productId,
      },
      update: {}, // No modification if already exists
    });

    return this.getWishlist(userId);
  }

  /**
   * Removes a single product from the authenticated user's wishlist.
   */
  async removeFromWishlist(userId: string, productId: string) {
    const existing = await this.prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Product is not in your wishlist');
    }

    await this.prisma.wishlistItem.delete({
      where: {
        userId_productId: {
          userId,
          productId,
        },
      },
    });

    return this.getWishlist(userId);
  }

  /**
   * Clears all products from the authenticated user's wishlist.
   */
  async clearWishlist(userId: string) {
    await this.prisma.wishlistItem.deleteMany({
      where: { userId },
    });

    return {
      message: 'Wishlist cleared successfully',
      userId,
      totalItems: 0,
      items: [],
    };
  }
}
