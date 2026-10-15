import { apiClient } from './apiClient.ts';
import type {
  SellerProductItem,
  CreateProductPayload,
  UpdateProductPayload,
  SellerProductVariant,
  CreateProductVariantPayload,
  UpdateProductVariantPayload,
  UpdateVariantStatusPayload,
  UpdateVariantStatusResponse,
  DeleteVariantResponse,
  SellerProductImage,
  AddProductImagePayload,
  UpdateProductImagePayload,
  DeleteProductImageResponse,
  AdjustStockPayload,
  SellerProductInventory,
  UploadProductImageResponse,
} from '../types/index.ts';

/**
 * Validates that selling price does not exceed MRP and both are non-negative.
 * Backend rule: selling price must be <= MRP.
 */
export function validatePriceAgainstMrp(price: number, mrp: number): boolean {
  if (typeof price !== 'number' || typeof mrp !== 'number') return false;
  if (isNaN(price) || isNaN(mrp)) return false;
  return price >= 0 && mrp >= 0 && price <= mrp;
}

/**
 * Validates image URL protocol format.
 * Backend rule: Image URL must be a valid HTTP or HTTPS URL.
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const sellerProductsApi = {
  /**
   * GET /api/v1/products/seller/my-products
   * Retrieves products belonging exclusively to the authenticated seller's shop.
   */
  async getMyProducts(): Promise<SellerProductItem[]> {
    return apiClient.request<SellerProductItem[]>('/products/seller/my-products', {
      method: 'GET',
    });
  },

  /**
   * POST /api/v1/products
   * Creates a new product with initial variants, images, and inventory in an atomic transaction.
   * Requires seller shop to be APPROVED.
   */
  async createProduct(payload: CreateProductPayload): Promise<SellerProductItem> {
    return apiClient.request<SellerProductItem>('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * PATCH /api/v1/products/:id
   * Updates product metadata and status.
   * Enforces shop ownership.
   */
  async updateProduct(id: string, payload: UpdateProductPayload): Promise<SellerProductItem> {
    return apiClient.request<SellerProductItem>(`/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * GET /api/v1/products/:id/variants
   * Retrieves variants for a product including inventory balances.
   */
  async getProductVariants(productId: string): Promise<SellerProductVariant[]> {
    return apiClient.request<SellerProductVariant[]>(
      `/products/${encodeURIComponent(productId)}/variants`,
      {
        method: 'GET',
      }
    );
  },

  /**
   * POST /api/v1/products/:id/variants
   * Creates an additional variant for a product with initial inventory movement.
   * Requires seller shop to be APPROVED.
   */
  async createVariant(
    productId: string,
    payload: CreateProductVariantPayload
  ): Promise<SellerProductVariant> {
    return apiClient.request<SellerProductVariant>(
      `/products/${encodeURIComponent(productId)}/variants`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * PATCH /api/v1/products/variants/:variantId
   * Updates variant title, SKU, price, MRP, attributes, and weight.
   * Stock edits are prohibited here; stock must be adjusted via adjustStock.
   */
  async updateVariant(
    variantId: string,
    payload: UpdateProductVariantPayload
  ): Promise<SellerProductVariant> {
    return apiClient.request<SellerProductVariant>(
      `/products/variants/${encodeURIComponent(variantId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * PATCH /api/v1/products/variants/:variantId/status
   * Activates or deactivates a variant.
   */
  async updateVariantStatus(
    variantId: string,
    payload: UpdateVariantStatusPayload
  ): Promise<UpdateVariantStatusResponse> {
    return apiClient.request<UpdateVariantStatusResponse>(
      `/products/variants/${encodeURIComponent(variantId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * DELETE /api/v1/products/variants/:variantId
   * Safely deletes an unreferenced variant, or deactivates if historical order references exist.
   */
  async deleteVariant(variantId: string): Promise<DeleteVariantResponse> {
    return apiClient.request<DeleteVariantResponse>(
      `/products/variants/${encodeURIComponent(variantId)}`,
      {
        method: 'DELETE',
      }
    );
  },

  /**
   * GET /api/v1/products/:id/images
   * Retrieves product images ordered by sortOrder ascending.
   */
  async getProductImages(productId: string): Promise<SellerProductImage[]> {
    return apiClient.request<SellerProductImage[]>(
      `/products/${encodeURIComponent(productId)}/images`,
      {
        method: 'GET',
      }
    );
  },

  /**
   * POST /api/v1/products/:id/images
   * Adds an image to a product by URL.
   */
  async addProductImage(
    productId: string,
    payload: AddProductImagePayload
  ): Promise<SellerProductImage> {
    return apiClient.request<SellerProductImage>(
      `/products/${encodeURIComponent(productId)}/images`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * PATCH /api/v1/products/images/:imageId
   * Updates image metadata, alt text, display order, or thumbnail flag.
   */
  async updateProductImage(
    imageId: string,
    payload: UpdateProductImagePayload
  ): Promise<SellerProductImage> {
    return apiClient.request<SellerProductImage>(
      `/products/images/${encodeURIComponent(imageId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  /**
   * DELETE /api/v1/products/images/:imageId
   * Removes an image from a product.
   */
  async deleteProductImage(imageId: string): Promise<DeleteProductImageResponse> {
    return apiClient.request<DeleteProductImageResponse>(
      `/products/images/${encodeURIComponent(imageId)}`,
      {
        method: 'DELETE',
      }
    );
  },

  /**
   * POST /api/v1/products/stock/adjust
   * Adjusts stock quantity for a variant and records an inventory movement audit entry.
   */
  async adjustStock(payload: AdjustStockPayload): Promise<SellerProductInventory> {
    return apiClient.request<SellerProductInventory>('/products/stock/adjust', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * POST /api/v1/products/upload-image
   * Uploads an image file (JPEG, PNG, WebP up to 5MB) using FormData.
   * Returns the permanent public image URL and file metadata.
   */
  async uploadProductImage(file: File): Promise<UploadProductImageResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return apiClient.request<UploadProductImageResponse>('/products/upload-image', {
      method: 'POST',
      body: formData,
    });
  },
};

export const {
  getMyProducts,
  createProduct,
  updateProduct,
  getProductVariants,
  createVariant,
  updateVariant,
  updateVariantStatus,
  deleteVariant,
  getProductImages,
  addProductImage,
  updateProductImage,
  deleteProductImage,
  adjustStock,
  uploadProductImage,
} = sellerProductsApi;


