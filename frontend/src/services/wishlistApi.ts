import { apiClient } from './apiClient.ts';
import type {
  BackendWishlistResponse,
  AddToWishlistPayload,
  ClearWishlistResponse,
  BackendWishlistItem,
  Product,
} from '../types/index.ts';

/**
 * Maps a backend wishlist item to the frontend UI Product model.
 * Preserves UI compatibility for product cards, wishlist pages, and cart integration.
 */
export function mapWishlistItemToProduct(item: BackendWishlistItem): Product {
  const p = item.product;
  const price = p.pricing?.minPrice ?? 0;
  const originalPrice = p.pricing?.minMrp ?? price;
  const discountPercent =
    originalPrice > price && originalPrice > 0
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : 0;

  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: '',
    brand: p.brand || '',
    category: p.category?.name || 'General',
    categoryId: p.category?.id || '',
    sellerId: p.shop?.id || '',
    sellerName: p.shop?.name || 'Marketplace Seller',
    sellerCity: '',
    sellerRating: 4.8,
    sellerVerified: p.shop?.status === 'APPROVED',
    rating: 4.8,
    reviewCount: 1,
    price,
    originalPrice,
    discountPercent,
    inStock: p.availability?.isInStock ?? true,
    stockQuantity: p.availability?.totalAvailableStock ?? 1,
    images: p.thumbnailUrl ? [p.thumbnailUrl] : [],
    thumbnail: p.thumbnailUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
    specifications: {},
    highlights: [],
  };
}

export const wishlistApi = {
  /**
   * GET /api/v1/wishlist
   * Retrieves the authenticated user's wishlist with full product, pricing, and stock details.
   */
  async getWishlist(): Promise<BackendWishlistResponse> {
    return apiClient.request<BackendWishlistResponse>('/wishlist', {
      method: 'GET',
    });
  },

  /**
   * POST /api/v1/wishlist/items
   * Adds a product to the authenticated user's wishlist.
   * Expects { productId: string } payload.
   * Gracefully returns updated BackendWishlistResponse (idempotent upsert on backend).
   */
  async addToWishlist(payload: AddToWishlistPayload): Promise<BackendWishlistResponse> {
    return apiClient.request<BackendWishlistResponse>('/wishlist/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * DELETE /api/v1/wishlist/items/:productId
   * Removes a single product from the authenticated user's wishlist.
   * Returns the updated BackendWishlistResponse.
   */
  async removeFromWishlist(productId: string): Promise<BackendWishlistResponse> {
    return apiClient.request<BackendWishlistResponse>(`/wishlist/items/${productId}`, {
      method: 'DELETE',
    });
  },

  /**
   * DELETE /api/v1/wishlist
   * Clears all items from the authenticated user's wishlist.
   */
  async clearWishlist(): Promise<ClearWishlistResponse> {
    return apiClient.request<ClearWishlistResponse>('/wishlist', {
      method: 'DELETE',
    });
  },
};
