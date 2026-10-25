import { useState, useEffect } from 'react';
import { publicCatalogApi, type PublicApprovedShop } from '../../services/publicCatalogApi.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import './VendorSpotlight.css';

export function VendorSpotlight() {
  const { navigate } = useRouter();
  const [shops, setShops] = useState<PublicApprovedShop[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    publicCatalogApi
      .getApprovedShops()
      .then((data) => {
        if (mounted) {
          setShops(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!loading && shops.length === 0) {
    return null;
  }

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
          {shops.map((seller) => (
            <div key={seller.id} className="bb-vendor-card">
              <div className="bb-vendor-card-header">
                <div className="bb-vendor-avatar">🏬</div>
                <div className="bb-vendor-info">
                  <h3 className="bb-vendor-title">{seller.name}</h3>
                  <span className="bb-vendor-location">
                    📍 {seller.pickupAddress?.city ? `${seller.pickupAddress.city}, ${seller.pickupAddress.state}` : 'Verified Merchant Hub'}
                  </span>
                </div>
              </div>

              <div className="bb-vendor-badge-row">
                <span className="bb-badge bb-badge-primary">✓ Verified Store</span>
              </div>

              <div className="bb-vendor-stats">
                <div className="bb-vendor-rating">
                  <span>★</span>
                  <span>4.9</span>
                  <span className="bb-review-count">(Verified)</span>
                </div>
                <div>
                  <strong>{seller._count?.products ?? 0}</strong> Products
                </div>
              </div>

              <div className="bb-vendor-footer">
                <span className="bb-badge bb-badge-neutral">
                  Registered {new Date(seller.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </span>
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
