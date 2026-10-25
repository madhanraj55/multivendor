import { useState, type FormEvent } from 'react';
import { useRouter } from '../context/RouterContext.tsx';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import { authApi } from '../services/authApi.ts';
import { ApiError } from '../services/apiClient.ts';
import './EmailVerificationPage.css';

export function EmailVerificationPage() {
  const { navigate } = useRouter();
  const { user } = useMarketplace();

  const [tokenInput, setTokenInput] = useState('');
  const [devToken, setDevToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      try {
        return sessionStorage.getItem('bb_dev_verification_token');
      } catch {
        return null;
      }
    }
    return null;
  });
  const [isVerified, setIsVerified] = useState(user?.emailVerified || false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const token = tokenInput.trim();
    if (!token) {
      setErrorMsg('Please enter your email verification token.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await authApi.verifyEmail({ token });
      setIsVerified(true);
      setSuccessMsg(response.message || 'Email verified successfully. You can now log in.');

      // Clear dev token from storage
      if (import.meta.env.DEV) {
        try {
          sessionStorage.removeItem('bb_dev_verification_token');
          setDevToken(null);
        } catch {
          // Cleanup fallback
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.messages.join('. '));
      } else {
        setErrorMsg('Verification failed. The token may be expired or invalid.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoFillDevToken = () => {
    if (devToken) {
      setTokenInput(devToken);
      setErrorMsg('');
    }
  };

  const displayEmail = user?.email || 'your registered email';

  return (
    <div className="bb-verify-container">
      <div className="bb-verify-card">
        {isVerified ? (
          <div className="bb-verify-success-box">
            <div className="bb-verify-icon">✓</div>
            <h2 className="bb-verify-title">Email Verified!</h2>
            <p className="bb-verify-desc">
              Your email <strong>{displayEmail}</strong> is now verified on BharatBazaar. You can now log in to access your orders, saved addresses, and express checkout.
            </p>
            {successMsg && <p className="bb-input-hint valid">{successMsg}</p>}
            <div className="bb-auth-action-row">
              <button
                type="button"
                className="bb-btn bb-btn-primary bb-btn-block"
                onClick={() => navigate('/login')}
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
              Please enter the secure verification token sent to:
            </p>
            <div>
              <span className="bb-verify-email-chip">{displayEmail}</span>
            </div>

            {/* Development-only Token Helper (Stripped from production) */}
            {import.meta.env.DEV && devToken && (
              <div className="bb-verify-dev-card" role="region" aria-label="Development verification helper">
                <strong>🛠️ Development Environment Helper</strong>
                <p>The backend generated a verification token for this session:</p>
                <code className="bb-verify-dev-token-code">{devToken}</code>
                <button
                  type="button"
                  className="bb-btn bb-btn-secondary bb-btn-sm"
                  onClick={handleAutoFillDevToken}
                >
                  Auto-fill Token
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="bb-badge bb-badge-danger bb-btn-block bb-auth-error-banner" role="alert">
                ⚠️ {errorMsg}
              </div>
            )}

            <form onSubmit={handleVerify}>
              <div className="bb-verify-token-field">
                <label className="bb-label bb-label-required">Verification Token</label>
                <input
                  type="text"
                  required
                  placeholder="Paste your 64-character verification token"
                  className="bb-verify-token-input"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
                <p className="bb-input-hint">
                  Tokens are valid for 24 hours from registration.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`bb-btn bb-btn-primary bb-btn-block bb-btn-lg ${isSubmitting ? 'bb-btn-loading' : ''}`}
              >
                {isSubmitting ? 'Verifying...' : 'Verify & Activate Account'}
              </button>
            </form>

            <div className="bb-auth-action-row">
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
