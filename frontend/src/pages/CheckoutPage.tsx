import { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { EmptyState } from '../components/common/StateViews.tsx';
import type { CartItem } from '../types/index.ts';
import './CheckoutPage.css';

export function CheckoutPage() {
  const {
    cart,
    cartSubtotal,
    addresses,
    selectedAddressId,
    setSelectedAddressId,
    placeOrder,
  } = useMarketplace();

  const { navigate } = useRouter();

  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'UPI' | 'CARD' | 'NETBANKING'>('COD');
  const [isPlacing, setIsPlacing] = useState(false);

  if (cart.length === 0) {
    return (
      <div className="bb-container bb-checkout-container">
        <EmptyState
          icon="🛍️"
          title="Your Checkout is Empty"
          description="You don't have any products in your cart to checkout. Please browse our marketplace and add your favorite items!"
          actionText="Browse Marketplace"
          onAction={() => navigate('/products')}
        />
      </div>
    );
  }

  // Group cart items by seller
  const sellerGroups = cart.reduce<Record<string, { sellerName: string; items: CartItem[] }>>(
    (acc, item) => {
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

  const selectedAddress = addresses.find((a) => a.id === selectedAddressId) || addresses[0];
  const estimatedShipping = cartSubtotal >= 999 ? 0 : 80;
  const promotionalDiscount = 100;
  const grandTotal = Math.max(0, cartSubtotal + estimatedShipping - promotionalDiscount);

  const handlePlaceOrder = () => {
    setIsPlacing(true);
    setTimeout(() => {
      const createdOrder = placeOrder();
      setIsPlacing(false);
      navigate(`/orders?orderId=${createdOrder.id}`);
    }, 600);
  };

  return (
    <div className="bb-container bb-checkout-container">
      <div className="bb-checkout-header">
        <div className="bb-checkout-steps-badge">
          <span>🔒 256-Bit SSL Encrypted Checkout</span>
        </div>
        <h1 className="bb-plp-title">Complete Your Order</h1>
        <p className="bb-section-subtitle">
          Review delivery address, seller dispatch packages, and confirm order placement
        </p>
      </div>

      <div className="bb-checkout-layout">
        {/* Left Column: Delivery Address, Packages, Payment */}
        <div>
          {/* Step 1: Address Selection */}
          <section className="bb-checkout-section" aria-labelledby="heading-delivery-address">
            <div className="bb-checkout-section-header">
              <h2 id="heading-delivery-address" className="bb-checkout-section-title">
                <span>📍 1. Delivery Address</span>
              </h2>
              <button
                type="button"
                className="bb-btn bb-btn-outline bb-btn-sm"
                onClick={() => navigate('/addresses')}
              >
                + Manage / Add Address
              </button>
            </div>

            <div className="bb-checkout-address-list">
              {addresses.map((addr) => {
                const isChecked = addr.id === selectedAddress?.id;
                return (
                  <label
                    key={addr.id}
                    className={`bb-checkout-address-option ${isChecked ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="deliveryAddress"
                      className="bb-checkout-radio"
                      checked={isChecked}
                      onChange={() => setSelectedAddressId(addr.id)}
                    />
                    <div className="bb-checkout-address-details">
                      <div className="bb-checkout-address-head">
                        <strong>{addr.name}</strong>
                        <span className="bb-badge bb-badge-neutral">{addr.type}</span>
                        {addr.isDefault && (
                          <span className="bb-badge bb-badge-primary">Default</span>
                        )}
                      </div>
                      <div className="bb-address-text">
                        {addr.street}, {addr.locality}, {addr.city}, {addr.state} -{' '}
                        <strong>{addr.pincode}</strong>
                      </div>
                      <div className="bb-address-phone">Phone: {addr.phone}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Step 2: Multi-Vendor Dispatched Packages */}
          <section className="bb-checkout-section" aria-labelledby="heading-order-packages">
            <div className="bb-checkout-section-header">
              <h2 id="heading-order-packages" className="bb-checkout-section-title">
                <span>📦 2. Seller-wise Order Summary</span>
              </h2>
              <span className="bb-badge bb-badge-primary">
                {Object.keys(sellerGroups).length}{' '}
                {Object.keys(sellerGroups).length === 1 ? 'Merchant Package' : 'Merchant Packages'}
              </span>
            </div>

            {Object.entries(sellerGroups).map(([sellerId, group]) => (
              <div key={sellerId} className="bb-checkout-package">
                <div className="bb-checkout-package-header">
                  <span>🏬 Dispatched by {group.sellerName}</span>
                  <span className="bb-form-hint">Standard Delivery (3-5 days)</span>
                </div>

                {group.items.map((item) => (
                  <div key={item.id} className="bb-checkout-item-row">
                    <img
                      src={item.product.thumbnail}
                      alt={item.product.title}
                      className="bb-checkout-item-thumb"
                    />
                    <div className="bb-checkout-item-details">
                      <div className="bb-checkout-item-title">{item.product.title}</div>
                      <div className="bb-checkout-item-sub">
                        Qty: {item.quantity}
                        {item.selectedVariants &&
                          Object.entries(item.selectedVariants).map(([k, v]) => ` | ${k}: ${v}`)}
                      </div>
                    </div>
                    <div className="bb-checkout-item-price">
                      ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>

          {/* Step 3: Payment Method */}
          <section className="bb-checkout-section" aria-labelledby="heading-payment-method">
            <div className="bb-checkout-section-header">
              <h2 id="heading-payment-method" className="bb-checkout-section-title">
                <span>💳 3. Payment Method</span>
              </h2>
            </div>

            <div className="bb-payment-methods-grid">
              <label
                className={`bb-payment-method-card ${paymentMethod === 'COD' ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  className="bb-checkout-radio"
                  checked={paymentMethod === 'COD'}
                  onChange={() => setPaymentMethod('COD')}
                />
                <span className="bb-payment-icon">💵</span>
                <div className="bb-payment-info">
                  <div className="bb-payment-name">Cash on Delivery (COD) / Pay on Arrival</div>
                  <div className="bb-payment-desc">Pay cash or scan QR upon delivery at your doorstep</div>
                </div>
              </label>

              <label
                className={`bb-payment-method-card ${paymentMethod === 'UPI' ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  className="bb-checkout-radio"
                  checked={paymentMethod === 'UPI'}
                  onChange={() => setPaymentMethod('UPI')}
                />
                <span className="bb-payment-icon">⚡</span>
                <div className="bb-payment-info">
                  <div className="bb-payment-name">Instant UPI (PhonePe, Google Pay, Paytm, BHIM)</div>
                  <div className="bb-payment-desc">Seamless instant zero-charge mobile UPI checkout</div>
                </div>
              </label>

              <label
                className={`bb-payment-method-card ${paymentMethod === 'CARD' ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  className="bb-checkout-radio"
                  checked={paymentMethod === 'CARD'}
                  onChange={() => setPaymentMethod('CARD')}
                />
                <span className="bb-payment-icon">💳</span>
                <div className="bb-payment-info">
                  <div className="bb-payment-name">Credit / Debit Card (Visa, RuPay, MasterCard)</div>
                  <div className="bb-payment-desc">Secure OTP confirmation via your banking partner</div>
                </div>
              </label>

              <label
                className={`bb-payment-method-card ${paymentMethod === 'NETBANKING' ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  className="bb-checkout-radio"
                  checked={paymentMethod === 'NETBANKING'}
                  onChange={() => setPaymentMethod('NETBANKING')}
                />
                <span className="bb-payment-icon">🏦</span>
                <div className="bb-payment-info">
                  <div className="bb-payment-name">NetBanking</div>
                  <div className="bb-payment-desc">SBI, HDFC, ICICI, Axis, and 50+ Indian banks</div>
                </div>
              </label>
            </div>
          </section>
        </div>

        {/* Right Column: Order Total & Final Action */}
        <aside>
          <div className="bb-checkout-summary-card">
            <h3 className="bb-summary-title">Payment Summary</h3>

            <div className="bb-summary-row">
              <span>Items Subtotal ({cart.reduce((a, b) => a + b.quantity, 0)} items)</span>
              <span>₹{cartSubtotal.toLocaleString('en-IN')}</span>
            </div>

            <div className="bb-summary-row">
              <span>Multi-Vendor Shipping Fee</span>
              <span>{estimatedShipping === 0 ? 'FREE' : `₹${estimatedShipping}`}</span>
            </div>

            <div className="bb-summary-row highlight-green">
              <span>Welcome Promo Discount</span>
              <span>- ₹{promotionalDiscount}</span>
            </div>

            <div className="bb-delivery-tax-disclaimer">
              📌 <strong>Backend Calculation Policy Notice:</strong> Final GST breakdown and authoritative carrier delivery rates will be calculated by the NestJS backend during live checkout integration.
            </div>

            <div className="bb-summary-row total-row">
              <span>Payable Grand Total</span>
              <span className="bb-summary-total-price">
                ₹{grandTotal.toLocaleString('en-IN')}
              </span>
            </div>

            <button
              type="button"
              className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block"
              onClick={handlePlaceOrder}
              disabled={isPlacing}
            >
              {isPlacing ? 'Confirming Order...' : 'Place Order & Confirm →'}
            </button>

            <div className="bb-checkout-guarantee">
              <span>🛡️ 100% Purchase Protection & Guaranteed Delivery</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
