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
