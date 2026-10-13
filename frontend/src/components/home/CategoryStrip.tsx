import { DEMO_CATEGORIES } from '../../data/demoData.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import './CategoryStrip.css';

export function CategoryStrip() {
  const { navigate } = useRouter();

  return (
    <section className="bb-category-strip-section" aria-label="Browse Top Categories">
      <div className="bb-container">
        <div className="bb-section-header">
          <div className="bb-section-title-wrap">
            <h2 className="bb-section-title">Shop by Category</h2>
            <p className="bb-section-subtitle">
              Browse top products sourced directly from trusted Indian makers
            </p>
          </div>
          <button
            type="button"
            className="bb-view-all-link"
            onClick={() => navigate('/products')}
          >
            All Categories →
          </button>
        </div>

        <div className="bb-category-grid">
          {DEMO_CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              className="bb-category-tile"
              onClick={() => navigate(`/products?category=${cat.slug}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(`/products?category=${cat.slug}`);
                }
              }}
            >
              <div className="bb-category-tile-icon">{cat.icon}</div>
              <h3 className="bb-category-tile-name">{cat.name}</h3>
              <span className="bb-category-tile-count">{cat.itemCount.toLocaleString('en-IN')}+ items</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
