import { useState, useEffect, useRef } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import type { UserStatus } from '../types/index.ts';
import { adminUsersApi, type AdminUserItem, type AdminUserDetailResponse } from '../services/adminUsersApi.ts';
import { AdminNav } from '../components/admin/AdminNav.tsx';
import { EmptyState, LoadingSpinner } from '../components/common/StateViews.tsx';
import './AdminOrdersPage.css';

const TABS: Array<{ label: string; status?: UserStatus }> = [
  { label: 'All Customers' },
  { label: 'Active', status: 'ACTIVE' },
  { label: 'Pending Verification', status: 'PENDING_VERIFICATION' },
  { label: 'Suspended', status: 'SUSPENDED' },
  { label: 'Deactivated', status: 'DEACTIVATED' },
];

export function AdminCustomersPage() {
  const { authUser, authMode } = useMarketplace();

  // State
  const [activeTab, setActiveTab] = useState<string>('All Customers');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0,
    page: 1,
    limit: 15,
    totalPages: 1,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal State
  const [selectedUser, setSelectedUser] = useState<AdminUserDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
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

    adminUsersApi
      .getUsers({
        page,
        limit,
        role: 'CUSTOMER',
        status: statusParam,
        search: searchQuery.trim() || undefined,
      })
      .then((res) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        setUsers(res.data);
        setMeta(res.meta);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch customers from server';
        setError(msg);
        setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [authMode, authUser?.role, activeTab, page, limit, searchQuery, refreshTrigger]);

  const handleOpenCustomerDetails = async (userId: string) => {
    setDetailLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const details = await adminUsersApi.getUserById(userId);
      setSelectedUser(details);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load customer profile';
      alert(msg);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusChange = async (userId: string, targetStatus: UserStatus) => {
    setIsSubmittingAction(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await adminUsersApi.updateUserStatus(userId, {
        status: targetStatus,
      });

      setActionSuccess(res.message || `Customer status updated to ${targetStatus}`);
      setRefreshTrigger((c) => c + 1);

      // Refresh current details
      const updated = await adminUsersApi.getUserById(userId);
      setSelectedUser(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update customer status';
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const getUserStatusBadge = (status: UserStatus) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="bb-badge bb-badge-success">✓ Active</span>;
      case 'PENDING_VERIFICATION':
        return <span className="bb-badge bb-badge-warning">⏳ Pending Email</span>;
      case 'SUSPENDED':
        return <span className="bb-badge bb-badge-danger">🚫 Suspended</span>;
      case 'DEACTIVATED':
        return <span className="bb-badge bb-badge-neutral">Deactivated</span>;
      default:
        return <span className="bb-badge bb-badge-neutral">{status}</span>;
    }
  };

  return (
    <div className="bb-container bb-admin-orders-container">
      {/* Top Navigation */}
      <AdminNav activeModule="customers" />

      {/* Header Banner */}
      <div className="bb-admin-header">
        <div className="bb-admin-header-title-area">
          <div className="bb-admin-header-badge-row">
            <span className="bb-badge bb-badge-danger">🛡️ Administration</span>
            <span className="bb-badge bb-badge-neutral">Customer Management</span>
          </div>
          <h1 className="bb-admin-header-title">Customer Accounts & History</h1>
          <p className="bb-admin-header-desc">
            Supervise registered consumer accounts, inspect lifetime order activity, and enforce security suspensions.
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
            🔄 {loading ? 'Refreshing...' : 'Refresh Customers'}
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
            placeholder="Search customers by name, email, or mobile phone..."
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
      ) : users.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No Customers Found"
          description="No registered shopper accounts match the active filter or search query."
        />
      ) : (
        <div className="bb-card" style={{ padding: '0', overflowX: 'auto' }}>
          <table className="bb-admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-slate-50)', textAlign: 'left', borderBottom: '1px solid var(--color-slate-200)' }}>
                <th style={{ padding: '0.85rem 1rem' }}>Customer Name</th>
                <th style={{ padding: '0.85rem 1rem' }}>Email Address</th>
                <th style={{ padding: '0.85rem 1rem' }}>Phone</th>
                <th style={{ padding: '0.85rem 1rem' }}>Verification</th>
                <th style={{ padding: '0.85rem 1rem' }}>Status</th>
                <th style={{ padding: '0.85rem 1rem' }}>Registered</th>
                <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((cust) => (
                <tr key={cust.id} style={{ borderBottom: '1px solid var(--color-slate-100)' }}>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                    {cust.firstName} {cust.lastName}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--color-slate-700)' }}>
                    {cust.email}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--color-slate-600)', fontSize: '0.85rem' }}>
                    {cust.phone || 'Not provided'}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    {cust.isEmailVerified ? (
                      <span className="bb-badge bb-badge-success" style={{ fontSize: '0.75rem' }}>✓ Email Verified</span>
                    ) : (
                      <span className="bb-badge bb-badge-warning" style={{ fontSize: '0.75rem' }}>Unverified</span>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    {getUserStatusBadge(cust.status)}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: 'var(--color-slate-500)' }}>
                    {new Date(cust.createdAt).toLocaleDateString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="bb-btn bb-btn-outline bb-btn-sm"
                      onClick={() => handleOpenCustomerDetails(cust.id)}
                      disabled={detailLoading}
                    >
                      View Profile →
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

      {/* Customer Detail Drawer / Modal */}
      {selectedUser && (
        <div className="bb-modal-overlay" onClick={() => !isSubmittingAction && setSelectedUser(null)}>
          <div className="bb-modal-card" style={{ maxWidth: '640px' }} onClick={(e) => e.stopPropagation()}>
            <div className="bb-modal-header">
              <h3 className="bb-modal-title">👤 Customer Profile: {selectedUser.firstName} {selectedUser.lastName}</h3>
              <button
                type="button"
                className="bb-modal-close"
                onClick={() => !isSubmittingAction && setSelectedUser(null)}
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

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ background: '#eff6ff', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e40af' }}>{selectedUser.stats.totalOrders}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Orders</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#334155' }}>{selectedUser.stats.totalAddresses}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Saved Addresses</div>
                </div>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#334155' }}>{selectedUser.stats.activeOrTotalSessions}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Active Sessions</div>
                </div>
              </div>

              {/* Info Details */}
              <div style={{ background: 'var(--color-slate-50)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.2rem' }}>Email: <strong>{selectedUser.email}</strong></div>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.2rem' }}>Phone: <strong>{selectedUser.phone || 'None'}</strong></div>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.2rem' }}>Status: {getUserStatusBadge(selectedUser.status)}</div>
                <div style={{ fontSize: '0.85rem' }}>Account ID: <code style={{ fontSize: '0.75rem' }}>{selectedUser.id}</code></div>
              </div>

              {/* Recent Orders History */}
              <div style={{ marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--color-slate-800)' }}>
                  Recent Orders ({selectedUser.recentOrders?.length || 0})
                </h4>
                {!selectedUser.recentOrders || selectedUser.recentOrders.length === 0 ? (
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', fontStyle: 'italic' }}>
                    No orders placed yet by this customer.
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--color-slate-200)', borderRadius: '6px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-slate-100)', textAlign: 'left' }}>
                          <th style={{ padding: '6px 10px' }}>Order #</th>
                          <th style={{ padding: '6px 10px' }}>Amount</th>
                          <th style={{ padding: '6px 10px' }}>Status</th>
                          <th style={{ padding: '6px 10px' }}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUser.recentOrders.map((ord) => (
                          <tr key={ord.id} style={{ borderTop: '1px solid var(--color-slate-100)' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{ord.orderNumber}</td>
                            <td style={{ padding: '6px 10px' }}>₹{ord.totalAmount.toLocaleString('en-IN')}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <span className="bb-badge bb-badge-neutral" style={{ fontSize: '0.7rem' }}>{ord.status}</span>
                            </td>
                            <td style={{ padding: '6px 10px', color: 'var(--color-slate-500)' }}>
                              {new Date(ord.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Status Action Buttons */}
              <div style={{ borderTop: '1px solid var(--color-slate-200)', paddingTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {selectedUser.status !== 'ACTIVE' && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-primary"
                    disabled={isSubmittingAction}
                    onClick={() => handleStatusChange(selectedUser.id, 'ACTIVE')}
                  >
                    ✓ Activate Customer Account
                  </button>
                )}

                {selectedUser.status !== 'SUSPENDED' && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-outline"
                    style={{ color: '#b91c1c', borderColor: '#fca5a5' }}
                    disabled={isSubmittingAction}
                    onClick={() => handleStatusChange(selectedUser.id, 'SUSPENDED')}
                  >
                    🚫 Suspend Account (Revoke Sessions)
                  </button>
                )}

                {selectedUser.status !== 'DEACTIVATED' && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-ghost bb-btn-sm"
                    disabled={isSubmittingAction}
                    onClick={() => handleStatusChange(selectedUser.id, 'DEACTIVATED')}
                  >
                    Deactivate Account
                  </button>
                )}
              </div>
            </div>

            <div className="bb-modal-footer">
              <button
                type="button"
                className="bb-btn bb-btn-secondary"
                disabled={isSubmittingAction}
                onClick={() => setSelectedUser(null)}
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
