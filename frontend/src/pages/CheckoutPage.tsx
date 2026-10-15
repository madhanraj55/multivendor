import { useState, useEffect, useRef } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { EmptyState } from '../components/common/StateViews.tsx';
import type { CartItem, CheckoutValidationResponse, BackendCheckoutAttempt } from '../types/index.ts';
import {
  checkoutApi,
  mapAddressToSnapshot,
  generateCheckoutIdempotencyKey,
  mapBackendOrderToUi,
  getPendingCheckoutAttempt,
  savePendingCheckoutAttempt,
  clearPendingCheckoutAttempt,
} from '../services/checkoutApi.ts';
import './CheckoutPage.css';

export function CheckoutPage() {
  const {
    cart,
    cartSubtotal,
    addresses,
    selectedAddressId,
    setSelectedAddressId,
    placeOrder,
    recordOrder,
    authMode,
    authUser,
  } = useMarketplace();

  const { navigate } = useRouter();

  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'UPI' | 'CARD' | 'NETBANKING'>('COD');
  const [orderNotes, setOrderNotes] = useState('');
  const [isPlacing, setIsPlacing] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [recoveryPendingAttemptId, setRecoveryPendingAttemptId] = useState<string | null>(null);
  const recoveryCheckedRef = useRef(false);
  const [isValidating, setIsValidating] = useState<boolean>(() => {
    return authMode === 'AUTHENTICATED' && cart.length > 0;
  });
  const [validationResult, setValidationResult] = useState<CheckoutValidationResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [checkoutAttempt, setCheckoutAttempt] = useState<BackendCheckoutAttempt | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reservationExpired, setReservationExpired] = useState(false);

  // Reservation idempotency key: maintained across retries for the same logical checkout,
  // and reset when cart, selected address, user session, or reservation expiry occurs.
  const [reservationIdempotencyKey, setReservationIdempotencyKey] = useState<string>(() =>
    generateCheckoutIdempotencyKey()
  );

  // Track checkout context fingerprint to reset attempt & key when cart, address, or customer changes
  const cartSignature = cart.map((item) => `${item.id}:${item.quantity}:${item.price}`).join('|');
  const currentCheckoutFingerprint = `${cartSignature}|${selectedAddressId || ''}|${authUser?.id || ''}|${authMode}`;
  const [prevCheckoutFingerprint, setPrevCheckoutFingerprint] = useState(currentCheckoutFingerprint);

  if (prevCheckoutFingerprint !== currentCheckoutFingerprint) {
    setPrevCheckoutFingerprint(currentCheckoutFingerprint);
    setReservationIdempotencyKey(generateCheckoutIdempotencyKey());
    setCheckoutAttempt(null);
    setReservationExpired(false);
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

  // Perform backend validation on mount when in authenticated mode
  useEffect(() => {
    let isCancelled = false;

    if (authMode === 'AUTHENTICATED' && cart.length > 0) {
      checkoutApi
        .validateCheckout()
        .then((res) => {
          if (isCancelled) return;
          setValidationResult(res);
          if (!res.isValid) {
            setValidationError(
              res.errors.length > 0
                ? res.errors.join(', ')
                : 'Some cart items are no longer available or valid for checkout.'
            );
          }
        })
        .catch((err) => {
          if (isCancelled) return;
          setValidationError(err instanceof Error ? err.message : 'Failed to validate cart with server');
        })
        .finally(() => {
          if (!isCancelled) setIsValidating(false);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [authMode, cart.length]);

  // Monitor reservation expiry if a reservation exists
  useEffect(() => {
    if (!checkoutAttempt?.expiresAt) return;
    const expiryTime = new Date(checkoutAttempt.expiresAt).getTime();
    const timer = setInterval(() => {
      if (Date.now() >= expiryTime) {
        setReservationExpired(true);
        // Reservation expired: reset idempotency key so that renewed reservation creates a clean attempt
        setReservationIdempotencyKey(generateCheckoutIdempotencyKey());
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [checkoutAttempt?.expiresAt]);

  // Check for pending recovery record on mount (e.g. after customer reloads browser)
  useEffect(() => {
    let isCancelled = false;
    const pending = getPendingCheckoutAttempt();

    if (authMode === 'AUTHENTICATED' && pending?.attemptId && !recoveryCheckedRef.current) {
      recoveryCheckedRef.current = true;
      setIsRecovering(true);
      setRecoveryPendingAttemptId(pending.attemptId);

      checkoutApi
        .getCheckoutAttempt(pending.attemptId)
        .then((res) => {
          if (isCancelled) return;
          if (res.status === 'COMPLETED' && res.order) {
            clearPendingCheckoutAttempt();
            const uiOrder = mapBackendOrderToUi(res.order);
            recordOrder(uiOrder);
            navigate(`/orders?orderId=${uiOrder.orderNumber || uiOrder.id}`);
          } else if (res.status === 'STOCK_RESERVED' && !res.isExpired) {
            setRecoveryPendingAttemptId(res.id);
            setRecoveryNotice(
              'We restored your active reservation session. You may review your details and confirm order placement.'
            );
          } else if (res.isExpired || res.status === 'EXPIRED') {
            clearPendingCheckoutAttempt();
            setRecoveryPendingAttemptId(null);
            setReservationExpired(true);
            setRecoveryNotice(
              'Your previous checkout reservation has expired. Please initiate a fresh checkout to reserve current inventory.'
            );
          } else {
            clearPendingCheckoutAttempt();
            setRecoveryPendingAttemptId(null);
          }
        })
        .catch(() => {
          if (isCancelled) return;
          // Retain pending recovery record on network failure so customer can retry
          setRecoveryNotice(
            'We encountered a connection issue while verifying your previous order status. Please use the button below to check your order status.'
          );
        })
        .finally(() => {
          if (!isCancelled) {
            setIsRecovering(false);
          }
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [authMode, navigate, recordOrder]);

  if (isRecovering) {
    return (
      <div className="bb-container bb-checkout-container" style={{ padding: '4rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔄</div>
        <h2>Checking Order Status...</h2>
        <p style={{ color: '#6b7280', maxWidth: '480px', margin: '0.5rem auto 1.5rem' }}>
          Verifying whether an order was already created for your checkout session. Please hold on.
        </p>
      </div>
    );
  }

  if (cart.length === 0 && !recoveryPendingAttemptId) {
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

  // Authoritative calculations: if backend validation returned authoritative totals, use them;
  // otherwise fallback cleanly for demo mode.
  const authoritativeSubtotal =
    authMode === 'AUTHENTICATED' && validationResult?.subtotalAmount !== undefined
      ? validationResult.subtotalAmount
      : cartSubtotal;

  const estimatedShipping = authoritativeSubtotal >= 999 ? 0 : 80;
  const grandTotal = authoritativeSubtotal + estimatedShipping;

  const handlePlaceOrder = async () => {
    if (isPlacing) return;
    setActionError(null);

    if (!selectedAddress) {
      setActionError('Please select or add a delivery address before confirming your order.');
      return;
    }

    setIsPlacing(true);

    try {
      if (authMode === 'AUTHENTICATED') {
        // Step 1: Stock Reservation (POST /api/v1/checkout/reserve)
        // If reservation previously succeeded or was previously initiated with reservationIdempotencyKey,
        // reusing the same key allows backend to return existing attempt safely if response was lost,
        // without reserving duplicate stock or throwing unique constraint violations.
        let activeAttempt = checkoutAttempt;

        if (!activeAttempt || reservationExpired) {
          // If expired, ensure fresh key
          const keyToUse = reservationExpired
            ? generateCheckoutIdempotencyKey()
            : reservationIdempotencyKey;

          if (reservationExpired) {
            setReservationIdempotencyKey(keyToUse);
            setReservationExpired(false);
          }

          const addressSnapshot = mapAddressToSnapshot(selectedAddress);
          const reserveRes = await checkoutApi.reserveCheckout({
            idempotencyKey: keyToUse,
            shippingAddress: addressSnapshot,
            billingAddress: addressSnapshot,
          });

          activeAttempt = reserveRes.checkoutAttempt;
          setCheckoutAttempt(activeAttempt);
        }

        // Persist recovery record BEFORE dispatching place-order request
        savePendingCheckoutAttempt(activeAttempt.id, reservationIdempotencyKey);
        setRecoveryPendingAttemptId(activeAttempt.id);

        // Step 2: Order Placement (POST /api/v1/checkout/place-order)
        const createdOrder = await placeOrder(orderNotes.trim() || undefined, activeAttempt.id);
        
        // Reset recovery record and idempotency key only after verified order success
        clearPendingCheckoutAttempt();
        setRecoveryPendingAttemptId(null);
        setReservationIdempotencyKey(generateCheckoutIdempotencyKey());
        setCheckoutAttempt(null);
        navigate(`/orders?orderId=${createdOrder.orderNumber || createdOrder.id}`);
      } else {
        // Demo Mode order placement
        const createdOrder = await placeOrder(orderNotes.trim() || undefined);
        navigate(`/orders?orderId=${createdOrder.orderNumber || createdOrder.id}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to place order';
      setActionError(msg);
      // If error indicates expiry or validation problem, reset attempt, key, and recovery record
      if (msg.toLowerCase().includes('expired')) {
        clearPendingCheckoutAttempt();
        setRecoveryPendingAttemptId(null);
        setReservationExpired(true);
        setCheckoutAttempt(null);
        setReservationIdempotencyKey(generateCheckoutIdempotencyKey());
      }
      // On network failure or dropped response, RETAIN the recovery record
      // so user can retry or check status without creating duplicate reservations/orders
    } finally {
      setIsPlacing(false);
    }
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

          {/* Optional Order Notes */}
          <section className="bb-checkout-section" aria-labelledby="heading-delivery-notes">
            <div className="bb-checkout-section-header">
              <h2 id="heading-delivery-notes" className="bb-checkout-section-title">
                <span>📝 4. Delivery Instructions & Notes (Optional)</span>
              </h2>
            </div>
            <textarea
              className="bb-input"
              style={{ width: '100%', minHeight: '70px', resize: 'vertical' }}
              placeholder="e.g. Ring bell twice, leave with security guard, or deliver after 2 PM"
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              maxLength={500}
            />
          </section>
        </div>

        {/* Right Column: Order Total & Final Action */}
        <aside>
          <div className="bb-checkout-summary-card">
            {recoveryNotice && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  borderRadius: '6px',
                  backgroundColor: '#e0f2fe',
                  color: '#0369a1',
                  fontSize: '0.85rem',
                }}
              >
                ℹ️ <strong>Order Recovery Notice:</strong> {recoveryNotice}
                {recoveryPendingAttemptId && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="bb-btn bb-btn-sm bb-btn-outline"
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
                      onClick={async () => {
                        setIsRecovering(true);
                        try {
                          const res = await checkoutApi.getCheckoutAttempt(recoveryPendingAttemptId);
                          if (res.status === 'COMPLETED' && res.order) {
                            clearPendingCheckoutAttempt();
                            const uiOrder = mapBackendOrderToUi(res.order);
                            recordOrder(uiOrder);
                            navigate(`/orders?orderId=${uiOrder.orderNumber || uiOrder.id}`);
                          } else if (res.status === 'STOCK_RESERVED' && !res.isExpired) {
                            setRecoveryNotice('Your reservation remains active. You can proceed with confirming your order.');
                          } else {
                            clearPendingCheckoutAttempt();
                            setRecoveryPendingAttemptId(null);
                            setReservationExpired(true);
                          }
                        } catch {
                          setRecoveryNotice('Still unable to reach the server to verify attempt status. Please try again in a moment.');
                        } finally {
                          setIsRecovering(false);
                        }
                      }}
                    >
                      🔄 Verify Order Status Now
                    </button>
                  </div>
                )}
              </div>
            )}

            {actionError && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  borderRadius: '6px',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  fontSize: '0.85rem',
                }}
              >
                ⚠️ {actionError}
              </div>
            )}

            {validationError && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  borderRadius: '6px',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  fontSize: '0.85rem',
                }}
              >
                ⚠️ <strong>Cart Notice:</strong> {validationError}
              </div>
            )}

            {reservationExpired && (
              <div
                role="alert"
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  borderRadius: '6px',
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  fontSize: '0.85rem',
                }}
              >
                ⚠️ <strong>Reservation Expired:</strong> Your stock hold has elapsed. Clicking below will renew stock reservation before placing your order.
              </div>
            )}

            <div className="bb-summary-row">
              <span>Items Subtotal ({cart.reduce((a, b) => a + b.quantity, 0)} items)</span>
              <span>₹{authoritativeSubtotal.toLocaleString('en-IN')}</span>
            </div>

            <div className="bb-summary-row">
              <span>Multi-Vendor Shipping Fee (Provisional)</span>
              <span>{estimatedShipping === 0 ? 'FREE' : `₹${estimatedShipping}`}</span>
            </div>

            <div className="bb-delivery-tax-disclaimer">
              ℹ️ <strong>Authoritative Pricing & Payment Notice:</strong> Prices and line subtotals are verified directly by the server. Online payment integration is scheduled for a future stage; orders are currently placed with <strong>Payment Pending</strong> and will not be dispatched by sellers without verified payment confirmation.
            </div>

            <div className="bb-summary-row total-row">
              <span>Payable Order Total</span>
              <span className="bb-summary-total-price">
                ₹{grandTotal.toLocaleString('en-IN')}
              </span>
            </div>

            <button
              type="button"
              className="bb-btn bb-btn-primary bb-btn-lg bb-btn-block"
              onClick={handlePlaceOrder}
              disabled={isPlacing || isValidating || (validationResult !== null && !validationResult.isValid)}
            >
              {isPlacing
                ? 'Confirming Order with Backend...'
                : isValidating
                ? 'Verifying Cart & Stock...'
                : 'Place Order & Confirm →'}
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
