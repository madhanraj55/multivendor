import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type {
  Product,
  CartItem,
  Address,
  Order,
  UserProfile,
  AuthUser,
  AuthMode,
  AuthSession,
} from '../types/index.ts';
import { sessionManager, ApiError } from '../services/apiClient.ts';
import { authApi } from '../services/authApi.ts';
import {
  addressesApi,
  mapBackendAddressToUi,
  mapUiAddressToCreatePayload,
  mapUiAddressToUpdatePayload,
} from '../services/addressesApi.ts';
import {
  wishlistApi,
  mapWishlistItemToProduct,
} from '../services/wishlistApi.ts';
import {
  cartApi,
  mapBackendCartItemToUi,
} from '../services/cartApi.ts';
import {
  checkoutApi,
  mapBackendOrderToUi,
} from '../services/checkoutApi.ts';
import {
  ordersApi,
  mapCustomerOrderSummaryToUi,
} from '../services/ordersApi.ts';


interface MarketplaceContextValue {
  cart: CartItem[];
  cartLoading: boolean;
  cartError: string | null;
  fetchCart: () => Promise<void>;
  addToCart: (product: Product, quantity?: number, selectedVariants?: Record<string, string>) => Promise<void> | void;
  updateCartQuantity: (cartItemId: string, quantity: number) => Promise<void> | void;
  removeFromCart: (cartItemId: string) => Promise<void> | void;
  clearCart: () => Promise<void> | void;
  cartTotalCount: number;
  cartSubtotal: number;


  wishlist: string[];
  wishlistProducts: Product[];
  wishlistLoading: boolean;
  wishlistError: string | null;
  fetchWishlist: () => Promise<void>;
  toggleWishlist: (productId: string) => Promise<void>;
  removeFromWishlist: (productId: string) => Promise<void>;
  clearWishlist: () => Promise<void>;
  isInWishlist: (productId: string) => boolean;

  user: UserProfile | null;

  setUser: (user: UserProfile | null) => void;
  updateUserProfile: (profile: Partial<UserProfile>) => Promise<void>;

  authMode: AuthMode;
  authUser: AuthUser | null;
  setAuthenticatedSession: (session: AuthSession) => void;
  setDemoAuth: () => void;
  setAnonymousAuth: () => void;
  logout: () => Promise<void>;

  addresses: Address[];
  addressesLoading: boolean;
  addressesError: string | null;
  fetchAddresses: () => Promise<void>;
  addAddress: (address: Omit<Address, 'id'>) => Promise<void>;
  updateAddress: (address: Address) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  setDefaultAddress: (id: string) => Promise<void>;
  selectedAddressId: string;
  setSelectedAddressId: (id: string) => void;

  orders: Order[];
  ordersLoading: boolean;
  ordersError: string | null;
  fetchOrders: () => Promise<void>;
  placeOrder: (notes?: string, checkoutAttemptId?: string) => Promise<Order> | Order;
  recordOrder: (order: Order) => void;

  pincode: string;
  setPincode: (pin: string) => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

// Profile metadata persistence helpers (gender, dateOfBirth)
function getStoredProfileMeta(userId?: string): { gender: string; dateOfBirth: string } {
  if (!userId || typeof window === 'undefined') return { gender: '', dateOfBirth: '' };
  try {
    const raw = localStorage.getItem(`bb_profile_meta_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return { gender: '', dateOfBirth: '' };
}

function saveStoredProfileMeta(userId: string, meta: { gender?: string; dateOfBirth?: string }) {
  if (!userId || typeof window === 'undefined') return;
  try {
    const existing = getStoredProfileMeta(userId);
    localStorage.setItem(
      `bb_profile_meta_${userId}`,
      JSON.stringify({
        gender: meta.gender !== undefined ? meta.gender : existing.gender,
        dateOfBirth: meta.dateOfBirth !== undefined ? meta.dateOfBirth : existing.dateOfBirth,
      }),
    );
  } catch {
    // fallback
  }
}

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  // Guest cart in local memory
  const [demoCart, setDemoCart] = useState<CartItem[]>([]);

  const [authCart, setAuthCart] = useState<CartItem[]>([]);
  const [authCartSubtotal, setAuthCartSubtotal] = useState<number>(0);
  const [cartLoading, setCartLoading] = useState<boolean>(() => {
    return Boolean(sessionManager.getSession());
  });
  const [cartError, setCartError] = useState<string | null>(null);

  // Synchronization refs for robust cart mutation serialization and stale response prevention
  const cartQueueRef = useRef<Promise<void>>(Promise.resolve());
  const authCartRef = useRef<CartItem[]>([]);
  const cartRequestIdRef = useRef<number>(0);

  useEffect(() => {
    authCartRef.current = authCart;
  }, [authCart]);

  const [demoWishlist, setDemoWishlist] = useState<string[]>([]);
  const [authWishlistIds, setAuthWishlistIds] = useState<string[]>([]);
  const [authWishlistProducts, setAuthWishlistProducts] = useState<Product[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState<boolean>(() => {
    return Boolean(sessionManager.getSession());
  });

  const [wishlistError, setWishlistError] = useState<string | null>(null);

  // Synchronization refs for robust overlapping mutation serialization
  const wishlistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const authWishlistIdsRef = useRef<string[]>([]);
  const authWishlistProductsRef = useRef<Product[]>([]);

  useEffect(() => {
    authWishlistIdsRef.current = authWishlistIds;
  }, [authWishlistIds]);

  useEffect(() => {
    authWishlistProductsRef.current = authWishlistProducts;
  }, [authWishlistProducts]);


  // Auth state: check if an active authenticated backend session exists
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    return sessionManager.getSession() ? 'AUTHENTICATED' : 'ANONYMOUS';
  });

  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    return sessionManager.getSession()?.user ?? null;
  });

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');

  const [user, setUser] = useState<UserProfile | null>(() => {
    const existing = sessionManager.getSession();
    if (existing?.user) {
      const meta = getStoredProfileMeta(existing.user.id);
      return {
        id: existing.user.id,
        fullName: `${existing.user.firstName} ${existing.user.lastName}`.trim(),
        email: existing.user.email,
        phone: existing.user.phone || '',
        gender: meta.gender || '',
        dateOfBirth: meta.dateOfBirth || '',
        emailVerified: Boolean(existing.user.isEmailVerified),
      };
    }
    return null;
  });

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(() => {
    return Boolean(sessionManager.getSession());
  });
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const ordersRequestIdRef = useRef<number>(0);

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe((session) => {
      if (session) {
        setAuthMode('AUTHENTICATED');
        setAuthUser((prevUser) => {
          if (prevUser && prevUser.id !== session.user.id) {
            // Immediate clearance on switching to another authenticated user
            setAuthWishlistIds([]);
            setAuthWishlistProducts([]);
            authWishlistIdsRef.current = [];
            authWishlistProductsRef.current = [];
            setWishlistError(null);
            setWishlistLoading(true);
            setAuthCart([]);
            authCartRef.current = [];
            setAuthCartSubtotal(0);
            setCartError(null);
            setCartLoading(true);
            setAddresses([]);
            setSelectedAddressId('');
            setAddressesLoading(true);
            setOrders([]);
            setOrdersError(null);
            setOrdersLoading(true);
            ordersRequestIdRef.current++;
          }
          return session.user;
        });
        const meta = getStoredProfileMeta(session.user.id);
        setUser((prev) => ({
          id: session.user.id,
          fullName: `${session.user.firstName} ${session.user.lastName}`.trim(),
          email: session.user.email,
          phone: session.user.phone || '',
          gender: prev?.gender || meta.gender || '',
          dateOfBirth: prev?.dateOfBirth || meta.dateOfBirth || '',
          emailVerified: Boolean(session.user.isEmailVerified),
        }));
      } else {
        setAuthMode((prev) => {
          if (prev === 'AUTHENTICATED') {
            setAuthUser(null);
            setUser(null);
            setAuthWishlistIds([]);
            setAuthWishlistProducts([]);
            authWishlistIdsRef.current = [];
            authWishlistProductsRef.current = [];
            setWishlistError(null);
            setAuthCart([]);
            authCartRef.current = [];
            setAuthCartSubtotal(0);
            setCartError(null);
            setAddresses([]);
            setSelectedAddressId('');
            setOrders([]);
            setOrdersError(null);
            setOrdersLoading(false);
            ordersRequestIdRef.current++;
            return 'ANONYMOUS';
          }
          return prev;
        });
      }
    });

    return unsubscribe;
  }, []);

  // Synchronize authenticated user profile and verification status with backend on load
  useEffect(() => {
    if (authMode === 'AUTHENTICATED') {
      authApi.getCurrentUser()
        .then((freshUser) => {
          setAuthUser(freshUser);
          const meta = getStoredProfileMeta(freshUser.id);
          setUser((prev) => ({
            id: freshUser.id,
            fullName: `${freshUser.firstName} ${freshUser.lastName}`.trim(),
            email: freshUser.email,
            phone: freshUser.phone || '',
            gender: prev?.gender || meta.gender || '',
            dateOfBirth: prev?.dateOfBirth || meta.dateOfBirth || '',
            emailVerified: Boolean(freshUser.isEmailVerified),
          }));
          const cur = sessionManager.getSession();
          if (cur) {
            sessionManager.setSession({
              ...cur,
              user: freshUser,
            });
          }
        })
        .catch(() => {
          // Offline / fallback mode
        });
    }
  }, [authMode]);

  const setAuthenticatedSession = (session: AuthSession) => {
    // If switching accounts or logging in freshly, immediately clear previous state
    if (authUser && authUser.id !== session.user.id) {
      setAuthWishlistIds([]);
      setAuthWishlistProducts([]);
      authWishlistIdsRef.current = [];
      authWishlistProductsRef.current = [];
      setWishlistError(null);
      setWishlistLoading(true);
      setAuthCart([]);
      authCartRef.current = [];
      setAuthCartSubtotal(0);
      setCartError(null);
      setCartLoading(true);
      setAddresses([]);
      setSelectedAddressId('');
      setAddressesLoading(true);
      setOrders([]);
      setOrdersError(null);
      setOrdersLoading(true);
      ordersRequestIdRef.current++;
    }
    const meta = getStoredProfileMeta(session.user.id);
    sessionManager.setSession(session);
    setAuthMode('AUTHENTICATED');
    setAuthUser(session.user);
    setUser({
      id: session.user.id,
      fullName: `${session.user.firstName} ${session.user.lastName}`.trim(),
      email: session.user.email,
      phone: session.user.phone || '',
      gender: meta.gender || '',
      dateOfBirth: meta.dateOfBirth || '',
      emailVerified: Boolean(session.user.isEmailVerified),
    });
  };

  const setDemoAuth = () => {
    sessionManager.clearSession();
    setAuthMode('ANONYMOUS');
    setAuthUser(null);
    setUser(null);
    setAddresses([]);
    setSelectedAddressId('');
    setAddressesLoading(false);
    setAddressesError(null);
    setOrders([]);
    setOrdersLoading(false);
    setOrdersError(null);
    ordersRequestIdRef.current++;
    setAuthWishlistIds([]);
    setAuthWishlistProducts([]);
    authWishlistIdsRef.current = [];
    authWishlistProductsRef.current = [];
    setWishlistError(null);
    setWishlistLoading(false);
    setAuthCart([]);
    authCartRef.current = [];
    setAuthCartSubtotal(0);
    setCartError(null);
    setCartLoading(false);
  };

  const setAnonymousAuth = () => {
    sessionManager.clearSession();
    setAuthMode('ANONYMOUS');
    setAuthUser(null);
    setUser(null);
    setAddresses([]);
    setSelectedAddressId('');
    setAddressesLoading(false);
    setAddressesError(null);
    setOrders([]);
    setOrdersLoading(false);
    setOrdersError(null);
    ordersRequestIdRef.current++;
    setAuthWishlistIds([]);
    setAuthWishlistProducts([]);
    authWishlistIdsRef.current = [];
    authWishlistProductsRef.current = [];
    setWishlistError(null);
    setWishlistLoading(false);
    setAuthCart([]);
    authCartRef.current = [];
    setAuthCartSubtotal(0);
    setCartError(null);
    setCartLoading(false);
  };

  const logout = async () => {
    if (authMode === 'AUTHENTICATED') {
      try {
        await authApi.logout();
      } catch {
        sessionManager.clearSession();
      }
    } else {
      sessionManager.clearSession();
    }
    setAuthMode('ANONYMOUS');
    setAuthUser(null);
    setUser(null);
    setAddresses([]);
    setSelectedAddressId('');
    setAddressesLoading(false);
    setAddressesError(null);
    setOrders([]);
    setOrdersLoading(false);
    setOrdersError(null);
    ordersRequestIdRef.current++;
    setAuthWishlistIds([]);
    setAuthWishlistProducts([]);
    authWishlistIdsRef.current = [];
    authWishlistProductsRef.current = [];
    setWishlistError(null);
    setWishlistLoading(false);
    setAuthCart([]);
    authCartRef.current = [];
    setAuthCartSubtotal(0);
    setCartError(null);
    setCartLoading(false);
    cartRequestIdRef.current++;
  };

  const [pincode, setPincode] = useState<string>('560038');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchAddresses = useCallback(async () => {
    if (authMode !== 'AUTHENTICATED') {
      setAddresses([]);
      setSelectedAddressId('');
      setAddressesLoading(false);
      setAddressesError(null);
      return;
    }

    setAddressesLoading(true);
    setAddressesError(null);
    try {
      const backendAddrs = await addressesApi.getAddresses();
      const uiAddrs = backendAddrs.map(mapBackendAddressToUi);
      setAddresses(uiAddrs);
      const defaultAddr = uiAddrs.find((a) => a.isDefault) || uiAddrs[0];
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
      } else {
        setSelectedAddressId('');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load addresses from server';
      setAddressesError(message);
    } finally {
      setAddressesLoading(false);
    }
  }, [authMode]);

  const fetchWishlist = useCallback(async () => {
    if (authMode !== 'AUTHENTICATED') {
      setWishlistLoading(false);
      setWishlistError(null);
      return;
    }

    setWishlistLoading(true);
    setWishlistError(null);
    try {
      const res = await wishlistApi.getWishlist();
      const ids = res.items.map((item) => item.productId);
      const products = res.items.map(mapWishlistItemToProduct);
      setAuthWishlistIds(ids);
      setAuthWishlistProducts(products);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load wishlist from server';
      setWishlistError(message);
    } finally {
      setWishlistLoading(false);
    }
  }, [authMode]);

  const fetchCart = useCallback(async () => {
    if (authMode !== 'AUTHENTICATED') {
      setCartLoading(false);
      setCartError(null);
      return;
    }

    const currentReqId = ++cartRequestIdRef.current;
    setCartLoading(true);
    setCartError(null);
    try {
      const res = await cartApi.getCart();
      if (currentReqId !== cartRequestIdRef.current) return;
      const uiItems = res.items.map(mapBackendCartItemToUi);
      setAuthCart(uiItems);
      authCartRef.current = uiItems;
      setAuthCartSubtotal(res.subtotalAmount);
    } catch (err) {
      if (currentReqId !== cartRequestIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load cart from server';
      setCartError(message);
    } finally {
      if (currentReqId === cartRequestIdRef.current) {
        setCartLoading(false);
      }
    }
  }, [authMode]);

  const fetchOrders = useCallback(async () => {
    if (authMode !== 'AUTHENTICATED') {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersError(null);
      return;
    }

    const currentReqId = ++ordersRequestIdRef.current;
    setOrdersLoading(true);
    setOrdersError(null);

    try {
      const res = await ordersApi.getMyOrders({ page: 1, limit: 20 });
      if (currentReqId !== ordersRequestIdRef.current) return;

      const summaries = (res.data || []).map(mapCustomerOrderSummaryToUi);

      setOrders((prevOrders) => {
        const existingMap = new Map<string, Order>();
        prevOrders.forEach((o) => {
          if (o.id) existingMap.set(o.id, o);
          if (o.orderNumber) existingMap.set(o.orderNumber, o);
        });

        const mergedSummaries = summaries.map((summaryOrder) => {
          const existing = existingMap.get(summaryOrder.orderNumber) || existingMap.get(summaryOrder.id);
          if (existing && existing.packages.some((pkg) => pkg.items.length > 0)) {
            return {
              ...existing,
              status: summaryOrder.status,
              totalAmount: summaryOrder.totalAmount,
            };
          }
          return summaryOrder;
        });

        const summaryNumbers = new Set(summaries.map((s) => s.orderNumber));
        const summaryIds = new Set(summaries.map((s) => s.id));
        const unlistedLocals = prevOrders.filter(
          (o) =>
            !summaryNumbers.has(o.orderNumber) &&
            !summaryIds.has(o.id) &&
            o.packages.some((pkg) => pkg.items.length > 0)
        );

        return [...unlistedLocals, ...mergedSummaries];
      });
    } catch (err) {
      if (currentReqId !== ordersRequestIdRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load orders from server';
      setOrdersError(message);
    } finally {
      if (currentReqId === ordersRequestIdRef.current) {
        setOrdersLoading(false);
      }
    }
  }, [authMode]);

  // Synchronize address list, wishlist, and cart whenever authMode or authUser changes
  useEffect(() => {
    let isCancelled = false;

    if (authMode === 'AUTHENTICATED' && authUser?.id) {
      addressesApi
        .getAddresses()
        .then((backendAddrs) => {
          if (isCancelled) return;
          const uiAddrs = backendAddrs.map(mapBackendAddressToUi);
          setAddresses(uiAddrs);
          const defaultAddr = uiAddrs.find((a) => a.isDefault) || uiAddrs[0];
          setSelectedAddressId(defaultAddr ? defaultAddr.id : '');
          setAddressesLoading(false);
        })
        .catch((err) => {
          if (isCancelled) return;
          setAddressesError(err instanceof Error ? err.message : 'Failed to load addresses from server');
          setAddressesLoading(false);
        });

      wishlistApi
        .getWishlist()
        .then((res) => {
          if (isCancelled) return;
          const ids = res.items.map((item) => item.productId);
          const products = res.items.map(mapWishlistItemToProduct);
          setAuthWishlistIds(ids);
          setAuthWishlistProducts(products);
          setWishlistError(null);
          setWishlistLoading(false);
        })
        .catch((err) => {
          if (isCancelled) return;
          setWishlistError(err instanceof Error ? err.message : 'Failed to load wishlist from server');
          setWishlistLoading(false);
        });

      const currentReqId = ++cartRequestIdRef.current;
      cartApi
        .getCart()
        .then((res) => {
          if (isCancelled || currentReqId !== cartRequestIdRef.current) return;
          const uiItems = res.items.map(mapBackendCartItemToUi);
          setAuthCart(uiItems);
          authCartRef.current = uiItems;
          setAuthCartSubtotal(res.subtotalAmount);
          setCartError(null);
          setCartLoading(false);
        })
        .catch((err) => {
          if (isCancelled || currentReqId !== cartRequestIdRef.current) return;
          setCartError(err instanceof Error ? err.message : 'Failed to load cart from server');
          setCartLoading(false);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [authMode, authUser?.id]);


  const addToCart = async (
    product: Product,
    quantity = 1,
    selectedVariants: Record<string, string> = {}
  ): Promise<void> => {
    if (authMode !== 'AUTHENTICATED') {
      setDemoCart((prev) => {
        // Check if item with same variant already exists
        const existingIndex = prev.findIndex(
          (item) =>
            item.productId === product.id &&
            JSON.stringify(item.selectedVariants) === JSON.stringify(selectedVariants)
        );

        if (existingIndex > -1) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: next[existingIndex].quantity + quantity,
          };
          return next;
        }

        const newItem: CartItem = {
          id: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          productId: product.id,
          product,
          selectedVariants,
          quantity,
          price: product.price,
          sellerId: product.sellerId,
          sellerName: product.sellerName,
        };
        return [...prev, newItem];
      });
      return;
    }

    // Authenticated Mode: Resolve variantId
    // Check if product or selected variants contain an exact variantId
    let targetVariantId: string | undefined;

    const isUuid = (id: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // 1. If product.variants is available, find matching option id
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      for (const group of product.variants) {
        const selectedLabel = selectedVariants[group.name];
        if (selectedLabel) {
          const matchOpt = group.options.find((opt) => opt.label === selectedLabel || opt.value === selectedLabel);
          if (matchOpt && isUuid(matchOpt.id)) {
            targetVariantId = matchOpt.id;
            break;
          }
        }
      }
    }

    // 2. If not found and product has a valid backend ID (UUID format)
    if (!targetVariantId && isUuid(product.id)) {
      try {
        const variants = await cartApi.getProductVariants(product.id);
        if (variants && variants.length > 0) {
          const match = variants.find((v) => {
            if (!v.attributes || typeof v.attributes !== 'object') return false;
            return Object.entries(selectedVariants).every(
              ([k, val]) => String(v.attributes?.[k]) === String(val)
            );
          });
          targetVariantId = match?.id || variants[0]?.id;
        }
      } catch {
        // Fall back to product.id if variants cannot be fetched
      }
    }

    if (!targetVariantId) {
      // If still not resolved or it's a demo product ID (e.g. prod-1), keep in demo cart or use product.id
      if (!isUuid(product.id)) {
        // Demo product added while authenticated: safely handle in demoCart
        setDemoCart((prev) => [
          ...prev,
          {
            id: `cart-${Date.now()}`,
            productId: product.id,
            product,
            selectedVariants,
            quantity,
            price: product.price,
            sellerId: product.sellerId,
            sellerName: product.sellerName,
          },
        ]);
        return;
      }
      targetVariantId = product.id;
    }

    // Enqueue mutation to prevent race conditions
    const op = async () => {
      try {
        setCartError(null);
        const res = await cartApi.addToCart({
          variantId: targetVariantId!,
          quantity,
        });
        const uiItems = res.items.map(mapBackendCartItemToUi);
        setAuthCart(uiItems);
        authCartRef.current = uiItems;
        setAuthCartSubtotal(res.subtotalAmount);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to add item to cart';
        setCartError(msg);
        throw err;
      }
    };

    const nextQueue = cartQueueRef.current.then(op, op);
    cartQueueRef.current = nextQueue.catch(() => {});
    return nextQueue;
  };

  const updateCartQuantity = async (cartItemId: string, quantity: number): Promise<void> => {
    if (quantity <= 0) {
      return removeFromCart(cartItemId);
    }

    if (authMode !== 'AUTHENTICATED') {
      setDemoCart((prev) =>
        prev.map((item) => (item.id === cartItemId ? { ...item, quantity } : item))
      );
      return;
    }

    // Find the item in authCart to get variantId
    const item = authCartRef.current.find(
      (i) => i.id === cartItemId || i.variantId === cartItemId
    );
    const targetVariantId = item?.variantId || cartItemId;

    // Optimistic UI update
    setAuthCart((prev) =>
      prev.map((i) =>
        i.id === cartItemId || i.variantId === targetVariantId ? { ...i, quantity } : i
      )
    );

    const op = async () => {
      try {
        setCartError(null);
        const res = await cartApi.updateCartItem(targetVariantId, { quantity });
        const uiItems = res.items.map(mapBackendCartItemToUi);
        setAuthCart(uiItems);
        authCartRef.current = uiItems;
        setAuthCartSubtotal(res.subtotalAmount);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update item quantity';
        setCartError(msg);
        // Refresh authoritative cart on failure to revert optimistic change
        try {
          const refreshed = await cartApi.getCart();
          const uiItems = refreshed.items.map(mapBackendCartItemToUi);
          setAuthCart(uiItems);
          authCartRef.current = uiItems;
          setAuthCartSubtotal(refreshed.subtotalAmount);
        } catch {
          // Keep current state if refresh also fails
        }
        throw err;
      }
    };

    const nextQueue = cartQueueRef.current.then(op, op);
    cartQueueRef.current = nextQueue.catch(() => {});
    return nextQueue;
  };

  const removeFromCart = async (cartItemId: string): Promise<void> => {
    if (authMode !== 'AUTHENTICATED') {
      setDemoCart((prev) => prev.filter((item) => item.id !== cartItemId));
      return;
    }

    const item = authCartRef.current.find(
      (i) => i.id === cartItemId || i.variantId === cartItemId
    );
    const targetVariantId = item?.variantId || cartItemId;

    // Optimistic removal
    setAuthCart((prev) =>
      prev.filter((i) => i.id !== cartItemId && i.variantId !== targetVariantId)
    );
    authCartRef.current = authCartRef.current.filter(
      (i) => i.id !== cartItemId && i.variantId !== targetVariantId
    );

    const op = async () => {
      try {
        setCartError(null);
        const res = await cartApi.removeCartItem(targetVariantId);
        const uiItems = res.items.map(mapBackendCartItemToUi);
        setAuthCart(uiItems);
        authCartRef.current = uiItems;
        setAuthCartSubtotal(res.subtotalAmount);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 404) {
          // Item already removed on backend: refresh state silently
          try {
            const refreshed = await cartApi.getCart();
            const uiItems = refreshed.items.map(mapBackendCartItemToUi);
            setAuthCart(uiItems);
            authCartRef.current = uiItems;
            setAuthCartSubtotal(refreshed.subtotalAmount);
          } catch {
            // Keep optimistic removal
          }
          return;
        }

        const msg = err instanceof Error ? err.message : 'Failed to remove item from cart';
        setCartError(msg);
        // Refresh authoritative cart to rollback
        try {
          const refreshed = await cartApi.getCart();
          const uiItems = refreshed.items.map(mapBackendCartItemToUi);
          setAuthCart(uiItems);
          authCartRef.current = uiItems;
          setAuthCartSubtotal(refreshed.subtotalAmount);
        } catch {
          // Keep current state
        }
        throw err;
      }
    };

    const nextQueue = cartQueueRef.current.then(op, op);
    cartQueueRef.current = nextQueue.catch(() => {});
    return nextQueue;
  };

  const clearCart = useCallback(async (): Promise<void> => {
    if (authMode !== 'AUTHENTICATED') {
      setDemoCart([]);
      return;
    }

    // Optimistic clear
    setAuthCart([]);
    authCartRef.current = [];
    setAuthCartSubtotal(0);

    const op = async () => {
      try {
        setCartError(null);
        const res = await cartApi.clearCart();
        const uiItems = res.items.map(mapBackendCartItemToUi);
        setAuthCart(uiItems);
        authCartRef.current = uiItems;
        setAuthCartSubtotal(res.subtotalAmount);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to clear cart';
        setCartError(msg);
        try {
          const refreshed = await cartApi.getCart();
          const uiItems = refreshed.items.map(mapBackendCartItemToUi);
          setAuthCart(uiItems);
          authCartRef.current = uiItems;
          setAuthCartSubtotal(refreshed.subtotalAmount);
        } catch {
          // Keep current state
        }
        throw err;
      }
    };

    const nextQueue = cartQueueRef.current.then(op, op);
    cartQueueRef.current = nextQueue.catch(() => {});
    return nextQueue;
  }, [authMode]);

  const cart = authMode === 'AUTHENTICATED' ? authCart : demoCart;
  const cartTotalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal =
    authMode === 'AUTHENTICATED'
      ? authCartSubtotal
      : demoCart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const wishlist = authMode === 'AUTHENTICATED' ? authWishlistIds : demoWishlist;
  const wishlistProducts = authMode === 'AUTHENTICATED' ? authWishlistProducts : [];

  const toggleWishlist = async (productId: string) => {
    if (authMode === 'AUTHENTICATED') {
      const alreadyIn = authWishlistIdsRef.current.includes(productId);

      if (alreadyIn) {
        // Optimistic UI removal
        setAuthWishlistIds((prev) => prev.filter((id) => id !== productId));
        setAuthWishlistProducts((prev) => prev.filter((p) => p.id !== productId));
        authWishlistIdsRef.current = authWishlistIdsRef.current.filter((id) => id !== productId);
        authWishlistProductsRef.current = authWishlistProductsRef.current.filter((p) => p.id !== productId);

        const runOp = async () => {
          try {
            const res = await wishlistApi.removeFromWishlist(productId);
            setAuthWishlistIds(res.items.map((i) => i.productId));
            setAuthWishlistProducts(res.items.map(mapWishlistItemToProduct));
            authWishlistIdsRef.current = res.items.map((i) => i.productId);
            authWishlistProductsRef.current = res.items.map(mapWishlistItemToProduct);
            setWishlistError(null);
          } catch (err) {
            // Handle 404: item already removed on server
            if (err instanceof ApiError && err.statusCode === 404) {
              try {
                const refreshed = await wishlistApi.getWishlist();
                setAuthWishlistIds(refreshed.items.map((i) => i.productId));
                setAuthWishlistProducts(refreshed.items.map(mapWishlistItemToProduct));
                authWishlistIdsRef.current = refreshed.items.map((i) => i.productId);
                authWishlistProductsRef.current = refreshed.items.map(mapWishlistItemToProduct);
                setWishlistError(null);
              } catch {
                // If refresh fails, keep current optimistic state
              }
              return;
            }

            // Specific delta rollback: re-add only this product if still absent
            setAuthWishlistIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
            authWishlistIdsRef.current = authWishlistIdsRef.current.includes(productId)
              ? authWishlistIdsRef.current
              : [...authWishlistIdsRef.current, productId];

            const msg = err instanceof Error ? err.message : 'Failed to update wishlist on server';
            setWishlistError(msg);
            throw err;
          }
        };

        const currentQueue = wishlistQueueRef.current.then(runOp, runOp);
        wishlistQueueRef.current = currentQueue.catch(() => {});
        return currentQueue;
      } else {
        // Optimistic UI add
        setAuthWishlistIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
        if (!authWishlistIdsRef.current.includes(productId)) {
          authWishlistIdsRef.current = [...authWishlistIdsRef.current, productId];
        }

        const runOp = async () => {
          try {
            const res = await wishlistApi.addToWishlist({ productId });
            setAuthWishlistIds(res.items.map((i) => i.productId));
            setAuthWishlistProducts(res.items.map(mapWishlistItemToProduct));
            authWishlistIdsRef.current = res.items.map((i) => i.productId);
            authWishlistProductsRef.current = res.items.map(mapWishlistItemToProduct);
            setWishlistError(null);
          } catch (err) {
            // Specific delta rollback: remove only this product if it was optimistically added
            setAuthWishlistIds((prev) => prev.filter((id) => id !== productId));
            setAuthWishlistProducts((prev) => prev.filter((p) => p.id !== productId));
            authWishlistIdsRef.current = authWishlistIdsRef.current.filter((id) => id !== productId);
            authWishlistProductsRef.current = authWishlistProductsRef.current.filter((p) => p.id !== productId);

            const msg = err instanceof Error ? err.message : 'Failed to add item to wishlist';
            setWishlistError(msg);
            throw err;
          }
        };

        const currentQueue = wishlistQueueRef.current.then(runOp, runOp);
        wishlistQueueRef.current = currentQueue.catch(() => {});
        return currentQueue;
      }
    }

    // Demo Mode toggle
    setDemoWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const removeFromWishlist = async (productId: string) => {
    if (authMode === 'AUTHENTICATED') {
      // Optimistic UI removal
      setAuthWishlistIds((prev) => prev.filter((id) => id !== productId));
      setAuthWishlistProducts((prev) => prev.filter((p) => p.id !== productId));
      authWishlistIdsRef.current = authWishlistIdsRef.current.filter((id) => id !== productId);
      authWishlistProductsRef.current = authWishlistProductsRef.current.filter((p) => p.id !== productId);

      const runOp = async () => {
        try {
          const res = await wishlistApi.removeFromWishlist(productId);
          setAuthWishlistIds(res.items.map((i) => i.productId));
          setAuthWishlistProducts(res.items.map(mapWishlistItemToProduct));
          authWishlistIdsRef.current = res.items.map((i) => i.productId);
          authWishlistProductsRef.current = res.items.map(mapWishlistItemToProduct);
          setWishlistError(null);
        } catch (err) {
          // Handle 404: item already removed on server
          if (err instanceof ApiError && err.statusCode === 404) {
            try {
              const refreshed = await wishlistApi.getWishlist();
              setAuthWishlistIds(refreshed.items.map((i) => i.productId));
              setAuthWishlistProducts(refreshed.items.map(mapWishlistItemToProduct));
              authWishlistIdsRef.current = refreshed.items.map((i) => i.productId);
              authWishlistProductsRef.current = refreshed.items.map(mapWishlistItemToProduct);
              setWishlistError(null);
            } catch {
              // If refresh fails, keep current optimistic state
            }
            return;
          }

          // Delta rollback: restore only this product
          setAuthWishlistIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
          authWishlistIdsRef.current = authWishlistIdsRef.current.includes(productId)
            ? authWishlistIdsRef.current
            : [...authWishlistIdsRef.current, productId];

          const msg = err instanceof Error ? err.message : 'Failed to remove item from wishlist';
          setWishlistError(msg);
          throw err;
        }
      };

      const currentQueue = wishlistQueueRef.current.then(runOp, runOp);
      wishlistQueueRef.current = currentQueue.catch(() => {});
      return currentQueue;
    }

    // Demo Mode removal
    setDemoWishlist((prev) => prev.filter((id) => id !== productId));
  };

  const clearWishlist = async () => {
    if (authMode === 'AUTHENTICATED') {
      const snapshotIds = [...authWishlistIdsRef.current];
      const snapshotProducts = [...authWishlistProductsRef.current];

      setAuthWishlistIds([]);
      setAuthWishlistProducts([]);
      authWishlistIdsRef.current = [];
      authWishlistProductsRef.current = [];

      const runOp = async () => {
        try {
          await wishlistApi.clearWishlist();
          setWishlistError(null);
        } catch (err) {
          // On clear failure, only restore snapshot if queue hasn't had later updates
          if (authWishlistIdsRef.current.length === 0) {
            setAuthWishlistIds(snapshotIds);
            setAuthWishlistProducts(snapshotProducts);
            authWishlistIdsRef.current = snapshotIds;
            authWishlistProductsRef.current = snapshotProducts;
          }
          const msg = err instanceof Error ? err.message : 'Failed to clear wishlist';
          setWishlistError(msg);
          throw err;
        }
      };

      const currentQueue = wishlistQueueRef.current.then(runOp, runOp);
      wishlistQueueRef.current = currentQueue.catch(() => {});
      return currentQueue;
    }

    // Demo Mode clear
    setDemoWishlist([]);
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);


  const updateUserProfile = async (profile: Partial<UserProfile>) => {
    if (authMode === 'AUTHENTICATED' && authUser) {
      let firstName = authUser.firstName;
      let lastName = authUser.lastName;
      if (profile.fullName) {
        const parts = profile.fullName.trim().split(' ');
        firstName = parts[0] || authUser.firstName;
        lastName = parts.slice(1).join(' ') || authUser.lastName;
      }
      const phoneDigits = profile.phone ? profile.phone.replace(/\D/g, '').slice(-10) : undefined;
      const res = await authApi.updateProfile({
        firstName,
        lastName,
        phone: phoneDigits || undefined,
      });
      setAuthUser(res.user);
      if (authUser.id) {
        saveStoredProfileMeta(authUser.id, {
          gender: profile.gender,
          dateOfBirth: profile.dateOfBirth,
        });
      }
      setUser((prev) => ({
        id: res.user.id,
        fullName: `${res.user.firstName} ${res.user.lastName}`.trim(),
        email: res.user.email,
        phone: res.user.phone || '',
        gender: profile.gender !== undefined ? profile.gender : (prev?.gender || ''),
        dateOfBirth: profile.dateOfBirth !== undefined ? profile.dateOfBirth : (prev?.dateOfBirth || ''),
        emailVerified: Boolean(res.user.isEmailVerified),
      }));
    } else if (user) {
      setUser({ ...user, ...profile });
    }
  };

  const addAddress = async (addr: Omit<Address, 'id'>) => {
    if (authMode === 'AUTHENTICATED') {
      const payload = mapUiAddressToCreatePayload(addr);
      const created = await addressesApi.createAddress(payload);
      const uiAddr = mapBackendAddressToUi(created);
      await fetchAddresses();
      if (uiAddr.isDefault) {
        setSelectedAddressId(uiAddr.id);
      }
      return;
    }

    // Demo Mode in-memory creation
    const newAddr: Address = {
      ...addr,
      id: `addr-${Date.now()}`,
    };
    if (newAddr.isDefault) {
      setAddresses((prev) => prev.map((a) => ({ ...a, isDefault: false })).concat(newAddr));
      setSelectedAddressId(newAddr.id);
    } else {
      setAddresses((prev) => [...prev, newAddr]);
    }
  };

  const updateAddress = async (updated: Address) => {
    if (authMode === 'AUTHENTICATED') {
      const payload = mapUiAddressToUpdatePayload(updated);
      await addressesApi.updateAddress(updated.id, payload);
      await fetchAddresses();
      return;
    }

    // Demo Mode in-memory update
    setAddresses((prev) =>
      prev.map((a) => {
        if (a.id === updated.id) {
          return updated;
        }
        if (updated.isDefault) {
          return { ...a, isDefault: false };
        }
        return a;
      })
    );
  };

  const deleteAddress = async (id: string) => {
    if (authMode === 'AUTHENTICATED') {
      await addressesApi.deleteAddress(id);
      await fetchAddresses();
      return;
    }

    // Demo Mode in-memory deletion
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    if (selectedAddressId === id) {
      const remaining = addresses.filter((a) => a.id !== id);
      if (remaining.length > 0) {
        setSelectedAddressId(remaining[0].id);
      }
    }
  };

  const setDefaultAddress = async (id: string) => {
    if (authMode === 'AUTHENTICATED') {
      await addressesApi.setDefaultAddress(id);
      await fetchAddresses();
      setSelectedAddressId(id);
      return;
    }

    // Demo Mode in-memory default toggle
    setAddresses((prev) =>
      prev.map((a) => ({
        ...a,
        isDefault: a.id === id,
      }))
    );
    setSelectedAddressId(id);
  };

  const recordOrder = useCallback((order: Order) => {
    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === order.id || o.orderNumber === order.orderNumber);
      if (idx >= 0) {
        const existing = prev[idx];
        const incomingHasItems = order.packages.some((p) => p.items.length > 0);
        const existingHasItems = existing.packages.some((p) => p.items.length > 0);

        if (incomingHasItems || !existingHasItems) {
          const next = [...prev];
          next[idx] = order;
          return next;
        }

        const next = [...prev];
        next[idx] = {
          ...existing,
          status: order.status,
          totalAmount: order.totalAmount,
        };
        return next;
      }
      return [order, ...prev];
    });
  }, []);

  const placeOrder = useCallback(async (notes?: string, checkoutAttemptId?: string): Promise<Order> => {
    const chosenAddress = addresses.find((a) => a.id === selectedAddressId) || addresses[0];

    if (authMode === 'AUTHENTICATED' && checkoutAttemptId) {
      const res = await checkoutApi.placeOrder({
        checkoutAttemptId,
        notes,
      });
      const uiOrder = mapBackendOrderToUi(res.order);
      recordOrder(uiOrder);
      // Authoritative clear
      try {
        await clearCart();
      } catch {
        // Ignored if backend cart was already cleared by order placement
      }
      return uiOrder;
    }

    // Demo Mode in-memory order placement
    // Group cart items by seller
    const packagesMap = new Map<string, CartItem[]>();
    cart.forEach((item) => {
      const existing = packagesMap.get(item.sellerId) || [];
      existing.push(item);
      packagesMap.set(item.sellerId, existing);
    });

    const orderPackages = Array.from(packagesMap.entries()).map(([sellerId, items]) => {
      const sellerName = items[0]?.sellerName || 'Marketplace Seller';
      return {
        sellerId,
        sellerName,
        trackingNumber: `EXP-IN-${Math.floor(100000 + Math.random() * 900000)}`,
        packageStatus: 'PROCESSING' as const,
        estimatedDelivery: '3 to 5 business days',
        items: items.map((i) => ({
          product: i.product,
          quantity: i.quantity,
          unitPrice: i.price,
          selectedVariants: i.selectedVariants,
        })),
      };
    });

    const newOrder: Order = {
      id: `ord-${Date.now()}`,
      orderNumber: `BB-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
      createdAt: new Date().toISOString(),
      status: 'PLACED',
      packages: orderPackages,
      shippingAddress: chosenAddress,
      itemsSubtotal: cartSubtotal,
      estimatedShippingFee: cart.length > 0 ? 80 : 0,
      discount: 100,
      totalAmount: Math.max(0, cartSubtotal + (cart.length > 0 ? 80 : 0) - 100),
      paymentMethod: 'Cash on Delivery (COD) / Pay on Arrival',
      paymentStatus: 'PENDING',
    };

    setOrders((prev) => [newOrder, ...prev]);
    clearCart();
    return newOrder;
  }, [addresses, selectedAddressId, authMode, recordOrder, clearCart, cart, cartSubtotal]);

  return (
    <MarketplaceContext.Provider
      value={{
        cart,
        cartLoading,
        cartError,
        fetchCart,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        cartTotalCount,
        cartSubtotal,
        wishlist,
        wishlistProducts,
        wishlistLoading,
        wishlistError,
        fetchWishlist,
        toggleWishlist,
        removeFromWishlist,
        clearWishlist,
        isInWishlist,
        user,
        setUser,
        updateUserProfile,

        authMode,
        authUser,
        setAuthenticatedSession,
        setDemoAuth,
        setAnonymousAuth,
        logout,
        addresses,
        addressesLoading,
        addressesError,
        fetchAddresses,
        addAddress,
        updateAddress,
        deleteAddress,
        setDefaultAddress,
        selectedAddressId,
        setSelectedAddressId,
        orders,
        ordersLoading,
        ordersError,
        fetchOrders,
        placeOrder,
        recordOrder,
        pincode,
        setPincode,
        searchQuery,
        setSearchQuery,
      }}
    >
      {children}
    </MarketplaceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMarketplace(): MarketplaceContextValue {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) {
    throw new Error('useMarketplace must be used within a MarketplaceProvider');
  }
  return ctx;
}
