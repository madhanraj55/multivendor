import { useState, useEffect, useRef } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import type {
  SellerOrderStatus,
  SellerOrderListItem,
  SellerOrderDetailResponse,
} from '../types/index.ts';
import {
  sellerOrdersApi,
  getSellerAllowedTransitions,
  formatSellerOrderStatusLabel,
  getSellerStatusBadgeClass,
  isSellerOrderUnpaid,
} from '../services/sellerOrdersApi.ts';
import { EmptyState, ErrorState, LoadingSpinner } from '../components/common/StateViews.tsx';
import './SellerOrdersPage.css';

const TABS: Array<{ label: string; status?: SellerOrderStatus }> = [
  { label: 'All Orders' },
  { label: 'Awaiting Payment', status: 'PENDING_PAYMENT' },
  { label: 'Confirmed', status: 'CONFIRMED' },
  { label: 'Processing', status: 'PROCESSING' },
  { label: 'Packed', status: 'PACKED' },
  { label: 'Shipped', status: 'SHIPPED' },
  { label: 'Delivered', status: 'DELIVERED' },
  { label: 'Cancelled', status: 'CANCELLED' },
  { label: 'Returns', status: 'RETURN_REQUESTED' },
];

export function SellerOrdersPage() {
  const { authUser, authMode } = useMarketplace();
  const { queryParams, navigate } = useRouter();

  // Query & Filter States
  const [activeTab, setActiveTab] = useState<string>('All Orders');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // List Data States
  const [orders, setOrders] = useState<SellerOrderListItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [listLoading, setListLoading] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [isMissingShop, setIsMissingShop] = useState<boolean>(false);

  // Detail Modal States
  const [selectedSubOrderNumber, setSelectedSubOrderNumber] = useState<string | null>(
    queryParams.subOrderNumber || null
  );
  const [detailOrder, setDetailOrder] = useState<SellerOrderDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(Boolean(queryParams.subOrderNumber));
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState<number>(0);

  // Action / Status Update States
  const [targetStatus, setTargetStatus] = useState<SellerOrderStatus | ''>('');
  const [statusNotes, setStatusNotes] = useState<string>('');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [updatingInlineSubOrder, setUpdatingInlineSubOrder] = useState<string | null>(null);
  const [tableNotice, setTableNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Request sequence counter to discard superseded async responses
  const requestSeqRef = useRef<number>(0);

  // Effect for fetching seller orders asynchronously
  useEffect(() => {
    if (authMode !== 'AUTHENTICATED' || authUser?.role !== 'SELLER') {
      return;
    }

    const currentSeq = ++requestSeqRef.current;
    let isSubscribed = true;

    const selectedTabConfig = TABS.find((t) => t.label === activeTab);
    const statusParam = selectedTabConfig?.status;

    sellerOrdersApi
      .getSellerOrders({
        page,
        limit,
        status: statusParam,
      })
      .then((response) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        setOrders(response.data);
        setMeta(response.meta);
        setIsMissingShop(false);
        setListError(null);
        setListLoading(false);
      })
      .catch((err: unknown) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch seller orders from server';
        if (msg.includes('No shop profile found')) {
          setIsMissingShop(true);
        }
        setListError(msg);
        setListLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [authMode, authUser?.role, activeTab, page, limit, refreshTrigger]);

  // Effect for fetching detailed sub-order asynchronously
  useEffect(() => {
    if (!selectedSubOrderNumber || authMode !== 'AUTHENTICATED' || authUser?.role !== 'SELLER') {
      return;
    }

    let isSubscribed = true;

    sellerOrdersApi
      .getSellerOrderByNumber(selectedSubOrderNumber)
      .then((detail) => {
        if (!isSubscribed) return;
        setDetailOrder(detail);
        setDetailError(null);
        setDetailLoading(false);
        const allowed = getSellerAllowedTransitions(detail.status);
        if (allowed.length > 0) {
          setTargetStatus(allowed[0]);
        }
      })
      .catch((err: unknown) => {
        if (!isSubscribed) return;
        const message = err instanceof Error ? err.message : 'Failed to load sub-order details';
        setDetailError(message);
        setDetailLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [selectedSubOrderNumber, authMode, authUser?.role, detailRefreshTrigger]);

  // Handle open detail modal
  const handleOpenDetail = (subOrderNumber: string) => {
    setSelectedSubOrderNumber(subOrderNumber);
    setDetailOrder(null);
    setDetailError(null);
    setActionError(null);
    setActionSuccess(null);
    setDetailLoading(true);
  };

  // Handle close detail modal
  const handleCloseDetail = () => {
    setSelectedSubOrderNumber(null);
    setDetailOrder(null);
    setDetailError(null);
    setDetailLoading(false);
    if (queryParams.subOrderNumber) {
      navigate('/seller/orders');
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

    // Safety verification: PENDING_PAYMENT orders cannot be fulfilled
    if (isSellerOrderUnpaid(detailOrder.status)) {
      setActionError('Orders with pending payment cannot be confirmed, processed, or fulfilled.');
      return;
    }

    // Safety verification: Allowed transition check
    const allowed = getSellerAllowedTransitions(detailOrder.status);
    if (!allowed.includes(targetStatus)) {
      setActionError(`Transition from ${detailOrder.status} to ${targetStatus} is not permitted.`);
      return;
    }

    setUpdatingStatus(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const result = await sellerOrdersApi.updateSellerOrderStatus(detailOrder.subOrderNumber, {
        status: targetStatus,
        notes: statusNotes.trim() || undefined,
      });

      setActionSuccess(result.message || `Sub-order status updated to ${result.status}`);
      // Refresh detailed view and orders feed
      setDetailRefreshTrigger((c) => c + 1);
      setRefreshTrigger((c) => c + 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update order status';
      setActionError(message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Quick status update for modal
  const handleQuickUpdate = async (nextStatus: SellerOrderStatus) => {
    if (!detailOrder) return;
    setUpdatingStatus(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const result = await sellerOrdersApi.updateSellerOrderStatus(detailOrder.subOrderNumber, {
        status: nextStatus,
        notes: `Sequential fulfillment to ${nextStatus}`,
      });
      setActionSuccess(result.message || `Sub-order status updated to ${result.status}`);
      setDetailRefreshTrigger((c) => c + 1);
      setRefreshTrigger((c) => c + 1);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to update order status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Inline status update directly from table
  const handleInlineStatusUpdate = async (
    subOrderNumber: string,
    nextStatus: SellerOrderStatus
  ) => {
    setUpdatingInlineSubOrder(subOrderNumber);
    setTableNotice(null);
    try {
      const result = await sellerOrdersApi.updateSellerOrderStatus(subOrderNumber, {
        status: nextStatus,
        notes: `Status advanced to ${nextStatus} via seller dashboard`,
      });
      setTableNotice({
        type: 'success',
        message: result.message || `Sub-order ${subOrderNumber} updated to ${formatSellerOrderStatusLabel(nextStatus)}`,
      });
      setRefreshTrigger((c) => c + 1);
    } catch (err: unknown) {
      setTableNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update order status',
      });
    } finally {
      setUpdatingInlineSubOrder(null);
    }
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
    <div className="bb-container bb-seller-orders-container">
      {/* Header Banner */}
      <div className="bb-seller-header">
        <div className="bb-seller-header-title-area">
          <h1 className="bb-seller-header-title">Customers Orders</h1>
        </div>
        <div className="bb-seller-header-actions">
          <button
            type="button"
            className="bb-btn bb-btn-outline bb-btn-seller-header-refresh"
            onClick={handleRefreshFeed}
            disabled={listLoading}
          >
            🔄 {listLoading ? 'Refreshing...' : 'Refresh Feed'}
          </button>
        </div>
      </div>

      {/* Missing or Unapproved Shop State */}
      {isMissingShop && (
        <div className="bb-missing-shop-card" role="alert">
          <h3 className="bb-missing-shop-title">🏪 Seller Shop Profile Setup Required</h3>
          <p className="bb-missing-shop-desc">
            Your account holds the <strong>SELLER</strong> role, but no active merchant shop profile was found in the
            marketplace registry. Vendor orders are scoped strictly to verified shops. Please complete your seller shop
            onboarding to begin receiving customer orders.
          </p>
          <button
            type="button"
            className="bb-btn bb-btn-primary bb-btn-sm"
            onClick={() => alert('Seller Onboarding: Please contact admin@bharatbazaar.in to verify your shop documentation.')}
          >
            Complete Shop Verification ↗
          </button>
        </div>
      )}

      {/* Status Filter Tabs */}
      {!isMissingShop && (
        <div className="bb-seller-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.label}
              className={`bb-seller-tab ${activeTab === tab.label ? 'active' : ''}`}
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
      )}

      {/* Table Action Notice */}
      {tableNotice && (
        <div
          role="alert"
          style={{
            marginBottom: 'var(--space-4)',
            padding: '0.75rem 1rem',
            background: tableNotice.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${tableNotice.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: '8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: tableNotice.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          <span>{tableNotice.type === 'success' ? '✓ ' : '⚠️ '}{tableNotice.message}</span>
          <button
            type="button"
            className="bb-btn bb-btn-ghost bb-btn-sm"
            onClick={() => setTableNotice(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Orders Table Container */}
      {listLoading && <LoadingSpinner />}

      {listError && !listLoading && !isMissingShop && (
        <ErrorState
          title="Could not load vendor orders feed"
          description={listError}
          onRetry={handleRefreshFeed}
        />
      )}

      {!listLoading && !listError && !isMissingShop && orders.length === 0 && (
        <EmptyState
          icon="📦"
          title="No vendor packages found"
          description={
            activeTab !== 'All Orders'
              ? `There are currently no orders in the "${activeTab}" status for your shop.`
              : 'Your shop has not received any customer orders yet. They will appear here immediately once placed.'
          }
          actionText={activeTab !== 'All Orders' ? 'Show All Orders' : undefined}
          onAction={activeTab !== 'All Orders' ? () => setActiveTab('All Orders') : undefined}
        />
      )}

      {!listLoading && !listError && !isMissingShop && orders.length > 0 && (
        <div className="bb-seller-table-container">
          <div className="bb-seller-table-scroll">
            <table className="bb-seller-table">
              <thead>
                <tr>
                  <th>Package Reference</th>
                  <th>Order Date</th>
                  <th>Item Summary</th>
                  <th>Delivery</th>
                  <th>Net Payable</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((so) => {
                  const unpaid = isSellerOrderUnpaid(so.status);
                  return (
                    <tr key={so.id} className={unpaid ? 'bb-seller-row-unpaid' : ''}>
                      <td>
                        <button
                          type="button"
                          className="bb-seller-suborder-link"
                          onClick={() => handleOpenDetail(so.subOrderNumber)}
                          title="Inspect sub-order items and delivery details"
                        >
                          {so.subOrderNumber}
                        </button>
                        <div className="bb-seller-suborder-parent">
                          Parent: {so.parentOrderNumber}
                        </div>
                      </td>
                      <td>
                        <div className="bb-seller-order-date">
                          {new Date(so.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="bb-seller-order-time">
                          {new Date(so.createdAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td>
                        <div className="bb-seller-item-title">
                          {so.items[0]?.title || 'Package Items'}
                        </div>
                        <div className="bb-seller-item-meta">
                          {so.itemCount} item{so.itemCount > 1 ? 's' : ''} (SKU: {so.items[0]?.sku || 'N/A'})
                          {so.itemCount > 1 ? ` + ${so.itemCount - 1} more` : ''}
                        </div>
                      </td>
                      <td>
                        <span className="bb-badge bb-badge-neutral">{so.deliveryType}</span>
                      </td>
                      <td>
                        <div className="bb-seller-net-payable">
                          {formatCurrency(so.netSellerPayable, so.currency)}
                        </div>
                        <div className="bb-seller-total-amount">
                          Total: {formatCurrency(so.totalAmount, so.currency)}
                        </div>
                      </td>
                      <td>
                        <span className={`bb-badge ${getSellerStatusBadgeClass(so.status)}`}>
                          {unpaid ? '⏳ ' : ''}
                          {formatSellerOrderStatusLabel(so.status)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {(so.status === 'CONFIRMED' || so.status === 'PROCESSING') && (
                            <button
                              type="button"
                              className="bb-btn bb-btn-primary bb-btn-sm"
                              disabled={updatingInlineSubOrder === so.subOrderNumber}
                              onClick={() => handleInlineStatusUpdate(so.subOrderNumber, 'PACKED')}
                              title="Mark this package as Packed"
                            >
                              {updatingInlineSubOrder === so.subOrderNumber ? 'Packing...' : '📦 Pack'}
                            </button>
                          )}
                          {so.status === 'PACKED' && (
                            <button
                              type="button"
                              className="bb-btn bb-btn-primary bb-btn-sm"
                              disabled={updatingInlineSubOrder === so.subOrderNumber}
                              onClick={() => handleInlineStatusUpdate(so.subOrderNumber, 'SHIPPED')}
                              title="Mark this package as Shipped"
                            >
                              {updatingInlineSubOrder === so.subOrderNumber ? 'Shipping...' : '🚚 Ship'}
                            </button>
                          )}
                          {so.status === 'SHIPPED' && (
                            <button
                              type="button"
                              className="bb-btn bb-btn-success bb-btn-sm"
                              disabled={updatingInlineSubOrder === so.subOrderNumber}
                              onClick={() => handleInlineStatusUpdate(so.subOrderNumber, 'DELIVERED')}
                              title="Mark this package as Delivered"
                            >
                              {updatingInlineSubOrder === so.subOrderNumber ? 'Delivering...' : '✓ Deliver'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="bb-btn bb-btn-outline bb-btn-sm"
                            onClick={() => handleOpenDetail(so.subOrderNumber)}
                          >
                            Manage ↗
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="bb-seller-pagination">
            <div className="bb-seller-pagination-info">
              Showing Page <strong>{meta.page}</strong> of <strong>{meta.totalPages}</strong> ({meta.total} packages)
            </div>
            <div className="bb-seller-pagination-controls">
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

              <div className="bb-seller-per-page-group">
                <label htmlFor="seller-per-page" className="bb-seller-per-page-label">
                  Per Page:
                </label>
                <select
                  id="seller-per-page"
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

              <div className="bb-seller-isolation-note">
                ⚡ Orders placed across multi-vendor checkouts are isolated to your shop items only.
              </div>

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

      {/* Detail Modal */}
      {selectedSubOrderNumber && (
        <div
          className="bb-seller-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseDetail();
          }}
          role="dialog"
          aria-modal="true"
          aria-label={`Sub-order details for ${selectedSubOrderNumber}`}
        >
          <div className="bb-seller-modal">
            {/* Modal Header */}
            <div className="bb-seller-modal-header">
              <div className="bb-seller-modal-title">
                <span>📦 Package:</span>
                <span className="bb-seller-modal-suborder-num">
                  {selectedSubOrderNumber}
                </span>
                {detailOrder && (
                  <span className={`bb-badge ${getSellerStatusBadgeClass(detailOrder.status)}`}>
                    {isSellerOrderUnpaid(detailOrder.status) ? '⏳ ' : ''}
                    {formatSellerOrderStatusLabel(detailOrder.status)}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="bb-seller-modal-close"
                onClick={handleCloseDetail}
                aria-label="Close detail modal"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="bb-seller-modal-body">
              {detailLoading && <LoadingSpinner />}

              {detailError && (
                <ErrorState
                  title="Failed to load sub-order details"
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
                  {isSellerOrderUnpaid(detailOrder.status) && (
                    <div className="bb-seller-unpaid-banner" role="alert">
                      <span className="bb-seller-unpaid-icon">⏳</span>
                      <div>
                        <strong>Awaiting Payment:</strong>
                        <p className="bb-seller-unpaid-text">
                          This sub-order is currently awaiting customer payment confirmation. In accordance with marketplace
                          fulfillment security rules, sellers cannot confirm, process, pack, ship, or deliver orders until
                          payment has been confirmed. Fulfillment actions will unlock automatically upon payment settlement.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Summary & Financial Breakdown */}
                  <div className="bb-seller-section">
                    <h3 className="bb-seller-section-title">💰 Financial & Payout Summary</h3>
                    <div className="bb-seller-grid-2">
                      <div>
                        <div className="bb-seller-field-label">
                          Parent Order Number
                        </div>
                        <div className="bb-seller-field-value-mono">
                          {detailOrder.parentOrderNumber}
                        </div>
                      </div>
                      <div>
                        <div className="bb-seller-field-label">
                          Net Seller Payable (Your Payout)
                        </div>
                        <div className="bb-seller-field-value-highlight">
                          {formatCurrency(detailOrder.netSellerPayable, detailOrder.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="bb-seller-field-label">
                          Package Subtotal
                        </div>
                        <div className="bb-seller-field-value">
                          {formatCurrency(detailOrder.subtotalAmount, detailOrder.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="bb-seller-field-label">
                          Platform Commission / Shipping
                        </div>
                        <div className="bb-seller-field-value">
                          {formatCurrency(detailOrder.commissionAmount, detailOrder.currency)} (Commission) + {formatCurrency(detailOrder.shippingFee, detailOrder.currency)} (Ship)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shipping / Delivery Destination Snapshot */}
                  <div className="bb-seller-section">
                    <h3 className="bb-seller-section-title">📍 Delivery Destination & Courier Details</h3>
                    {detailOrder.shippingAddress ? (
                      <div className="bb-seller-grid-2">
                        <div>
                          <div className="bb-seller-field-label">
                            Recipient Name
                          </div>
                          <div className="bb-seller-field-value">{detailOrder.shippingAddress.fullName}</div>
                        </div>
                        <div>
                          <div className="bb-seller-field-label">
                            Delivery Service Type
                          </div>
                          <div className="bb-seller-field-value">{detailOrder.deliveryType}</div>
                        </div>
                        <div className="bb-seller-address-full">
                          <div className="bb-seller-field-label">
                            Shipping Address
                          </div>
                          <div>
                            {detailOrder.shippingAddress.addressLine1}
                            {detailOrder.shippingAddress.addressLine2 ? `, ${detailOrder.shippingAddress.addressLine2}` : ''}
                            {detailOrder.shippingAddress.landmark ? ` (Near ${detailOrder.shippingAddress.landmark})` : ''}
                            , {detailOrder.shippingAddress.city}, {detailOrder.shippingAddress.state} -{' '}
                            <strong>{detailOrder.shippingAddress.postalCode}</strong>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="bb-seller-empty-note">
                        No physical address snapshot attached to this sub-order.
                      </p>
                    )}
                  </div>

                  {/* Order Line Items */}
                  <div className="bb-seller-section">
                    <h3 className="bb-seller-section-title">
                      🛍️ Package Items ({detailOrder.items.length})
                    </h3>
                    <table className="bb-seller-table bb-seller-modal-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>SKU</th>
                          <th>Quantity</th>
                          <th>Unit Price</th>
                          <th>Tax / GST</th>
                          <th>Total Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailOrder.items.map((it) => (
                          <tr key={it.id}>
                            <td>
                              <strong>{it.productTitle}</strong>
                              {it.attributes && Object.keys(it.attributes).length > 0 && (
                                <div className="bb-seller-item-attributes">
                                  {Object.entries(it.attributes)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(', ')}
                                </div>
                              )}
                            </td>
                            <td className="bb-seller-field-value-mono">{it.sku || 'N/A'}</td>
                            <td>{it.quantity}</td>
                            <td>{formatCurrency(it.unitPrice)}</td>
                            <td>{it.gstRate ? `${it.gstRate}%` : '0%'}</td>
                            <td className="bb-seller-field-value">{formatCurrency(it.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Status Progression Timeline */}
                  <div className="bb-seller-section">
                    <h3 className="bb-seller-section-title">⏱️ Status History & Dispatch Audit</h3>
                    {detailOrder.statusHistory.length > 0 ? (
                      <ul className="bb-seller-timeline-list">
                        {detailOrder.statusHistory.map((h, idx) => (
                          <li key={idx}>
                            <span className={`bb-badge ${getSellerStatusBadgeClass(h.status)}`}>
                              {h.status}
                            </span>{' '}
                            <span>
                              {new Date(h.createdAt).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {h.notes && <span className="bb-seller-timeline-notes"> — {h.notes}</span>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="bb-seller-empty-note">
                        No status transitions recorded yet for this sub-order.
                      </p>
                    )}
                  </div>

                  {/* Status Transition Action Box */}
                  <div className="bb-seller-action-box">
                    <div>
                      <h4 className="bb-seller-action-title">
                        📦 Update Package Status
                      </h4>
                      <p className="bb-seller-action-desc">
                        Update order status in sequential fulfillment order: Confirm → Processing → Packed → Shipped → Delivered.
                      </p>
                    </div>

                    {actionSuccess && (
                      <div className="bb-badge bb-badge-success bb-seller-action-badge">
                        ✓ {actionSuccess}
                      </div>
                    )}

                    {actionError && (
                      <div className="bb-badge bb-badge-danger bb-seller-action-badge">
                        ⚠️ {actionError}
                      </div>
                    )}

                    {isSellerOrderUnpaid(detailOrder.status) ? (
                      <div className="bb-seller-action-locked">
                        🔒 Fulfillment actions are locked while awaiting payment.
                      </div>
                    ) : getSellerAllowedTransitions(detailOrder.status).length > 0 ? (
                      <div>
                        {/* Quick Action One-Click Advance Buttons */}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-slate-700)' }}>
                            Quick Advance:
                          </span>
                          {(detailOrder.status === 'CONFIRMED' || detailOrder.status === 'PROCESSING') && (
                            <button
                              type="button"
                              className="bb-btn bb-btn-primary bb-btn-sm"
                              disabled={updatingStatus}
                              onClick={() => handleQuickUpdate('PACKED')}
                            >
                              {updatingStatus ? 'Updating...' : '📦 Mark as Packed'}
                            </button>
                          )}
                          {detailOrder.status === 'PACKED' && (
                            <button
                              type="button"
                              className="bb-btn bb-btn-primary bb-btn-sm"
                              disabled={updatingStatus}
                              onClick={() => handleQuickUpdate('SHIPPED')}
                            >
                              {updatingStatus ? 'Updating...' : '🚚 Mark as Shipped'}
                            </button>
                          )}
                          {detailOrder.status === 'SHIPPED' && (
                            <button
                              type="button"
                              className="bb-btn bb-btn-success bb-btn-sm"
                              disabled={updatingStatus}
                              onClick={() => handleQuickUpdate('DELIVERED')}
                            >
                              {updatingStatus ? 'Updating...' : '✓ Mark as Delivered'}
                            </button>
                          )}
                        </div>

                        {/* Custom status selector & dispatch notes */}
                        <div style={{ borderTop: '1px solid var(--color-slate-200)', paddingTop: '12px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-slate-500)', marginBottom: '8px' }}>
                            Or select custom transition & add fulfillment notes:
                          </div>
                          <form className="bb-seller-action-form" onSubmit={handleStatusUpdate}>
                        <div className="bb-seller-action-row">
                          <div className="bb-seller-action-field-status">
                            <label
                              htmlFor="seller-target-status"
                              className="bb-seller-action-field-label"
                            >
                              Next Status
                            </label>
                            <select
                              id="seller-target-status"
                              className="bb-filter-select bb-seller-action-input-full"
                              value={targetStatus}
                              onChange={(e) => setTargetStatus(e.target.value as SellerOrderStatus)}
                              disabled={updatingStatus}
                            >
                              {getSellerAllowedTransitions(detailOrder.status).map((st) => (
                                <option key={st} value={st}>
                                  {st} {st === 'CANCELLED' ? '(Cancel)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="bb-seller-action-field-notes">
                            <label
                              htmlFor="seller-status-notes"
                              className="bb-seller-action-field-label"
                            >
                              Fulfillment Notes / Tracking Info
                            </label>
                            <input
                              id="seller-status-notes"
                              type="text"
                              className="bb-filter-input bb-seller-action-input-full"
                              placeholder="e.g. Items verified and packed; Courier AWB ready"
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
                            {updatingStatus ? 'Updating...' : 'Update Status'}
                          </button>
                        </div>
                          </form>
                        </div>
                      </div>
                    ) : (
                      <div className="bb-seller-action-none">
                        This package is currently in status <strong>{detailOrder.status}</strong>. No further seller actions
                        are available.
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
