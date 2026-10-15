import { useState, type FormEvent } from 'react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { DEMO_CATEGORIES } from '../../data/demoData.ts';
import './Header.css';

export function Header() {
  const { navigate, path } = useRouter();
  const {
    cartTotalCount,
    wishlist,
    pincode,
    setPincode,
    user,
    authUser,
    authMode,
    searchQuery,
    setSearchQuery,
  } = useMarketplace();

  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showPincodePrompt, setShowPincodePrompt] = useState(false);
  const [tempPincode, setTempPincode] = useState(pincode);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSearchQuery(localSearch);
    const categoryParam = selectedCategory !== 'all' ? `&category=${selectedCategory}` : '';
    navigate(`/products?q=${encodeURIComponent(localSearch)}${categoryParam}`);
  };

  const handleSavePincode = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d{6}$/.test(tempPincode.trim())) {
      setPincode(tempPincode.trim());
      setShowPincodePrompt(false);
    }
  };

  return (
    <header className="bb-header" role="banner">
      {/* Top Banner Bar */}
      <div className="bb-header-top">
        <div className="bb-container bb-header-top-inner">
          <div className="bb-header-top-left">
            <button
              type="button"
              className="bb-pincode-trigger"
              onClick={() => setShowPincodePrompt(true)}
              aria-label="Set delivery pincode"
            >
              <span>📍 Deliver to:</span>
              <span className="bb-pincode-highlight">{pincode || 'Select PIN'}</span>
              <span>▾</span>
            </button>
            <span className="bb-top-notice">⚡ Free delivery on multi-vendor orders above ₹999</span>
          </div>

          <div className="bb-header-top-right">
            {authUser?.role === 'ADMIN' && (
              <>
                <a
                  href="/admin/orders"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/admin/orders');
                  }}
                  className="bb-top-link"
                  style={{ color: '#fed7aa', fontWeight: 'bold' }}
                >
                  🛡️ Admin Orders
                </a>
                <span className="bb-top-divider">|</span>
              </>
            )}
            {authUser?.role === 'SELLER' && (
              <>
                <a
                  href="/seller/products"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/seller/products');
                  }}
                  className="bb-top-link"
                  style={{ color: '#67e8f9', fontWeight: 'bold' }}
                >
                  📦 Vendor Products
                </a>
                <span className="bb-top-divider">|</span>
                <a
                  href="/seller/orders"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/seller/orders');
                  }}
                  className="bb-top-link"
                  style={{ color: '#67e8f9', fontWeight: 'bold' }}
                >
                  🏬 Vendor Orders
                </a>
                <span className="bb-top-divider">|</span>
              </>
            )}
            <a href="#help" onClick={(e) => { e.preventDefault(); alert('Customer Care: 1800-123-9999 (9 AM - 9 PM IST)'); }} className="bb-top-link">
              24x7 Support
            </a>
            <span className="bb-top-divider">|</span>
            <a href="#seller" onClick={(e) => { e.preventDefault(); alert('Seller Portal Registration: Opening soon for verified Indian vendors!'); }} className="bb-top-link bb-seller-link">
              🏬 Sell on BharatBazaar
            </a>
          </div>
        </div>
      </div>

      {/* Main Bar */}
      <div className="bb-header-main">
        <div className="bb-container bb-header-main-inner">
          {/* Mobile Menu Hamburger */}
          <button
            type="button"
            className="bb-mobile-menu-toggle"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            ☰
          </button>

          {/* Logo */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigate('/');
            }}
            className="bb-logo"
            aria-label="BharatBazaar Home"
          >
            <div className="bb-logo-icon">BB</div>
            <div className="bb-logo-text">
              <span className="bb-logo-title">BharatBazaar</span>
              <span className="bb-logo-subtitle">Multi-Vendor Marketplace</span>
            </div>
          </a>

          {/* Search Bar */}
          <form className="bb-header-search" onSubmit={handleSearchSubmit} role="search">
            <select
              className="bb-search-category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter category"
            >
              <option value="all">All Categories</option>
              {DEMO_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.slug}>
                  {cat.name}
                </option>
              ))}
            </select>
            <input
              type="search"
              className="bb-search-input"
              placeholder="Search products, brands, artisans, or shops..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              aria-label="Search storefront"
            />
            <button type="submit" className="bb-search-submit" aria-label="Search">
              🔍
            </button>
          </form>

          {/* Actions */}
          <div className="bb-header-actions">
            {/* Account */}
            <button
              type="button"
              className="bb-header-btn"
              onClick={() => navigate(user ? '/profile' : '/login')}
              aria-label="Account"
            >
              <span className="bb-header-btn-icon">👤</span>
              <span className="bb-header-btn-label">
                {user ? `${user.fullName.split(' ')[0]}${authMode === 'DEMO' ? ' (Demo)' : ''}` : 'Sign In'}
              </span>
            </button>

            {/* Admin Orders Portal Button */}
            {authUser?.role === 'ADMIN' && (
              <button
                type="button"
                className="bb-header-btn"
                onClick={() => navigate('/admin/orders')}
                aria-label="Admin Orders Dashboard"
                title="Admin Orders Dashboard"
              >
                <span className="bb-header-btn-icon">🛡️</span>
                <span className="bb-header-btn-label">Admin</span>
              </button>
            )}

            {/* Seller Orders Portal Button */}
            {authUser?.role === 'SELLER' && (
              <button
                type="button"
                className="bb-header-btn"
                onClick={() => navigate('/seller/orders')}
                aria-label="Vendor Orders Dashboard"
                title="Vendor Orders Dashboard"
              >
                <span className="bb-header-btn-icon">🏬</span>
                <span className="bb-header-btn-label">Vendor</span>
              </button>
            )}

            {/* Orders */}
            <button
              type="button"
              className="bb-header-btn"
              onClick={() => navigate('/orders')}
              aria-label="Orders"
            >
              <span className="bb-header-btn-icon">📦</span>
              <span className="bb-header-btn-label">Orders</span>
            </button>

            {/* Wishlist */}
            <button
              type="button"
              className="bb-header-btn"
              onClick={() => navigate('/wishlist')}
              aria-label={`Wishlist (${wishlist.length} items)`}
            >
              <span className="bb-header-btn-icon">
                ♡
                {wishlist.length > 0 && (
                  <span className="bb-badge-count">{wishlist.length}</span>
                )}
              </span>
              <span className="bb-header-btn-label">Wishlist</span>
            </button>

            {/* Cart */}
            <button
              type="button"
              className="bb-header-btn bb-cart-btn"
              onClick={() => navigate('/cart')}
              aria-label={`Cart (${cartTotalCount} items)`}
            >
              <span className="bb-header-btn-icon">
                🛒
                {cartTotalCount > 0 && (
                  <span className="bb-badge-count">{cartTotalCount}</span>
                )}
              </span>
              <span className="bb-header-btn-label">Cart</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Navigation Strip */}
      <nav className="bb-header-nav" aria-label="Product Categories">
        <div className="bb-container">
          <ul className="bb-header-nav-list">
            <li>
              <a
                href="/products"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/products');
                }}
                className={`bb-nav-item-link ${path === '/products' ? 'active' : ''}`}
              >
                <span>🔥</span> All Products
              </a>
            </li>
            {DEMO_CATEGORIES.map((cat) => (
              <li key={cat.id}>
                <a
                  href={`/products?category=${cat.slug}`}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/products?category=${cat.slug}`);
                  }}
                  className={`bb-nav-item-link ${
                    path.includes(`/products?category=${cat.slug}`) ? 'active' : ''
                  }`}
                >
                  <span>{cat.icon}</span> {cat.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Pincode Prompt Modal */}
      {showPincodePrompt && (
        <div className="bb-mobile-drawer-overlay" onClick={() => setShowPincodePrompt(false)}>
          <div
            className="bb-card bb-pincode-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="bb-pincode-modal-title">📍 Choose Delivery Location</h3>
            <p className="bb-pincode-modal-text">
              Enter your 6-digit Indian PIN code to see accurate delivery speed and seller availability.
            </p>
            <form onSubmit={handleSavePincode}>
              <div className="bb-form-group">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="e.g. 560038"
                  className="bb-input"
                  value={tempPincode}
                  onChange={(e) => setTempPincode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              <div className="bb-pincode-modal-actions">
                <button
                  type="button"
                  className="bb-btn bb-btn-ghost"
                  onClick={() => setShowPincodePrompt(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="bb-btn bb-btn-primary">
                  Save Pincode
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div
          className="bb-mobile-drawer-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div className="bb-mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="bb-drawer-header">
              <div className="bb-logo">
                <div className="bb-logo-icon">BB</div>
                <div className="bb-logo-text">
                  <span className="bb-logo-title">BharatBazaar</span>
                </div>
              </div>
              <button
                type="button"
                className="bb-drawer-close"
                onClick={() => setIsMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className="bb-drawer-nav-section">
              <div className="bb-drawer-section-title">Customer Account</div>
              <div className="bb-drawer-nav-list">
                <button
                  type="button"
                  className="bb-drawer-link"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    navigate(user ? '/profile' : '/login');
                  }}
                >
                  <span>👤 {user ? user.fullName : 'Sign In / Register'}</span>
                  <span>→</span>
                </button>
                {authUser?.role === 'ADMIN' && (
                  <button
                    type="button"
                    className="bb-drawer-link"
                    style={{ backgroundColor: '#fff7ed', color: '#c2410c' }}
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      navigate('/admin/orders');
                    }}
                  >
                    <span>🛡️ Admin Orders Portal</span>
                    <span>→</span>
                  </button>
                )}
                {authUser?.role === 'SELLER' && (
                  <>
                    <button
                      type="button"
                      className="bb-drawer-link"
                      style={{ backgroundColor: '#f0fdf4', color: '#166534' }}
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        navigate('/seller/products');
                      }}
                    >
                      <span>📦 Vendor Products Catalogue</span>
                      <span>→</span>
                    </button>
                    <button
                      type="button"
                      className="bb-drawer-link"
                      style={{ backgroundColor: '#f0fdf4', color: '#166534' }}
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        navigate('/seller/orders');
                      }}
                    >
                      <span>🏬 Vendor Orders Portal</span>
                      <span>→</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="bb-drawer-link"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    navigate('/orders');
                  }}
                >
                  <span>📦 My Orders</span>
                  <span>→</span>
                </button>
                <button
                  type="button"
                  className="bb-drawer-link"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    navigate('/addresses');
                  }}
                >
                  <span>🏠 Saved Addresses</span>
                  <span>→</span>
                </button>
                <button
                  type="button"
                  className="bb-drawer-link"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    navigate('/wishlist');
                  }}
                >
                  <span>♡ Wishlist ({wishlist.length})</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            <div className="bb-drawer-nav-section">
              <div className="bb-drawer-section-title">Shop by Category</div>
              <div className="bb-drawer-nav-list">
                <button
                  type="button"
                  className="bb-drawer-link"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    navigate('/products');
                  }}
                >
                  <span>⚡ All Products</span>
                  <span>→</span>
                </button>
                {DEMO_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="bb-drawer-link"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      navigate(`/products?category=${cat.slug}`);
                    }}
                  >
                    <span>{cat.icon} {cat.name}</span>
                    <span>→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
