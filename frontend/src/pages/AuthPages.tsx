import { useState, type FormEvent } from 'react';
import { useRouter } from '../context/RouterContext.tsx';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { authApi } from '../services/authApi.ts';
import { ApiError } from '../services/apiClient.ts';
import './AuthPages.css';

const PASSWORD_REGEX = /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/;
const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

export function AuthPages({ defaultMode = 'login' }: { defaultMode?: 'login' | 'register' }) {
  const { navigate } = useRouter();
  const { user, authMode, setAuthenticatedSession, setDemoAuth, logout } = useMarketplace();

  const [mode, setMode] = useState<'login' | 'register'>(defaultMode);

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPasswordStrong = password.length >= 8 && PASSWORD_REGEX.test(password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!email || !password) {
      setFormError('Please fill in all required fields.');
      return;
    }

    if (mode === 'register') {
      if (!firstName.trim() || !lastName.trim()) {
        setFormError('First name and last name are both required.');
        return;
      }

      if (phone && !INDIAN_PHONE_REGEX.test(phone.trim())) {
        setFormError('Phone number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
        return;
      }

      if (password.length < 8) {
        setFormError('Password must be at least 8 characters long.');
        return;
      }

      if (!PASSWORD_REGEX.test(password)) {
        setFormError('Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character.');
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await authApi.register({
          email: email.trim().toLowerCase(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() || undefined,
          role: 'CUSTOMER',
        });

        // If backend returned a dev verification token (non-production), save to sessionStorage for dev testing
        if (import.meta.env.DEV && response.devVerificationToken) {
          try {
            sessionStorage.setItem('bb_dev_verification_token', response.devVerificationToken);
          } catch {
            // Storage quota fallback
          }
        }

        setFormSuccess(response.message || 'Registration successful! Please verify your email.');
        setTimeout(() => {
          navigate('/verify-email');
        }, 1200);
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.messages.join('. '));
        } else {
          setFormError('Failed to register. Please check your network connection.');
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Login mode
    setIsSubmitting(true);
    try {
      const response = await authApi.login({
        email: email.trim().toLowerCase(),
        password,
      });

      setAuthenticatedSession({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user,
      });

      navigate('/profile');
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.messages.join('. '));
      } else {
        setFormError('Login failed. Please verify your credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFillSampleInputs = () => {
    setEmail('aarav.patel@example.com');
    setPassword('SecurePass123!');
    setFirstName('Aarav');
    setLastName('Patel');
    setPhone('9876543210');
    setFormError('');
  };

  const handleActivateDemoMode = () => {
    setDemoAuth();
    navigate('/profile');
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
              ? 'Sign in with your registered account credentials'
              : 'Join BharatBazaar to shop from authentic Indian merchants'}
          </p>
        </div>

        {/* Current Auth Mode Badge */}
        <div className="bb-auth-demo-badge">
          🛡️ <strong>Authentication Mode:</strong> Currently in{' '}
          <strong>{authMode === 'AUTHENTICATED' ? 'Live Backend Session' : authMode === 'DEMO' ? 'Demo Mode' : 'Anonymous Mode'}</strong>.
          Real sign-ins authenticate against <code>/api/v1/auth</code>.
        </div>

        {/* Tab switch */}
        <div className="bb-auth-tabs">
          <button
            type="button"
            className={`bb-auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login');
              setFormError('');
              setFormSuccess('');
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
              setFormSuccess('');
            }}
          >
            New Registration
          </button>
        </div>

        {formError && (
          <div className="bb-badge bb-badge-danger bb-btn-block bb-auth-error-banner" role="alert">
            ⚠️ {formError}
          </div>
        )}

        {formSuccess && (
          <div className="bb-badge bb-badge-success bb-btn-block bb-auth-error-banner" role="status">
            ✓ {formSuccess}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <>
              <div className="bb-form-grid-2">
                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">First Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Aarav"
                    className="bb-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">Last Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Patel"
                    className="bb-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="bb-form-group">
                <label className="bb-label">Mobile Number (+91)</label>
                <input
                  type="tel"
                  maxLength={10}
                  placeholder="10-digit Indian mobile number (e.g. 9876543210)"
                  className="bb-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="bb-input-hint">Optional. Must start with 6, 7, 8, or 9 if provided.</p>
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
                  onClick={() => alert('Password reset service will be configured with the transactional email gateway.')}
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
            {mode === 'register' && (
              <p className={`bb-input-hint ${isPasswordStrong ? 'valid' : ''}`}>
                {isPasswordStrong
                  ? '✓ Password meets complexity standards'
                  : 'Must be 8+ characters with uppercase, lowercase, and number or special symbol.'}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`bb-btn bb-btn-primary bb-btn-block bb-btn-lg ${isSubmitting ? 'bb-btn-loading' : ''}`}
          >
            {isSubmitting
              ? 'Connecting to Server...'
              : mode === 'login'
                ? 'Sign In'
                : 'Register & Continue to Verification →'}
          </button>
        </form>

        <div className="bb-auth-action-row">
          <button
            type="button"
            className="bb-btn bb-btn-secondary bb-btn-sm bb-btn-block"
            onClick={handleFillSampleInputs}
          >
            Fill Sample Values
          </button>
          <button
            type="button"
            className="bb-btn bb-btn-outline bb-btn-sm bb-btn-block"
            onClick={handleActivateDemoMode}
          >
            Browse in Demo Mode
          </button>
        </div>

        {user && (
          <div className="bb-auth-action-row">
            <button
              type="button"
              className="bb-btn bb-btn-ghost bb-btn-sm bb-btn-block"
              onClick={async () => {
                await logout();
                alert('Session cleared.');
              }}
            >
              Sign Out Active Session
            </button>
          </div>
        )}

        <p className="bb-terms-text">
          By continuing, you agree to BharatBazaar’s Terms of Use and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
