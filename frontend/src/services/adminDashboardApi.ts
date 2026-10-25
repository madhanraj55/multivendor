import { apiClient } from './apiClient.ts';

export interface AdminDashboardMetrics {
  totalCustomers: number;
  totalSellers: number;
  totalAdmins: number;
  totalShops: number;
  pendingShops: number;
  approvedShops: number;
  suspendedShops: number;
  totalProducts: number;
  publishedProducts: number;
  totalOrders: number;
  paidOrdersCount: number;
  completedRevenue: number;
}

export interface AdminDashboardRecentOrder {
  id: string;
  orderNumber: string;
  totalAmount: string | number;
  status: string;
  createdAt: string;
  customer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export interface AdminDashboardPendingShop {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  seller?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
  } | null;
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
  } | null;
}

export interface AdminDashboardSummaryResponse {
  metrics: AdminDashboardMetrics;
  recentOrders: AdminDashboardRecentOrder[];
  pendingShops: AdminDashboardPendingShop[];
}

export const adminDashboardApi = {
  getSummary: async (): Promise<AdminDashboardSummaryResponse> => {
    return apiClient.request<AdminDashboardSummaryResponse>('/admin/dashboard/summary', {
      method: 'GET',
    });
  },
};
