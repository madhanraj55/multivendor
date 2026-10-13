import { DEMO_SELLERS } from '../../data/demoData.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import './VendorSpotlight.css';

export function VendorSpotlight() {
  const { navigate } = useRouter();

  return (
    <section className="bb-vendor-spotlight-section" aria-label="Featured Marketplace Sellers">
      <div className="bb-container">
        <div className="bb-section-header">
          <div className="bb-section-title-wrap">
            <h2 className="bb-section-title">Shop by Verified Indian Merchants</h2>
            <p className="bb-section-subtitle">
              Support passionate independent store owners, co-operatives, and artisan studios across India
            </p>
          </div>
          <button
            type="button"
            className="bb-view-all-link"
            onClick={() => navigate('/products')}
          >
            All Merchants →
          </button>
        </div>

        <div className="bb-vendor-grid">
          {DEMO_SELLERS.map((seller) => (
            <div key={seller.id} className="bb-vendor-card">
              <div className="bb-vendor-card-header">
                <div className="bb-vendor-avatar">🏬</div>
                <div className="bb-vendor-info">
                  <h3 className="bb-vendor-title">{seller.storeName}</h3>
                  <span className="bb-vendor-location">
                    📍 {seller.city}, {seller.state}
                  </span>
                </div>
              </div>

              <div className="bb-vendor-badge-row">
                <span className="bb-badge bb-badge-primary">{seller.badge}</span>
              </div>

              <div className="bb-vendor-stats">
                <div className="bb-vendor-rating">
                  <span>★</span>
                  <span>{seller.rating}</span>
                  <span className="bb-review-count">({seller.ratingCount} reviews)</span>
                </div>
                <div>
                  <strong>{seller.productsCount}</strong> Products
                </div>
              </div>

              <div className="bb-vendor-footer">
                <span className="bb-badge bb-badge-neutral">Joined {seller.joinedDate}</span>
                <button
                  type="button"
                  className="bb-btn bb-btn-outline bb-btn-sm"
                  onClick={() => navigate(`/products?seller=${seller.id}`)}
                >
                  Visit Store
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
