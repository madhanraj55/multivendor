import { useState, useEffect, useRef, useMemo } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import type { SellerProductItem, ProductStatus } from '../types/index.ts';
import { sellerProductsApi } from '../services/sellerProductsApi.ts';
import { EmptyState, ErrorState, LoadingSpinner } from '../components/common/StateViews.tsx';
import { ImageDropzone, type DropzoneImageItem } from '../components/common/ImageDropzone.tsx';
import './SellerProductsPage.css';

type StatusFilterTab = 'ALL' | ProductStatus;

export function SellerProductsPage() {
  const { authUser, authMode } = useMarketplace();
  const { navigate } = useRouter();

  // Data states
  const [products, setProducts] = useState<SellerProductItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Search & filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterTab>('ALL');

  // Expanded product variant cards
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());

  // Image Upload Modal States
  const [activeImageUploadProduct, setActiveImageUploadProduct] = useState<SellerProductItem | null>(null);
  const [uploadQueue, setUploadQueue] = useState<DropzoneImageItem[]>([]);
  const [savingImages, setSavingImages] = useState<boolean>(false);
  const [saveImageError, setSaveImageError] = useState<string | null>(null);
  const [saveImageSuccess, setSaveImageSuccess] = useState<string | null>(null);

  // Request race-condition guard
  const requestSeqRef = useRef<number>(0);

  // Fetch products from seller product API
  useEffect(() => {
    if (authMode !== 'AUTHENTICATED' || authUser?.role !== 'SELLER') {
      return;
    }

    const currentSeq = ++requestSeqRef.current;
    let isSubscribed = true;

    sellerProductsApi
      .getMyProducts()
      .then((data) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        setProducts(data || []);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!isSubscribed || currentSeq !== requestSeqRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to fetch seller products from server';
        setError(msg);
        setLoading(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [authMode, authUser?.role, refreshTrigger]);

  // Metric summaries
  const metrics = useMemo(() => {
    let published = 0;
    let draft = 0;
    let inactive = 0;
    let archived = 0;
    let totalAvailable = 0;
    let totalReserved = 0;
    let lowStockCount = 0;

    for (const p of products) {
      if (p.status === 'PUBLISHED') published++;
      else if (p.status === 'DRAFT') draft++;
      else if (p.status === 'INACTIVE') inactive++;
      else if (p.status === 'ARCHIVED') archived++;

      for (const v of p.variants || []) {
        const avail = v.inventory?.availableQuantity ?? 0;
        const res = v.inventory?.reservedQuantity ?? 0;
        const thresh = v.inventory?.lowStockThreshold ?? 5;

        totalAvailable += avail;
        totalReserved += res;

        if (avail <= thresh) {
          lowStockCount++;
        }
      }
    }

    return {
      total: products.length,
      published,
      draft,
      inactive,
      archived,
      totalAvailable,
      totalReserved,
      lowStockCount,
    };
  }, [products]);

  // Filtered products based on search query and status filter
  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return products.filter((p) => {
      // 1. Status Filter
      if (statusFilter !== 'ALL' && p.status !== statusFilter) {
        return false;
      }

      // 2. Search Query Filter
      if (query) {
        const matchesTitle = p.title.toLowerCase().includes(query);
        const matchesBrand = Boolean(p.brand?.toLowerCase().includes(query));
        const matchesCategory = Boolean(p.category?.name?.toLowerCase().includes(query));
        const matchesSku = p.variants?.some((v) =>
          v.sku.toLowerCase().includes(query) || v.title.toLowerCase().includes(query)
        );

        if (!matchesTitle && !matchesBrand && !matchesCategory && !matchesSku) {
          return false;
        }
      }

      return true;
    });
  }, [products, searchQuery, statusFilter]);

  // Toggle variant list expansion
  const toggleVariants = (productId: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Helper for status badge styling
  const getStatusBadge = (status: ProductStatus) => {
    switch (status) {
      case 'PUBLISHED':
        return <span className="bb-product-status-badge bb-product-status-published">● Published</span>;
      case 'DRAFT':
        return <span className="bb-product-status-badge bb-product-status-draft">● Draft</span>;
      case 'INACTIVE':
        return <span className="bb-product-status-badge bb-product-status-inactive">● Inactive</span>;
      case 'ARCHIVED':
        return <span className="bb-product-status-badge bb-product-status-archived">● Archived</span>;
      default:
        return <span className="bb-product-status-badge">{status}</span>;
    }
  };

  // Helper for computing price range string
  const formatPriceRange = (item: SellerProductItem) => {
    if (!item.variants || item.variants.length === 0) {
      return { priceText: 'No variants', mrpText: null };
    }

    if (item.variants.length === 1) {
      const v = item.variants[0];
      const p = Number(v.price) || 0;
      const m = Number(v.mrp) || 0;
      return {
        priceText: `₹${p.toLocaleString('en-IN')}`,
        mrpText: m > p ? `₹${m.toLocaleString('en-IN')}` : null,
      };
    }

    const prices = item.variants.map((v) => Number(v.price) || 0);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    if (min === max) {
      return { priceText: `₹${min.toLocaleString('en-IN')}`, mrpText: null };
    }

    return {
      priceText: `₹${min.toLocaleString('en-IN')} - ₹${max.toLocaleString('en-IN')}`,
      mrpText: null,
    };
  };

  // Helper for computing total available and reserved stock of a product
  const getProductStockSummary = (item: SellerProductItem) => {
    let available = 0;
    let reserved = 0;
    let isLow = false;

    for (const v of item.variants || []) {
      const qty = v.inventory?.availableQuantity ?? 0;
      const res = v.inventory?.reservedQuantity ?? 0;
      const thresh = v.inventory?.lowStockThreshold ?? 5;

      available += qty;
      reserved += res;

      if (qty <= thresh) {
        isLow = true;
      }
    }

    return { available, reserved, isLow };
  };

  // Helper for finding primary thumbnail
  const getProductThumbnail = (item: SellerProductItem): string | null => {
    if (!item.images || item.images.length === 0) return null;
    const thumb = item.images.find((img) => img.isThumbnail);
    return thumb?.url || item.images[0].url;
  };

  // Save uploaded images from dropzone queue to active product
  const handleSaveImagesToProduct = async () => {
    if (!activeImageUploadProduct) return;

    const readyItems = uploadQueue.filter(
      (it) => it.status === 'UPLOADED' && it.url
    );

    if (readyItems.length === 0) {
      setSaveImageError('No uploaded images are ready to save. Please upload a file or enter an image URL.');
      return;
    }

    setSavingImages(true);
    setSaveImageError(null);
    setSaveImageSuccess(null);

    try {
      const currentImagesCount = activeImageUploadProduct.images?.length || 0;

      for (let i = 0; i < readyItems.length; i++) {
        const item = readyItems[i];
        await sellerProductsApi.addProductImage(activeImageUploadProduct.id, {
          url: item.url!,
          altText: item.altText || activeImageUploadProduct.title,
          isThumbnail: item.isThumbnail,
          sortOrder: currentImagesCount + i,
        });
      }

      setSaveImageSuccess(`Successfully added ${readyItems.length} image(s) to product.`);
      setSavingImages(false);
      setRefreshTrigger((prev) => prev + 1);

      setTimeout(() => {
        setActiveImageUploadProduct(null);
        setSaveImageSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to attach image to product';
      setSaveImageError(msg);
      setSavingImages(false);
    }
  };

  // Delete an existing image from active product
  const handleDeleteExistingImage = async (productId: string, imageId: string) => {
    try {
      setSavingImages(true);
      await sellerProductsApi.deleteProductImage(imageId);
      setActiveImageUploadProduct((prev) => {
        if (!prev || prev.id !== productId) return prev;
        return {
          ...prev,
          images: (prev.images || []).filter((img) => img.id !== imageId),
        };
      });
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete image';
      setSaveImageError(msg);
    } finally {
      setSavingImages(false);
    }
  };

  return (
    <div className="bb-container bb-seller-products-container">
      {/* Header Banner */}
      <div className="bb-seller-products-header">
        <div className="bb-seller-products-title-area">
          <div className="bb-seller-products-badge-row">
            <span className="bb-seller-products-badge bb-seller-products-badge-vendor">
              🏬 Vendor Portal
            </span>
            {authUser?.shop?.name && (
              <span className="bb-seller-products-badge" style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff' }}>
                {authUser.shop.name}
              </span>
            )}
          </div>
          <h1 className="bb-seller-products-title">Product Catalogue</h1>
          <p className="bb-seller-products-desc">
            Monitor live stock levels, check variant pricing, and review catalogue status across your shop&apos;s product listings.
          </p>
        </div>

        <div className="bb-seller-products-header-actions">
          <button
            type="button"
            className="bb-btn-seller-orders"
            onClick={() => navigate('/seller/orders')}
            title="View vendor customer orders"
          >
            📦 Vendor Orders
          </button>
          <button
            type="button"
            className="bb-btn-refresh"
            onClick={() => {
              setLoading(true);
              setError(null);
              setRefreshTrigger((prev) => prev + 1);
            }}
            disabled={loading}
            title="Reload catalogue from server"
          >
            🔄 {loading ? 'Refreshing...' : 'Refresh Catalogue'}
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="bb-seller-metrics-grid">
        <div className="bb-seller-metric-card">
          <div className="bb-seller-metric-icon">📦</div>
          <div className="bb-seller-metric-info">
            <span className="bb-seller-metric-value">{metrics.total}</span>
            <span className="bb-seller-metric-label">Total Products</span>
          </div>
        </div>

        <div className="bb-seller-metric-card">
          <div className="bb-seller-metric-icon" style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
            ✓
          </div>
          <div className="bb-seller-metric-info">
            <span className="bb-seller-metric-value">{metrics.published}</span>
            <span className="bb-seller-metric-label">Published</span>
          </div>
        </div>

        <div className="bb-seller-metric-card">
          <div className="bb-seller-metric-icon" style={{ backgroundColor: '#fef3c7', color: '#b45309' }}>
            📝
          </div>
          <div className="bb-seller-metric-info">
            <span className="bb-seller-metric-value">{metrics.draft}</span>
            <span className="bb-seller-metric-label">Draft / Inactive</span>
          </div>
        </div>

        <div className="bb-seller-metric-card">
          <div className="bb-seller-metric-icon" style={{ backgroundColor: '#eff6ff', color: '#1e40af' }}>
            📊
          </div>
          <div className="bb-seller-metric-info">
            <span className="bb-seller-metric-value">{metrics.totalAvailable}</span>
            <span className="bb-seller-metric-label">Available Units</span>
          </div>
        </div>

        {metrics.lowStockCount > 0 && (
          <div className="bb-seller-metric-card" style={{ borderColor: '#fed7aa' }}>
            <div className="bb-seller-metric-icon" style={{ backgroundColor: '#fff7ed', color: '#c2410c' }}>
              ⚠️
            </div>
            <div className="bb-seller-metric-info">
              <span className="bb-seller-metric-value" style={{ color: '#c2410c' }}>
                {metrics.lowStockCount}
              </span>
              <span className="bb-seller-metric-label">Low Stock Variants</span>
            </div>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bb-seller-filter-bar">
        <div className="bb-seller-search-row">
          <div className="bb-seller-search-wrapper">
            <span className="bb-seller-search-icon">🔍</span>
            <input
              type="text"
              className="bb-seller-search-input"
              placeholder="Search catalogue by product title, variant SKU, category, or brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search product catalogue"
            />
            {searchQuery && (
              <button
                type="button"
                className="bb-seller-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="bb-seller-status-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'ALL'}
            className={`bb-seller-status-tab ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            All Products <span className="bb-seller-status-count">{metrics.total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'PUBLISHED'}
            className={`bb-seller-status-tab ${statusFilter === 'PUBLISHED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('PUBLISHED')}
          >
            Published <span className="bb-seller-status-count">{metrics.published}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'DRAFT'}
            className={`bb-seller-status-tab ${statusFilter === 'DRAFT' ? 'active' : ''}`}
            onClick={() => setStatusFilter('DRAFT')}
          >
            Draft <span className="bb-seller-status-count">{metrics.draft}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'INACTIVE'}
            className={`bb-seller-status-tab ${statusFilter === 'INACTIVE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('INACTIVE')}
          >
            Inactive <span className="bb-seller-status-count">{metrics.inactive}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'ARCHIVED'}
            className={`bb-seller-status-tab ${statusFilter === 'ARCHIVED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ARCHIVED')}
          >
            Archived <span className="bb-seller-status-count">{metrics.archived}</span>
          </button>
        </div>
      </div>

      {/* Main Content States */}
      {loading ? (
        <div style={{ padding: '60px 0' }}>
          <LoadingSpinner />
        </div>
      ) : error ? (
        <ErrorState
          title="Could Not Load Product Catalogue"
          description={error}
          onRetry={() => {
            setLoading(true);
            setError(null);
            setRefreshTrigger((prev) => prev + 1);
          }}
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No Products in Your Catalogue"
          description="Your vendor shop has no registered products. Products listed through your vendor portal will appear here with live stock balances."
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No Matching Products Found"
          description={`No products match your current search "${searchQuery}" and status filter.`}
          actionText="Clear Filters"
          onAction={() => {
            setSearchQuery('');
            setStatusFilter('ALL');
          }}
        />
      ) : (
        <div className="bb-seller-product-list">
          {filteredProducts.map((item) => {
            const thumbUrl = getProductThumbnail(item);
            const { priceText, mrpText } = formatPriceRange(item);
            const { available, reserved, isLow } = getProductStockSummary(item);
            const isExpanded = expandedProductIds.has(item.id);
            const variantCount = item.variants?.length || 0;

            return (
              <div key={item.id} className="bb-seller-product-card">
                <div className="bb-seller-product-card-main">
                  {/* Thumbnail */}
                  <div className="bb-seller-product-thumb-wrapper">
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={item.title}
                        className="bb-seller-product-thumb"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="bb-seller-product-thumb-fallback">🛍️</span>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="bb-seller-product-info">
                    <div className="bb-seller-product-meta-row">
                      {item.category?.name && (
                        <span className="bb-seller-product-tag bb-seller-product-category">
                          📁 {item.category.name}
                        </span>
                      )}
                      {item.brand && (
                        <span className="bb-seller-product-tag bb-seller-product-brand">
                          🏷️ {item.brand}
                        </span>
                      )}
                      {getStatusBadge(item.status)}
                    </div>

                    <div className="bb-seller-product-title-row">
                      <h3 className="bb-seller-product-title">{item.title}</h3>
                      <span className="bb-seller-product-slug">/{item.slug}</span>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="bb-seller-product-metrics">
                    {/* Variants */}
                    <div className="bb-seller-product-metric-group">
                      <span className="bb-seller-product-metric-label">Variants</span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'bold', color: 'var(--color-slate-800)' }}>
                        {variantCount} {variantCount === 1 ? 'Variant' : 'Variants'}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="bb-seller-product-metric-group">
                      <span className="bb-seller-product-metric-label">Price</span>
                      <div className="bb-seller-product-price">
                        {priceText}
                        {mrpText && <span className="bb-seller-product-mrp">{mrpText}</span>}
                      </div>
                    </div>

                    {/* Stock */}
                    <div className="bb-seller-product-metric-group">
                      <span className="bb-seller-product-metric-label">Live Stock</span>
                      <div>
                        {available === 0 ? (
                          <span className="bb-seller-product-stock-pill bb-stock-out">Out of Stock</span>
                        ) : isLow ? (
                          <span className="bb-seller-product-stock-pill bb-stock-low">
                            ⚠️ {available} in stock
                          </span>
                        ) : (
                          <span className="bb-seller-product-stock-pill bb-stock-in">
                            ✓ {available} in stock
                          </span>
                        )}
                        {reserved > 0 && (
                          <div className="bb-seller-product-reserved">
                            ({reserved} reserved)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="bb-seller-product-actions">
                    <button
                      type="button"
                      className="bb-btn-upload-image"
                      onClick={() => {
                        setActiveImageUploadProduct(item);
                        setUploadQueue([]);
                        setSaveImageError(null);
                        setSaveImageSuccess(null);
                      }}
                      aria-label={`Manage images for ${item.title}`}
                    >
                      📷 Manage Images
                    </button>
                    {variantCount > 0 && (
                      <button
                        type="button"
                        className={`bb-btn-toggle-variants ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => toggleVariants(item.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Hide Variants ▲' : `View Variants (${variantCount}) ▼`}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Variants Details */}
                {isExpanded && item.variants && item.variants.length > 0 && (
                  <div className="bb-seller-variants-section">
                    <div className="bb-seller-variants-header">
                      <h4 className="bb-seller-variants-title">Variant Specifications & Inventory</h4>
                    </div>

                    <div className="bb-seller-variants-table-wrapper">
                      <table className="bb-seller-variants-table">
                        <thead>
                          <tr>
                            <th>Status</th>
                            <th>SKU</th>
                            <th>Variant Title</th>
                            <th>Attributes</th>
                            <th>Selling Price</th>
                            <th>MRP</th>
                            <th>Available Qty</th>
                            <th>Reserved Qty</th>
                            <th>Threshold</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.variants.map((v) => {
                            const avail = v.inventory?.availableQuantity ?? 0;
                            const res = v.inventory?.reservedQuantity ?? 0;
                            const thresh = v.inventory?.lowStockThreshold ?? 5;
                            const isVariantLow = avail <= thresh;

                            return (
                              <tr key={v.id}>
                                <td>
                                  <span
                                    className={`bb-variant-status-dot ${v.isActive ? 'active' : 'inactive'}`}
                                    title={v.isActive ? 'Active Variant' : 'Inactive Variant'}
                                  />
                                  {v.isActive ? 'Active' : 'Inactive'}
                                </td>
                                <td>
                                  <span className="bb-variant-sku-code">{v.sku}</span>
                                </td>
                                <td>{v.title}</td>
                                <td>
                                  <div className="bb-variant-attr-chips">
                                    {v.attributes && typeof v.attributes === 'object' && Object.keys(v.attributes).length > 0 ? (
                                      Object.entries(v.attributes).map(([key, val]) => (
                                        <span key={key} className="bb-variant-attr-chip">
                                          {key}: {String(val)}
                                        </span>
                                      ))
                                    ) : (
                                      <span style={{ color: 'var(--color-slate-400)' }}>None</span>
                                    )}
                                  </div>
                                </td>
                                <td style={{ fontWeight: 'bold' }}>
                                  ₹{Number(v.price).toLocaleString('en-IN')}
                                </td>
                                <td style={{ color: 'var(--color-slate-500)' }}>
                                  ₹{Number(v.mrp).toLocaleString('en-IN')}
                                </td>
                                <td>
                                  <span
                                    style={{
                                      fontWeight: 'bold',
                                      color: avail === 0 ? '#dc2626' : isVariantLow ? '#ea580c' : '#16a34a',
                                    }}
                                  >
                                    {avail}
                                  </span>
                                </td>
                                <td style={{ color: 'var(--color-slate-500)' }}>{res}</td>
                                <td style={{ color: 'var(--color-slate-500)' }}>{thresh}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image Management & Drag-and-Drop Upload Modal */}
      {activeImageUploadProduct && (
        <div
          className="bb-modal-backdrop"
          onClick={() => {
            if (!savingImages) {
              setActiveImageUploadProduct(null);
              setSaveImageError(null);
              setSaveImageSuccess(null);
            }
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-upload-title"
        >
          <div className="bb-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="bb-modal-header">
              <h3 id="modal-upload-title" className="bb-modal-title">
                Manage Images: {activeImageUploadProduct.title}
              </h3>
              <button
                type="button"
                className="bb-modal-close-btn"
                onClick={() => {
                  if (!savingImages) {
                    setActiveImageUploadProduct(null);
                    setSaveImageError(null);
                    setSaveImageSuccess(null);
                  }
                }}
                disabled={savingImages}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="bb-modal-body">
              {saveImageError && (
                <div className="bb-dropzone-error-alert" style={{ marginBottom: '1rem' }}>
                  ⚠️ {saveImageError}
                </div>
              )}
              {saveImageSuccess && (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.75rem 1rem',
                    backgroundColor: '#dcfce7',
                    border: '1px solid #86efac',
                    color: '#15803d',
                    borderRadius: '8px',
                    fontWeight: 600,
                  }}
                >
                  ✓ {saveImageSuccess}
                </div>
              )}

              {/* Existing Product Images */}
              {activeImageUploadProduct.images && activeImageUploadProduct.images.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--color-slate-600)' }}>
                    Current Product Images ({activeImageUploadProduct.images.length})
                  </h4>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {activeImageUploadProduct.images.map((img) => (
                      <div
                        key={img.id}
                        style={{
                          position: 'relative',
                          width: '100px',
                          border: '1px solid var(--color-slate-200)',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          background: '#fff',
                        }}
                      >
                        <img
                          src={img.url}
                          alt="Product thumbnail"
                          style={{ width: '100px', height: '80px', objectFit: 'cover', display: 'block' }}
                        />
                        {img.isThumbnail && (
                          <span
                            style={{
                              position: 'absolute',
                              top: '4px',
                              left: '4px',
                              background: '#2563eb',
                              color: '#fff',
                              fontSize: '0.65rem',
                              padding: '1px 4px',
                              borderRadius: '4px',
                            }}
                          >
                            Thumbnail
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteExistingImage(activeImageUploadProduct.id, img.id)}
                          disabled={savingImages}
                          style={{
                            width: '100%',
                            padding: '4px',
                            fontSize: '0.75rem',
                            color: '#dc2626',
                            background: '#fef2f2',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Drag and Drop Image Uploader */}
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--color-slate-600)' }}>
                Upload New Images
              </h4>
              <ImageDropzone
                onImagesChange={setUploadQueue}
                maxFiles={8}
                maxFileSizeMb={5}
                autoUpload={true}
              />
            </div>

            <div className="bb-modal-footer">
              <button
                type="button"
                className="bb-btn bb-btn-secondary"
                onClick={() => {
                  setActiveImageUploadProduct(null);
                  setSaveImageError(null);
                  setSaveImageSuccess(null);
                }}
                disabled={savingImages}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bb-btn bb-btn-primary"
                onClick={handleSaveImagesToProduct}
                disabled={savingImages || uploadQueue.length === 0}
              >
                {savingImages ? 'Saving Images...' : 'Save Uploaded Images to Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
