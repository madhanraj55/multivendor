import { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { EmptyState, ErrorState, SkeletonGrid } from '../components/common/StateViews.tsx';
import type { CartItem } from '../types/index.ts';
import './CartPage.css';

export function CartPage() {
  const {
    cart,
    cartLoading,
    cartError,
    fetchCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    cartSubtotal,
    toggleWishlist,
    isInWishlist,
  } = useMarketplace();

  const { navigate } = useRouter();

  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

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

  // Check if any cart item is unavailable or out of stock
  const hasUnavailableItems = cart.some(
    (item) => item.isAvailable === false || (item.availableStock !== undefined && item.quantity > item.availableStock)
  );

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

  const handleUpdateQuantity = async (item: CartItem, nextQty: number) => {
    setActionError(null);
    setUpdatingItemId(item.id);
    try {
      await updateCartQuantity(item.id, nextQty);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update quantity';
      setActionError(msg);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setActionError(null);
    setUpdatingItemId(itemId);
    try {
      await removeFromCart(itemId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove item';
      setActionError(msg);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleClearAll = async () => {
    setActionError(null);
    try {
      await clearCart();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear cart';
      setActionError(msg);
    }
  };

  const handleMoveToWishlist = async (item: CartItem) => {
    setActionError(null);
    if (!isInWishlist(item.productId)) {
      try {
        await toggleWishlist(item.productId);
      } catch {
        // Continue to remove
      }
    }
    await handleRemoveItem(item.id);
  };

  if (cartLoading && cart.length === 0) {
    return (
      <div className="bb-container bb-cart-container">
        <h1 className="bb-plp-title bb-cart-page-title">Shopping Cart</h1>
        <div style={{ marginTop: '1.5rem' }}>
          <SkeletonGrid count={3} />
        </div>
      </div>
    );
  }

  if (cartError && cart.length === 0) {
    return (
      <div className="bb-container bb-cart-container">
        <ErrorState
          title="Could not load your cart"
          description={cartError}
          onRetry={fetchCart}
        />
      </div>
    );
  }

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="bb-plp-title bb-cart-page-title">
          Shopping Cart ({cart.reduce((a: number, b: CartItem) => a + b.quantity, 0)} Items)
        </h1>
        <button
          type="button"
          className="bb-cart-action-link"
          style={{ fontSize: '0.9rem', color: '#dc2626' }}
          onClick={handleClearAll}
        >
          Clear Cart
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            borderRadius: '6px',
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>⚠️ {actionError}</span>
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#b91c1c',
              fontWeight: 'bold',
            }}
            onClick={() => setActionError(null)}
          >
            ✕
          </button>
        </div>
      )}

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

                      {/* Availability or stock warnings */}
                      {item.isAvailable === false && (
                        <span className="bb-badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', marginTop: '0.25rem' }}>
                          Out of Stock / Unavailable
                        </span>
                      )}
                      {item.availableStock !== undefined && item.quantity > item.availableStock && item.isAvailable !== false && (
                        <span style={{ fontSize: '0.75rem', color: '#b45309', display: 'block', marginTop: '0.25rem' }}>
                          Only {item.availableStock} in stock (requested {item.quantity})
                        </span>
                      )}

                      <div className="bb-cart-item-actions">
                        {/* Stepper */}
                        <div className="bb-qty-stepper">
                          <button
                            type="button"
                            className="bb-qty-btn"
                            disabled={updatingItemId === item.id}
                            onClick={() => handleUpdateQuantity(item, item.quantity - 1)}
                            aria-label="Decrease quantity"
                          >
                            -
                          </button>
                          <span className="bb-qty-display">{item.quantity}</span>
                          <button
                            type="button"
                            className="bb-qty-btn"
                            disabled={
                              updatingItemId === item.id ||
                              (item.availableStock !== undefined && item.quantity >= item.availableStock)
                            }
                            onClick={() => handleUpdateQuantity(item, item.quantity + 1)}
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          className="bb-cart-action-link"
                          disabled={updatingItemId === item.id}
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          Remove
                        </button>
                        <span>|</span>
                        <button
                          type="button"
                          className="bb-cart-action-link"
                          disabled={updatingItemId === item.id}
                          onClick={() => handleMoveToWishlist(item)}
                        >
                          Save for Later
                        </button>
                      </div>
                    </div>

                    <div className="bb-cart-item-pricing">
                      ₹{(item.lineTotal ?? (item.price * item.quantity)).toLocaleString('en-IN')}
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
                <span>Promotional Discount (Provisional)</span>
                <span className="bb-summary-discount">-₹{couponDiscount}</span>
              </div>
            )}

            <div className="bb-summary-row bold">
              <span>Estimated Total (Provisional)</span>
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
            ⚠️ <strong>Provisional Estimate Notice:</strong> Subtotal is authoritative from the server. Shipping, packaging fees, and promotional discounts shown here are provisional previews and will be authoritatively validated by the backend during checkout.
          </div>

          {hasUnavailableItems && (
            <div
              role="alert"
              style={{
                padding: '0.6rem 0.8rem',
                margin: '0.75rem 0',
                borderRadius: '6px',
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                fontSize: '0.8rem',
              }}
            >
              ⚠️ Please remove or update out-of-stock or unavailable items before proceeding to checkout.
            </div>
          )}

          {/* Proceed to checkout CTA */}
          <button
            type="button"
            className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block"
            onClick={() => navigate('/checkout')}
            disabled={hasUnavailableItems}
            title={hasUnavailableItems ? 'Remove out-of-stock items to proceed' : 'Proceed to Checkout'}
          >
            Proceed to Checkout →
          </button>
        </aside>
      </div>
    </div>
  );
}
