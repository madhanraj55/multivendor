import { apiClient } from './apiClient.ts';

export interface DeliveryTier {
  maxKm: number;
  fee: number;
}

export interface DeliveryRules {
  tiers: DeliveryTier[];
  fallbackLocalFee: number;
  fallbackRegionalFee: number;
  fallbackNationalFee: number;
}

export interface PricingSettings {
  globalCommissionPercentage: number;
  platformFee: number;
  deliveryRules: DeliveryRules;
}

export interface ItemPricingPreview {
  sellerBasePrice: number;
  commissionRate: number;
  commissionAmount: number;
  customerPrice: number;
  mrp?: number;
}

export const pricingApi = {
  getPublicSettings: async (): Promise<PricingSettings> => {
    return apiClient.request<PricingSettings>('/pricing/public-settings', {
      method: 'GET',
    });
  },

  previewPricing: async (sellerPrice: number, mrp?: number): Promise<ItemPricingPreview> => {
    const params = new URLSearchParams({ sellerPrice: String(sellerPrice) });
    if (mrp !== undefined) {
      params.append('mrp', String(mrp));
    }
    return apiClient.request<ItemPricingPreview>(`/pricing/preview?${params.toString()}`, {
      method: 'GET',
    });
  },

  getAdminPricingSettings: async (): Promise<PricingSettings> => {
    return apiClient.request<PricingSettings>('/admin/pricing/settings', {
      method: 'GET',
    });
  },

  updateAdminPricingSettings: async (dto: Partial<PricingSettings>): Promise<PricingSettings> => {
    return apiClient.request<PricingSettings>('/admin/pricing/settings', {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },
};
