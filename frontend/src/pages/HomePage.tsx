import { HeroBanner } from '../components/home/HeroBanner.tsx';
import { CategoryStrip } from '../components/home/CategoryStrip.tsx';
import { VendorSpotlight } from '../components/home/VendorSpotlight.tsx';
import { ProductCard } from '../components/common/ProductCard.tsx';
import { DEMO_PRODUCTS } from '../data/demoData.ts';
import { useRouter } from '../context/RouterContext.tsx';
import './HomePage.css';

export function HomePage() {
  const { navigate } = useRouter();

  const trendingProducts = DEMO_PRODUCTS.slice(0, 4);
  const artisanProducts = DEMO_PRODUCTS.filter(
    (p) => p.categoryId === 'cat-4' || p.categoryId === 'cat-3'
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
                Most loved picks curated across audio, wearables, and living essentials
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

          <div className="bb-product-grid">
            {trendingProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* Special Festive / Artisan Callout */}
      <div className="bb-container">
        <div className="bb-promo-callout">
          <div>
            <h3 className="bb-promo-title">Support Master Weavers & Regional Crafts</h3>
            <p className="bb-promo-subtitle">
              Every purchase from our Artisan collective goes directly to sustaining indigenous craft traditions.
            </p>
          </div>
          <button
            type="button"
            className="bb-btn bb-btn-primary"
            onClick={() => navigate('/products?category=artisans-handloom')}
          >
            Explore Handicraft Collectives →
          </button>
        </div>
      </div>

      {/* Artisan & Heritage Section */}
      <section className="bb-home-section bb-home-section-alt" aria-label="Indian Handloom and Living Heritage">
        <div className="bb-container">
          <div className="bb-section-header">
            <div className="bb-section-title-wrap">
              <h2 className="bb-section-title">Handloom & Living Heritage</h2>
              <p className="bb-section-subtitle">
                Certified pure silks, hand-hammered Kansa bronze, and heritage pottery
              </p>
            </div>
            <button
              type="button"
              className="bb-view-all-link"
              onClick={() => navigate('/products?category=artisans-handloom')}
            >
              Browse Handlooms →
            </button>
          </div>

          <div className="bb-product-grid">
            {artisanProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* Vendor Spotlight */}
      <VendorSpotlight />
    </main>
  );
}
