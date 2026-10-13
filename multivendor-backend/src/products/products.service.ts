import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MovementType,
  Prisma,
  ProductStatus,
  ShopStatus,
  UserRole,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AdminUpdateProductDto,
  AdminUpdateProductStatusDto,
  QueryAdminProductsDto,
} from './dto/admin-product.dto.js';
import { AdjustStockDto, CreateProductDto, UpdateProductDto } from './dto/product.dto.js';
import {
  AddProductImageDto,
  CreateProductVariantDto,
  UpdateProductImageDto,
  UpdateProductVariantDto,
  UpdateVariantStatusDto,
} from './dto/variant-image.dto.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublished(query?: {
    categoryId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(50, Math.max(1, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {
      status: ProductStatus.PUBLISHED,
      shop: { status: ShopStatus.APPROVED },
    };

    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query?.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          shop: {
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
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByShopAndSlug(shopSlug: string, productSlug: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { slug: shopSlug },
    });

    if (!shop || shop.status !== ShopStatus.APPROVED) {
      throw new NotFoundException(`Shop '${shopSlug}' not found`);
    }

    const product = await this.prisma.product.findUnique({
      where: {
        shopId_slug: {
          shopId: shop.id,
          slug: productSlug,
        },
      },
      include: {
        category: true,
        shop: {
          select: { id: true, name: true, slug: true, logoUrl: true },
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
    });

    if (!product || product.status !== ProductStatus.PUBLISHED) {
      throw new NotFoundException('Product not found or not currently published');
    }

    return product;
  }

  async findPublishedById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        shop: {
          select: { id: true, name: true, slug: true, logoUrl: true, status: true },
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
    });

    if (
      !product ||
      product.status !== ProductStatus.PUBLISHED ||
      product.shop.status !== ShopStatus.APPROVED
    ) {
      throw new NotFoundException('Product not found or not currently published');
    }

    return product;
  }

  async findSellerProducts(userId: string) {
    const shop = await this.getSellerShop(userId);

    return this.prisma.product.findMany({
      where: { shopId: shop.id },
      include: {
        category: {
          select: { id: true, name: true },
        },
        images: {
          orderBy: { sortOrder: 'asc' },
        },
        variants: {
          include: {
            inventory: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateProductDto) {
    const shop = await this.getSellerShop(userId);

    if (shop.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Your shop must be approved by an administrator before creating products',
      );
    }

    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Selected category does not exist');
    }

    // Generate slug from title
    const baseSlug = dto.title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Validate that variants are non-empty and MRP >= price
    if (!dto.variants || dto.variants.length === 0) {
      throw new BadRequestException('At least one product variant must be provided');
    }

    for (const variant of dto.variants) {
      if (variant.price > variant.mrp) {
        throw new BadRequestException(
          `Selling price (₹${variant.price}) cannot exceed MRP (₹${variant.mrp}) for variant ${variant.sku}`,
        );
      }
    }

    // Atomic transaction creating Product, Images, Variants, and Initial Inventories
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          shopId: shop.id,
          categoryId: dto.categoryId,
          title: dto.title,
          slug,
          description: dto.description,
          brand: dto.brand,
          status: ProductStatus.PUBLISHED, // Approved sellers publish immediately
          hsnCode: dto.hsnCode,
          isReturnable: dto.isReturnable ?? true,
          returnWindowDays: dto.returnWindowDays ?? 7,
          metaTitle: dto.metaTitle,
          metaDescription: dto.metaDescription,
        },
      });

      // Create images if provided
      if (dto.images && dto.images.length > 0) {
        await tx.productImage.createMany({
          data: dto.images.map((img, idx) => ({
            productId: product.id,
            url: img.url,
            altText: img.altText ?? dto.title,
            sortOrder: img.sortOrder ?? idx,
            isThumbnail: img.isThumbnail ?? idx === 0,
          })),
        });
      }

      // Create variants with initial inventory and stock movement records
      for (const v of dto.variants) {
        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku: v.sku,
            title: v.title,
            mrp: v.mrp,
            price: v.price,
            attributes: v.attributes,
            weightGrams: v.weightGrams,
          },
        });

        const initialQty = v.initialStock ?? 0;
        const inventory = await tx.inventory.create({
          data: {
            variantId: variant.id,
            availableQuantity: initialQty,
            lowStockThreshold: v.lowStockThreshold ?? 5,
          },
        });

        if (initialQty > 0) {
          await tx.inventoryMovement.create({
            data: {
              inventoryId: inventory.id,
              movementType: MovementType.INITIAL_STOCK,
              quantity: initialQty,
              balanceAfter: initialQty,
              notes: 'Initial stock on product creation',
              createdById: userId,
            },
          });
        }
      }

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          images: true,
          variants: {
            include: { inventory: true },
          },
        },
      });
    });
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { shop: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.shop.sellerId !== userId) {
      throw new ForbiddenException('You can only edit products belonging to your shop');
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        brand: dto.brand,
        status: dto.status,
        hsnCode: dto.hsnCode,
        isReturnable: dto.isReturnable,
        returnWindowDays: dto.returnWindowDays,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
    });
  }

  async adjustStock(userId: string, dto: AdjustStockDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: {
        product: { include: { shop: true } },
        inventory: true,
      },
    });

    if (!variant || !variant.inventory) {
      throw new NotFoundException('Product variant or inventory not found');
    }

    if (variant.product.shop.sellerId !== userId) {
      throw new ForbiddenException('You can only modify stock for your own shop');
    }

    const currentQty = variant.inventory.availableQuantity;
    const newQty = currentQty + dto.quantity;

    if (newQty < 0) {
      throw new BadRequestException(
        `Cannot reduce stock by ${Math.abs(dto.quantity)}. Current available: ${currentQty}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedInventory = await tx.inventory.update({
        where: { id: variant.inventory!.id },
        data: { availableQuantity: newQty },
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryId: updatedInventory.id,
          movementType:
            dto.quantity >= 0 ? MovementType.RESTOCK : MovementType.MANUAL_CORRECTION,
          quantity: dto.quantity,
          balanceAfter: newQty,
          referenceId: dto.referenceId,
          notes: dto.notes,
          createdById: userId,
        },
      });

      return updatedInventory;
    });
  }

  private async getSellerShop(userId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { sellerId: userId },
    });

    if (!shop) {
      throw new ForbiddenException('No shop profile found for this seller account');
    }

    return shop;
  }

  // ===========================================================================
  // ADMIN PRODUCT MANAGEMENT APIS
  // ===========================================================================

  /**
   * 1. GET /api/v1/admin/products
   * List products across all sellers with pagination, newest-first sorting,
   * and filters for status, category, shop, seller, and search.
   */
  async getAdminProducts(query: QueryAdminProductsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.shopId) {
      where.shopId = query.shopId;
    }

    if (query.sellerId) {
      where.shop = { sellerId: query.sellerId };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          shop: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              sellerId: true,
              seller: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          variants: {
            include: {
              inventory: {
                select: {
                  id: true,
                  availableQuantity: true,
                  reservedQuantity: true,
                  lowStockThreshold: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      data: products,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * 2. GET /api/v1/admin/products/:id
   * Admin-only detailed view of a product across any seller.
   */
  async getAdminProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            sellerId: true,
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
        },
        images: {
          orderBy: { sortOrder: 'asc' },
        },
        variants: {
          include: {
            inventory: {
              include: {
                movements: {
                  take: 10,
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
          },
        },
        _count: {
          select: {
            wishlistItems: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    return product;
  }

  /**
   * 3. PATCH /api/v1/admin/products/:id
   * Allows administrators to update permitted product fields.
   * Does NOT allow arbitrary stock changes through ordinary product edits.
   */
  async updateAdminProduct(id: string, dto: AdminUpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException(`Category with ID "${dto.categoryId}" not found`);
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        brand: dto.brand,
        hsnCode: dto.hsnCode,
        isReturnable: dto.isReturnable,
        returnWindowDays: dto.returnWindowDays,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        shop: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });
  }

  /**
   * 4. PATCH /api/v1/admin/products/:id/status
   * Updates product status using ProductStatus enum.
   * If target status is PUBLISHED, checks seller shop approval and non-suspension.
   */
  async updateAdminProductStatus(id: string, dto: AdminUpdateProductStatusDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        shop: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    // Business rule: If publishing or reactivating, ensure seller shop is APPROVED
    if (dto.status === ProductStatus.PUBLISHED) {
      if (product.shop.status !== ShopStatus.APPROVED) {
        throw new BadRequestException(
          `Cannot publish product because the seller shop "${product.shop.name}" is not approved (current shop status: ${product.shop.status}).`,
        );
      }
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        status: dto.status,
      },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        shop: {
          select: { id: true, name: true, slug: true, status: true },
        },
      },
    });

    return {
      message: `Product status successfully updated to ${dto.status}`,
      product: updatedProduct,
    };
  }

  /**
   * 5. DELETE /api/v1/admin/products/:id
   * Reversible archival workflow:
   * Inspects foreign relationships (OrderItem, CheckoutItem, CartItem).
   * If references exist, permanent deletion would violate constraints or delete history;
   * instead, transitions the product to ARCHIVED status.
   * If completely unreferenced, permanently removes the product and associated variants/images.
   */
  async deleteAdminProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          select: {
            id: true,
            _count: {
              select: {
                orderItems: true,
                checkoutItems: true,
                cartItems: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    const hasOrderReferences = product.variants.some(
      (v) => v._count.orderItems > 0 || v._count.checkoutItems > 0 || v._count.cartItems > 0,
    );

    if (hasOrderReferences) {
      // Reversible archive workflow preserving order records
      const archived = await this.prisma.product.update({
        where: { id },
        data: { status: ProductStatus.ARCHIVED },
      });

      return {
        action: 'ARCHIVED',
        message:
          'Product has historical orders, checkouts, or cart items. The product has been archived rather than permanently deleted to preserve audit and transaction history.',
        product: archived,
      };
    }

    // Safe to permanently delete unreferenced product
    return this.prisma.$transaction(async (tx) => {
      // 1. Delete Wishlist items
      await tx.wishlistItem.deleteMany({
        where: { productId: id },
      });

      // 2. Delete inventory movements and inventory for each variant
      for (const variant of product.variants) {
        const inventory = await tx.inventory.findUnique({
          where: { variantId: variant.id },
        });
        if (inventory) {
          await tx.inventoryMovement.deleteMany({
            where: { inventoryId: inventory.id },
          });
          await tx.inventory.delete({
            where: { id: inventory.id },
          });
        }
      }

      // 3. Delete variants
      await tx.productVariant.deleteMany({
        where: { productId: id },
      });

      // 4. Delete product images
      await tx.productImage.deleteMany({
        where: { productId: id },
      });

      // 5. Delete product
      const deleted = await tx.product.delete({
        where: { id },
      });

      return {
        action: 'DELETED',
        message: 'Product and unreferenced variants were permanently deleted.',
        product: deleted,
      };
    });
  }

  // ===========================================================================
  // PRODUCT VARIANT MANAGEMENT
  // ===========================================================================

  /**
   * Helper to verify product access for seller or admin.
   */
  async verifyProductAccess(
    productId: string,
    user: { userId: string; role: string },
    options: { requireApprovedShop?: boolean } = {},
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { shop: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    if (user.role !== UserRole.ADMIN) {
      if (product.shop.sellerId !== user.userId) {
        throw new ForbiddenException(
          'You can only manage variants and images for products belonging to your shop',
        );
      }

      if (options.requireApprovedShop && product.shop.status !== ShopStatus.APPROVED) {
        throw new ForbiddenException(
          `Your shop must be approved before performing this operation (current status: ${product.shop.status})`,
        );
      }
    }

    return product;
  }

  /**
   * 1. Create a variant for a product.
   */
  async createVariant(
    productId: string,
    user: { userId: string; role: string },
    dto: CreateProductVariantDto,
  ) {
    await this.verifyProductAccess(productId, user, { requireApprovedShop: true });

    if (dto.price > dto.mrp) {
      throw new BadRequestException(
        `Selling price (₹${dto.price}) cannot exceed MRP (₹${dto.mrp}) for variant SKU "${dto.sku}"`,
      );
    }

    const existingSku = await this.prisma.productVariant.findUnique({
      where: { sku: dto.sku },
    });

    if (existingSku) {
      throw new ConflictException(`Variant with SKU "${dto.sku}" already exists`);
    }

    return this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: {
          productId,
          sku: dto.sku,
          title: dto.title,
          mrp: dto.mrp,
          price: dto.price,
          attributes: dto.attributes,
          weightGrams: dto.weightGrams,
          isActive: true,
        },
      });

      const initialQty = dto.initialStock ?? 0;
      const inventory = await tx.inventory.create({
        data: {
          variantId: variant.id,
          availableQuantity: initialQty,
          lowStockThreshold: dto.lowStockThreshold ?? 5,
        },
      });

      if (initialQty > 0) {
        await tx.inventoryMovement.create({
          data: {
            inventoryId: inventory.id,
            movementType: MovementType.INITIAL_STOCK,
            quantity: initialQty,
            balanceAfter: initialQty,
            notes: 'Initial stock on variant creation',
            createdById: user.userId,
          },
        });
      }

      return tx.productVariant.findUnique({
        where: { id: variant.id },
        include: { inventory: true },
      });
    });
  }

  /**
   * 2. List variants for a product.
   */
  async getProductVariants(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    return this.prisma.productVariant.findMany({
      where: { productId },
      include: {
        inventory: {
          select: {
            id: true,
            availableQuantity: true,
            reservedQuantity: true,
            lowStockThreshold: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 3. Update permitted variant attributes and SKU.
   * Does NOT allow stock modification here; stock is managed via adjustStock to track movements.
   */
  async updateVariant(
    variantId: string,
    user: { userId: string; role: string },
    dto: UpdateProductVariantDto,
  ) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { include: { shop: true } } },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID "${variantId}" not found`);
    }

    if (user.role !== UserRole.ADMIN) {
      if (variant.product.shop.sellerId !== user.userId) {
        throw new ForbiddenException(
          'You can only modify variants belonging to your shop',
        );
      }
    }

    const effectiveMrp = dto.mrp !== undefined ? dto.mrp : Number(variant.mrp);
    const effectivePrice = dto.price !== undefined ? dto.price : Number(variant.price);

    if (effectivePrice > effectiveMrp) {
      throw new BadRequestException(
        `Selling price (₹${effectivePrice}) cannot exceed MRP (₹${effectiveMrp})`,
      );
    }

    if (dto.sku && dto.sku !== variant.sku) {
      const existingSku = await this.prisma.productVariant.findUnique({
        where: { sku: dto.sku },
      });
      if (existingSku && existingSku.id !== variantId) {
        throw new ConflictException(`Variant with SKU "${dto.sku}" already exists`);
      }
    }

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        sku: dto.sku,
        title: dto.title,
        mrp: dto.mrp,
        price: dto.price,
        attributes: dto.attributes,
        weightGrams: dto.weightGrams,
      },
      include: {
        inventory: {
          select: {
            id: true,
            availableQuantity: true,
            reservedQuantity: true,
            lowStockThreshold: true,
          },
        },
      },
    });
  }

  /**
   * 4. Activate or deactivate a variant.
   */
  async updateVariantStatus(
    variantId: string,
    user: { userId: string; role: string },
    dto: UpdateVariantStatusDto,
  ) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { include: { shop: true } } },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID "${variantId}" not found`);
    }

    if (user.role !== UserRole.ADMIN) {
      if (variant.product.shop.sellerId !== user.userId) {
        throw new ForbiddenException(
          'You can only modify variants belonging to your shop',
        );
      }
    }

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isActive: dto.isActive },
    });

    return {
      message: `Variant ${dto.isActive ? 'activated' : 'deactivated'} successfully`,
      variant: updated,
    };
  }

  /**
   * 5. Delete a variant safely.
   */
  async deleteVariant(variantId: string, user: { userId: string; role: string }) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: { include: { shop: true } },
        inventory: true,
        _count: {
          select: {
            orderItems: true,
            checkoutItems: true,
            cartItems: true,
          },
        },
      },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID "${variantId}" not found`);
    }

    if (user.role !== UserRole.ADMIN) {
      if (variant.product.shop.sellerId !== user.userId) {
        throw new ForbiddenException(
          'You can only delete variants belonging to your shop',
        );
      }
    }

    const hasReferences =
      variant._count.orderItems > 0 ||
      variant._count.checkoutItems > 0 ||
      variant._count.cartItems > 0;

    if (hasReferences) {
      // Reversible deactivation to preserve historical order references
      const deactivated = await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { isActive: false },
      });

      return {
        action: 'DEACTIVATED',
        message:
          'Variant has historical orders, checkouts, or active cart items. The variant has been deactivated instead of permanently deleted to preserve transaction and snapshot records.',
        variant: deactivated,
      };
    }

    // Safe to permanently delete unreferenced variant
    return this.prisma.$transaction(async (tx) => {
      if (variant.inventory) {
        await tx.inventoryMovement.deleteMany({
          where: { inventoryId: variant.inventory.id },
        });
        await tx.inventory.delete({
          where: { id: variant.inventory.id },
        });
      }

      const deleted = await tx.productVariant.delete({
        where: { id: variantId },
      });

      return {
        action: 'DELETED',
        message: 'Variant and its inventory record were permanently deleted.',
        variant: deleted,
      };
    });
  }

  // ===========================================================================
  // PRODUCT IMAGE MANAGEMENT
  // ===========================================================================

  /**
   * 1. Add an image to a product.
   */
  async addProductImage(
    productId: string,
    user: { userId: string; role: string },
    dto: AddProductImageDto,
  ) {
    const product = await this.verifyProductAccess(productId, user);

    const count = await this.prisma.productImage.count({
      where: { productId },
    });

    const isThumbnail = dto.isThumbnail ?? count === 0;

    return this.prisma.$transaction(async (tx) => {
      // If setting this image as thumbnail, unset existing thumbnails
      if (isThumbnail) {
        await tx.productImage.updateMany({
          where: { productId, isThumbnail: true },
          data: { isThumbnail: false },
        });
      }

      return tx.productImage.create({
        data: {
          productId,
          url: dto.url,
          altText: dto.altText ?? product.title,
          sortOrder: dto.sortOrder ?? count,
          isThumbnail,
        },
      });
    });
  }

  /**
   * 2. List images for a product in display order.
   */
  async getProductImages(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${productId}" not found`);
    }

    return this.prisma.productImage.findMany({
      where: { productId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * 3. Update image metadata or display order.
   */
  async updateProductImage(
    imageId: string,
    user: { userId: string; role: string },
    dto: UpdateProductImageDto,
  ) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      include: { product: { include: { shop: true } } },
    });

    if (!image) {
      throw new NotFoundException(`Image with ID "${imageId}" not found`);
    }

    if (user.role !== UserRole.ADMIN) {
      if (image.product.shop.sellerId !== user.userId) {
        throw new ForbiddenException(
          'You can only modify images belonging to your shop',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isThumbnail === true) {
        await tx.productImage.updateMany({
          where: { productId: image.productId, isThumbnail: true },
          data: { isThumbnail: false },
        });
      }

      return tx.productImage.update({
        where: { id: imageId },
        data: {
          url: dto.url,
          altText: dto.altText,
          sortOrder: dto.sortOrder,
          isThumbnail: dto.isThumbnail,
        },
      });
    });
  }

  /**
   * 4. Remove an image safely.
   */
  async deleteProductImage(imageId: string, user: { userId: string; role: string }) {
    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
      include: { product: { include: { shop: true } } },
    });

    if (!image) {
      throw new NotFoundException(`Image with ID "${imageId}" not found`);
    }

    if (user.role !== UserRole.ADMIN) {
      if (image.product.shop.sellerId !== user.userId) {
        throw new ForbiddenException(
          'You can only delete images belonging to your shop',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.productImage.delete({
        where: { id: imageId },
      });

      // If the deleted image was the thumbnail, promote the first remaining image if any
      if (image.isThumbnail) {
        const nextImage = await tx.productImage.findFirst({
          where: { productId: image.productId },
          orderBy: { sortOrder: 'asc' },
        });
        if (nextImage) {
          await tx.productImage.update({
            where: { id: nextImage.id },
            data: { isThumbnail: true },
          });
        }
      }

      return {
        message: 'Product image deleted successfully',
      };
    });
  }
}
