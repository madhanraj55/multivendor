import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
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
import {
  DEMO_PRODUCTS,
  DEMO_ADDRESSES,
  DEMO_ORDERS,
  DEMO_USER,
} from '../data/demoData.ts';
import { sessionManager } from '../services/apiClient.ts';
import { authApi } from '../services/authApi.ts';
import {
  addressesApi,
  mapBackendAddressToUi,
  mapUiAddressToCreatePayload,
  mapUiAddressToUpdatePayload,
} from '../services/addressesApi.ts';

interface MarketplaceContextValue {
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number, selectedVariants?: Record<string, string>) => void;
  updateCartQuantity: (cartItemId: string, quantity: number) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  cartTotalCount: number;
  cartSubtotal: number;

  wishlist: string[];
  toggleWishlist: (productId: string) => void;
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
  placeOrder: (notes?: string) => Order;

  pincode: string;
  setPincode: (pin: string) => void;

  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const MarketplaceContext = createContext<MarketplaceContextValue | null>(null);

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  // Initialize sample cart items from demo data
  const [cart, setCart] = useState<CartItem[]>([
    {
      id: 'cart-1',
      productId: DEMO_PRODUCTS[0].id,
      product: DEMO_PRODUCTS[0],
      selectedVariants: { Color: 'Midnight Obsidian', Edition: 'Standard Edition' },
      quantity: 1,
      price: DEMO_PRODUCTS[0].price,
      sellerId: DEMO_PRODUCTS[0].sellerId,
      sellerName: DEMO_PRODUCTS[0].sellerName,
    },
    {
      id: 'cart-2',
      productId: DEMO_PRODUCTS[3].id,
      product: DEMO_PRODUCTS[3],
      selectedVariants: {},
      quantity: 2,
      price: DEMO_PRODUCTS[3].price,
      sellerId: DEMO_PRODUCTS[3].sellerId,
      sellerName: DEMO_PRODUCTS[3].sellerName,
    },
  ]);

  const [wishlist, setWishlist] = useState<string[]>([
    DEMO_PRODUCTS[1].id,
    DEMO_PRODUCTS[4].id,
  ]);

  // Auth state: check if an active authenticated backend session exists
  const [authMode, setAuthMode] = useState<AuthMode>(() => {
    return sessionManager.getSession() ? 'AUTHENTICATED' : 'DEMO';
  });

  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    return sessionManager.getSession()?.user ?? null;
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    const existing = sessionManager.getSession();
    if (existing?.user) {
      return {
        id: existing.user.id,
        fullName: `${existing.user.firstName} ${existing.user.lastName}`.trim(),
        email: existing.user.email,
        phone: existing.user.phone || '',
        gender: '',
        dateOfBirth: '',
        emailVerified: Boolean(existing.user.isEmailVerified),
      };
    }
    return DEMO_USER;
  });

  useEffect(() => {
    const unsubscribe = sessionManager.subscribe((session) => {
      if (session) {
        setAuthMode('AUTHENTICATED');
        setAuthUser(session.user);
        setUser({
          id: session.user.id,
          fullName: `${session.user.firstName} ${session.user.lastName}`.trim(),
          email: session.user.email,
          phone: session.user.phone || '',
          gender: '',
          dateOfBirth: '',
          emailVerified: Boolean(session.user.isEmailVerified),
        });
      } else {
        setAuthMode((prev) => {
          if (prev === 'AUTHENTICATED') {
            setAuthUser(null);
            setUser(null);
            return 'ANONYMOUS';
          }
          return prev;
        });
      }
    });

    return unsubscribe;
  }, []);

  const setAuthenticatedSession = (session: AuthSession) => {
    sessionManager.setSession(session);
    setAuthMode('AUTHENTICATED');
    setAuthUser(session.user);
    setUser({
      id: session.user.id,
      fullName: `${session.user.firstName} ${session.user.lastName}`.trim(),
      email: session.user.email,
      phone: session.user.phone || '',
      gender: '',
      dateOfBirth: '',
      emailVerified: Boolean(session.user.isEmailVerified),
    });
  };

  const setDemoAuth = () => {
    sessionManager.clearSession();
    setAuthMode('DEMO');
    setAuthUser(null);
    setUser(DEMO_USER);
    setAddresses(DEMO_ADDRESSES);
    setSelectedAddressId(DEMO_ADDRESSES[0]?.id || '');
    setAddressesLoading(false);
    setAddressesError(null);
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
  };

  const [addresses, setAddresses] = useState<Address[]>(() => {
    return sessionManager.getSession() ? [] : DEMO_ADDRESSES;
  });
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [addressesError, setAddressesError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(() => {
    return sessionManager.getSession() ? '' : DEMO_ADDRESSES[0].id;
  });
  const [orders, setOrders] = useState<Order[]>(DEMO_ORDERS);
  const [pincode, setPincode] = useState<string>('560038');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchAddresses = useCallback(async () => {
    if (authMode !== 'AUTHENTICATED') {
      setAddresses(DEMO_ADDRESSES);
      setSelectedAddressId(DEMO_ADDRESSES[0]?.id || '');
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

  // Synchronize address list whenever authMode changes via external effect
  useEffect(() => {
    let isCancelled = false;

    if (authMode === 'AUTHENTICATED') {
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
    }

    return () => {
      isCancelled = true;
    };
  }, [authMode]);

  const addToCart = (
    product: Product,
    quantity = 1,
    selectedVariants: Record<string, string> = {}
  ) => {
    setCart((prev) => {
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
  };

  const updateCartQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === cartItemId ? { ...item, quantity } : item))
    );
  };

  const removeFromCart = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== cartItemId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartTotalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const isInWishlist = (productId: string) => wishlist.includes(productId);

  const updateUserProfile = async (profile: Partial<UserProfile>) => {
    if (user) {
      setUser({ ...user, ...profile });
    }
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

  const placeOrder = (): Order => {
    const chosenAddress = addresses.find((a) => a.id === selectedAddressId) || addresses[0];

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
  };

  return (
    <MarketplaceContext.Provider
      value={{
        cart,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        cartTotalCount,
        cartSubtotal,
        wishlist,
        toggleWishlist,
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
        placeOrder,
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
