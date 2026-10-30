import { useState } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import { EmptyState, ErrorState, SkeletonGrid } from '../components/common/StateViews.tsx';
import type { Product } from '../types/index.ts';
import './WishlistPage.css';

export function WishlistPage() {
  const {
    wishlist,
    wishlistProducts,
    wishlistLoading,
    wishlistError,
    fetchWishlist,
    removeFromWishlist,
    clearWishlist,
    addToCart,
    authMode,
  } = useMarketplace();
  const { navigate } = useRouter();

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleMoveToCart = async (product: Product) => {
    addToCart(product, 1);
    try {
      await removeFromWishlist(product.id);
    } catch {
      // In demo mode or if remove fails, item was already placed in cart
    }
  };

  const handleRemove = async (productId: string) => {
    setActionError(null);
    setRemovingId(productId);
    try {
      await removeFromWishlist(productId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove product from wishlist';
      setActionError(msg);
    } finally {
      setRemovingId(null);
    }
  };

  const handleClearAll = async () => {
    if (wishlistProducts.length === 0) return;
    setActionError(null);
    setIsClearing(true);
    try {
      await clearWishlist();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear wishlist';
      setActionError(msg);
    } finally {
      setIsClearing(false);
    }
  };

  // Full page skeleton when loading initial wishlist or when items were added and full products are resolving
  if ((wishlistLoading || (wishlist.length > 0 && wishlistProducts.length === 0)) && wishlistProducts.length === 0 && !wishlistError) {
    return (
      <div className="bb-container bb-wishlist-container">
        <div className="bb-wishlist-header">
          <div>
            <h1 className="bb-plp-title">My Wishlist</h1>
            <p className="bb-section-subtitle">Loading your saved items...</p>
          </div>
        </div>
        <SkeletonGrid count={Math.min(wishlist.length || 4, 8)} />
      </div>
    );
  }

  // Error state when wishlist fails to load initially in authenticated mode
  if (wishlistError && wishlistProducts.length === 0) {
    return (
      <div className="bb-container bb-wishlist-container">
        <ErrorState
          title="Unable to load your wishlist"
          description={wishlistError}
          onRetry={() => fetchWishlist()}
        />
      </div>
    );
  }

  if (authMode !== 'AUTHENTICATED') {
    return (
      <div className="bb-container bb-wishlist-container">
        <EmptyState
          icon="♡"
          title="Sign in to View Your Wishlist"
          description="Login to see items you previously saved and keep your wishlist synced across all your devices."
          actionText="Sign In / Register"
          onAction={() => navigate('/login?redirect=/wishlist')}
        />
      </div>
    );
  }

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
          <h1 className="bb-plp-title">
            My Wishlist{' '}
            {authMode === 'AUTHENTICATED' && (
              <span className="bb-badge bb-badge-success" style={{ fontSize: 'var(--text-xs)', verticalAlign: 'middle' }}>
                Synced
              </span>
            )}
          </h1>
          <p className="bb-section-subtitle">
            {wishlistProducts.length} {wishlistProducts.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>
        <div className="bb-wishlist-header-actions" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="bb-btn bb-btn-secondary bb-btn-sm"
            onClick={handleClearAll}
            disabled={isClearing}
          >
            {isClearing ? 'Clearing...' : 'Clear Wishlist'}
          </button>
          <button
            type="button"
            className="bb-btn bb-btn-outline bb-btn-sm"
            onClick={() => navigate('/products')}
          >
            Continue Shopping
          </button>
        </div>
      </div>

      {actionError && (
        <div
          className="bb-badge bb-badge-danger bb-btn-block"
          style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}
          role="alert"
        >
          ⚠️ {actionError}
        </div>
      )}

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
                disabled={removingId === product.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(product.id);
                }}
                title="Remove from wishlist"
                aria-label="Remove from wishlist"
              >
                {removingId === product.id ? '…' : '✕'}
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
                  onClick={() => handleMoveToCart(product)}
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

