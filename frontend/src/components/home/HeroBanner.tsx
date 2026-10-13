import { useRouter } from '../../context/RouterContext.tsx';
import './HeroBanner.css';

export function HeroBanner() {
  const { navigate } = useRouter();

  return (
    <section className="bb-hero-banner" aria-label="Marketplace Highlights">
      <div className="bb-container bb-hero-banner-inner">
        <div>
          <div className="bb-hero-badge">
            <span>✨</span> Discover Genuine Indian Commerce
          </div>
          <h1 className="bb-hero-title">
            Direct from <span className="bb-hero-highlight">Verified Sellers</span>, Master Artisans & Leading Brands
          </h1>
          <p className="bb-hero-desc">
            Explore authentic audio tech, pure handloom silks, Ayurvedic skincare, and heritage cookware
            with seamless multi-vendor checkout and trusted nationwide doorstep delivery.
          </p>
          <div className="bb-hero-ctas">
            <button
              type="button"
              className="bb-btn bb-btn-accent bb-btn-lg"
              onClick={() => navigate('/products')}
            >
              Shop All Products →
            </button>
            <button
              type="button"
              className="bb-btn bb-btn-secondary bb-btn-lg"
              onClick={() => navigate('/products?category=artisans-handloom')}
            >
              Explore Artisan Crafts
            </button>
          </div>
        </div>

        <div className="bb-hero-card-grid">
          <div className="bb-hero-stat-card">
            <span className="bb-hero-stat-number">2,400+</span>
            <span className="bb-hero-stat-label">Verified Regional Merchants</span>
          </div>
          <div className="bb-hero-stat-card">
            <span className="bb-hero-stat-number">100%</span>
            <span className="bb-hero-stat-label">Authentic & Quality Inspected</span>
          </div>
          <div className="bb-hero-stat-card">
            <span className="bb-hero-stat-number">26,000+</span>
            <span className="bb-hero-stat-label">Indian Postal PIN Codes Served</span>
          </div>
          <div className="bb-hero-stat-card">
            <span className="bb-hero-stat-number">₹999</span>
            <span className="bb-hero-stat-label">Free Delivery Threshold</span>
          </div>
        </div>
      </div>
    </section>
  );
}
