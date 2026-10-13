import { useState } from 'react';
import type { Product } from '../../types/index.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import { useMarketplace } from '../../context/MarketplaceContext.tsx';
import './ProductCard.css';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { navigate } = useRouter();
  const { addToCart, isInWishlist, toggleWishlist } = useMarketplace();
  const [justAdded, setJustAdded] = useState(false);

  const isFavorited = isInWishlist(product.id);

  const handleCardClick = () => {
    navigate(`/product/${product.id}`);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart(product, 1);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product.id);
  };

  return (
    <article className="bb-product-card" onClick={handleCardClick}>
      {/* Image Wrap */}
      <div className="bb-product-image-wrap">
        <img
          src={product.thumbnail}
          alt={product.title}
          className="bb-product-img"
          loading="lazy"
        />

        {/* Badges */}
        <div className="bb-product-badges">
          {product.badge && (
            <span
              className={`bb-badge ${
                product.badge === 'Bestseller'
                  ? 'bb-badge-accent'
                  : product.badge === 'Sale'
                  ? 'bb-badge-danger'
                  : 'bb-badge-primary'
              }`}
            >
              {product.badge}
            </span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          type="button"
          className={`bb-product-wishlist-btn ${isFavorited ? 'active' : ''}`}
          onClick={handleWishlistToggle}
          aria-label={isFavorited ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          {isFavorited ? '♥' : '♡'}
        </button>
      </div>

      {/* Body */}
      <div className="bb-product-content">
        {/* Multi-Vendor Seller Row */}
        <div className="bb-product-seller-row">
          <span className="bb-product-seller-name" title={`Store: ${product.sellerName}`}>
            🏬 {product.sellerName}
          </span>
          {product.sellerVerified && (
            <span className="bb-badge bb-badge-success" title="Verified Indian Merchant">
              ✓ Verified
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="bb-product-title" title={product.title}>
          {product.title}
        </h3>

        {/* Rating */}
        <div className="bb-product-rating-row">
          <span className="bb-rating-chip">
            ★ {product.rating}
          </span>
          <span className="bb-review-count">({product.reviewCount} reviews)</span>
        </div>

        {/* Price Row */}
        <div className="bb-product-price-row">
          <span className="bb-price-current">₹{product.price.toLocaleString('en-IN')}</span>
          {product.originalPrice > product.price && (
            <>
              <span className="bb-price-mrp">₹{product.originalPrice.toLocaleString('en-IN')}</span>
              <span className="bb-price-discount">{product.discountPercent}% OFF</span>
            </>
          )}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="bb-product-card-footer">
        {product.inStock ? (
          <button
            type="button"
            className={`bb-btn ${justAdded ? 'bb-btn-accent' : 'bb-btn-primary'} bb-btn-sm bb-btn-block`}
            onClick={handleAddToCart}
          >
            {justAdded ? '✓ Added to Cart' : 'Add to Cart'}
          </button>
        ) : (
          <div className="bb-out-of-stock-banner">Currently Out of Stock</div>
        )}
      </div>
    </article>
  );
}
