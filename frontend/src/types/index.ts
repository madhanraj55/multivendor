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

export interface OrderPackage {
  sellerId: string;
  sellerName: string;
  trackingNumber: string;
  packageStatus: 'PROCESSING' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  estimatedDelivery: string;
  items: OrderItem[];
}

export type OrderStatus = 'PLACED' | 'CONFIRMED' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';

export interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  packages: OrderPackage[];
  shippingAddress: Address;
  itemsSubtotal: number;
  estimatedShippingFee: number;
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
  phone?: string;
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
  token: string;
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


