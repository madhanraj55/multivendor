import { useState, useEffect } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import {
  adminDashboardApi,
  type AdminDashboardSummaryResponse,
} from '../services/adminDashboardApi.ts';
import { AdminNav } from '../components/admin/AdminNav.tsx';
import { pricingApi, type PricingSettings } from '../services/pricingApi.ts';
import { EmptyState, LoadingSpinner } from '../components/common/StateViews.tsx';
import './AdminOrdersPage.css';

export function AdminDashboardPage() {
  const { authUser, authMode } = useMarketplace();
  const { navigate } = useRouter();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminDashboardSummaryResponse | null>(null);
  const [_pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null);
  const [commRate, setCommRate] = useState<string>('10');
  const [platformFeeInput, setPlatformFeeInput] = useState<string>('3');
  const [pricingSaving, setPricingSaving] = useState<boolean>(false);
  const [pricingNotice, setPricingNotice] = useState<string | null>(null);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await adminDashboardApi.getSummary();
      setData(res);
      try {
        const pSettings = await pricingApi.getAdminPricingSettings();
        setPricingSettings(pSettings);
        setCommRate(String(pSettings.globalCommissionPercentage));
        setPlatformFeeInput(String(pSettings.platformFee));
      } catch (pErr) {
        console.warn('Failed to load pricing settings:', pErr);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard overview';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authMode === 'AUTHENTICATED' && authUser?.role === 'ADMIN') {
      fetchSummary();
    }
  }, [authMode, authUser?.role]);

  // Format currency in Indian Rupees
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Format dates cleanly
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPricingSaving(true);
    setPricingNotice(null);
    try {
      const updated = await pricingApi.updateAdminPricingSettings({
        globalCommissionPercentage: parseFloat(commRate) || 0,
        platformFee: parseFloat(platformFeeInput) || 0,
      });
      setPricingSettings(updated);
      setPricingNotice('✓ BharatBazaar pricing rules saved successfully. Effective immediately for new checkouts.');
    } catch (err: unknown) {
      setPricingNotice('Failed to update pricing settings: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPricingSaving(false);
    }
  };

  return (
    <div className="bb-container bb-admin-orders-container">
      <AdminNav activeModule="dashboard" />

      {/* Header Banner */}
      <div className="bb-admin-header">
        <div className="bb-admin-header-title-area">
          <div className="bb-admin-header-badge-row">
            <span className="bb-badge bb-badge-danger">🛡️ System Administration</span>
            <span className="bb-badge bb-badge-neutral">{authUser?.email}</span>
          </div>
          <h1 className="bb-admin-header-title">Platform Operations Dashboard</h1>
          <p className="bb-admin-header-desc">
            Real-time multi-vendor metrics, revenue aggregation from verified transactions, order volume, and pending merchant onboarding queues.
          </p>
        </div>
        <div className="bb-admin-header-actions">
          <button
            type="button"
            className="bb-btn bb-btn-outline"
            onClick={fetchSummary}
            disabled={loading}
          >
            🔄 Refresh Metrics
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="bb-admin-loading-container" style={{ padding: '60px 0', textAlign: 'center' }}>
          <LoadingSpinner />
          <p style={{ marginTop: '16px', color: '#64748b' }}>Aggregating live platform metrics from database...</p>
        </div>
      ) : error ? (
        <EmptyState
          icon="⚠️"
          title="Could Not Retrieve Dashboard Overview"
          description={error}
          actionText="Retry Loading"
          onAction={fetchSummary}
        />
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Key Metric Stat Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}>
            {/* Real Revenue */}
            <div className="bb-detail-card" style={{ borderLeft: '4px solid #10b981', background: '#ffffff', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Completed Revenue
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0' }}>
                {formatCurrency(data.metrics.completedRevenue)}
              </div>
              <div style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>
                From {data.metrics.paidOrdersCount} paid/confirmed orders
              </div>
            </div>

            {/* Total Orders */}
            <div className="bb-detail-card" style={{ borderLeft: '4px solid #3b82f6', background: '#ffffff', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Orders Placed
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0' }}>
                {data.metrics.totalOrders}
              </div>
              <div style={{ fontSize: '13px', color: '#3b82f6', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/admin/orders')}>
                Manage marketplace orders →
              </div>
            </div>

            {/* Pending Approvals */}
            <div className="bb-detail-card" style={{ borderLeft: '4px solid #f59e0b', background: '#ffffff', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pending Seller Approvals
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: data.metrics.pendingShops > 0 ? '#b45309' : '#0f172a', margin: '8px 0' }}>
                {data.metrics.pendingShops}
              </div>
              <div style={{ fontSize: '13px', color: '#f59e0b', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/admin/sellers')}>
                {data.metrics.pendingShops > 0 ? 'Action required in review queue →' : 'All applications processed'}
              </div>
            </div>

            {/* Total Sellers */}
            <div className="bb-detail-card" style={{ borderLeft: '4px solid #8b5cf6', background: '#ffffff', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Sellers & Shops
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0' }}>
                {data.metrics.totalShops}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{data.metrics.approvedShops} approved</span> · {data.metrics.suspendedShops} suspended
              </div>
            </div>

            {/* Total Customers */}
            <div className="bb-detail-card" style={{ borderLeft: '4px solid #06b6d4', background: '#ffffff', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Registered Customers
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0' }}>
                {data.metrics.totalCustomers}
              </div>
              <div style={{ fontSize: '13px', color: '#06b6d4', fontWeight: 600, cursor: 'pointer' }} onClick={() => navigate('/admin/customers')}>
                View customer accounts →
              </div>
            </div>

            {/* Total Products */}
            <div className="bb-detail-card" style={{ borderLeft: '4px solid #ec4899', background: '#ffffff', padding: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Catalogue Products
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', margin: '8px 0' }}>
                {data.metrics.totalProducts}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{data.metrics.publishedProducts} published</span> across shops
              </div>
            </div>
          </div>

          {/* Pending Seller Approvals Queue */}
          <div className="bb-detail-card" style={{ background: '#ffffff', padding: '24px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  ⏳ Pending Merchant Approvals
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Merchant shops awaiting identity verification and catalog privileges.
                </p>
              </div>
              <button
                type="button"
                className="bb-btn bb-btn-sm bb-btn-outline"
                onClick={() => navigate('/admin/sellers')}
              >
                View All Sellers ({data.metrics.totalShops}) →
              </button>
            </div>

            {data.pendingShops.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '6px' }}>
                <span style={{ fontSize: '28px' }}>✅</span>
                <p style={{ margin: '8px 0 0', fontWeight: 600, color: '#334155' }}>
                  No pending seller applications
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  All registered sellers have been approved or reviewed.
                </p>
              </div>
            ) : (
              <div className="bb-table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th>Shop Details</th>
                      <th>Merchant</th>
                      <th>Applied On</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendingShops.map((shop) => (
                      <tr key={shop.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{shop.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>slug: {shop.slug}</div>
                        </td>
                        <td>
                          {(() => {
                            const merchant = shop.seller || shop.user;
                            return (
                              <>
                                <div style={{ fontWeight: 500, color: '#334155' }}>
                                  {merchant ? `${merchant.firstName || ''} ${merchant.lastName || ''}`.trim() || 'Vendor' : 'Vendor'}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{merchant?.email}</div>
                              </>
                            );
                          })()}
                        </td>
                        <td style={{ fontSize: '13px', color: '#475569' }}>
                          {formatDate(shop.createdAt)}
                        </td>
                        <td>
                          <span className="bb-badge bb-badge-warning">PENDING REVIEW</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="bb-btn bb-btn-sm bb-btn-primary"
                            onClick={() => navigate('/admin/sellers')}
                          >
                            Review Shop →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* BharatBazaar Platform Pricing & Delivery Rules Configuration */}
          <div className="bb-detail-card" style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                  ⚙️ BharatBazaar Pricing Model & Commission Controls
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Configure global seller commission, distance delivery rules, and platform fees. Stored snapshots ensure past orders remain immutable.
                </p>
              </div>
              <span className="bb-badge bb-badge-primary">Admin Control</span>
            </div>

            {pricingNotice && (
              <div
                style={{
                  padding: '10px 14px',
                  marginBottom: '16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  background: pricingNotice.startsWith('✓') ? '#ecfdf5' : '#fef2f2',
                  color: pricingNotice.startsWith('✓') ? '#047857' : '#b91c1c',
                  border: `1px solid ${pricingNotice.startsWith('✓') ? '#a7f3d0' : '#fecaca'}`,
                }}
              >
                {pricingNotice}
              </div>
            )}

            <form onSubmit={handleSavePricing}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                <div className="bb-form-group">
                  <label className="bb-label" style={{ fontWeight: 600, color: '#1e293b' }}>
                    Global Seller Commission (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    className="bb-input"
                    value={commRate}
                    onChange={(e) => setCommRate(e.target.value)}
                    required
                  />
                  <span className="bb-form-hint" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Added to seller base price: Customer Price = Base + (Base × Commission%)
                  </span>
                </div>

                <div className="bb-form-group">
                  <label className="bb-label" style={{ fontWeight: 600, color: '#1e293b' }}>
                    Fixed Platform Fee per Order (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="bb-input"
                    value={platformFeeInput}
                    onChange={(e) => setPlatformFeeInput(e.target.value)}
                    required
                  />
                  <span className="bb-form-hint" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                    Default ₹3. Charged exactly once per order across all vendor packages.
                  </span>
                </div>
              </div>

              {/* Delivery Tiers Overview */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px', color: '#334155' }}>
                  🚚 Configured Distance Delivery Tiers (per seller package)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', fontSize: '12px' }}>
                  <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>0 - 5 km (Local)</div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>₹30</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>5 - 25 km</div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>₹50</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>25 - 100 km</div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>₹80</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>100 - 500 km</div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>₹120</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                    <div style={{ color: '#64748b' }}>&gt; 500 km (National)</div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px' }}>₹160</div>
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b' }}>
                  * Coordinates calculate great-circle distance via Haversine. If seller/customer coordinates are unconfigured, fallback rules apply: Local: ₹40, Regional: ₹70, National: ₹110.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="submit"
                  className="bb-btn bb-btn-primary"
                  disabled={pricingSaving}
                >
                  {pricingSaving ? 'Saving Settings...' : 'Save Pricing Rules'}
                </button>
              </div>
            </form>
          </div>

          {/* Recent Orders Overview */}
          <div className="bb-detail-card" style={{ background: '#ffffff', padding: '24px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                   Recent Customer Orders
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Latest orders placed across the BharatBazaar multi-vendor platform.
                </p>
              </div>
              <button
                type="button"
                className="bb-btn bb-btn-sm bb-btn-outline"
                onClick={() => navigate('/admin/orders')}
              >
                View Full Orders Console ({data.metrics.totalOrders}) →
              </button>
            </div>

            {data.recentOrders.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '6px' }}>
                <span style={{ fontSize: '28px' }}>🛒</span>
                <p style={{ margin: '8px 0 0', fontWeight: 600, color: '#334155' }}>
                  No customer orders placed yet
                </p>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Orders placed by customers will automatically appear here in real time.
                </p>
              </div>
            ) : (
              <div className="bb-table-wrapper" style={{ border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table className="bb-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Customer</th>
                      <th>Placed At</th>
                      <th>Status</th>
                      <th>Total Amount</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentOrders.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                            {order.orderNumber}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 500, color: '#334155' }}>
                            {order.customer ? `${order.customer.firstName || ''} ${order.customer.lastName || ''}`.trim() || 'Customer' : 'Customer'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            {order.customer?.email}
                          </div>
                        </td>
                        <td style={{ fontSize: '13px', color: '#475569' }}>
                          {formatDate(order.createdAt)}
                        </td>
                        <td>
                          <span className={`bb-badge ${
                            order.status === 'DELIVERED'
                              ? 'bb-badge-success'
                              : order.status === 'CANCELLED'
                              ? 'bb-badge-danger'
                              : order.status === 'PENDING_PAYMENT'
                              ? 'bb-badge-neutral'
                              : 'bb-badge-info'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#0f172a' }}>
                          {formatCurrency(Number(order.totalAmount))}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="bb-btn bb-btn-sm bb-btn-outline"
                            onClick={() => navigate('/admin/orders')}
                          >
                            Inspect →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
