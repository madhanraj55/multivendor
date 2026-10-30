import { RouterProvider, useRouter } from './context/RouterContext.tsx';
import { MarketplaceProvider, useMarketplace } from './context/MarketplaceContext.tsx';
import { Header } from './components/common/Header.tsx';
import { Footer } from './components/common/Footer.tsx';
import { EmptyState } from './components/common/StateViews.tsx';

// Customer Pages
import { HomePage } from './pages/HomePage.tsx';
import { ProductListingPage } from './pages/ProductListingPage.tsx';
import { ProductDetailPage } from './pages/ProductDetailPage.tsx';
import { CartPage } from './pages/CartPage.tsx';
import { WishlistPage } from './pages/WishlistPage.tsx';
import { AuthPages } from './pages/AuthPages.tsx';
import { EmailVerificationPage } from './pages/EmailVerificationPage.tsx';
import { AccountProfilePage } from './pages/AccountProfilePage.tsx';
import { AddressManagementPage } from './pages/AddressManagementPage.tsx';
import { OrdersPage } from './pages/OrdersPage.tsx';
import { CheckoutPage } from './pages/CheckoutPage.tsx';
import { StateShowcasePage } from './pages/StateShowcasePage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AdminOrdersPage } from './pages/AdminOrdersPage.tsx';
import { AdminSellersPage } from './pages/AdminSellersPage.tsx';
import { AdminCustomersPage } from './pages/AdminCustomersPage.tsx';
import { SellerOrdersPage } from './pages/SellerOrdersPage.tsx';
import { SellerProductsPage } from './pages/SellerProductsPage.tsx';
import { SellerDashboardPage } from './pages/SellerDashboardPage.tsx';

import './App.css';

function MainRouterView() {
  const { path, navigate } = useRouter();
  const { authUser, authMode } = useMarketplace();

  // Route resolver
  const renderCurrentPage = () => {
    if (path === '/' || path === '') {
      return <HomePage />;
    }

    if (path === '/products') {
      return <ProductListingPage />;
    }

    if (path.startsWith('/product/')) {
      const productId = path.replace('/product/', '').split('?')[0];
      return <ProductDetailPage productId={productId} />;
    }

    if (path === '/cart') {
      return <CartPage />;
    }

    if (path === '/wishlist') {
      return <WishlistPage />;
    }

    if (path === '/login') {
      return <AuthPages defaultMode="login" />;
    }

    if (path === '/register' || path === '/seller/register') {
      return <AuthPages defaultMode="register" />;
    }

    if (path === '/verify-email') {
      return <EmailVerificationPage />;
    }

    if (path === '/profile' || path === '/account') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Customer Sign In Required"
              description="Please sign in to your account to view your profile settings and personal details."
              actionText="Sign In to Account"
              onAction={() => navigate('/login?redirect=/profile')}
            />
          </div>
        );
      }
      return <AccountProfilePage />;
    }

    if (path === '/addresses') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Customer Sign In Required"
              description="Please sign in to manage your saved delivery addresses."
              actionText="Sign In to Account"
              onAction={() => navigate('/login?redirect=/addresses')}
            />
          </div>
        );
      }
      return <AddressManagementPage />;
    }

    if (path === '/orders') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Customer Sign In Required"
              description="Please sign in to view your past orders, delivery tracking, and package status."
              actionText="Sign In to Account"
              onAction={() => navigate('/login?redirect=/orders')}
            />
          </div>
        );
      }
      return <OrdersPage />;
    }

    if (path === '/checkout') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Sign In Required to Checkout"
              description="To place an order and select your delivery address, please sign in or create an account."
              actionText="Sign In to Proceed to Checkout"
              onAction={() => navigate('/login?redirect=/checkout')}
            />
          </div>
        );
      }
      return <CheckoutPage />;
    }

    if (path === '/states-demo') {
      return <StateShowcasePage />;
    }

    if (path === '/admin' || path === '/admin/dashboard') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Administrator Authentication Required"
              description="Please sign in with your administrator account to access the platform operations dashboard."
              actionText="Sign In to Admin Portal"
              onAction={() => navigate('/login')}
            />
          </div>
        );
      }

      if (authUser.role !== 'ADMIN') {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🚫"
              title="Administrator Privileges Required (403)"
              description={`Access Denied. Your account is registered as ${authUser.role}. This management portal is strictly restricted to platform administrators.`}
              actionText="Return to Marketplace Home"
              onAction={() => navigate('/')}
            />
          </div>
        );
      }

      return <AdminDashboardPage />;
    }

    if (path === '/admin/orders') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Administrator Authentication Required"
              description="Please sign in with your administrator account to access the marketplace order control dashboard."
              actionText="Sign In to Admin Portal"
              onAction={() => navigate('/login')}
            />
          </div>
        );
      }

      if (authUser.role !== 'ADMIN') {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🚫"
              title="Administrator Privileges Required (403)"
              description={`Access Denied. Your account is registered as ${authUser.role}. This management portal is strictly restricted to platform administrators.`}
              actionText="Return to Marketplace Home"
              onAction={() => navigate('/')}
            />
          </div>
        );
      }

      return <AdminOrdersPage />;
    }

    if (path === '/admin/sellers') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Administrator Authentication Required"
              description="Please sign in with your administrator account to access the seller review and approval management console."
              actionText="Sign In to Admin Portal"
              onAction={() => navigate('/login')}
            />
          </div>
        );
      }

      if (authUser.role !== 'ADMIN') {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🚫"
              title="Administrator Privileges Required (403)"
              description={`Access Denied. Your account is registered as ${authUser.role}. This management portal is strictly restricted to platform administrators.`}
              actionText="Return to Marketplace Home"
              onAction={() => navigate('/')}
            />
          </div>
        );
      }

      return <AdminSellersPage />;
    }

    if (path === '/admin/customers') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Administrator Authentication Required"
              description="Please sign in with your administrator account to access customer and user account management."
              actionText="Sign In to Admin Portal"
              onAction={() => navigate('/login')}
            />
          </div>
        );
      }

      if (authUser.role !== 'ADMIN') {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🚫"
              title="Administrator Privileges Required (403)"
              description={`Access Denied. Your account is registered as ${authUser.role}. This management portal is strictly restricted to platform administrators.`}
              actionText="Return to Marketplace Home"
              onAction={() => navigate('/')}
            />
          </div>
        );
      }

      return <AdminCustomersPage />;
    }

    if (path === '/seller' || path === '/seller/dashboard') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Vendor Authentication Required"
              description="Please sign in with your vendor account to access your shop control dashboard."
              actionText="Sign In to Vendor Portal"
              onAction={() => navigate('/login')}
            />
          </div>
        );
      }

      if (authUser.role !== 'SELLER') {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🚫"
              title="Vendor Access Required (403)"
              description={`Access Denied. Your account is registered as ${authUser.role}. This portal is exclusively for verified vendor accounts.`}
              actionText="Return to Marketplace Home"
              onAction={() => navigate('/')}
            />
          </div>
        );
      }

      return <SellerDashboardPage />;
    }

    if (path === '/seller/orders') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Vendor Authentication Required"
              description="Please sign in with your vendor account to access your shop order fulfillment dashboard."
              actionText="Sign In to Vendor Portal"
              onAction={() => navigate('/login')}
            />
          </div>
        );
      }

      if (authUser.role !== 'SELLER') {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🚫"
              title="Vendor Access Required (403)"
              description={`Access Denied. Your account is registered as ${authUser.role}. This portal is exclusively for verified vendor accounts.`}
              actionText="Return to Marketplace Home"
              onAction={() => navigate('/')}
            />
          </div>
        );
      }

      return <SellerOrdersPage />;
    }

    if (path === '/seller/products') {
      if (authMode !== 'AUTHENTICATED' || !authUser) {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🔒"
              title="Vendor Authentication Required"
              description="Please sign in with your vendor account to access your shop product catalogue."
              actionText="Sign In to Vendor Portal"
              onAction={() => navigate('/login')}
            />
          </div>
        );
      }

      if (authUser.role !== 'SELLER') {
        return (
          <div className="bb-container bb-not-found-container">
            <EmptyState
              icon="🚫"
              title="Vendor Access Required (403)"
              description={`Access Denied. Your account is registered as ${authUser.role}. This portal is exclusively for verified vendor accounts.`}
              actionText="Return to Marketplace Home"
              onAction={() => navigate('/')}
            />
          </div>
        );
      }

      return <SellerProductsPage />;
    }

    // 404 Fallback
    return (
      <div className="bb-container bb-not-found-container">
        <EmptyState
          icon="🧭"
          title="Page Not Found (404)"
          description="The storefront destination you requested does not exist or may have moved."
          actionText="Return to Homepage"
          onAction={() => navigate('/')}
        />
      </div>
    );
  };

  return (
    <div className="bb-app-shell">
      <Header />
      <div className="bb-main-content">{renderCurrentPage()}</div>
      <Footer />
    </div>
  );
}

export function App() {
  return (
    <RouterProvider>
      <MarketplaceProvider>
        <MainRouterView />
      </MarketplaceProvider>
    </RouterProvider>
  );
}

export default App;
