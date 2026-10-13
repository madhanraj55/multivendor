import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { DEMO_PRODUCTS } from '../data/demoData.ts';
import { EmptyState } from '../components/common/StateViews.tsx';
import type { Product } from '../types/index.ts';
import './WishlistPage.css';

export function WishlistPage() {
  const { wishlist, toggleWishlist, addToCart } = useMarketplace();
  const { navigate } = useRouter();

  const wishlistProducts = DEMO_PRODUCTS.filter((p: Product) => wishlist.includes(p.id));

  const handleMoveToCart = (productId: string) => {
    const product = DEMO_PRODUCTS.find((p: Product) => p.id === productId);
    if (product) {
      addToCart(product, 1);
      toggleWishlist(productId);
    }
  };

  if (wishlistProducts.length === 0) {
    return (
      <div className="bb-container bb-wishlist-container">
        <EmptyState
          icon="♡"
          title="Your Wishlist is Empty"
          description="You haven't saved any items yet. Heart your favorite handlooms, tech gadgets, and spices to keep track of them!"
          actionText="Explore Marketplace"
          onAction={() => navigate('/products')}
        />
      </div>
    );
  }

  return (
    <div className="bb-container bb-wishlist-container">
      <div className="bb-wishlist-header">
        <div>
          <h1 className="bb-plp-title">My Wishlist</h1>
          <p className="bb-section-subtitle">
            {wishlistProducts.length} {wishlistProducts.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>
        <button
          type="button"
          className="bb-btn bb-btn-outline bb-btn-sm"
          onClick={() => navigate('/products')}
        >
          Continue Shopping
        </button>
      </div>

      <div className="bb-wishlist-grid">
        {wishlistProducts.map((product: Product) => (
          <div key={product.id} className="bb-wishlist-card">
            {/* Thumbnail */}
            <div
              className="bb-wishlist-thumb-wrap"
              onClick={() => navigate(`/product/${product.id}`)}
            >
              <img
                src={product.thumbnail}
                alt={product.title}
                className="bb-wishlist-thumb-img"
              />
              <button
                type="button"
                className="bb-wishlist-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleWishlist(product.id);
                }}
                title="Remove from wishlist"
                aria-label="Remove from wishlist"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="bb-wishlist-card-body">
              <span className="bb-product-seller-name">
                🏬 {product.sellerName}
              </span>
              <h3
                className="bb-wishlist-card-title"
                onClick={() => navigate(`/product/${product.id}`)}
              >
                {product.title}
              </h3>
              <div className="bb-product-price-row">
                <span className="bb-price-current">₹{product.price.toLocaleString('en-IN')}</span>
                {product.originalPrice > product.price && (
                  <span className="bb-price-mrp">
                    ₹{product.originalPrice.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="bb-wishlist-card-footer">
              {product.inStock ? (
                <button
                  type="button"
                  className="bb-btn bb-btn-primary bb-btn-sm bb-btn-block"
                  onClick={() => handleMoveToCart(product.id)}
                >
                  Move to Cart 🛒
                </button>
              ) : (
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary bb-btn-sm bb-btn-block"
                  disabled
                >
                  Out of Stock
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
