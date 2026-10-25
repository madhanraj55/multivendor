import { apiClient } from './apiClient.ts';
import type { UserRole, UserStatus } from '../types/index.ts';

export interface AdminUserItem {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  shop?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
}

export interface AdminUsersListResponse {
  data: AdminUserItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AdminUserDetailResponse extends AdminUserItem {
  recentOrders?: Array<{
    id: string;
    orderNumber: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  }>;
  stats: {
    totalOrders: number;
    totalAddresses: number;
    activeOrTotalSessions: number;
  };
}

export interface QueryAdminUsersParams {
  page?: number;
  limit?: number;
  role?: UserRole;
  status?: UserStatus;
  search?: string;
}

export interface UpdateUserStatusPayload {
  status: UserStatus;
  reason?: string;
}

export const adminUsersApi = {
  /**
   * GET /api/v1/admin/users
   */
  async getUsers(params: QueryAdminUsersParams = {}): Promise<AdminUsersListResponse> {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.role) sp.set('role', params.role);
    if (params.status) sp.set('status', params.status);
    if (params.search) sp.set('search', params.search.trim());

    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return apiClient.request<AdminUsersListResponse>(`/admin/users${qs}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/admin/users/:id
   */
  async getUserById(id: string): Promise<AdminUserDetailResponse> {
    return apiClient.request<AdminUserDetailResponse>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  },

  /**
   * PATCH /api/v1/admin/users/:id/status
   */
  async updateUserStatus(id: string, payload: UpdateUserStatusPayload): Promise<{ message: string; user: AdminUserItem }> {
    return apiClient.request<{ message: string; user: AdminUserItem }>(
      `/admin/users/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },
};
