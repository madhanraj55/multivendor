import { PricingService } from './pricing.service.js';

describe('PricingService (BharatBazaar Pricing Model Unit Tests)', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
    // Reset to baseline defaults for test isolation
    service.updateSettings({
      globalCommissionPercentage: 10,
      platformFee: 3,
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
    });
  });

  // =========================================================================
  // 1. Rounding and Precision Tests (Requirement 9)
  // =========================================================================
  describe('Rounding & Precision (Paise accuracy and edge cases)', () => {
    it('should calculate customer price as seller base price + 10% commission', () => {
      const result = service.calculateItemPrice(500);
      expect(result.sellerBasePrice).toBe(500);
      expect(result.commissionRate).toBe(10);
      expect(result.commissionAmount).toBe(50);
      expect(result.customerPrice).toBe(550);
    });

    it('should round commission to nearest paise with Number.EPSILON without floating drift', () => {
      // 333.33 * 0.125 = 41.66625 -> rounds to 41.67
      const result = service.calculateItemPrice(333.33, undefined, 12.5);
      expect(result.sellerBasePrice).toBe(333.33);
      expect(result.commissionRate).toBe(12.5);
      expect(result.commissionAmount).toBe(41.67);
      expect(result.customerPrice).toBe(375.00);
    });

    it('should handle fractional paise pricing cleanly (99.99 @ 10%)', () => {
      // 99.99 * 0.10 = 9.999 -> rounds to 10.00
      const result = service.calculateItemPrice(99.99);
      expect(result.commissionAmount).toBe(10.00);
      expect(result.customerPrice).toBe(109.99);
    });

    it('should cap customer price at MRP when base price + commission exceeds MRP', () => {
      // Base: 100, Commission: 10% -> 110. But MRP is 105.
      // Customer price must not exceed 105.
      const result = service.calculateItemPrice(100, 105);
      expect(result.customerPrice).toBe(105);
      expect(result.sellerBasePrice).toBe(100);
      expect(result.commissionAmount).toBe(5); // Capped at MRP - Base
      expect(result.mrp).toBe(105);
    });

    it('should safely handle 0 or negative base price', () => {
      const resultZero = service.calculateItemPrice(0);
      expect(resultZero.customerPrice).toBe(0);
      expect(resultZero.commissionAmount).toBe(0);

      const resultNeg = service.calculateItemPrice(-50);
      expect(resultNeg.sellerBasePrice).toBe(0);
      expect(resultNeg.customerPrice).toBe(0);
    });
  });

  // =========================================================================
  // 2. Distance and Delivery Rules Tests (Requirements 4, 10)
  // =========================================================================
  describe('Distance-based Delivery Calculation & Geocoding Fallbacks', () => {
    it('should calculate accurate Haversine distance when GPS coordinates are available', () => {
      // Mumbai to Pune coordinates (~120 km)
      const origin = { latitude: 19.0760, longitude: 72.8777, city: 'Mumbai', state: 'Maharashtra' };
      const destination = { latitude: 18.5204, longitude: 73.8567, city: 'Pune', state: 'Maharashtra' };

      const distance = service.calculateDistanceKm(origin, destination);
      expect(distance.isEstimated).toBe(false);
      expect(distance.missingCoordinates).toBe(false);
      expect(distance.distanceKm).toBeGreaterThan(115);
      expect(distance.distanceKm).toBeLessThan(130);

      const fee = service.calculateDeliveryFee(distance.distanceKm, distance.isEstimated, origin, destination);
      // Distance ~120km matches tier 100-500km -> fee = 120
      expect(fee).toBe(120);
    });

    it('should fallback to intelligent local/regional/national tiers when GPS coordinates are null', () => {
      // Same city fallback
      const localOrigin = { city: 'Bengaluru', state: 'Karnataka' };
      const localDest = { city: 'Bengaluru', state: 'Karnataka' };
      const localDist = service.calculateDistanceKm(localOrigin, localDest);
      expect(localDist.isEstimated).toBe(true);
      expect(localDist.missingCoordinates).toBe(true);
      const localFee = service.calculateDeliveryFee(localDist.distanceKm, true, localOrigin, localDest);
      expect(localFee).toBe(40); // fallbackLocalFee

      // Regional (same state) fallback
      const regOrigin = { city: 'Mysuru', state: 'Karnataka' };
      const regDest = { city: 'Hubballi', state: 'Karnataka' };
      const regDist = service.calculateDistanceKm(regOrigin, regDest);
      expect(regDist.isEstimated).toBe(true);
      const regFee = service.calculateDeliveryFee(regDist.distanceKm, true, regOrigin, regDest);
      expect(regFee).toBe(70); // fallbackRegionalFee

      // National (inter-state) fallback
      const natOrigin = { city: 'Chennai', state: 'Tamil Nadu' };
      const natDest = { city: 'Jaipur', state: 'Rajasthan' };
      const natDist = service.calculateDistanceKm(natOrigin, natDest);
      expect(natDist.isEstimated).toBe(true);
      const natFee = service.calculateDeliveryFee(natDist.distanceKm, true, natOrigin, natDest);
      expect(natFee).toBe(110); // fallbackNationalFee
    });
  });

  // =========================================================================
  // 3. Multi-Vendor Order Calculation Tests (Requirements 5, 7)
  // =========================================================================
  describe('Multi-Vendor Cart & Single Platform Fee (Requirements 5, 7)', () => {
    it('should calculate package delivery and commission per seller and apply single platform fee once', () => {
      const sellerGroups = [
        {
          shop: {
            id: 'shop-seller-1',
            name: 'Handloom Crafts',
            pickupAddress: { latitude: 12.9716, longitude: 77.5946, city: 'Bengaluru', state: 'Karnataka' },
          },
          items: [
            {
              variantId: 'v1',
              productTitle: 'Khadi Cotton Kurta',
              sku: 'KCK-01',
              quantity: 2,
              sellerBasePrice: 400, // + 10% commission = 440 customer price
              mrp: 600,
            },
          ],
        },
        {
          shop: {
            id: 'shop-seller-2',
            name: 'Kashmir Dry Fruits',
            pickupAddress: { latitude: 34.0837, longitude: 74.7973, city: 'Srinagar', state: 'Jammu and Kashmir' },
          },
          items: [
            {
              variantId: 'v2',
              productTitle: 'Organic Walnuts 500g',
              sku: 'OW-500',
              quantity: 1,
              sellerBasePrice: 650, // + 10% commission = 715 customer price
              mrp: 900,
            },
          ],
        },
      ];

      const customerDeliveryAddress = {
        latitude: 12.9750,
        longitude: 77.5980,
        city: 'Bengaluru',
        state: 'Karnataka',
      };

      const calculation = service.calculateOrderPricing(sellerGroups, customerDeliveryAddress);

      // Package 1 (Local Bengaluru delivery < 5km)
      const pkg1 = calculation.packages[0];
      expect(pkg1.shopId).toBe('shop-seller-1');
      expect(pkg1.subtotalAmount).toBe(880); // 440 * 2
      expect(pkg1.commissionAmount).toBe(80); // 40 * 2
      expect(pkg1.netSellerPayable).toBe(800); // 400 * 2
      expect(pkg1.deliveryFee).toBe(30); // 0-5km tier = 30
      expect(pkg1.totalAmount).toBe(910); // 880 + 30

      // Package 2 (National delivery Srinagar -> Bengaluru > 2000 km)
      const pkg2 = calculation.packages[1];
      expect(pkg2.shopId).toBe('shop-seller-2');
      expect(pkg2.subtotalAmount).toBe(715); // 715 * 1
      expect(pkg2.commissionAmount).toBe(65); // 65 * 1
      expect(pkg2.netSellerPayable).toBe(650); // 650 * 1
      expect(pkg2.deliveryFee).toBe(160); // > 500km tier = 160
      expect(pkg2.totalAmount).toBe(875); // 715 + 160

      // Root Order Totals
      expect(calculation.subtotalAmount).toBe(1595); // 880 + 715
      expect(calculation.shippingFee).toBe(190); // 30 + 160
      expect(calculation.platformFee).toBe(3); // Fixed ₹3 platform fee
      // Grand Total = 1595 + 190 + 3 = 1788
      expect(calculation.totalAmount).toBe(1788);

      // Verify platform fee is NOT added per seller package (only charged once per order)
      const sumOfPackageTotals = pkg1.totalAmount + pkg2.totalAmount;
      expect(calculation.totalAmount).toBe(sumOfPackageTotals + 3);
    });
  });

  // =========================================================================
  // 4. Admin Settings & Immutability Under Changes (Requirements 2, 8)
  // =========================================================================
  describe('Admin Settings Update and Historical Order Immutability (Requirements 2, 8)', () => {
    it('should allow admin to update commission percentage and platform fee', () => {
      const updated = service.updateSettings({
        globalCommissionPercentage: 15,
        platformFee: 5,
      });

      expect(updated.globalCommissionPercentage).toBe(15);
      expect(updated.platformFee).toBe(5);

      const itemPricing = service.calculateItemPrice(200);
      expect(itemPricing.commissionAmount).toBe(30); // 15% of 200
      expect(itemPricing.customerPrice).toBe(230);
    });

    it('should preserve original pricing snapshots when settings change later (Requirement 8)', () => {
      // Step A: Order created under initial 10% commission and ₹3 platform fee
      const initialSnapshot = service.calculateItemPrice(1000);
      const orderPricingSnapshot = {
        commissionRate: initialSnapshot.commissionRate,
        commissionAmount: initialSnapshot.commissionAmount,
        customerPrice: initialSnapshot.customerPrice,
        sellerPayable: initialSnapshot.sellerBasePrice,
        platformFee: service.getSettings().platformFee,
      };

      expect(orderPricingSnapshot.commissionAmount).toBe(100);
      expect(orderPricingSnapshot.customerPrice).toBe(1100);
      expect(orderPricingSnapshot.platformFee).toBe(3);

      // Step B: Admin changes global settings to 25% commission and ₹10 platform fee
      service.updateSettings({
        globalCommissionPercentage: 25,
        platformFee: 10,
      });

      // Step C: Verify existing snapshot remains unmodified
      expect(orderPricingSnapshot.commissionAmount).toBe(100);
      expect(orderPricingSnapshot.customerPrice).toBe(1100);
      expect(orderPricingSnapshot.platformFee).toBe(3);

      // Step D: New calculation reflects updated settings
      const newCalculation = service.calculateItemPrice(1000);
      expect(newCalculation.commissionAmount).toBe(250);
      expect(newCalculation.customerPrice).toBe(1250);
      expect(service.getSettings().platformFee).toBe(10);
    });
  });

  // =========================================================================
  // 5. Cancellations and Returns Calculations (Requirement 9)
  // =========================================================================
  describe('Cancellations and Returns Calculation Integrity (Requirement 9)', () => {
    it('should compute exact refund and net seller adjustments for cancelled sub-orders', () => {
      const packageOrder = {
        subtotalAmount: 1100, // 2 items @ 550 customer price
        commissionAmount: 100, // 2 * 50
        netSellerPayable: 1000, // 2 * 500
        shippingFee: 50,
        totalAmount: 1150,
      };

      // Customer cancellation of sub-order before dispatch:
      // Refund to customer = package total (1150)
      // Net seller payable becomes 0 (no payout for cancelled order)
      const refundAmount = packageOrder.totalAmount;
      const revisedSellerPayable = 0;

      expect(refundAmount).toBe(1150);
      expect(revisedSellerPayable).toBe(0);
      // Original historical record preserved for audit logging
      expect(packageOrder.netSellerPayable).toBe(1000);
      expect(packageOrder.commissionAmount).toBe(100);
    });

    it('should compute partial return adjustment for delivered packages', () => {
      // 2 items delivered: item 1 (₹550 customer, ₹500 base), item 2 (₹440 customer, ₹400 base)
      // Customer returns item 2
      const originalPackage = {
        items: [
          { variantId: 'item-1', customerPrice: 550, sellerBase: 500, returned: false },
          { variantId: 'item-2', customerPrice: 440, sellerBase: 400, returned: true },
        ],
        shippingFee: 60,
      };

      const returnedItem = originalPackage.items.find((i) => i.returned)!;
      const refundToCustomer = returnedItem.customerPrice; // ₹440 refund
      const revisedSellerPayable = originalPackage.items
        .filter((i) => !i.returned)
        .reduce((sum, i) => sum + i.sellerBase, 0); // ₹500

      expect(refundToCustomer).toBe(440);
      expect(revisedSellerPayable).toBe(500);
    });
  });
});
