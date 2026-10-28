export interface CheckoutItemValidationResult {
  variantId: string;
  productId: string;
  shopId: string;
  shopName: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  sellerBasePrice?: number;
  commissionAmount?: number;
  mrp: number;
  lineSubtotal: number;
  availableStock: number;
  isAvailable: boolean;
  gstRate: number | null;
  taxStatus: 'CONFIGURED' | 'UNCONFIGURED';
  rejectionReason?: string;
}

export interface CheckoutValidationResponse {
  isValid: boolean;
  canProceedToCheckout: boolean;
  currency: string;
  cartId: string;
  totalItems: number;
  totalQuantity: number;
  subtotalAmount: number;
  platformFee?: number;
  taxAmount: number | null;
  taxStatus: 'CONFIGURED' | 'UNCONFIGURED';
  items: CheckoutItemValidationResult[];
  errors: string[];
}
