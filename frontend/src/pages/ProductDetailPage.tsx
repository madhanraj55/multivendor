import { useState } from 'react';
import { DEMO_PRODUCTS } from '../data/demoData.ts';
import { ProductCard } from '../components/common/ProductCard.tsx';
import { EmptyState } from '../components/common/StateViews.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import type { Product, ProductVariantGroup, ProductVariantOption } from '../types/index.ts';
import './ProductDetailPage.css';

interface ProductDetailPageProps {
  productId: string;
}

export function ProductDetailPage({ productId }: ProductDetailPageProps) {
  const { navigate } = useRouter();
  const { addToCart, isInWishlist, toggleWishlist, pincode, setPincode } = useMarketplace();

  const product = DEMO_PRODUCTS.find((p: Product) => p.id === productId) || DEMO_PRODUCTS[0];

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (product?.variants) {
      product.variants.forEach((vg: ProductVariantGroup) => {
        const inStockOption = vg.options.find((opt: ProductVariantOption) => opt.inStock) || vg.options[0];
        if (inStockOption) {
          initial[vg.name] = inStockOption.label;
        }
      });
    }
    return initial;
  });

  const [pincodeInput, setPincodeInput] = useState(pincode);
  const [pincodeChecked, setPincodeChecked] = useState(Boolean(pincode));
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'seller'>('description');
  const [addedToast, setAddedToast] = useState(false);
  const [isTogglingWishlist, setIsTogglingWishlist] = useState(false);
  const [cartActionError, setCartActionError] = useState<string | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  if (!product) {
    return (
      <div className="bb-container bb-pdp-container">
        <EmptyState
          icon="📦"
          title="Product not found"
          description="The product you are looking for is unavailable or has been removed by the merchant."
          actionText="Browse Marketplace"
          onAction={() => navigate('/products')}
        />
      </div>
    );
  }

  const isFavorited = isInWishlist(product.id);


  const handleWishlistToggle = async () => {
    if (isTogglingWishlist) return;
    setIsTogglingWishlist(true);
    try {
      await toggleWishlist(product.id);
    } catch {
      // Reverted by context
    } finally {
      setIsTogglingWishlist(false);
    }
  };

  const handleAddToCart = async () => {
    if (isAddingToCart) return;
    setCartActionError(null);
    setIsAddingToCart(true);
    try {
      await addToCart(product, quantity, selectedVariants);
      setAddedToast(true);
      setTimeout(() => setAddedToast(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add product to cart';
      setCartActionError(msg);
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleBuyNow = async () => {
    if (isAddingToCart) return;
    setCartActionError(null);
    setIsAddingToCart(true);
    try {
      await addToCart(product, quantity, selectedVariants);
      navigate('/checkout');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add product to cart';
      setCartActionError(msg);
    } finally {
      setIsAddingToCart(false);
    }
  };

  const handleCheckPincode = (e: React.FormEvent) => {
    e.preventDefault();
    if (/^\d{6}$/.test(pincodeInput.trim())) {
      setPincode(pincodeInput.trim());
      setPincodeChecked(true);
    }
  };

  const relatedProducts = DEMO_PRODUCTS.filter(
    (p: Product) => p.id !== product.id && p.categoryId === product.categoryId
  ).slice(0, 3);

  return (
    <div className="bb-container bb-pdp-container">
      {/* Breadcrumb */}
      <nav className="bb-breadcrumb" aria-label="Breadcrumb">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
          Home
        </a>
        <span>/</span>
        <a
          href={`/products?category=${product.categoryId}`}
          onClick={(e) => { e.preventDefault(); navigate('/products'); }}
        >
          {product.category}
        </a>
        <span>/</span>
        <span className="bb-breadcrumb-current">{product.title}</span>
      </nav>

      {/* Main Grid: Gallery + Info */}
      <div className="bb-pdp-main-grid">
        {/* Gallery */}
        <div className="bb-gallery-wrap">
          <div className="bb-gallery-main">
            <img
              src={product.images[selectedImageIndex] || product.thumbnail}
              alt={product.title}
              className="bb-gallery-main-img"
            />
          </div>

          {product.images.length > 1 && (
            <div className="bb-gallery-thumbs" aria-label="Image thumbnails">
              {product.images.map((imgUrl: string, idx: number) => (
                <button
                  key={idx}
                  type="button"
                  className={`bb-gallery-thumb-btn ${idx === selectedImageIndex ? 'active' : ''}`}
                  onClick={() => setSelectedImageIndex(idx)}
                  aria-label={`View image ${idx + 1}`}
                >
                  <img src={imgUrl} alt="" className="bb-gallery-thumb-img" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info Column */}
        <div className="bb-pdp-info">
          <div className="bb-pdp-header-row">
            <span className="bb-pdp-brand">{product.brand}</span>
            <h1 className="bb-pdp-title">{product.title}</h1>
            <div className="bb-product-rating-row">
              <span className="bb-rating-chip">★ {product.rating}</span>
              <span className="bb-review-count">
                Based on {product.reviewCount} verified buyer reviews
              </span>
            </div>
          </div>

          {/* Multi-Vendor Seller Banner */}
          <div className="bb-pdp-seller-banner">
            <div className="bb-pdp-seller-left">
              <span>🏬 Sold & Dispatched by:</span>
              <span className="bb-pdp-seller-name">{product.sellerName}</span>
              <span>(★ {product.sellerRating})</span>
            </div>
            {product.sellerVerified && (
              <span className="bb-badge bb-badge-success">✓ Verified Marketplace Seller</span>
            )}
          </div>

          {/* Price Box */}
          <div className="bb-pdp-pricing-box">
            <div className="bb-pdp-price-primary">
              <span className="bb-pdp-curr-price">₹{product.price.toLocaleString('en-IN')}</span>
              {product.originalPrice > product.price && (
                <>
                  <span className="bb-pdp-mrp">₹{product.originalPrice.toLocaleString('en-IN')}</span>
                  <span className="bb-pdp-discount-badge">{product.discountPercent}% OFF</span>
                </>
              )}
            </div>
            <p className="bb-pdp-tax-notice">
              Inclusive of all applicable Indian GST taxes. Multi-vendor invoice provided at delivery.
            </p>
          </div>

          {/* Variants */}
          {product.variants && product.variants.map((group: ProductVariantGroup) => (
            <div key={group.name} className="bb-variant-section">
              <span className="bb-variant-title">
                {group.name}: <strong>{selectedVariants[group.name] || 'Select'}</strong>
              </span>
              <div className="bb-variant-options">
                {group.options.map((opt: ProductVariantOption) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`bb-variant-btn ${
                      selectedVariants[group.name] === opt.label ? 'active' : ''
                    }`}
                    disabled={!opt.inStock}
                    onClick={() =>
                      setSelectedVariants({
                        ...selectedVariants,
                        [group.name]: opt.label,
                      })
                    }
                  >
                    {opt.label}
                    {!opt.inStock && ' (Sold out)'}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Quantity Selector & Stock Status */}
          <div className="bb-qty-row">
            <span className="bb-qty-label">Quantity:</span>
            <div className="bb-qty-stepper">
              <button
                type="button"
                className="bb-qty-btn"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                -
              </button>
              <span className="bb-qty-display">{quantity}</span>
              <button
                type="button"
                className="bb-qty-btn"
                onClick={() => setQuantity(quantity + 1)}
                disabled={quantity >= 10}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <span className="bb-stock-status in-stock">
              ● In Stock ({product.stockQuantity} units available from merchant)
            </span>
          </div>

          {/* Action Buttons: Add to Cart & Buy Now */}
          {cartActionError && (
            <div
              role="alert"
              style={{
                padding: '0.5rem 0.75rem',
                marginBottom: '0.75rem',
                borderRadius: '4px',
                backgroundColor: '#fee2e2',
                color: '#b91c1c',
                fontSize: '0.85rem',
              }}
            >
              ⚠️ {cartActionError}
            </div>
          )}

          <div className="bb-pdp-actions">
            <button
              type="button"
              className="bb-btn bb-btn-primary bb-btn-lg bb-add-cart-btn"
              onClick={handleAddToCart}
            >
              🛒 Add to Cart
            </button>
            <button
              type="button"
              className="bb-btn bb-btn-accent bb-btn-lg bb-buy-now-btn"
              onClick={handleBuyNow}
            >
              ⚡ Buy Now
            </button>
            <button
              type="button"
              disabled={isTogglingWishlist}
              className={`bb-btn bb-wishlist-pdp-btn ${isFavorited ? 'favorited' : ''}`}
              onClick={handleWishlistToggle}
              aria-label={isFavorited ? 'Remove from wishlist' : 'Save to wishlist'}
              title={isFavorited ? 'Saved to wishlist' : 'Add to wishlist'}
            >
              {isTogglingWishlist ? '…' : isFavorited ? '♥ Saved' : '♡ Wishlist'}
            </button>

          </div>

          {addedToast && (
            <div className="bb-toast-notification" role="status">
              ✓ Added {quantity} item(s) to your cart!
            </div>
          )}

          {/* Delivery Pincode Checker */}
          <div className="bb-pdp-pincode-box">
            <h4 className="bb-pdp-pincode-title">🚚 Check Delivery & Cash on Delivery Availability</h4>
            <form onSubmit={handleCheckPincode} className="bb-pdp-pincode-form">
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit PIN code"
                value={pincodeInput}
                onChange={(e) => {
                  setPincodeInput(e.target.value.replace(/\D/g, ''));
                  setPincodeChecked(false);
                }}
                className="bb-input bb-pdp-pincode-input"
                aria-label="Delivery PIN code"
              />
              <button type="submit" className="bb-btn bb-btn-secondary bb-btn-sm">
                Check
              </button>
            </form>

            {pincodeChecked && (
              <div className="bb-delivery-estimate-card">
                <div className="bb-delivery-point">
                  <span>✓</span>
                  <span>
                    Express delivery to <strong>{pincodeInput}</strong>: <strong>In 2-4 business days</strong>
                  </span>
                </div>
                <div className="bb-delivery-point">
                  <span>✓</span>
                  <span>Cash on Delivery (COD) available for this pincode</span>
                </div>
                <div className="bb-delivery-point">
                  <span>✓</span>
                  <span>7-Day Return / Replacement available</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: Description, Specs, Seller Info */}
      <div className="bb-pdp-tabs-wrap">
        <div className="bb-pdp-tabs-nav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'description'}
            className={`bb-pdp-tab-btn ${activeTab === 'description' ? 'active' : ''}`}
            onClick={() => setActiveTab('description')}
          >
            Product Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'specs'}
            className={`bb-pdp-tab-btn ${activeTab === 'specs' ? 'active' : ''}`}
            onClick={() => setActiveTab('specs')}
          >
            Technical Specifications
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
              {product.description}
            </p>
            <h4>Key Highlights:</h4>
            <ul className="bb-pdp-highlights-list">
              {product.highlights.map((h: string, i: number) => (
                <li key={i} className="bb-pdp-highlight-item">
                  <span className="bb-pdp-highlight-icon">✓</span> {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'specs' && (
          <div>
            <table className="bb-pdp-specs-table">
              <tbody>
                {Object.entries(product.specifications).map(([key, val]: [string, string]) => (
                  <tr key={key}>
                    <th>{key}</th>
                    <td>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'seller' && (
          <div>
            <h4>Seller Information:</h4>
            <p className="bb-pdp-seller-detail-text">
              <strong>Merchant Name:</strong> {product.sellerName} <br />
              <strong>Merchant Hub:</strong> {product.sellerCity} <br />
              <strong>Marketplace Rating:</strong> ★ {product.sellerRating} / 5.0
            </p>
            <h4>Standard Marketplace Guarantee:</h4>
            <p className="bb-pdp-guarantee-text">
              All purchases made through BharatBazaar are safeguarded by our Buyer Protection program.
              Eligible items can be returned within 7 days of delivery in original condition.
            </p>
          </div>
        )}
      </div>

      {/* Related Products Section */}
      {relatedProducts.length > 0 && (
        <section aria-label="Similar Products">
          <div className="bb-section-header">
            <h2 className="bb-section-title">Similar Products in this Category</h2>
          </div>
          <div className="bb-product-grid">
            {relatedProducts.map((p: Product) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
