import { useState, useEffect, useRef } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import type {
  OrderStatus,
  AdminOrderListItem,
  AdminOrderDetailResponse,
} from '../types/index.ts';
import {
  adminOrdersApi,
  getAdminAllowedTransitions,
  formatOrderStatusLabel,
  getAdminStatusBadgeClass,
  isOrderUnpaid,
} from '../services/adminOrdersApi.ts';
import { EmptyState, ErrorState, LoadingSpinner } from '../components/common/StateViews.tsx';
import './AdminOrdersPage.css';

const TABS: Array<{ label: string; status?: OrderStatus }> = [
  { label: 'All Orders' },
  { label: 'Payment Pending', status: 'PENDING_PAYMENT' },
  { label: 'Confirmed', status: 'CONFIRMED' },
  { label: 'Processing', status: 'PROCESSING' },
  { label: 'Shipped', status: 'SHIPPED' },
  { label: 'Delivered', status: 'DELIVERED' },
  { label: 'Cancelled', status: 'CANCELLED' },
];

export function AdminOrdersPage() {
  const { authUser, authMode } = useMarketplace();
  const { queryParams, navigate } = useRouter();

  // Query and Filter States
  const [activeTab, setActiveTab] = useState<string>('All Orders');
  const [orderNumberSearch, setOrderNumberSearch] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // List Data States
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [listLoading, setListLoading] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);

  // Detail Modal States
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | null>(queryParams.orderNumber || null);
  const [detailOrder, setDetailOrder] = useState<AdminOrderDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(Boolean(queryParams.orderNumber));
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState<number>(0);

  // Action / Status Update States
  const [targetStatus, setTargetStatus] = useState<OrderStatus | ''>('');
  const [statusNotes, setStatusNotes] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Request counter to safely discard stale async responses across pagination or account switches
  const requestSeqRef = useRef<number>(0);

  // Effect for fetching orders list asynchronously
  useEffect(() => {
    if (authMode !== 'AUTHENTICATED' || authUser?.role !== 'ADMIN') {
      return;
    }

    const currentSeq = ++requestSeqRef.current;
    let isSubscribed = true;

    const selectedTabConfig = TABS.find((t) => t.label === activeTab);
    const statusParam = selectedTabConfig?.status;

    adminOrdersApi
      .getAdminOrders({
        page,
        limit,
        status: statusParam,
        orderNumber: orderNumberSearch.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      .then((response) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        setOrders(response.data);
        setMeta(response.meta);
        setListError(null);
        setListLoading(false);
      })
      .catch((err: unknown) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to fetch admin orders from server';
        setListError(message);
        setListLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [
    authMode,
    authUser?.role,
    activeTab,
    page,
    limit,
    orderNumberSearch,
    startDate,
    endDate,
    refreshTrigger,
  ]);

  // Effect for fetching detailed order asynchronously
  useEffect(() => {
    if (!selectedOrderNumber || authMode !== 'AUTHENTICATED' || authUser?.role !== 'ADMIN') {
      return;
    }

    let isSubscribed = true;

    adminOrdersApi
      .getAdminOrderByNumber(selectedOrderNumber)
      .then((detail) => {
        if (!isSubscribed) return;
        setDetailOrder(detail);
        setDetailError(null);
        setDetailLoading(false);
        const allowed = getAdminAllowedTransitions(detail.status);
        if (allowed.length > 0) {
          setTargetStatus(allowed[0]);
        }
      })
      .catch((err: unknown) => {
        if (!isSubscribed) return;
        const message = err instanceof Error ? err.message : 'Failed to load order details';
        setDetailError(message);
        setDetailLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [selectedOrderNumber, authMode, authUser?.role, detailRefreshTrigger]);

  // Handle open order detail
  const handleOpenDetail = (orderNumber: string) => {
    setSelectedOrderNumber(orderNumber);
    setDetailOrder(null);
    setDetailError(null);
    setActionError(null);
    setActionSuccess(null);
    setDetailLoading(true);
  };

  // Close detail modal
  const handleCloseDetail = () => {
    setSelectedOrderNumber(null);
    setDetailOrder(null);
    setDetailError(null);
    setDetailLoading(false);
    if (queryParams.orderNumber) {
      navigate('/admin/orders');
    }
  };

  // Refresh Feed
  const handleRefreshFeed = () => {
    setListLoading(true);
    setRefreshTrigger((c) => c + 1);
  };

  // Handle Status Update Submission
  const handleStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailOrder || !targetStatus) return;

    // Safety check against invalid transitions
    const allowed = getAdminAllowedTransitions(detailOrder.status);
    if (!allowed.includes(targetStatus)) {
      setActionError(`Transition from ${detailOrder.status} to ${targetStatus} is prohibited.`);
      return;
    }

    setUpdatingStatus(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await adminOrdersApi.updateAdminOrderStatus(detailOrder.orderNumber, {
        status: targetStatus,
        notes: statusNotes.trim() || undefined,
      });

      setActionSuccess(result.message || `Order status updated to ${result.status}`);
      // Refresh detailed order and list
      setDetailRefreshTrigger((c) => c + 1);
      setRefreshTrigger((c) => c + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update order status';
      setActionError(message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setListLoading(true);
    setPage(1);
    setRefreshTrigger((c) => c + 1);
  };

  const handleResetFilters = () => {
    setOrderNumberSearch('');
    setStartDate('');
    setEndDate('');
    setActiveTab('All Orders');
    setPage(1);
    setListLoading(true);
    setRefreshTrigger((c) => c + 1);
  };

  // Format currency in Indian Rupees
  const formatCurrency = (amount: number, currency: string = 'INR') => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="bb-container bb-admin-orders-container">
      {/* Header Banner */}
      <div className="bb-admin-header">
        <div className="bb-admin-header-title-area">
          <div className="bb-admin-header-badge-row">
            <span className="bb-badge bb-badge-danger">🛡️ System Administration</span>
            <span className="bb-badge bb-badge-neutral">{authUser?.email}</span>
          </div>
          <h1 className="bb-admin-header-title">Marketplace Order Administration</h1>
          <p className="bb-admin-header-desc">
            Supervise parent customer orders across all registered merchant shops, inspect seller package
            breakdowns, verify payment settlement states, and manage lifecycle order cancellations safely.
          </p>
        </div>
        <div className="bb-admin-header-actions">
          <button
            type="button"
            className="bb-btn bb-btn-outline"
            style={{ color: 'var(--color-white)', borderColor: 'var(--color-slate-600)' }}
            onClick={handleRefreshFeed}
            disabled={listLoading}
          >
            🔄 {listLoading ? 'Refreshing...' : 'Refresh Feed'}
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="bb-admin-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.label}
            className={`bb-admin-tab ${activeTab === tab.label ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab.label);
              setPage(1);
              setListLoading(true);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter and Search Bar */}
      <form className="bb-admin-filter-bar" onSubmit={handleApplyFilters}>
        <div className="bb-filter-group">
          <label htmlFor="admin-search-order" className="bb-filter-label">
            Order Number
          </label>
          <input
            id="admin-search-order"
            type="text"
            className="bb-filter-input"
            placeholder="e.g. ORD-20261015-..."
            value={orderNumberSearch}
            onChange={(e) => setOrderNumberSearch(e.target.value)}
          />
        </div>

        <div className="bb-filter-group bb-filter-group-sm">
          <label htmlFor="admin-filter-start" className="bb-filter-label">
            Start Date
          </label>
          <input
            id="admin-filter-start"
            type="date"
            className="bb-filter-input"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="bb-filter-group bb-filter-group-sm">
          <label htmlFor="admin-filter-end" className="bb-filter-label">
            End Date
          </label>
          <input
            id="admin-filter-end"
            type="date"
            className="bb-filter-input"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <div className="bb-filter-group bb-filter-group-sm">
          <label htmlFor="admin-filter-limit" className="bb-filter-label">
            Per Page
          </label>
          <select
            id="admin-filter-limit"
            className="bb-filter-select"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
              setListLoading(true);
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </div>

        <div className="bb-filter-actions">
          <button type="submit" className="bb-btn bb-btn-primary bb-btn-sm">
            🔍 Search
          </button>
          <button
            type="button"
            className="bb-btn bb-btn-secondary bb-btn-sm"
            onClick={handleResetFilters}
          >
            Reset
          </button>
        </div>
      </form>

      {/* Orders Table Container */}
      {listLoading && <LoadingSpinner />}

      {listError && !listLoading && (
        <ErrorState
          title="Could not load administrator order feed"
          description={listError}
          onRetry={handleRefreshFeed}
        />
      )}

      {!listLoading && !listError && orders.length === 0 && (
        <EmptyState
          icon="📋"
          title="No marketplace orders found"
          description={
            orderNumberSearch || startDate || endDate || activeTab !== 'All Orders'
              ? 'No orders matched your active search or status criteria. Try loosening your filters.'
              : 'There are currently no customer orders placed in the marketplace system.'
          }
          actionText={
            orderNumberSearch || startDate || endDate || activeTab !== 'All Orders'
              ? 'Clear All Filters'
              : undefined
          }
          onAction={handleResetFilters}
        />
      )}

      {!listLoading && !listError && orders.length > 0 && (
        <div className="bb-admin-table-container">
          <div style={{ overflowX: 'auto' }}>
            <table className="bb-admin-table">
              <thead>
                <tr>
                  <th>Order Reference</th>
                  <th>Customer Profile</th>
                  <th>Date & Time</th>
                  <th>Total Payable</th>
                  <th>Vendor Packages</th>
                  <th>Order Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const unpaid = isOrderUnpaid(order.status);
                  return (
                    <tr key={order.id} className={unpaid ? 'bb-admin-row-unpaid' : ''}>
                      <td>
                        <button
                          type="button"
                          className="bb-admin-order-link"
                          onClick={() => handleOpenDetail(order.orderNumber)}
                          title="Inspect detailed order breakdown"
                        >
                          {order.orderNumber}
                        </button>
                      </td>
                      <td>
                        <div className="bb-customer-cell">
                          <span className="bb-customer-name">
                            {order.customer.firstName} {order.customer.lastName}
                          </span>
                          <span className="bb-customer-email">{order.customer.email}</span>
                          {order.customer.phone && (
                            <span className="bb-customer-phone">📞 {order.customer.phone}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ whiteSpace: 'nowrap' }}>
                          {new Date(order.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                          {new Date(order.createdAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 'var(--font-weight-bold)' }}>
                          {formatCurrency(order.totalAmount, order.currency)}
                        </span>
                      </td>
                      <td>
                        <div className="bb-shop-chips">
                          {order.sellerOrders.map((so) => (
                            <span
                              key={so.subOrderNumber}
                              className="bb-shop-chip"
                              title={`${so.shopName} (${so.itemCount} items) — ${so.status}`}
                            >
                              🏬 {so.shopName}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span className={`bb-badge ${getAdminStatusBadgeClass(order.status)}`}>
                          {unpaid ? '⏳ ' : ''}
                          {formatOrderStatusLabel(order.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="bb-btn bb-btn-outline bb-btn-sm"
                          onClick={() => handleOpenDetail(order.orderNumber)}
                        >
                          Inspect Order ↗
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Backend Pagination Bar */}
          <div className="bb-admin-pagination">
            <div className="bb-admin-page-info">
              Showing Page <strong>{meta.page}</strong> of <strong>{meta.totalPages}</strong> ({meta.total} total orders)
            </div>
            <div className="bb-admin-page-controls">
              <button
                type="button"
                className="bb-btn bb-btn-secondary bb-btn-sm"
                disabled={meta.page <= 1}
                onClick={() => {
                  setPage((p) => Math.max(1, p - 1));
                  setListLoading(true);
                }}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="bb-btn bb-btn-secondary bb-btn-sm"
                disabled={meta.page >= meta.totalPages}
                onClick={() => {
                  setPage((p) => p + 1);
                  setListLoading(true);
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Detail Modal / Drawer */}
      {selectedOrderNumber && (
        <div
          className="bb-admin-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDetail();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Order details for ${selectedOrderNumber}`}
        >
          <div className="bb-admin-modal">
            {/* Modal Header */}
            <div className="bb-admin-modal-header">
              <div className="bb-admin-modal-title">
                <span>📦 Order Reference:</span>
                <span style={{ fontFamily: 'monospace', color: '#fed7aa' }}>
                  {selectedOrderNumber}
                </span>
                {detailOrder && (
                  <span className={`bb-badge ${getAdminStatusBadgeClass(detailOrder.status)}`}>
                    {isOrderUnpaid(detailOrder.status) ? '⏳ ' : ''}
                    {formatOrderStatusLabel(detailOrder.status)}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="bb-admin-modal-close"
                onClick={handleCloseDetail}
                aria-label="Close detail modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="bb-admin-modal-body">
              {detailLoading && <LoadingSpinner />}

              {detailError && (
                <ErrorState
                  title="Failed to load order inspection details"
                  description={detailError}
                  onRetry={() => {
                    setDetailLoading(true);
                    setDetailRefreshTrigger((c) => c + 1);
                  }}
                />
              )}

              {detailOrder && !detailLoading && (
                <>
                  {/* Unpaid Warning Notice */}
                  {isOrderUnpaid(detailOrder.status) && (
                    <div className="bb-admin-unpaid-banner" role="alert">
                      <span className="bb-admin-unpaid-banner-icon">⚠️</span>
                      <div>
                        <strong>Payment Pending Verification:</strong>
                        <p style={{ margin: '4px 0 0 0', color: 'inherit' }}>
                          This parent order is currently awaiting customer payment confirmation. In accordance with
                          marketplace security policies, unpaid orders cannot be confirmed, processed, or fulfilled by
                          vendors. Administrators may only cancel unpaid orders if requested or expired.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Customer Information & Summary */}
                  <div className="bb-admin-section">
                    <h3 className="bb-admin-section-title">👤 Customer Information</h3>
                    <div className="bb-admin-grid-2">
                      <div className="bb-detail-kv">
                        <span className="bb-detail-k">Full Name</span>
                        <span className="bb-detail-v">
                          {detailOrder.customer.firstName} {detailOrder.customer.lastName}
                        </span>
                      </div>
                      <div className="bb-detail-kv">
                        <span className="bb-detail-k">Email Address</span>
                        <span className="bb-detail-v">{detailOrder.customer.email}</span>
                      </div>
                      <div className="bb-detail-kv">
                        <span className="bb-detail-k">Contact Phone</span>
                        <span className="bb-detail-v">{detailOrder.customer.phone || 'Not provided'}</span>
                      </div>
                      <div className="bb-detail-kv">
                        <span className="bb-detail-k">Customer ID</span>
                        <span className="bb-detail-v" style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>
                          {detailOrder.customer.id}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment & Checkout Attempt Details */}
                  <div className="bb-admin-section">
                    <h3 className="bb-admin-section-title">💳 Payment & Settlement Audit</h3>
                    <div className="bb-admin-grid-2">
                      <div className="bb-detail-kv">
                        <span className="bb-detail-k">Total Amount Payable</span>
                        <span className="bb-detail-v">
                          {formatCurrency(detailOrder.totalAmount, detailOrder.currency)}
                        </span>
                      </div>
                      <div className="bb-detail-kv">
                        <span className="bb-detail-k">Subtotal / Shipping / Tax</span>
                        <span className="bb-detail-v">
                          {formatCurrency(detailOrder.subtotalAmount)} + {formatCurrency(detailOrder.shippingFee)} (Ship) + {formatCurrency(detailOrder.taxAmount)} (Tax)
                        </span>
                      </div>
                      <div className="bb-detail-kv">
                        <span className="bb-detail-k">Checkout Attempt Status</span>
                        <span className="bb-detail-v">
                          {detailOrder.paymentSummary.checkoutAttempt?.status || 'N/A'}
                        </span>
                      </div>
                      <div className="bb-detail-kv">
                        <span className="bb-detail-k">Checkout Attempt ID</span>
                        <span className="bb-detail-v" style={{ fontFamily: 'monospace', fontSize: 'var(--text-xs)' }}>
                          {detailOrder.paymentSummary.checkoutAttempt?.id || 'Direct / Migration'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delivery Address Snapshot */}
                  <div className="bb-admin-section">
                    <h3 className="bb-admin-section-title">📍 Delivery Address Snapshot</h3>
                    {detailOrder.shippingAddress ? (
                      <div className="bb-admin-grid-2">
                        <div className="bb-detail-kv">
                          <span className="bb-detail-k">Recipient Name</span>
                          <span className="bb-detail-v">{detailOrder.shippingAddress.fullName}</span>
                        </div>
                        <div className="bb-detail-kv">
                          <span className="bb-detail-k">Recipient Phone</span>
                          <span className="bb-detail-v">{detailOrder.shippingAddress.phone}</span>
                        </div>
                        <div className="bb-detail-kv" style={{ gridColumn: 'span 2' }}>
                          <span className="bb-detail-k">Shipping Location</span>
                          <span className="bb-detail-v">
                            {detailOrder.shippingAddress.addressLine1}
                            {detailOrder.shippingAddress.addressLine2 ? `, ${detailOrder.shippingAddress.addressLine2}` : ''}
                            {detailOrder.shippingAddress.landmark ? ` (Near ${detailOrder.shippingAddress.landmark})` : ''}
                            , {detailOrder.shippingAddress.city}, {detailOrder.shippingAddress.state} -{' '}
                            <strong>{detailOrder.shippingAddress.postalCode}</strong>
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--color-slate-500)', fontSize: 'var(--text-sm)', margin: 0 }}>
                        No physical address snapshot recorded for this order.
                      </p>
                    )}
                  </div>

                  {/* Seller Packages & Line Items */}
                  <div className="bb-admin-section">
                    <h3 className="bb-admin-section-title">
                      🏬 Vendor Packages Breakdown ({detailOrder.sellerOrders.length} Shop{detailOrder.sellerOrders.length > 1 ? 's' : ''})
                    </h3>

                    {detailOrder.sellerOrders.map((pkg) => (
                      <div key={pkg.id} className="bb-admin-pkg-card">
                        <div className="bb-admin-pkg-header">
                          <div>
                            <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--color-slate-900)' }}>
                              🏪 {pkg.shop.name}
                            </strong>{' '}
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', fontFamily: 'monospace' }}>
                              ({pkg.subOrderNumber})
                            </span>
                            {pkg.shop.seller && (
                              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)' }}>
                                Vendor: {pkg.shop.seller.firstName} {pkg.shop.seller.lastName} ({pkg.shop.seller.email})
                              </div>
                            )}
                          </div>
                          <span className={`bb-badge ${getAdminStatusBadgeClass(pkg.status)}`}>
                            {pkg.status}
                          </span>
                        </div>

                        <div className="bb-admin-pkg-body">
                          {/* Items table */}
                          <table className="bb-admin-table" style={{ fontSize: 'var(--text-xs)' }}>
                            <thead>
                              <tr>
                                <th>Product Item</th>
                                <th>SKU</th>
                                <th>Qty</th>
                                <th>Unit Price</th>
                                <th>GST</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pkg.items.map((it) => (
                                <tr key={it.id}>
                                  <td>
                                    <strong>{it.productTitle}</strong>
                                    {it.attributes && Object.keys(it.attributes).length > 0 && (
                                      <div style={{ color: 'var(--color-slate-500)' }}>
                                        {Object.entries(it.attributes)
                                          .map(([k, v]) => `${k}: ${v}`)
                                          .join(', ')}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ fontFamily: 'monospace' }}>{it.sku || 'N/A'}</td>
                                  <td>{it.quantity}</td>
                                  <td>{formatCurrency(it.unitPrice)}</td>
                                  <td>{it.gstRate ? `${it.gstRate}%` : '0%'}</td>
                                  <td style={{ fontWeight: 'var(--font-weight-bold)' }}>
                                    {formatCurrency(it.totalAmount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {/* Vendor Financial Breakdown */}
                          <div className="bb-admin-pkg-financials">
                            <div className="bb-admin-pkg-financial-item">
                              <span style={{ color: 'var(--color-slate-500)' }}>Subtotal:</span>
                              <strong>{formatCurrency(pkg.subtotalAmount)}</strong>
                            </div>
                            <div className="bb-admin-pkg-financial-item">
                              <span style={{ color: 'var(--color-slate-500)' }}>Shipping Fee:</span>
                              <strong>{formatCurrency(pkg.shippingFee)}</strong>
                            </div>
                            <div className="bb-admin-pkg-financial-item">
                              <span style={{ color: 'var(--color-slate-500)' }}>Tax / GST:</span>
                              <strong>{formatCurrency(pkg.taxAmount)}</strong>
                            </div>
                            <div className="bb-admin-pkg-financial-item">
                              <span style={{ color: 'var(--color-slate-500)' }}>Total Package Amount:</span>
                              <strong style={{ color: 'var(--color-slate-900)' }}>
                                {formatCurrency(pkg.totalAmount)}
                              </strong>
                            </div>
                            {pkg.netSellerPayable !== undefined && (
                              <div className="bb-admin-pkg-financial-item">
                                <span style={{ color: 'var(--color-slate-500)' }}>Net Seller Payable:</span>
                                <strong style={{ color: 'var(--color-emerald-600)' }}>
                                  {formatCurrency(pkg.netSellerPayable)}
                                </strong>
                              </div>
                            )}
                            {pkg.commissionAmount !== undefined && (
                              <div className="bb-admin-pkg-financial-item">
                                <span style={{ color: 'var(--color-slate-500)' }}>Platform Commission:</span>
                                <strong>{formatCurrency(pkg.commissionAmount)}</strong>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Parent Order Status History */}
                  <div className="bb-admin-section">
                    <h3 className="bb-admin-section-title">⏱️ Order Lifecycle Audit Log</h3>
                    {detailOrder.statusHistory.length > 0 ? (
                      <div className="bb-admin-timeline">
                        {detailOrder.statusHistory.map((h) => (
                          <div key={h.id} className="bb-admin-timeline-item">
                            <div className="bb-admin-timeline-bullet" />
                            <div className="bb-admin-timeline-meta">
                              <span className={`bb-badge ${getAdminStatusBadgeClass(h.status)} bb-btn-sm`}>
                                {h.status}
                              </span>
                              <span>
                                {new Date(h.createdAt).toLocaleString('en-IN', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {h.changedBy && (
                                <span style={{ fontWeight: 'var(--font-weight-medium)' }}>
                                  by {h.changedBy.firstName} {h.changedBy.lastName} ({h.changedBy.role})
                                </span>
                              )}
                            </div>
                            {h.notes && <div className="bb-admin-timeline-notes">📝 {h.notes}</div>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--color-slate-500)', fontSize: 'var(--text-sm)', margin: 0 }}>
                        No status transitions recorded yet for this order.
                      </p>
                    )}
                  </div>

                  {/* Administrator Status Intervention Box */}
                  <div className="bb-admin-action-box">
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: 'var(--text-md)', color: 'var(--color-slate-900)' }}>
                        ⚙️ Administrator Status Transition
                      </h4>
                      <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-slate-600)' }}>
                        All status transitions strictly adhere to the marketplace transition state machine. Unpaid
                        orders can only be cancelled.
                      </p>
                    </div>

                    {actionSuccess && (
                      <div className="bb-badge bb-badge-success" style={{ padding: 'var(--space-3)' }}>
                        ✓ {actionSuccess}
                      </div>
                    )}

                    {actionError && (
                      <div className="bb-badge bb-badge-danger" style={{ padding: 'var(--space-3)' }}>
                        ⚠️ {actionError}
                      </div>
                    )}

                    {getAdminAllowedTransitions(detailOrder.status).length > 0 ? (
                      <form className="bb-admin-action-form" onSubmit={handleStatusUpdate}>
                        <div className="bb-admin-action-row">
                          <div style={{ flex: '1 1 200px' }}>
                            <label
                              htmlFor="admin-target-status"
                              style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'bold', marginBottom: '4px' }}
                            >
                              Target Status
                            </label>
                            <select
                              id="admin-target-status"
                              className="bb-filter-select"
                              style={{ width: '100%' }}
                              value={targetStatus}
                              onChange={(e) => setTargetStatus(e.target.value as OrderStatus)}
                              disabled={updatingStatus}
                            >
                              {getAdminAllowedTransitions(detailOrder.status).map((st) => (
                                <option key={st} value={st}>
                                  {st} {st === 'CANCELLED' ? '(Cancel Order)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={{ flex: '2 1 300px' }}>
                            <label
                              htmlFor="admin-status-notes"
                              style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'bold', marginBottom: '4px' }}
                            >
                              Intervention Reason / Notes
                            </label>
                            <input
                              id="admin-status-notes"
                              type="text"
                              className="bb-filter-input"
                              style={{ width: '100%' }}
                              placeholder="e.g. Cancelled on customer request before payment"
                              value={statusNotes}
                              onChange={(e) => setStatusNotes(e.target.value)}
                              disabled={updatingStatus}
                            />
                          </div>

                          <button
                            type="submit"
                            className="bb-btn bb-btn-primary"
                            disabled={updatingStatus || !targetStatus}
                          >
                            {updatingStatus ? 'Updating...' : 'Execute Transition'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-slate-500)', fontStyle: 'italic' }}>
                        This order is currently in terminal status <strong>{detailOrder.status}</strong>. No further status
                        modifications are permitted.
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
