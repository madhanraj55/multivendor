import { useState, type FormEvent } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import './AccountProfilePage.css';

export function AccountProfilePage() {
  const { user, authMode, authUser, updateUserProfile, logout } = useMarketplace();
  const { navigate } = useRouter();

  const [fullName, setFullName] = useState(user?.fullName || 'Ananya Sharma');
  const [email, setEmail] = useState(user?.email || 'ananya.sharma@example.in');
  const [phone, setPhone] = useState(user?.phone || '+91 98765 43210');
  const [gender, setGender] = useState(user?.gender || 'Female');
  const [dateOfBirth, setDateOfBirth] = useState(user?.dateOfBirth || '1995-08-14');
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setIsSaving(true);
    try {
      await updateUserProfile({
        fullName,
        email,
        phone,
        gender,
        dateOfBirth,
      });
      setIsSavedToast(true);
      setTimeout(() => setIsSavedToast(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      setProfileError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const initials = fullName
    ? fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    : 'U';

  return (
    <div className="bb-container bb-account-container">
      <div className="bb-account-header">
        <h1 className="bb-plp-title">Customer Account</h1>
        <p className="bb-section-subtitle">
          Manage your personal details, saved shipping addresses, and security settings
        </p>
      </div>

      <div className="bb-account-layout">
        {/* Navigation Sidebar */}
        <aside className="bb-account-sidebar">
          <div className="bb-account-user-card">
            <div className="bb-account-avatar">{initials}</div>
            <div className="bb-account-user-meta">
              <div className="bb-account-user-name">{fullName}</div>
              <div className="bb-account-user-phone">{phone || 'No phone set'}</div>
            </div>
          </div>

          <nav className="bb-account-nav-list" aria-label="Customer account navigation">
            <button
              type="button"
              className="bb-account-nav-item active"
              onClick={() => navigate('/profile')}
            >
              <span className="bb-account-nav-icon">👤</span>
              Profile
            </button>
            <button
              type="button"
              className="bb-account-nav-item"
              onClick={() => navigate('/addresses')}
            >
              <span className="bb-account-nav-icon">📍</span>
              Manage Addresses
            </button>
            {authUser?.role === 'ADMIN' && (
              <button
                type="button"
                className="bb-account-nav-item"
                style={{ backgroundColor: '#fff7ed', color: '#c2410c', fontWeight: 'bold' }}
                onClick={() => navigate('/admin/orders')}
              >
                <span className="bb-account-nav-icon">🛡️</span>
                Admin Orders Dashboard
              </button>
            )}
            {authUser?.role === 'SELLER' && (
              <>
                <button
                  type="button"
                  className="bb-account-nav-item"
                  style={{ backgroundColor: '#f0fdf4', color: '#166534', fontWeight: 'bold' }}
                  onClick={() => navigate('/seller/products')}
                >
                  <span className="bb-account-nav-icon">📦</span>
                  Vendor Product Catalogue
                </button>
                <button
                  type="button"
                  className="bb-account-nav-item"
                  style={{ backgroundColor: '#f0fdf4', color: '#166534', fontWeight: 'bold' }}
                  onClick={() => navigate('/seller/orders')}
                >
                  <span className="bb-account-nav-icon">🏬</span>
                  Vendor Orders Dashboard
                </button>
              </>
            )}
            <button
              type="button"
              className="bb-account-nav-item"
              onClick={() => navigate('/orders')}
            >
              <span className="bb-account-nav-icon">📦</span>
              My Orders & Shipments
            </button>
            <button
              type="button"
              className="bb-account-nav-item"
              onClick={() => navigate('/wishlist')}
            >
              <span className="bb-account-nav-icon">♡</span>
              Saved Wishlist
            </button>
            <button
              type="button"
              className="bb-account-nav-item"
              onClick={() => navigate('/verify-email')}
            >
              <span className="bb-account-nav-icon">🛡️</span>
              Email Verification
            </button>
            <button
              type="button"
              disabled={isLoggingOut}
              className="bb-account-nav-item bb-account-logout-btn"
              onClick={handleLogout}
            >
              <span className="bb-account-nav-icon">🚪</span>
              {isLoggingOut ? 'Signing Out...' : `Sign Out (${authMode === 'AUTHENTICATED' ? 'Live' : 'Demo'})`}
            </button>
          </nav>
        </aside>

        {/* Main Profile Form Panel */}
        <main className="bb-account-panel">
          <div className="bb-panel-header">
            <h2 className="bb-panel-title">Personal Profile Details</h2>
            <span
              className={`bb-badge ${authMode === 'AUTHENTICATED' ? 'bb-badge-success' : 'bb-badge-primary'
                }`}
            >
              {authMode === 'AUTHENTICATED'
                ? `Live Account (${authUser?.role || 'CUSTOMER'})`
                : 'Demo Session'}
            </span>
          </div>

          {isSavedToast && (
            <div className="bb-profile-toast" role="status">
              <span>✓</span>
              <span>Profile details updated successfully!</span>
            </div>
          )}

          {profileError && (
            <div className="bb-badge bb-badge-danger bb-btn-block" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }} role="alert">
              ⚠️ {profileError}
            </div>
          )}

          {/* Verification Status Banner */}
          <div className="bb-profile-status-bar">
            <div className="bb-profile-status-info">
              <span>{user?.emailVerified ? '✅' : '⚠️'}</span>
              <div>
                <strong>
                  {user?.emailVerified ? 'Email Verified' : 'Email Not Verified'}
                </strong>
                <p className="bb-form-hint">
                  {user?.emailVerified
                    ? 'Your account is secured with a verified email address.'
                    : 'Verify your email to activate all account features.'}
                </p>
              </div>
            </div>
            {!user?.emailVerified && (
              <button
                type="button"
                className="bb-btn bb-btn-primary bb-btn-sm"
                onClick={() => navigate('/verify-email')}
              >
                Verify Now →
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="bb-profile-form-grid">
              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Full Name</label>
                <input
                  type="text"
                  required
                  className="bb-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Email Address</label>
                <input
                  type="email"
                  required
                  className="bb-input"
                  value={email}
                  disabled={authMode === 'AUTHENTICATED'}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {authMode === 'AUTHENTICATED' && (
                  <p className="bb-input-hint">Email address cannot be modified once registered.</p>
                )}
              </div>

              <div className="bb-form-group">
                <label className="bb-label">Mobile Number</label>
                <input
                  type="tel"
                  className="bb-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              <div className="bb-form-group">
                <label className="bb-label">Gender</label>
                <select
                  className="bb-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other / Prefer not to say</option>
                </select>
              </div>

              <div className="bb-form-group">
                <label className="bb-label">Date of Birth</label>
                <input
                  type="date"
                  className="bb-input"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
            </div>

            <div className="bb-profile-actions">
              <button
                type="submit"
                disabled={isSaving}
                className={`bb-btn bb-btn-primary ${isSaving ? 'bb-btn-loading' : ''}`}
              >
                {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
              <button
                type="button"
                className="bb-btn bb-btn-secondary"
                onClick={() => {
                  setFullName(user?.fullName || '');
                  setEmail(user?.email || '');
                  setPhone(user?.phone || '');
                  setGender(user?.gender || 'Female');
                  setDateOfBirth(user?.dateOfBirth || '');
                  setProfileError(null);
                }}
              >
                Reset
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
