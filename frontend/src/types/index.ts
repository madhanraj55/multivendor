export interface ProductVariantOption {
  id: string;
  label: string;
  value: string;
  inStock: boolean;
  priceOffset?: number;
}

export interface ProductVariantGroup {
  type: 'color' | 'size' | 'storage' | 'style';
  name: string;
  options: ProductVariantOption[];
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  description: string;
  brand: string;
  category: string;
  categoryId: string;
  sellerId: string;
  sellerName: string;
  sellerCity: string;
  sellerRating: number;
  sellerVerified: boolean;
  rating: number;
  reviewCount: number;
  price: number;
  originalPrice: number;
  discountPercent: number;
  inStock: boolean;
  stockQuantity: number;
  badge?: 'Bestseller' | 'Trending' | 'Handcrafted' | 'Sale' | 'New';
  images: string[];
  thumbnail: string;
  variants?: ProductVariantGroup[];
  specifications: Record<string, string>;
  highlights: string[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  image: string;
  itemCount: number;
  featured?: boolean;
  subcategories?: string[];
}

export interface Seller {
  id: string;
  storeName: string;
  ownerName: string;
  city: string;
  state: string;
  rating: number;
  ratingCount: number;
  verified: boolean;
  joinedDate: string;
  badge: string;
  productsCount: number;
}

export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  selectedVariants: Record<string, string>;
  quantity: number;
  price: number;
  sellerId: string;
  sellerName: string;
  variantId?: string;
  mrp?: number;
  lineTotal?: number;
  isAvailable?: boolean;
  availableStock?: number;
}

export interface Address {
  id: string;
  name: string;
  phone: string;
  type: 'HOME' | 'WORK' | 'OTHER';
  street: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface OrderItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  selectedVariants?: Record<string, string>;
}

export type PackageStatus =
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

export interface OrderPackage {
  sellerId: string;
  sellerName: string;
  trackingNumber: string;
  packageStatus: PackageStatus;
  estimatedDelivery: string;
  items: OrderItem[];
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKED'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  packages: OrderPackage[];
  shippingAddress: Address;
  itemsSubtotal: number;
  estimatedShippingFee: number;
  platformFee?: number;
  discount: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: 'PAID' | 'PENDING' | 'REFUNDED';
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  emailVerified: boolean;
}

// Backend Auth Types & Contracts
export type UserRole = 'CUSTOMER' | 'SELLER' | 'ADMIN';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type AuthMode = 'AUTHENTICATED' | 'DEMO' | 'ANONYMOUS';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: UserRole;
  status: UserStatus;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  shop?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  createdAt?: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role?: 'CUSTOMER' | 'SELLER';
}

export interface RegisterResponse {
  message: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: UserStatus;
  };
  devVerificationToken?: string;
  devOtp?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface VerifyEmailPayload {
  token?: string;
  email?: string;
  otp?: string;
}

export interface SendOtpPayload {
  email: string;
}

export interface VerifyOtpPayload {
  email: string;
  otp: string;
}

export interface ResendOtpPayload {
  email: string;
}

export interface OtpResponse {
  message: string;
  cooldownSeconds?: number;
  devOtp?: string;
}

export interface RefreshTokenPayload {
  refreshToken: string;
}

export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface ForgotPasswordPayload {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  devResetToken?: string;
}

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

export interface BackendAddress {
  id: string;
  userId: string;
  addressType: 'SHIPPING' | 'BILLING' | 'SHOP_PICKUP';
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAddressPayload {
  addressType?: 'SHIPPING' | 'BILLING' | 'SHOP_PICKUP';
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault?: boolean;
  latitude?: number;
  longitude?: number;
}

export interface UpdateAddressPayload {
  addressType?: 'SHIPPING' | 'BILLING' | 'SHOP_PICKUP';
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  isDefault?: boolean;
  latitude?: number;
  longitude?: number;
}

export interface SetDefaultAddressResponse {
  message: string;
  address: BackendAddress;
}

export interface DeleteAddressResponse {
  message: string;
  deletedId: string;
  replacementDefaultId: string | null;
}

// Backend Wishlist Types & Contracts
export interface BackendWishlistProduct {
  id: string;
  title: string;
  slug: string;
  brand: string | null;
  status: string;
  thumbnailUrl: string | null;
  shop: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  category: {
    id: string;
    name: string;
    slug: string;
  } | null;
  pricing: {
    minPrice: number;
    maxPrice: number;
    minMrp: number;
    maxMrp: number;
    currency: string;
  };
  availability: {
    isInStock: boolean;
    totalAvailableStock: number;
    isAvailableForPurchase: boolean;
  };
  variantCount: number;
}

export interface BackendWishlistItem {
  id: string;
  productId: string;
  addedAt: string;
  product: BackendWishlistProduct;
}

export interface BackendWishlistResponse {
  userId: string;
  totalItems: number;
  items: BackendWishlistItem[];
}

export interface AddToWishlistPayload {
  productId: string;
}

export interface ClearWishlistResponse {
  message?: string;
  userId: string;
  totalItems: number;
  items: BackendWishlistItem[];
}

// Backend Cart Types & Contracts
export interface BackendCartVariant {
  sku: string;
  title: string;
  attributes: Record<string, unknown>;
  isActive: boolean;
}

export interface BackendCartProduct {
  id: string;
  title: string;
  slug: string;
  status: string;
  thumbnailUrl: string | null;
}

export interface BackendCartShop {
  id: string;
  name: string;
  slug: string;
  status: string;
}

export interface BackendCartItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  sellerBasePrice?: number;
  commissionAmount?: number;
  mrp: number;
  lineTotal: number;
  isAvailable: boolean;
  availableStock: number;
  variant: BackendCartVariant;
  product: BackendCartProduct;
  shop: BackendCartShop;
}

export interface BackendCartResponse {
  cartId: string;
  userId: string;
  items: BackendCartItem[];
  totalItems: number;
  subtotalAmount: number;
  currency: string;
  message?: string;
}

export interface AddToCartPayload {
  variantId: string;
  quantity: number;
}

export interface UpdateCartItemPayload {
  quantity: number;
}

// Backend Checkout Types & Contracts
export interface CheckoutItemValidationResult {
  variantId: string;
  productId: string;
  shopId: string;
  shopName: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  lineSubtotal: number;
  availableStock: number;
  isAvailable: boolean;
  gstRate: number | null;
  taxStatus: 'CONFIGURED' | 'UNCONFIGURED';
  rejectionReason?: string;
}

export interface CheckoutValidationResponse {
  isValid: boolean;
  canProceedToCheckout: boolean;
  currency: string;
  cartId: string;
  totalItems: number;
  totalQuantity: number;
  subtotalAmount: number;
  platformFee?: number;
  taxAmount: number | null;
  taxStatus: 'CONFIGURED' | 'UNCONFIGURED';
  items: CheckoutItemValidationResult[];
  errors: string[];
}

export interface AddressSnapshotPayload {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface ReserveCheckoutPayload {
  idempotencyKey: string;
  shippingAddress: AddressSnapshotPayload;
  billingAddress?: AddressSnapshotPayload;
}

export interface BackendCheckoutAttemptItem {
  id: string;
  checkoutAttemptId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface BackendCheckoutAttempt {
  id: string;
  userId: string;
  idempotencyKey: string;
  status: 'INITIATED' | 'STOCK_RESERVED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  subtotalAmount: number;
  taxAmount: number;
  shippingFee: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  expiresAt: string;
  orderId?: string | null;
  items?: BackendCheckoutAttemptItem[];
}

export interface ReserveCheckoutResponse {
  message: string;
  isExisting: boolean;
  checkoutAttempt: BackendCheckoutAttempt;
}

export interface PlaceOrderPayload {
  checkoutAttemptId: string;
  notes?: string;
  paymentMethod?: string;
}

export interface BackendSellerOrderItem {
  id: string;
  variantId: string;
  productTitleSnapshot: string;
  skuSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number;
  discountSnapshot: number;
  totalAmount: number;
}

export interface BackendSellerOrder {
  id: string;
  subOrderNumber: string;
  shop: {
    id: string;
    name: string;
    slug?: string;
  };
  status: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  items: BackendSellerOrderItem[];
}

export interface BackendOrder {
  id: string;
  orderNumber: string;
  status: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  shippingAddressSnapshot: AddressSnapshotPayload;
  billingAddressSnapshot?: AddressSnapshotPayload;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  sellerOrders?: BackendSellerOrder[];
}

export interface PlaceOrderResponse {
  message: string;
  isExisting: boolean;
  order: BackendOrder;
}

export interface CheckoutRecoveryResponse {
  id: string;
  status: 'INITIATED' | 'STOCK_RESERVED' | 'PAYMENT_PENDING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
  isExpired: boolean;
  isExisting: boolean;
  expiresAt: string;
  order?: BackendOrder | null;
}

export interface CheckoutRecoveryRecord {
  attemptId: string;
  idempotencyKey?: string;
  timestamp: number;
}

export interface CustomerSellerOrderSummary {
  subOrderNumber: string;
  shopName: string;
  shopSlug: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  deliveryType: string;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  createdAt: string;
  sellerOrdersCount: number;
  sellerOrders: CustomerSellerOrderSummary[];
}

export interface CustomerOrderListResponse {
  data: CustomerOrderSummary[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CustomerOrderDetailItem {
  id: string;
  variantId: string;
  productTitle?: string;
  productTitleSnapshot?: string;
  sku?: string;
  skuSnapshot?: string;
  attributes?: Record<string, string | number | boolean>;
  quantity: number;
  unitPrice?: number;
  unitPriceSnapshot?: number;
  discount?: number;
  discountSnapshot?: number;
  gstRate?: number | null;
  gstRateSnapshot?: number | null;
  taxAmount?: number;
  taxAmountSnapshot?: number;
  totalAmount: number;
}

export interface CustomerOrderDetailSellerOrder {
  id: string;
  subOrderNumber: string;
  status: string;
  shop: {
    id: string;
    name: string;
    slug?: string;
  };
  subtotalAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  deliveryType?: string;
  items: CustomerOrderDetailItem[];
  statusHistory?: Array<Record<string, unknown>>;
}

export interface CustomerOrderDetailResponse {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  shippingAddress?: AddressSnapshotPayload;
  shippingAddressSnapshot?: AddressSnapshotPayload;
  billingAddress?: AddressSnapshotPayload;
  billingAddressSnapshot?: AddressSnapshotPayload;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  statusHistory?: Array<Record<string, unknown>>;
  sellerOrders: CustomerOrderDetailSellerOrder[];
}

export interface CustomerCancelOrderPayload {
  reason?: string;
}

export interface CustomerReturnOrderPayload {
  subOrderNumber: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// ADMIN ORDER INTERFACES & CONTRACTS
// ---------------------------------------------------------------------------

export interface AdminOrderQuery {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  customerId?: string;
  orderNumber?: string;
  startDate?: string;
  endDate?: string;
}

export interface AdminOrderCustomer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

export interface AdminOrderSellerSummary {
  subOrderNumber: string;
  shopName: string;
  shopSlug: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  deliveryType: string;
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer: AdminOrderCustomer;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  createdAt: string;
  sellerOrdersCount: number;
  sellerOrders: AdminOrderSellerSummary[];
}

export interface AdminOrderListResponse {
  data: AdminOrderListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AdminOrderDetailCustomer extends AdminOrderCustomer {
  role?: string;
  status?: string;
  createdAt?: string;
}

export interface AdminOrderItem {
  id: string;
  variantId: string;
  productTitle: string;
  sku: string;
  attributes?: Record<string, unknown> | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number | null;
  taxAmount: number;
  totalAmount: number;
}

export interface AdminOrderStatusHistory {
  id: string;
  status: string;
  notes: string | null;
  changedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    role?: string;
  } | null;
  createdAt: string;
}

export interface AdminOrderSellerOrder {
  id: string;
  subOrderNumber: string;
  shop: {
    id: string;
    name: string;
    slug: string;
    status: string;
    sellerId: string;
    seller?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      phone?: string | null;
    };
  };
  status: string;
  deliveryType: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  commissionAmount?: number;
  netSellerPayable?: number;
  cancellationReason?: string | null;
  deliveredAt?: string | null;
  items: AdminOrderItem[];
  statusHistory: AdminOrderStatusHistory[];
}

export interface AdminOrderDetailResponse {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customer: AdminOrderDetailCustomer;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  notes?: string | null;
  shippingAddress?: AddressSnapshotPayload | null;
  billingAddress?: AddressSnapshotPayload | null;
  createdAt: string;
  updatedAt: string;
  paymentSummary: {
    orderStatus: OrderStatus;
    checkoutAttempt: {
      id: string;
      status: string;
      idempotencyKey: string;
      expiresAt: string;
      createdAt: string;
    } | null;
    totalPayable: number;
    currency: string;
  };
  statusHistory: AdminOrderStatusHistory[];
  sellerOrdersCount: number;
  sellerOrders: AdminOrderSellerOrder[];
}

export interface AdminSubOrdersResponse {
  orderNumber: string;
  orderStatus: OrderStatus;
  totalSubOrders: number;
  subOrders: Array<{
    id: string;
    subOrderNumber: string;
    shop: {
      id: string;
      name: string;
      slug: string;
      status: string;
      sellerId: string;
      seller?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
    };
    status: string;
    deliveryType: string;
    totalAmount: number;
    netSellerPayable: number;
    cancellationReason?: string | null;
    deliveredAt?: string | null;
    itemsCount: number;
    items: Array<{
      id: string;
      variantId: string;
      productTitle: string;
      sku: string;
      attributes?: Record<string, unknown> | null;
      quantity: number;
      unitPrice: number;
      totalAmount: number;
    }>;
    statusHistory: AdminOrderStatusHistory[];
  }>;
}

export interface AdminUpdateOrderStatusPayload {
  status: OrderStatus;
  notes?: string;
}

export interface AdminUpdateOrderStatusResponse {
  message: string;
  orderNumber: string;
  previousStatus: OrderStatus;
  status: OrderStatus;
}

// ---------------------------------------------------------------------------
// SELLER ORDER INTERFACES & CONTRACTS
// ---------------------------------------------------------------------------

export type SellerOrderStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURNED';

export interface QuerySellerOrdersParams {
  page?: number;
  limit?: number;
  status?: SellerOrderStatus;
}

export interface SellerOrderListItem {
  id: string;
  subOrderNumber: string;
  parentOrderNumber: string;
  status: SellerOrderStatus;
  subtotalAmount: number;
  totalAmount: number;
  netSellerPayable: number;
  currency: string;
  deliveryType: string;
  itemCount: number;
  createdAt: string;
  items: Array<{
    id: string;
    title: string;
    sku: string;
    quantity: number;
    totalAmount: number;
  }>;
}

export interface SellerOrderListResponse {
  shop: {
    id: string;
    name: string;
  };
  data: SellerOrderListItem[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SellerOrderDetailItem {
  id: string;
  variantId: string;
  productTitle: string;
  sku: string;
  attributes?: Record<string, unknown> | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number | null;
  taxAmount: number;
  totalAmount: number;
}

export interface SellerOrderDetailResponse {
  id: string;
  subOrderNumber: string;
  parentOrderNumber: string;
  status: SellerOrderStatus;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  taxAmount: number;
  totalAmount: number;
  commissionAmount: number;
  netSellerPayable: number;
  currency: string;
  deliveryType: string;
  cancellationReason: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  shippingAddress: AddressSnapshotPayload | null;
  statusHistory: Array<{
    status: string;
    notes: string | null;
    createdAt: string;
  }>;
  items: SellerOrderDetailItem[];
}

export interface UpdateSellerOrderStatusPayload {
  status: SellerOrderStatus;
  notes?: string;
}

export interface UpdateSellerOrderStatusResponse {
  message: string;
  subOrderNumber: string;
  previousStatus: SellerOrderStatus;
  status: SellerOrderStatus;
  deliveredAt?: string | null;
}

// ---------------------------------------------------------------------------
// SELLER PRODUCT MANAGEMENT & CATEGORY CONTRACTS
// ---------------------------------------------------------------------------

export type ProductStatus = 'DRAFT' | 'PUBLISHED' | 'INACTIVE' | 'ARCHIVED';

export type ShopStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface BackendCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  hsnCode?: string | null;
  defaultGstRate?: number | string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  children?: BackendCategory[];
  parent?: BackendCategory | null;
}

export interface SellerProductInventory {
  id: string;
  variantId: string;
  availableQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SellerProductImage {
  id: string;
  productId: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isThumbnail: boolean;
  createdAt: string;
}

export interface SellerProductVariant {
  id: string;
  productId: string;
  sku: string;
  title: string;
  mrp: number;
  price: number;
  attributes: Record<string, unknown>;
  weightGrams: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  inventory?: SellerProductInventory | null;
}

export interface SellerProductItem {
  id: string;
  shopId: string;
  categoryId: string;
  category?: {
    id: string;
    name: string;
    slug?: string;
  };
  title: string;
  slug: string;
  description: string;
  brand: string | null;
  status: ProductStatus;
  hsnCode: string | null;
  gstRate?: number | string | null;
  isReturnable: boolean;
  returnWindowDays: number;
  metaTitle: string | null;
  metaDescription: string | null;
  createdAt: string;
  updatedAt: string;
  images: SellerProductImage[];
  variants: SellerProductVariant[];
}

export interface CreateProductVariantPayload {
  sku: string;
  title: string;
  mrp: number;
  price: number;
  attributes: Record<string, unknown>;
  weightGrams?: number;
  initialStock?: number;
  lowStockThreshold?: number;
}

export interface CreateProductImagePayload {
  url: string;
  altText?: string;
  sortOrder?: number;
  isThumbnail?: boolean;
}

export interface CreateProductPayload {
  categoryId: string;
  title: string;
  description: string;
  brand?: string;
  hsnCode?: string;
  isReturnable?: boolean;
  returnWindowDays?: number;
  metaTitle?: string;
  metaDescription?: string;
  variants: CreateProductVariantPayload[];
  images?: CreateProductImagePayload[];
}

export interface UpdateProductPayload {
  categoryId?: string;
  title?: string;
  description?: string;
  brand?: string;
  status?: ProductStatus;
  hsnCode?: string;
  isReturnable?: boolean;
  returnWindowDays?: number;
  metaTitle?: string;
  metaDescription?: string;
}

export interface UpdateProductVariantPayload {
  sku?: string;
  title?: string;
  mrp?: number;
  price?: number;
  attributes?: Record<string, unknown>;
  weightGrams?: number;
}

export interface UpdateVariantStatusPayload {
  isActive: boolean;
}

export interface UpdateVariantStatusResponse {
  message: string;
  variant: SellerProductVariant;
}

export interface DeleteVariantResponse {
  action: 'DEACTIVATED' | 'DELETED';
  message: string;
  variant: SellerProductVariant;
}

export interface AddProductImagePayload {
  url: string;
  altText?: string;
  sortOrder?: number;
  isThumbnail?: boolean;
}

export interface UpdateProductImagePayload {
  url?: string;
  altText?: string;
  sortOrder?: number;
  isThumbnail?: boolean;
}

export interface DeleteProductImageResponse {
  message: string;
}

export interface AdjustStockPayload {
  variantId: string;
  quantity: number;
  referenceId?: string;
  notes?: string;
}

export interface UploadProductImageResponse {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
}





