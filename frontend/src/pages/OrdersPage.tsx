import { useState, useEffect } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import type { Order } from '../types/index.ts';
import { EmptyState, ErrorState, LoadingSpinner } from '../components/common/StateViews.tsx';
import { ordersApi, mapCustomerOrderDetailToUi } from '../services/ordersApi.ts';
import './OrdersPage.css';

export function OrdersPage() {
  const {
    orders,
    ordersLoading,
    ordersError,
    fetchOrders,
    authMode,
    recordOrder,
  } = useMarketplace();
  const { navigate, queryParams } = useRouter();

  const selectedOrderId = queryParams.orderId;
  const [activeTab, setActiveTab] = useState<'ALL' | 'PLACED' | 'SHIPPED' | 'DELIVERED'>('ALL');
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch orders list on mount if authenticated
  useEffect(() => {
    if (authMode === 'AUTHENTICATED') {
      fetchOrders();
    }
  }, [authMode, fetchOrders]);

  // Find order in current context memory if present
  const existingOrder = orders.find(
    (o) => o.id === selectedOrderId || o.orderNumber === selectedOrderId
  );
  const hasDetailedItems = Boolean(
    existingOrder && existingOrder.packages.some((p) => p.items.length > 0)
  );

  // Check if selectedOrderId matches UUID format (8-4-4-4-12 hex)
  const isUuid = Boolean(
    selectedOrderId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedOrderId)
  );

  // Detail fetching effect
  useEffect(() => {
    if (!selectedOrderId || authMode !== 'AUTHENTICATED') {
      return;
    }

    // Already have full items loaded; no additional network call needed
    if (hasDetailedItems) {
      return;
    }

    // If selectedOrderId is a UUID, wait for list loading to finish before attempting lookup
    if (isUuid && ordersLoading) {
      return;
    }

    let resolvedOrderNumber: string | null = null;
    if (existingOrder?.orderNumber) {
      resolvedOrderNumber = existingOrder.orderNumber;
    } else if (!isUuid) {
      // If not a UUID, treat it directly as an orderNumber
      resolvedOrderNumber = selectedOrderId;
    }

    if (!resolvedOrderNumber) {
      return;
    }

    let isSubscribed = true;
    ordersApi
      .getMyOrderByNumber(resolvedOrderNumber)
      .then((detail) => {
        if (!isSubscribed) return;
        const uiOrder = mapCustomerOrderDetailToUi(detail);
        recordOrder(uiOrder);
      })
      .catch((err) => {
        if (!isSubscribed) return;
        setDetailError(
          err instanceof Error ? err.message : 'Failed to load order details from server'
        );
      });

    return () => {
      isSubscribed = false;
    };
  }, [
    selectedOrderId,
    authMode,
    hasDetailedItems,
    isUuid,
    ordersLoading,
    existingOrder?.orderNumber,
    recordOrder,
  ]);

  const handleRetryDetail = () => {
    setDetailError(null);
    const orderNum = existingOrder?.orderNumber || (!isUuid ? selectedOrderId : null);
    if (orderNum) {
      ordersApi
        .getMyOrderByNumber(orderNum)
        .then((detail) => {
          const uiOrder = mapCustomerOrderDetailToUi(detail);
          recordOrder(uiOrder);
        })
        .catch((err) => {
          setDetailError(
            err instanceof Error ? err.message : 'Failed to load order details from server'
          );
        });
    } else {
      fetchOrders();
    }
  };

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [returnSubOrderNumber, setReturnSubOrderNumber] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCancelOrder = async (orderNumber: string) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await ordersApi.cancelCustomerOrder(orderNumber, {
        reason: cancelReason.trim() || undefined,
      });
      setActionMessage({ type: 'success', text: res.message || 'Order cancelled successfully.' });
      setShowCancelModal(false);
      setCancelReason('');
      fetchOrders();
      const detail = await ordersApi.getMyOrderByNumber(orderNumber);
      recordOrder(mapCustomerOrderDetailToUi(detail));
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to cancel order.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestReturn = async (orderNumber: string) => {
    if (!returnSubOrderNumber || !returnReason.trim()) {
      return;
    }
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await ordersApi.requestCustomerReturn(orderNumber, {
        subOrderNumber: returnSubOrderNumber,
        reason: returnReason.trim(),
      });
      setActionMessage({ type: 'success', text: res.message || 'Return request submitted successfully.' });
      setReturnSubOrderNumber(null);
      setReturnReason('');
      fetchOrders();
      const detail = await ordersApi.getMyOrderByNumber(orderNumber);
      recordOrder(mapCustomerOrderDetailToUi(detail));
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to submit return request.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'PENDING_PAYMENT':
        return <span className="bb-badge bb-badge-warning">Awaiting Payment ⏳</span>;
      case 'DELIVERED':
        return <span className="bb-badge bb-badge-success">Delivered ✓</span>;
      case 'SHIPPED':
        return <span className="bb-badge bb-badge-primary">In Transit 🚚</span>;
      case 'OUT_FOR_DELIVERY':
        return <span className="bb-badge bb-badge-warning">Out for Delivery 🛵</span>;
      case 'CONFIRMED':
      case 'PLACED':
        return <span className="bb-badge bb-badge-warning">Order Placed ⏳</span>;
      case 'CANCELLED':
        return <span className="bb-badge bb-badge-danger">Cancelled ✕</span>;
      default:
        return <span className="bb-badge bb-badge-neutral">{status}</span>;
    }
  };

  // If a specific order is requested:
  if (selectedOrderId) {
    const isWaitingForListLookup = isUuid && ordersLoading && !existingOrder;
    const isWaitingForDetail =
      isWaitingForListLookup ||
      (authMode === 'AUTHENTICATED' &&
        !hasDetailedItems &&
        !detailError &&
        (Boolean(existingOrder) || !isUuid));

    if (isWaitingForDetail) {
      return (
        <div className="bb-container bb-orders-container">
          <div className="bb-orders-header">
            <button
              type="button"
              className="bb-btn bb-btn-ghost bb-btn-sm"
              onClick={() => navigate('/orders')}
            >
              ← Back to All Orders
            </button>
          </div>
          <LoadingSpinner />
        </div>
      );
    }

    if (detailError) {
      return (
        <div className="bb-container bb-orders-container">
          <div className="bb-orders-header">
            <button
              type="button"
              className="bb-btn bb-btn-ghost bb-btn-sm"
              onClick={() => navigate('/orders')}
            >
              ← Back to All Orders
            </button>
          </div>
          <ErrorState
            title="Failed to Load Order Details"
            description={detailError}
            onRetry={handleRetryDetail}
          />
        </div>
      );
    }

    const selectedOrder = existingOrder;
    if (!selectedOrder) {
      return (
        <div className="bb-container bb-orders-container">
          <div className="bb-orders-header">
            <button
              type="button"
              className="bb-btn bb-btn-ghost bb-btn-sm"
              onClick={() => navigate('/orders')}
            >
              ← Back to All Orders
            </button>
          </div>
          <EmptyState
            icon="🔍"
            title="Order Not Found"
            description="We could not find the requested order. It may belong to another account or the order number is invalid."
            actionText="View All Orders"
            onAction={() => navigate('/orders')}
          />
        </div>
      );
    }

    const isStepActive = (stepIndex: number) => {
      if (selectedOrder.status === 'PENDING_PAYMENT') return false;
      const statuses = ['PLACED', 'CONFIRMED', 'SHIPPED', 'DELIVERED'];
      const currentIndex = statuses.indexOf(selectedOrder.status);
      return currentIndex >= stepIndex;
    };

    return (
      <div className="bb-container bb-orders-container">
        <div className="bb-orders-header">
          <div>
            <button
              type="button"
              className="bb-btn bb-btn-ghost bb-btn-sm"
              onClick={() => navigate('/orders')}
            >
              ← Back to All Orders
            </button>
            <h1 className="bb-plp-title bb-order-detail-title">
              Order {selectedOrder.orderNumber}
            </h1>
          </div>
          <div>{getStatusBadge(selectedOrder.status)}</div>
        </div>

        {actionMessage && (
          <div
            role="alert"
            style={{
              marginBottom: 'var(--space-4)',
              padding: '0.75rem 1rem',
              background: actionMessage.type === 'success' ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${actionMessage.type === 'success' ? '#bbf7d0' : '#fef3c7'}`,
              borderRadius: '8px',
              color: actionMessage.type === 'success' ? '#166534' : '#92400e',
              fontSize: '0.875rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{actionMessage.type === 'success' ? '✓ ' : '⚠️ '} {actionMessage.text}</span>
            <button
              type="button"
              className="bb-btn bb-btn-ghost bb-btn-xs"
              onClick={() => setActionMessage(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Tracking Header Card */}
        <div className="bb-order-detail-header-card">
          <div className="bb-order-meta-group">
            <div className="bb-order-meta-item">
              <span className="bb-order-meta-label">Placed On</span>
              <span className="bb-order-meta-val">
                {new Date(selectedOrder.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="bb-order-meta-item">
              <span className="bb-order-meta-label">Total Amount</span>
              <span className="bb-order-meta-val">
                ₹{selectedOrder.totalAmount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="bb-order-meta-item">
              <span className="bb-order-meta-label">Payment Method</span>
              <span className="bb-order-meta-val">{selectedOrder.paymentMethod}</span>
            </div>
            <div className="bb-order-meta-item">
              <span className="bb-order-meta-label">Payment Status</span>
              <span className="bb-order-meta-val">
                {selectedOrder.status === 'PENDING_PAYMENT' || selectedOrder.paymentStatus === 'PENDING'
                  ? 'Awaiting Payment ⏳'
                  : 'Paid ✓'}
              </span>
            </div>
          </div>

          {/* Stepper */}
          <div className="bb-order-timeline" aria-label="Order progress">
            <div className={`bb-timeline-step ${isStepActive(0) ? 'completed' : ''}`}>
              <div className="bb-timeline-dot">1</div>
              <span className="bb-timeline-label">Placed</span>
            </div>
            <div className={`bb-timeline-step ${isStepActive(1) ? 'completed' : ''}`}>
              <div className="bb-timeline-dot">2</div>
              <span className="bb-timeline-label">Confirmed</span>
            </div>
            <div className={`bb-timeline-step ${isStepActive(2) ? 'completed' : ''}`}>
              <div className="bb-timeline-dot">3</div>
              <span className="bb-timeline-label">Shipped</span>
            </div>
            <div className={`bb-timeline-step ${isStepActive(3) ? 'completed' : ''}`}>
              <div className="bb-timeline-dot">4</div>
              <span className="bb-timeline-label">Delivered</span>
            </div>
          </div>
        </div>

        {/* Two-column layout for packages & price breakdown */}
        <div className="bb-order-detail-grid">
          {/* Left: Packages by Merchant */}
          <div>
            <h2 className="bb-section-title bb-order-detail-section-title">
              Shipments & Dispatched Packages ({selectedOrder.packages.length})
            </h2>

            {selectedOrder.packages.map((pkg, idx) => (
              <div key={idx} className="bb-order-package-block bb-order-detail-package">
                <div className="bb-order-package-header">
                  <div className="bb-order-package-seller">
                    <span>🏬 Seller: {pkg.sellerName}</span>
                  </div>
                  <div>
                    {pkg.packageStatus === 'PENDING_PAYMENT' ? (
                      <span className="bb-badge bb-badge-warning">Awaiting Payment ⏳</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="bb-badge bb-badge-neutral">
                          Waybill: {pkg.trackingNumber}
                        </span>
                        {pkg.packageStatus === 'DELIVERED' && (
                          <button
                            type="button"
                            className="bb-btn bb-btn-outline bb-btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                            onClick={() => {
                              setReturnSubOrderNumber(pkg.trackingNumber);
                              setReturnReason('');
                              setActionMessage(null);
                            }}
                          >
                            ↩ Request Return
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bb-order-items-grid">
                  {pkg.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="bb-order-item-row">
                      <img
                        src={item.product.thumbnail}
                        alt={item.product.title}
                        className="bb-order-item-img"
                      />
                      <div className="bb-order-item-info">
                        <div className="bb-order-item-title">{item.product.title}</div>
                        <div className="bb-order-item-variant">
                          Qty: {item.quantity} | Unit Price: ₹{item.unitPrice.toLocaleString('en-IN')}
                          {item.selectedVariants &&
                            Object.entries(item.selectedVariants).map(([k, v]) => ` | ${k}: ${v}`)}
                        </div>
                      </div>
                      <div className="bb-order-item-price">
                        ₹{(item.unitPrice * item.quantity).toLocaleString('en-IN')}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bb-order-detail-meta-est">
                  📦 Estimated Delivery: <strong>{pkg.estimatedDelivery}</strong>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Summary & Delivery Address */}
          <div>
            <div className="bb-card bb-order-side-card">
              <h3 className="bb-panel-title bb-order-side-title">
                📍 Delivery Destination
              </h3>
              <p className="bb-address-name">{selectedOrder.shippingAddress.name}</p>
              <p className="bb-address-text">
                {selectedOrder.shippingAddress.street}, {selectedOrder.shippingAddress.locality}
                <br />
                {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} -{' '}
                <strong>{selectedOrder.shippingAddress.pincode}</strong>
              </p>
              {selectedOrder.shippingAddress.phone && (
                <div className="bb-address-phone">
                  Phone: {selectedOrder.shippingAddress.phone}
                </div>
              )}
            </div>

            <div className="bb-card bb-order-side-card">
              <h3 className="bb-panel-title bb-order-side-title">
                Payment & Price Breakdown
              </h3>
              <div className="bb-price-breakdown-row">
                <span>Items Subtotal</span>
                <span>₹{selectedOrder.itemsSubtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="bb-price-breakdown-row">
                <span>Shipping Estimate</span>
                <span>₹{selectedOrder.estimatedShippingFee}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div className="bb-price-breakdown-row discount">
                  <span>Discounts Applied</span>
                  <span>- ₹{selectedOrder.discount}</span>
                </div>
              )}
              <div className="bb-price-breakdown-total">
                <span>Grand Total</span>
                <span className="bb-price-breakdown-total-val">
                  ₹{selectedOrder.totalAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="bb-order-side-action">
                <button
                  type="button"
                  className="bb-btn bb-btn-outline bb-btn-sm bb-btn-block"
                  onClick={() => alert(`Invoice downloaded for Order #${selectedOrder.orderNumber}`)}
                >
                  📄 Download Tax Invoice (PDF)
                </button>
                {Boolean(
                  selectedOrder.status === 'PENDING_PAYMENT' ||
                  selectedOrder.status === 'CONFIRMED' ||
                  selectedOrder.status === 'PLACED'
                ) && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-outline bb-btn-sm bb-btn-block"
                    style={{
                      color: '#dc2626',
                      borderColor: '#fca5a5',
                      marginTop: '0.5rem',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setShowCancelModal(true);
                      setCancelReason('');
                      setActionMessage(null);
                    }}
                  >
                    ✕ Cancel Entire Order
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cancel Order Modal */}
        {showCancelModal && (
          <div className="bb-modal-backdrop" onClick={() => !actionLoading && setShowCancelModal(false)}>
            <div className="bb-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="bb-modal-header">
                <h3 className="bb-modal-title">Cancel Order #{selectedOrder.orderNumber}</h3>
                <button
                  type="button"
                  className="bb-btn bb-btn-ghost bb-btn-xs"
                  onClick={() => setShowCancelModal(false)}
                  disabled={actionLoading}
                >
                  ✕
                </button>
              </div>
              <div className="bb-modal-body">
                <p style={{ fontSize: '0.875rem', color: 'var(--color-slate-600)', marginBottom: '1rem' }}>
                  Are you sure you want to cancel this order? All packages in this order will be cancelled,
                  and any reserved inventory will be automatically restored for other shoppers.
                </p>
                <label className="bb-label" style={{ fontSize: '0.8125rem' }}>
                  Reason for Cancellation (Optional)
                </label>
                <textarea
                  rows={3}
                  className="bb-input"
                  placeholder="e.g. Changed my mind, found better price elsewhere, ordered by mistake"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={actionLoading}
                />
              </div>
              <div className="bb-modal-footer">
                <button
                  type="button"
                  className="bb-btn bb-btn-ghost bb-btn-sm"
                  onClick={() => setShowCancelModal(false)}
                  disabled={actionLoading}
                >
                  Keep Order
                </button>
                <button
                  type="button"
                  className="bb-btn bb-btn-primary bb-btn-sm"
                  style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
                  onClick={() => handleCancelOrder(selectedOrder.orderNumber)}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Return Request Modal */}
        {returnSubOrderNumber && (
          <div className="bb-modal-backdrop" onClick={() => !actionLoading && setReturnSubOrderNumber(null)}>
            <div className="bb-modal-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="bb-modal-header">
                <h3 className="bb-modal-title">Request Return — Package {returnSubOrderNumber}</h3>
                <button
                  type="button"
                  className="bb-btn bb-btn-ghost bb-btn-xs"
                  onClick={() => setReturnSubOrderNumber(null)}
                  disabled={actionLoading}
                >
                  ✕
                </button>
              </div>
              <div className="bb-modal-body">
                <p style={{ fontSize: '0.875rem', color: 'var(--color-slate-600)', marginBottom: '1rem' }}>
                  You can request a return for items delivered within the last 7 days.
                  The merchant will review your request and arrange pickup or return instructions.
                </p>
                <label className="bb-label bb-label-required" style={{ fontSize: '0.8125rem' }}>
                  Reason for Return
                </label>
                <textarea
                  rows={3}
                  required
                  className="bb-input"
                  placeholder="e.g. Item damaged upon arrival, incorrect specifications, defective product"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  disabled={actionLoading}
                />
              </div>
              <div className="bb-modal-footer">
                <button
                  type="button"
                  className="bb-btn bb-btn-ghost bb-btn-sm"
                  onClick={() => setReturnSubOrderNumber(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="bb-btn bb-btn-primary bb-btn-sm"
                  onClick={() => handleRequestReturn(selectedOrder.orderNumber)}
                  disabled={actionLoading || !returnReason.trim()}
                >
                  {actionLoading ? 'Submitting...' : 'Submit Return Request'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List View of Orders:
  if (ordersLoading && orders.length === 0) {
    return (
      <div className="bb-container bb-orders-container">
        <div className="bb-orders-header">
          <div>
            <h1 className="bb-plp-title">My Orders</h1>
            <p className="bb-section-subtitle">
              Track customer deliveries, package details, and invoices from multi-vendor merchants
            </p>
          </div>
        </div>
        <LoadingSpinner />
      </div>
    );
  }

  if (ordersError && orders.length === 0) {
    return (
      <div className="bb-container bb-orders-container">
        <div className="bb-orders-header">
          <div>
            <h1 className="bb-plp-title">My Orders</h1>
            <p className="bb-section-subtitle">
              Track customer deliveries, package details, and invoices from multi-vendor merchants
            </p>
          </div>
        </div>
        <ErrorState
          title="Unable to Load Orders"
          description={ordersError}
          onRetry={fetchOrders}
        />
      </div>
    );
  }

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PLACED') return o.status === 'PLACED' || o.status === 'CONFIRMED' || o.status === 'PENDING_PAYMENT';
    if (activeTab === 'SHIPPED') return o.status === 'SHIPPED' || o.status === 'OUT_FOR_DELIVERY';
    if (activeTab === 'DELIVERED') return o.status === 'DELIVERED';
    return true;
  });

  return (
    <div className="bb-container bb-orders-container">
      <div className="bb-orders-header">
        <div>
          <h1 className="bb-plp-title">My Orders</h1>
          <p className="bb-section-subtitle">
            Track customer deliveries, package details, and invoices from multi-vendor merchants
          </p>
        </div>
        <button
          type="button"
          className="bb-btn bb-btn-outline bb-btn-sm"
          onClick={() => navigate('/products')}
        >
          Continue Shopping
        </button>
      </div>

      {ordersError && (
        <div
          role="alert"
          style={{
            marginBottom: 'var(--space-4)',
            padding: '0.75rem 1rem',
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: '#92400e', fontSize: '0.875rem' }}>⚠️ {ordersError}</span>
          <button type="button" className="bb-btn bb-btn-ghost bb-btn-sm" onClick={fetchOrders}>
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="bb-orders-tabs">
        <button
          type="button"
          className={`bb-orders-tab ${activeTab === 'ALL' ? 'active' : ''}`}
          onClick={() => setActiveTab('ALL')}
        >
          All Orders ({orders.length})
        </button>
        <button
          type="button"
          className={`bb-orders-tab ${activeTab === 'SHIPPED' ? 'active' : ''}`}
          onClick={() => setActiveTab('SHIPPED')}
        >
          In Transit / Shipped
        </button>
        <button
          type="button"
          className={`bb-orders-tab ${activeTab === 'DELIVERED' ? 'active' : ''}`}
          onClick={() => setActiveTab('DELIVERED')}
        >
          Delivered
        </button>
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyState
          icon="📦"
          title={authMode === 'ANONYMOUS' ? 'Sign in to View Orders' : 'No Orders Found'}
          description={
            authMode === 'ANONYMOUS'
              ? 'Please sign in to view your order history and tracking updates.'
              : "You don't have any orders matching this filter."
          }
          actionText={authMode === 'ANONYMOUS' ? 'Sign In' : 'Explore Marketplace'}
          onAction={() => navigate(authMode === 'ANONYMOUS' ? '/login' : '/products')}
        />
      ) : (
        <div>
          {filteredOrders.map((order) => {
            return (
              <div key={order.id} className="bb-order-card">
                <div className="bb-order-card-header">
                  <div className="bb-order-meta-group">
                    <div className="bb-order-meta-item">
                      <span className="bb-order-meta-label">Order Number</span>
                      <span className="bb-order-meta-val">{order.orderNumber}</span>
                    </div>
                    <div className="bb-order-meta-item">
                      <span className="bb-order-meta-label">Order Date</span>
                      <span className="bb-order-meta-val">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="bb-order-meta-item">
                      <span className="bb-order-meta-label">Total</span>
                      <span className="bb-order-meta-val">
                        ₹{order.totalAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                  <div>{getStatusBadge(order.status)}</div>
                </div>

                <div className="bb-order-packages-list">
                  {order.packages.map((pkg, pIdx) => (
                    <div key={pIdx} className="bb-order-package-block">
                      <div className="bb-order-package-header">
                        <div className="bb-order-package-seller">
                          <span>🏬 Dispatched by: {pkg.sellerName}</span>
                        </div>
                        {pkg.packageStatus === 'PENDING_PAYMENT' ? (
                          <span className="bb-badge bb-badge-warning">Awaiting Payment ⏳</span>
                        ) : (
                          <span className="bb-badge bb-badge-neutral">
                            Tracking: {pkg.trackingNumber}
                          </span>
                        )}
                      </div>

                      {pkg.items.length > 0 ? (
                        <div className="bb-order-items-grid">
                          {pkg.items.map((item, iIdx) => (
                            <div key={iIdx} className="bb-order-item-row">
                              <img
                                src={item.product.thumbnail}
                                alt={item.product.title}
                                className="bb-order-item-img"
                              />
                              <div className="bb-order-item-info">
                                <h4 className="bb-order-item-title">{item.product.title}</h4>
                                <div className="bb-order-item-variant">
                                  Qty: {item.quantity} | ₹{item.unitPrice.toLocaleString('en-IN')} each
                                </div>
                              </div>
                              <div className="bb-order-item-price">
                                ₹{(item.unitPrice * item.quantity).toLocaleString('en-IN')}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="bb-order-items-grid">
                          <div className="bb-order-item-row" style={{ padding: '0.25rem 0', opacity: 0.85 }}>
                            <div className="bb-order-item-info">
                              <div className="bb-order-item-variant">
                                Package confirmed with merchant • Click details to view items
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="bb-order-card-footer">
                  <div className="bb-order-ship-note">
                    {order.shippingAddress.city ? (
                      <>
                        Ship to: <strong>{order.shippingAddress.name}</strong> ({order.shippingAddress.city} - {order.shippingAddress.pincode})
                      </>
                    ) : (
                      <>Delivery to registered customer address</>
                    )}
                  </div>
                  <div className="bb-order-actions-wrap">
                    <button
                      type="button"
                      className="bb-btn bb-btn-primary bb-btn-sm"
                      onClick={() => navigate(`/orders?orderId=${order.orderNumber || order.id}`)}
                    >
                      View Order Details →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
