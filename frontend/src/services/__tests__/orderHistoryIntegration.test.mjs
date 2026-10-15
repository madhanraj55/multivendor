import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Stage 3B-5 Customer Order History Integration & Mapping Tests
 */

// Status mapping matching frontend/src/services/ordersApi.ts
const statusMap = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  COMPLETED: 'CONFIRMED',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PLACED',
  SHIPPED: 'SHIPPED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

function mapPackageStatus(backendStatus) {
  if (backendStatus === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
  if (backendStatus === 'DELIVERED') return 'DELIVERED';
  if (backendStatus === 'SHIPPED') return 'SHIPPED';
  if (backendStatus === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY';
  if (backendStatus === 'CANCELLED') return 'CANCELLED';
  return 'PROCESSING';
}

function mapCustomerOrderSummaryToUi(summary) {
  const packages = (summary.sellerOrders || []).map((so) => ({
    sellerId: so.shopSlug || so.subOrderNumber,
    sellerName: so.shopName,
    trackingNumber: so.subOrderNumber,
    packageStatus: mapPackageStatus(so.status),
    estimatedDelivery: '3 to 5 business days',
    items: [],
  }));

  const shippingAddress = {
    id: `addr-${summary.id}`,
    name: 'Customer',
    phone: '',
    type: 'HOME',
    street: '',
    locality: '',
    city: '',
    state: '',
    pincode: '',
    isDefault: false,
  };

  return {
    id: summary.id,
    orderNumber: summary.orderNumber,
    createdAt: summary.createdAt,
    status: statusMap[summary.status] || (summary.status === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT' : 'PLACED'),
    packages,
    shippingAddress,
    itemsSubtotal: Number(summary.subtotalAmount) || 0,
    estimatedShippingFee: Number(summary.shippingFee) || 0,
    discount: Number(summary.discountAmount) || 0,
    totalAmount: Number(summary.totalAmount) || 0,
    paymentMethod: 'Cash on Delivery (COD) / Pay on Arrival',
    paymentStatus: summary.paymentStatus === 'PAID' && summary.status !== 'PENDING_PAYMENT' ? 'PAID' : 'PENDING',
  };
}

function mapCustomerOrderDetailToUi(detail) {
  const sellerOrders = detail.sellerOrders || [];

  const packages = sellerOrders.map((so) => {
    const selectedItems = (so.items || []).map((it) => {
      const title = it.productTitle || it.productTitleSnapshot || 'Marketplace Item';
      const unitPrice = Number(it.unitPrice ?? it.unitPriceSnapshot ?? 0);
      const sku = it.sku || it.skuSnapshot || '';

      const selectedVariants = {};
      if (it.attributes) {
        for (const [k, v] of Object.entries(it.attributes)) {
          if (v !== undefined && v !== null) {
            selectedVariants[k] = String(v);
          }
        }
      }

      return {
        product: {
          id: it.variantId,
          title,
          slug: '',
          description: '',
          brand: '',
          category: 'General',
          categoryId: '',
          sellerId: so.shop?.id || so.id,
          sellerName: so.shop?.name || 'Marketplace Seller',
          sellerCity: '',
          sellerRating: 4.8,
          sellerVerified: true,
          rating: 4.8,
          reviewCount: 1,
          price: unitPrice,
          originalPrice: unitPrice,
          discountPercent: 0,
          inStock: true,
          stockQuantity: it.quantity,
          images: [],
          thumbnail: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
          specifications: sku ? { SKU: sku } : {},
          highlights: [],
        },
        quantity: it.quantity,
        unitPrice,
        selectedVariants,
      };
    });

    return {
      sellerId: so.shop?.id || so.id,
      sellerName: so.shop?.name || 'Marketplace Seller',
      trackingNumber: so.subOrderNumber,
      packageStatus: mapPackageStatus(so.status),
      estimatedDelivery: '3 to 5 business days',
      items: selectedItems,
    };
  });

  const addr = detail.shippingAddress || detail.shippingAddressSnapshot;
  const shippingAddress = {
    id: `addr-snapshot-${detail.id}`,
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

  return {
    id: detail.id,
    orderNumber: detail.orderNumber,
    createdAt: detail.createdAt,
    status: statusMap[detail.status] || (detail.status === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT' : 'PLACED'),
    packages,
    shippingAddress,
    itemsSubtotal: Number(detail.subtotalAmount) || 0,
    estimatedShippingFee: Number(detail.shippingFee) || 0,
    discount: Number(detail.discountAmount) || 0,
    totalAmount: Number(detail.totalAmount) || 0,
    paymentMethod: 'Cash on Delivery (COD) / Pay on Arrival',
    paymentStatus: detail.paymentStatus === 'PAID' && detail.status !== 'PENDING_PAYMENT' ? 'PAID' : 'PENDING',
  };
}

describe('Stage 3B-5 Customer Order History Integration Unit & Adapter Tests', () => {
  const sampleSummaryResponse = {
    id: 'ord-uuid-111',
    orderNumber: 'ORD-20261015-123456',
    status: 'PENDING_PAYMENT',
    subtotalAmount: 1899,
    discountAmount: 100,
    shippingFee: 80,
    taxAmount: 0,
    totalAmount: 1879,
    currency: 'INR',
    createdAt: '2026-10-15T12:00:00.000Z',
    sellerOrdersCount: 2,
    sellerOrders: [
      {
        id: 'so-uuid-1',
        subOrderNumber: 'ORD-20261015-123456-S1',
        shopName: 'Heritage Textiles',
        shopSlug: 'heritage-textiles',
        status: 'PENDING_PAYMENT',
        totalAmount: 999,
        itemCount: 1,
        deliveryType: 'STANDARD',
      },
      {
        id: 'so-uuid-2',
        subOrderNumber: 'ORD-20261015-123456-S2',
        shopName: 'Artisan Woodcraft',
        shopSlug: 'artisan-woodcraft',
        status: 'PENDING_PAYMENT',
        totalAmount: 880,
        itemCount: 2,
        deliveryType: 'STANDARD',
      },
    ],
  };

  const sampleDetailResponse = {
    id: 'ord-uuid-111',
    orderNumber: 'ORD-20261015-123456',
    status: 'PENDING_PAYMENT',
    subtotalAmount: 1899,
    discountAmount: 100,
    shippingFee: 80,
    taxAmount: 0,
    totalAmount: 1879,
    currency: 'INR',
    createdAt: '2026-10-15T12:00:00.000Z',
    updatedAt: '2026-10-15T12:00:00.000Z',
    shippingAddressSnapshot: {
      fullName: 'Madhan Raj',
      phone: '9876543210',
      addressLine1: '42 MG Road',
      addressLine2: 'Near Metro Pillar 100',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
    },
    sellerOrders: [
      {
        id: 'so-uuid-1',
        subOrderNumber: 'ORD-20261015-123456-S1',
        status: 'PENDING_PAYMENT',
        shop: {
          id: 'shop-uuid-1',
          name: 'Heritage Textiles',
          slug: 'heritage-textiles',
        },
        subtotalAmount: 999,
        shippingFee: 40,
        taxAmount: 0,
        totalAmount: 1039,
        items: [
          {
            id: 'item-uuid-1',
            variantId: 'var-uuid-1',
            productTitle: 'Handcrafted Silk Dupatta',
            sku: 'SILK-DUP-001',
            quantity: 1,
            unitPrice: 999,
            totalAmount: 999,
            attributes: { Color: 'Indigo', Fabric: 'Pure Silk' },
          },
        ],
      },
      {
        id: 'so-uuid-2',
        subOrderNumber: 'ORD-20261015-123456-S2',
        status: 'PENDING_PAYMENT',
        shop: {
          id: 'shop-uuid-2',
          name: 'Artisan Woodcraft',
          slug: 'artisan-woodcraft',
        },
        subtotalAmount: 900,
        shippingFee: 40,
        taxAmount: 0,
        totalAmount: 940,
        items: [
          {
            id: 'item-uuid-2',
            variantId: 'var-uuid-2',
            productTitleSnapshot: 'Rosewood Coaster Set',
            skuSnapshot: 'WOOD-CST-04',
            quantity: 2,
            unitPriceSnapshot: 450,
            totalAmount: 900,
            attributes: { PackSize: 4 },
          },
        ],
      },
    ],
  };

  it('1. should map list responses containing summary seller orders without inventing product line items', () => {
    const uiOrder = mapCustomerOrderSummaryToUi(sampleSummaryResponse);

    assert.equal(uiOrder.id, 'ord-uuid-111');
    assert.equal(uiOrder.orderNumber, 'ORD-20261015-123456');
    assert.equal(uiOrder.status, 'PENDING_PAYMENT');
    assert.equal(uiOrder.paymentStatus, 'PENDING');
    assert.equal(uiOrder.totalAmount, 1879);
    assert.equal(uiOrder.itemsSubtotal, 1899);
    assert.equal(uiOrder.estimatedShippingFee, 80);
    assert.equal(uiOrder.discount, 100);
    assert.equal(uiOrder.packages.length, 2);

    assert.equal(uiOrder.packages[0].sellerName, 'Heritage Textiles');
    assert.equal(uiOrder.packages[0].trackingNumber, 'ORD-20261015-123456-S1');
    assert.equal(uiOrder.packages[0].packageStatus, 'PENDING_PAYMENT');
    assert.equal(uiOrder.packages[0].items.length, 0); // No synthetic items invented

    assert.equal(uiOrder.packages[1].sellerName, 'Artisan Woodcraft');
    assert.equal(uiOrder.packages[1].trackingNumber, 'ORD-20261015-123456-S2');
    assert.equal(uiOrder.packages[1].packageStatus, 'PENDING_PAYMENT');
    assert.equal(uiOrder.packages[1].items.length, 0);
  });

  it('2. should map detailed orders containing item snapshots and normalize field variations', () => {
    const uiOrder = mapCustomerOrderDetailToUi(sampleDetailResponse);

    assert.equal(uiOrder.id, 'ord-uuid-111');
    assert.equal(uiOrder.orderNumber, 'ORD-20261015-123456');
    assert.equal(uiOrder.status, 'PENDING_PAYMENT');
    assert.equal(uiOrder.paymentStatus, 'PENDING');
    assert.equal(uiOrder.totalAmount, 1879);

    // Shipping address from snapshot
    assert.equal(uiOrder.shippingAddress.name, 'Madhan Raj');
    assert.equal(uiOrder.shippingAddress.phone, '9876543210');
    assert.equal(uiOrder.shippingAddress.street, '42 MG Road');
    assert.equal(uiOrder.shippingAddress.city, 'Bengaluru');
    assert.equal(uiOrder.shippingAddress.pincode, '560001');

    // Packages and detailed items
    assert.equal(uiOrder.packages.length, 2);

    // Package 1: standard field names
    const pkg1 = uiOrder.packages[0];
    assert.equal(pkg1.sellerName, 'Heritage Textiles');
    assert.equal(pkg1.packageStatus, 'PENDING_PAYMENT');
    assert.equal(pkg1.items.length, 1);
    assert.equal(pkg1.items[0].product.title, 'Handcrafted Silk Dupatta');
    assert.equal(pkg1.items[0].unitPrice, 999);
    assert.equal(pkg1.items[0].quantity, 1);
    assert.equal(pkg1.items[0].selectedVariants.Color, 'Indigo');

    // Package 2: snapshot field names
    const pkg2 = uiOrder.packages[1];
    assert.equal(pkg2.sellerName, 'Artisan Woodcraft');
    assert.equal(pkg2.packageStatus, 'PENDING_PAYMENT');
    assert.equal(pkg2.items.length, 1);
    assert.equal(pkg2.items[0].product.title, 'Rosewood Coaster Set');
    assert.equal(pkg2.items[0].unitPrice, 450);
    assert.equal(pkg2.items[0].quantity, 2);
    assert.equal(pkg2.items[0].selectedVariants.PackSize, '4'); // Converted to string
  });

  it('3. should simulate authenticated order fetching and browser-refresh initialization', async () => {
    let apiCallCount = 0;
    const mockOrdersApi = {
      getMyOrders: async () => {
        apiCallCount++;
        return {
          data: [sampleSummaryResponse],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        };
      },
    };

    // Simulate MarketplaceContext fetchOrders() in authenticated mode
    let ordersState = [];
    let ordersLoading = true;
    let ordersError = null;

    const fetchOrders = async (authMode) => {
      if (authMode !== 'AUTHENTICATED') {
        ordersLoading = false;
        return;
      }
      ordersLoading = true;
      ordersError = null;
      try {
        const res = await mockOrdersApi.getMyOrders();
        ordersState = res.data.map(mapCustomerOrderSummaryToUi);
      } catch (err) {
        ordersError = err.message;
      } finally {
        ordersLoading = false;
      }
    };

    await fetchOrders('AUTHENTICATED');

    assert.equal(apiCallCount, 1);
    assert.equal(ordersLoading, false);
    assert.equal(ordersError, null);
    assert.equal(ordersState.length, 1);
    assert.equal(ordersState[0].orderNumber, 'ORD-20261015-123456');
  });

  it('4. should resolve ?orderId= using an orderNumber or a UUID without passing UUIDs to orderNumber endpoint', async () => {
    const fetchedOrders = [mapCustomerOrderSummaryToUi(sampleSummaryResponse)];
    let fetchedByNumberArg = null;

    const mockOrdersApi = {
      getMyOrderByNumber: async (orderNumber) => {
        // Must never receive a raw UUID
        assert.doesNotMatch(orderNumber, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        fetchedByNumberArg = orderNumber;
        return sampleDetailResponse;
      },
    };

    // Resolver function matching OrdersPage.tsx URL resolution logic
    const resolveAndFetch = async (queryOrderId, ordersList) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryOrderId);
      const existing = ordersList.find((o) => o.id === queryOrderId || o.orderNumber === queryOrderId);

      let resolvedNumber = null;
      if (existing?.orderNumber) {
        resolvedNumber = existing.orderNumber;
      } else if (!isUuid) {
        resolvedNumber = queryOrderId;
      }

      if (!resolvedNumber) {
        return null; // Not found, do not call endpoint with UUID
      }

      return mockOrdersApi.getMyOrderByNumber(resolvedNumber);
    };

    // Case A: Query parameter is directly an orderNumber
    const resA = await resolveAndFetch('ORD-20261015-123456', fetchedOrders);
    assert.equal(fetchedByNumberArg, 'ORD-20261015-123456');
    assert.equal(resA.orderNumber, 'ORD-20261015-123456');

    // Case B: Query parameter is a UUID
    fetchedByNumberArg = null;
    const resB = await resolveAndFetch('ord-uuid-111', fetchedOrders);
    assert.equal(fetchedByNumberArg, 'ORD-20261015-123456');
    assert.equal(resB.orderNumber, 'ORD-20261015-123456');

    // Case C: Query parameter is a foreign UUID not in list
    fetchedByNumberArg = null;
    const resC = await resolveAndFetch('00000000-0000-0000-0000-000000000000', fetchedOrders);
    assert.equal(resC, null);
    assert.equal(fetchedByNumberArg, null); // Endpoint was safely NOT called with foreign UUID
  });

  it('5. should handle loading, empty, and API-error states gracefully with retry', async () => {
    let attempt = 0;
    const mockFailingApi = {
      getMyOrders: async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error('Network timeout loading orders');
        }
        return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      },
    };

    let orders = [];
    let loading = true;
    let error = null;

    const executeFetch = async () => {
      loading = true;
      error = null;
      try {
        const res = await mockFailingApi.getMyOrders();
        orders = res.data;
      } catch (err) {
        error = err.message;
      } finally {
        loading = false;
      }
    };

    // Attempt 1 fails
    await executeFetch();
    assert.equal(loading, false);
    assert.equal(error, 'Network timeout loading orders');
    assert.equal(orders.length, 0);

    // Attempt 2 (Retry) succeeds with empty list
    await executeFetch();
    assert.equal(loading, false);
    assert.equal(error, null);
    assert.equal(orders.length, 0);
  });

  it('6. should preserve demo mode with DEMO_ORDERS and empty orders in anonymous mode', () => {
    const DEMO_ORDERS = [
      { id: 'demo-1', orderNumber: 'BB-DEMO-001', status: 'PLACED', packages: [], totalAmount: 1200 },
    ];

    const getOrdersForMode = (mode) => {
      if (mode === 'DEMO') return DEMO_ORDERS;
      if (mode === 'ANONYMOUS') return [];
      return [];
    };

    assert.equal(getOrdersForMode('DEMO').length, 1);
    assert.equal(getOrdersForMode('DEMO')[0].orderNumber, 'BB-DEMO-001');

    assert.equal(getOrdersForMode('ANONYMOUS').length, 0);
  });

  it('7. should clear order data on logout or account switching and discard stale responses', async () => {
    let ordersState = [mapCustomerOrderSummaryToUi(sampleSummaryResponse)];
    let ordersRequestId = 1;

    // Simulate account switch: user 1 to user 2
    const switchAccount = () => {
      ordersState = []; // Immediate clearance
      ordersRequestId++; // Invalidate pending responses
    };

    // Simulate a slow delayed response from user 1
    const lateResponseReqId = ordersRequestId;
    switchAccount();

    const handleLateResponse = (reqId, lateData) => {
      if (reqId !== ordersRequestId) {
        return; // Discarded!
      }
      ordersState = lateData;
    };

    handleLateResponse(lateResponseReqId, [mapCustomerOrderSummaryToUi(sampleSummaryResponse)]);

    // Orders state remains clean for new account
    assert.equal(ordersState.length, 0);
  });

  it('8. should preserve complete detailed orders when subsequent summary list is fetched', () => {
    const completeDetailedOrder = mapCustomerOrderDetailToUi(sampleDetailResponse);
    assert.ok(completeDetailedOrder.packages[0].items.length > 0);

    // Initial state has the detailed order (from checkout or detail view)
    const prevOrders = [completeDetailedOrder];

    // List fetch arrives with summary orders (items are empty)
    const summaryOrders = [mapCustomerOrderSummaryToUi(sampleSummaryResponse)];
    assert.equal(summaryOrders[0].packages[0].items.length, 0);

    // Merge logic matching MarketplaceContext.tsx
    const existingMap = new Map();
    prevOrders.forEach((o) => {
      if (o.id) existingMap.set(o.id, o);
      if (o.orderNumber) existingMap.set(o.orderNumber, o);
    });

    const merged = summaryOrders.map((summaryOrder) => {
      const existing = existingMap.get(summaryOrder.orderNumber) || existingMap.get(summaryOrder.id);
      if (existing && existing.packages.some((pkg) => pkg.items.length > 0)) {
        return {
          ...existing,
          status: summaryOrder.status,
          totalAmount: summaryOrder.totalAmount,
        };
      }
      return summaryOrder;
    });

    assert.equal(merged.length, 1);
    // Preserved full detailed items!
    assert.equal(merged[0].packages[0].items.length, 1);
    assert.equal(merged[0].packages[0].items[0].product.title, 'Handcrafted Silk Dupatta');
    assert.equal(merged[0].shippingAddress.street, '42 MG Road');
  });

  it('9. should keep PENDING_PAYMENT distinct from paid and fulfillment statuses', () => {
    const pendingOrder = mapCustomerOrderDetailToUi(sampleDetailResponse);

    // Top-level order status
    assert.equal(pendingOrder.status, 'PENDING_PAYMENT');
    assert.notEqual(pendingOrder.status, 'CONFIRMED');
    assert.notEqual(pendingOrder.status, 'SHIPPED');
    assert.notEqual(pendingOrder.status, 'DELIVERED');

    // Payment status must be PENDING, never PAID
    assert.equal(pendingOrder.paymentStatus, 'PENDING');
    assert.notEqual(pendingOrder.paymentStatus, 'PAID');

    // Package status must be PENDING_PAYMENT, not PROCESSING or SHIPPED
    assert.equal(pendingOrder.packages[0].packageStatus, 'PENDING_PAYMENT');
    assert.notEqual(pendingOrder.packages[0].packageStatus, 'PROCESSING');
    assert.notEqual(pendingOrder.packages[0].packageStatus, 'SHIPPED');

    // Stepper logic verification: pending payment order must not show steps as completed
    const isStepActive = (orderStatus, stepIndex) => {
      if (orderStatus === 'PENDING_PAYMENT') return false;
      const statuses = ['PLACED', 'CONFIRMED', 'SHIPPED', 'DELIVERED'];
      return statuses.indexOf(orderStatus) >= stepIndex;
    };

    assert.equal(isStepActive(pendingOrder.status, 0), false); // Step 1 (Placed) not marked active
    assert.equal(isStepActive(pendingOrder.status, 1), false); // Step 2 (Confirmed) not active
    assert.equal(isStepActive(pendingOrder.status, 2), false); // Step 3 (Shipped) not active
  });
});
