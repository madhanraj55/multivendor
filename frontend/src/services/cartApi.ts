import { apiClient } from './apiClient.ts';
import type {
  BackendCartResponse,
  BackendCartItem,
  AddToCartPayload,
  UpdateCartItemPayload,
  CartItem,
  Product,
} from '../types/index.ts';

/**
 * Maps a backend CartItem entity to the frontend UI CartItem model.
 * Preserves compatibility with existing CartPage layout, multi-vendor grouping, and summaries.
 */
export function mapBackendCartItemToUi(item: BackendCartItem): CartItem {
  const p = item.product || { id: '', title: 'Product', slug: '', status: '', thumbnailUrl: null };
  const shop = item.shop || { id: '', name: 'Marketplace Seller', slug: '', status: 'APPROVED' };
  const unitPrice = Number(item.unitPrice) || 0;
  const mrp = Number(item.mrp) || unitPrice;
  const discountPercent = mrp > unitPrice && mrp > 0 ? Math.round(((mrp - unitPrice) / mrp) * 100) : 0;

  const productModel: Product = {
    id: p.id || '',
    title: p.title || 'Product',
    slug: p.slug || '',
    description: '',
    brand: '',
    category: 'General',
    categoryId: '',
    sellerId: shop.id || '',
    sellerName: shop.name || 'Marketplace Seller',
    sellerCity: '',
    sellerRating: 4.8,
    sellerVerified: shop.status === 'APPROVED',
    rating: 4.8,
    reviewCount: 1,
    price: unitPrice,
    originalPrice: mrp,
    discountPercent,
    inStock: Boolean(item.isAvailable) && (item.availableStock === undefined || item.availableStock === null || item.availableStock > 0),
    stockQuantity: item.availableStock !== undefined && item.availableStock !== null ? item.availableStock : 0,
    images: p.thumbnailUrl ? [p.thumbnailUrl] : [],
    thumbnail:
      p.thumbnailUrl ||
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80',
    specifications: {},
    highlights: [],
  };

  // Convert attributes object to Record<string, string>
  const selectedVariants: Record<string, string> = {};
  if (item.variant?.attributes && typeof item.variant.attributes === 'object') {
    for (const [k, v] of Object.entries(item.variant.attributes)) {
      selectedVariants[k] = String(v);
    }
  }

  return {
    id: item.id,
    productId: p.id || '',
    variantId: item.variantId,
    product: productModel,
    selectedVariants,
    quantity: item.quantity,
    price: unitPrice,
    mrp,
    lineTotal: Number(item.lineTotal) || (unitPrice * item.quantity),
    isAvailable: Boolean(item.isAvailable),
    availableStock: item.availableStock !== undefined && item.availableStock !== null ? item.availableStock : 0,
    sellerId: shop.id || '',
    sellerName: shop.name || 'Marketplace Seller',
  };
}

export const cartApi = {
  /**
   * GET /api/v1/cart
   * Retrieves or lazily creates the customer cart with line items, seller details,
   * stock availability, line totals, and calculated subtotal.
   */
  async getCart(): Promise<BackendCartResponse> {
    return apiClient.request<BackendCartResponse>('/cart', {
      method: 'GET',
    });
  },

  /**
   * POST /api/v1/cart/items
   * Adds a product variant with specified quantity to the customer's cart.
   * Expects { variantId: string, quantity: number } satisfying AddToCartDto.
   */
  async addToCart(payload: AddToCartPayload): Promise<BackendCartResponse> {
    return apiClient.request<BackendCartResponse>('/cart/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * PATCH /api/v1/cart/items/:variantId
   * Updates the quantity of a specific variant in the customer's cart.
   * Expects { quantity: number } satisfying UpdateCartItemDto.
   */
  async updateCartItem(variantId: string, payload: UpdateCartItemPayload): Promise<BackendCartResponse> {
    return apiClient.request<BackendCartResponse>(`/cart/items/${variantId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * DELETE /api/v1/cart/items/:variantId
   * Removes an individual variant from the customer's cart.
   */
  async removeCartItem(variantId: string): Promise<BackendCartResponse> {
    return apiClient.request<BackendCartResponse>(`/cart/items/${variantId}`, {
      method: 'DELETE',
    });
  },

  /**
   * DELETE /api/v1/cart
   * Clears all items from the customer's cart.
   */
  async clearCart(): Promise<BackendCartResponse> {
    return apiClient.request<BackendCartResponse>('/cart', {
      method: 'DELETE',
    });
  },

  /**
   * GET /api/v1/products/:id/variants
   * Helper to retrieve active variants with inventory for a product.
   */
  async getProductVariants(
    productId: string
  ): Promise<Array<{ id: string; attributes?: Record<string, unknown> }>> {
    return apiClient.request<Array<{ id: string; attributes?: Record<string, unknown> }>>(
      `/products/${productId}/variants`,
      {
        method: 'GET',
        skipAuth: true,
      }
    );
  },
};

