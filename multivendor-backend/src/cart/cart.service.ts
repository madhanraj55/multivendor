import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AddToCartDto, UpdateCartItemDto } from './dto/cart.dto.js';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves or lazily creates a cart for the authenticated customer.
   * Recalculates line totals and cart subtotal strictly from trusted DB prices.
   */
  async getCart(userId: string) {
    const cart = await this.getOrCreateUserCart(userId);

    const cartWithDetails = await this.prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    shop: {
                      select: { id: true, name: true, slug: true, status: true },
                    },
                    images: {
                      where: { isThumbnail: true },
                      take: 1,
                    },
                  },
                },
                inventory: {
                  select: { availableQuantity: true },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!cartWithDetails) {
      throw new NotFoundException('Cart not found');
    }

    let subtotalAmount = 0;
    const formattedItems = cartWithDetails.items.map((item) => {
      const unitPrice = Number(item.variant.price);
      const mrp = Number(item.variant.mrp);
      const lineTotal = unitPrice * item.quantity;
      subtotalAmount += lineTotal;

      const isAvailable =
        item.variant.isActive &&
        item.variant.product.status === ProductStatus.PUBLISHED &&
        (item.variant.inventory?.availableQuantity ?? 0) >= item.quantity;

      return {
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice,
        mrp,
        lineTotal,
        isAvailable,
        availableStock: item.variant.inventory?.availableQuantity ?? 0,
        variant: {
          sku: item.variant.sku,
          title: item.variant.title,
          attributes: item.variant.attributes,
          isActive: item.variant.isActive,
        },
        product: {
          id: item.variant.product.id,
          title: item.variant.product.title,
          slug: item.variant.product.slug,
          status: item.variant.product.status,
          thumbnailUrl: item.variant.product.images[0]?.url ?? null,
        },
        shop: item.variant.product.shop,
      };
    });

    return {
      cartId: cartWithDetails.id,
      userId: cartWithDetails.userId,
      items: formattedItems,
      totalItems: formattedItems.reduce((acc, item) => acc + item.quantity, 0),
      subtotalAmount,
      currency: 'INR',
    };
  }

  /**
   * Adds a product variant to the customer's cart.
   * If already in cart, increments quantity.
   * Validates variant & product status and current available inventory.
   */
  async addToCart(userId: string, dto: AddToCartDto) {
    const variant = await this.validateVariantEligibility(dto.variantId);

    const availableStock = variant.inventory?.availableQuantity ?? 0;
    if (availableStock < dto.quantity) {
      throw new BadRequestException(
        `Requested quantity (${dto.quantity}) exceeds available stock (${availableStock})`,
      );
    }

    const cart = await this.getOrCreateUserCart(userId);

    // Atomically upsert or increment quantity
    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId: dto.variantId,
        },
      },
    });

    const newQuantity = existingItem
      ? existingItem.quantity + dto.quantity
      : dto.quantity;

    if (newQuantity > availableStock) {
      throw new BadRequestException(
        `Total requested quantity in cart (${newQuantity}) exceeds available stock (${availableStock})`,
      );
    }

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          variantId: dto.variantId,
          quantity: dto.quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  /**
   * Updates the quantity of a specific variant in the customer's cart.
   */
  async updateCartItem(userId: string, variantId: string, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreateUserCart(userId);

    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found in your cart');
    }

    const variant = await this.validateVariantEligibility(variantId);
    const availableStock = variant.inventory?.availableQuantity ?? 0;

    if (dto.quantity > availableStock) {
      throw new BadRequestException(
        `Requested quantity (${dto.quantity}) exceeds available stock (${availableStock})`,
      );
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: dto.quantity },
    });

    return this.getCart(userId);
  }

  /**
   * Removes an individual item from the customer's cart.
   */
  async removeCartItem(userId: string, variantId: string) {
    const cart = await this.getOrCreateUserCart(userId);

    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId: cart.id,
          variantId,
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found in your cart');
    }

    await this.prisma.cartItem.delete({
      where: { id: item.id },
    });

    return this.getCart(userId);
  }

  /**
   * Clears all items in the customer's cart.
   */
  async clearCart(userId: string) {
    const cart = await this.getOrCreateUserCart(userId);

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return {
      message: 'Cart cleared successfully',
      cartId: cart.id,
      items: [],
      totalItems: 0,
      subtotalAmount: 0,
    };
  }

  private async getOrCreateUserCart(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
      });
    }

    return cart;
  }

  private async validateVariantEligibility(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: {
          include: {
            shop: true,
          },
        },
        inventory: true,
      },
    });

    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }

    if (!variant.isActive) {
      throw new BadRequestException('This product variant is currently inactive');
    }

    if (variant.product.status !== ProductStatus.PUBLISHED) {
      throw new BadRequestException('This product is not available for purchase');
    }

    if (variant.product.shop.status !== 'APPROVED') {
      throw new BadRequestException('The vendor shop is currently not active');
    }

    return variant;
  }
}
