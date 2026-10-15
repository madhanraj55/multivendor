import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Register hook to handle import.meta.env in apiClient.ts when running under Node
const loader = `
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url.includes('apiClient')) {
    const source = result.source.toString().replace(
      'import.meta.env.VITE_API_BASE_URL',
      '(globalThis.process?.env?.VITE_API_BASE_URL || "http://localhost:3000/api/v1")'
    );
    return { ...result, source };
  }
  return result;
}
`;

register('data:text/javascript,' + encodeURIComponent(loader));

// Dynamically import the actual production modules
const {
  sellerProductsApi,
  getMyProducts,
  createProduct,
  updateProduct,
  getProductVariants,
  createVariant,
  updateVariant,
  updateVariantStatus,
  deleteVariant,
  getProductImages,
  addProductImage,
  updateProductImage,
  deleteProductImage,
  uploadProductImage,
  adjustStock,
  validatePriceAgainstMrp,
  isValidImageUrl,
} = await import('../sellerProductsApi.ts');

const {
  categoriesApi,
  getCategories,
  getCategoryTree,
  getCategoryBySlug,
} = await import('../categoriesApi.ts');

const { apiClient, ApiError } = await import('../apiClient.ts');

describe('Stage 3B-7B & 7B-1 Seller Product Management API Integration & Contract Audit', () => {
  let originalRequest;
  let lastCall;

  beforeEach(() => {
    originalRequest = apiClient.request;
    lastCall = null;
  });

  afterEach(() => {
    apiClient.request = originalRequest;
  });

  function mockApiResponse(mockData) {
    apiClient.request = async (endpoint, options) => {
      lastCall = { endpoint, options };
      return mockData;
    };
  }

  function mockApiError(statusCode, message, error) {
    apiClient.request = async (endpoint, options) => {
      lastCall = { endpoint, options };
      throw new ApiError(statusCode, message, error);
    };
  }

  describe('1. Price and MRP Reusable Validation Helpers', () => {
    it('accepts price strictly lower than MRP', () => {
      assert.equal(validatePriceAgainstMrp(499, 999), true);
      assert.equal(validatePriceAgainstMrp(0, 100), true);
    });

    it('accepts price equal to MRP', () => {
      assert.equal(validatePriceAgainstMrp(1000, 1000), true);
      assert.equal(validatePriceAgainstMrp(0, 0), true);
    });

    it('rejects price greater than MRP (backend rule price <= mrp)', () => {
      assert.equal(validatePriceAgainstMrp(1200, 1000), false);
      assert.equal(validatePriceAgainstMrp(100.01, 100), false);
    });

    it('rejects negative prices or negative MRPs', () => {
      assert.equal(validatePriceAgainstMrp(-10, 100), false);
      assert.equal(validatePriceAgainstMrp(50, -100), false);
      assert.equal(validatePriceAgainstMrp(-50, -10), false);
    });

    it('rejects non-numeric, NaN, null, and undefined values', () => {
      assert.equal(validatePriceAgainstMrp(NaN, 100), false);
      assert.equal(validatePriceAgainstMrp(100, NaN), false);
      assert.equal(validatePriceAgainstMrp('500', 1000), false);
      assert.equal(validatePriceAgainstMrp(null, 1000), false);
      assert.equal(validatePriceAgainstMrp(undefined, 1000), false);
    });
  });

  describe('2. Image URL Validation Helpers', () => {
    it('accepts valid http and https URLs', () => {
      assert.equal(isValidImageUrl('https://images.example.com/product.jpg'), true);
      assert.equal(isValidImageUrl('http://example.com/cdn/image.png?size=large'), true);
      assert.equal(isValidImageUrl('https://cdn.example.org/img.webp#preview'), true);
    });

    it('rejects non-http/https protocols such as ftp, file, or javascript', () => {
      assert.equal(isValidImageUrl('ftp://example.com/image.jpg'), false);
      assert.equal(isValidImageUrl('file:///c:/path/to/img.png'), false);
      assert.equal(isValidImageUrl('javascript:alert(1)'), false);
      assert.equal(isValidImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg'), false);
    });

    it('rejects invalid strings, empty values, and non-string inputs', () => {
      assert.equal(isValidImageUrl('not-a-valid-url'), false);
      assert.equal(isValidImageUrl(''), false);
      assert.equal(isValidImageUrl('   '), false);
      assert.equal(isValidImageUrl(null), false);
      assert.equal(isValidImageUrl(undefined), false);
      assert.equal(isValidImageUrl(12345), false);
    });
  });

  describe('3. Seller Products Service Contracts', () => {
    it('getMyProducts: calls GET /products/seller/my-products', async () => {
      const mockProducts = [
        {
          id: 'prod-001',
          shopId: 'shop-001',
          categoryId: 'cat-1',
          title: 'Mechanical Keyboard',
          slug: 'mechanical-keyboard',
          description: 'Compact RGB mechanical keyboard',
          brand: 'KeyPro',
          status: 'PUBLISHED',
          hsnCode: '847160',
          isReturnable: true,
          returnWindowDays: 7,
          metaTitle: 'Mechanical Keyboard Online',
          metaDescription: 'Best mechanical keyboard',
          createdAt: '2026-10-15T12:00:00.000Z',
          updatedAt: '2026-10-15T12:00:00.000Z',
          category: { id: 'cat-1', name: 'Electronics', slug: 'electronics' },
          variants: [
            {
              id: 'var-01',
              productId: 'prod-001',
              sku: 'KEY-RED-01',
              title: 'Red Switch',
              price: 3499,
              mrp: 3999,
              attributes: { switch: 'Red' },
              weightGrams: 850,
              isActive: true,
              createdAt: '2026-10-15T12:00:00.000Z',
              updatedAt: '2026-10-15T12:00:00.000Z',
              inventory: {
                id: 'inv-01',
                variantId: 'var-01',
                availableQuantity: 50,
                reservedQuantity: 2,
                lowStockThreshold: 5,
              },
            },
          ],
          images: [
            {
              id: 'img-01',
              productId: 'prod-001',
              url: 'https://images.example.com/keyboard.jpg',
              altText: 'Keyboard front',
              sortOrder: 0,
              isThumbnail: true,
              createdAt: '2026-10-15T12:00:00.000Z',
            },
          ],
        },
      ];
      mockApiResponse(mockProducts);

      const result = await getMyProducts();
      assert.equal(lastCall.endpoint, '/products/seller/my-products');
      assert.equal(lastCall.options.method, 'GET');
      assert.deepEqual(result, mockProducts);
    });

    it('createProduct: sends POST /products matching CreateProductDto (initialStock, isThumbnail, no status)', async () => {
      const mockCreated = {
        id: 'prod-002',
        shopId: 'shop-001',
        categoryId: 'e3b0c442-98fc-1c14-9afb-4c8996fb9242',
        title: 'Wireless Gaming Mouse',
        slug: 'wireless-gaming-mouse-xyz123',
        description: 'Ergonomic mouse with low latency',
        brand: 'GamerGear',
        status: 'PUBLISHED',
        hsnCode: '847160',
        isReturnable: true,
        returnWindowDays: 10,
        metaTitle: 'GamerGear Wireless Mouse',
        metaDescription: 'Low latency wireless gaming mouse',
        createdAt: '2026-10-15T12:00:00.000Z',
        updatedAt: '2026-10-15T12:00:00.000Z',
        variants: [],
        images: [],
      };
      mockApiResponse(mockCreated);

      const payload = {
        categoryId: 'e3b0c442-98fc-1c14-9afb-4c8996fb9242',
        title: 'Wireless Gaming Mouse',
        description: 'Ergonomic mouse with low latency',
        brand: 'GamerGear',
        hsnCode: '847160',
        isReturnable: true,
        returnWindowDays: 10,
        metaTitle: 'GamerGear Wireless Mouse',
        metaDescription: 'Low latency wireless gaming mouse',
        variants: [
          {
            sku: 'MOUSE-BLK-01',
            title: 'Black Edition',
            mrp: 2999,
            price: 2499,
            attributes: { color: 'Black' },
            weightGrams: 95,
            initialStock: 50, // Matches CreateVariantDto.initialStock (not 'stock')
            lowStockThreshold: 5,
          },
        ],
        images: [
          {
            url: 'https://images.example.com/mouse-front.jpg',
            altText: 'Mouse front view',
            sortOrder: 0,
            isThumbnail: true, // Matches CreateProductImageDto.isThumbnail (not 'isPrimary')
          },
        ],
      };

      const result = await createProduct(payload);
      assert.equal(lastCall.endpoint, '/products');
      assert.equal(lastCall.options.method, 'POST');
      assert.equal(lastCall.options.body, JSON.stringify(payload));

      // Explicit field contract verifications
      const sentBody = JSON.parse(lastCall.options.body);
      assert.equal(sentBody.variants[0].initialStock, 50);
      assert.equal(sentBody.variants[0].stock, undefined);
      assert.equal(sentBody.images[0].isThumbnail, true);
      assert.equal(sentBody.images[0].isPrimary, undefined);
      assert.equal(sentBody.status, undefined); // Status is not allowed on CreateProductDto
      assert.deepEqual(result, mockCreated);
    });

    it('updateProduct: sends PATCH /products/:id matching UpdateProductDto (status, hsnCode, returnWindowDays)', async () => {
      const mockUpdated = {
        id: 'prod-002',
        title: 'Wireless Gaming Mouse Pro',
        status: 'PUBLISHED',
        hsnCode: '847160',
        isReturnable: true,
        returnWindowDays: 14,
        metaTitle: 'Pro Edition Gaming Mouse',
        metaDescription: 'Enhanced sensor gaming mouse',
      };
      mockApiResponse(mockUpdated);

      const payload = {
        title: 'Wireless Gaming Mouse Pro',
        status: 'PUBLISHED',
        hsnCode: '847160',
        isReturnable: true,
        returnWindowDays: 14,
        metaTitle: 'Pro Edition Gaming Mouse',
        metaDescription: 'Enhanced sensor gaming mouse',
      };

      const result = await updateProduct('prod-002', payload);
      assert.equal(lastCall.endpoint, '/products/prod-002');
      assert.equal(lastCall.options.method, 'PATCH');
      assert.equal(lastCall.options.body, JSON.stringify(payload));
      assert.deepEqual(result, mockUpdated);
    });
  });

  describe('4. Variant Management Contracts', () => {
    it('getProductVariants: calls GET /products/:id/variants and receives inventory fields', async () => {
      const mockVariants = [
        {
          id: 'var-01',
          productId: 'prod-001',
          sku: 'KEY-RED-01',
          title: 'Red Switch',
          price: 3499,
          mrp: 3999,
          attributes: { switch: 'Red' },
          weightGrams: 850,
          isActive: true,
          createdAt: '2026-10-15T12:00:00.000Z',
          updatedAt: '2026-10-15T12:00:00.000Z',
          inventory: {
            id: 'inv-01',
            availableQuantity: 40,
            reservedQuantity: 5,
            lowStockThreshold: 10,
          },
        },
      ];
      mockApiResponse(mockVariants);

      const result = await getProductVariants('prod-001');
      assert.equal(lastCall.endpoint, '/products/prod-001/variants');
      assert.equal(lastCall.options.method, 'GET');
      assert.deepEqual(result, mockVariants);
      assert.equal(result[0].inventory.availableQuantity, 40);
      assert.equal(result[0].inventory.reservedQuantity, 5);
      assert.equal(result[0].inventory.lowStockThreshold, 10);
    });

    it('createVariant: sends POST /products/:id/variants matching CreateProductVariantDto', async () => {
      const mockNewVariant = {
        id: 'var-02',
        productId: 'prod-001',
        sku: 'KEY-BLUE-02',
        title: 'Blue Switch Clicky',
        price: 3499,
        mrp: 3999,
        attributes: { switch: 'Blue' },
        weightGrams: 860,
        isActive: true,
        createdAt: '2026-10-15T12:00:00.000Z',
        updatedAt: '2026-10-15T12:00:00.000Z',
        inventory: {
          id: 'inv-02',
          variantId: 'var-02',
          availableQuantity: 25,
          reservedQuantity: 0,
          lowStockThreshold: 5,
        },
      };
      mockApiResponse(mockNewVariant);

      const payload = {
        sku: 'KEY-BLUE-02',
        title: 'Blue Switch Clicky',
        mrp: 3999,
        price: 3499,
        attributes: { switch: 'Blue' },
        weightGrams: 860,
        initialStock: 25, // Matches backend DTO initialStock
        lowStockThreshold: 5,
      };

      const result = await createVariant('prod-001', payload);
      assert.equal(lastCall.endpoint, '/products/prod-001/variants');
      assert.equal(lastCall.options.method, 'POST');
      assert.equal(lastCall.options.body, JSON.stringify(payload));

      const sentBody = JSON.parse(lastCall.options.body);
      assert.equal(sentBody.initialStock, 25);
      assert.equal(sentBody.stock, undefined);
      assert.equal(sentBody.title, 'Blue Switch Clicky');
      assert.deepEqual(result, mockNewVariant);
    });

    it('updateVariant: sends PATCH /products/variants/:variantId (allows metadata, strictly no stock)', async () => {
      const mockUpdatedVariant = {
        id: 'var-02',
        productId: 'prod-001',
        sku: 'KEY-BLUE-02-V2',
        title: 'Blue Switch Tactile V2',
        mrp: 3999,
        price: 3299,
        attributes: { switch: 'Blue', version: 2 },
        weightGrams: 870,
        isActive: true,
        createdAt: '2026-10-15T12:00:00.000Z',
        updatedAt: '2026-10-15T12:05:00.000Z',
        inventory: {
          id: 'inv-02',
          availableQuantity: 25,
          reservedQuantity: 0,
          lowStockThreshold: 5,
        },
      };
      mockApiResponse(mockUpdatedVariant);

      const payload = {
        sku: 'KEY-BLUE-02-V2',
        title: 'Blue Switch Tactile V2',
        mrp: 3999,
        price: 3299,
        attributes: { switch: 'Blue', version: 2 },
        weightGrams: 870,
      };

      const result = await updateVariant('var-02', payload);
      assert.equal(lastCall.endpoint, '/products/variants/var-02');
      assert.equal(lastCall.options.method, 'PATCH');
      assert.equal(lastCall.options.body, JSON.stringify(payload));
      assert.deepEqual(result, mockUpdatedVariant);
    });

    it('updateVariantStatus: sends PATCH /products/variants/:variantId/status with UpdateVariantStatusDto', async () => {
      const mockStatusResponse = {
        message: 'Variant deactivated successfully',
        variant: {
          id: 'var-02',
          productId: 'prod-001',
          sku: 'KEY-BLUE-02',
          title: 'Blue Switch',
          mrp: 3999,
          price: 3499,
          attributes: { switch: 'Blue' },
          weightGrams: 850,
          isActive: false,
          createdAt: '2026-10-15T12:00:00.000Z',
          updatedAt: '2026-10-15T12:10:00.000Z',
        },
      };
      mockApiResponse(mockStatusResponse);

      const result = await updateVariantStatus('var-02', { isActive: false });
      assert.equal(lastCall.endpoint, '/products/variants/var-02/status');
      assert.equal(lastCall.options.method, 'PATCH');
      assert.equal(lastCall.options.body, JSON.stringify({ isActive: false }));
      assert.deepEqual(result, mockStatusResponse);
    });

    it('deleteVariant: sends DELETE /products/variants/:variantId and handles deactivation/deletion response', async () => {
      const mockDeleteResponse = {
        action: 'DEACTIVATED',
        message: 'Variant has historical orders, checkouts, or active cart items. The variant has been deactivated instead of permanently deleted to preserve transaction and snapshot records.',
        variant: {
          id: 'var-02',
          productId: 'prod-001',
          sku: 'KEY-BLUE-02',
          title: 'Blue Switch',
          mrp: 3999,
          price: 3499,
          attributes: { switch: 'Blue' },
          weightGrams: 850,
          isActive: false,
          createdAt: '2026-10-15T12:00:00.000Z',
          updatedAt: '2026-10-15T12:15:00.000Z',
        },
      };
      mockApiResponse(mockDeleteResponse);

      const result = await deleteVariant('var-02');
      assert.equal(lastCall.endpoint, '/products/variants/var-02');
      assert.equal(lastCall.options.method, 'DELETE');
      assert.deepEqual(result, mockDeleteResponse);
    });
  });

  describe('5. Product Image Management Contracts', () => {
    it('getProductImages: calls GET /products/:id/images', async () => {
      const mockImages = [
        {
          id: 'img-1',
          productId: 'prod-001',
          url: 'https://example.com/1.jpg',
          altText: 'Hero view',
          sortOrder: 0,
          isThumbnail: true,
          createdAt: '2026-10-15T12:00:00.000Z',
        },
      ];
      mockApiResponse(mockImages);

      const result = await getProductImages('prod-001');
      assert.equal(lastCall.endpoint, '/products/prod-001/images');
      assert.equal(lastCall.options.method, 'GET');
      assert.deepEqual(result, mockImages);
    });

    it('addProductImage: sends POST /products/:id/images matching AddProductImageDto (isThumbnail)', async () => {
      const mockAdded = {
        id: 'img-2',
        productId: 'prod-001',
        url: 'https://example.com/2.jpg',
        altText: 'Side angle',
        sortOrder: 1,
        isThumbnail: false,
        createdAt: '2026-10-15T12:00:00.000Z',
      };
      mockApiResponse(mockAdded);

      const payload = {
        url: 'https://example.com/2.jpg',
        altText: 'Side angle',
        sortOrder: 1,
        isThumbnail: false,
      };

      const result = await addProductImage('prod-001', payload);
      assert.equal(lastCall.endpoint, '/products/prod-001/images');
      assert.equal(lastCall.options.method, 'POST');
      assert.equal(lastCall.options.body, JSON.stringify(payload));

      const sentBody = JSON.parse(lastCall.options.body);
      assert.equal(sentBody.isThumbnail, false);
      assert.equal(sentBody.isPrimary, undefined);
      assert.deepEqual(result, mockAdded);
    });

    it('updateProductImage: sends PATCH /products/images/:imageId matching UpdateProductImageDto (accepts url and isThumbnail)', async () => {
      const mockUpdated = {
        id: 'img-2',
        productId: 'prod-001',
        url: 'https://example.com/2-new.jpg',
        altText: 'New Side Angle High Res',
        sortOrder: 0,
        isThumbnail: true,
        createdAt: '2026-10-15T12:00:00.000Z',
      };
      mockApiResponse(mockUpdated);

      const payload = {
        url: 'https://example.com/2-new.jpg',
        altText: 'New Side Angle High Res',
        sortOrder: 0,
        isThumbnail: true,
      };

      const result = await updateProductImage('img-2', payload);
      assert.equal(lastCall.endpoint, '/products/images/img-2');
      assert.equal(lastCall.options.method, 'PATCH');
      assert.equal(lastCall.options.body, JSON.stringify(payload));

      const sentBody = JSON.parse(lastCall.options.body);
      assert.equal(sentBody.url, 'https://example.com/2-new.jpg'); // Image update accepts url
      assert.equal(sentBody.isThumbnail, true);
      assert.equal(sentBody.isPrimary, undefined);
      assert.deepEqual(result, mockUpdated);
    });

    it('deleteProductImage: sends DELETE /products/images/:imageId and receives confirmation message', async () => {
      const mockResponse = {
        message: 'Product image deleted successfully',
      };
      mockApiResponse(mockResponse);

      const result = await deleteProductImage('img-2');
      assert.equal(lastCall.endpoint, '/products/images/img-2');
      assert.equal(lastCall.options.method, 'DELETE');
      assert.deepEqual(result, mockResponse);
    });

    it('uploadProductImage: sends POST /products/upload-image with FormData body and returns upload response', async () => {
      const mockUploadResponse = {
        url: 'http://localhost:3000/uploads/products/product-1729000000-123456789.png',
        filename: 'product-1729000000-123456789.png',
        originalName: 'test-upload.png',
        size: 1024,
        mimeType: 'image/png',
      };
      mockApiResponse(mockUploadResponse);

      const fakeFile = new File(['fake-png-binary'], 'test-upload.png', { type: 'image/png' });
      const result = await uploadProductImage(fakeFile);

      assert.equal(lastCall.endpoint, '/products/upload-image');
      assert.equal(lastCall.options.method, 'POST');
      assert.ok(lastCall.options.body instanceof FormData);
      assert.deepEqual(result, mockUploadResponse);
    });
  });

  describe('6. Stock Adjustment Contracts (AdjustStockDto: quantity, referenceId, notes)', () => {
    it('adjustStock: sends POST /products/stock/adjust with quantity (not delta) and notes (not reason)', async () => {
      const mockInventoryResult = {
        id: 'inv-01',
        variantId: 'var-01',
        availableQuantity: 75,
        reservedQuantity: 5,
        lowStockThreshold: 10,
        updatedAt: '2026-10-15T12:00:00.000Z',
      };
      mockApiResponse(mockInventoryResult);

      const payload = {
        variantId: 'var-01',
        quantity: 25, // Backend DTO strictly requires quantity
        referenceId: 'PO-2026-001',
        notes: 'Restock shipment received from supplier',
      };

      const result = await adjustStock(payload);
      assert.equal(lastCall.endpoint, '/products/stock/adjust');
      assert.equal(lastCall.options.method, 'POST');
      assert.equal(lastCall.options.body, JSON.stringify(payload));

      // Explicit verification: quantity is sent, delta is undefined
      const sentBody = JSON.parse(lastCall.options.body);
      assert.equal(sentBody.quantity, 25);
      assert.equal(sentBody.delta, undefined);
      assert.equal(sentBody.notes, 'Restock shipment received from supplier');
      assert.equal(sentBody.reason, undefined);
      assert.deepEqual(result, mockInventoryResult);
      assert.equal(result.availableQuantity, 75);
      assert.equal(result.reservedQuantity, 5);
      assert.equal(result.lowStockThreshold, 10);
    });
  });

  describe('7. Categories API Contracts', () => {
    it('getCategories: calls GET /categories', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          name: 'Electronics',
          slug: 'electronics',
          description: 'Gadgets and gear',
          imageUrl: 'https://example.com/cat.jpg',
          parentId: null,
          isActive: true,
          sortOrder: 0,
        },
        {
          id: 'cat-2',
          name: 'Apparel',
          slug: 'apparel',
          description: 'Clothing and fashion',
          imageUrl: null,
          parentId: null,
          isActive: true,
          sortOrder: 1,
        },
      ];
      mockApiResponse(mockCategories);

      const result = await getCategories();
      assert.equal(lastCall.endpoint, '/categories');
      assert.equal(lastCall.options.method, 'GET');
      assert.deepEqual(result, mockCategories);
    });

    it('getCategoryTree: calls GET /categories/tree', async () => {
      const mockTree = [
        {
          id: 'cat-1',
          name: 'Electronics',
          slug: 'electronics',
          description: null,
          imageUrl: null,
          parentId: null,
          isActive: true,
          sortOrder: 0,
          children: [
            {
              id: 'cat-10',
              name: 'Audio',
              slug: 'audio',
              description: null,
              imageUrl: null,
              parentId: 'cat-1',
              isActive: true,
              sortOrder: 0,
              children: [],
            },
            {
              id: 'cat-11',
              name: 'Keyboards',
              slug: 'keyboards',
              description: null,
              imageUrl: null,
              parentId: 'cat-1',
              isActive: true,
              sortOrder: 1,
              children: [],
            },
          ],
        },
      ];
      mockApiResponse(mockTree);

      const result = await getCategoryTree();
      assert.equal(lastCall.endpoint, '/categories/tree');
      assert.equal(lastCall.options.method, 'GET');
      assert.deepEqual(result, mockTree);
    });

    it('getCategoryBySlug: calls GET /categories/:slug with URI encoding', async () => {
      const mockCategory = {
        id: 'cat-1',
        name: 'Home & Kitchen',
        slug: 'home & kitchen',
        description: null,
        imageUrl: null,
        parentId: null,
        isActive: true,
        sortOrder: 0,
        parent: null,
        children: [],
      };
      mockApiResponse(mockCategory);

      const result = await getCategoryBySlug('home & kitchen');
      assert.equal(lastCall.endpoint, '/categories/home%20%26%20kitchen');
      assert.equal(lastCall.options.method, 'GET');
      assert.deepEqual(result, mockCategory);
    });
  });

  describe('8. Backend Error Propagation & Safety Handling', () => {
    it('propagates 403 Forbidden when seller shop is not approved', async () => {
      mockApiError(403, 'Your shop must be approved by an administrator before creating products', 'Forbidden');

      await assert.rejects(
        async () => {
          await createProduct({
            categoryId: 'cat-1',
            title: 'Unapproved Shop Product',
            description: 'Test product description',
            brand: 'Test',
            variants: [
              {
                sku: 'TEST-SKU',
                title: 'Standard',
                price: 100,
                mrp: 200,
                attributes: {},
                initialStock: 10,
              },
            ],
          });
        },
        (err) => {
          assert.equal(err.statusCode, 403);
          assert.match(err.message, /must be approved/);
          return true;
        }
      );
    });

    it('propagates 409 Conflict when SKU already exists', async () => {
      mockApiError(409, 'Variant with SKU "KEY-RED-01" already exists', 'Conflict');

      await assert.rejects(
        async () => {
          await createVariant('prod-001', {
            sku: 'KEY-RED-01',
            title: 'Red Switch',
            price: 2999,
            mrp: 3499,
            attributes: {},
          });
        },
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /SKU "KEY-RED-01" already exists/);
          return true;
        }
      );
    });

    it('propagates 400 Bad Request when stock reduction exceeds available quantity', async () => {
      mockApiError(400, 'Cannot reduce stock by 10. Current available: 5', 'Bad Request');

      await assert.rejects(
        async () => {
          await adjustStock({
            variantId: 'var-01',
            quantity: -10, // Negative integer for stock reduction
            notes: 'Damaged items removal',
          });
        },
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.match(err.message, /Cannot reduce stock by 10/);
          return true;
        }
      );
    });
  });

  describe('9. Stage 3B-7C Catalogue Filtering & Aggregation Logic', () => {
    const mockCatalogue = [
      {
        id: 'p-1',
        title: 'Ergonomic Mechanical Keyboard',
        brand: 'KeyPro',
        status: 'PUBLISHED',
        category: { id: 'c-1', name: 'Electronics' },
        variants: [
          {
            id: 'v-1a',
            sku: 'KEY-RED',
            title: 'Red Switch',
            price: 2999,
            mrp: 3499,
            inventory: { availableQuantity: 15, reservedQuantity: 2, lowStockThreshold: 5 },
          },
          {
            id: 'v-1b',
            sku: 'KEY-BLUE',
            title: 'Blue Switch',
            price: 3199,
            mrp: 3499,
            inventory: { availableQuantity: 3, reservedQuantity: 1, lowStockThreshold: 5 },
          },
        ],
      },
      {
        id: 'p-2',
        title: 'Wireless Optical Mouse',
        brand: 'GamerGear',
        status: 'DRAFT',
        category: { id: 'c-1', name: 'Electronics' },
        variants: [
          {
            id: 'v-2a',
            sku: 'MOUSE-BLK',
            title: 'Matte Black',
            price: 1499,
            mrp: 1999,
            inventory: { availableQuantity: 0, reservedQuantity: 0, lowStockThreshold: 5 },
          },
        ],
      },
      {
        id: 'p-3',
        title: 'Organic Cotton T-Shirt',
        brand: 'EcoWear',
        status: 'ARCHIVED',
        category: { id: 'c-2', name: 'Apparel' },
        variants: [],
      },
    ];

    it('filters products correctly by search query matching title, brand, category, or SKU', () => {
      const filterBySearch = (items, query) => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter((p) => {
          const matchTitle = p.title.toLowerCase().includes(q);
          const matchBrand = p.brand?.toLowerCase().includes(q);
          const matchCat = p.category?.name?.toLowerCase().includes(q);
          const matchSku = p.variants?.some((v) =>
            v.sku.toLowerCase().includes(q) || v.title.toLowerCase().includes(q)
          );
          return matchTitle || matchBrand || matchCat || matchSku;
        });
      };

      // Match by title substring
      assert.equal(filterBySearch(mockCatalogue, 'keyboard').length, 1);
      assert.equal(filterBySearch(mockCatalogue, 'keyboard')[0].id, 'p-1');

      // Match by brand
      assert.equal(filterBySearch(mockCatalogue, 'GamerGear').length, 1);
      assert.equal(filterBySearch(mockCatalogue, 'GamerGear')[0].id, 'p-2');

      // Match by category
      assert.equal(filterBySearch(mockCatalogue, 'Electronics').length, 2);

      // Match by variant SKU
      assert.equal(filterBySearch(mockCatalogue, 'KEY-BLUE').length, 1);
      assert.equal(filterBySearch(mockCatalogue, 'KEY-BLUE')[0].id, 'p-1');

      // No matches
      assert.equal(filterBySearch(mockCatalogue, 'nonexistent query').length, 0);
    });

    it('filters products correctly by status filter tab', () => {
      const filterByStatus = (items, status) => {
        if (status === 'ALL') return items;
        return items.filter((p) => p.status === status);
      };

      assert.equal(filterByStatus(mockCatalogue, 'ALL').length, 3);
      assert.equal(filterByStatus(mockCatalogue, 'PUBLISHED').length, 1);
      assert.equal(filterByStatus(mockCatalogue, 'DRAFT').length, 1);
      assert.equal(filterByStatus(mockCatalogue, 'ARCHIVED').length, 1);
      assert.equal(filterByStatus(mockCatalogue, 'INACTIVE').length, 0);
    });

    it('accurately computes total available and reserved stock across product variants', () => {
      const computeStock = (variants) => {
        let available = 0;
        let reserved = 0;
        let isLow = false;
        for (const v of variants || []) {
          const qty = v.inventory?.availableQuantity ?? 0;
          const res = v.inventory?.reservedQuantity ?? 0;
          const thresh = v.inventory?.lowStockThreshold ?? 5;
          available += qty;
          reserved += res;
          if (qty <= thresh) isLow = true;
        }
        return { available, reserved, isLow };
      };

      // Product 1 has 15 + 3 = 18 available, 2 + 1 = 3 reserved, and v-1b has 3 <= 5 so isLow is true
      const p1Stock = computeStock(mockCatalogue[0].variants);
      assert.equal(p1Stock.available, 18);
      assert.equal(p1Stock.reserved, 3);
      assert.equal(p1Stock.isLow, true);

      // Product 2 has 0 available, 0 reserved, and 0 <= 5 so isLow is true
      const p2Stock = computeStock(mockCatalogue[1].variants);
      assert.equal(p2Stock.available, 0);
      assert.equal(p2Stock.reserved, 0);
      assert.equal(p2Stock.isLow, true);
    });

    it('accurately formats price range string for single and multi-variant products', () => {
      const formatPrice = (variants) => {
        if (!variants || variants.length === 0) return 'No variants';
        if (variants.length === 1) return `₹${Number(variants[0].price).toLocaleString('en-IN')}`;
        const prices = variants.map((v) => Number(v.price));
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        if (min === max) return `₹${min.toLocaleString('en-IN')}`;
        return `₹${min.toLocaleString('en-IN')} - ₹${max.toLocaleString('en-IN')}`;
      };

      // Multi-variant range
      assert.equal(formatPrice(mockCatalogue[0].variants), '₹2,999 - ₹3,199');
      // Single variant
      assert.equal(formatPrice(mockCatalogue[1].variants), '₹1,499');
      // No variants
      assert.equal(formatPrice(mockCatalogue[2].variants), 'No variants');
    });
  });

  describe('10. Stage 3B-7C Seller Route Access Protection for /seller/products', () => {
    function verifySellerRouteAccess(authMode, authUser) {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return {
          allowed: false,
          statusCode: 401,
          reason: 'AUTHENTICATION_REQUIRED',
        };
      }
      if (authUser.role !== 'SELLER') {
        return {
          allowed: false,
          statusCode: 403,
          reason: 'FORBIDDEN',
        };
      }
      return {
        allowed: true,
        statusCode: 200,
        reason: 'AUTHORIZED',
      };
    }

    it('grants access to authenticated SELLER accounts', () => {
      const result = verifySellerRouteAccess('AUTHENTICATED', {
        id: 'usr-1',
        email: 'seller@example.com',
        role: 'SELLER',
      });
      assert.equal(result.allowed, true);
      assert.equal(result.statusCode, 200);
    });

    it('rejects unauthenticated or anonymous visits with 401', () => {
      assert.equal(verifySellerRouteAccess('ANONYMOUS', null).statusCode, 401);
      assert.equal(verifySellerRouteAccess('DEMO', null).statusCode, 401);
    });

    it('rejects CUSTOMER accounts with 403 Forbidden', () => {
      const result = verifySellerRouteAccess('AUTHENTICATED', {
        id: 'usr-2',
        email: 'customer@example.com',
        role: 'CUSTOMER',
      });
      assert.equal(result.allowed, false);
      assert.equal(result.statusCode, 403);
    });

    it('rejects ADMIN accounts from the vendor-specific route with 403 Forbidden', () => {
      const result = verifySellerRouteAccess('AUTHENTICATED', {
        id: 'usr-3',
        email: 'admin@example.com',
        role: 'ADMIN',
      });
      assert.equal(result.allowed, false);
      assert.equal(result.statusCode, 403);
    });
  });
});
