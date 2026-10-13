import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ProductStatus,
  ShopStatus,
  UserRole,
} from '../generated/prisma/client.js';
import { ProductsService } from './products.service.js';

describe('ProductsService (Admin & Product Management Unit Tests)', () => {
  let service: ProductsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      product: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        create: jest.fn(),
      },
      category: {
        findUnique: jest.fn(),
      },
      shop: {
        findUnique: jest.fn(),
      },
      inventory: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      inventoryMovement: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      productVariant: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      productImage: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      wishlistItem: {
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return await cb(mockPrisma);
        }
        return cb;
      }),
    };

    service = new ProductsService(mockPrisma as any);
  });

  // ===========================================================================
  // 1. GET /api/v1/admin/products (Listing, Pagination, Filtering, Stock Info)
  // ===========================================================================
  describe('getAdminProducts', () => {
    it('should return paginated products across all sellers ordered newest first', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          title: 'Handcrafted Wooden Table',
          slug: 'handcrafted-wooden-table',
          status: ProductStatus.PUBLISHED,
          category: { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
          shop: {
            id: 'shop-1',
            name: 'Woodworks Co',
            slug: 'woodworks-co',
            status: ShopStatus.APPROVED,
            sellerId: 'seller-1',
            seller: {
              id: 'seller-1',
              firstName: 'John',
              lastName: 'Carpenter',
              email: 'john@woodworks.com',
            },
          },
          images: [{ id: 'img-1', url: 'https://example.com/table.jpg', sortOrder: 0 }],
          variants: [
            {
              id: 'var-1',
              sku: 'WOD-TBL-001',
              title: 'Standard',
              price: '4999.00',
              mrp: '5999.00',
              inventory: {
                id: 'inv-1',
                availableQuantity: 15,
                reservedQuantity: 2,
                lowStockThreshold: 5,
              },
            },
          ],
        },
      ];

      mockPrisma.product.count.mockResolvedValueOnce(1);
      mockPrisma.product.findMany.mockResolvedValueOnce(mockProducts);

      const result = await service.getAdminProducts({ page: 1, limit: 10 });

      expect(mockPrisma.product.count).toHaveBeenCalledWith({ where: {} });
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
        where: {},
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: expect.objectContaining({
          category: expect.any(Object),
          shop: expect.any(Object),
          variants: expect.any(Object),
        }),
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].variants[0].inventory.availableQuantity).toBe(15);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('should filter by status, categoryId, shopId, sellerId, and search keyword', async () => {
      mockPrisma.product.count.mockResolvedValueOnce(0);
      mockPrisma.product.findMany.mockResolvedValueOnce([]);

      await service.getAdminProducts({
        page: 2,
        limit: 5,
        status: ProductStatus.INACTIVE,
        categoryId: 'cat-10',
        shopId: 'shop-20',
        sellerId: 'seller-30',
        search: 'table',
      });

      const expectedWhere = {
        status: ProductStatus.INACTIVE,
        categoryId: 'cat-10',
        shopId: 'shop-20',
        shop: { sellerId: 'seller-30' },
        OR: [
          { title: { contains: 'table', mode: 'insensitive' } },
          { description: { contains: 'table', mode: 'insensitive' } },
          { brand: { contains: 'table', mode: 'insensitive' } },
          { slug: { contains: 'table', mode: 'insensitive' } },
        ],
      };

      expect(mockPrisma.product.count).toHaveBeenCalledWith({ where: expectedWhere });
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith({
        where: expectedWhere,
        skip: 5,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: expect.any(Object),
      });
    });
  });

  // ===========================================================================
  // 2. GET /api/v1/admin/products/:id (Detailed View)
  // ===========================================================================
  describe('getAdminProductById', () => {
    it('should return full details with variants, inventory, and seller info', async () => {
      const mockProduct = {
        id: 'prod-100',
        title: 'Ceramic Mug',
        category: { id: 'cat-1', name: 'Kitchenware' },
        shop: {
          id: 'shop-1',
          name: 'Clay Arts',
          seller: { id: 'seller-1', email: 'clay@example.com' },
        },
        variants: [
          {
            id: 'var-1',
            inventory: {
              movements: [{ id: 'mov-1', quantity: 20 }],
            },
          },
        ],
      };

      mockPrisma.product.findUnique.mockResolvedValueOnce(mockProduct);

      const result = await service.getAdminProductById('prod-100');

      expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'prod-100' },
        include: expect.objectContaining({
          category: true,
          shop: expect.any(Object),
          variants: expect.any(Object),
        }),
      });

      expect(result.id).toBe('prod-100');
    });

    it('should throw NotFoundException if product is not found', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);

      await expect(service.getAdminProductById('prod-404')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ===========================================================================
  // 3. PATCH /api/v1/admin/products/:id (Field Updates & Invariants)
  // ===========================================================================
  describe('updateAdminProduct', () => {
    it('should update permitted fields and reject if category does not exist', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 'prod-1' });
      mockPrisma.category.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateAdminProduct('prod-1', { categoryId: 'cat-invalid' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update permitted fields successfully without changing stock', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 'prod-1' });
      mockPrisma.category.findUnique.mockResolvedValueOnce({ id: 'cat-2' });
      mockPrisma.product.update.mockResolvedValueOnce({
        id: 'prod-1',
        title: 'Updated Table Title',
        brand: 'Artisan Wood',
      });

      const result = await service.updateAdminProduct('prod-1', {
        categoryId: 'cat-2',
        title: 'Updated Table Title',
        brand: 'Artisan Wood',
      });

      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: {
          categoryId: 'cat-2',
          title: 'Updated Table Title',
          description: undefined,
          brand: 'Artisan Wood',
          hsnCode: undefined,
          isReturnable: undefined,
          returnWindowDays: undefined,
          metaTitle: undefined,
          metaDescription: undefined,
        },
        include: expect.any(Object),
      });

      expect(result.title).toBe('Updated Table Title');
    });
  });

  // ===========================================================================
  // 4. PATCH /api/v1/admin/products/:id/status (Transitions & Shop Eligibility)
  // ===========================================================================
  describe('updateAdminProductStatus', () => {
    it('should throw BadRequestException when publishing if seller shop is not APPROVED', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: {
          id: 'shop-1',
          name: 'Pending Shop',
          status: ShopStatus.PENDING_APPROVAL,
        },
      });

      await expect(
        service.updateAdminProductStatus('prod-1', {
          status: ProductStatus.PUBLISHED,
        }),
      ).rejects.toThrow(
        'Cannot publish product because the seller shop "Pending Shop" is not approved (current shop status: PENDING_APPROVAL).',
      );
    });

    it('should throw BadRequestException when publishing if seller shop is SUSPENDED', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: {
          id: 'shop-1',
          name: 'Suspended Shop',
          status: ShopStatus.SUSPENDED,
        },
      });

      await expect(
        service.updateAdminProductStatus('prod-1', {
          status: ProductStatus.PUBLISHED,
        }),
      ).rejects.toThrow(
        'Cannot publish product because the seller shop "Suspended Shop" is not approved (current shop status: SUSPENDED).',
      );
    });

    it('should successfully publish product if seller shop is APPROVED', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: {
          id: 'shop-1',
          name: 'Verified Shop',
          status: ShopStatus.APPROVED,
        },
      });

      mockPrisma.product.update.mockResolvedValueOnce({
        id: 'prod-1',
        status: ProductStatus.PUBLISHED,
      });

      const result = await service.updateAdminProductStatus('prod-1', {
        status: ProductStatus.PUBLISHED,
      });

      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { status: ProductStatus.PUBLISHED },
        include: expect.any(Object),
      });

      expect(result.message).toBe('Product status successfully updated to PUBLISHED');
    });

    it('should successfully deactivate or archive an active product', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: {
          id: 'shop-1',
          name: 'Verified Shop',
          status: ShopStatus.APPROVED,
        },
      });

      mockPrisma.product.update.mockResolvedValueOnce({
        id: 'prod-1',
        status: ProductStatus.INACTIVE,
      });

      const result = await service.updateAdminProductStatus('prod-1', {
        status: ProductStatus.INACTIVE,
      });

      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-1' },
        data: { status: ProductStatus.INACTIVE },
        include: expect.any(Object),
      });

      expect(result.message).toBe('Product status successfully updated to INACTIVE');
    });
  });

  // ===========================================================================
  // 5. DELETE /api/v1/admin/products/:id (Reversible Archive vs Permanent Delete)
  // ===========================================================================
  describe('deleteAdminProduct', () => {
    it('should archive rather than delete when order, checkout, or cart items exist', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-historical',
        variants: [
          {
            id: 'var-1',
            _count: {
              orderItems: 3,
              checkoutItems: 1,
              cartItems: 0,
            },
          },
        ],
      });

      mockPrisma.product.update.mockResolvedValueOnce({
        id: 'prod-historical',
        status: ProductStatus.ARCHIVED,
      });

      const result = await service.deleteAdminProduct('prod-historical');

      expect(result.action).toBe('ARCHIVED');
      expect(mockPrisma.product.update).toHaveBeenCalledWith({
        where: { id: 'prod-historical' },
        data: { status: ProductStatus.ARCHIVED },
      });
      expect(mockPrisma.product.delete).not.toHaveBeenCalled();
    });

    it('should permanently delete when product has zero orders, checkouts, or cart references', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-unreferenced',
        variants: [
          {
            id: 'var-2',
            _count: {
              orderItems: 0,
              checkoutItems: 0,
              cartItems: 0,
            },
          },
        ],
      });

      mockPrisma.inventory.findUnique.mockResolvedValueOnce({
        id: 'inv-2',
      });
      mockPrisma.product.delete.mockResolvedValueOnce({
        id: 'prod-unreferenced',
      });

      const result = await service.deleteAdminProduct('prod-unreferenced');

      expect(result.action).toBe('DELETED');
      expect(mockPrisma.wishlistItem.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'prod-unreferenced' },
      });
      expect(mockPrisma.inventoryMovement.deleteMany).toHaveBeenCalledWith({
        where: { inventoryId: 'inv-2' },
      });
      expect(mockPrisma.inventory.delete).toHaveBeenCalledWith({
        where: { id: 'inv-2' },
      });
      expect(mockPrisma.productVariant.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'prod-unreferenced' },
      });
      expect(mockPrisma.productImage.deleteMany).toHaveBeenCalledWith({
        where: { productId: 'prod-unreferenced' },
      });
      expect(mockPrisma.product.delete).toHaveBeenCalledWith({
        where: { id: 'prod-unreferenced' },
      });
    });
  });

  // ===========================================================================
  // 6. SELLER OWNERSHIP BOUNDARIES (Existing seller workflows remain secure)
  // ===========================================================================
  describe('Seller ownership boundaries', () => {
    it('should prevent seller from updating products owned by another seller', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: { sellerId: 'seller-A' },
      });

      await expect(
        service.update('seller-B', 'prod-1', { title: 'Hacked Title' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent seller from adjusting stock of a variant owned by another seller', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValueOnce({
        id: 'var-1',
        inventory: { id: 'inv-1', availableQuantity: 10 },
        product: {
          shop: { sellerId: 'seller-A' },
        },
      });

      await expect(
        service.adjustStock('seller-B', { variantId: 'var-1', quantity: 5 }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ===========================================================================
  // 7. PRODUCT VARIANT MANAGEMENT TESTS
  // ===========================================================================
  describe('Product Variant Management', () => {
    it('should create a variant for seller with initial stock movement', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: { sellerId: 'seller-1', status: ShopStatus.APPROVED },
      });
      mockPrisma.productVariant.findUnique.mockResolvedValueOnce(null); // No SKU conflict
      mockPrisma.productVariant.create.mockResolvedValueOnce({
        id: 'var-new',
        sku: 'SKU-NEW-1',
      });
      mockPrisma.inventory.create.mockResolvedValueOnce({
        id: 'inv-new',
      });

      await service.createVariant(
        'prod-1',
        { userId: 'seller-1', role: UserRole.SELLER },
        {
          sku: 'SKU-NEW-1',
          title: 'Large Red',
          price: 500,
          mrp: 600,
          attributes: { size: 'L', color: 'Red' },
          initialStock: 10,
        },
      );

      expect(mockPrisma.productVariant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          sku: 'SKU-NEW-1',
          price: 500,
          mrp: 600,
          isActive: true,
        }),
      });
      expect(mockPrisma.inventory.create).toHaveBeenCalledWith({
        data: {
          variantId: 'var-new',
          availableQuantity: 10,
          lowStockThreshold: 5,
        },
      });
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          quantity: 10,
          movementType: 'INITIAL_STOCK',
        }),
      });
    });

    it('should prevent seller from creating variant if shop is not APPROVED', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: { sellerId: 'seller-1', status: ShopStatus.PENDING_APPROVAL },
      });

      await expect(
        service.createVariant(
          'prod-1',
          { userId: 'seller-1', role: UserRole.SELLER },
          {
            sku: 'SKU-NEW-2',
            title: 'Large Blue',
            price: 500,
            mrp: 600,
            attributes: {},
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to create variant even if shop is pending or not owned', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: { sellerId: 'seller-other', status: ShopStatus.PENDING_APPROVAL },
      });
      mockPrisma.productVariant.findUnique.mockResolvedValueOnce(null);
      mockPrisma.productVariant.create.mockResolvedValueOnce({ id: 'var-admin' });
      mockPrisma.inventory.create.mockResolvedValueOnce({ id: 'inv-admin' });

      await service.createVariant(
        'prod-1',
        { userId: 'admin-1', role: UserRole.ADMIN },
        {
          sku: 'SKU-ADMIN-1',
          title: 'Special Edition',
          price: 1000,
          mrp: 1200,
          attributes: {},
        },
      );

      expect(mockPrisma.productVariant.create).toHaveBeenCalled();
    });

    it('should reject variant creation when price exceeds MRP', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: { sellerId: 'seller-1', status: ShopStatus.APPROVED },
      });

      await expect(
        service.createVariant(
          'prod-1',
          { userId: 'seller-1', role: UserRole.SELLER },
          {
            sku: 'SKU-INVALID-PRICE',
            title: 'Overpriced',
            price: 1500,
            mrp: 1000,
            attributes: {},
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate SKU on creation', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: { sellerId: 'seller-1', status: ShopStatus.APPROVED },
      });
      mockPrisma.productVariant.findUnique.mockResolvedValueOnce({
        id: 'var-existing',
        sku: 'SKU-DUP',
      });

      await expect(
        service.createVariant(
          'prod-1',
          { userId: 'seller-1', role: UserRole.SELLER },
          {
            sku: 'SKU-DUP',
            title: 'Duplicate SKU',
            price: 500,
            mrp: 600,
            attributes: {},
          },
        ),
      ).rejects.toThrow('Variant with SKU "SKU-DUP" already exists');
    });

    it('should list variants with inventory for a product', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 'prod-1' });
      mockPrisma.productVariant.findMany.mockResolvedValueOnce([
        { id: 'var-1', sku: 'SKU-1', inventory: { availableQuantity: 5 } },
      ]);

      const result = await service.getProductVariants('prod-1');

      expect(mockPrisma.productVariant.findMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        include: expect.any(Object),
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should update permitted variant attributes and reject if seller does not own product', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValueOnce({
        id: 'var-1',
        sku: 'SKU-ORIG',
        price: '400',
        mrp: '500',
        product: { shop: { sellerId: 'seller-A' } },
      });

      await expect(
        service.updateVariant(
          'var-1',
          { userId: 'seller-B', role: UserRole.SELLER },
          { title: 'Hacked Variant' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should activate or deactivate a variant', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValueOnce({
        id: 'var-1',
        product: { shop: { sellerId: 'seller-1' } },
      });
      mockPrisma.productVariant.update.mockResolvedValueOnce({
        id: 'var-1',
        isActive: false,
      });

      const result = await service.updateVariantStatus(
        'var-1',
        { userId: 'seller-1', role: UserRole.SELLER },
        { isActive: false },
      );

      expect(result.message).toBe('Variant deactivated successfully');
      expect(mockPrisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var-1' },
        data: { isActive: false },
      });
    });

    it('should deactivate instead of deleting variant when order references exist', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValueOnce({
        id: 'var-ordered',
        product: { shop: { sellerId: 'seller-1' } },
        _count: { orderItems: 2, checkoutItems: 0, cartItems: 0 },
      });
      mockPrisma.productVariant.update.mockResolvedValueOnce({
        id: 'var-ordered',
        isActive: false,
      });

      const result = await service.deleteVariant('var-ordered', {
        userId: 'seller-1',
        role: UserRole.SELLER,
      });

      expect(result.action).toBe('DEACTIVATED');
      expect(mockPrisma.productVariant.delete).not.toHaveBeenCalled();
    });

    it('should permanently delete variant when zero order or checkout references exist', async () => {
      mockPrisma.productVariant.findUnique.mockResolvedValueOnce({
        id: 'var-unref',
        product: { shop: { sellerId: 'seller-1' } },
        inventory: { id: 'inv-unref' },
        _count: { orderItems: 0, checkoutItems: 0, cartItems: 0 },
      });
      mockPrisma.productVariant.delete.mockResolvedValueOnce({ id: 'var-unref' });

      const result = await service.deleteVariant('var-unref', {
        userId: 'seller-1',
        role: UserRole.SELLER,
      });

      expect(result.action).toBe('DELETED');
      expect(mockPrisma.inventoryMovement.deleteMany).toHaveBeenCalledWith({
        where: { inventoryId: 'inv-unref' },
      });
      expect(mockPrisma.inventory.delete).toHaveBeenCalledWith({
        where: { id: 'inv-unref' },
      });
      expect(mockPrisma.productVariant.delete).toHaveBeenCalledWith({
        where: { id: 'var-unref' },
      });
    });
  });

  // ===========================================================================
  // 8. PRODUCT IMAGE MANAGEMENT TESTS
  // ===========================================================================
  describe('Product Image Management', () => {
    it('should add image to product and set thumbnail if first image', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        title: 'Artisan Vase',
        shop: { sellerId: 'seller-1' },
      });
      mockPrisma.productImage.count.mockResolvedValueOnce(0); // First image
      mockPrisma.productImage.create.mockResolvedValueOnce({
        id: 'img-1',
        url: 'https://images.example.com/vase.jpg',
        isThumbnail: true,
      });

      const result = await service.addProductImage(
        'prod-1',
        { userId: 'seller-1', role: UserRole.SELLER },
        { url: 'https://images.example.com/vase.jpg' },
      );

      expect(mockPrisma.productImage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          productId: 'prod-1',
          url: 'https://images.example.com/vase.jpg',
          isThumbnail: true,
        }),
      });
      expect(result.isThumbnail).toBe(true);
    });

    it('should reject adding image if seller does not own product', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({
        id: 'prod-1',
        shop: { sellerId: 'seller-A' },
      });

      await expect(
        service.addProductImage(
          'prod-1',
          { userId: 'seller-B', role: UserRole.SELLER },
          { url: 'https://images.example.com/other.jpg' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should list images ordered by sortOrder asc', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 'prod-1' });
      mockPrisma.productImage.findMany.mockResolvedValueOnce([
        { id: 'img-1', sortOrder: 0 },
        { id: 'img-2', sortOrder: 1 },
      ]);

      const result = await service.getProductImages('prod-1');

      expect(mockPrisma.productImage.findMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      expect(result).toHaveLength(2);
    });

    it('should update image metadata and thumbnail flag', async () => {
      mockPrisma.productImage.findUnique.mockResolvedValueOnce({
        id: 'img-2',
        productId: 'prod-1',
        product: { shop: { sellerId: 'seller-1' } },
      });
      mockPrisma.productImage.update.mockResolvedValueOnce({
        id: 'img-2',
        isThumbnail: true,
        altText: 'New Alt',
      });

      await service.updateProductImage(
        'img-2',
        { userId: 'seller-1', role: UserRole.SELLER },
        { isThumbnail: true, altText: 'New Alt' },
      );

      expect(mockPrisma.productImage.updateMany).toHaveBeenCalledWith({
        where: { productId: 'prod-1', isThumbnail: true },
        data: { isThumbnail: false },
      });
      expect(mockPrisma.productImage.update).toHaveBeenCalledWith({
        where: { id: 'img-2' },
        data: expect.objectContaining({
          isThumbnail: true,
          altText: 'New Alt',
        }),
      });
    });

    it('should delete image and promote next image if thumbnail was deleted', async () => {
      mockPrisma.productImage.findUnique.mockResolvedValueOnce({
        id: 'img-1',
        productId: 'prod-1',
        isThumbnail: true,
        product: { shop: { sellerId: 'seller-1' } },
      });
      mockPrisma.productImage.findFirst.mockResolvedValueOnce({
        id: 'img-2',
        productId: 'prod-1',
      });

      const result = await service.deleteProductImage('img-1', {
        userId: 'seller-1',
        role: UserRole.SELLER,
      });

      expect(mockPrisma.productImage.delete).toHaveBeenCalledWith({
        where: { id: 'img-1' },
      });
      expect(mockPrisma.productImage.update).toHaveBeenCalledWith({
        where: { id: 'img-2' },
        data: { isThumbnail: true },
      });
      expect(result.message).toBe('Product image deleted successfully');
    });
  });

  // ===========================================================================
  // CUSTOMER PUBLIC PRODUCT BROWSING
  // ===========================================================================
  describe('Customer Public Product Browsing', () => {
    describe('findPublished', () => {
      it('should query published products from approved shops with pagination', async () => {
        mockPrisma.product.count.mockResolvedValueOnce(1);
        mockPrisma.product.findMany.mockResolvedValueOnce([
          {
            id: 'prod-1',
            title: 'Wireless Earbuds',
            status: ProductStatus.PUBLISHED,
            shop: { id: 'shop-1', name: 'Audio Shop', slug: 'audio-shop' },
          },
        ]);

        const result = await service.findPublished({ page: 1, limit: 10, search: 'earbuds' });

        expect(mockPrisma.product.count).toHaveBeenCalledWith({
          where: expect.objectContaining({
            status: ProductStatus.PUBLISHED,
            shop: { status: ShopStatus.APPROVED },
            OR: expect.any(Array),
          }),
        });
        expect(result.items).toHaveLength(1);
        expect(result.pagination.total).toBe(1);
      });
    });

    describe('findByShopAndSlug', () => {
      it('should return published product for approved shop', async () => {
        mockPrisma.shop.findUnique.mockResolvedValueOnce({
          id: 'shop-1',
          slug: 'audio-shop',
          status: ShopStatus.APPROVED,
        });
        mockPrisma.product.findUnique.mockResolvedValueOnce({
          id: 'prod-1',
          slug: 'wireless-earbuds',
          status: ProductStatus.PUBLISHED,
          shop: { id: 'shop-1', name: 'Audio Shop', slug: 'audio-shop' },
        });

        const result = await service.findByShopAndSlug('audio-shop', 'wireless-earbuds');
        expect(result.id).toBe('prod-1');
      });

      it('should throw NotFoundException if shop is not approved', async () => {
        mockPrisma.shop.findUnique.mockResolvedValueOnce({
          id: 'shop-1',
          slug: 'audio-shop',
          status: ShopStatus.PENDING_APPROVAL,
        });

        await expect(
          service.findByShopAndSlug('audio-shop', 'wireless-earbuds'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw NotFoundException if product is not published', async () => {
        mockPrisma.shop.findUnique.mockResolvedValueOnce({
          id: 'shop-1',
          slug: 'audio-shop',
          status: ShopStatus.APPROVED,
        });
        mockPrisma.product.findUnique.mockResolvedValueOnce({
          id: 'prod-1',
          slug: 'wireless-earbuds',
          status: ProductStatus.DRAFT,
        });

        await expect(
          service.findByShopAndSlug('audio-shop', 'wireless-earbuds'),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('findPublishedById', () => {
      it('should return published product from approved shop by id', async () => {
        mockPrisma.product.findUnique.mockResolvedValueOnce({
          id: 'prod-1',
          title: 'Wireless Earbuds',
          status: ProductStatus.PUBLISHED,
          shop: { id: 'shop-1', name: 'Audio Shop', status: ShopStatus.APPROVED },
          images: [],
          variants: [{ id: 'var-1', isActive: true, inventory: { availableQuantity: 5 } }],
        });

        const result = await service.findPublishedById('prod-1');
        expect(result.id).toBe('prod-1');
        expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
          where: { id: 'prod-1' },
          include: expect.objectContaining({
            category: true,
            shop: expect.any(Object),
            images: expect.any(Object),
            variants: expect.any(Object),
          }),
        });
      });

      it('should throw NotFoundException if product does not exist', async () => {
        mockPrisma.product.findUnique.mockResolvedValueOnce(null);

        await expect(service.findPublishedById('non-existent')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('should throw NotFoundException if product shop is not approved', async () => {
        mockPrisma.product.findUnique.mockResolvedValueOnce({
          id: 'prod-1',
          status: ProductStatus.PUBLISHED,
          shop: { id: 'shop-1', status: ShopStatus.SUSPENDED },
        });

        await expect(service.findPublishedById('prod-1')).rejects.toThrow(
          NotFoundException,
        );
      });

      it('should throw NotFoundException if product is draft/archived', async () => {
        mockPrisma.product.findUnique.mockResolvedValueOnce({
          id: 'prod-1',
          status: ProductStatus.ARCHIVED,
          shop: { id: 'shop-1', status: ShopStatus.APPROVED },
        });

        await expect(service.findPublishedById('prod-1')).rejects.toThrow(
          NotFoundException,
        );
      });
    });
  });
});
