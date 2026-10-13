import { RouterProvider, useRouter } from './context/RouterContext.tsx';
import { MarketplaceProvider } from './context/MarketplaceContext.tsx';
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

import './App.css';

function MainRouterView() {
  const { path, navigate } = useRouter();

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

    if (path === '/register') {
      return <AuthPages defaultMode="register" />;
    }

    if (path === '/verify-email') {
      return <EmailVerificationPage />;
    }

    if (path === '/profile' || path === '/account') {
      return <AccountProfilePage />;
    }

    if (path === '/addresses') {
      return <AddressManagementPage />;
    }

    if (path === '/orders') {
      return <OrdersPage />;
    }

    if (path === '/checkout') {
      return <CheckoutPage />;
    }

    if (path === '/states-demo') {
      return <StateShowcasePage />;
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
