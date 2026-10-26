import { useRouter } from '../../context/RouterContext.tsx';
import './AdminNav.css';

interface AdminNavProps {
  activeModule: 'dashboard' | 'orders' | 'sellers' | 'customers';
}

export function AdminNav({ activeModule }: AdminNavProps) {
  const { navigate } = useRouter();

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
      </div>
    </div>
  );
}
