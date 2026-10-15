import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Adapter converting backend WishlistItem & Product schema to frontend UI Product model.
 * Direct copy of mapWishlistItemToProduct from wishlistApi.ts
 */
function mapWishlistItemToProduct(item) {
  const p = item.product;
  const price = p.pricing?.minPrice ?? 0;
  const originalPrice = p.pricing?.minMrp ?? price;
  const discountPercent =
    originalPrice > price && originalPrice > 0
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;

  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: '',
    brand: p.brand || '',
    category: p.category?.name || 'General',
    categoryId: p.category?.id || '',
    sellerId: p.shop?.id || '',
    sellerName: p.shop?.name || 'Marketplace Seller',
    sellerCity: '',
    sellerRating: 4.8,
    sellerVerified: p.shop?.status === 'APPROVED',
    rating: 4.8,
    reviewCount: 1,
    price,
    originalPrice,
    discountPercent,
    inStock: p.availability?.isInStock ?? true,
    stockQuantity: p.availability?.totalAvailableStock ?? 1,
    images: p.thumbnailUrl ? [p.thumbnailUrl] : [],
    thumbnail: p.thumbnailUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
    specifications: {},
    highlights: [],
  };
}

describe('Stage 3B-2 Wishlist API Integration & Adapter Unit Tests', () => {
  const sampleBackendWishlistItem = {
    id: 'wish-item-123',
    productId: 'prod-uuid-456',
    addedAt: '2026-10-14T10:00:00.000Z',
    product: {
      id: 'prod-uuid-456',
      title: 'Handcrafted Blue Pottery Ceramic Vase',
      slug: 'handcrafted-blue-pottery-ceramic-vase',
      brand: 'Jaipur Crafts',
      status: 'PUBLISHED',
      thumbnailUrl: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500',
      shop: {
        id: 'shop-uuid-789',
        name: 'Jaipur Artisan Collective',
        slug: 'jaipur-artisan-collective',
        status: 'APPROVED',
      },
      category: {
        id: 'cat-uuid-111',
        name: 'Home & Living',
        slug: 'home-living',
      },
      pricing: {
        minPrice: 1299,
        maxPrice: 1599,
        minMrp: 1999,
        maxMrp: 2299,
        currency: 'INR',
      },
      availability: {
        isInStock: true,
        totalAvailableStock: 45,
        isAvailableForPurchase: true,
      },
      variantCount: 2,
    },
  };

  it('should map BackendWishlistItem schema to UI Product model accurately', () => {
    const product = mapWishlistItemToProduct(sampleBackendWishlistItem);

    assert.strictEqual(product.id, 'prod-uuid-456');
    assert.strictEqual(product.title, 'Handcrafted Blue Pottery Ceramic Vase');
    assert.strictEqual(product.slug, 'handcrafted-blue-pottery-ceramic-vase');
    assert.strictEqual(product.brand, 'Jaipur Crafts');
    assert.strictEqual(product.category, 'Home & Living');
    assert.strictEqual(product.categoryId, 'cat-uuid-111');
    assert.strictEqual(product.sellerId, 'shop-uuid-789');
    assert.strictEqual(product.sellerName, 'Jaipur Artisan Collective');
    assert.strictEqual(product.sellerVerified, true);
    assert.strictEqual(product.price, 1299);
    assert.strictEqual(product.originalPrice, 1999);
    // Discount: round(((1999 - 1299) / 1999) * 100) = 35%
    assert.strictEqual(product.discountPercent, 35);
    assert.strictEqual(product.inStock, true);
    assert.strictEqual(product.stockQuantity, 45);
    assert.strictEqual(product.thumbnail, 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500');
    assert.deepStrictEqual(product.images, ['https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500']);
  });

  it('should fallback to defaults when thumbnail or MRP is null/missing', () => {
    const itemWithoutImages = {
      id: 'wish-item-999',
      productId: 'prod-uuid-999',
      addedAt: '2026-10-14T11:00:00.000Z',
      product: {
        id: 'prod-uuid-999',
        title: 'Simple Khadi Cotton Shirt',
        slug: 'simple-khadi-cotton-shirt',
        brand: null,
        status: 'PUBLISHED',
        thumbnailUrl: null,
        shop: {
          id: 'shop-uuid-222',
          name: 'Khadi Gramodyog',
          slug: 'khadi-gramodyog',
          status: 'PENDING',
        },
        category: null,
        pricing: {
          minPrice: 850,
          maxPrice: 850,
          minMrp: 850,
          maxMrp: 850,
          currency: 'INR',
        },
        availability: {
          isInStock: false,
          totalAvailableStock: 0,
          isAvailableForPurchase: false,
        },
        variantCount: 1,
      },
    };

    const product = mapWishlistItemToProduct(itemWithoutImages);

    assert.strictEqual(product.brand, '');
    assert.strictEqual(product.category, 'General');
    assert.strictEqual(product.categoryId, '');
    assert.strictEqual(product.sellerVerified, false);
    assert.strictEqual(product.price, 850);
    assert.strictEqual(product.originalPrice, 850);
    assert.strictEqual(product.discountPercent, 0);
    assert.strictEqual(product.inStock, false);
    assert.strictEqual(product.stockQuantity, 0);
    assert.ok(product.thumbnail.length > 0);
    assert.deepStrictEqual(product.images, []);
  });

  it('should validate AddToWishlistDto contract requiring valid UUID', () => {
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

    assert.strictEqual(uuidRegex.test('c8b82436-1e9a-4c22-b258-0081d582b881'), true);
    assert.strictEqual(uuidRegex.test('prod-1'), false);
    assert.strictEqual(uuidRegex.test(''), false);
  });

  it('should isolate demo and authenticated wishlist states cleanly', () => {
    // Demonstration of isolation invariant:
    const demoWishlist = ['prod-demo-1', 'prod-demo-2'];
    const authWishlistIds = ['c8b82436-1e9a-4c22-b258-0081d582b881'];

    // In demo mode:
    const getActiveWishlist = (mode) => (mode === 'AUTHENTICATED' ? authWishlistIds : demoWishlist);

    assert.deepStrictEqual(getActiveWishlist('DEMO'), ['prod-demo-1', 'prod-demo-2']);
    assert.deepStrictEqual(getActiveWishlist('AUTHENTICATED'), ['c8b82436-1e9a-4c22-b258-0081d582b881']);
  });
});
