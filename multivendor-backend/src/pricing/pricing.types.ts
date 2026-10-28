export interface DeliveryTierRule {
  maxKm: number;
  fee: number;
}

export interface DeliveryRules {
  tiers: DeliveryTierRule[];
  fallbackLocalFee: number;
  fallbackRegionalFee: number;
  fallbackNationalFee: number;
}

export interface PricingSettings {
  globalCommissionPercentage: number; // e.g. 15 (%)
  platformFee: number; // fixed platform fee, e.g. ₹3
  deliveryRules: DeliveryRules;
}

export interface AddressCoordinates {
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}

export interface ItemPriceCalculation {
  sellerBasePrice: number;
  commissionRate: number;
  commissionAmount: number;
  customerPrice: number;
  mrp: number;
}

export interface PackageDeliveryCalculation {
  shopId: string;
  shopName: string;
  distanceKm: number;
  deliveryFee: number;
  isEstimated: boolean;
  missingCoordinates: boolean;
}

export interface PackagePricingCalculation {
  shopId: string;
  shopName: string;
  subtotalAmount: number;
  commissionAmount: number;
  netSellerPayable: number;
  deliveryFee: number;
  totalAmount: number;
  items: Array<{
    variantId: string;
    productTitle: string;
    sku: string;
    quantity: number;
    sellerBasePrice: number;
    commissionAmount: number;
    customerUnitPrice: number;
    totalAmount: number;
  }>;
}

export interface OrderPricingCalculation {
  subtotalAmount: number;
  shippingFee: number;
  platformFee: number;
  totalAmount: number;
  currency: string;
  packages: PackagePricingCalculation[];
}
