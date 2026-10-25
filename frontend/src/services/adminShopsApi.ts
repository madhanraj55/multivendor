import { apiClient } from './apiClient.ts';
import type { ShopStatus } from '../types/index.ts';

export interface AdminShopItem {
  id: string;
  sellerId: string;
  name: string;
  slug: string;
  description: string | null;
  gstin: string | null;
  pan: string | null;
  fssaiNumber: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  status: ShopStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seller?: {
    id: string;
    email: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    phone: string | null;
    isEmailVerified: boolean;
  };
  pickupAddress?: {
    id: string;
    city: string;
    state: string;
    postalCode: string;
    addressLine1: string;
  } | null;
  documentsCount?: number;
}

export interface AdminShopsListResponse {
  data: AdminShopItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface QueryAdminShopsParams {
  page?: number;
  limit?: number;
  status?: ShopStatus;
  search?: string;
}

export interface UpdateShopStatusPayload {
  status: ShopStatus;
  reason?: string;
}

export const adminShopsApi = {
  /**
   * GET /api/v1/admin/shops/pending (supports status & search queries)
   */
  async getShops(params: QueryAdminShopsParams = {}): Promise<AdminShopsListResponse> {
    const sp = new URLSearchParams();
    if (params.page) sp.set('page', String(params.page));
    if (params.limit) sp.set('limit', String(params.limit));
    if (params.status) sp.set('status', params.status);
    if (params.search) sp.set('search', params.search.trim());

    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return apiClient.request<AdminShopsListResponse>(`/admin/shops/pending${qs}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/admin/shops/:id
   */
  async getShopById(id: string): Promise<AdminShopItem> {
    return apiClient.request<AdminShopItem>(`/admin/shops/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  },

  /**
   * PATCH /api/v1/admin/shops/:id/status
   */
  async updateShopStatus(id: string, payload: UpdateShopStatusPayload): Promise<{ message: string; shop: AdminShopItem }> {
    return apiClient.request<{ message: string; shop: AdminShopItem }>(
      `/admin/shops/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },
};
