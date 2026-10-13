import { useState } from 'react';
import { SkeletonGrid, EmptyState, ErrorState, LoadingSpinner } from '../components/common/StateViews.tsx';
import { useRouter } from '../context/RouterContext.tsx';
import './StateShowcasePage.css';

export function StateShowcasePage() {
  const { navigate } = useRouter();
  const [activeState, setActiveState] = useState<
    'loading' | 'empty' | 'validation' | 'unavailable' | 'error'
  >('loading');

  const [testEmail, setTestEmail] = useState('invalid-email');
  const [testPhone, setTestPhone] = useState('123');

  return (
    <div className="bb-container bb-showcase-container">
      <div className="bb-checkout-header">
        <h1 className="bb-plp-title">Platform UI State Showcase</h1>
        <p className="bb-section-subtitle">
          Interactive catalog of customer edge states: Loading skeletons, Empty lists, Validation errors, Unavailable products, and Server error boundaries
        </p>
      </div>

      <div className="bb-showcase-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeState === 'loading'}
          className={`bb-showcase-tab-btn ${activeState === 'loading' ? 'active' : ''}`}
          onClick={() => setActiveState('loading')}
        >
          1. Loading & Skeleton
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeState === 'empty'}
          className={`bb-showcase-tab-btn ${activeState === 'empty' ? 'active' : ''}`}
          onClick={() => setActiveState('empty')}
        >
          2. Empty State
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeState === 'validation'}
          className={`bb-showcase-tab-btn ${activeState === 'validation' ? 'active' : ''}`}
          onClick={() => setActiveState('validation')}
        >
          3. Validation Errors
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeState === 'unavailable'}
          className={`bb-showcase-tab-btn ${activeState === 'unavailable' ? 'active' : ''}`}
          onClick={() => setActiveState('unavailable')}
        >
          4. Unavailable Product
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeState === 'error'}
          className={`bb-showcase-tab-btn ${activeState === 'error' ? 'active' : ''}`}
          onClick={() => setActiveState('error')}
        >
          5. General Error
        </button>
      </div>

      <div className="bb-showcase-preview-card">
        {/* 1. Loading State */}
        {activeState === 'loading' && (
          <div>
            <div className="bb-checkout-section-header">
              <h3 className="bb-panel-title">Product Catalog Skeleton Loading</h3>
              <span className="bb-badge bb-badge-primary">Async Fetch State</span>
            </div>
            <LoadingSpinner />
            <SkeletonGrid count={4} />
          </div>
        )}

        {/* 2. Empty State */}
        {activeState === 'empty' && (
          <EmptyState
            icon="🛍️"
            title="No Items Found in this Category"
            description="We couldn't find any products matching your current filters. Try resetting the price range or changing category."
            actionText="Clear All Filters"
            onAction={() => navigate('/products')}
          />
        )}

        {/* 3. Validation Errors State */}
        {activeState === 'validation' && (
          <div className="bb-validation-box">
            <div className="bb-checkout-section-header">
              <h3 className="bb-panel-title">Form Validation Feedback</h3>
              <span className="bb-badge bb-badge-danger">Validation Error State</span>
            </div>

            <div className="bb-badge bb-badge-danger bb-btn-block bb-auth-error-banner">
              ⚠️ Please correct the highlighted errors before proceeding to checkout.
            </div>

            <div className="bb-form-group">
              <label className="bb-label bb-label-required">Email Address</label>
              <input
                type="text"
                className="bb-input bb-input-error"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
              <span className="bb-form-error">Please enter a valid email address containing '@' and domain.</span>
            </div>

            <div className="bb-form-group">
              <label className="bb-label bb-label-required">10-Digit Mobile Number</label>
              <input
                type="text"
                className="bb-input bb-input-error"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
              />
              <span className="bb-form-error">Mobile number must be exactly 10 digits without spaces or country code.</span>
            </div>

            <button type="button" className="bb-btn bb-btn-primary bb-btn-block">
              Submit Form
            </button>
          </div>
        )}

        {/* 4. Unavailable Product */}
        {activeState === 'unavailable' && (
          <EmptyState
            icon="🚫"
            title="Product Currently Unavailable"
            description="This handcrafted item has been temporarily discontinued or sold out across all regional vendor inventories."
            actionText="Browse Similar Recommendations"
            onAction={() => navigate('/products')}
          />
        )}

        {/* 5. General Error */}
        {activeState === 'error' && (
          <ErrorState
            title="Unable to Load Marketplace Products"
            description="A network timeout occurred while communicating with the catalog cluster. Please retry or check your internet connection."
            onRetry={() => alert('Simulated reload triggered!')}
          />
        )}
      </div>
    </div>
  );
}
