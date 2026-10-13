import { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { EmptyState } from '../components/common/StateViews.tsx';
import type { CartItem } from '../types/index.ts';
import './CartPage.css';

export function CartPage() {
  const {
    cart,
    updateCartQuantity,
    removeFromCart,
    cartSubtotal,
    toggleWishlist,
    isInWishlist,
  } = useMarketplace();

  const { navigate } = useRouter();

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');

  // Group cart items by seller
  const sellerGroups = cart.reduce<Record<string, { sellerName: string; items: CartItem[] }>>(
    (acc: Record<string, { sellerName: string; items: CartItem[] }>, item: CartItem) => {
      if (!acc[item.sellerId]) {
        acc[item.sellerId] = {
          sellerName: item.sellerName,
          items: [],
        };
      }
      acc[item.sellerId].items.push(item);
      return acc;
    },
    {}
  );

  const estimatedShipping = cart.length > 0 ? (cartSubtotal >= 999 ? 0 : 80) : 0;
  const grandTotal = Math.max(0, cartSubtotal + estimatedShipping - couponDiscount);

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    if (couponCode.toUpperCase() === 'DESI50') {
      setCouponDiscount(50);
      setCouponMessage('✓ Promo code DESI50 applied (₹50 discount)!');
    } else if (couponCode.toUpperCase() === 'BHARAT100') {
      setCouponDiscount(100);
      setCouponMessage('✓ Promo code BHARAT100 applied (₹100 discount)!');
    } else {
      setCouponMessage('Invalid promo code. Try "BHARAT100" or "DESI50".');
    }
  };

  const handleMoveToWishlist = (item: CartItem) => {
    if (!isInWishlist(item.productId)) {
      toggleWishlist(item.productId);
    }
    removeFromCart(item.id);
  };

  if (cart.length === 0) {
    return (
      <div className="bb-container bb-cart-container">
        <EmptyState
          icon="🛒"
          title="Your Shopping Cart is Empty"
          description="Looks like you haven't added anything to your cart yet. Explore thousands of authentic products from verified Indian merchants!"
          actionText="Continue Shopping"
          onAction={() => navigate('/products')}
        />
      </div>
    );
  }

  return (
    <div className="bb-container bb-cart-container">
      <h1 className="bb-plp-title bb-cart-page-title">
        Shopping Cart ({cart.reduce((a: number, b: CartItem) => a + b.quantity, 0)} Items)
      </h1>

      <div className="bb-cart-layout">
        {/* Left Column: Multi-Vendor Packages */}
        <div className="bb-cart-left">
          {Object.entries(sellerGroups).map(([sellerId, group]: [string, { sellerName: string; items: CartItem[] }]) => (
            <div key={sellerId} className="bb-cart-seller-package">
              {/* Package Header */}
              <div className="bb-cart-seller-header">
                <div className="bb-cart-seller-title">
                  <span>🏬 Dispatched by Merchant:</span>
                  <span className="bb-brand-name">{group.sellerName}</span>
                </div>
                <span className="bb-badge bb-badge-primary">
                  {group.items.length} {group.items.length === 1 ? 'Product' : 'Products'}
                </span>
              </div>

              {/* Items List */}
              <div className="bb-cart-item-list">
                {group.items.map((item: CartItem) => (
                  <div key={item.id} className="bb-cart-item-row">
                    <img
                      src={item.product.thumbnail}
                      alt={item.product.title}
                      className="bb-cart-item-thumb"
                      onClick={() => navigate(`/product/${item.productId}`)}
                    />

                    <div className="bb-cart-item-info">
                      <h3
                        className="bb-cart-item-title"
                        onClick={() => navigate(`/product/${item.productId}`)}
                      >
                        {item.product.title}
                      </h3>

                      {/* Variants display */}
                      {Object.keys(item.selectedVariants).length > 0 && (
                        <div className="bb-cart-variant-tags">
                          {Object.entries(item.selectedVariants).map(([k, v]: [string, string]) => (
                            <span key={k} className="bb-cart-variant-tag">
                              {k}: {v}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="bb-cart-item-actions">
                        {/* Stepper */}
                        <div className="bb-qty-stepper">
                          <button
                            type="button"
                            className="bb-qty-btn"
                            onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                            aria-label="Decrease quantity"
                          >
                            -
                          </button>
                          <span className="bb-qty-display">{item.quantity}</span>
                          <button
                            type="button"
                            className="bb-qty-btn"
                            onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          className="bb-cart-action-link"
                          onClick={() => removeFromCart(item.id)}
                        >
                          Remove
                        </button>
                        <span>|</span>
                        <button
                          type="button"
                          className="bb-cart-action-link"
                          onClick={() => handleMoveToWishlist(item)}
                        >
                          Save for Later
                        </button>
                      </div>
                    </div>

                    <div className="bb-cart-item-pricing">
                      ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Order Summary */}
        <aside className="bb-cart-summary-card" aria-label="Order Price Summary">
          <h2 className="bb-summary-title">Order Price Summary</h2>

          <div className="bb-summary-rows">
            <div className="bb-summary-row">
              <span>Items Total ({cart.length} items)</span>
              <span>₹{cartSubtotal.toLocaleString('en-IN')}</span>
            </div>

            <div className="bb-summary-row">
              <span>Estimated Delivery Fee</span>
              <span>
                {estimatedShipping === 0 ? (
                  <span className="bb-summary-discount">FREE</span>
                ) : (
                  `₹${estimatedShipping}`
                )}
              </span>
            </div>

            {couponDiscount > 0 && (
              <div className="bb-summary-row">
                <span>Promotional Discount</span>
                <span className="bb-summary-discount">-₹{couponDiscount}</span>
              </div>
            )}

            <div className="bb-summary-row bold">
              <span>Estimated Total</span>
              <span>₹{grandTotal.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Coupon form */}
          <div>
            <form onSubmit={handleApplyCoupon} className="bb-coupon-box">
              <input
                type="text"
                placeholder="Enter Coupon (e.g. BHARAT100)"
                className="bb-input"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
              />
              <button type="submit" className="bb-btn bb-btn-secondary">
                Apply
              </button>
            </form>
            {couponMessage && (
              <p className={couponDiscount > 0 ? 'bb-coupon-msg-success' : 'bb-coupon-msg-error'}>
                {couponMessage}
              </p>
            )}
          </div>

          {/* Provisional notice */}
          <div className="bb-provisional-note">
            ⚠️ <strong>Multi-Vendor Notice:</strong> Items may ship in separate parcels from different seller locations. Final shipping fees and taxes will be confirmed authoritatively by backend logistics upon address selection.
          </div>

          {/* Proceed to checkout CTA */}
          <button
            type="button"
            className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block"
            onClick={() => navigate('/checkout')}
          >
            Proceed to Checkout →
          </button>
        </aside>
      </div>
    </div>
  );
}
