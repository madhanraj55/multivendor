import { useState, useEffect } from 'react';
import { EmptyState, LoadingSpinner } from '../components/common/StateViews.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { publicCatalogApi, mapPublishedProductToUi } from '../services/publicCatalogApi.ts';
import type { Product, ProductVariantGroup, ProductVariantOption } from '../types/index.ts';
import './ProductDetailPage.css';

interface ProductDetailPageProps {
  productId: string;
}

export function ProductDetailPage({ productId }: ProductDetailPageProps) {
  const { navigate } = useRouter();
  const { addToCart, isInWishlist, toggleWishlist, pincode, setPincode } = useMarketplace();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [pincodeInput, setPincodeInput] = useState(pincode);
  const [pincodeChecked, setPincodeChecked] = useState(false);
  const [pincodeMessage, setPincodeMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'seller'>('description');
  const [addedMessage, setAddedMessage] = useState(false);

  const loadProduct = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await publicCatalogApi.getPublishedProductById(productId);
      const uiProd = mapPublishedProductToUi(data);
      setProduct(uiProd);

      // Pre-select first variant option if present
      if (uiProd.variants && uiProd.variants.length > 0) {
        const initialVariants: Record<string, string> = {};
        uiProd.variants.forEach((vg: ProductVariantGroup) => {
          const inStockOpt = vg.options.find((opt: ProductVariantOption) => opt.inStock) || vg.options[0];
          if (inStockOpt) {
            initialVariants[vg.name] = inStockOpt.label;
          }
        });
        setSelectedVariants(initialVariants);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Product could not be found or is not published';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
  }, [productId]);

  const handleVariantSelect = (groupName: string, optionLabel: string) => {
    setSelectedVariants((prev) => ({
      ...prev,
      [groupName]: optionLabel,
    }));
  };

  const handlePincodeCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pincodeInput || pincodeInput.length !== 6) {
      setPincodeMessage('Please enter a valid 6-digit Indian PIN code');
      setPincodeChecked(true);
      return;
    }
    setPincode(pincodeInput);
    setPincodeChecked(true);
    setPincodeMessage(`Delivery available to ${pincodeInput} in 3 to 5 business days`);
  };

  const handleAddToCart = () => {
    if (!product) return;
    addToCart(product, quantity, selectedVariants);
    setAddedMessage(true);
    setTimeout(() => setAddedMessage(false), 2500);
  };

  const handleBuyNow = () => {
    if (!product) return;
    addToCart(product, quantity, selectedVariants);
    navigate('/checkout');
  };

  const formatPrice = (val: number) =>
    val.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(val) ? 0 : 2, maximumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="bb-container bb-pdp-container" style={{ textAlign: 'center', padding: '100px 0' }}>
        <LoadingSpinner />
        <p style={{ marginTop: '16px', color: '#64748b' }}>Loading product details from database...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="bb-container bb-pdp-container">
        <EmptyState
          icon="📦"
          title="Product Not Available"
          description={error || "This product is not currently published or available for purchase."}
          actionText="Explore Marketplace Catalogue"
          onAction={() => navigate('/products')}
        />
      </div>
    );
  }

  const wishlisted = isInWishlist(product.id);

  return (
    <div className="bb-container bb-pdp-container">
      {/* Breadcrumb Navigation */}
      <nav className="bb-breadcrumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => navigate('/')} className="bb-breadcrumb-link">
          Home
        </button>
        <span className="bb-breadcrumb-separator">›</span>
        <button type="button" onClick={() => navigate('/products')} className="bb-breadcrumb-link">
          Products
        </button>
        {product.category && (
          <>
            <span className="bb-breadcrumb-separator">›</span>
            <button
              type="button"
              onClick={() => navigate(`/products?category=${product.categoryId}`)}
              className="bb-breadcrumb-link"
            >
              {product.category}
            </button>
          </>
        )}
        <span className="bb-breadcrumb-separator">›</span>
        <span className="bb-breadcrumb-current">{product.title}</span>
      </nav>

      {/* Main PDP Grid */}
      <div className="bb-pdp-main-grid">
        {/* Left Column: Sticky Image Gallery (Vertical Thumbnails + Main Showcase) */}
        <div className="bb-gallery-wrap">
          {product.images.length > 1 && (
            <div className="bb-gallery-thumbs">
              {product.images.map((img: string, idx: number) => (
                <button
                  type="button"
                  key={idx}
                  className={`bb-gallery-thumb-btn ${selectedImageIndex === idx ? 'active' : ''}`}
                  onClick={() => setSelectedImageIndex(idx)}
                  aria-label={`View image ${idx + 1}`}
                >
                  <img src={img} alt={`Thumbnail ${idx + 1}`} className="bb-gallery-thumb-img" />
                </button>
              ))}
            </div>
          )}

          <div className="bb-gallery-main">
            <img
              src={product.images[selectedImageIndex] || product.thumbnail}
              alt={product.title}
              className="bb-gallery-main-img"
            />
            {product.badge && (
              <span className="bb-gallery-badge">{product.badge}</span>
            )}
          </div>
        </div>

        {/* Right Column: Product Info & Buy Box */}
        <div className="bb-pdp-info">
          {/* Brand & Verified Badge */}
          <div className="bb-pdp-header-row">
            <span className="bb-pdp-brand">{product.brand || 'Verified Brand'}</span>
            <span className="bb-badge bb-badge-primary">✓ Verified Merchant</span>
          </div>

          <h1 className="bb-pdp-title">{product.title}</h1>

          {/* Rating & Seller Strip */}
          <div className="bb-pdp-meta-row">
            <span className="bb-pdp-rating-pill">
              ★ {product.sellerRating || '4.9'}
            </span>
            <span className="bb-pdp-seller-inline">
              Sold by:
              <button
                type="button"
                className="bb-pdp-seller-link"
                onClick={() => navigate(`/products?seller=${product.sellerId}`)}
              >
                {product.sellerName}
              </button>
            </span>
          </div>

          {/* Pricing Block */}
          <div className="bb-pdp-pricing-box">
            <div className="bb-pdp-price-primary">
              <span className="bb-pdp-curr-price">₹{formatPrice(product.price)}</span>
              {product.originalPrice > product.price && (
                <span className="bb-pdp-discount-badge">
                  {product.discountPercent}% OFF
                </span>
              )}
            </div>
            {product.originalPrice > product.price && (
              <div className="bb-pdp-mrp-row">
                <span>M.R.P.:</span>
                <span className="bb-pdp-mrp">₹{formatPrice(product.originalPrice)}</span>
                <span className="bb-pdp-savings">
                  (You save ₹{formatPrice(product.originalPrice - product.price)})
                </span>
              </div>
            )}
            {/* [GST Disabled for Non-GST Launch] <span className="bb-pdp-tax-note">Inclusive of all applicable GST & taxes</span> */}
          </div>

          {/* In-Stock Indicator */}
          <div className="bb-pdp-stock-status">
            {product.inStock ? (
              <span className="bb-badge bb-badge-success">
                ● In Stock ({product.stockQuantity} available)
              </span>
            ) : (
              <span className="bb-badge bb-badge-danger">● Currently Out of Stock</span>
            )}
          </div>

          {/* Variant Selector */}
          {product.variants && product.variants.length > 0 && (
            <div className="bb-variant-section">
              {product.variants.map((group: ProductVariantGroup) => (
                <div key={group.name} className="bb-variant-group">
                  <span className="bb-variant-title">
                    Select {group.name}: <strong>{selectedVariants[group.name]}</strong>
                  </span>
                  <div className="bb-variant-options">
                    {group.options.map((opt: ProductVariantOption) => {
                      const isSelected = selectedVariants[group.name] === opt.label;
                      return (
                        <button
                          type="button"
                          key={opt.label}
                          className={`bb-variant-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => handleVariantSelect(group.name, opt.label)}
                          disabled={!opt.inStock}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quantity and Action CTAs (Add to Cart, Buy Now, Wishlist) */}
          <div className="bb-pdp-actions-row">
            <div className="bb-qty-selector">
              <label htmlFor="bb-qty-input" className="bb-qty-label">Qty:</label>
              <select
                id="bb-qty-input"
                className="bb-qty-select"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                disabled={!product.inStock}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                  .filter((q) => q <= Math.max(1, product.stockQuantity))
                  .map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
              </select>
            </div>

            <button
              type="button"
              className="bb-btn bb-btn-primary bb-pdp-add-btn"
              onClick={handleAddToCart}
              disabled={!product.inStock}
            >
              🛒 Add to Cart
            </button>

            <button
              type="button"
              className="bb-pdp-buy-btn"
              onClick={handleBuyNow}
              disabled={!product.inStock}
            >
              ⚡ Buy Now
            </button>

            <button
              type="button"
              className={`bb-pdp-wishlist-toggle ${wishlisted ? 'active' : ''}`}
              onClick={() => toggleWishlist(product.id)}
              aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
              title={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
            >
              {wishlisted ? '♥' : '♡'}
            </button>
          </div>

          {addedMessage && (
            <div className="bb-alert bb-alert-success" role="alert">
              ✓ Added {quantity} item(s) to your cart!
            </div>
          )}

          {/* Marketplace Trust & Service Highlights */}
          <div className="bb-pdp-highlights-grid">
            <div className="bb-pdp-highlight-badge">
              <span className="bb-pdp-highlight-badge-icon">🚚</span>
              <span>Tracked Delivery</span>
            </div>
            <div className="bb-pdp-highlight-badge">
              <span className="bb-pdp-highlight-badge-icon">↩️</span>
              <span>7-Day Returns</span>
            </div>
            <div className="bb-pdp-highlight-badge">
              <span className="bb-pdp-highlight-badge-icon">💵</span>
              <span>COD Available</span>
            </div>
            <div className="bb-pdp-highlight-badge">
              <span className="bb-pdp-highlight-badge-icon">🛡️</span>
              <span>Buyer Protection</span>
            </div>
          </div>

          {/* PIN code Serviceability Checker */}
          <div className="bb-pdp-pincode-card">
            <span className="bb-pincode-card-title">📍 Check Delivery & COD Availability</span>
            <form onSubmit={handlePincodeCheck} className="bb-pincode-form">
              <input
                type="text"
                placeholder="Enter 6-digit PIN"
                className="bb-pincode-input"
                maxLength={6}
                value={pincodeInput}
                onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, ''))}
              />
              <button type="submit" className="bb-btn bb-btn-outline bb-btn-sm">
                Check PIN
              </button>
            </form>
            {pincodeChecked && (
              <span className={`bb-pincode-feedback ${pincodeMessage.includes('valid') ? 'error' : 'success'}`}>
                {pincodeMessage}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: Description, Specifications, Seller */}
      <div className="bb-pdp-tabs-card">
        <div className="bb-pdp-tab-headers" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'description'}
            className={`bb-pdp-tab-btn ${activeTab === 'description' ? 'active' : ''}`}
            onClick={() => setActiveTab('description')}
          >
            Product Description
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'specs'}
            className={`bb-pdp-tab-btn ${activeTab === 'specs' ? 'active' : ''}`}
            onClick={() => setActiveTab('specs')}
          >
            Specifications
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'seller'}
            className={`bb-pdp-tab-btn ${activeTab === 'seller' ? 'active' : ''}`}
            onClick={() => setActiveTab('seller')}
          >
            About Seller & Guarantees
          </button>
        </div>

        {activeTab === 'description' && (
          <div>
            <p className="bb-pdp-description-text">
              {product.description || 'No detailed description provided by the seller.'}
            </p>
          </div>
        )}

        {activeTab === 'specs' && (
          <div>
            <table className="bb-pdp-specs-table">
              <tbody>
                <tr>
                  <th>Brand</th>
                  <td>{product.brand || 'BharatBazaar Verified'}</td>
                </tr>
                <tr>
                  <th>Category</th>
                  <td>{product.category || 'Marketplace'}</td>
                </tr>
                <tr>
                  <th>Availability</th>
                  <td>{product.inStock ? `In Stock (${product.stockQuantity} units)` : 'Out of Stock'}</td>
                </tr>
                <tr>
                  <th>Return Policy</th>
                  <td>7 Days Easy Return</td>
                </tr>
                <tr>
                  <th>Sold By</th>
                  <td>{product.sellerName}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'seller' && (
          <div>
            <h4>Seller Information</h4>
            <p className="bb-pdp-seller-detail-text">
              <strong>Merchant Name:</strong> {product.sellerName} <br />
              <strong>Merchant Rating:</strong> ★ {product.sellerRating || '4.9'} / 5.0 <br />
              <strong>Marketplace Status:</strong> Verified Merchant
            </p>
            <h4>Standard Marketplace Guarantee</h4>
            <p className="bb-pdp-guarantee-text">
              All purchases made through BharatBazaar are safeguarded by our Buyer Protection program.
              Eligible items can be returned within 7 days of delivery in original condition.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
