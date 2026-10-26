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
  const { setAuthenticatedSession } = useMarketplace();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(defaultMode);
  const [selectedRole, setSelectedRole] = useState<'CUSTOMER' | 'SELLER'>('CUSTOMER');

  // Form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPasswordStrong = (mode === 'reset' ? newPassword : password).length >= 8 &&
    PASSWORD_REGEX.test(mode === 'reset' ? newPassword : password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    // 1. FORGOT PASSWORD MODE
    if (mode === 'forgot') {
      if (!email.trim()) {
        setFormError('Please enter your email address.');
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await authApi.forgotPassword({ email: email.trim().toLowerCase() });
        setFormSuccess(response.message || 'If an account exists, a reset link has been generated.');
        if (response.devResetToken) {
          setResetToken(response.devResetToken);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.messages.join('. '));
        } else {
          setFormError('Failed to process password reset request. Please check your connection.');
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // 2. RESET PASSWORD MODE
    if (mode === 'reset') {
      if (!resetToken.trim() || !newPassword) {
        setFormError('Please enter both the reset token and your new password.');
        return;
      }

      if (newPassword.length < 8) {
        setFormError('New password must be at least 8 characters long.');
        return;
      }

      if (!PASSWORD_REGEX.test(newPassword)) {
        setFormError(
          'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character.'
        );
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await authApi.resetPassword({
          token: resetToken.trim(),
          newPassword,
        });
        setFormSuccess(response.message || 'Password reset successfully! Redirecting to login...');
        setTimeout(() => {
          setMode('login');
          setPassword('');
          setFormSuccess('Password reset successfully! Please sign in with your new password.');
        }, 1500);
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.messages.join('. '));
        } else {
          setFormError('Invalid or expired password reset token.');
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // 3. COMMON VALIDATION FOR LOGIN & REGISTER
    if (!email || !password) {
      setFormError('Please fill in all required fields.');
      return;
    }

    // 4. REGISTER MODE
    if (mode === 'register') {
      if (!firstName.trim() || !lastName.trim()) {
        setFormError('First name and last name are both required.');
        return;
      }

      if (!phone.trim()) {
        setFormError('Mobile number is required.');
        return;
      }

      if (!INDIAN_PHONE_REGEX.test(phone.trim())) {
        setFormError(
          'Phone number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
        );
        return;
      }

      if (password.length < 8) {
        setFormError('Password must be at least 8 characters long.');
        return;
      }

      if (!PASSWORD_REGEX.test(password)) {
        setFormError(
          'Password must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number or special character.'
        );
        return;
      }

      setIsSubmitting(true);
      try {
        const response = await authApi.register({
          email: email.trim().toLowerCase(),
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          role: selectedRole,
        });

        // Store registered email and dev OTP for seamless verification entry
        try {
          sessionStorage.setItem('bb_verify_email', email.trim().toLowerCase());
          if (import.meta.env.DEV && response.devOtp) {
            sessionStorage.setItem('bb_dev_otp', response.devOtp);
          }
          if (import.meta.env.DEV && response.devVerificationToken) {
            sessionStorage.setItem('bb_dev_verification_token', response.devVerificationToken);
          }
        } catch {
          // quota fallback
        }

        setFormSuccess(
          response.message ||
            (selectedRole === 'SELLER'
              ? 'Vendor account registered! Please check email to verify.'
              : 'Customer account registered! Please check email to verify.')
        );
        setTimeout(() => {
          navigate('/verify-email');
        }, 1200);
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(err.messages.join('. '));
        } else {
          setFormError('Failed to register account. Please check your connection to the server.');
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // 5. LOGIN MODE
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

      // Role-based destination
      if (response.user.role === 'SELLER') {
        navigate('/seller/dashboard');
      } else if (response.user.role === 'ADMIN') {
        navigate('/admin/orders');
      } else {
        navigate('/profile');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.messages.join('. '));
      } else {
        setFormError('Invalid email or password. Please verify your credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bb-auth-container">
      <div className="bb-auth-card">
        {/* Header */}
        <div className="bb-auth-header">
          <h1 className="bb-auth-title">
            {mode === 'login'
              ? 'Sign In'
              : mode === 'register'
              ? 'Create an Account'
              : mode === 'forgot'
              ? 'Forgot Password'
              : 'Set New Password'}
          </h1>
          <p className="bb-auth-subtitle">
            {mode === 'login'
              ? 'Access your Customer orders or Vendor Management Dashboard'
              : mode === 'register'
              ? 'Join BharatBazaar as an authentic Shopper or verified Vendor'
              : mode === 'forgot'
              ? 'Enter your registered email address to receive password reset instructions'
              : 'Enter the verification token and choose a new secure password'}
          </p>
        </div>

        {/* Tab switch (only visible for login / register) */}
        {(mode === 'login' || mode === 'register') && (
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
              Create Account
            </button>
          </div>
        )}

        {/* Status Alerts */}
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
          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <>
              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Registered Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  className="bb-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {resetToken && (
                <div
                  style={{
                    padding: '0.75rem',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                  }}
                >
                  <p style={{ fontSize: '0.8125rem', color: '#166534', margin: '0 0 0.5rem 0' }}>
                    <strong>Dev Reset Token Available:</strong>
                  </p>
                  <code
                    style={{
                      display: 'block',
                      wordBreak: 'break-all',
                      fontSize: '0.75rem',
                      background: '#fff',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                    }}
                  >
                    {resetToken}
                  </code>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className={`bb-btn bb-btn-primary bb-btn-block bb-btn-lg ${isSubmitting ? 'bb-btn-loading' : ''}`}
                style={{ marginTop: '0.5rem' }}
              >
                {isSubmitting ? 'Sending Instructions...' : 'Send Password Reset Link'}
              </button>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '1.25rem',
                  fontSize: '0.875rem',
                }}
              >
                <button
                  type="button"
                  className="bb-auth-forgot-link"
                  onClick={() => {
                    setMode('login');
                    setFormError('');
                    setFormSuccess('');
                  }}
                >
                  ← Back to Sign In
                </button>
                <button
                  type="button"
                  className="bb-auth-forgot-link"
                  onClick={() => {
                    setMode('reset');
                    setFormError('');
                    setFormSuccess('');
                  }}
                >
                  Have a Token? Reset Here →
                </button>
              </div>
            </>
          )}

          {/* RESET PASSWORD FORM */}
          {mode === 'reset' && (
            <>
              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Reset Token</label>
                <input
                  type="text"
                  required
                  placeholder="Enter 64-character reset token"
                  className="bb-input"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                />
              </div>

              <div className="bb-form-group">
                <label className="bb-label bb-label-required">New Password</label>
                <div className="bb-password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter new strong password"
                    className="bb-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
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
                <p className={`bb-input-hint ${isPasswordStrong ? 'valid' : ''}`}>
                  {isPasswordStrong
                    ? '✓ Password meets complexity standards'
                    : 'Must be 8+ characters with uppercase, lowercase, and number or special symbol.'}
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`bb-btn bb-btn-primary bb-btn-block bb-btn-lg ${isSubmitting ? 'bb-btn-loading' : ''}`}
                style={{ marginTop: '0.5rem' }}
              >
                {isSubmitting ? 'Updating Password...' : 'Save New Password & Sign In'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  className="bb-auth-forgot-link"
                  onClick={() => {
                    setMode('login');
                    setFormError('');
                    setFormSuccess('');
                  }}
                >
                  ← Back to Sign In
                </button>
              </div>
            </>
          )}

          {/* REGISTER EXTRA FIELDS */}
          {mode === 'register' && (
            <>
              {/* Account Type Selection (Customer vs Seller) */}
              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Register Account As</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className={`bb-btn bb-btn-sm ${selectedRole === 'CUSTOMER' ? 'bb-btn-primary' : 'bb-btn-outline'}`}
                    onClick={() => setSelectedRole('CUSTOMER')}
                  >
                    🛍️ Customer
                  </button>
                  <button
                    type="button"
                    className={`bb-btn bb-btn-sm ${selectedRole === 'SELLER' ? 'bb-btn-primary' : 'bb-btn-outline'}`}
                    onClick={() => setSelectedRole('SELLER')}
                  >
                    🏬 Vendor / Seller
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="bb-form-group">
                  <label className="bb-label bb-label-required">First Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh"
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
                    placeholder="e.g. Kumar"
                    className="bb-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div className="bb-form-group">
                <label className="bb-label bb-label-required">Mobile Number (+91)</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  placeholder="10-digit Indian mobile number (e.g. 9876543210)"
                  className="bb-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                />
                <p className="bb-input-hint">Required. Must be 10 digits starting with 6, 7, 8, or 9.</p>
              </div>
            </>
          )}

          {/* LOGIN & REGISTER SHARED FIELDS */}
          {(mode === 'login' || mode === 'register') && (
            <>
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
                      onClick={() => {
                        setMode('forgot');
                        setFormError('');
                        setFormSuccess('');
                      }}
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
                style={{ marginTop: '1.25rem' }}
              >
                {isSubmitting
                  ? 'Connecting to Server...'
                  : mode === 'login'
                  ? 'Sign In to Account'
                  : selectedRole === 'SELLER'
                  ? 'Register as Vendor →'
                  : 'Register as Customer →'}
              </button>
            </>
          )}
        </form>

        <p className="bb-terms-text" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          By continuing, you agree to BharatBazaar’s Terms of Use and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
