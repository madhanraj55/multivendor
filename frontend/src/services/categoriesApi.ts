import { apiClient } from './apiClient.ts';
import type { BackendCategory } from '../types/index.ts';

export const categoriesApi = {
  /**
   * GET /api/v1/categories
   * Retrieves all active public categories.
   */
  async getCategories(): Promise<BackendCategory[]> {
    return apiClient.request<BackendCategory[]>('/categories', {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/categories/tree
   * Retrieves hierarchical category tree starting from top-level parent categories.
   */
  async getCategoryTree(): Promise<BackendCategory[]> {
    return apiClient.request<BackendCategory[]>('/categories/tree', {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/categories/:slug
   * Retrieves a single category by slug.
   */
  async getCategoryBySlug(slug: string): Promise<BackendCategory> {
    return apiClient.request<BackendCategory>(`/categories/${encodeURIComponent(slug)}`, {
      method: 'GET',
    });
  },
};

export const {
  getCategories,
  getCategoryTree,
  getCategoryBySlug,
} = categoriesApi;

