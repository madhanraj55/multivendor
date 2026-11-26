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
  const { navigate, queryParams } = useRouter();
  const activeSection = queryParams.section;
  const activeNavModule =
    activeSection === 'pricing'
      ? 'pricing'
      : activeSection === 'recent-orders'
      ? 'recent-orders'
      : 'dashboard';

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminDashboardSummaryResponse | null>(null);
  const [_pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null);
  const [commRate, setCommRate] = useState<string>('15');
  const [platformFeeEnabled, setPlatformFeeEnabled] = useState<boolean>(true);
  const [platformFeeInput, setPlatformFeeInput] = useState<string>('3');
  const [deliveryChargeEnabled, setDeliveryChargeEnabled] = useState<boolean>(true);
  const [flatDeliveryFeeInput, setFlatDeliveryFeeInput] = useState<string>('40');
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
        setPlatformFeeEnabled(pSettings.platformFeeEnabled ?? true);
        setPlatformFeeInput(String(pSettings.platformFee));
        setDeliveryChargeEnabled(pSettings.deliveryChargeEnabled ?? true);
        setFlatDeliveryFeeInput(String(pSettings.flatDeliveryFee ?? 40));
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

  useEffect(() => {
    if (!loading && activeSection) {
      const targetId =
        activeSection === 'pricing'
          ? 'admin-pricing-section'
          : activeSection === 'recent-orders'
          ? 'admin-recent-orders-section'
          : null;
      if (targetId) {
        setTimeout(() => {
          document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    }
  }, [loading, activeSection]);

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
        platformFeeEnabled,
        platformFee: parseFloat(platformFeeInput) || 0,
        deliveryChargeEnabled,
        flatDeliveryFee: Math.max(0, parseFloat(flatDeliveryFeeInput) || 0),
      });
      setPricingSettings(updated);
      setPricingNotice('✓ BharatBazaar pricing & delivery settings saved successfully. Effective immediately for new orders.');
    } catch (err: unknown) {
      setPricingNotice('Failed to update pricing settings: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPricingSaving(false);
    }
  };

  return (
    <div className="bb-container bb-admin-orders-container">
      <AdminNav activeModule={activeNavModule} />

      {/* Header Banner */}
      <div className="bb-admin-header">
        <div className="bb-admin-header-title-area">
          <div className="bb-admin-header-badge-row">
            <span className="bb-badge bb-badge-danger">🛡️ System Administration</span>
            <span className="bb-badge bb-badge-neutral">{authUser?.email}</span>
          </div>
          <h1 className="bb-admin-header-title">Platform Operations Dashboard</h1>
          <p className="bb-admin-header-desc">
            Real-time vendor metrics, revenue aggregation from verified transactions, order volume, and pending merchant onboarding queues.
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
          <div id="admin-pricing-section" className="bb-detail-card" style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0', scrollMarginTop: '110px' }}>
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
              {/* Core Controls Table: Platform Fee Toggle + Amount, Commission %, Delivery Toggle */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
                <table className="bb-table" style={{ margin: 0 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ width: '28%' }}>Setting</th>
                      <th style={{ width: '22%' }}>Status / Mode</th>
                      <th style={{ width: '50%' }}>Value / Configuration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 1. Platform Fee ON/OFF + Amount */}
                    <tr>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>Platform Fee</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Charged once per order across all vendor packages</div>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setPlatformFeeEnabled((prev) => !prev)}
                          aria-pressed={platformFeeEnabled}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            border: `1px solid ${platformFeeEnabled ? '#16a34a' : '#cbd5e1'}`,
                            background: platformFeeEnabled ? '#dcfce7' : '#f1f5f9',
                            color: platformFeeEnabled ? '#15803d' : '#475569',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: platformFeeEnabled ? '#16a34a' : '#94a3b8',
                            }}
                          />
                          {platformFeeEnabled ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: '#334155' }}>₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className="bb-input"
                            style={{ maxWidth: '160px', opacity: platformFeeEnabled ? 1 : 0.5 }}
                            value={platformFeeInput}
                            onChange={(e) => setPlatformFeeInput(e.target.value)}
                            disabled={!platformFeeEnabled}
                            required
                          />
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {platformFeeEnabled ? `Active: ₹${platformFeeInput || 0} per order` : 'Waived (₹0 charged)'}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* 2. Seller Commission Rate (%) */}
                    <tr>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>Seller Commission Rate</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Set percentage added per order</div>
                      </td>
                      <td>
                        <span className="bb-badge bb-badge-primary">ACTIVE</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            className="bb-input"
                            style={{ maxWidth: '160px' }}
                            value={commRate}
                            onChange={(e) => setCommRate(e.target.value)}
                            required
                          />
                          <span style={{ fontWeight: 600, color: '#334155' }}>%</span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            Customer Price = Base + {commRate || 0}%
                          </span>
                        </div>
                      </td>
                    </tr>

                    {/* 3. Delivery Charge ON/OFF + Flat Amount (₹) */}
                    <tr>
                      <td>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>Delivery Charge</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>Flat delivery fee per seller package</div>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setDeliveryChargeEnabled((prev) => !prev)}
                          aria-pressed={deliveryChargeEnabled}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 12px',
                            borderRadius: '999px',
                            border: `1px solid ${deliveryChargeEnabled ? '#16a34a' : '#cbd5e1'}`,
                            background: deliveryChargeEnabled ? '#dcfce7' : '#f1f5f9',
                            color: deliveryChargeEnabled ? '#15803d' : '#475569',
                            fontWeight: 700,
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: deliveryChargeEnabled ? '#16a34a' : '#94a3b8',
                            }}
                          />
                          {deliveryChargeEnabled ? 'ON' : 'OFF'}
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: '#334155' }}>₹</span>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            className="bb-input"
                            style={{ maxWidth: '160px', opacity: deliveryChargeEnabled ? 1 : 0.5 }}
                            value={flatDeliveryFeeInput}
                            onChange={(e) => setFlatDeliveryFeeInput(e.target.value)}
                            disabled={!deliveryChargeEnabled}
                            required
                          />
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {deliveryChargeEnabled
                              ? `Active: ₹${flatDeliveryFeeInput || 0} delivery charge`
                              : 'Free Delivery (₹0 charged)'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="submit"
                  className="bb-btn bb-btn-primary"
                  disabled={pricingSaving}
                >
                  {pricingSaving ? 'Saving Settings...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>

          {/* Recent Orders Overview */}
          <div id="admin-recent-orders-section" className="bb-detail-card" style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', scrollMarginTop: '110px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                   Recent Customer Orders
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Latest orders placed across the BharatBazaar vendor platform.
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
