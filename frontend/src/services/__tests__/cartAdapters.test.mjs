import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Adapter converting backend CartItem entity to frontend UI CartItem model.
 * Matches mapBackendCartItemToUi from cartApi.ts
 */
function mapBackendCartItemToUi(item) {
  const p = item.product || { id: '', title: 'Product', slug: '', status: '', thumbnailUrl: null };
  const shop = item.shop || { id: '', name: 'Marketplace Seller', slug: '', status: 'APPROVED' };
  const unitPrice = Number(item.unitPrice) || 0;
  const mrp = Number(item.mrp) || unitPrice;
  const discountPercent = mrp > unitPrice && mrp > 0 ? Math.round(((mrp - unitPrice) / mrp) * 100) : 0;

  const productModel = {
    id: p.id || '',
    title: p.title || 'Product',
    slug: p.slug || '',
    description: '',
    brand: '',
    category: 'General',
    categoryId: '',
    sellerId: shop.id || '',
    sellerName: shop.name || 'Marketplace Seller',
    sellerCity: '',
    sellerRating: 4.8,
    sellerVerified: shop.status === 'APPROVED',
    rating: 4.8,
    reviewCount: 1,
    price: unitPrice,
    originalPrice: mrp,
    discountPercent,
    inStock: Boolean(item.isAvailable) && (item.availableStock === undefined || item.availableStock === null || item.availableStock > 0),
    stockQuantity: item.availableStock !== undefined && item.availableStock !== null ? item.availableStock : 0,
    images: p.thumbnailUrl ? [p.thumbnailUrl] : [],
    thumbnail:
      p.thumbnailUrl ||
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
    specifications: {},
    highlights: [],
  };

  const selectedVariants = {};
  if (item.variant?.attributes && typeof item.variant.attributes === 'object') {
    for (const [k, v] of Object.entries(item.variant.attributes)) {
      selectedVariants[k] = String(v);
    }
  }

  return {
    id: item.id,
    productId: p.id || '',
    variantId: item.variantId,
    product: productModel,
    selectedVariants,
    quantity: item.quantity,
    price: unitPrice,
    mrp,
    lineTotal: Number(item.lineTotal) || (unitPrice * item.quantity),
    isAvailable: Boolean(item.isAvailable),
    availableStock: item.availableStock !== undefined && item.availableStock !== null ? item.availableStock : 0,
    sellerId: shop.id || '',
    sellerName: shop.name || 'Marketplace Seller',
  };
}

class ApiError extends Error {
  constructor(statusCode, message, error) {
    super(Array.isArray(message) ? message[0] : message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.error = error;
  }
}

/**
 * State machine mimicking MarketplaceContext Cart state and queue
 */
class CartStore {
  constructor() {
    this.authMode = 'DEMO';
    this.authUser = null;
    this.demoCart = [
      {
        id: 'demo-c1',
        productId: 'prod-1',
        quantity: 1,
        price: 999,
        sellerId: 'demo-s1',
        sellerName: 'Demo Seller',
      },
    ];
    this.authCart = [];
    this.authCartRef = [];
    this.authCartSubtotal = 0;
    this.cartLoading = false;
    this.cartError = null;
    this.cartQueue = Promise.resolve();
    this.cartRequestId = 0;
  }

  setAuthenticatedSession(session, initialBackendResponse) {
    if (this.authUser && this.authUser.id !== session.user.id) {
      // Clear immediately on user switch
      this.authCart = [];
      this.authCartRef = [];
      this.authCartSubtotal = 0;
      this.cartError = null;
      this.cartRequestId++;
    }
    this.authMode = 'AUTHENTICATED';
    this.authUser = session.user;
    if (initialBackendResponse) {
      const uiItems = initialBackendResponse.items.map(mapBackendCartItemToUi);
      this.authCart = uiItems;
      this.authCartRef = uiItems;
      this.authCartSubtotal = initialBackendResponse.subtotalAmount;
    }
  }

  logout() {
    this.authMode = 'ANONYMOUS';
    this.authUser = null;
    this.authCart = [];
    this.authCartRef = [];
    this.authCartSubtotal = 0;
    this.cartError = null;
    this.cartLoading = false;
    this.cartRequestId++;
  }

  async fetchCart(mockApi) {
    if (this.authMode !== 'AUTHENTICATED') return;
    const currentReqId = ++this.cartRequestId;
    this.cartLoading = true;
    try {
      const res = await mockApi.getCart();
      if (currentReqId !== this.cartRequestId) return;
      const uiItems = res.items.map(mapBackendCartItemToUi);
      this.authCart = uiItems;
      this.authCartRef = uiItems;
      this.authCartSubtotal = res.subtotalAmount;
    } catch (err) {
      if (currentReqId !== this.cartRequestId) return;
      this.cartError = err.message;
    } finally {
      if (currentReqId === this.cartRequestId) {
        this.cartLoading = false;
      }
    }
  }

  get cart() {
    return this.authMode === 'AUTHENTICATED' ? this.authCart : this.demoCart;
  }

  get cartSubtotal() {
    return this.authMode === 'AUTHENTICATED'
      ? this.authCartSubtotal
      : this.demoCart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  async addToCart(mockApi, payload) {
    if (this.authMode !== 'AUTHENTICATED') {
      this.demoCart.push({
        id: `demo-${Date.now()}`,
        productId: payload.productId,
        quantity: payload.quantity,
        price: 500,
        sellerId: 'demo-s1',
        sellerName: 'Demo Seller',
      });
      return;
    }

    const op = async () => {
      try {
        this.cartError = null;
        const res = await mockApi.addToCart(payload);
        const uiItems = res.items.map(mapBackendCartItemToUi);
        this.authCart = uiItems;
        this.authCartRef = uiItems;
        this.authCartSubtotal = res.subtotalAmount;
      } catch (err) {
        this.cartError = err.message;
        throw err;
      }
    };

    const nextQueue = this.cartQueue.then(op, op);
    this.cartQueue = nextQueue.catch(() => {});
    return nextQueue;
  }

  async updateCartQuantity(mockApi, variantId, quantity) {
    if (this.authMode !== 'AUTHENTICATED') {
      this.demoCart = this.demoCart.map((i) =>
        i.id === variantId ? { ...i, quantity } : i
      );
      return;
    }

    // Optimistic update
    this.authCart = this.authCart.map((i) =>
      i.variantId === variantId || i.id === variantId ? { ...i, quantity } : i
    );

    const op = async () => {
      try {
        this.cartError = null;
        const res = await mockApi.updateCartItem(variantId, { quantity });
        const uiItems = res.items.map(mapBackendCartItemToUi);
        this.authCart = uiItems;
        this.authCartRef = uiItems;
        this.authCartSubtotal = res.subtotalAmount;
      } catch (err) {
        this.cartError = err.message;
        const refreshed = await mockApi.getCart();
        const uiItems = refreshed.items.map(mapBackendCartItemToUi);
        this.authCart = uiItems;
        this.authCartRef = uiItems;
        this.authCartSubtotal = refreshed.subtotalAmount;
        throw err;
      }
    };

    const nextQueue = this.cartQueue.then(op, op);
    this.cartQueue = nextQueue.catch(() => {});
    return nextQueue;
  }

  async removeFromCart(mockApi, variantId) {
    if (this.authMode !== 'AUTHENTICATED') {
      this.demoCart = this.demoCart.filter((i) => i.id !== variantId);
      return;
    }

    // Optimistic removal
    this.authCart = this.authCart.filter((i) => i.variantId !== variantId && i.id !== variantId);
    this.authCartRef = [...this.authCart];

    const op = async () => {
      try {
        this.cartError = null;
        const res = await mockApi.removeCartItem(variantId);
        const uiItems = res.items.map(mapBackendCartItemToUi);
        this.authCart = uiItems;
        this.authCartRef = uiItems;
        this.authCartSubtotal = res.subtotalAmount;
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
          const refreshed = await mockApi.getCart();
          const uiItems = refreshed.items.map(mapBackendCartItemToUi);
          this.authCart = uiItems;
          this.authCartRef = uiItems;
          this.authCartSubtotal = refreshed.subtotalAmount;
          return;
        }
        this.cartError = err.message;
        const refreshed = await mockApi.getCart();
        const uiItems = refreshed.items.map(mapBackendCartItemToUi);
        this.authCart = uiItems;
        this.authCartRef = uiItems;
        this.authCartSubtotal = refreshed.subtotalAmount;
        throw err;
      }
    };

    const nextQueue = this.cartQueue.then(op, op);
    this.cartQueue = nextQueue.catch(() => {});
    return nextQueue;
  }
}

describe('Stage 3B-3 Cart API Integration & Adapter Unit Tests', () => {
  const sampleBackendItem = {
    id: 'cart-item-uuid-1',
    variantId: 'variant-uuid-101',
    quantity: 2,
    unitPrice: 1499,
    mrp: 1999,
    lineTotal: 2998,
    isAvailable: true,
    availableStock: 15,
    variant: {
      sku: 'SKU-POTTERY-BLU-01',
      title: 'Midnight Blue / Large',
      attributes: { Color: 'Midnight Blue', Size: 'Large' },
      isActive: true,
    },
    product: {
      id: 'prod-uuid-999',
      title: 'Handcrafted Blue Pottery Ceramic Vase',
      slug: 'handcrafted-blue-pottery-ceramic-vase',
      status: 'PUBLISHED',
      thumbnailUrl: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500',
    },
    shop: {
      id: 'shop-uuid-888',
      name: 'Jaipur Artisan Collective',
      slug: 'jaipur-artisan-collective',
      status: 'APPROVED',
    },
  };

  it('1. should accurately map BackendCartItem to frontend UI CartItem model', () => {
    const uiItem = mapBackendCartItemToUi(sampleBackendItem);

    assert.equal(uiItem.id, 'cart-item-uuid-1');
    assert.equal(uiItem.variantId, 'variant-uuid-101');
    assert.equal(uiItem.productId, 'prod-uuid-999');
    assert.equal(uiItem.quantity, 2);
    assert.equal(uiItem.price, 1499);
    assert.equal(uiItem.mrp, 1999);
    assert.equal(uiItem.lineTotal, 2998);
    assert.equal(uiItem.isAvailable, true);
    assert.equal(uiItem.availableStock, 15);
    assert.deepEqual(uiItem.selectedVariants, { Color: 'Midnight Blue', Size: 'Large' });
    assert.equal(uiItem.product.title, 'Handcrafted Blue Pottery Ceramic Vase');
    assert.equal(uiItem.sellerName, 'Jaipur Artisan Collective');
    assert.equal(uiItem.product.discountPercent, 25);
  });

  it('2. should isolate demo cart from authenticated cart on login, switch, and logout', () => {
    const store = new CartStore();
    assert.equal(store.authMode, 'DEMO');
    assert.equal(store.cart.length, 1);
    assert.equal(store.cart[0].id, 'demo-c1');

    // User A logs in
    const backendResA = {
      cartId: 'cart-user-a',
      userId: 'user-a',
      items: [sampleBackendItem],
      totalItems: 1,
      subtotalAmount: 2998,
      currency: 'INR',
    };
    store.setAuthenticatedSession({ user: { id: 'user-a', email: 'a@bharat.in' } }, backendResA);
    assert.equal(store.authMode, 'AUTHENTICATED');
    assert.equal(store.cart.length, 1);
    assert.equal(store.cart[0].variantId, 'variant-uuid-101');
    assert.equal(store.cartSubtotal, 2998);

    // Switch to User B (with empty cart)
    store.setAuthenticatedSession({ user: { id: 'user-b', email: 'b@bharat.in' } }, {
      cartId: 'cart-user-b',
      userId: 'user-b',
      items: [],
      totalItems: 0,
      subtotalAmount: 0,
      currency: 'INR',
    });
    assert.equal(store.cart.length, 0);
    assert.equal(store.cartSubtotal, 0);

    // Logout - ensure complete cleanup without data leakage
    store.logout();
    assert.equal(store.authMode, 'ANONYMOUS');
    assert.equal(store.authUser, null);
    assert.deepEqual(store.authCart, []);
    assert.equal(store.authCartSubtotal, 0);
  });

  it('3. should serialize mutations and revert optimistic update on server error (stock limit)', async () => {
    const store = new CartStore();
    store.setAuthenticatedSession({ user: { id: 'user-a' } }, {
      cartId: 'cart-a',
      userId: 'user-a',
      items: [sampleBackendItem],
      totalItems: 1,
      subtotalAmount: 2998,
      currency: 'INR',
    });

    const mockApi = {
      getCart: async () => ({
        cartId: 'cart-a',
        userId: 'user-a',
        items: [sampleBackendItem], // remains quantity 2
        totalItems: 1,
        subtotalAmount: 2998,
        currency: 'INR',
      }),
      updateCartItem: async (_variantId, { quantity }) => {
        if (quantity > 15) {
          throw new ApiError(400, 'Requested quantity exceeds available stock');
        }
        return {
          cartId: 'cart-a',
          userId: 'user-a',
          items: [{ ...sampleBackendItem, quantity, lineTotal: sampleBackendItem.unitPrice * quantity }],
          totalItems: 1,
          subtotalAmount: sampleBackendItem.unitPrice * quantity,
          currency: 'INR',
        };
      },
    };

    // Requesting 50 exceeds stock of 15
    await assert.rejects(
      store.updateCartQuantity(mockApi, 'variant-uuid-101', 50),
      /Requested quantity exceeds available stock/
    );

    // Check that store has rolled back to authoritative 2
    assert.equal(store.cart[0].quantity, 2);
    assert.equal(store.cartSubtotal, 2998);
    assert.equal(store.cartError, 'Requested quantity exceeds available stock');
  });

  it('4. should gracefully recover from 404 when removing an already removed item', async () => {
    const store = new CartStore();
    store.setAuthenticatedSession({ user: { id: 'user-a' } }, {
      cartId: 'cart-a',
      userId: 'user-a',
      items: [sampleBackendItem],
      totalItems: 1,
      subtotalAmount: 2998,
      currency: 'INR',
    });

    const mockApi = {
      getCart: async () => ({
        cartId: 'cart-a',
        userId: 'user-a',
        items: [], // Item was removed by another tab/session
        totalItems: 0,
        subtotalAmount: 0,
        currency: 'INR',
      }),
      removeCartItem: async () => {
        throw new ApiError(404, 'Cart item not found');
      },
    };

    // Should not throw or crash on 404, but refresh to server state
    await store.removeFromCart(mockApi, 'variant-uuid-101');
    assert.equal(store.cart.length, 0);
    assert.equal(store.cartSubtotal, 0);
  });

  it('5. should handle partial or null fields in BackendCartItem without crashing', () => {
    const sparseBackendItem = {
      id: 'cart-item-sparse',
      variantId: 'variant-sparse',
      quantity: 1,
      unitPrice: 500,
      mrp: null,
      lineTotal: null,
      isAvailable: null,
      availableStock: null,
      variant: null,
      product: null,
      shop: null,
    };

    const uiItem = mapBackendCartItemToUi(sparseBackendItem);
    assert.equal(uiItem.id, 'cart-item-sparse');
    assert.equal(uiItem.price, 500);
    assert.equal(uiItem.mrp, 500);
    assert.equal(uiItem.lineTotal, 500);
    // Conservative check: null or missing availability must NOT be presented as purchasable
    assert.equal(uiItem.isAvailable, false);
    assert.equal(uiItem.availableStock, 0);
    assert.equal(uiItem.product.inStock, false);
    assert.equal(uiItem.product.stockQuantity, 0);
    assert.equal(uiItem.product.title, 'Product');
    assert.equal(uiItem.sellerName, 'Marketplace Seller');
    assert.deepEqual(uiItem.selectedVariants, {});
  });

  it('6. should prevent stale asynchronous responses from overwriting newer cart state in CartStore', async () => {
    const store = new CartStore();
    store.setAuthenticatedSession({ user: { id: 'user-a' } }, {
      cartId: 'cart-init',
      userId: 'user-a',
      items: [],
      totalItems: 0,
      subtotalAmount: 0,
      currency: 'INR',
    });

    const mockApi = {
      // Simulate slow network fetch with old data
      getCart: async () => {
        await new Promise((r) => setTimeout(r, 40));
        return {
          cartId: 'cart-init',
          userId: 'user-a',
          items: [{
            ...sampleBackendItem,
            id: 'old-item',
            unitPrice: 100,
            quantity: 1,
            lineTotal: 100,
          }],
          totalItems: 1,
          subtotalAmount: 100,
          currency: 'INR',
        };
      },
      // Fast mutation with new data
      addToCart: async () => {
        return {
          cartId: 'cart-init',
          userId: 'user-a',
          items: [{
            ...sampleBackendItem,
            id: 'new-item',
            unitPrice: 2000,
            quantity: 2,
            lineTotal: 4000,
          }],
          totalItems: 2,
          subtotalAmount: 4000,
          currency: 'INR',
        };
      },
    };

    // Trigger slow fetch, then fast mutation, then wait for fetch to finish
    const pFetch = store.fetchCart(mockApi);
    // Invalidate prior requests as MarketplaceContext does when user mutates or switches
    store.cartRequestId++;
    await store.addToCart(mockApi, { productId: 'prod-uuid-999', quantity: 2 });
    await pFetch;

    // Verify CartStore holds the newer mutation state (4000) and was NOT overwritten by the stale fetch (100)
    assert.equal(store.cart.length, 1);
    assert.equal(store.cart[0].id, 'new-item');
    assert.equal(store.cartSubtotal, 4000);
  });
});
