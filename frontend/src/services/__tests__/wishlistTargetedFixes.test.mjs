import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mock ApiError mirroring apiClient.ts ApiError
 */
class ApiError extends Error {
  constructor(statusCode, message, error) {
    super(Array.isArray(message) ? message[0] : message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.error = error;
  }
}

/**
 * Encapsulated test model of the MarketplaceContext Wishlist state machine
 * with sequential mutation queue, delta rollbacks, 404 recovery, and session isolation.
 */
class WishlistStore {
  constructor() {
    this.authMode = 'DEMO';
    this.authUser = null;
    this.demoWishlist = ['demo-p1', 'demo-p2'];
    this.authWishlistIds = [];
    this.authWishlistProducts = [];
    this.wishlistLoading = false;
    this.wishlistError = null;

    // Mutex queue & refs mirroring MarketplaceContext
    this.wishlistQueue = Promise.resolve();
    this.authWishlistIdsRef = [];
    this.authWishlistProductsRef = [];
  }

  setAuthenticatedSession(session, initialServerItems = []) {
    // Immediate clearance when switching accounts
    if (this.authUser && this.authUser.id !== session.user.id) {
      this.authWishlistIds = [];
      this.authWishlistProducts = [];
      this.authWishlistIdsRef = [];
      this.authWishlistProductsRef = [];
      this.wishlistError = null;
    }
    this.authMode = 'AUTHENTICATED';
    this.authUser = session.user;
    this.wishlistLoading = true;

    // Simulate backend fetch synchronization
    this.authWishlistIds = initialServerItems.map((i) => i.productId);
    this.authWishlistProducts = initialServerItems.map((i) => i.product);
    this.authWishlistIdsRef = [...this.authWishlistIds];
    this.authWishlistProductsRef = [...this.authWishlistProducts];
    this.wishlistLoading = false;
  }

  logout() {
    this.authMode = 'ANONYMOUS';
    this.authUser = null;
    this.authWishlistIds = [];
    this.authWishlistProducts = [];
    this.authWishlistIdsRef = [];
    this.authWishlistProductsRef = [];
    this.wishlistError = null;
    this.wishlistLoading = false;
  }

  async toggleWishlist(productId, mockApi) {
    if (this.authMode !== 'AUTHENTICATED') {
      const exists = this.demoWishlist.includes(productId);
      this.demoWishlist = exists
        ? this.demoWishlist.filter((id) => id !== productId)
        : [...this.demoWishlist, productId];
      return;
    }

    const alreadyIn = this.authWishlistIdsRef.includes(productId);

    if (alreadyIn) {
      // Optimistic removal
      this.authWishlistIds = this.authWishlistIds.filter((id) => id !== productId);
      this.authWishlistProducts = this.authWishlistProducts.filter((p) => p.id !== productId);
      this.authWishlistIdsRef = this.authWishlistIdsRef.filter((id) => id !== productId);
      this.authWishlistProductsRef = this.authWishlistProductsRef.filter((p) => p.id !== productId);

      const runOp = async () => {
        try {
          const res = await mockApi.removeFromWishlist(productId);
          this.authWishlistIds = res.items.map((i) => i.productId);
          this.authWishlistProducts = res.items.map((i) => i.product);
          this.authWishlistIdsRef = [...this.authWishlistIds];
          this.authWishlistProductsRef = [...this.authWishlistProducts];
          this.wishlistError = null;
        } catch (err) {
          if (err instanceof ApiError && err.statusCode === 404) {
            const refreshed = await mockApi.getWishlist();
            this.authWishlistIds = refreshed.items.map((i) => i.productId);
            this.authWishlistProducts = refreshed.items.map((i) => i.product);
            this.authWishlistIdsRef = [...this.authWishlistIds];
            this.authWishlistProductsRef = [...this.authWishlistProducts];
            this.wishlistError = null;
            return;
          }

          // Delta rollback: re-add only this product
          if (!this.authWishlistIds.includes(productId)) {
            this.authWishlistIds = [...this.authWishlistIds, productId];
          }
          if (!this.authWishlistIdsRef.includes(productId)) {
            this.authWishlistIdsRef = [...this.authWishlistIdsRef, productId];
          }
          this.wishlistError = err.message;
          throw err;
        }
      };

      const current = this.wishlistQueue.then(runOp, runOp);
      this.wishlistQueue = current.catch(() => {});
      return current;
    } else {
      // Optimistic add
      if (!this.authWishlistIds.includes(productId)) {
        this.authWishlistIds = [...this.authWishlistIds, productId];
      }
      if (!this.authWishlistIdsRef.includes(productId)) {
        this.authWishlistIdsRef = [...this.authWishlistIdsRef, productId];
      }

      const runOp = async () => {
        try {
          const res = await mockApi.addToWishlist(productId);
          this.authWishlistIds = res.items.map((i) => i.productId);
          this.authWishlistProducts = res.items.map((i) => i.product);
          this.authWishlistIdsRef = [...this.authWishlistIds];
          this.authWishlistProductsRef = [...this.authWishlistProducts];
          this.wishlistError = null;
        } catch (err) {
          // Delta rollback: remove only this product
          this.authWishlistIds = this.authWishlistIds.filter((id) => id !== productId);
          this.authWishlistProducts = this.authWishlistProducts.filter((p) => p.id !== productId);
          this.authWishlistIdsRef = this.authWishlistIdsRef.filter((id) => id !== productId);
          this.authWishlistProductsRef = this.authWishlistProductsRef.filter((p) => p.id !== productId);
          this.wishlistError = err.message;
          throw err;
        }
      };

      const current = this.wishlistQueue.then(runOp, runOp);
      this.wishlistQueue = current.catch(() => {});
      return current;
    }
  }

  async removeFromWishlist(productId, mockApi) {
    if (this.authMode !== 'AUTHENTICATED') {
      this.demoWishlist = this.demoWishlist.filter((id) => id !== productId);
      return;
    }

    this.authWishlistIds = this.authWishlistIds.filter((id) => id !== productId);
    this.authWishlistProducts = this.authWishlistProducts.filter((p) => p.id !== productId);
    this.authWishlistIdsRef = this.authWishlistIdsRef.filter((id) => id !== productId);
    this.authWishlistProductsRef = this.authWishlistProductsRef.filter((p) => p.id !== productId);

    const runOp = async () => {
      try {
        const res = await mockApi.removeFromWishlist(productId);
        this.authWishlistIds = res.items.map((i) => i.productId);
        this.authWishlistProducts = res.items.map((i) => i.product);
        this.authWishlistIdsRef = [...this.authWishlistIds];
        this.authWishlistProductsRef = [...this.authWishlistProducts];
        this.wishlistError = null;
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
          const refreshed = await mockApi.getWishlist();
          this.authWishlistIds = refreshed.items.map((i) => i.productId);
          this.authWishlistProducts = refreshed.items.map((i) => i.product);
          this.authWishlistIdsRef = [...this.authWishlistIds];
          this.authWishlistProductsRef = [...this.authWishlistProducts];
          this.wishlistError = null;
          return;
        }

        if (!this.authWishlistIds.includes(productId)) {
          this.authWishlistIds = [...this.authWishlistIds, productId];
        }
        if (!this.authWishlistIdsRef.includes(productId)) {
          this.authWishlistIdsRef = [...this.authWishlistIdsRef, productId];
        }
        this.wishlistError = err.message;
        throw err;
      }
    };

    const current = this.wishlistQueue.then(runOp, runOp);
    this.wishlistQueue = current.catch(() => {});
    return current;
  }

  async clearWishlist(mockApi) {
    if (this.authMode !== 'AUTHENTICATED') {
      this.demoWishlist = [];
      return;
    }

    const snapshotIds = [...this.authWishlistIdsRef];
    const snapshotProducts = [...this.authWishlistProductsRef];
    this.authWishlistIds = [];
    this.authWishlistProducts = [];
    this.authWishlistIdsRef = [];
    this.authWishlistProductsRef = [];

    const runOp = async () => {
      try {
        await mockApi.clearWishlist();
        this.wishlistError = null;
      } catch (err) {
        if (this.authWishlistIdsRef.length === 0) {
          this.authWishlistIds = snapshotIds;
          this.authWishlistProducts = snapshotProducts;
          this.authWishlistIdsRef = snapshotIds;
          this.authWishlistProductsRef = snapshotProducts;
        }
        this.wishlistError = err.message;
        throw err;
      }
    };

    const current = this.wishlistQueue.then(runOp, runOp);
    this.wishlistQueue = current.catch(() => {});
    return current;
  }
}

describe('Stage 3B-2 Targeted Bug Fixes - Wishlist Store & Mutation Tests', () => {
  it('1. should load wishlist after login and clear immediately on account switch / logout', async () => {
    const store = new WishlistStore();

    // Initial state: Demo mode
    assert.strictEqual(store.authMode, 'DEMO');
    assert.strictEqual(store.demoWishlist.length, 2);

    // Login User A
    const userA = { id: 'user-a-uuid', firstName: 'Aarav', lastName: 'Patel', email: 'aarav@example.com' };
    store.setAuthenticatedSession({ user: userA, accessToken: 'token-a' }, [
      { productId: 'prod-1', product: { id: 'prod-1', title: 'Silk Saree' } },
    ]);

    assert.strictEqual(store.authMode, 'AUTHENTICATED');
    assert.strictEqual(store.authUser.id, 'user-a-uuid');
    assert.deepStrictEqual(store.authWishlistIds, ['prod-1']);

    // Switch to User B - verify previous user A data is immediately cleared and not leaked
    const userB = { id: 'user-b-uuid', firstName: 'Priya', lastName: 'Sharma', email: 'priya@example.com' };
    store.setAuthenticatedSession({ user: userB, accessToken: 'token-b' }, [
      { productId: 'prod-2', product: { id: 'prod-2', title: 'Brass Diya' } },
    ]);

    assert.strictEqual(store.authUser.id, 'user-b-uuid');
    assert.deepStrictEqual(store.authWishlistIds, ['prod-2']);
    assert.strictEqual(store.authWishlistIds.includes('prod-1'), false);

    // Logout - ensure complete cleanup without data leakage
    store.logout();
    assert.strictEqual(store.authMode, 'ANONYMOUS');
    assert.strictEqual(store.authUser, null);
    assert.deepStrictEqual(store.authWishlistIds, []);
    assert.deepStrictEqual(store.authWishlistProducts, []);
  });

  it('2. should handle one failed mutation overlapping a successful mutation without losing updates', async () => {
    const store = new WishlistStore();
    const user = { id: 'user-123', firstName: 'Rohan', lastName: 'Mehta' };
    store.setAuthenticatedSession({ user, accessToken: 'token' }, []);

    // Product A will fail on server (network error)
    // Product B will succeed on server
    let serverItems = [];

    const mockApi = {
      addToWishlist: async (id) => {
        if (id === 'prod-fail-a') {
          // Simulating latency and server error
          await new Promise((r) => setTimeout(r, 20));
          throw new Error('Network error on Prod A');
        }
        // Prod B succeeds
        await new Promise((r) => setTimeout(r, 10));
        serverItems.push({ productId: id, product: { id, title: `Product ${id}` } });
        return { items: [...serverItems] };
      },
      removeFromWishlist: async () => ({ items: [] }),
      getWishlist: async () => ({ items: [...serverItems] }),
    };

    // Rapid overlapping mutations dispatched in quick succession:
    // 1. Add Prod A (which will fail)
    // 2. Add Prod B (which will succeed)
    const p1 = store.toggleWishlist('prod-fail-a', mockApi).catch(() => {});
    const p2 = store.toggleWishlist('prod-success-b', mockApi);

    await Promise.all([p1, p2]);

    // Product A rolled back cleanly; Product B was preserved and not wiped out!
    assert.deepStrictEqual(store.authWishlistIds, ['prod-success-b']);
    assert.strictEqual(store.authWishlistProducts.length, 1);
    assert.strictEqual(store.authWishlistProducts[0].id, 'prod-success-b');
  });

  it('3. should support concurrent add and remove actions on different products without race conditions', async () => {
    const store = new WishlistStore();
    const user = { id: 'user-123', firstName: 'Rohan', lastName: 'Mehta' };
    store.setAuthenticatedSession({ user, accessToken: 'token' }, [
      { productId: 'prod-to-remove', product: { id: 'prod-to-remove', title: 'Old Item' } },
    ]);

    let serverWishlist = [{ productId: 'prod-to-remove', product: { id: 'prod-to-remove', title: 'Old Item' } }];

    const mockApi = {
      addToWishlist: async (id) => {
        await new Promise((r) => setTimeout(r, 15));
        serverWishlist.push({ productId: id, product: { id, title: `New Item ${id}` } });
        return { items: [...serverWishlist] };
      },
      removeFromWishlist: async (id) => {
        await new Promise((r) => setTimeout(r, 10));
        serverWishlist = serverWishlist.filter((i) => i.productId !== id);
        return { items: [...serverWishlist] };
      },
      getWishlist: async () => ({ items: [...serverWishlist] }),
    };

    // Rapidly remove prod-to-remove and add prod-new-add
    const opRemove = store.removeFromWishlist('prod-to-remove', mockApi);
    const opAdd = store.toggleWishlist('prod-new-add', mockApi);

    await Promise.all([opRemove, opAdd]);

    assert.deepStrictEqual(store.authWishlistIds, ['prod-new-add']);
    assert.strictEqual(store.authWishlistProducts[0].id, 'prod-new-add');
  });

  it('4. should handle server-side 404 when removing an item already removed on server without infinite loops', async () => {
    const store = new WishlistStore();
    const user = { id: 'user-123', firstName: 'Rohan', lastName: 'Mehta' };
    store.setAuthenticatedSession({ user, accessToken: 'token' }, [
      { productId: 'prod-ghost', product: { id: 'prod-ghost', title: 'Ghost Item' } },
    ]);

    let fetchCount = 0;
    const mockApi = {
      removeFromWishlist: async (id) => {
        // Backend NestJS NotFoundException returns 404: "Product is not in your wishlist"
        throw new ApiError(404, 'Product is not in your wishlist', 'Not Found');
      },
      getWishlist: async () => {
        fetchCount++;
        // Authoritative server state has no items
        return { items: [] };
      },
    };

    // Removing the already absent item
    await store.removeFromWishlist('prod-ghost', mockApi);

    // Assert it gracefully refreshed state, did not enter loop, and did not re-add the ghost item
    assert.strictEqual(fetchCount, 1);
    assert.deepStrictEqual(store.authWishlistIds, []);
    assert.deepStrictEqual(store.authWishlistProducts, []);
    assert.strictEqual(store.wishlistError, null);
  });

  it('5. should clear wishlist cleanly and rollback only on true failure without leaking', async () => {
    const store = new WishlistStore();
    const user = { id: 'user-123', firstName: 'Rohan', lastName: 'Mehta' };
    store.setAuthenticatedSession({ user, accessToken: 'token' }, [
      { productId: 'prod-1', product: { id: 'prod-1', title: 'Item 1' } },
      { productId: 'prod-2', product: { id: 'prod-2', title: 'Item 2' } },
    ]);

    // Test successful clear
    let clearCalled = false;
    const mockApiSuccess = {
      clearWishlist: async () => {
        clearCalled = true;
        return { message: 'Wishlist cleared successfully' };
      },
    };

    await store.clearWishlist(mockApiSuccess);
    assert.strictEqual(clearCalled, true);
    assert.deepStrictEqual(store.authWishlistIds, []);
    assert.deepStrictEqual(store.authWishlistProducts, []);

    // Restore state
    store.setAuthenticatedSession({ user, accessToken: 'token' }, [
      { productId: 'prod-1', product: { id: 'prod-1', title: 'Item 1' } },
    ]);

    // Test failed clear - rolls back to previous snapshot
    const mockApiFail = {
      clearWishlist: async () => {
        throw new Error('Server 500 error on clear');
      },
    };

    await store.clearWishlist(mockApiFail).catch(() => {});
    assert.deepStrictEqual(store.authWishlistIds, ['prod-1']);
    assert.strictEqual(store.wishlistError, 'Server 500 error on clear');
  });
});
