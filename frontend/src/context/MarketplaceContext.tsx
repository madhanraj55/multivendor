import { createContext, useContext, useState, type ReactNode } from 'react';
import type {
  Product,
  CartItem,
  Address,
  Order,
  UserProfile,
} from '../types/index.ts';
import {
  DEMO_PRODUCTS,
  DEMO_ADDRESSES,
  DEMO_ORDERS,
  DEMO_USER,
} from '../data/demoData.ts';

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
  updateUserProfile: (profile: Partial<UserProfile>) => void;

  addresses: Address[];
  addAddress: (address: Omit<Address, 'id'>) => void;
  updateAddress: (address: Address) => void;
  deleteAddress: (id: string) => void;
  setDefaultAddress: (id: string) => void;
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

  const [user, setUser] = useState<UserProfile | null>(DEMO_USER);
  const [addresses, setAddresses] = useState<Address[]>(DEMO_ADDRESSES);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(DEMO_ADDRESSES[0].id);
  const [orders, setOrders] = useState<Order[]>(DEMO_ORDERS);
  const [pincode, setPincode] = useState<string>('560038');
  const [searchQuery, setSearchQuery] = useState<string>('');

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

  const updateUserProfile = (profile: Partial<UserProfile>) => {
    if (user) {
      setUser({ ...user, ...profile });
    }
  };

  const addAddress = (addr: Omit<Address, 'id'>) => {
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

  const updateAddress = (updated: Address) => {
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

  const deleteAddress = (id: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    if (selectedAddressId === id) {
      const remaining = addresses.filter((a) => a.id !== id);
      if (remaining.length > 0) {
        setSelectedAddressId(remaining[0].id);
      }
    }
  };

  const setDefaultAddress = (id: string) => {
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
        addresses,
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
