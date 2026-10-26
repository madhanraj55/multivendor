import { useState, useEffect, useRef, useMemo } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import type { SellerProductItem, ProductStatus, BackendCategory } from '../types/index.ts';
import { sellerProductsApi, validatePriceAgainstMrp } from '../services/sellerProductsApi.ts';
import { categoriesApi } from '../services/categoriesApi.ts';
import { EmptyState, ErrorState, LoadingSpinner } from '../components/common/StateViews.tsx';
import { ImageDropzone, type DropzoneImageItem } from '../components/common/ImageDropzone.tsx';
import './SellerProductsPage.css';

type StatusFilterTab = 'ALL' | ProductStatus;

interface SampleProductTemplate {
  id: string;
  name: string;
  title: string;
  brand: string;
  categoryKeywords: string[];
  description: string;
  skuPrefix: string;
  variantTitle: string;
  mrp: string;
  price: string;
  initialStock: string;
  imageUrl: string;
}

const SAMPLE_PRODUCT_TEMPLATES: SampleProductTemplate[] = [
  {
    id: 'kashmiri-shawl',
    name: '🧣 Handcrafted Kashmiri Pashmina Shawl',
    title: 'Handcrafted Kashmiri Pashmina Shawl',
    brand: 'Royal Heritage',
    categoryKeywords: ['fashion', 'apparel', 'clothing', 'handicraft', 'textile', 'shawl'],
    description: 'Authentic 100% pure Cashmere wool shawl, handwoven by master artisans of Srinagar. Features intricate Sozni needlework embroidery and ultra-soft, warm natural texture.',
    skuPrefix: 'KASH-SHAWL',
    variantTitle: 'Standard / Free Size',
    mrp: '2999',
    price: '2499',
    initialStock: '15',
    imageUrl: 'https://images.unsplash.com/photo-1607522370275-f14206abe5d3?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'wireless-earbuds',
    name: '🎧 Wireless ANC Bluetooth Earbuds',
    title: 'SoundWave Pro True Wireless Noise Cancelling Earbuds',
    brand: 'SoundWave',
    categoryKeywords: ['electronic', 'gadget', 'audio', 'headphone', 'tech'],
    description: 'High-performance Bluetooth 5.3 earbuds featuring 32dB active noise cancellation, deep bass dynamic drivers, 40-hour total playback battery life, and IPX5 splash resistance.',
    skuPrefix: 'EARBUD-PRO',
    variantTitle: 'Midnight Black',
    mrp: '2499',
    price: '1499',
    initialStock: '25',
    imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'assam-tea',
    name: '🍵 Pure Assam CTC Orthodox Black Tea (500g)',
    title: 'Brahmaputra Reserve Single Origin CTC Black Tea 500g',
    brand: 'Brahmaputra Valley',
    categoryKeywords: ['grocer', 'food', 'tea', 'beverage', 'gourmet'],
    description: 'Premium fresh-harvest golden orthodox CTC black tea leaves from Assam upper estates. Delivers a rich, malty aroma, deep amber liquor, and full-bodied traditional chai flavor.',
    skuPrefix: 'ASSAM-TEA-500',
    variantTitle: '500g Pouch',
    mrp: '599',
    price: '449',
    initialStock: '30',
    imageUrl: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'terracotta-jug',
    name: '🏺 Handcrafted Terracotta Clay Water Jug (1.5L)',
    title: 'Natural Terracotta Clay Alkaline Water Carafe 1.5L',
    brand: 'Mitti Magic',
    categoryKeywords: ['home', 'living', 'kitchen', 'pottery', 'decor', 'craft'],
    description: 'Handmade eco-friendly earthen clay pitcher cured with natural herbs. Keeps drinking water naturally chilled and alkaline without electricity or artificial coatings.',
    skuPrefix: 'MITTI-JUG-15L',
    variantTitle: 'Natural Clay / 1.5 Litre',
    mrp: '799',
    price: '549',
    initialStock: '20',
    imageUrl: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'brass-diya',
    name: '🪔 Pure Brass Akhand Deep Puja Diya',
    title: 'Solid Brass Traditional Akhand Oil Diya with Glass Chimney',
    brand: 'Vedica Arts',
    categoryKeywords: ['puja', 'spiritual', 'decor', 'home', 'brass', 'handicraft'],
    description: 'Heavy gauge solid brass oil lamp with heat-resistant borosilicate glass chimney. Burns for up to 24 hours continuously without flame disturbance. Ideal for festive occasions and daily puja.',
    skuPrefix: 'BRASS-DIYA-MED',
    variantTitle: 'Medium / 5.5 Inch',
    mrp: '999',
    price: '749',
    initialStock: '18',
    imageUrl: 'https://images.unsplash.com/photo-1605371924599-2d0365da1ae0?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'coconut-oil',
    name: '🥥 Organic Cold-Pressed Virgin Coconut Oil (1L)',
    title: 'Malabar Cold Pressed Wood Churned Virgin Coconut Oil 1000ml',
    brand: 'Malabar Heritage',
    categoryKeywords: ['beauty', 'wellness', 'organic', 'health', 'oil', 'food', 'grocer'],
    description: '100% unrefined, cold-pressed raw coconut oil extracted from fresh Kerala coconuts. Free from sulphur, preservatives, and heat processing. Perfect for dietary cooking and nourishing skin/hair care.',
    skuPrefix: 'COCO-OIL-1L',
    variantTitle: '1 Litre Glass Bottle',
    mrp: '650',
    price: '499',
    initialStock: '24',
    imageUrl: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=800&q=80',
  },
];

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

  // Create Product Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [categories, setCategories] = useState<BackendCategory[]>([]);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newBrand, setNewBrand] = useState<string>('');
  const [newCategoryId, setNewCategoryId] = useState<string>('');
  const [newSku, setNewSku] = useState<string>('');
  const [newVariantTitle, setNewVariantTitle] = useState<string>('Standard');
  const [newMrp, setNewMrp] = useState<string>('');
  const [newPrice, setNewPrice] = useState<string>('');
  const [newInitialStock, setNewInitialStock] = useState<string>('10');
  const [newImageUrl, setNewImageUrl] = useState<string>('');
  const [creatingProduct, setCreatingProduct] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Quick Sample & Import States
  const [selectedSampleId, setSelectedSampleId] = useState<string>('');
  const [sampleImportNotice, setSampleImportNotice] = useState<string | null>(null);
  const [isJsonImportExpanded, setIsJsonImportExpanded] = useState<boolean>(false);
  const [jsonInputText, setJsonInputText] = useState<string>('');
  const [jsonImportError, setJsonImportError] = useState<string | null>(null);

  // Edit Product Modal States
  const [editingProduct, setEditingProduct] = useState<SellerProductItem | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editBrand, setEditBrand] = useState<string>('');
  const [editCategoryId, setEditCategoryId] = useState<string>('');
  const [editStatus, setEditStatus] = useState<ProductStatus>('PUBLISHED');
  const [updatingProduct, setUpdatingProduct] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  // Stock Adjustment Modal States
  const [adjustingVariant, setAdjustingVariant] = useState<{
    variant: SellerProductItem['variants'][0];
    product: SellerProductItem;
  } | null>(null);
  const [stockDelta, setStockDelta] = useState<string>('');
  const [stockNotes, setStockNotes] = useState<string>('Inventory restock');
  const [adjustingStock, setAdjustingStock] = useState<boolean>(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockSuccess, setStockSuccess] = useState<string | null>(null);

  // Edit Variant Modal States
  const [editingVariant, setEditingVariant] = useState<{
    variant: SellerProductItem['variants'][0];
    product: SellerProductItem;
  } | null>(null);
  const [variantTitle, setVariantTitle] = useState<string>('');
  const [variantSku, setVariantSku] = useState<string>('');
  const [variantMrp, setVariantMrp] = useState<string>('');
  const [variantPrice, setVariantPrice] = useState<string>('');
  const [updatingVariant, setUpdatingVariant] = useState<boolean>(false);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [variantSuccess, setVariantSuccess] = useState<string | null>(null);

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 10;

  // Request race-condition guard
  const requestSeqRef = useRef<number>(0);

  // Fetch categories on mount
  useEffect(() => {
    categoriesApi
      .getCategories()
      .then((data) => {
        setCategories(data || []);
        if (data && data.length > 0) {
          setNewCategoryId(data[0].id);
        }
      })
      .catch(() => {
        setCategories([]);
      });
  }, []);

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

  // Reset page when search or status filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Total pages and paginated slice
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE) || 1;
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(startIndex, startIndex + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

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

  // Handle creating brand new product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);

    const mrpNum = parseFloat(newMrp);
    const priceNum = parseFloat(newPrice);
    const stockNum = parseInt(newInitialStock, 10);

    if (!newTitle.trim()) {
      setCreateError('Product title is required.');
      return;
    }
    if (!newCategoryId) {
      setCreateError('Please select a category.');
      return;
    }
    if (!newSku.trim()) {
      setCreateError('SKU code is required.');
      return;
    }
    if (isNaN(mrpNum) || isNaN(priceNum)) {
      setCreateError('Valid MRP and Selling Price numbers are required.');
      return;
    }
    if (!validatePriceAgainstMrp(priceNum, mrpNum)) {
      setCreateError('Selling price cannot exceed Maximum Retail Price (MRP).');
      return;
    }
    if (isNaN(stockNum) || stockNum < 0) {
      setCreateError('Initial stock quantity must be 0 or higher.');
      return;
    }

    setCreatingProduct(true);
    try {
      await sellerProductsApi.createProduct({
        categoryId: newCategoryId,
        title: newTitle.trim(),
        description: newDescription.trim() || newTitle.trim(),
        brand: newBrand.trim() || undefined,
        variants: [
          {
            sku: newSku.trim().toUpperCase(),
            title: newVariantTitle.trim() || 'Standard',
            mrp: mrpNum,
            price: priceNum,
            attributes: {},
            initialStock: stockNum,
          },
        ],
        images: newImageUrl.trim()
          ? [
              {
                url: newImageUrl.trim(),
                isThumbnail: true,
                sortOrder: 0,
              },
            ]
          : undefined,
      });

      setCreateSuccess('Product published successfully! It is now visible in the customer store.');
      setRefreshTrigger((prev) => prev + 1);

      // Reset form
      setNewTitle('');
      setNewDescription('');
      setNewBrand('');
      setNewSku('');
      setNewMrp('');
      setNewPrice('');
      setNewInitialStock('10');
      setNewImageUrl('');
      setSelectedSampleId('');
      setSampleImportNotice(null);

      setTimeout(() => {
        setIsCreateModalOpen(false);
        setCreateSuccess(null);
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create product on backend';
      setCreateError(msg);
    } finally {
      setCreatingProduct(false);
    }
  };

  // Handle loading a predefined sample product template
  const handleLoadSampleTemplate = (templateId: string) => {
    const tmpl = SAMPLE_PRODUCT_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;

    setNewTitle(tmpl.title);
    setNewBrand(tmpl.brand);
    setNewDescription(tmpl.description);

    // Generate unique SKU with random suffix to avoid DB uniqueness conflicts
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setNewSku(`${tmpl.skuPrefix}-${randomSuffix}`);
    setNewVariantTitle(tmpl.variantTitle);
    setNewMrp(tmpl.mrp);
    setNewPrice(tmpl.price);
    setNewInitialStock(tmpl.initialStock);
    setNewImageUrl(tmpl.imageUrl);

    // Smart category matching against fetched backend categories
    if (categories.length > 0) {
      const matched = categories.find((cat) => {
        const nameLower = (cat.name || '').toLowerCase();
        const slugLower = (cat.slug || '').toLowerCase();
        return tmpl.categoryKeywords.some(
          (k) => nameLower.includes(k) || slugLower.includes(k)
        );
      });
      if (matched) {
        setNewCategoryId(matched.id);
      } else if (!newCategoryId) {
        setNewCategoryId(categories[0].id);
      }
    }

    setCreateError(null);
    setSelectedSampleId(templateId);
    setSampleImportNotice(`✓ Loaded "${tmpl.title}" template! All fields populated with authentic details.`);
  };

  // Clear all fields in the create form back to empty
  const handleClearCreateForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewBrand('');
    setNewSku('');
    setNewVariantTitle('Standard');
    setNewMrp('');
    setNewPrice('');
    setNewInitialStock('10');
    setNewImageUrl('');
    setSelectedSampleId('');
    setSampleImportNotice(null);
    setCreateError(null);
  };

  // Import custom product data from pasted JSON
  const handleImportJson = (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (!data || typeof data !== 'object') {
        throw new Error('Imported data must be a valid JSON object.');
      }

      if (data.title) setNewTitle(String(data.title));
      if (data.brand !== undefined) setNewBrand(String(data.brand));
      if (data.description !== undefined) setNewDescription(String(data.description));

      if (data.sku) {
        const rawSku = String(data.sku).trim();
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        setNewSku(rawSku.includes('-') ? rawSku : `${rawSku}-${randomSuffix}`);
      } else if (data.title) {
        const slug = String(data.title).toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 10);
        setNewSku(`${slug}-${Math.floor(1000 + Math.random() * 9000)}`);
      }

      if (data.variantTitle || data.variantName) {
        setNewVariantTitle(String(data.variantTitle || data.variantName));
      }
      if (data.mrp !== undefined) setNewMrp(String(data.mrp));
      if (data.price !== undefined) setNewPrice(String(data.price));
      if (data.initialStock !== undefined || data.stock !== undefined) {
        setNewInitialStock(String(data.initialStock ?? data.stock));
      }
      if (data.imageUrl || data.image || data.primaryImage) {
        setNewImageUrl(String(data.imageUrl || data.image || data.primaryImage));
      }

      // Check category match
      if (data.category && categories.length > 0) {
        const catStr = String(data.category).toLowerCase();
        const matched = categories.find(
          (c) =>
            c.name.toLowerCase().includes(catStr) ||
            c.id === data.categoryId ||
            (c.slug && c.slug.toLowerCase().includes(catStr))
        );
        if (matched) {
          setNewCategoryId(matched.id);
        }
      } else if (data.categoryId) {
        setNewCategoryId(String(data.categoryId));
      }

      setCreateError(null);
      setSampleImportNotice('✓ Successfully imported product details from JSON!');
      setIsJsonImportExpanded(false);
      setJsonImportError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON format.';
      setJsonImportError(`Failed to parse JSON: ${msg}`);
    }
  };

  // Open Edit Product Modal
  const handleOpenEditProduct = (prod: SellerProductItem) => {
    setEditingProduct(prod);
    setEditTitle(prod.title);
    setEditDescription(prod.description || '');
    setEditBrand(prod.brand || '');
    setEditCategoryId(prod.categoryId);
    setEditStatus(prod.status);
    setEditError(null);
    setEditSuccess(null);
  };

  // Submit Edit Product
  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    if (!editTitle.trim()) {
      setEditError('Product title cannot be empty.');
      return;
    }
    if (!editCategoryId) {
      setEditError('Category is required.');
      return;
    }

    setUpdatingProduct(true);
    setEditError(null);
    setEditSuccess(null);

    try {
      await sellerProductsApi.updateProduct(editingProduct.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        brand: editBrand.trim() || undefined,
        categoryId: editCategoryId,
        status: editStatus,
      });

      setEditSuccess('Product updated successfully!');
      setRefreshTrigger((prev) => prev + 1);

      setTimeout(() => {
        setEditingProduct(null);
        setEditSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update product';
      setEditError(msg);
    } finally {
      setUpdatingProduct(false);
    }
  };

  // Open Adjust Stock Modal
  const handleOpenAdjustStock = (product: SellerProductItem, variant: SellerProductItem['variants'][0]) => {
    setAdjustingVariant({ variant, product });
    setStockDelta('');
    setStockNotes('Inventory restock');
    setStockError(null);
    setStockSuccess(null);
  };

  // Submit Stock Adjustment
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingVariant) return;

    const delta = parseInt(stockDelta, 10);
    if (isNaN(delta) || delta === 0) {
      setStockError('Enter a valid non-zero stock adjustment quantity (e.g. +10 or -5).');
      return;
    }

    const currentQty = adjustingVariant.variant.inventory?.availableQuantity ?? 0;
    if (currentQty + delta < 0) {
      setStockError(`Cannot reduce stock by ${Math.abs(delta)}. Current stock is ${currentQty}.`);
      return;
    }

    setAdjustingStock(true);
    setStockError(null);
    setStockSuccess(null);

    try {
      await sellerProductsApi.adjustStock({
        variantId: adjustingVariant.variant.id,
        quantity: delta,
        notes: stockNotes.trim() || undefined,
      });

      setStockSuccess(`Stock adjusted by ${delta > 0 ? `+${delta}` : delta} units!`);
      setRefreshTrigger((prev) => prev + 1);

      setTimeout(() => {
        setAdjustingVariant(null);
        setStockSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to adjust stock';
      setStockError(msg);
    } finally {
      setAdjustingStock(false);
    }
  };

  // Open Edit Variant Modal
  const handleOpenEditVariant = (product: SellerProductItem, variant: SellerProductItem['variants'][0]) => {
    setEditingVariant({ variant, product });
    setVariantTitle(variant.title || '');
    setVariantSku(variant.sku || '');
    setVariantMrp(String(variant.mrp));
    setVariantPrice(String(variant.price));
    setVariantError(null);
    setVariantSuccess(null);
  };

  // Submit Edit Variant
  const handleUpdateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVariant) return;

    const mrpNum = parseFloat(variantMrp);
    const priceNum = parseFloat(variantPrice);

    if (!variantSku.trim()) {
      setVariantError('SKU code is required.');
      return;
    }
    if (isNaN(mrpNum) || isNaN(priceNum)) {
      setVariantError('Valid MRP and Price numbers are required.');
      return;
    }
    if (!validatePriceAgainstMrp(priceNum, mrpNum)) {
      setVariantError('Selling price cannot exceed MRP.');
      return;
    }

    setUpdatingVariant(true);
    setVariantError(null);
    setVariantSuccess(null);

    try {
      await sellerProductsApi.updateVariant(editingVariant.variant.id, {
        sku: variantSku.trim().toUpperCase(),
        title: variantTitle.trim() || 'Standard',
        mrp: mrpNum,
        price: priceNum,
      });

      setVariantSuccess('Variant updated successfully!');
      setRefreshTrigger((prev) => prev + 1);

      setTimeout(() => {
        setEditingVariant(null);
        setVariantSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update variant';
      setVariantError(msg);
    } finally {
      setUpdatingVariant(false);
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
            Monitor live stock levels, check variant pricing, and publish new products to your marketplace catalogue.
          </p>
        </div>

        <div className="bb-seller-products-header-actions">
          <button
            type="button"
            className="bb-btn bb-btn-primary"
            onClick={() => {
              setCreateError(null);
              setCreateSuccess(null);
              setSampleImportNotice(null);
              setIsCreateModalOpen(true);
            }}
            style={{ fontWeight: 'bold' }}
            title="Add a new product to catalogue"
          >
            + Add New Product
          </button>
          <button
            type="button"
            className="bb-btn-import-sample"
            onClick={() => {
              setCreateError(null);
              setCreateSuccess(null);
              handleLoadSampleTemplate(SAMPLE_PRODUCT_TEMPLATES[0].id);
              setIsCreateModalOpen(true);
            }}
            title="Quickly open and import a sample product template"
          >
            ✨ Quick Import Sample
          </button>
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
            🔄 {loading ? 'Refreshing...' : 'Refresh'}
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
          <div className="bb-seller-metric-icon bb-seller-metric-icon-published">
            ✓
          </div>
          <div className="bb-seller-metric-info">
            <span className="bb-seller-metric-value">{metrics.published}</span>
            <span className="bb-seller-metric-label">Published</span>
          </div>
        </div>

        <div className="bb-seller-metric-card">
          <div className="bb-seller-metric-icon bb-seller-metric-icon-draft">
            📝
          </div>
          <div className="bb-seller-metric-info">
            <span className="bb-seller-metric-value">{metrics.draft}</span>
            <span className="bb-seller-metric-label">Draft / Inactive</span>
          </div>
        </div>

        <div className="bb-seller-metric-card">
          <div className="bb-seller-metric-icon bb-seller-metric-icon-available">
            📊
          </div>
          <div className="bb-seller-metric-info">
            <span className="bb-seller-metric-value">{metrics.totalAvailable}</span>
            <span className="bb-seller-metric-label">Available Units</span>
          </div>
        </div>

        {metrics.lowStockCount > 0 && (
          <div className="bb-seller-metric-card bb-seller-metric-card-lowstock">
            <div className="bb-seller-metric-icon bb-seller-metric-icon-lowstock">
              ⚠️
            </div>
            <div className="bb-seller-metric-info">
              <span className="bb-seller-metric-value bb-seller-metric-value-lowstock">
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
        <div className="bb-loading-padded-container">
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
        <>
          <div className="bb-seller-product-list">
            {paginatedProducts.map((item) => {
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
                        <span className="bb-product-price-primary">
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
                        className="bb-btn-edit-product"
                        onClick={() => handleOpenEditProduct(item)}
                        aria-label={`Edit ${item.title}`}
                        title="Edit product name, description, brand, and status"
                      >
                        ✏️ Edit Product
                      </button>
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
                              <th>Actions</th>
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
                                        <span className="bb-table-cell-none">None</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="bb-table-cell-bold">
                                    ₹{Number(v.price).toLocaleString('en-IN')}
                                  </td>
                                  <td className="bb-table-cell-muted">
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
                                  <td className="bb-table-cell-muted">{res}</td>
                                  <td className="bb-table-cell-muted">{thresh}</td>
                                  <td>
                                    <div className="bb-variant-action-btns">
                                      <button
                                        type="button"
                                        className="bb-btn-variant-action bb-btn-variant-action-stock"
                                        onClick={() => handleOpenAdjustStock(item, v)}
                                        title="Adjust variant inventory stock"
                                      >
                                        ⚡ Stock
                                      </button>
                                      <button
                                        type="button"
                                        className="bb-btn-variant-action"
                                        onClick={() => handleOpenEditVariant(item, v)}
                                        title="Edit variant SKU, name, and pricing"
                                      >
                                        ✏️ Edit
                                      </button>
                                    </div>
                                  </td>
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

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bb-seller-pagination">
              <button
                type="button"
                className="bb-btn bb-btn-secondary bb-btn-sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span className="bb-seller-pagination-info">
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredProducts.length} Total)
              </span>
              <button
                type="button"
                className="bb-btn bb-btn-secondary bb-btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          )}
        </>
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
                <div className="bb-existing-images-section">
                  <h4 className="bb-existing-images-heading">
                    Current Product Images ({activeImageUploadProduct.images.length})
                  </h4>
                  <div className="bb-existing-images-grid">
                    {activeImageUploadProduct.images.map((img) => (
                      <div
                        key={img.id}
                        className="bb-existing-image-card"
                      >
                        <img
                          src={img.url}
                          alt="Product thumbnail"
                          className="bb-existing-image-thumb"
                        />
                        {img.isThumbnail && (
                          <span className="bb-existing-image-badge">
                            Thumbnail
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteExistingImage(activeImageUploadProduct.id, img.id)}
                          disabled={savingImages}
                          className="bb-existing-image-delete-btn"
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

      {/* Create New Product Modal */}
      {isCreateModalOpen && (
        <div className="bb-modal-overlay" onClick={() => !creatingProduct && setIsCreateModalOpen(false)}>
          <div
            className="bb-modal-card"
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bb-modal-header">
              <h3 className="bb-modal-title">📦 Add New Product to Catalogue</h3>
              <button
                type="button"
                className="bb-modal-close"
                onClick={() => !creatingProduct && setIsCreateModalOpen(false)}
                disabled={creatingProduct}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProduct}>
              <div className="bb-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {createError && (
                  <div className="bb-badge bb-badge-danger bb-btn-block" style={{ marginBottom: '1rem', padding: '0.6rem' }}>
                    ⚠️ {createError}
                  </div>
                )}

                {createSuccess && (
                  <div className="bb-badge bb-badge-success bb-btn-block" style={{ marginBottom: '1rem', padding: '0.6rem' }}>
                    ✓ {createSuccess}
                  </div>
                )}

                {/* Quick Import / Sample Template Banner */}
                <div className="bb-sample-import-box">
                  <div className="bb-sample-import-top">
                    <div className="bb-sample-import-title-group">
                      <span className="bb-sample-import-sparkle">✨</span>
                      <div>
                        <h4 className="bb-sample-import-heading">Quick Import / Load Sample Product</h4>
                        <p className="bb-sample-import-desc">
                          Choose a realistic sample template or paste JSON to populate all product, variant, and pricing fields instantly.
                        </p>
                      </div>
                    </div>
                    <div className="bb-sample-import-action-buttons">
                      <button
                        type="button"
                        className="bb-btn-sample-json-toggle"
                        onClick={() => {
                          setIsJsonImportExpanded((prev) => !prev);
                          setJsonImportError(null);
                        }}
                      >
                        {isJsonImportExpanded ? '▲ Hide JSON' : '📋 Paste JSON'}
                      </button>
                      {(newTitle || newSku || newPrice) && (
                        <button
                          type="button"
                          className="bb-btn-clear-form"
                          onClick={handleClearCreateForm}
                          title="Reset all form fields to blank"
                        >
                          Clear Form
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dropdown Selector */}
                  <div className="bb-sample-selector-row">
                    <select
                      className="bb-input bb-sample-select"
                      value={selectedSampleId}
                      onChange={(e) => {
                        if (e.target.value) {
                          handleLoadSampleTemplate(e.target.value);
                        } else {
                          setSelectedSampleId('');
                        }
                      }}
                    >
                      <option value="">⚡ Select a Sample Product Template to Import...</option>
                      {SAMPLE_PRODUCT_TEMPLATES.map((tmpl) => (
                        <option key={tmpl.id} value={tmpl.id}>
                          {tmpl.name} — ₹{tmpl.price} (MRP ₹{tmpl.mrp})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quick-select chips */}
                  <div className="bb-sample-chips-row">
                    <span className="bb-sample-chips-label">Popular Presets:</span>
                    <div className="bb-sample-chips-list">
                      {SAMPLE_PRODUCT_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.id}
                          type="button"
                          className={`bb-sample-chip ${selectedSampleId === tmpl.id ? 'active' : ''}`}
                          onClick={() => handleLoadSampleTemplate(tmpl.id)}
                          title={`Import ${tmpl.title}`}
                        >
                          {tmpl.name.split(' ')[0]} {tmpl.title.split(' ').slice(0, 3).join(' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Expandable JSON Import Drawer */}
                  {isJsonImportExpanded && (
                    <div className="bb-json-import-panel">
                      <div className="bb-json-import-header">
                        <strong>Paste Product Data (JSON)</strong>
                        <button
                          type="button"
                          className="bb-btn-sample-fill"
                          onClick={() => {
                            setJsonInputText(JSON.stringify(SAMPLE_PRODUCT_TEMPLATES[0], null, 2));
                            setJsonImportError(null);
                          }}
                        >
                          Paste Sample JSON
                        </button>
                      </div>
                      <textarea
                        rows={6}
                        className="bb-input bb-json-textarea"
                        placeholder={`{\n  "title": "Handcrafted Kashmiri Pashmina Shawl",\n  "brand": "Royal Heritage",\n  "category": "Fashion",\n  "description": "Authentic Cashmere wool...",\n  "sku": "KASH-SHAWL-01",\n  "mrp": 2999,\n  "price": 2499,\n  "initialStock": 10,\n  "imageUrl": "https://..."\n}`}
                        value={jsonInputText}
                        onChange={(e) => {
                          setJsonInputText(e.target.value);
                          setJsonImportError(null);
                        }}
                      />
                      {jsonImportError && (
                        <p className="bb-json-error">⚠️ {jsonImportError}</p>
                      )}
                      <div className="bb-json-actions">
                        <button
                          type="button"
                          className="bb-btn bb-btn-primary bb-btn-sm"
                          onClick={() => handleImportJson(jsonInputText)}
                          disabled={!jsonInputText.trim()}
                        >
                          Apply JSON to Form
                        </button>
                        <button
                          type="button"
                          className="bb-btn bb-btn-secondary bb-btn-sm"
                          onClick={() => {
                            setJsonInputText('');
                            setIsJsonImportExpanded(false);
                            setJsonImportError(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sample import toast/notice */}
                  {sampleImportNotice && (
                    <div className="bb-sample-notice">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>✓</span>
                        <span>{sampleImportNotice}</span>
                      </div>
                      <button
                        type="button"
                        className="bb-sample-notice-close"
                        onClick={() => setSampleImportNotice(null)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Basic Info */}
                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">Product Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Handcrafted Kashmiri Pashmina Shawl"
                    className="bb-input"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div className="bb-form-grid-2">
                  <div className="bb-form-group">
                    <label className="bb-label bb-label-required">Category</label>
                    <select
                      className="bb-input"
                      required
                      value={newCategoryId}
                      onChange={(e) => setNewCategoryId(e.target.value)}
                    >
                      {categories.length === 0 ? (
                        <option value="">Default Marketplace Category</option>
                      ) : (
                        categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="bb-form-group">
                    <label className="bb-label">Brand Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Royal Heritage"
                      className="bb-input"
                      value={newBrand}
                      onChange={(e) => setNewBrand(e.target.value)}
                    />
                  </div>
                </div>

                <div className="bb-form-group">
                  <label className="bb-label">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Describe the product details, authentic materials, and specifications..."
                    className="bb-input"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>

                {/* Pricing & SKU */}
                <div className="bb-form-section-divider">
                  <h4 className="bb-form-section-heading">
                    Initial Variant & Pricing
                  </h4>

                  <div className="bb-form-grid-2">
                    <div className="bb-form-group">
                      <label className="bb-label bb-label-required">SKU Code</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. KASH-SHAWL-01"
                        className="bb-input"
                        value={newSku}
                        onChange={(e) => setNewSku(e.target.value)}
                      />
                    </div>

                    <div className="bb-form-group">
                      <label className="bb-label">Variant Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Standard or Size M"
                        className="bb-input"
                        value={newVariantTitle}
                        onChange={(e) => setNewVariantTitle(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="bb-pricing-grid">
                    <div className="bb-form-group">
                      <label className="bb-label bb-label-required">MRP (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="e.g. 2999"
                        className="bb-input"
                        value={newMrp}
                        onChange={(e) => setNewMrp(e.target.value)}
                      />
                    </div>

                    <div className="bb-form-group">
                      <label className="bb-label bb-label-required">Selling Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="e.g. 2499"
                        className="bb-input"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                      />
                    </div>

                    <div className="bb-form-group">
                      <label className="bb-label bb-label-required">Initial Stock</label>
                      <input
                        type="number"
                        min="0"
                        required
                        placeholder="e.g. 15"
                        className="bb-input"
                        value={newInitialStock}
                        onChange={(e) => setNewInitialStock(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Primary Image URL */}
                <div className="bb-form-section-divider">
                  <div className="bb-form-group">
                    <label className="bb-label">Primary Image URL</label>
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/... or hosted image URL"
                      className="bb-input"
                      value={newImageUrl}
                      onChange={(e) => setNewImageUrl(e.target.value)}
                    />
                    <p className="bb-input-hint">
                      You can also attach more images later using the Image Manager on the product card.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bb-modal-footer">
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={creatingProduct}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bb-btn bb-btn-primary"
                  disabled={creatingProduct}
                >
                  {creatingProduct ? 'Publishing Product...' : 'Publish Product to Store'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div
          className="bb-modal-backdrop"
          onClick={() => {
            if (!updatingProduct) {
              setEditingProduct(null);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bb-modal-container" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleUpdateProduct}>
              <div className="bb-modal-header">
                <h3 className="bb-modal-title">✏️ Edit Product Details</h3>
                <button
                  type="button"
                  className="bb-modal-close-btn"
                  onClick={() => !updatingProduct && setEditingProduct(null)}
                  disabled={updatingProduct}
                >
                  ✕
                </button>
              </div>

              <div className="bb-modal-body">
                {editError && (
                  <div className="bb-alert bb-alert-error" style={{ marginBottom: '1rem' }}>
                    ⚠️ {editError}
                  </div>
                )}
                {editSuccess && (
                  <div className="bb-alert bb-alert-success" style={{ marginBottom: '1rem' }}>
                    ✓ {editSuccess}
                  </div>
                )}

                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">Product Title</label>
                  <input
                    type="text"
                    required
                    className="bb-input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>

                <div className="bb-form-group">
                  <label className="bb-label">Description</label>
                  <textarea
                    rows={3}
                    className="bb-input bb-textarea"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>

                <div className="bb-form-grid-2">
                  <div className="bb-form-group">
                    <label className="bb-label">Brand</label>
                    <input
                      type="text"
                      className="bb-input"
                      value={editBrand}
                      onChange={(e) => setEditBrand(e.target.value)}
                    />
                  </div>

                  <div className="bb-form-group">
                    <label className="bb-label bb-label-required">Category</label>
                    <select
                      className="bb-input"
                      value={editCategoryId}
                      onChange={(e) => setEditCategoryId(e.target.value)}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">Product Status</label>
                  <select
                    className="bb-input"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ProductStatus)}
                  >
                    <option value="PUBLISHED">Published (Visible in Storefront)</option>
                    <option value="DRAFT">Draft (Saved, Not Visible to Buyers)</option>
                    <option value="INACTIVE">Inactive (Temporarily Hidden)</option>
                    <option value="ARCHIVED">Archived (Discontinued)</option>
                  </select>
                </div>
              </div>

              <div className="bb-modal-footer">
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary"
                  onClick={() => setEditingProduct(null)}
                  disabled={updatingProduct}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bb-btn bb-btn-primary"
                  disabled={updatingProduct}
                >
                  {updatingProduct ? 'Saving Changes...' : 'Save Product Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {adjustingVariant && (
        <div
          className="bb-modal-backdrop"
          onClick={() => {
            if (!adjustingStock) {
              setAdjustingVariant(null);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bb-modal-container" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleAdjustStock}>
              <div className="bb-modal-header">
                <h3 className="bb-modal-title">⚡ Adjust Stock Quantity</h3>
                <button
                  type="button"
                  className="bb-modal-close-btn"
                  onClick={() => !adjustingStock && setAdjustingVariant(null)}
                  disabled={adjustingStock}
                >
                  ✕
                </button>
              </div>

              <div className="bb-modal-body">
                {stockError && (
                  <div className="bb-alert bb-alert-error" style={{ marginBottom: '1rem' }}>
                    ⚠️ {stockError}
                  </div>
                )}
                {stockSuccess && (
                  <div className="bb-alert bb-alert-success" style={{ marginBottom: '1rem' }}>
                    ✓ {stockSuccess}
                  </div>
                )}

                <div className="bb-stock-adjust-summary">
                  <div className="bb-stock-adjust-title">
                    {adjustingVariant.product.title}
                  </div>
                  <div className="bb-stock-adjust-sku">
                    Variant: <strong>{adjustingVariant.variant.title}</strong> (SKU: <code>{adjustingVariant.variant.sku}</code>)
                  </div>
                  <div className="bb-stock-adjust-current">
                    Current Available Stock: <strong className="bb-stock-adjust-highlight">{adjustingVariant.variant.inventory?.availableQuantity ?? 0} units</strong>
                  </div>
                </div>

                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">
                    Stock Adjustment Delta (e.g. +10 to add stock, -5 to reduce stock)
                  </label>
                  <input
                    type="number"
                    step="1"
                    required
                    placeholder="e.g. 15 or -3"
                    className="bb-input"
                    value={stockDelta}
                    onChange={(e) => setStockDelta(e.target.value)}
                  />
                  <p className="bb-input-hint">
                    Enter positive numbers for incoming shipment/restock, or negative numbers for manual correction.
                  </p>
                </div>

                <div className="bb-form-group">
                  <label className="bb-label">Adjustment Reason / Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Supplier delivery, Inventory recount"
                    className="bb-input"
                    value={stockNotes}
                    onChange={(e) => setStockNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="bb-modal-footer">
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary"
                  onClick={() => setAdjustingVariant(null)}
                  disabled={adjustingStock}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bb-btn bb-btn-primary"
                  disabled={adjustingStock}
                >
                  {adjustingStock ? 'Adjusting Stock...' : 'Apply Stock Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Variant Pricing & SKU Modal */}
      {editingVariant && (
        <div
          className="bb-modal-backdrop"
          onClick={() => {
            if (!updatingVariant) {
              setEditingVariant(null);
            }
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bb-modal-container" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleUpdateVariant}>
              <div className="bb-modal-header">
                <h3 className="bb-modal-title">✏️ Edit Variant Specifications</h3>
                <button
                  type="button"
                  className="bb-modal-close-btn"
                  onClick={() => !updatingVariant && setEditingVariant(null)}
                  disabled={updatingVariant}
                >
                  ✕
                </button>
              </div>

              <div className="bb-modal-body">
                {variantError && (
                  <div className="bb-alert bb-alert-error" style={{ marginBottom: '1rem' }}>
                    ⚠️ {variantError}
                  </div>
                )}
                {variantSuccess && (
                  <div className="bb-alert bb-alert-success" style={{ marginBottom: '1rem' }}>
                    ✓ {variantSuccess}
                  </div>
                )}

                <div className="bb-form-grid-2">
                  <div className="bb-form-group">
                    <label className="bb-label bb-label-required">SKU Code</label>
                    <input
                      type="text"
                      required
                      className="bb-input"
                      value={variantSku}
                      onChange={(e) => setVariantSku(e.target.value)}
                    />
                  </div>

                  <div className="bb-form-group">
                    <label className="bb-label bb-label-required">Variant Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Standard, Blue - XL"
                      className="bb-input"
                      value={variantTitle}
                      onChange={(e) => setVariantTitle(e.target.value)}
                    />
                  </div>
                </div>

                <div className="bb-form-grid-2">
                  <div className="bb-form-group">
                    <label className="bb-label bb-label-required">MRP (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="bb-input"
                      value={variantMrp}
                      onChange={(e) => setVariantMrp(e.target.value)}
                    />
                  </div>

                  <div className="bb-form-group">
                    <label className="bb-label bb-label-required">Selling Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="bb-input"
                      value={variantPrice}
                      onChange={(e) => setVariantPrice(e.target.value)}
                    />
                  </div>
                </div>
                <p className="bb-input-hint">
                  Selling price must always be less than or equal to Maximum Retail Price (MRP).
                </p>
              </div>

              <div className="bb-modal-footer">
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary"
                  onClick={() => setEditingVariant(null)}
                  disabled={updatingVariant}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bb-btn bb-btn-primary"
                  disabled={updatingVariant}
                >
                  {updatingVariant ? 'Saving Variant...' : 'Save Variant Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
