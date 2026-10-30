import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import { categoriesApi } from '../../services/categoriesApi.ts';
import type { BackendCategory } from '../../types/index.ts';
import './Header.css';

const DEFAULT_ICONS: Record<string, string> = {
  'electronics': '⚡',
  'fashion': '👗',
  'home-living': '🏡',
  'artisans-handloom': '🧵',
  'grocery-gourmet': '🌾',
  'beauty-personal-care': '🌿',
};

const FALLBACK_CATEGORIES: BackendCategory[] = [
  { id: 'cat-electronics', name: 'Electronics & Gadgets', slug: 'electronics', description: null, imageUrl: null, parentId: null, isActive: true, sortOrder: 1 },
  { id: 'cat-fashion', name: 'Fashion & Apparel', slug: 'fashion', description: null, imageUrl: null, parentId: null, isActive: true, sortOrder: 2 },
  { id: 'cat-home', name: 'Home & Living', slug: 'home-living', description: null, imageUrl: null, parentId: null, isActive: true, sortOrder: 3 },
  { id: 'cat-artisans', name: 'Artisans & Handloom', slug: 'artisans-handloom', description: null, imageUrl: null, parentId: null, isActive: true, sortOrder: 4 },
  { id: 'cat-grocery', name: 'Grocery & Gourmet', slug: 'grocery-gourmet', description: null, imageUrl: null, parentId: null, isActive: true, sortOrder: 5 },
  { id: 'cat-beauty', name: 'Beauty & Personal Care', slug: 'beauty-personal-care', description: null, imageUrl: null, parentId: null, isActive: true, sortOrder: 6 },
];

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

  const [categories, setCategories] = useState<BackendCategory[]>(FALLBACK_CATEGORIES);
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showPincodePrompt, setShowPincodePrompt] = useState(false);
  const [tempPincode, setTempPincode] = useState(pincode);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 2-Way interactive sliding refs & state
  const trackRef = useRef<HTMLDivElement>(null);
  const currentXRef = useRef<number>(0);
  const halfWidthRef = useRef<number>(0);
  const isPointerDownRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startPosRef = useRef<number>(0);
  const hasDraggedRef = useRef<boolean>(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isInteracting, setIsInteracting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    let mounted = true;
    categoriesApi
      .getCategories()
      .then((data) => {
        if (mounted && data && data.length > 0) {
          setCategories(data);
        }
      })
      .catch(() => { });
    return () => {
      mounted = false;
    };
  }, []);

  // Measure half-width of track for infinite 2-way wrap
  useEffect(() => {
    const measure = () => {
      if (trackRef.current) {
        halfWidthRef.current = trackRef.current.scrollWidth / 2;
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [categories]);

  // Gentle ambient glide from right to left, automatically paused on hover/touch/drag/focus
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const glide = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;

      if (!isInteracting && !isHovered && trackRef.current) {
        // Smooth ~28px per second gentle glide
        const step = (28 * delta) / 1000;
        let nextX = currentXRef.current - step;
        const half = halfWidthRef.current || (trackRef.current.scrollWidth / 2);
        if (half > 0) {
          while (nextX < -half) nextX += half;
          while (nextX > 0) nextX -= half;
        }
        currentXRef.current = nextX;
        trackRef.current.style.transform = `translate3d(${nextX}px, 0, 0)`;
      }

      animId = requestAnimationFrame(glide);
    };

    animId = requestAnimationFrame(glide);
    return () => cancelAnimationFrame(animId);
  }, [isInteracting, isHovered]);

  // Pointer events: handles both desktop mouse click-and-drag and mobile touch swipe
  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    isPointerDownRef.current = true;
    startXRef.current = e.clientX;
    startPosRef.current = currentXRef.current;
    hasDraggedRef.current = false;
    setIsInteracting(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isPointerDownRef.current) return;
    const dx = e.clientX - startXRef.current;
    if (Math.abs(dx) > 4) {
      hasDraggedRef.current = true;
      try {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      } catch { }
    }
    let nextX = startPosRef.current + dx;
    const half = halfWidthRef.current || (trackRef.current ? trackRef.current.scrollWidth / 2 : 0);
    if (half > 0) {
      while (nextX > 0) nextX -= half;
      while (nextX < -half) nextX += half;
    }
    currentXRef.current = nextX;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${nextX}px, 0, 0)`;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch { }

    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setIsInteracting(false);
      hasDraggedRef.current = false;
    }, 2500);
  };

  // Wheel event: allows horizontal sliding via mouse wheel / trackpad
  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 1) return;
    setIsInteracting(true);

    let nextX = currentXRef.current - delta;
    const half = halfWidthRef.current || (trackRef.current ? trackRef.current.scrollWidth / 2 : 0);
    if (half > 0) {
      while (nextX > 0) nextX -= half;
      while (nextX < -half) nextX += half;
    }
    currentXRef.current = nextX;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${nextX}px, 0, 0)`;
    }

    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setIsInteracting(false);
    }, 2500);
  };

  const handleCategoryClick = (e: React.MouseEvent, targetPath: string) => {
    e.preventDefault();
    if (hasDraggedRef.current) {
      // User was sliding/dragging; do not trigger category navigation
      return;
    }
    navigate(targetPath);
  };

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

  const renderNavItems = (prefix = '') => (
    <>
      <li>
        <a
          href="/products"
          onClick={(e) => handleCategoryClick(e, '/products')}
          className={`bb-nav-item-link ${path === '/products' ? 'active' : ''}`}
          tabIndex={prefix ? -1 : undefined}
          draggable={false}
        >
          All Products
        </a>
      </li>
      {categories.map((cat) => (
        <li key={`${prefix}${cat.id}`}>
          <a
            href={`/products?category=${cat.id}`}
            onClick={(e) => handleCategoryClick(e, `/products?category=${cat.id}`)}
            className={`bb-nav-item-link ${path.includes(`/products?category=${cat.id}`) ? 'active' : ''
              }`}
            tabIndex={prefix ? -1 : undefined}
            draggable={false}
          >
            {cat.name}
          </a>
        </li>
      ))}
    </>
  );

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
            </button>
          </div>

          <div className="bb-header-top-right">
            {authUser?.role === 'ADMIN' && (
              <>
                <a
                  href="/admin/dashboard"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/admin/dashboard');
                  }}
                  className="bb-top-link"
                  style={{ color: '#fed7aa', fontWeight: 'bold' }}
                >
                  Dashboard
                </a>
                <span className="bb-top-divider">|</span>
                <a
                  href="/admin/orders"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/admin/orders');
                  }}
                  className="bb-top-link"
                  style={{ color: '#fed7aa', fontWeight: 'bold' }}
                >
                  Orders
                </a>
                <span className="bb-top-divider">|</span>
                <a
                  href="/admin/sellers"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/admin/sellers');
                  }}
                  className="bb-top-link"
                  style={{ color: '#fed7aa', fontWeight: 'bold' }}
                >
                  Sellers
                </a>
                <span className="bb-top-divider">|</span>
                <a
                  href="/admin/customers"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate('/admin/customers');
                  }}
                  className="bb-top-link"
                  style={{ color: '#fed7aa', fontWeight: 'bold' }}
                >
                  Customers
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
                  Vendor Products
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
                  Vendor Orders
                </a>
                <span className="bb-top-divider">|</span>
              </>
            )}
            <a href="#help" onClick={(e) => { e.preventDefault(); alert('Customer Care: 1800-123-9999 (9 AM - 9 PM IST)'); }} className="bb-top-link">
              24x7 Support
            </a>
            <span className="bb-top-divider">|</span>
            <a
              href="/seller/register"
              onClick={(e) => {
                e.preventDefault();
                navigate('/seller/register');
              }}
              className="bb-top-link bb-seller-link"
            >
              Sell on BharatBazaar
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
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
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
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
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

            {/* Seller Dashboard Portal Button */}
            {authUser?.role === 'SELLER' && (
              <button
                type="button"
                className="bb-header-btn"
                onClick={() => navigate('/seller/dashboard')}
                aria-label="Vendor Control Dashboard"
                title="Vendor Control Dashboard"
              >
                <span className="bb-header-btn-icon">🏬</span>
                <span className="bb-header-btn-label">Dashboard</span>
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
      <nav
        className={`bb-header-nav ${isInteracting ? 'is-interacting' : ''}`}
        aria-label="Product Categories"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setIsHovered(true)}
        onBlurCapture={() => setIsHovered(false)}
      >
        <div className="bb-header-nav-track" ref={trackRef}>
          <ul className="bb-header-nav-list">{renderNavItems('nav-')}</ul>
          <ul className="bb-header-nav-list" aria-hidden="true">{renderNavItems('c1-')}</ul>
          <ul className="bb-header-nav-list" aria-hidden="true">{renderNavItems('c2-')}</ul>
          <ul className="bb-header-nav-list" aria-hidden="true">{renderNavItems('c3-')}</ul>
        </div>
      </nav>

      {/* Pincode Prompt Modal */}
      {showPincodePrompt && (
        <div className="bb-mobile-drawer-overlay" onClick={() => setShowPincodePrompt(false)}>
          <div
            className="bb-card bb-pincode-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="bb-pincode-modal-title">Delivery Location</h3>
            <p className="bb-pincode-modal-text">
              Enter your 6-digit Indian PIN code
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
                    <span>Admin Orders Portal</span>
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
                      <span>Vendor Products Catalogue</span>
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
                      <span>Vendor Orders Portal</span>
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
                  <span>My Orders</span>
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
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className="bb-drawer-link"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      navigate(`/products?category=${cat.id}`);
                    }}
                  >
                    <span>{DEFAULT_ICONS[cat.slug] || '📦'} {cat.name}</span>
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
