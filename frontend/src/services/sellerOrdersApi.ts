import { apiClient } from './apiClient.ts';
import type {
  SellerOrderStatus,
  QuerySellerOrdersParams,
  SellerOrderListResponse,
  SellerOrderDetailResponse,
  UpdateSellerOrderStatusPayload,
  UpdateSellerOrderStatusResponse,
} from '../types/index.ts';

/**
 * Returns allowed next target statuses according to the backend SellerOrderStatus transition rules.
 *
 * Security & Business Rules:
 * - Sellers cannot touch sub-orders while in PENDING_PAYMENT.
 *   Fulfillment (CONFIRMED, PROCESSING, PACKED, SHIPPED, DELIVERED) is strictly
 *   blocked until verified payment confirmation exists.
 * - Confirmed orders may be moved to PROCESSING or CANCELLED.
 * - PROCESSING may be moved to PACKED or CANCELLED.
 * - PACKED may be moved to SHIPPED or CANCELLED.
 * - SHIPPED may be moved to DELIVERED.
 * - DELIVERED may accept RETURN_REQUESTED.
 * - RETURN_REQUESTED may be transitioned to RETURNED.
 * - CANCELLED and RETURNED are terminal states.
 */
export function getSellerAllowedTransitions(
  currentStatus: SellerOrderStatus | string
): SellerOrderStatus[] {
  const transitions: Record<string, SellerOrderStatus[]> = {
    PENDING_PAYMENT: [], // Strictly blocked
    CONFIRMED: ['PACKED', 'PROCESSING', 'CANCELLED'],
    PROCESSING: ['PACKED', 'CANCELLED'],
    PACKED: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
    DELIVERED: ['RETURN_REQUESTED'],
    CANCELLED: [],
    RETURN_REQUESTED: ['RETURNED'],
    RETURNED: [],
  };

  return transitions[currentStatus] || [];
}

/**
 * Checks if the seller sub-order is in an unpaid state awaiting customer payment.
 */
export function isSellerOrderUnpaid(status: SellerOrderStatus | string): boolean {
  return status === 'PENDING_PAYMENT';
}

/**
 * Human-readable display label for seller order status.
 */
export function formatSellerOrderStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 'Awaiting Payment';
    case 'CONFIRMED':
      return 'Confirmed / Ready to Pack';
    case 'PROCESSING':
      return 'Processing & Packing';
    case 'PACKED':
      return 'Packed / Ready to Ship';
    case 'SHIPPED':
      return 'Shipped / In Transit';
    case 'DELIVERED':
      return 'Delivered';
    case 'CANCELLED':
      return 'Cancelled';
    case 'RETURN_REQUESTED':
      return 'Return Requested';
    case 'RETURNED':
      return 'Returned & Restocked';
    default:
      return status;
  }
}

/**
 * Maps seller order status to CSS badge classes.
 */
export function getSellerStatusBadgeClass(status: string): string {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 'bb-badge-warning';
    case 'CONFIRMED':
    case 'PROCESSING':
    case 'PACKED':
      return 'bb-badge-primary';
    case 'SHIPPED':
      return 'bb-badge-neutral';
    case 'DELIVERED':
      return 'bb-badge-success';
    case 'CANCELLED':
      return 'bb-badge-danger';
    case 'RETURN_REQUESTED':
      return 'bb-badge-warning';
    case 'RETURNED':
      return 'bb-badge-neutral';
    default:
      return 'bb-badge-neutral';
  }
}

export const sellerOrdersApi = {
  /**
   * GET /api/v1/seller/orders
   * Retrieves sub-orders belonging exclusively to shops owned by the authenticated seller.
   * Scoped strictly by backend JWT authenticated seller session (never client shopId).
   */
  async getSellerOrders(params?: QuerySellerOrdersParams): Promise<SellerOrderListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.status) searchParams.set('status', params.status);

    const qs = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return apiClient.request<SellerOrderListResponse>(`/seller/orders${qs}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/seller/orders/:subOrderNumber
   * Retrieves single seller sub-order details.
   * Enforces shop ownership. Returns item snapshots, order financial breakdown,
   * delivery address, and status progression timeline.
   */
  async getSellerOrderByNumber(subOrderNumber: string): Promise<SellerOrderDetailResponse> {
    return apiClient.request<SellerOrderDetailResponse>(
      `/seller/orders/${encodeURIComponent(subOrderNumber)}`,
      {
        method: 'GET',
      }
    );
  },

  /**
   * PATCH /api/v1/seller/orders/:subOrderNumber/status
   * Updates SellerOrder status with transactional row-level lock and validation.
   */
  async updateSellerOrderStatus(
    subOrderNumber: string,
    payload: UpdateSellerOrderStatusPayload
  ): Promise<UpdateSellerOrderStatusResponse> {
    return apiClient.request<UpdateSellerOrderStatusResponse>(
      `/seller/orders/${encodeURIComponent(subOrderNumber)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },
};
