import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AddressCoordinates,
  ItemPriceCalculation,
  OrderPricingCalculation,
  PackageDeliveryCalculation,
  PackagePricingCalculation,
  PricingSettings,
} from './pricing.types.js';
import { UpdatePricingSettingsDto } from './dto/update-pricing-settings.dto.js';

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private readonly settingsFilePath = join(process.cwd(), 'data', 'pricing-settings.json');

  private settings: PricingSettings = {
    globalCommissionPercentage: 15, // Default 10%
    platformFee: 3, // Default fixed ₹3 per order
    deliveryRules: {
      tiers: [
        { maxKm: 5, fee: 30 },
        { maxKm: 25, fee: 50 },
        { maxKm: 100, fee: 80 },
        { maxKm: 500, fee: 120 },
        { maxKm: 999999, fee: 160 },
      ],
      fallbackLocalFee: 40,
      fallbackRegionalFee: 70,
      fallbackNationalFee: 110,
    },
  };

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      if (existsSync(this.settingsFilePath)) {
        const raw = readFileSync(this.settingsFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        this.settings = {
          globalCommissionPercentage:
            typeof parsed.globalCommissionPercentage === 'number'
              ? parsed.globalCommissionPercentage
              : this.settings.globalCommissionPercentage,
          platformFee:
            typeof parsed.platformFee === 'number'
              ? parsed.platformFee
              : this.settings.platformFee,
          deliveryRules: {
            ...this.settings.deliveryRules,
            ...(parsed.deliveryRules || {}),
          },
        };
        this.logger.log('Loaded pricing settings from disk');
      } else {
        this.saveSettings();
      }
    } catch (err) {
      this.logger.warn('Failed to read pricing settings file, using defaults', err);
    }
  }

  private saveSettings(): void {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.settingsFilePath, JSON.stringify(this.settings, null, 2), 'utf8');
    } catch (err) {
      this.logger.error('Failed to persist pricing settings to disk', err);
    }
  }

  getSettings(): PricingSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  updateSettings(dto: UpdatePricingSettingsDto): PricingSettings {
    if (dto.globalCommissionPercentage !== undefined) {
      this.settings.globalCommissionPercentage = this.round(dto.globalCommissionPercentage);
    }

    if (dto.platformFee !== undefined) {
      this.settings.platformFee = this.round(dto.platformFee);
    }

    if (dto.deliveryRules) {
      if (dto.deliveryRules.tiers && Array.isArray(dto.deliveryRules.tiers)) {
        this.settings.deliveryRules.tiers = dto.deliveryRules.tiers.map((t) => ({
          maxKm: Number(t.maxKm),
          fee: this.round(Number(t.fee)),
        }));
      }
      if (dto.deliveryRules.fallbackLocalFee !== undefined) {
        this.settings.deliveryRules.fallbackLocalFee = this.round(dto.deliveryRules.fallbackLocalFee);
      }
      if (dto.deliveryRules.fallbackRegionalFee !== undefined) {
        this.settings.deliveryRules.fallbackRegionalFee = this.round(dto.deliveryRules.fallbackRegionalFee);
      }
      if (dto.deliveryRules.fallbackNationalFee !== undefined) {
        this.settings.deliveryRules.fallbackNationalFee = this.round(dto.deliveryRules.fallbackNationalFee);
      }
    }

    this.saveSettings();
    this.logger.log(
      `Updated pricing settings: Commission=${this.settings.globalCommissionPercentage}%, PlatformFee=₹${this.settings.platformFee}`,
    );
    return this.getSettings();
  }

  /**
   * Financial 2-decimal-place rounding with Number.EPSILON to eliminate floating-point drift.
   */
  round(num: number): number {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
  }

  /**
   * Calculates customer product price as: seller base price + commission percentage of base price.
   * If MRP is specified, ensures customer price does not exceed Maximum Retail Price.
   */
  calculateItemPrice(
    sellerBasePrice: number,
    mrp?: number,
    commissionRateOverride?: number,
  ): ItemPriceCalculation {
    const base = Math.max(0, Number(sellerBasePrice) || 0);
    const rate =
      commissionRateOverride !== undefined
        ? Math.max(0, Number(commissionRateOverride) || 0)
        : this.settings.globalCommissionPercentage;

    const commissionAmount = this.round(base * (rate / 100));
    let customerPrice = this.round(base + commissionAmount);

    const effectiveMrp = mrp !== undefined ? Number(mrp) : customerPrice;

    // Legal compliance: selling price cannot exceed MRP
    if (effectiveMrp > 0 && customerPrice > effectiveMrp) {
      customerPrice = effectiveMrp;
    }

    const effectiveCommission = this.round(Math.max(0, customerPrice - base));

    return {
      sellerBasePrice: base,
      commissionRate: rate,
      commissionAmount: effectiveCommission,
      customerPrice,
      mrp: effectiveMrp,
    };
  }

  /**
   * Calculates great-circle distance between seller pickup and customer delivery addresses
   * using the Haversine formula. If coordinates are absent, applies intelligent geographic zone fallbacks.
   */
  calculateDistanceKm(
    origin?: AddressCoordinates | null,
    destination?: AddressCoordinates | null,
  ): { distanceKm: number; isEstimated: boolean; missingCoordinates: boolean } {
    const hasOriginCoords =
      origin?.latitude !== undefined &&
      origin?.latitude !== null &&
      origin?.longitude !== undefined &&
      origin?.longitude !== null &&
      Number(origin.latitude) !== 0 &&
      Number(origin.longitude) !== 0;

    const hasDestCoords =
      destination?.latitude !== undefined &&
      destination?.latitude !== null &&
      destination?.longitude !== undefined &&
      destination?.longitude !== null &&
      Number(destination.latitude) !== 0 &&
      Number(destination.longitude) !== 0;

    if (hasOriginCoords && hasDestCoords) {
      const lat1 = Number(origin!.latitude);
      const lon1 = Number(origin!.longitude);
      const lat2 = Number(destination!.latitude);
      const lon2 = Number(destination!.longitude);

      const R = 6371; // Earth radius in km
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = this.round(R * c);

      return {
        distanceKm: Math.max(0.1, distance),
        isEstimated: false,
        missingCoordinates: false,
      };
    }

    // Geographic fallback estimation when GPS coordinates are unconfigured
    const originPin = (origin?.postalCode || '').trim();
    const destPin = (destination?.postalCode || '').trim();
    const originCity = (origin?.city || '').toLowerCase().trim();
    const destCity = (destination?.city || '').toLowerCase().trim();
    const originState = (origin?.state || '').toLowerCase().trim();
    const destState = (destination?.state || '').toLowerCase().trim();

    if (originPin && destPin && originPin === destPin) {
      return { distanceKm: 4.5, isEstimated: true, missingCoordinates: true };
    }

    if (originCity && destCity && originCity === destCity) {
      return { distanceKm: 12.0, isEstimated: true, missingCoordinates: true };
    }

    if (originState && destState && originState === destState) {
      return { distanceKm: 120.0, isEstimated: true, missingCoordinates: true };
    }

    // Inter-state / National delivery
    return { distanceKm: 550.0, isEstimated: true, missingCoordinates: true };
  }

  /**
   * Resolves distance-based delivery fee according to configured admin rules.
   */
  calculateDeliveryFee(
    distanceKm: number,
    isEstimated = false,
    origin?: AddressCoordinates | null,
    destination?: AddressCoordinates | null,
  ): number {
    const rules = this.settings.deliveryRules;

    if (isEstimated && rules.fallbackLocalFee !== undefined) {
      const originCity = (origin?.city || '').toLowerCase().trim();
      const destCity = (destination?.city || '').toLowerCase().trim();
      const originState = (origin?.state || '').toLowerCase().trim();
      const destState = (destination?.state || '').toLowerCase().trim();

      if (originCity && destCity && originCity === destCity) {
        return rules.fallbackLocalFee;
      }
      if (originState && destState && originState === destState) {
        return rules.fallbackRegionalFee;
      }
      if (originState && destState && originState !== destState) {
        return rules.fallbackNationalFee;
      }
    }

    // Match tiered distance rules
    const sortedTiers = [...rules.tiers].sort((a, b) => a.maxKm - b.maxKm);
    for (const tier of sortedTiers) {
      if (distanceKm <= tier.maxKm) {
        return tier.fee;
      }
    }

    const lastTier = sortedTiers[sortedTiers.length - 1];
    return lastTier ? lastTier.fee : 150;
  }

  /**
   * Calculates comprehensive multi-vendor cart/order pricing:
   * - Calculates commission per line item and per seller package
   * - Calculates distance-based delivery fee per seller package
   * - Applies fixed platform fee once per order
   */
  calculateOrderPricing(
    sellerGroups: Array<{
      shop: { id: string; name: string; pickupAddress?: AddressCoordinates | null };
      items: Array<{
        variantId: string;
        productTitle: string;
        sku: string;
        quantity: number;
        sellerBasePrice: number;
        mrp?: number;
      }>;
    }>,
    customerAddress?: AddressCoordinates | null,
  ): OrderPricingCalculation {
    let orderSubtotal = 0;
    let orderShippingFee = 0;
    const platformFee = this.settings.platformFee;
    const packages: PackagePricingCalculation[] = [];

    for (const group of sellerGroups) {
      let packageSubtotal = 0;
      let packageCommission = 0;
      let packageSellerPayable = 0;

      const processedItems = group.items.map((it) => {
        const itemPricing = this.calculateItemPrice(it.sellerBasePrice, it.mrp);
        const lineTotal = this.round(itemPricing.customerPrice * it.quantity);
        const lineCommission = this.round(itemPricing.commissionAmount * it.quantity);
        const lineSellerPayout = this.round(itemPricing.sellerBasePrice * it.quantity);

        packageSubtotal = this.round(packageSubtotal + lineTotal);
        packageCommission = this.round(packageCommission + lineCommission);
        packageSellerPayable = this.round(packageSellerPayable + lineSellerPayout);

        return {
          variantId: it.variantId,
          productTitle: it.productTitle,
          sku: it.sku,
          quantity: it.quantity,
          sellerBasePrice: itemPricing.sellerBasePrice,
          commissionAmount: itemPricing.commissionAmount,
          customerUnitPrice: itemPricing.customerPrice,
          totalAmount: lineTotal,
        };
      });

      // Calculate distance and delivery fee per seller package
      const distanceResult = this.calculateDistanceKm(group.shop.pickupAddress, customerAddress);
      const deliveryFee = this.calculateDeliveryFee(
        distanceResult.distanceKm,
        distanceResult.isEstimated,
        group.shop.pickupAddress,
        customerAddress,
      );

      const packageTotal = this.round(packageSubtotal + deliveryFee);

      orderSubtotal = this.round(orderSubtotal + packageSubtotal);
      orderShippingFee = this.round(orderShippingFee + deliveryFee);

      packages.push({
        shopId: group.shop.id,
        shopName: group.shop.name,
        subtotalAmount: packageSubtotal,
        commissionAmount: packageCommission,
        netSellerPayable: packageSellerPayable,
        deliveryFee,
        totalAmount: packageTotal,
        items: processedItems,
      });
    }

    const grandTotal = this.round(orderSubtotal + orderShippingFee + platformFee);

    return {
      subtotalAmount: orderSubtotal,
      shippingFee: orderShippingFee,
      platformFee,
      totalAmount: grandTotal,
      currency: 'INR',
      packages,
    };
  }
}
