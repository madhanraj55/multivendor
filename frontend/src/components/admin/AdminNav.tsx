import { useRouter } from '../../context/RouterContext.tsx';
import './AdminNav.css';

interface AdminNavProps {
  activeModule: 'dashboard' | 'orders' | 'sellers' | 'customers' | 'pricing' | 'recent-orders';
}

export function AdminNav({ activeModule }: AdminNavProps) {
  const { navigate } = useRouter();

  const handleSectionNav = (section: 'pricing' | 'recent-orders', elementId: string) => {
    navigate(`/admin/dashboard?section=${section}`);
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  return (
    <div className="bb-admin-subnav-bar">
      <div className="bb-admin-subnav-links">
        <button
          type="button"
          className={`bb-admin-subnav-btn ${activeModule === 'dashboard' ? 'active' : ''}`}
          onClick={() => navigate('/admin/dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`bb-admin-subnav-btn ${activeModule === 'orders' ? 'active' : ''}`}
          onClick={() => navigate('/admin/orders')}
        >
          Orders
        </button>
        <button
          type="button"
          className={`bb-admin-subnav-btn ${activeModule === 'sellers' ? 'active' : ''}`}
          onClick={() => navigate('/admin/sellers')}
        >
          Sellers & Shops
        </button>
        <button
          type="button"
          className={`bb-admin-subnav-btn ${activeModule === 'customers' ? 'active' : ''}`}
          onClick={() => navigate('/admin/customers')}
        >
          Customers
        </button>
        <button
          type="button"
          className={`bb-admin-subnav-btn ${activeModule === 'pricing' ? 'active' : ''}`}
          onClick={() => handleSectionNav('pricing', 'admin-pricing-section')}
        >
          ⚙️ Pricing & Commission Controls
        </button>
        <button
          type="button"
          className={`bb-admin-subnav-btn ${activeModule === 'recent-orders' ? 'active' : ''}`}
          onClick={() => handleSectionNav('recent-orders', 'admin-recent-orders-section')}
        >
          Recent Customer Orders
        </button>
      </div>
    </div>
  );
}
