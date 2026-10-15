import { apiClient } from './apiClient.ts';
import type {
  CustomerOrderListResponse,
  CustomerOrderDetailResponse,
  CustomerOrderSummary,
  Order,
  OrderPackage,
  Address,
} from '../types/index.ts';

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

function mapPackageStatus(backendStatus: string): OrderPackage['packageStatus'] {
  if (backendStatus === 'PENDING_PAYMENT') return 'PENDING_PAYMENT';
  if (backendStatus === 'DELIVERED') return 'DELIVERED';
  if (backendStatus === 'SHIPPED') return 'SHIPPED';
  if (backendStatus === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY';
  if (backendStatus === 'CANCELLED') return 'CANCELLED';
  return 'PROCESSING';
}

/**
 * Maps a single summary item from GET /api/v1/orders/my-orders into the UI Order model.
 * Since the list endpoint does not include line item snapshots or shipping addresses,
 * packages contain summary placeholders and fallback address until detail is fetched.
 */
export function mapCustomerOrderSummaryToUi(summary: CustomerOrderSummary): Order {
  const packages: OrderPackage[] = (summary.sellerOrders || []).map((so) => ({
    sellerId: so.shopSlug || so.subOrderNumber,
    sellerName: so.shopName,
    trackingNumber: so.subOrderNumber,
    packageStatus: mapPackageStatus(so.status),
    estimatedDelivery: '3 to 5 business days',
    items: [],
  }));

  const shippingAddress: Address = {
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
    status: statusMap[summary.status] || 'PLACED',
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

/**
 * Maps full detailed order from GET /api/v1/orders/my-orders/:orderNumber into the UI Order model.
 * Handles both snapshot field names (productTitleSnapshot) and standard field names (productTitle).
 */
export function mapCustomerOrderDetailToUi(detail: CustomerOrderDetailResponse): Order {
  const sellerOrders = detail.sellerOrders || [];

  const packages: OrderPackage[] = sellerOrders.map((so) => ({
    sellerId: so.shop?.id || so.id,
    sellerName: so.shop?.name || 'Marketplace Seller',
    trackingNumber: so.subOrderNumber,
    packageStatus: mapPackageStatus(so.status),
    estimatedDelivery: '3 to 5 business days',
    items: (so.items || []).map((it) => {
      const title = it.productTitle || it.productTitleSnapshot || 'Marketplace Item';
      const unitPrice = Number(it.unitPrice ?? it.unitPriceSnapshot ?? 0);
      const sku = it.sku || it.skuSnapshot || '';

      const selectedVariants: Record<string, string> = {};
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
          specifications: (sku ? { SKU: sku } : {}) as Record<string, string>,
          highlights: [] as string[],
        },
        quantity: it.quantity,
        unitPrice,
        selectedVariants,
      };
    }),
  }));

  const addr = detail.shippingAddress || detail.shippingAddressSnapshot;
  const shippingAddress: Address = {
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
    status: statusMap[detail.status] || 'PLACED',
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

export const ordersApi = {
  /**
   * GET /api/v1/orders/my-orders
   * Retrieves paginated orders for the authenticated customer.
   */
  async getMyOrders(query?: { page?: number; limit?: number }): Promise<CustomerOrderListResponse> {
    const params = new URLSearchParams();
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';

    return apiClient.request<CustomerOrderListResponse>(`/orders/my-orders${qs}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/orders/my-orders/:orderNumber
   * Retrieves full single order with seller sub-orders, items, and address snapshots.
   */
  async getMyOrderByNumber(orderNumber: string): Promise<CustomerOrderDetailResponse> {
    return apiClient.request<CustomerOrderDetailResponse>(`/orders/my-orders/${encodeURIComponent(orderNumber)}`, {
      method: 'GET',
    });
  },
};
