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
      <div className="bb-pdp-layout">
        {/* Left Column: Image Gallery */}
        <div className="bb-pdp-gallery">
          <div className="bb-pdp-main-image-wrap">
            <img
              src={product.images[selectedImageIndex] || product.thumbnail}
              alt={product.title}
              className="bb-pdp-main-image"
            />
            {product.badge && (
              <span className="bb-product-badge">{product.badge}</span>
            )}
          </div>

          {/* Thumbnail Strip */}
          {product.images.length > 1 && (
            <div className="bb-pdp-thumbnails">
              {product.images.map((img: string, idx: number) => (
                <button
                  type="button"
                  key={idx}
                  className={`bb-pdp-thumb-btn ${selectedImageIndex === idx ? 'active' : ''}`}
                  onClick={() => setSelectedImageIndex(idx)}
                >
                  <img src={img} alt={`Thumbnail ${idx + 1}`} className="bb-pdp-thumb-img" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Product Info & Buy Box */}
        <div className="bb-pdp-info">
          {/* Brand & Title */}
          <div className="bb-pdp-brand-row">
            <span className="bb-pdp-brand">{product.brand || 'Verified Seller'}</span>
            <span className="bb-badge bb-badge-primary">✓ Verified Merchant</span>
          </div>

          <h1 className="bb-pdp-title">{product.title}</h1>

          {/* Seller Attribution Card */}
          <div className="bb-pdp-seller-strip">
            <span>Sold by: </span>
            <button
              type="button"
              className="bb-pdp-seller-link"
              onClick={() => navigate(`/products?seller=${product.sellerId}`)}
            >
              <strong>{product.sellerName}</strong>
            </button>
            <span className="bb-pdp-seller-rating">★ {product.sellerRating} / 5.0</span>
          </div>

          {/* Pricing Block */}
          <div className="bb-pdp-price-block">
            <div className="bb-pdp-price-main">
              <span className="bb-pdp-currency">₹</span>
              <span className="bb-pdp-price-amount">{product.price.toLocaleString('en-IN')}</span>
            </div>
            {product.originalPrice > product.price && (
              <div className="bb-pdp-mrp-row">
                <span className="bb-pdp-mrp-label">M.R.P.:</span>
                <span className="bb-pdp-original-price">₹{product.originalPrice.toLocaleString('en-IN')}</span>
                <span className="bb-pdp-discount">({product.discountPercent}% OFF)</span>
              </div>
            )}
            <span className="bb-pdp-tax-note">Inclusive of all applicable GST & taxes</span>
          </div>

          {/* In-Stock Indicator */}
          <div className="bb-pdp-stock-status">
            {product.inStock ? (
              <span className="bb-badge bb-badge-success">● In Stock ({product.stockQuantity} available)</span>
            ) : (
              <span className="bb-badge bb-badge-danger">● Currently Out of Stock</span>
            )}
          </div>

          {/* Variant Selector */}
          {product.variants && product.variants.length > 0 && (
            <div className="bb-pdp-variants-section">
              {product.variants.map((group: ProductVariantGroup) => (
                <div key={group.name} className="bb-pdp-variant-group">
                  <span className="bb-pdp-variant-title">
                    Select {group.name}: <strong>{selectedVariants[group.name]}</strong>
                  </span>
                  <div className="bb-pdp-variant-options">
                    {group.options.map((opt: ProductVariantOption) => {
                      const isSelected = selectedVariants[group.name] === opt.label;
                      return (
                        <button
                          type="button"
                          key={opt.label}
                          className={`bb-pdp-variant-btn ${isSelected ? 'active' : ''} ${!opt.inStock ? 'out-of-stock' : ''}`}
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

          {/* Quantity and Actions */}
          <div className="bb-pdp-actions-row">
            <div className="bb-qty-selector">
              <label htmlFor="bb-qty-input" className="bb-qty-label">Qty:</label>
              <select
                id="bb-qty-input"
                className="bb-qty-select"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="bb-btn bb-btn-primary bb-btn-lg bb-pdp-add-btn"
              onClick={handleAddToCart}
              disabled={!product.inStock}
            >
              🛒 Add to Cart
            </button>

            <button
              type="button"
              className={`bb-btn bb-btn-outline bb-btn-lg bb-pdp-wish-btn ${wishlisted ? 'active' : ''}`}
              onClick={() => toggleWishlist(product.id)}
              aria-label={wishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
            >
              {wishlisted ? '♥ Saved' : '♡ Wishlist'}
            </button>
          </div>

          {addedMessage && (
            <div className="bb-alert bb-alert-success" role="alert">
              ✓ Added {quantity} item(s) to your cart!
            </div>
          )}

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

      {/* Tabs: Description, Specs, Seller */}
      <div className="bb-pdp-tabs-container">
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

        {activeTab === 'seller' && (
          <div>
            <h4>Seller Information:</h4>
            <p className="bb-pdp-seller-detail-text">
              <strong>Merchant Name:</strong> {product.sellerName} <br />
              <strong>Marketplace Status:</strong> Verified Merchant
            </p>
            <h4>Standard Marketplace Guarantee:</h4>
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
