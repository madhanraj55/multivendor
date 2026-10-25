import { useState, useEffect } from 'react';
import { HeroBanner } from '../components/home/HeroBanner.tsx';
import { CategoryStrip } from '../components/home/CategoryStrip.tsx';
import { VendorSpotlight } from '../components/home/VendorSpotlight.tsx';
import { ProductCard } from '../components/common/ProductCard.tsx';
import { LoadingSpinner, EmptyState } from '../components/common/StateViews.tsx';
import { publicCatalogApi, mapPublishedProductToUi } from '../services/publicCatalogApi.ts';
import { useRouter } from '../context/RouterContext.tsx';
import type { Product } from '../types/index.ts';
import './HomePage.css';

export function HomePage() {
  const { navigate } = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrendingProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await publicCatalogApi.getPublishedProducts({ limit: 12 });
      const uiProducts = res.items.map(mapPublishedProductToUi);
      setProducts(uiProducts);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load catalog products';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrendingProducts();
  }, []);

  const trendingProducts = products.slice(0, 8);
  const artisanProducts = products.filter(
    (p) => p.category?.toLowerCase().includes('artisan') || p.category?.toLowerCase().includes('handloom') || p.category?.toLowerCase().includes('beauty')
  );

  return (
    <main className="bb-home-page" id="main-content">
      {/* Hero Section */}
      <HeroBanner />

      {/* Category Strip */}
      <CategoryStrip />

      {/* Trending Deals Section */}
      <section className="bb-home-section" aria-label="Trending Marketplace Deals">
        <div className="bb-container">
          <div className="bb-section-header">
            <div className="bb-section-title-wrap">
              <h2 className="bb-section-title">Trending Deals & Top Rated</h2>
              <p className="bb-section-subtitle">
                Authentic items sourced directly from verified Indian merchants
              </p>
            </div>
            <button
              type="button"
              className="bb-view-all-link"
              onClick={() => navigate('/products')}
            >
              View All Products →
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <LoadingSpinner />
              <p style={{ marginTop: '12px', color: '#64748b' }}>Loading products...</p>
            </div>
          ) : error ? (
            <EmptyState
              icon="⚠️"
              title="Unable to Load Products"
              description={error}
              actionText="Retry"
              onAction={fetchTrendingProducts}
            />
          ) : trendingProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '32px' }}>🛍️</span>
              <p style={{ margin: '12px 0 0', fontWeight: 600, color: '#334155' }}>
                No published products available in marketplace yet
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                Verified seller products will appear here once approved and published.
              </p>
            </div>
          ) : (
            <div className="bb-product-grid">
              {trendingProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Special Festive / Artisan Callout */}
      <div className="bb-container">
        <div className="bb-promo-callout">
          <div>
            <h3 className="bb-promo-title">Support Master Weavers & Regional Crafts</h3>
            <p className="bb-promo-subtitle">
              Every purchase from verified merchant stores sustains local enterprise and craft traditions.
            </p>
          </div>
          <button
            type="button"
            className="bb-btn bb-btn-primary"
            onClick={() => navigate('/products')}
          >
            Explore Marketplace Catalogue →
          </button>
        </div>
      </div>

      {/* Artisan & Heritage Section (if products present) */}
      {artisanProducts.length > 0 && (
        <section className="bb-home-section bb-home-section-alt" aria-label="Indian Handloom and Living Heritage">
          <div className="bb-container">
            <div className="bb-section-header">
              <div className="bb-section-title-wrap">
                <h2 className="bb-section-title">Featured Curations</h2>
                <p className="bb-section-subtitle">
                  Discover regional specialties and verified merchant crafts
                </p>
              </div>
              <button
                type="button"
                className="bb-view-all-link"
                onClick={() => navigate('/products')}
              >
                Browse All →
              </button>
            </div>

            <div className="bb-product-grid">
              {artisanProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Vendor Spotlight */}
      <VendorSpotlight />
    </main>
  );
}
