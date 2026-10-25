import { useState, useEffect } from 'react';
import { categoriesApi } from '../../services/categoriesApi.ts';
import type { BackendCategory } from '../../types/index.ts';
import { useRouter } from '../../context/RouterContext.tsx';
import './CategoryStrip.css';

const DEFAULT_ICONS: Record<string, string> = {
  'electronics': '⚡',
  'fashion': '👗',
  'home-living': '🏡',
  'artisans-handloom': '🧵',
  'grocery-gourmet': '🌾',
  'beauty-personal-care': '🌿',
};

export function CategoryStrip() {
  const { navigate } = useRouter();
  const [categories, setCategories] = useState<BackendCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    categoriesApi
      .getCategories()
      .then((data) => {
        if (mounted) {
          setCategories(data);
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

  if (!loading && categories.length === 0) {
    return null;
  }

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
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="bb-category-tile"
              onClick={() => navigate(`/products?category=${cat.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(`/products?category=${cat.id}`);
                }
              }}
            >
              <div className="bb-category-tile-icon">
                {DEFAULT_ICONS[cat.slug] || '📦'}
              </div>
              <h3 className="bb-category-tile-name">{cat.name}</h3>
              <span className="bb-category-tile-count">Explore →</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
