import { useState, useMemo } from 'react';
import { DEMO_PRODUCTS, DEMO_CATEGORIES, DEMO_SELLERS } from '../data/demoData.ts';
import { ProductCard } from '../components/common/ProductCard.tsx';
import { EmptyState } from '../components/common/StateViews.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import type { Product, Category, Seller } from '../types/index.ts';
import './ProductListingPage.css';

export function ProductListingPage() {
  const { queryParams, navigate } = useRouter();

  const selectedCategorySlug = queryParams.category || 'all';
  const selectedSellerId = queryParams.seller || 'all';
  const searchQuery = queryParams.q || '';

  const [activeCategory, setActiveCategory] = useState(selectedCategorySlug);
  const [activeSeller, setActiveSeller] = useState(selectedSellerId);
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(10000);
  const [minRating, setMinRating] = useState<number>(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState('featured');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Compute filtered products
  const filteredProducts = useMemo(() => {
    return DEMO_PRODUCTS.filter((product: Product) => {
      // Category filter
      if (activeCategory !== 'all') {
        const cat = DEMO_CATEGORIES.find((c: Category) => c.slug === activeCategory);
        if (cat && product.categoryId !== cat.id) {
          return false;
        }
      }

      // Seller filter
      if (activeSeller !== 'all' && product.sellerId !== activeSeller) {
        return false;
      }

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = product.title.toLowerCase().includes(q);
        const matchesBrand = product.brand.toLowerCase().includes(q);
        const matchesSeller = product.sellerName.toLowerCase().includes(q);
        if (!matchesTitle && !matchesBrand && !matchesSeller) {
          return false;
        }
      }

      // Price range
      if (product.price < minPrice || product.price > maxPrice) {
        return false;
      }

      // Rating
      if (minRating > 0 && product.rating < minRating) {
        return false;
      }

      // Stock
      if (inStockOnly && !product.inStock) {
        return false;
      }

      return true;
    }).sort((a: Product, b: Product) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      if (sortBy === 'rating') return b.rating - a.rating;
      if (sortBy === 'discount') return b.discountPercent - a.discountPercent;
      return 0; // 'featured' keeps original order
    });
  }, [activeCategory, activeSeller, searchQuery, minPrice, maxPrice, minRating, inStockOnly, sortBy]);

  const clearAllFilters = () => {
    setActiveCategory('all');
    setActiveSeller('all');
    setMinPrice(0);
    setMaxPrice(10000);
    setMinRating(0);
    setInStockOnly(false);
  };

  const currentCategoryObj = DEMO_CATEGORIES.find((c: Category) => c.slug === activeCategory);

  return (
    <div className="bb-container bb-plp-container">
      {/* Breadcrumb */}
      <nav className="bb-breadcrumb" aria-label="Breadcrumb">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
          Home
        </a>
        <span>/</span>
        <a href="/products" onClick={(e) => { e.preventDefault(); navigate('/products'); }}>
          All Products
        </a>
        {currentCategoryObj && (
          <>
            <span>/</span>
            <span className="bb-breadcrumb-current">{currentCategoryObj.name}</span>
          </>
        )}
      </nav>

      {/* Header & Meta Bar */}
      <div className="bb-plp-header">
        <div>
          <h1 className="bb-plp-title">
            {currentCategoryObj ? currentCategoryObj.name : 'Explore All Marketplace Products'}
          </h1>
          <p className="bb-plp-count">
            Showing <strong>{filteredProducts.length}</strong> authentic products across verified Indian stores
          </p>
        </div>

        {/* Controls: Sort + Mobile Filter Toggle */}
        <div className="bb-plp-controls">
          <button
            type="button"
            className="bb-mobile-filter-trigger"
            onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
            aria-label="Toggle filter drawer"
          >
            <span>⚙️ Filters ({filteredProducts.length})</span>
          </button>

          <div className="bb-sort-wrap">
            <label htmlFor="sortSelect" className="bb-sort-label">
              Sort by:
            </label>
            <select
              id="sortSelect"
              className="bb-select bb-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="featured">Featured & Recommended</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Highest Customer Rating</option>
              <option value="discount">Biggest Discount (%)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Grid: Sidebar + Products */}
      <div className="bb-plp-layout">
        {/* Filter Drawer / Sidebar */}
        <aside className={`bb-filter-sidebar ${mobileFilterOpen ? 'open' : ''}`}>
          <div className="bb-filter-header">
            <h2 className="bb-filter-title">Filters</h2>
            <button
              type="button"
              className="bb-filter-reset"
              onClick={clearAllFilters}
            >
              Reset All
            </button>
          </div>

          {/* Active Filter Chips */}
          {(activeCategory !== 'all' || activeSeller !== 'all' || minRating > 0 || inStockOnly) && (
            <div className="bb-active-filters-chips">
              {activeCategory !== 'all' && (
                <span className="bb-filter-chip">
                  {currentCategoryObj?.name || activeCategory}
                  <button type="button" onClick={() => setActiveCategory('all')}>×</button>
                </span>
              )}
              {activeSeller !== 'all' && (
                <span className="bb-filter-chip">
                  Store: {activeSeller}
                  <button type="button" onClick={() => setActiveSeller('all')}>×</button>
                </span>
              )}
              {inStockOnly && (
                <span className="bb-filter-chip">
                  In Stock Only
                  <button type="button" onClick={() => setInStockOnly(false)}>×</button>
                </span>
              )}
              {minRating > 0 && (
                <span className="bb-filter-chip">
                  ★ {minRating}+ Rating
                  <button type="button" onClick={() => setMinRating(0)}>×</button>
                </span>
              )}
            </div>
          )}

          {/* Category Filter */}
          <div className="bb-filter-group">
            <span className="bb-filter-group-title">Category</span>
            <div className="bb-filter-list">
              <label className="bb-filter-label">
                <input
                  type="radio"
                  name="catFilter"
                  checked={activeCategory === 'all'}
                  onChange={() => setActiveCategory('all')}
                />
                All Categories
              </label>
              {DEMO_CATEGORIES.map((cat: Category) => (
                <label key={cat.id} className="bb-filter-label">
                  <input
                    type="radio"
                    name="catFilter"
                    checked={activeCategory === cat.slug}
                    onChange={() => setActiveCategory(cat.slug)}
                  />
                  {cat.icon} {cat.name}
                </label>
              ))}
            </div>
          </div>

          {/* Verified Multi-Vendor Filter */}
          <div className="bb-filter-group">
            <span className="bb-filter-group-title">Filter by Seller</span>
            <div className="bb-filter-list">
              <label className="bb-filter-label">
                <input
                  type="radio"
                  name="sellerFilter"
                  checked={activeSeller === 'all'}
                  onChange={() => setActiveSeller('all')}
                />
                All Sellers
              </label>
              {DEMO_SELLERS.map((seller: Seller) => (
                <label key={seller.id} className="bb-filter-label">
                  <input
                    type="radio"
                    name="sellerFilter"
                    checked={activeSeller === seller.id}
                    onChange={() => setActiveSeller(seller.id)}
                  />
                  {seller.storeName}
                </label>
              ))}
            </div>
          </div>

          {/* Price Range Filter */}
          <div className="bb-filter-group">
            <span className="bb-filter-group-title">Price Range (₹)</span>
            <div className="bb-price-inputs">
              <input
                type="number"
                placeholder="Min"
                className="bb-price-input"
                value={minPrice || ''}
                onChange={(e) => setMinPrice(Number(e.target.value) || 0)}
              />
              <span className="bb-price-dash">—</span>
              <input
                type="number"
                placeholder="Max"
                className="bb-price-input"
                value={maxPrice || ''}
                onChange={(e) => setMaxPrice(Number(e.target.value) || 10000)}
              />
            </div>
          </div>

          {/* Minimum Rating */}
          <div className="bb-filter-group">
            <span className="bb-filter-group-title">Customer Ratings</span>
            <div className="bb-filter-list">
              {[4, 3, 2].map((stars) => (
                <label key={stars} className="bb-filter-label">
                  <input
                    type="radio"
                    name="ratingFilter"
                    checked={minRating === stars}
                    onChange={() => setMinRating(stars)}
                  />
                  <span>★ {stars}.0 & above</span>
                </label>
              ))}
              {minRating > 0 && (
                <button
                  type="button"
                  className="bb-clear-mini-btn"
                  onClick={() => setMinRating(0)}
                >
                  Clear rating filter
                </button>
              )}
            </div>
          </div>

          {/* Stock Filter */}
          <div className="bb-filter-group">
            <span className="bb-filter-group-title">Availability</span>
            <label className="bb-filter-label">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              Exclude Out of Stock
            </label>
          </div>

          {mobileFilterOpen && (
            <button
              type="button"
              className="bb-btn bb-btn-primary bb-btn-block"
              onClick={() => setMobileFilterOpen(false)}
            >
              Apply Filters ({filteredProducts.length} Results)
            </button>
          )}
        </aside>

        {/* Product Grid Area */}
        <section aria-label="Catalog Products">
          {filteredProducts.length > 0 ? (
            <div className="bb-product-grid">
              {filteredProducts.map((product: Product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="🔍"
              title="No products found"
              description="No products matched your active filters or search terms. Try clearing filters to see more results."
              actionText="Reset All Filters"
              onAction={clearAllFilters}
            />
          )}
        </section>
      </div>
    </div>
  );
}
