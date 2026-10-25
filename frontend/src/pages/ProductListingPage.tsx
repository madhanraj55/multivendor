import { useState, useEffect, useMemo } from 'react';
import { publicCatalogApi, mapPublishedProductToUi, type PublicApprovedShop } from '../services/publicCatalogApi.ts';
import { categoriesApi } from '../services/categoriesApi.ts';
import { ProductCard } from '../components/common/ProductCard.tsx';
import { EmptyState, LoadingSpinner } from '../components/common/StateViews.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import type { Product, BackendCategory } from '../types/index.ts';
import './ProductListingPage.css';

export function ProductListingPage() {
  const { queryParams, navigate } = useRouter();

  const selectedCategoryQuery = queryParams.category || 'all';
  const selectedSellerId = queryParams.seller || 'all';
  const searchQuery = queryParams.q || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<BackendCategory[]>([]);
  const [shops, setShops] = useState<PublicApprovedShop[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState(selectedCategoryQuery);
  const [activeSeller, setActiveSeller] = useState(selectedSellerId);
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(10000);
  const [minRating, setMinRating] = useState<number>(0);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState('featured');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Sync state if query parameters change
  useEffect(() => {
    setActiveCategory(queryParams.category || 'all');
  }, [queryParams.category]);

  useEffect(() => {
    setActiveSeller(queryParams.seller || 'all');
  }, [queryParams.seller]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [prodsRes, catsRes, shopsRes] = await Promise.all([
        publicCatalogApi.getPublishedProducts({
          search: searchQuery || undefined,
          limit: 50,
        }),
        categoriesApi.getCategories().catch(() => [] as BackendCategory[]),
        publicCatalogApi.getApprovedShops().catch(() => [] as PublicApprovedShop[]),
      ]);

      setProducts(prodsRes.items.map(mapPublishedProductToUi));
      setCategories(catsRes);
      setShops(shopsRes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve products from marketplace';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  // Compute filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((product: Product) => {
      // Category filter (match by id or slug)
      if (activeCategory !== 'all') {
        const catObj = categories.find((c) => c.id === activeCategory || c.slug === activeCategory);
        if (catObj && product.categoryId !== catObj.id) {
          return false;
        } else if (!catObj && product.categoryId !== activeCategory) {
          return false;
        }
      }

      // Seller filter
      if (activeSeller !== 'all' && product.sellerId !== activeSeller) {
        return false;
      }

      // Price filter
      if (product.price < minPrice || (maxPrice > 0 && product.price > maxPrice)) {
        return false;
      }

      // Stock filter
      if (inStockOnly && !product.inStock) {
        return false;
      }

      // Rating filter
      if (minRating > 0 && product.rating < minRating) {
        return false;
      }

      return true;
    });
  }, [products, categories, activeCategory, activeSeller, minPrice, maxPrice, inStockOnly, minRating]);

  // Sort products
  const sortedProducts = useMemo(() => {
    const list = [...filteredProducts];
    switch (sortBy) {
      case 'price-asc':
        return list.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return list.sort((a, b) => b.price - a.price);
      case 'rating':
        return list.sort((a, b) => b.rating - a.rating);
      case 'newest':
        return list.sort((a, b) => b.id.localeCompare(a.id));
      default:
        return list;
    }
  }, [filteredProducts, sortBy]);

  const currentCategoryObj = categories.find((c) => c.id === activeCategory || c.slug === activeCategory);
  const currentSellerObj = shops.find((s) => s.id === activeSeller);

  const clearAllFilters = () => {
    setActiveCategory('all');
    setActiveSeller('all');
    setMinPrice(0);
    setMaxPrice(10000);
    setMinRating(0);
    setInStockOnly(false);
    setSortBy('featured');
    navigate('/products');
  };

  return (
    <div className="bb-container bb-plp-container">
      {/* Breadcrumb */}
      <nav className="bb-breadcrumb" aria-label="Breadcrumb">
        <button type="button" onClick={() => navigate('/')} className="bb-breadcrumb-link">
          Home
        </button>
        <span className="bb-breadcrumb-separator">›</span>
        <button
          type="button"
          onClick={() => {
            setActiveCategory('all');
            setActiveSeller('all');
            navigate('/products');
          }}
          className="bb-breadcrumb-link"
        >
          All Products
        </button>
        {currentCategoryObj && (
          <>
            <span className="bb-breadcrumb-separator">›</span>
            <span className="bb-breadcrumb-current">{currentCategoryObj.name}</span>
          </>
        )}
        {currentSellerObj && (
          <>
            <span className="bb-breadcrumb-separator">›</span>
            <span className="bb-breadcrumb-current">{currentSellerObj.name}</span>
          </>
        )}
      </nav>

      {/* Header Banner */}
      <div className="bb-plp-header">
        <div>
          <h1 className="bb-plp-title">
            {searchQuery
              ? `Search Results for "${searchQuery}"`
              : currentCategoryObj
              ? currentCategoryObj.name
              : currentSellerObj
              ? `Products from ${currentSellerObj.name}`
              : 'All Marketplace Products'}
          </h1>
          <p className="bb-plp-subtitle">
            {searchQuery
              ? `Showing verified results matching your search`
              : currentCategoryObj?.description
              ? currentCategoryObj.description
              : 'Authentic products sourced directly from registered Indian merchants'}
          </p>
        </div>

        {/* Mobile Filter Trigger */}
        <button
          type="button"
          className="bb-btn bb-btn-outline bb-mobile-filter-btn"
          onClick={() => setMobileFilterOpen(!mobileFilterOpen)}
        >
          ⚙ Filters & Sort
        </button>
      </div>

      {/* Main Layout: Sidebar Filters + Product Grid */}
      <div className="bb-plp-layout">
        {/* Filter Sidebar */}
        <aside
          className={`bb-plp-sidebar ${mobileFilterOpen ? 'open' : ''}`}
          aria-label="Product catalogue filters"
        >
          <div className="bb-filter-header">
            <span className="bb-filter-title">Filters</span>
            <button
              type="button"
              className="bb-clear-filter-btn"
              onClick={clearAllFilters}
            >
              Reset All
            </button>
          </div>

          {/* Categories Filter */}
          {categories.length > 0 && (
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
                {categories.map((cat) => (
                  <label key={cat.id} className="bb-filter-label">
                    <input
                      type="radio"
                      name="catFilter"
                      checked={activeCategory === cat.id || activeCategory === cat.slug}
                      onChange={() => setActiveCategory(cat.id)}
                    />
                    {cat.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Verified Multi-Vendor Filter */}
          {shops.length > 0 && (
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
                {shops.map((seller) => (
                  <label key={seller.id} className="bb-filter-label">
                    <input
                      type="radio"
                      name="sellerFilter"
                      checked={activeSeller === seller.id}
                      onChange={() => setActiveSeller(seller.id)}
                    />
                    {seller.name}
                  </label>
                ))}
              </div>
            </div>
          )}

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
                onChange={(e) => setMaxPrice(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Availability */}
          <div className="bb-filter-group">
            <span className="bb-filter-group-title">Availability</span>
            <label className="bb-filter-label">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              In Stock Only
            </label>
          </div>

          {/* Customer Rating */}
          <div className="bb-filter-group">
            <span className="bb-filter-group-title">Minimum Rating</span>
            <div className="bb-filter-list">
              {[4, 3, 2].map((r) => (
                <label key={r} className="bb-filter-label">
                  <input
                    type="radio"
                    name="ratingFilter"
                    checked={minRating === r}
                    onChange={() => setMinRating(r)}
                  />
                  ★ {r} stars & above
                </label>
              ))}
              <label className="bb-filter-label">
                <input
                  type="radio"
                  name="ratingFilter"
                  checked={minRating === 0}
                  onChange={() => setMinRating(0)}
                />
                Any Rating
              </label>
            </div>
          </div>
        </aside>

        {/* Product Grid Area */}
        <section className="bb-plp-content" aria-label="Catalog Products">
          {/* Top Bar: Count & Sorting */}
          <div className="bb-plp-controls">
            <span className="bb-plp-count">
              Showing <strong>{sortedProducts.length}</strong> items
            </span>

            <div className="bb-sort-wrap">
              <label htmlFor="bb-sort-select" className="bb-sort-label">
                Sort by:
              </label>
              <select
                id="bb-sort-select"
                className="bb-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="featured">Featured & Recommended</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="rating">Customer Rating</option>
                <option value="newest">Newest Arrivals</option>
              </select>
            </div>
          </div>

          {/* States: Loading, Error, Empty, List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <LoadingSpinner />
              <p style={{ marginTop: '16px', color: '#64748b' }}>Retrieving live catalogue items from database...</p>
            </div>
          ) : error ? (
            <EmptyState
              icon="⚠️"
              title="Unable to Load Products"
              description={error}
              actionText="Retry Search"
              onAction={loadData}
            />
          ) : sortedProducts.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No Products Match Your Criteria"
              description="Try adjusting your filters, searching for different keywords, or exploring other categories."
              actionText="Reset All Filters"
              onAction={clearAllFilters}
            />
          ) : (
            <div className="bb-product-grid">
              {sortedProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
