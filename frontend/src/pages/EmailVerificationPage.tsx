import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { useRouter } from '../context/RouterContext.tsx';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { authApi } from '../services/authApi.ts';
import { ApiError, sessionManager } from '../services/apiClient.ts';
import './EmailVerificationPage.css';

export function EmailVerificationPage() {
  const { navigate, queryParams } = useRouter();
  const { user, setUser } = useMarketplace();

  const redirectTarget = queryParams.redirect || (() => {
    try {
      return sessionStorage.getItem('bb_auth_redirect') || '';
    } catch {
      return '';
    }
  })();

  // Retrieve email from sessionStorage, context, or query params
  const [emailInput, setEmailInput] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('bb_verify_email');
        if (stored) return stored;
      } catch {
        // storage fallback
      }
      const params = new URLSearchParams(window.location.search);
      const urlEmail = params.get('email');
      if (urlEmail) return urlEmail;
    }
    return user?.email || '';
  });

  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedEmail, setEditedEmail] = useState(emailInput);

  // 6-digit OTP code state
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(60);
  const [expirySeconds, setExpirySeconds] = useState(300); // 5 minutes

  const [devOtp, setDevOtp] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      try {
        return sessionStorage.getItem('bb_dev_otp');
      } catch {
        return null;
      }
    }
    return null;
  });

  const [isVerified, setIsVerified] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // 5-minute expiry countdown timer
  useEffect(() => {
    if (expirySeconds <= 0) return;
    const timer = setInterval(() => {
      setExpirySeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [expirySeconds]);

  const activeEmail = emailInput.trim().toLowerCase();

  const handleOtpChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setOtp(val);
    setErrorMsg('');
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!activeEmail) {
      setErrorMsg('Please enter your registered email address.');
      setIsEditingEmail(true);
      return;
    }

    const trimmedOtp = otp.trim();
    if (!trimmedOtp || trimmedOtp.length !== 6) {
      setErrorMsg('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authApi.verifyOtp({
        email: activeEmail,
        otp: trimmedOtp,
      });

      setIsVerified(true);
      setSuccessMsg(response.message || 'Email verified successfully. You can now log in.');

      if (user) {
        setUser({ ...user, emailVerified: true });
      }
      const currentSession = sessionManager.getSession();
      if (currentSession?.user) {
        sessionManager.setSession({
          ...currentSession,
          user: {
            ...currentSession.user,
            isEmailVerified: true,
          },
        });
      }

      // Clear dev OTP and storage
      if (import.meta.env.DEV) {
        try {
          sessionStorage.removeItem('bb_dev_otp');
          sessionStorage.removeItem('bb_dev_verification_token');
          sessionStorage.removeItem('bb_verify_email');
          setDevOtp(null);
        } catch {
          // Cleanup fallback
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.messages.join('. '));
      } else {
        setErrorMsg('Verification failed. The code may be expired, invalid, or locked.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setErrorMsg('');
    setSuccessMsg('');

    if (!activeEmail) {
      setErrorMsg('Please specify an email address to resend the code.');
      setIsEditingEmail(true);
      return;
    }

    setIsResending(true);
    try {
      const response = await authApi.resendOtp({ email: activeEmail });
      setSuccessMsg(response.message || 'A fresh verification code has been sent to your email.');
      setCooldown(response.cooldownSeconds || 60);
      setExpirySeconds(300); // Reset 5-minute expiry
      setOtp('');

      if (import.meta.env.DEV && response.devOtp) {
        setDevOtp(response.devOtp);
        try {
          sessionStorage.setItem('bb_dev_otp', response.devOtp);
        } catch {
          // fallback
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.messages.join('. '));
      } else {
        setErrorMsg('Failed to resend verification code. Please check your connection.');
      }
    } finally {
      setIsResending(false);
    }
  };

  const handleSaveEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!editedEmail.trim() || !editedEmail.includes('@')) {
      setErrorMsg('Please provide a valid email address.');
      return;
    }
    setEmailInput(editedEmail.trim());
    setIsEditingEmail(false);
    setErrorMsg('');
    try {
      sessionStorage.setItem('bb_verify_email', editedEmail.trim());
    } catch {
      // fallback
    }
  };

  const handleAutoFillDevOtp = () => {
    if (devOtp) {
      setOtp(devOtp);
      setErrorMsg('');
    }
  };

  const formatExpiryTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="bb-verify-container">
      <div className="bb-verify-card">
        {isVerified ? (
          <div className="bb-verify-success-box" role="region" aria-label="Verification success">
            <div className="bb-verify-icon">✓</div>
            <h2 className="bb-verify-title">Email Verified!</h2>
            <p className="bb-verify-desc">
              Your email <strong>{activeEmail}</strong> is now verified on BharatBazaar. You can now log in to access your orders, seller workspace, saved addresses, and express checkout.
            </p>
            {successMsg && <p className="bb-input-hint valid">{successMsg}</p>}
            <div className="bb-auth-action-row" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="bb-btn bb-btn-primary bb-btn-block bb-btn-lg"
                onClick={() => {
                  const target = redirectTarget ? `/login?redirect=${encodeURIComponent(redirectTarget)}` : '/login';
                  navigate(target);
                }}
              >
                Sign In to Account
              </button>
              <button
                type="button"
                className="bb-btn bb-btn-outline bb-btn-block"
                onClick={() => navigate('/')}
              >
                Return to Storefront
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bb-verify-icon">✉️</div>
            <h1 className="bb-verify-title">Verify Your Email</h1>
            <p className="bb-verify-desc">
              We sent a 6-digit verification code to:
            </p>

            {isEditingEmail ? (
              <form onSubmit={handleSaveEmail} style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  <input
                    type="email"
                    required
                    value={editedEmail}
                    onChange={(e) => setEditedEmail(e.target.value)}
                    className="bb-input"
                    placeholder="Enter your registered email"
                    style={{ maxWidth: '280px', fontSize: '0.9rem' }}
                  />
                  <button type="submit" className="bb-btn bb-btn-secondary bb-btn-sm">
                    Save
                  </button>
                  <button
                    type="button"
                    className="bb-btn bb-btn-outline bb-btn-sm"
                    onClick={() => {
                      setEditedEmail(emailInput);
                      setIsEditingEmail(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ marginBottom: '1rem' }}>
                <span className="bb-verify-email-chip">{activeEmail || 'No email specified'}</span>
                <button
                  type="button"
                  className="bb-auth-forgot-link"
                  style={{ marginLeft: '0.5rem', fontSize: '0.8rem', verticalAlign: 'middle' }}
                  onClick={() => {
                    setEditedEmail(emailInput);
                    setIsEditingEmail(true);
                  }}
                >
                  Edit
                </button>
              </div>
            )}

            {/* Development-only OTP Helper */}
            {import.meta.env.DEV && devOtp && (
              <div className="bb-verify-dev-card" role="region" aria-label="Development verification helper">
                <strong>🛠️ Development Environment Helper</strong>
                <p style={{ margin: '4px 0' }}>The server generated a test OTP for this session:</p>
                <code className="bb-verify-dev-token-code" style={{ fontSize: '1.2rem', letterSpacing: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                  {devOtp}
                </code>
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary bb-btn-sm"
                  onClick={handleAutoFillDevOtp}
                  style={{ marginTop: '4px' }}
                >
                  Auto-fill 6-Digit Code
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="bb-badge bb-badge-danger bb-btn-block bb-auth-error-banner" role="alert" style={{ marginBottom: '1rem', padding: '0.6rem 0.8rem', textAlign: 'left', borderRadius: '6px' }}>
                ⚠️ {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="bb-badge bb-badge-success bb-btn-block bb-auth-error-banner" role="status" style={{ marginBottom: '1rem', padding: '0.6rem 0.8rem', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
                ✓ {successMsg}
              </div>
            )}

            <form onSubmit={handleVerify}>
              <div className="bb-form-group" style={{ margin: '1.5rem 0' }}>
                <label className="bb-label bb-label-required" style={{ textAlign: 'center', display: 'block', marginBottom: '0.75rem' }}>
                  Enter 6-Digit Verification Code
                </label>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    required
                    placeholder="• • • • • •"
                    value={otp}
                    onChange={handleOtpChange}
                    className="bb-input"
                    style={{
                      maxWidth: '220px',
                      height: '56px',
                      fontSize: '1.75rem',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      letterSpacing: '8px',
                      textAlign: 'center',
                      borderColor: otp.length === 6 ? '#f97316' : undefined,
                    }}
                    autoFocus
                  />
                </div>

                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                  {expirySeconds > 0 ? (
                    <span style={{ color: expirySeconds < 60 ? '#dc2626' : '#64748b' }}>
                      ⏱️ Code expires in <strong>{formatExpiryTime(expirySeconds)}</strong>
                    </span>
                  ) : (
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>
                      ⚠️ Code has expired. Please request a new code below.
                    </span>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || otp.length !== 6}
                className={`bb-btn bb-btn-primary bb-btn-block bb-btn-lg ${isSubmitting ? 'bb-btn-loading' : ''}`}
              >
                {isSubmitting ? 'Verifying Code...' : 'Verify & Activate Account'}
              </button>
            </form>

            <div className="bb-verify-resend-row" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                Didn't receive the email?
              </span>
              <button
                type="button"
                className="bb-verify-resend-btn"
                disabled={cooldown > 0 || isResending}
                onClick={handleResend}
                style={{ fontSize: '0.85rem' }}
              >
                {isResending
                  ? 'Sending...'
                  : cooldown > 0
                  ? `Resend Code in ${cooldown}s`
                  : 'Resend Code'}
              </button>
            </div>

            <div className="bb-auth-action-row" style={{ marginTop: '1.25rem' }}>
              <button
                type="button"
                className="bb-btn bb-btn-outline bb-btn-sm bb-btn-block"
                onClick={() => navigate('/login')}
              >
                Back to Sign In
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
