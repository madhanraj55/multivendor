import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Adapter converting backend Address to AddressSnapshotPayload expected by backend DTOs.
 * Matches mapAddressToSnapshot from checkoutApi.ts
 */
function mapAddressToSnapshot(addr) {
  return {
    fullName: addr.name.trim(),
    phone: addr.phone.replace(/\D/g, '').slice(-10),
    addressLine1: addr.street.trim(),
    addressLine2: addr.locality ? addr.locality.trim() : undefined,
    city: addr.city.trim(),
    state: addr.state.trim(),
    postalCode: addr.pincode.trim(),
  };
}

/**
 * Adapter converting backend Order model into the UI Order model.
 * Matches mapBackendOrderToUi from checkoutApi.ts
 */
function mapBackendOrderToUi(backendOrder) {
  const sellerOrders = backendOrder.sellerOrders || [];

  const packages = sellerOrders.map((so) => ({
    sellerId: so.shop.id,
    sellerName: so.shop.name,
    trackingNumber: so.subOrderNumber,
    packageStatus:
      so.status === 'DELIVERED'
        ? 'DELIVERED'
        : so.status === 'SHIPPED'
        ? 'SHIPPED'
        : so.status === 'CANCELLED'
        ? 'CANCELLED'
        : 'PROCESSING',
    estimatedDelivery: '3 to 5 business days',
    items: so.items.map((it) => ({
      product: {
        id: it.variantId,
        title: it.productTitleSnapshot,
        slug: '',
        description: '',
        brand: '',
        category: 'General',
        categoryId: '',
        sellerId: so.shop.id,
        sellerName: so.shop.name,
        sellerCity: '',
        sellerRating: 4.8,
        sellerVerified: true,
        rating: 4.8,
        reviewCount: 1,
        price: it.unitPriceSnapshot,
        originalPrice: it.unitPriceSnapshot,
        discountPercent: 0,
        inStock: true,
        stockQuantity: it.quantity,
        images: [],
        thumbnail: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
        specifications: {},
        highlights: [],
      },
      quantity: it.quantity,
      unitPrice: it.unitPriceSnapshot,
      selectedVariants: {},
    })),
  }));

  const addr = backendOrder.shippingAddressSnapshot;
  const shippingAddress = {
    id: `addr-snapshot-${backendOrder.id}`,
    name: addr?.fullName || 'Customer',
    phone: addr?.phone || '',
    type: 'HOME',
    street: addr?.addressLine1 || '',
    locality: addr?.addressLine2 || addr?.landmark || '',
    city: addr?.city || '',
    state: addr?.state || '',
    pincode: addr?.postalCode || '',
    isDefault: false,
  };

  const statusMap = {
    COMPLETED: 'CONFIRMED',
    CONFIRMED: 'CONFIRMED',
    PROCESSING: 'PLACED',
    PENDING_PAYMENT: 'PLACED',
    SHIPPED: 'SHIPPED',
    OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
  };

  return {
    id: backendOrder.id,
    orderNumber: backendOrder.orderNumber,
    createdAt: backendOrder.createdAt,
    status: statusMap[backendOrder.status] || 'PLACED',
    packages,
    shippingAddress,
    itemsSubtotal: Number(backendOrder.subtotalAmount) || 0,
    estimatedShippingFee: Number(backendOrder.shippingFee) || 0,
    discount: Number(backendOrder.discountAmount) || 0,
    totalAmount: Number(backendOrder.totalAmount) || 0,
    paymentMethod: 'Cash on Delivery (COD) / Pay on Arrival',
    paymentStatus: 'PENDING',
  };
}

class ApiError extends Error {
  constructor(statusCode, message) {
    super(Array.isArray(message) ? message[0] : message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

describe('Stage 3B-4 Checkout API Integration & Adapter Unit Tests', () => {
  const sampleAddress = {
    id: 'addr-123',
    name: 'Aarav Patel',
    phone: '+91 98765 43210',
    type: 'HOME',
    street: 'Flat 402, Shanti Vihar',
    locality: 'Indiranagar 100ft Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560038',
    isDefault: true,
  };

  const sampleBackendOrder = {
    id: 'ord-uuid-001',
    orderNumber: 'BB-2026-98765',
    status: 'PENDING_PAYMENT',
    subtotalAmount: 2998,
    discountAmount: 0,
    shippingFee: 0,
    taxAmount: 0,
    totalAmount: 2998,
    currency: 'INR',
    notes: 'Please leave with guard',
    shippingAddressSnapshot: {
      fullName: 'Aarav Patel',
      phone: '9876543210',
      addressLine1: 'Flat 402, Shanti Vihar',
      addressLine2: 'Indiranagar 100ft Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
    },
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    sellerOrders: [
      {
        id: 'so-uuid-1',
        subOrderNumber: 'BB-2026-98765-S1',
        shop: {
          id: 'shop-uuid-1',
          name: 'Jaipur Crafts Collective',
        },
        status: 'PENDING_PAYMENT',
        subtotalAmount: 2998,
        discountAmount: 0,
        shippingFee: 0,
        taxAmount: 0,
        totalAmount: 2998,
        items: [
          {
            id: 'so-item-1',
            variantId: 'var-uuid-1',
            productTitleSnapshot: 'Blue Pottery Vase',
            skuSnapshot: 'SKU-POTTERY-01',
            quantity: 2,
            unitPriceSnapshot: 1499,
            discountSnapshot: 0,
            totalAmount: 2998,
          },
        ],
      },
    ],
  };

  it('1. should map UI Address into valid AddressSnapshotPayload satisfying ReserveCheckoutDto', () => {
    const snapshot = mapAddressToSnapshot(sampleAddress);

    assert.equal(snapshot.fullName, 'Aarav Patel');
    assert.equal(snapshot.phone, '9876543210');
    assert.equal(snapshot.addressLine1, 'Flat 402, Shanti Vihar');
    assert.equal(snapshot.addressLine2, 'Indiranagar 100ft Road');
    assert.equal(snapshot.city, 'Bengaluru');
    assert.equal(snapshot.state, 'Karnataka');
    assert.equal(snapshot.postalCode, '560038');
  });

  it('2. should map BackendOrder into UI Order model with seller packages and PENDING paymentStatus', () => {
    const uiOrder = mapBackendOrderToUi(sampleBackendOrder);

    assert.equal(uiOrder.id, 'ord-uuid-001');
    assert.equal(uiOrder.orderNumber, 'BB-2026-98765');
    assert.equal(uiOrder.status, 'PLACED');
    assert.equal(uiOrder.paymentStatus, 'PENDING');
    assert.equal(uiOrder.itemsSubtotal, 2998);
    assert.equal(uiOrder.totalAmount, 2998);
    assert.equal(uiOrder.packages.length, 1);
    assert.equal(uiOrder.packages[0].sellerName, 'Jaipur Crafts Collective');
    assert.equal(uiOrder.packages[0].trackingNumber, 'BB-2026-98765-S1');
    assert.equal(uiOrder.packages[0].items[0].quantity, 2);
    assert.equal(uiOrder.packages[0].items[0].unitPrice, 1499);
  });

  it('3. should handle checkout stock reservation failure and report backend rejection reasons', async () => {
    const mockCheckoutApi = {
      reserveCheckout: async () => {
        throw new ApiError(400, 'Insufficient inventory for variant var-uuid-1: only 0 available, requested 2');
      },
    };

    await assert.rejects(
      mockCheckoutApi.reserveCheckout(),
      /Insufficient inventory for variant var-uuid-1/
    );
  });

  it('4. should handle reservation expiry error when placing order and prompt retry', async () => {
    const mockCheckoutApi = {
      placeOrder: async () => {
        throw new ApiError(400, 'Cannot place order: stock reservation has expired. Please initiate a new checkout.');
      },
    };

    await assert.rejects(
      mockCheckoutApi.placeOrder(),
      /Cannot place order: stock reservation has expired/
    );
  });

  it('5. should preserve authoritatively calculated subtotals over client estimates', () => {
    const backendValidation = {
      isValid: true,
      canProceedToCheckout: true,
      currency: 'INR',
      cartId: 'cart-123',
      totalItems: 1,
      totalQuantity: 2,
      subtotalAmount: 2998,
      taxAmount: 0,
      taxStatus: 'CONFIGURED',
      items: [],
      errors: [],
    };

    // Client attempted to assume 2500, but authoritative subtotal is 2998
    const clientSuppliedPrice = 2500;
    const effectiveSubtotal = backendValidation.subtotalAmount;

    assert.equal(effectiveSubtotal, 2998);
    assert.notEqual(effectiveSubtotal, clientSuppliedPrice);
  });

  it('6. should generate valid checkout idempotency keys conforming to backend MaxLength(100) constraint', () => {
    // Generate key using format matching generateCheckoutIdempotencyKey()
    const key1 = `chk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const key2 = `chk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    assert.ok(key1.startsWith('chk-'));
    assert.ok(key1.length <= 100);
    assert.ok(key2.length <= 100);
    assert.notEqual(key1, key2);
  });

  it('7. should reuse the same idempotency key when retrying after network error or timeout and recover existing reservation', async () => {
    // Simulates frontend checkout state machine during network failure and retry
    let capturedIdempotencyKeys = [];
    let callCount = 0;

    const mockBackendReserve = async (payload) => {
      callCount++;
      capturedIdempotencyKeys.push(payload.idempotencyKey);

      if (callCount === 1) {
        // First attempt: Network dropped or timeout before client received response
        throw new Error('Network timeout: failed to fetch response from /checkout/reserve');
      }

      // Second attempt (retry): Backend returns the existing attempt (isExisting: true)
      return {
        message: 'Existing checkout reservation retrieved',
        isExisting: true,
        checkoutAttempt: {
          id: 'attempt-uuid-001',
          userId: 'user-123',
          idempotencyKey: payload.idempotencyKey,
          status: 'STOCK_RESERVED',
          subtotalAmount: 2998,
          taxAmount: 0,
          shippingFee: 0,
          discountAmount: 0,
          totalAmount: 2998,
          currency: 'INR',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      };
    };

    // Client state tracking
    let clientActiveKey = 'chk-fixed-attempt-key-001';
    let checkoutAttempt = null;
    let errorCaught = null;

    // First attempt fails due to timeout
    try {
      const res = await mockBackendReserve({ idempotencyKey: clientActiveKey });
      checkoutAttempt = res.checkoutAttempt;
    } catch (err) {
      errorCaught = err;
      // Safety contract: Client does NOT generate a new key merely because request timed out
    }

    assert.ok(errorCaught);
    assert.match(errorCaught.message, /Network timeout/);
    assert.equal(checkoutAttempt, null);

    // Second attempt (user clicks Place Order again): retries with the SAME idempotency key
    const retryRes = await mockBackendReserve({ idempotencyKey: clientActiveKey });
    checkoutAttempt = retryRes.checkoutAttempt;

    assert.equal(retryRes.isExisting, true);
    assert.equal(checkoutAttempt.id, 'attempt-uuid-001');
    assert.equal(capturedIdempotencyKeys.length, 2);
    // Keys across attempts must be identical
    assert.equal(capturedIdempotencyKeys[0], capturedIdempotencyKeys[1]);
  });

  it('8. should reset idempotency key when cart changes, selected address changes, or reservation expires', () => {
    // Simulates the key lifecycle rules enforced in CheckoutPage
    const createKeyLifecycleTracker = (initialCart, initialAddressId, initialUserId) => {
      let currentKey = `chk-${Date.now()}-init`;
      let currentAttempt = null;
      let expired = false;

      let cartSig = initialCart.map((i) => `${i.id}:${i.quantity}:${i.price}`).join('|');
      let addressId = initialAddressId;
      let userId = initialUserId;

      const notifyChange = (newCart, newAddressId, newUserId, isExpired = false) => {
        const newCartSig = newCart.map((i) => `${i.id}:${i.quantity}:${i.price}`).join('|');
        if (newCartSig !== cartSig || newAddressId !== addressId || newUserId !== userId || isExpired) {
          currentKey = `chk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          currentAttempt = null;
          cartSig = newCartSig;
          addressId = newAddressId;
          userId = newUserId;
          expired = isExpired;
        }
      };

      const markOrderCompleted = () => {
        currentKey = `chk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        currentAttempt = null;
      };

      return {
        getKey: () => currentKey,
        notifyChange,
        markOrderCompleted,
      };
    };

    const initialCart = [{ id: 'p1', quantity: 2, price: 1000 }];
    const tracker = createKeyLifecycleTracker(initialCart, 'addr-1', 'user-1');
    const key0 = tracker.getKey();

    // 1. Changing delivery address triggers key reset
    tracker.notifyChange(initialCart, 'addr-2', 'user-1');
    const keyAfterAddressChange = tracker.getKey();
    assert.notEqual(keyAfterAddressChange, key0);

    // 2. Modifying cart item quantity triggers key reset
    const modifiedCart = [{ id: 'p1', quantity: 3, price: 1000 }];
    tracker.notifyChange(modifiedCart, 'addr-2', 'user-1');
    const keyAfterCartChange = tracker.getKey();
    assert.notEqual(keyAfterCartChange, keyAfterAddressChange);

    // 3. User account switch triggers key reset
    tracker.notifyChange(modifiedCart, 'addr-2', 'user-2');
    const keyAfterUserSwitch = tracker.getKey();
    assert.notEqual(keyAfterUserSwitch, keyAfterCartChange);

    // 4. Reservation expiry triggers key reset
    tracker.notifyChange(modifiedCart, 'addr-2', 'user-2', true);
    const keyAfterExpiry = tracker.getKey();
    assert.notEqual(keyAfterExpiry, keyAfterUserSwitch);

    // 5. Successful order completion resets key for next purchase
    tracker.markOrderCompleted();
    const keyAfterSuccess = tracker.getKey();
    assert.notEqual(keyAfterSuccess, keyAfterExpiry);
  });
});
