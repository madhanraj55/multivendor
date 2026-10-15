import { apiClient } from './apiClient.ts';
import type {
  CheckoutValidationResponse,
  ReserveCheckoutPayload,
  ReserveCheckoutResponse,
  PlaceOrderPayload,
  PlaceOrderResponse,
  CheckoutRecoveryResponse,
  Address,
  AddressSnapshotPayload,
  BackendOrder,
  Order,
  OrderPackage,
} from '../types/index.ts';

export const CHECKOUT_RECOVERY_STORAGE_KEY = 'bb_pending_checkout';

export interface StoredCheckoutRecovery {
  attemptId: string;
  idempotencyKey?: string;
  timestamp: number;
}

export function savePendingCheckoutAttempt(attemptId: string, idempotencyKey?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const data: StoredCheckoutRecovery = {
      attemptId,
      idempotencyKey,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(CHECKOUT_RECOVERY_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota or access issues
  }
}

export function getPendingCheckoutAttempt(): StoredCheckoutRecovery | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CHECKOUT_RECOVERY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPendingCheckoutAttempt(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(CHECKOUT_RECOVERY_STORAGE_KEY);
  } catch {
    // Ignore storage quota or access issues
  }
}

/**
 * Generates an idempotency key format satisfying backend MaxLength(100).
 */
export function generateCheckoutIdempotencyKey(): string {
  return `chk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Converts a frontend Address model to AddressSnapshotPayload expected by backend DTOs.
 */
export function mapAddressToSnapshot(addr: Address): AddressSnapshotPayload {
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
 * Converts a backend Order model into the UI Order model.
 * Preserves compatibility with OrdersPage and tracking views.
 */
export function mapBackendOrderToUi(backendOrder: BackendOrder): Order {
  const sellerOrders = backendOrder.sellerOrders || [];

  const packages: OrderPackage[] = sellerOrders.map((so) => ({
    sellerId: so.shop.id,
    sellerName: so.shop.name,
    trackingNumber: so.subOrderNumber,
    packageStatus:
      so.status === 'PENDING_PAYMENT'
        ? 'PENDING_PAYMENT'
        : so.status === 'DELIVERED'
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
  const shippingAddress: Address = {
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

  const statusMap: Record<string, Order['status']> = {
    PENDING_PAYMENT: 'PENDING_PAYMENT',
    COMPLETED: 'CONFIRMED',
    CONFIRMED: 'CONFIRMED',
    PROCESSING: 'PLACED',
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

export const checkoutApi = {
  /**
   * POST /api/v1/checkout/validate
   * Validates cart readiness for checkout against current inventory and shop status.
   */
  async validateCheckout(): Promise<CheckoutValidationResponse> {
    return apiClient.request<CheckoutValidationResponse>('/checkout/validate', {
      method: 'POST',
    });
  },

  /**
   * POST /api/v1/checkout/reserve
   * Atomically reserves stock and creates a CheckoutAttempt record.
   */
  async reserveCheckout(payload: ReserveCheckoutPayload): Promise<ReserveCheckoutResponse> {
    return apiClient.request<ReserveCheckoutResponse>('/checkout/reserve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /api/v1/checkout/place-order
   * Places an order from a verified, unexpired stock-reserved checkout attempt.
   */
  async placeOrder(payload: PlaceOrderPayload): Promise<PlaceOrderResponse> {
    return apiClient.request<PlaceOrderResponse>('/checkout/place-order', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * GET /api/v1/checkout/attempt/:attemptId
   * Safe read-only recovery of a checkout attempt and any associated order.
   */
  async getCheckoutAttempt(attemptId: string): Promise<CheckoutRecoveryResponse> {
    return apiClient.request<CheckoutRecoveryResponse>(`/checkout/attempt/${attemptId}`, {
      method: 'GET',
    });
  },
};
