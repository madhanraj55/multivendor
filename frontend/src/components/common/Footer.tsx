import { useState, type FormEvent } from 'react';
import { useRouter } from '../../context/RouterContext.tsx';
import './Footer.css';

export function Footer() {
  const { navigate } = useRouter();
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (newsletterEmail.trim()) {
      setSubscribed(true);
      setNewsletterEmail('');
    }
  };

  return (
    <footer className="bb-footer" role="contentinfo">
      {/* Trust Strip */}
      <section className="bb-trust-strip" aria-label="Customer Guarantees">
        <div className="bb-container">
          <div className="bb-trust-grid">
            <div className="bb-trust-item">
              <span className="bb-trust-icon">🛡️</span>
              <div>
                <h4 className="bb-trust-title">100% Verified Sellers</h4>
                <p className="bb-trust-desc">
                  Curated regional sellers and certified Indian master craftsmen.
                </p>
              </div>
            </div>

            <div className="bb-trust-item">
              <span className="bb-trust-icon">⚡</span>
              <div>
                <h4 className="bb-trust-title">Express Delivery</h4>
                <p className="bb-trust-desc">
                  Fast shipping across 26,000+ Indian postal PIN codes.
                </p>
              </div>
            </div>

            <div className="bb-trust-item">
              <span className="bb-trust-icon">🔄</span>
              <div>
                <h4 className="bb-trust-title">Hassle-Free Returns</h4>
                <p className="bb-trust-desc">
                  7-day doorstep replacement or refund on qualified categories.
                </p>
              </div>
            </div>

            <div className="bb-trust-item">
              <span className="bb-trust-icon">🔒</span>
              <div>
                <h4 className="bb-trust-title">Secure Indian Payments</h4>
                <p className="bb-trust-desc">
                  Protected with UPI, NetBanking, Cards & Cash on Delivery.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Footer Links */}
      <div className="bb-footer-main">
        <div className="bb-container">
          <div className="bb-footer-grid">
            {/* Brand column */}
            <div className="bb-footer-brand-col">
              <span className="bb-footer-logo-text">BharatBazaar</span>
              <p className="bb-footer-bio">
                India’s premier multi-vendor storefront connecting discerning buyers with verified
                independent artisans, direct manufacturers, and indigenous brands.
              </p>
              <div>
                <span className="bb-trust-desc">Get weekly marketplace deals & artisan highlights:</span>
                {subscribed ? (
                  <p className="bb-badge bb-badge-success bb-newsletter-success">
                    ✓ Subscribed! Thank you for supporting Indian sellers.
                  </p>
                ) : (
                  <form onSubmit={handleSubscribe} className="bb-newsletter-form">
                    <input
                      type="email"
                      required
                      placeholder="Enter your email"
                      className="bb-newsletter-input"
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      aria-label="Email for newsletter"
                    />
                    <button type="submit" className="bb-btn bb-btn-accent bb-btn-sm">
                      Subscribe
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Shop Column */}
            <div>
              <h4 className="bb-footer-col-title">Popular Categories</h4>
              <ul className="bb-footer-links">
                <li>
                  <a
                    href="/products?category=electronics"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/products?category=electronics');
                    }}
                    className="bb-footer-link"
                  >
                    Audio & Gadgets
                  </a>
                </li>
                <li>
                  <a
                    href="/products?category=fashion"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/products?category=fashion');
                    }}
                    className="bb-footer-link"
                  >
                    Ethnic & Modern Wear
                  </a>
                </li>
                <li>
                  <a
                    href="/products?category=artisans-handloom"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/products?category=artisans-handloom');
                    }}
                    className="bb-footer-link"
                  >
                    Handlooms & Artisans
                  </a>
                </li>
                <li>
                  <a
                    href="/products?category=home-living"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/products?category=home-living');
                    }}
                    className="bb-footer-link"
                  >
                    Home & Bronze Utensils
                  </a>
                </li>
                <li>
                  <a
                    href="/products?category=beauty-wellness"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/products?category=beauty-wellness');
                    }}
                    className="bb-footer-link"
                  >
                    Ayurveda & Skincare
                  </a>
                </li>
              </ul>
            </div>

            {/* Customer Service */}
            <div>
              <h4 className="bb-footer-col-title">Customer Care</h4>
              <ul className="bb-footer-links">
                <li>
                  <a
                    href="/orders"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/orders');
                    }}
                    className="bb-footer-link"
                  >
                    Track Orders
                  </a>
                </li>
                <li>
                  <a
                    href="/addresses"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate('/addresses');
                    }}
                    className="bb-footer-link"
                  >
                    Manage Addresses
                  </a>
                </li>
                <li>
                  <a
                    href="#returns"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Return Policy: 7-day hassle free doorstep returns on eligible items.');
                    }}
                    className="bb-footer-link"
                  >
                    Return & Refund Policy
                  </a>
                </li>
                <li>
                  <a
                    href="#grievance"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Grievance Officer: grievances@bharatbazaar.in | Contact: +91 80 4455 6677');
                    }}
                    className="bb-footer-link"
                  >
                    Grievance Redressal
                  </a>
                </li>
              </ul>
            </div>

            {/* Seller Hub */}
            <div>
              <h4 className="bb-footer-col-title">Seller Hub</h4>
              <ul className="bb-footer-links">
                <li>
                  <a
                    href="#seller-registration"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Seller Registration: Launching for independent sellers next quarter!');
                    }}
                    className="bb-footer-link"
                  >
                    Sell on BharatBazaar
                  </a>
                </li>
                <li>
                  <a
                    href="#seller-guidelines"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Seller Guidelines: All merchants must hold active GSTIN and MSME/Artisan credentials.');
                    }}
                    className="bb-footer-link"
                  >
                    Seller Policy & Standards
                  </a>
                </li>
                <li>
                  <a
                    href="#shipping-hubs"
                    onClick={(e) => {
                      e.preventDefault();
                      alert('Logistics Network: Partnered with BlueDart, DTDC, and Delhivery nationwide.');
                    }}
                    className="bb-footer-link"
                  >
                    Fulfillment Centers
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Bottom */}
      <div className="bb-footer-bottom">
        <div className="bb-container bb-footer-bottom-inner">
          <div>
            © {new Date().getFullYear()} BharatBazaar Internet Private Limited. All rights reserved.
          </div>
          <div className="bb-payment-badges">
            <span className="bb-payment-pill">UPI</span>
            <span className="bb-payment-pill">RuPay</span>
            <span className="bb-payment-pill">Visa / Mastercard</span>
            <span className="bb-payment-pill">NetBanking</span>
            <span className="bb-payment-pill">Cash on Delivery</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
