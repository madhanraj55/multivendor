import { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import type { Order } from '../types/index.ts';
import { EmptyState } from '../components/common/StateViews.tsx';
import './OrdersPage.css';

export function OrdersPage() {
  const { orders } = useMarketplace();
  const { navigate, queryParams } = useRouter();

  const selectedOrderId = queryParams.orderId;
  const [activeTab, setActiveTab] = useState<'ALL' | 'PLACED' | 'SHIPPED' | 'DELIVERED'>('ALL');

  const selectedOrder = orders.find((o) => o.id === selectedOrderId || o.orderNumber === selectedOrderId);

  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PLACED') return o.status === 'PLACED' || o.status === 'CONFIRMED';
    if (activeTab === 'SHIPPED') return o.status === 'SHIPPED' || o.status === 'OUT_FOR_DELIVERY';
    if (activeTab === 'DELIVERED') return o.status === 'DELIVERED';
    return true;
  });

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
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

  // If a specific order is selected for detail view:
  if (selectedOrder) {
    const isStepActive = (stepIndex: number) => {
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
                    <span className="bb-badge bb-badge-neutral">
                      Waybill: {pkg.trackingNumber}
                    </span>
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
              <div className="bb-address-phone">
                Phone: {selectedOrder.shippingAddress.phone}
              </div>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List View of Orders
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
          title="No Orders Found"
          description="You don't have any orders matching this filter."
          actionText="Explore Marketplace"
          onAction={() => navigate('/products')}
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
                        <span className="bb-badge bb-badge-neutral">
                          Tracking: {pkg.trackingNumber}
                        </span>
                      </div>

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
                    </div>
                  ))}
                </div>

                <div className="bb-order-card-footer">
                  <div className="bb-order-ship-note">
                    Ship to: <strong>{order.shippingAddress.name}</strong> ({order.shippingAddress.city} - {order.shippingAddress.pincode})
                  </div>
                  <div className="bb-order-actions-wrap">
                    <button
                      type="button"
                      className="bb-btn bb-btn-primary bb-btn-sm"
                      onClick={() => navigate(`/orders?orderId=${order.id}`)}
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
