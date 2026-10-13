import { useState, type FormEvent } from 'react';
import { useRouter } from '../context/RouterContext.tsx';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { DEMO_USER } from '../data/demoData.ts';
import './AuthPages.css';

export function AuthPages({ defaultMode = 'login' }: { defaultMode?: 'login' | 'register' }) {
  const { navigate } = useRouter();
  const { user, setUser } = useMarketplace();

  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!email || !password) {
      setFormError('Please fill in all required fields.');
      return;
    }

    if (mode === 'register') {
      if (!fullName || !phone) {
        setFormError('Please enter your full name and Indian mobile number.');
        return;
      }
      if (!/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
        setFormError('Please enter a valid 10-digit Indian phone number.');
        return;
      }
      // Demo registration success, navigate to verify-email
      navigate('/verify-email');
      return;
    }

    // Demo login
    setUser({
      ...DEMO_USER,
      email: email || DEMO_USER.email,
    });
    navigate('/profile');
  };

  const handleDemoFill = () => {
    setEmail('ananya.sharma@example.in');
    setPassword('SecurePass123!');
    setFullName('Ananya Sharma');
    setPhone('9876543210');
  };

  return (
    <div className="bb-auth-container">
      <div className="bb-auth-card">
        {/* Header */}
        <div className="bb-auth-header">
          <h1 className="bb-auth-title">
            {mode === 'login' ? 'Welcome Back' : 'Create Customer Account'}
          </h1>
          <p className="bb-auth-subtitle">
            {mode === 'login'
              ? 'Sign in to access your orders, wishlist, and saved addresses'
              : 'Join BharatBazaar to shop from authentic Indian merchants'}
          </p>
        </div>

        {/* Demo Notice */}
        <div className="bb-auth-demo-badge">
          ℹ️ <strong>Demo Prototype:</strong> Real authentication will connect to the NestJS Auth API in the next phase. Click "Auto-Fill Demo Credentials" to preview without typing.
        </div>

        {/* Tab switch */}
        <div className="bb-auth-tabs">
          <button
            type="button"
            className={`bb-auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setFormError('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`bb-auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setMode('register');
              setFormError('');
            }}
          >
            New Registration
          </button>
        </div>

        {formError && (
          <div className="bb-badge bb-badge-danger bb-btn-block bb-auth-error-banner">
            ⚠️ {formError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ananya Sharma"
                  className="bb-input"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Mobile Number (+91)</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="10-digit mobile number"
                  className="bb-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="bb-form-group">
            <label className="bb-label bb-label-required">Email Address</label>
            <input
              type="email"
              required
              placeholder="you@example.com"
              className="bb-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="bb-form-group">
            <div className="bb-label">
              <span className="bb-label-required">Password</span>
              {mode === 'login' && (
                <button
                  type="button"
                  className="bb-auth-forgot-link"
                  onClick={() => alert('Demo password reset link simulated to your email.')}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="bb-password-input-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter password"
                className="bb-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="bb-password-toggle-btn"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button type="submit" className="bb-btn bb-btn-primary bb-btn-block bb-btn-lg">
            {mode === 'login' ? 'Sign In' : 'Continue to Email Verification →'}
          </button>
        </form>

        <div className="bb-auth-action-row">
          <button
            type="button"
            className="bb-btn bb-btn-secondary bb-btn-sm bb-btn-block"
            onClick={handleDemoFill}
          >
            Auto-Fill Demo Credentials
          </button>
          {user && (
            <button
              type="button"
              className="bb-btn bb-btn-ghost bb-btn-sm"
              onClick={() => {
                setUser(null);
                alert('Signed out of demo session');
              }}
            >
              Sign Out
            </button>
          )}
        </div>

        <p className="bb-terms-text">
          By continuing, you agree to BharatBazaar’s Terms of Use and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
