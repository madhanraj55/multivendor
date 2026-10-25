import { apiClient } from './apiClient.ts';
import type { Product } from '../types/index.ts';

export interface BackendPublishedVariant {
  id: string;
  productId: string;
  sku: string;
  title: string;
  mrp: string | number;
  price: string | number;
  attributes: Record<string, any>;
  isActive: boolean;
  inventory?: {
    availableQuantity: number;
  } | null;
}

export interface BackendPublishedProduct {
  id: string;
  shopId: string;
  categoryId: string;
  title: string;
  slug: string;
  description: string;
  brand: string | null;
  status: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  shop?: {
    id: string;
    name: string;
    slug: string;
    logoUrl?: string | null;
  } | null;
  images: Array<{
    id: string;
    url: string;
    altText?: string | null;
    isThumbnail: boolean;
    sortOrder: number;
  }>;
  variants: BackendPublishedVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface PublishedProductsResponse {
  items: BackendPublishedProduct[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PublicApprovedShop {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  status: string;
  createdAt: string;
  pickupAddress?: {
    city: string;
    state: string;
  } | null;
  _count?: {
    products: number;
  };
}

/**
 * Maps authoritative PostgreSQL BackendPublishedProduct to frontend Product interface.
 */
export function mapPublishedProductToUi(item: BackendPublishedProduct): Product {
  // Compute price and MRP from variants
  let minPrice = Infinity;
  let minMrp = Infinity;
  let totalStock = 0;

  if (item.variants && item.variants.length > 0) {
    for (const v of item.variants) {
      const vPrice = Number(v.price);
      const vMrp = Number(v.mrp);
      if (!isNaN(vPrice) && vPrice < minPrice) minPrice = vPrice;
      if (!isNaN(vMrp) && vMrp < minMrp) minMrp = vMrp;
      totalStock += v.inventory?.availableQuantity ?? 0;
    }
  }

  const effectivePrice = minPrice !== Infinity ? minPrice : 0;
  const effectiveMrp = minMrp !== Infinity ? minMrp : effectivePrice;
  const discountPercent =
    effectiveMrp > effectivePrice && effectiveMrp > 0
      ? Math.round(((effectiveMrp - effectivePrice) / effectiveMrp) * 100)
      : 0;

  // Image resolution
  const sortedImages = (item.images || []).sort((a, b) => a.sortOrder - b.sortOrder);
  const thumbnailObj = sortedImages.find((img) => img.isThumbnail) || sortedImages[0];
  const thumbnail = thumbnailObj?.url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=80';
  const imageUrls = sortedImages.map((img) => img.url);
  if (imageUrls.length === 0) {
    imageUrls.push(thumbnail);
  }

  // Variant grouping for PDP
  const variantGroups: any[] = [];
  if (item.variants && item.variants.length > 1) {
    variantGroups.push({
      name: 'Option',
      options: item.variants.map((v) => ({
        label: v.title || v.sku,
        inStock: (v.inventory?.availableQuantity ?? 0) > 0,
      })),
    });
  }

  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    description: item.description || '',
    brand: item.brand || '',
    category: item.category?.name || 'General',
    categoryId: item.categoryId || item.category?.id || '',
    sellerId: item.shop?.id || item.shopId || '',
    sellerName: item.shop?.name || 'Marketplace Seller',
    sellerCity: '',
    sellerRating: 4.9,
    sellerVerified: true,
    rating: 4.8,
    reviewCount: 1,
    price: effectivePrice,
    originalPrice: effectiveMrp,
    discountPercent,
    inStock: totalStock > 0 || (item.variants && item.variants.length === 0),
    stockQuantity: totalStock,
    images: imageUrls,
    thumbnail,
    variants: variantGroups.length > 0 ? variantGroups : undefined,
    specifications: {},
    highlights: [],
  };
}

export const publicCatalogApi = {
  /**
   * GET /api/v1/products
   * Retrieves published products with optional category, search query, and pagination.
   */
  async getPublishedProducts(params?: {
    categoryId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PublishedProductsResponse> {
    const sp = new URLSearchParams();
    if (params?.categoryId) sp.set('categoryId', params.categoryId);
    if (params?.search) sp.set('search', params.search);
    if (params?.page) sp.set('page', String(params.page));
    if (params?.limit) sp.set('limit', String(params.limit));

    const qs = sp.toString() ? `?${sp.toString()}` : '';
    return apiClient.request<PublishedProductsResponse>(`/products${qs}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/products/:id
   * Retrieves single published product by ID.
   */
  async getPublishedProductById(id: string): Promise<BackendPublishedProduct> {
    return apiClient.request<BackendPublishedProduct>(`/products/${encodeURIComponent(id)}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/v1/shops
   * Retrieves approved seller shops.
   */
  async getApprovedShops(): Promise<PublicApprovedShop[]> {
    return apiClient.request<PublicApprovedShop[]>('/shops', {
      method: 'GET',
    });
  },
};
