import { useState, useEffect, useRef } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import type { ShopStatus } from '../types/index.ts';
import { adminShopsApi, type AdminShopItem } from '../services/adminShopsApi.ts';
import { AdminNav } from '../components/admin/AdminNav.tsx';
import { EmptyState, LoadingSpinner } from '../components/common/StateViews.tsx';
import './AdminOrdersPage.css';

const TABS: Array<{ label: string; status?: ShopStatus }> = [
  { label: 'All Shops' },
  { label: 'Pending Review', status: 'PENDING_APPROVAL' },
  { label: 'Approved & Active', status: 'APPROVED' },
  { label: 'Suspended', status: 'SUSPENDED' },
  { label: 'Rejected', status: 'REJECTED' },
];

export function AdminSellersPage() {
  const { authUser, authMode } = useMarketplace();

  // State
  const [activeTab, setActiveTab] = useState<string>('All Shops');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const [shops, setShops] = useState<AdminShopItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0,
    page: 1,
    limit: 15,
    totalPages: 1,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal State
  const [selectedShop, setSelectedShop] = useState<AdminShopItem | null>(null);
  const [actionReason, setActionReason] = useState<string>('');
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const requestSeqRef = useRef<number>(0);

  useEffect(() => {
    if (authMode !== 'AUTHENTICATED' || authUser?.role !== 'ADMIN') {
      return;
    }

    const currentSeq = ++requestSeqRef.current;
    let isSubscribed = true;
    setLoading(true);

    const selectedTabConfig = TABS.find((t) => t.label === activeTab);
    const statusParam = selectedTabConfig?.status;

    adminShopsApi
      .getShops({
        page,
        limit,
        status: statusParam,
        search: searchQuery.trim() || undefined,
      })
      .then((res) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        setShops(res.data);
        setMeta(res.meta);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch sellers from server';
        setError(msg);
        setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [authMode, authUser?.role, activeTab, page, limit, searchQuery, refreshTrigger]);

  const handleStatusChange = async (shopId: string, targetStatus: ShopStatus) => {
    if (targetStatus === 'REJECTED' && !actionReason.trim()) {
      setActionError('A rejection reason is required.');
      return;
    }

    setIsSubmittingAction(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await adminShopsApi.updateShopStatus(shopId, {
        status: targetStatus,
        reason: actionReason.trim() || undefined,
      });

      setActionSuccess(res.message || `Shop status updated to ${targetStatus}`);
      setRefreshTrigger((c) => c + 1);
      setTimeout(() => {
        setSelectedShop(null);
        setActionReason('');
        setActionSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update shop status';
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const getStatusBadge = (status: ShopStatus) => {
    switch (status) {
      case 'APPROVED':
        return <span className="bb-badge bb-badge-success">✓ Approved</span>;
      case 'PENDING_APPROVAL':
        return <span className="bb-badge bb-badge-warning">⏳ Pending Approval</span>;
      case 'SUSPENDED':
        return <span className="bb-badge bb-badge-danger">🚫 Suspended</span>;
      case 'REJECTED':
        return <span className="bb-badge bb-badge-danger">✕ Rejected</span>;
      default:
        return <span className="bb-badge bb-badge-neutral">{status}</span>;
    }
  };

  return (
    <div className="bb-container bb-admin-orders-container">
      {/* Top Navigation */}
      <AdminNav activeModule="sellers" />

      {/* Header Banner */}
      <div className="bb-admin-header">
        <div className="bb-admin-header-title-area">
          <div className="bb-admin-header-badge-row">
            <span className="bb-badge bb-badge-danger">🛡️ Administration</span>
            <span className="bb-badge bb-badge-neutral">Seller Management</span>
          </div>
          <h1 className="bb-admin-header-title">Merchant Shops & Verification</h1>
          <p className="bb-admin-header-desc">
            Review vendor applications, verify GSTIN/PAN legal identifiers, and manage store operational status.
          </p>
        </div>
        <div className="bb-admin-header-actions">
          <button
            type="button"
            className="bb-btn bb-btn-outline"
            style={{ color: 'var(--color-white)', borderColor: 'var(--color-slate-600)' }}
            onClick={() => setRefreshTrigger((c) => c + 1)}
            disabled={loading}
          >
            🔄 {loading ? 'Refreshing...' : 'Refresh Sellers'}
          </button>
        </div>
      </div>

      {/* Tabs */}
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
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="bb-card" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="text"
            className="bb-input"
            placeholder="Search sellers by store name, slug, email, or owner name..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className="bb-btn bb-btn-secondary bb-btn-sm"
              onClick={() => {
                setSearchQuery('');
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="bb-badge bb-badge-danger bb-btn-block" style={{ padding: '1rem', fontSize: '0.9rem' }}>
          ⚠️ {error}
        </div>
      ) : shops.length === 0 ? (
        <EmptyState
          icon="🏬"
          title="No Merchant Shops Found"
          description="No seller shops match the active filter or search query."
        />
      ) : (
        <div className="bb-card" style={{ padding: '0', overflowX: 'auto' }}>
          <table className="bb-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-slate-50)', textAlign: 'left', borderBottom: '1px solid var(--color-slate-200)' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Shop Name & Slug</th>
                <th style={{ padding: '0.85rem 1rem' }}>Seller Contact</th>
                <th style={{ padding: '0.85rem 1rem' }}>Identifiers</th>
                <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                <th style={{ padding: '0.85rem 1rem' }}>Joined</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shops.map((shop) => (
                <tr key={shop.id} style={{ borderBottom: '1px solid var(--color-slate-100)' }}>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-slate-900)' }}>{shop.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>/{shop.slug}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div>{shop.seller?.fullName || shop.seller?.email || 'N/A'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)' }}>{shop.seller?.email}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem' }}>
                    <div>GST: <strong>{shop.gstin || 'None'}</strong></div>
                    <div>PAN: <strong>{shop.pan || 'None'}</strong></div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    {getStatusBadge(shop.status)}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--color-slate-500)' }}>
                    {new Date(shop.createdAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="bb-btn bb-btn-outline bb-btn-sm"
                      onClick={() => {
                        setSelectedShop(shop);
                        setActionReason('');
                        setActionError(null);
                        setActionSuccess(null);
                      }}
                    >
                      Manage Store →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            className="bb-btn bb-btn-secondary bb-btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Previous
          </button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', fontSize: '0.85rem' }}>
            Page {meta.page} of {meta.totalPages} ({meta.total} Total)
          </span>
          <button
            type="button"
            className="bb-btn bb-btn-secondary bb-btn-sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
          >
            Next →
          </button>
        </div>
      )}

      {/* Seller Detail & Approval Modal */}
      {selectedShop && (
        <div className="bb-modal-overlay" onClick={() => !isSubmittingAction && setSelectedShop(null)}>
          <div className="bb-modal-card" style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
            <div className="bb-modal-header">
              <h3 className="bb-modal-title">🏬 Merchant Review: {selectedShop.name}</h3>
              <button
                type="button"
                className="bb-modal-close"
                onClick={() => !isSubmittingAction && setSelectedShop(null)}
              >
                ✕
              </button>
            </div>

            <div className="bb-modal-body">
              {actionError && (
                <div className="bb-badge bb-badge-danger bb-btn-block" style={{ marginBottom: '1rem', padding: '0.6rem' }}>
                  ⚠️ {actionError}
                </div>
              )}

              {actionSuccess && (
                <div className="bb-badge bb-badge-success bb-btn-block" style={{ marginBottom: '1rem', padding: '0.6rem' }}>
                  ✓ {actionSuccess}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', fontWeight: 600 }}>STORE STATUS</label>
                  <div>{getStatusBadge(selectedShop.status)}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-slate-500)', fontWeight: 600 }}>SLUG</label>
                  <div>/{selectedShop.slug}</div>
                </div>
              </div>

              <div style={{ background: 'var(--color-slate-50)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Seller Contact</div>
                <div style={{ fontSize: '0.85rem' }}>Name: {selectedShop.seller?.fullName || 'N/A'}</div>
                <div style={{ fontSize: '0.85rem' }}>Email: {selectedShop.seller?.email}</div>
                <div style={{ fontSize: '0.85rem' }}>Phone: {selectedShop.seller?.phone || 'Not provided'}</div>
              </div>

              <div style={{ background: 'var(--color-slate-50)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Tax & Legal Identifiers</div>
                <div style={{ fontSize: '0.85rem' }}>GSTIN: <strong>{selectedShop.gstin || 'Not registered'}</strong></div>
                <div style={{ fontSize: '0.85rem' }}>PAN: <strong>{selectedShop.pan || 'Not registered'}</strong></div>
                {selectedShop.fssaiNumber && (
                  <div style={{ fontSize: '0.85rem' }}>FSSAI: <strong>{selectedShop.fssaiNumber}</strong></div>
                )}
              </div>

              {selectedShop.rejectionReason && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#b91c1c' }}>Previous Rejection Reason:</div>
                  <div style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>{selectedShop.rejectionReason}</div>
                </div>
              )}

              {/* Action input */}
              <div className="bb-form-group">
                <label className="bb-label">Reason / Administrative Notes</label>
                <input
                  type="text"
                  className="bb-input"
                  placeholder="Required if rejecting or suspending this shop..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                />
              </div>

              {/* Administrative Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
                {selectedShop.status !== 'APPROVED' && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-primary"
                    disabled={isSubmittingAction}
                    onClick={() => handleStatusChange(selectedShop.id, 'APPROVED')}
                  >
                    ✓ Approve Shop
                  </button>
                )}

                {selectedShop.status !== 'REJECTED' && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-secondary"
                    disabled={isSubmittingAction}
                    onClick={() => handleStatusChange(selectedShop.id, 'REJECTED')}
                  >
                    ✕ Reject Shop
                  </button>
                )}

                {selectedShop.status !== 'SUSPENDED' && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-outline"
                    style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                    disabled={isSubmittingAction}
                    onClick={() => handleStatusChange(selectedShop.id, 'SUSPENDED')}
                  >
                    🚫 Suspend Shop
                  </button>
                )}
              </div>
            </div>

            <div className="bb-modal-footer">
              <button
                type="button"
                className="bb-btn bb-btn-secondary"
                disabled={isSubmittingAction}
                onClick={() => setSelectedShop(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
