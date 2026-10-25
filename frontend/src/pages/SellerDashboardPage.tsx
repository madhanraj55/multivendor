import { useState, useEffect } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { sellerOrdersApi, getSellerStatusBadgeClass, formatSellerOrderStatusLabel } from '../services/sellerOrdersApi.ts';
import { sellerProductsApi } from '../services/sellerProductsApi.ts';
import type { SellerOrderListItem, SellerProductItem } from '../types/index.ts';
import { LoadingSpinner, EmptyState, ErrorState } from '../components/common/StateViews.tsx';
import './SellerDashboardPage.css';

export function SellerDashboardPage() {
  const { authUser, authMode } = useMarketplace();
  const { navigate } = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isMissingShop, setIsMissingShop] = useState<boolean>(false);
  const [recentOrders, setRecentOrders] = useState<SellerOrderListItem[]>([]);
  const [products, setProducts] = useState<SellerProductItem[]>([]);
  const [totalOrdersCount, setTotalOrdersCount] = useState<number>(0);

  useEffect(() => {
    if (authMode !== 'AUTHENTICATED' || authUser?.role !== 'SELLER') {
      return;
    }

    let isSubscribed = true;
    setLoading(true);
    setError(null);
    setIsMissingShop(false);

    Promise.allSettled([
      sellerOrdersApi.getSellerOrders({ page: 1, limit: 5 }),
      sellerProductsApi.getMyProducts(),
    ]).then(([ordersRes, productsRes]) => {
      if (!isSubscribed) return;

      let missingShopDetected = false;

      if (ordersRes.status === 'fulfilled') {
        setRecentOrders(ordersRes.value.data || []);
        setTotalOrdersCount(ordersRes.value.meta?.total || 0);
      } else {
        const orderErrMsg = ordersRes.reason instanceof Error ? ordersRes.reason.message : String(ordersRes.reason);
        if (
          orderErrMsg.toLowerCase().includes('no shop') ||
          orderErrMsg.toLowerCase().includes('shop not found') ||
          orderErrMsg.toLowerCase().includes('unapproved')
        ) {
          missingShopDetected = true;
        }
      }

      if (productsRes.status === 'fulfilled') {
        setProducts(productsRes.value || []);
      } else {
        const prodErrMsg = productsRes.reason instanceof Error ? productsRes.reason.message : String(productsRes.reason);
        if (
          prodErrMsg.toLowerCase().includes('no shop') ||
          prodErrMsg.toLowerCase().includes('shop not found') ||
          prodErrMsg.toLowerCase().includes('unapproved')
        ) {
          missingShopDetected = true;
        }
      }

      if (missingShopDetected) {
        setIsMissingShop(true);
      } else if (ordersRes.status === 'rejected' && productsRes.status === 'rejected') {
        const primaryError =
          ordersRes.reason instanceof Error
            ? ordersRes.reason.message
            : 'Could not connect to the backend server (http://localhost:3000). Please ensure your NestJS backend is running.';
        setError(primaryError);
      }

      setLoading(false);
    });

    return () => {
      isSubscribed = false;
    };
  }, [authMode, authUser?.role]);

  if (loading) {
    return (
      <div className="bb-container bb-seller-dashboard-container">
        <LoadingSpinner />
      </div>
    );
  }

  // Handle missing/unregistered shop profile
  if (isMissingShop) {
    return (
      <div className="bb-container bb-seller-dashboard-container">
        <EmptyState
          icon="🏬"
          title="Vendor Shop Setup Required"
          description="Your vendor account is registered, but your shop profile has not been created or is pending administrator approval. Please contact support or complete shop profile setup."
          actionText="Return to Marketplace"
          onAction={() => navigate('/')}
        />
      </div>
    );
  }

  // Handle backend server connectivity failure
  if (error && recentOrders.length === 0 && products.length === 0) {
    return (
      <div className="bb-container bb-seller-dashboard-container">
        <ErrorState
          title="Backend Server Offline"
          description={`${error} (Base URL: http://localhost:3000/api/v1). Please ensure your backend service is running and accessible.`}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  // Calculate Metrics
  const pendingShipmentCount = recentOrders.filter(
    (o) => o.status === 'CONFIRMED' || o.status === 'PROCESSING' || o.status === 'PACKED'
  ).length;

  const totalRevenue = recentOrders
    .filter((o) => o.status !== 'CANCELLED' && o.status !== 'PENDING_PAYMENT')
    .reduce((sum, o) => sum + (o.netSellerPayable || o.subtotalAmount), 0);

  const lowStockProductsCount = products.filter((p) => {
    const totalStock = p.variants?.reduce((sum, v) => sum + (v.inventory?.availableQuantity || 0), 0) || 0;
    return totalStock > 0 && totalStock <= 5;
  }).length;

  return (
    <div className="bb-container bb-seller-dashboard-container">
      {/* Header */}
      <div className="bb-seller-dashboard-header">
        <div className="bb-seller-dashboard-title-area">
          <h1>🏬 Vendor Control Center</h1>
          <p>
            Welcome back, <strong>{authUser?.firstName} {authUser?.lastName}</strong> ({authUser?.email})
          </p>
        </div>
        <div className="bb-seller-dashboard-quick-actions">
          <button
            type="button"
            className="bb-btn bb-btn-primary"
            onClick={() => navigate('/seller/products')}
          >
            + Add Product
          </button>
          <button
            type="button"
            className="bb-btn bb-btn-outline"
            onClick={() => navigate('/seller/orders')}
          >
            Manage Orders
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="bb-seller-kpi-grid">
        <div className="bb-seller-kpi-card">
          <div className="bb-seller-kpi-top">
            <span className="bb-seller-kpi-title">Net Sales</span>
            <div className="bb-seller-kpi-icon revenue">₹</div>
          </div>
          <div className="bb-seller-kpi-value">₹{totalRevenue.toLocaleString('en-IN')}</div>
          <div className="bb-seller-kpi-hint">From processed sub-orders</div>
        </div>

        <div className="bb-seller-kpi-card">
          <div className="bb-seller-kpi-top">
            <span className="bb-seller-kpi-title">Total Orders</span>
            <div className="bb-seller-kpi-icon orders">📦</div>
          </div>
          <div className="bb-seller-kpi-value">{totalOrdersCount}</div>
          <div className="bb-seller-kpi-hint">All time customer sub-orders</div>
        </div>

        <div className="bb-seller-kpi-card">
          <div className="bb-seller-kpi-top">
            <span className="bb-seller-kpi-title">To Ship</span>
            <div className="bb-seller-kpi-icon pending">⏳</div>
          </div>
          <div className="bb-seller-kpi-value">{pendingShipmentCount}</div>
          <div className="bb-seller-kpi-hint">Orders awaiting dispatch</div>
        </div>

        <div className="bb-seller-kpi-card">
          <div className="bb-seller-kpi-top">
            <span className="bb-seller-kpi-title">Active Products</span>
            <div className="bb-seller-kpi-icon products">🏷️</div>
          </div>
          <div className="bb-seller-kpi-value">{products.length}</div>
          <div className="bb-seller-kpi-hint">
            {lowStockProductsCount > 0 ? `⚠️ ${lowStockProductsCount} low stock` : 'Catalogue active'}
          </div>
        </div>
      </div>

      {/* 2 Column Details */}
      <div className="bb-seller-dashboard-columns">
        {/* Left: Recent Orders */}
        <div className="bb-seller-panel">
          <div className="bb-seller-panel-header">
            <h2 className="bb-seller-panel-title">Recent Customer Orders</h2>
            <button
              type="button"
              className="bb-seller-panel-link"
              onClick={() => navigate('/seller/orders')}
            >
              View All Orders →
            </button>
          </div>

          {recentOrders.length === 0 ? (
            <EmptyState
              icon="📦"
              title="No Orders Yet"
              description="When shoppers purchase your products, fulfillment tasks will appear here."
            />
          ) : (
            <div className="bb-seller-table-wrap">
              <table className="bb-seller-dashboard-table">
                <thead>
                  <tr>
                    <th>Sub-Order #</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((ord) => (
                    <tr key={ord.subOrderNumber}>
                      <td>
                        <strong>{ord.subOrderNumber}</strong>
                      </td>
                      <td>
                        {new Date(ord.createdAt).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td>{ord.itemCount} items</td>
                      <td>₹{(ord.netSellerPayable || ord.subtotalAmount).toLocaleString('en-IN')}</td>
                      <td>
                        <span className={`bb-badge ${getSellerStatusBadgeClass(ord.status)}`}>
                          {formatSellerOrderStatusLabel(ord.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="bb-btn bb-btn-ghost bb-btn-sm"
                          onClick={() => navigate('/seller/orders')}
                        >
                          Fulfill
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Management Hub & Catalog Summary */}
        <div className="bb-seller-panel-sidebar">
          <div className="bb-seller-panel">
            <div className="bb-seller-panel-header">
              <h2 className="bb-seller-panel-title">Quick Management Hub</h2>
            </div>

            <button
              type="button"
              className="bb-seller-hub-card"
              onClick={() => navigate('/seller/products')}
            >
              <div className="bb-seller-hub-icon">📦</div>
              <div className="bb-seller-hub-info">
                <h4>Product Catalogue</h4>
                <p>Manage {products.length} products, variants & inventory stock</p>
              </div>
            </button>

            <button
              type="button"
              className="bb-seller-hub-card"
              onClick={() => navigate('/seller/orders')}
            >
              <div className="bb-seller-hub-icon">🚚</div>
              <div className="bb-seller-hub-info">
                <h4>Fulfillment & Dispatch</h4>
                <p>Print labels, courier tracking & status updates</p>
              </div>
            </button>

            <button
              type="button"
              className="bb-seller-hub-card"
              onClick={() => navigate('/profile')}
            >
              <div className="bb-seller-hub-icon">🏢</div>
              <div className="bb-seller-hub-info">
                <h4>Store & Account Profile</h4>
                <p>View business info & contact settings</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
