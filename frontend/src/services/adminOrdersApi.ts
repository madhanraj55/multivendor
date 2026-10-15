import { apiClient } from './apiClient.ts';
import type {
  OrderStatus,
  AdminOrderQuery,
  AdminOrderListResponse,
  AdminOrderDetailResponse,
  AdminSubOrdersResponse,
  AdminUpdateOrderStatusPayload,
  AdminUpdateOrderStatusResponse,
} from '../types/index.ts';

/**
 * Returns allowed next target statuses according to the backend OrderStatus state machine.
 *
 * Security & Business Rules:
 * - PENDING_PAYMENT orders cannot be marked as CONFIRMED, PROCESSING, etc.
 *   Payment confirmation is required before fulfilling orders.
 *   Unpaid orders may only be CANCELLED by administrator.
 * - Confirmed orders may be moved to PROCESSING or CANCELLED.
 * - Terminal states DELIVERED and CANCELLED have no further transitions.
 */
export function getAdminAllowedTransitions(currentStatus: OrderStatus | string): OrderStatus[] {
  const transitions: Record<string, OrderStatus[]> = {
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

/**
 * Checks if the order is still in an unpaid awaiting payment state.
 */
export function isOrderUnpaid(status: OrderStatus | string): boolean {
  return status === 'PENDING_PAYMENT';
}

/**
 * Human-readable display label for order status.
 */
export function formatOrderStatusLabel(status: string): string {
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

/**
 * Maps order status to badge CSS class.
 */
export function getAdminStatusBadgeClass(status: string): string {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 'bb-badge-warning';
    case 'CONFIRMED':
    case 'PROCESSING':
    case 'PARTIALLY_SHIPPED':
      return 'bb-badge-primary';
    case 'SHIPPED':
      return 'bb-badge-neutral';
    case 'DELIVERED':
      return 'bb-badge-success';
    case 'CANCELLED':
      return 'bb-badge-danger';
    default:
      return 'bb-badge-neutral';
  }
}

export const adminOrdersApi = {
  /**
   * GET /api/v1/admin/orders
   * Retrieves paginated parent orders across all customers and vendors.
   * Supports filtering by status, orderNumber substring, customerId UUID, and date range.
   */
  async getAdminOrders(query?: AdminOrderQuery): Promise<AdminOrderListResponse> {
    const params = new URLSearchParams();
    if (query?.page) params.set('page', String(query.page));
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.status) params.set('status', query.status);
    if (query?.orderNumber?.trim()) params.set('orderNumber', query.orderNumber.trim());
    if (query?.customerId?.trim()) params.set('customerId', query.customerId.trim());
    if (query?.startDate) params.set('startDate', query.startDate);
    if (query?.endDate) params.set('endDate', query.endDate);

    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.request<AdminOrderListResponse>(`/admin/orders${qs}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/admin/orders/:orderNumber
   * Retrieves full single order with customer profile, payment summary,
   * delivery addresses, seller sub-orders, items, and status history.
   */
  async getAdminOrderByNumber(orderNumber: string): Promise<AdminOrderDetailResponse> {
    return apiClient.request<AdminOrderDetailResponse>(
      `/admin/orders/${encodeURIComponent(orderNumber)}`,
      {
        method: 'GET',
      }
    );
  },

  /**
   * GET /api/v1/admin/orders/:orderNumber/suborders
   * Dedicated sub-order breakdown for an order.
   */
  async getAdminSubOrders(orderNumber: string): Promise<AdminSubOrdersResponse> {
    return apiClient.request<AdminSubOrdersResponse>(
      `/admin/orders/${encodeURIComponent(orderNumber)}/suborders`,
      {
        method: 'GET',
      }
    );
  },

  /**
   * PATCH /api/v1/admin/orders/:orderNumber/status
   * Controlled admin intervention on parent Order status following the backend status transition matrix.
   */
  async updateAdminOrderStatus(
    orderNumber: string,
    payload: AdminUpdateOrderStatusPayload
  ): Promise<AdminUpdateOrderStatusResponse> {
    return apiClient.request<AdminUpdateOrderStatusResponse>(
      `/admin/orders/${encodeURIComponent(orderNumber)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },
};
