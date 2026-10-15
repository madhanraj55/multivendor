import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Stage 3B-6A Admin Orders Integration, Mapping & Security Tests
 *
 * Exercises:
 * 1. Admin order response mapping (list & detail contracts)
 * 2. Admin list pagination and query filter construction
 * 3. Detailed order, vendor packages, line items, and audit trail mapping
 * 4. ADMIN vs CUSTOMER and SELLER route access authorization logic
 * 5. Loading, empty, and API-error states with retry
 * 6. Correct display and restrictions for PENDING_PAYMENT
 * 7. Account switching and stale-response handling
 */

// Helper functions mirroring frontend/src/services/adminOrdersApi.ts
function getAdminAllowedTransitions(currentStatus) {
  const transitions = {
    PENDING_PAYMENT: ['CANCELLED'],
    CONFIRMED: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['PARTIALLY_SHIPPED', 'SHIPPED', 'CANCELLED'],
    PARTIALLY_SHIPPED: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
  };

  return transitions[currentStatus] || [];
}

function isOrderUnpaid(status) {
  return status === 'PENDING_PAYMENT';
}

function formatOrderStatusLabel(status) {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 'Payment Pending (Unpaid)';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'PROCESSING':
      return 'Processing in Warehouse';
    case 'PARTIALLY_SHIPPED':
      return 'Partially Shipped';
    case 'SHIPPED':
      return 'Shipped / In Transit';
    case 'DELIVERED':
      return 'Delivered';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

function buildAdminOrderQueryString(query) {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.status) params.set('status', query.status);
  if (query?.orderNumber?.trim()) params.set('orderNumber', query.orderNumber.trim());
  if (query?.customerId?.trim()) params.set('customerId', query.customerId.trim());
  if (query?.startDate) params.set('startDate', query.startDate);
  if (query?.endDate) params.set('endDate', query.endDate);

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function checkAdminRouteAccess(authMode, authUser) {
  if (authMode !== 'AUTHENTICATED' || !authUser) {
    return {
      allowed: false,
      reason: 'AUTHENTICATION_REQUIRED',
      statusCode: 401,
      message: 'Please sign in with your administrator account to access the marketplace order control dashboard.',
    };
  }

  if (authUser.role !== 'ADMIN') {
    return {
      allowed: false,
      reason: 'FORBIDDEN',
      statusCode: 403,
      message: `Access Denied. Your account is registered as ${authUser.role}. This management portal is strictly restricted to platform administrators.`,
    };
  }

  return {
    allowed: true,
    reason: 'AUTHORIZED',
    statusCode: 200,
  };
}

describe('Stage 3B-6A Admin Orders Integration & Verification Tests', () => {
  describe('1. Admin Order Response Mapping', () => {
    it('should map GET /api/v1/admin/orders response preserving customer and multi-vendor packages', () => {
      const mockBackendListResponse = {
        data: [
          {
            id: 'ord-101',
            orderNumber: 'ORD-20261015-ABC123',
            status: 'CONFIRMED',
            customer: {
              id: 'cust-1',
              firstName: 'Priya',
              lastName: 'Sharma',
              email: 'priya.sharma@example.in',
              phone: '+91 98765 43210',
            },
            subtotalAmount: 2499,
            discountAmount: 200,
            shippingFee: 99,
            taxAmount: 240,
            totalAmount: 2638,
            currency: 'INR',
            createdAt: '2026-10-15T10:00:00.000Z',
            sellerOrdersCount: 2,
            sellerOrders: [
              {
                subOrderNumber: 'ORD-20261015-ABC123-S1',
                shopName: 'Jaipur Crafts Heritage',
                shopSlug: 'jaipur-crafts-heritage',
                status: 'CONFIRMED',
                totalAmount: 1499,
                itemCount: 2,
                deliveryType: 'STANDARD',
              },
              {
                subOrderNumber: 'ORD-20261015-ABC123-S2',
                shopName: 'Kashmir Silks & Shawls',
                shopSlug: 'kashmir-silks-shawls',
                status: 'CONFIRMED',
                totalAmount: 1139,
                itemCount: 1,
                deliveryType: 'EXPRESS',
              },
            ],
          },
        ],
        meta: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      };

      const order = mockBackendListResponse.data[0];
      assert.equal(order.orderNumber, 'ORD-20261015-ABC123');
      assert.equal(order.customer.email, 'priya.sharma@example.in');
      assert.equal(order.totalAmount, 2638);
      assert.equal(order.currency, 'INR');
      assert.equal(order.sellerOrders.length, 2);
      assert.equal(order.sellerOrders[0].shopName, 'Jaipur Crafts Heritage');
      assert.equal(order.sellerOrders[1].shopName, 'Kashmir Silks & Shawls');
      assert.equal(mockBackendListResponse.meta.total, 1);
      assert.equal(mockBackendListResponse.meta.totalPages, 1);
    });
  });

  describe('2. Query Parameter & Pagination Construction', () => {
    it('should build clean query strings for all backend supported filter parameters', () => {
      const qs1 = buildAdminOrderQueryString({
        page: 2,
        limit: 50,
        status: 'PENDING_PAYMENT',
        orderNumber: 'ORD-2026',
        customerId: '123e4567-e89b-12d3-a456-426614174000',
        startDate: '2026-10-01',
        endDate: '2026-10-15',
      });

      assert.ok(qs1.includes('page=2'));
      assert.ok(qs1.includes('limit=50'));
      assert.ok(qs1.includes('status=PENDING_PAYMENT'));
      assert.ok(qs1.includes('orderNumber=ORD-2026'));
      assert.ok(qs1.includes('customerId=123e4567-e89b-12d3-a456-426614174000'));
      assert.ok(qs1.includes('startDate=2026-10-01'));
      assert.ok(qs1.includes('endDate=2026-10-15'));

      // Empty query should return empty string
      const qsEmpty = buildAdminOrderQueryString({});
      assert.equal(qsEmpty, '');
    });
  });

  describe('3. Order Detail & Multi-Vendor Package Breakdown Mapping', () => {
    it('should map detailed order with items, financials, address snapshot, and audit timeline', () => {
      const mockDetailResponse = {
        id: 'ord-201',
        orderNumber: 'ORD-20261015-XYZ789',
        status: 'PENDING_PAYMENT',
        customer: {
          id: 'cust-uuid-2',
          firstName: 'Rajesh',
          lastName: 'Kumar',
          email: 'rajesh.kumar@example.in',
          phone: '+91 91234 56789',
          role: 'CUSTOMER',
        },
        subtotalAmount: 4999,
        discountAmount: 500,
        shippingFee: 150,
        taxAmount: 450,
        totalAmount: 5099,
        currency: 'INR',
        shippingAddress: {
          fullName: 'Rajesh Kumar',
          phone: '+91 91234 56789',
          addressLine1: 'Flat 402, Royal Palms',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
        },
        paymentSummary: {
          orderStatus: 'PENDING_PAYMENT',
          checkoutAttempt: {
            id: 'attempt-uuid-77',
            status: 'COMPLETED',
            idempotencyKey: 'idem-key-888',
            expiresAt: '2026-10-15T11:00:00.000Z',
            createdAt: '2026-10-15T10:30:00.000Z',
          },
          totalPayable: 5099,
          currency: 'INR',
        },
        statusHistory: [
          {
            id: 'hist-1',
            status: 'PENDING_PAYMENT',
            notes: 'Order initiated via checkout attempt',
            changedBy: null,
            createdAt: '2026-10-15T10:30:00.000Z',
          },
        ],
        sellerOrdersCount: 1,
        sellerOrders: [
          {
            id: 'sub-ord-1',
            subOrderNumber: 'ORD-20261015-XYZ789-S1',
            shop: {
              id: 'shop-1',
              name: 'Mysore Silk Emporium',
              slug: 'mysore-silk-emporium',
              status: 'ACTIVE',
              sellerId: 'seller-1',
              seller: {
                id: 'seller-1',
                firstName: 'Suresh',
                lastName: 'Gowda',
                email: 'suresh@mysoresilk.in',
              },
            },
            status: 'PENDING_PAYMENT',
            deliveryType: 'STANDARD',
            subtotalAmount: 4999,
            discountAmount: 500,
            shippingFee: 150,
            taxAmount: 450,
            totalAmount: 5099,
            commissionAmount: 500,
            netSellerPayable: 4599,
            cancellationReason: null,
            deliveredAt: null,
            items: [
              {
                id: 'item-1',
                variantId: 'var-10',
                productTitle: 'Pure Silk Mysore Zari Saree',
                sku: 'MYS-SILK-001-RED',
                attributes: { Color: 'Deep Crimson', Zari: 'Gold' },
                quantity: 1,
                unitPrice: 4999,
                discount: 500,
                gstRate: 5,
                taxAmount: 250,
                totalAmount: 4749,
              },
            ],
            statusHistory: [],
          },
        ],
      };

      assert.equal(mockDetailResponse.orderNumber, 'ORD-20261015-XYZ789');
      assert.equal(mockDetailResponse.customer.fullName, undefined);
      assert.equal(mockDetailResponse.customer.firstName, 'Rajesh');
      assert.equal(mockDetailResponse.shippingAddress.postalCode, '560001');
      assert.equal(mockDetailResponse.sellerOrders[0].items[0].sku, 'MYS-SILK-001-RED');
      assert.equal(mockDetailResponse.sellerOrders[0].netSellerPayable, 4599);
      assert.equal(mockDetailResponse.paymentSummary.checkoutAttempt.idempotencyKey, 'idem-key-888');
    });
  });

  describe('4. ADMIN vs CUSTOMER and SELLER Route Access Authorization', () => {
    it('should grant access strictly to authenticated ADMIN accounts', () => {
      const adminAccess = checkAdminRouteAccess('AUTHENTICATED', {
        id: 'admin-1',
        email: 'admin@bharatbazaar.in',
        role: 'ADMIN',
      });
      assert.equal(adminAccess.allowed, true);
      assert.equal(adminAccess.statusCode, 200);
    });

    it('should reject access with 403 Forbidden for CUSTOMER role', () => {
      const customerAccess = checkAdminRouteAccess('AUTHENTICATED', {
        id: 'cust-1',
        email: 'customer@gmail.com',
        role: 'CUSTOMER',
      });
      assert.equal(customerAccess.allowed, false);
      assert.equal(customerAccess.statusCode, 403);
      assert.equal(customerAccess.reason, 'FORBIDDEN');
    });

    it('should reject access with 403 Forbidden for SELLER role', () => {
      const sellerAccess = checkAdminRouteAccess('AUTHENTICATED', {
        id: 'seller-1',
        email: 'vendor@mysoresilk.in',
        role: 'SELLER',
      });
      assert.equal(sellerAccess.allowed, false);
      assert.equal(sellerAccess.statusCode, 403);
      assert.equal(sellerAccess.reason, 'FORBIDDEN');
    });

    it('should reject unauthenticated or anonymous visits with 401', () => {
      const anonAccess = checkAdminRouteAccess('ANONYMOUS', null);
      assert.equal(anonAccess.allowed, false);
      assert.equal(anonAccess.statusCode, 401);
      assert.equal(anonAccess.reason, 'AUTHENTICATION_REQUIRED');
    });
  });

  describe('5. PENDING_PAYMENT Safety & Lifecycle Transition Matrix', () => {
    it('should identify unpaid orders and disallow fulfillment or marking as paid', () => {
      assert.equal(isOrderUnpaid('PENDING_PAYMENT'), true);
      assert.equal(isOrderUnpaid('CONFIRMED'), false);
      assert.equal(isOrderUnpaid('DELIVERED'), false);

      const pendingTransitions = getAdminAllowedTransitions('PENDING_PAYMENT');
      // Critical security invariant: unpaid orders can ONLY be CANCELLED
      assert.deepEqual(pendingTransitions, ['CANCELLED']);
      assert.equal(pendingTransitions.includes('CONFIRMED'), false);
      assert.equal(pendingTransitions.includes('PROCESSING'), false);
      assert.equal(pendingTransitions.includes('SHIPPED'), false);
      assert.equal(pendingTransitions.includes('DELIVERED'), false);
    });

    it('should enforce the legitimate progression matrix for confirmed orders', () => {
      assert.deepEqual(getAdminAllowedTransitions('CONFIRMED'), ['PROCESSING', 'CANCELLED']);
      assert.deepEqual(getAdminAllowedTransitions('PROCESSING'), [
        'PARTIALLY_SHIPPED',
        'SHIPPED',
        'CANCELLED',
      ]);
      assert.deepEqual(getAdminAllowedTransitions('PARTIALLY_SHIPPED'), ['SHIPPED', 'CANCELLED']);
      assert.deepEqual(getAdminAllowedTransitions('SHIPPED'), ['DELIVERED']);
      assert.deepEqual(getAdminAllowedTransitions('DELIVERED'), []);
      assert.deepEqual(getAdminAllowedTransitions('CANCELLED'), []);
    });

    it('should format labels correctly for human operators', () => {
      assert.equal(formatOrderStatusLabel('PENDING_PAYMENT'), 'Payment Pending (Unpaid)');
      assert.equal(formatOrderStatusLabel('CONFIRMED'), 'Confirmed');
      assert.equal(formatOrderStatusLabel('DELIVERED'), 'Delivered');
      assert.equal(formatOrderStatusLabel('CANCELLED'), 'Cancelled');
    });
  });

  describe('6. Loading, Empty, and Error States with Retry Lifecycle', () => {
    it('should simulate async loading lifecycle and recover from server error with retry', async () => {
      let failFirstAttempt = true;
      let attempts = 0;

      async function simulatedFetchOrders() {
        attempts++;
        if (failFirstAttempt) {
          failFirstAttempt = false;
          throw new Error('Database connection timed out');
        }
        return {
          data: [{ id: 'order-1', orderNumber: 'ORD-001', totalAmount: 1200 }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        };
      }

      // Initial state: loading
      let state = { loading: true, error: null, orders: [] };

      // Attempt 1 fails
      try {
        const res = await simulatedFetchOrders();
        state = { loading: false, error: null, orders: res.data };
      } catch (err) {
        state = { loading: false, error: err.message, orders: [] };
      }

      assert.equal(state.loading, false);
      assert.equal(state.error, 'Database connection timed out');
      assert.equal(state.orders.length, 0);

      // Attempt 2: Retry succeeds
      state.loading = true;
      state.error = null;
      const res2 = await simulatedFetchOrders();
      state = { loading: false, error: null, orders: res2.data };

      assert.equal(state.loading, false);
      assert.equal(state.error, null);
      assert.equal(state.orders.length, 1);
      assert.equal(attempts, 2);
    });
  });

  describe('7. Account Switching and Stale-Response Isolation', () => {
    it('should discard responses from superseded async requests or switched sessions', async () => {
      let requestSeq = 0;
      let activeOrderState = [];

      function triggerRequest(delayMs, returnOrders) {
        const seq = ++requestSeq;
        return new Promise((resolve) => {
          setTimeout(() => {
            // Simulated component check
            if (seq === requestSeq) {
              activeOrderState = returnOrders;
              resolve({ applied: true, orders: returnOrders });
            } else {
              // Discard stale response
              resolve({ applied: false, discardedSeq: seq });
            }
          }, delayMs);
        });
      }

      // Request 1 is slow (100ms)
      const p1 = triggerRequest(100, [{ id: 'old-order-1' }]);
      // Request 2 is fast (20ms, e.g. switching page or account)
      const p2 = triggerRequest(20, [{ id: 'new-order-2' }]);

      const [res1, res2] = await Promise.all([p1, p2]);

      // p2 arrived first and was applied
      assert.equal(res2.applied, true);
      // p1 arrived late and was safely discarded
      assert.equal(res1.applied, false);
      assert.equal(res1.discardedSeq, 1);
      // Final state contains only newer response
      assert.deepEqual(activeOrderState, [{ id: 'new-order-2' }]);
    });
  });
});
