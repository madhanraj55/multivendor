import { useState, type FormEvent } from 'react';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import type { Address } from '../types/index.ts';
import { EmptyState } from '../components/common/StateViews.tsx';
import './AddressManagementPage.css';

export function AddressManagementPage() {
  const { addresses, addAddress, updateAddress, deleteAddress, setDefaultAddress } =
    useMarketplace();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<'HOME' | 'WORK' | 'OTHER'>('HOME');
  const [street, setStreet] = useState('');
  const [locality, setLocality] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const openAddModal = () => {
    setEditingAddressId(null);
    setName('');
    setPhone('');
    setType('HOME');
    setStreet('');
    setLocality('');
    setCity('Bengaluru');
    setState('Karnataka');
    setPincode('560038');
    setIsDefault(addresses.length === 0);
    setIsModalOpen(true);
  };

  const openEditModal = (addr: Address) => {
    setEditingAddressId(addr.id);
    setName(addr.name);
    setPhone(addr.phone);
    setType(addr.type);
    setStreet(addr.street);
    setLocality(addr.locality);
    setCity(addr.city);
    setState(addr.state);
    setPincode(addr.pincode);
    setIsDefault(addr.isDefault);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (editingAddressId) {
      updateAddress({
        id: editingAddressId,
        name,
        phone,
        type,
        street,
        locality,
        city,
        state,
        pincode,
        isDefault,
      });
    } else {
      addAddress({
        name,
        phone,
        type,
        street,
        locality,
        city,
        state,
        pincode,
        isDefault,
      });
    }
    setIsModalOpen(false);
  };

  return (
    <div className="bb-container bb-address-container">
      <div className="bb-address-top">
        <div>
          <h1 className="bb-plp-title">Saved Delivery Addresses</h1>
          <p className="bb-section-subtitle">
            Manage your delivery destinations for multi-vendor parcels and shipments
          </p>
        </div>
        <button
          type="button"
          className="bb-btn bb-btn-primary"
          onClick={openAddModal}
        >
          + Add New Address
        </button>
      </div>

      {addresses.length === 0 ? (
        <EmptyState
          icon="📍"
          title="No Saved Addresses"
          description="You haven't added any shipping addresses yet. Add one to enable seamless one-click checkout."
          actionText="+ Add Address"
          onAction={openAddModal}
        />
      ) : (
        <div className="bb-address-grid">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`bb-address-card ${addr.isDefault ? 'default-address' : ''}`}
            >
              <div>
                <div className="bb-address-badges">
                  <span className="bb-badge bb-badge-neutral">{addr.type}</span>
                  {addr.isDefault && (
                    <span className="bb-badge bb-badge-primary">DEFAULT ADDRESS</span>
                  )}
                </div>

                <h3 className="bb-address-name">{addr.name}</h3>
                <p className="bb-address-text">
                  {addr.street}, {addr.locality}, {addr.city}, {addr.state} -{' '}
                  <strong>{addr.pincode}</strong>
                </p>
                <div className="bb-address-phone">📞 Phone: {addr.phone}</div>
              </div>

              <div className="bb-address-card-actions">
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary bb-btn-sm"
                  onClick={() => openEditModal(addr)}
                >
                  Edit
                </button>
                {!addr.isDefault && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-outline bb-btn-sm"
                    onClick={() => setDefaultAddress(addr.id)}
                  >
                    Set as Default
                  </button>
                )}
                {addresses.length > 1 && (
                  <button
                    type="button"
                    className="bb-btn bb-btn-ghost bb-btn-sm"
                    onClick={() => {
                      if (confirm('Delete this address?')) {
                        deleteAddress(addr.id);
                      }
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Dialog */}
      {isModalOpen && (
        <div
          className="bb-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="bb-modal-card">
            <div className="bb-modal-header">
              <h2 className="bb-panel-title">
                {editingAddressId ? 'Edit Address' : 'Add New Delivery Address'}
              </h2>
              <button
                type="button"
                className="bb-modal-close"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="bb-address-type-selector">
                {(['HOME', 'WORK', 'OTHER'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`bb-address-type-btn ${type === t ? 'active' : ''}`}
                    onClick={() => setType(t)}
                  >
                    {t === 'HOME' ? '🏠 Home' : t === 'WORK' ? '🏢 Work' : '📍 Other'}
                  </button>
                ))}
              </div>

              <div className="bb-profile-form-grid">
                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">Recipient Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ananya Sharma"
                    className="bb-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">10-Digit Mobile Number</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="e.g. 9876543210"
                    className="bb-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Flat / House No. / Building / Street</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flat 402, Shanti Niketan Apts, 14th Main"
                  className="bb-input"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                />
              </div>

              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Area / Locality / Landmark</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Indiranagar, Near Metro Station"
                  className="bb-input"
                  value={locality}
                  onChange={(e) => setLocality(e.target.value)}
                />
              </div>

              <div className="bb-profile-form-grid">
                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">6-Digit PIN Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="e.g. 560038"
                    className="bb-input"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                  />
                </div>

                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">City / District</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bengaluru"
                    className="bb-input"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
              </div>

              <div className="bb-form-group">
                <label className="bb-label bb-label-required">State</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Karnataka"
                  className="bb-input"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>

              <div className="bb-checkbox-row">
                <input
                  type="checkbox"
                  id="defaultAddressCheckbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <label htmlFor="defaultAddressCheckbox">
                  Make this my default shipping address
                </label>
              </div>

              <div className="bb-auth-action-row">
                <button
                  type="submit"
                  className="bb-btn bb-btn-primary bb-btn-block"
                >
                  {editingAddressId ? 'Update Address' : 'Save Address'}
                </button>
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
