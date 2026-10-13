import { useState, useRef, type ChangeEvent, type KeyboardEvent, type FormEvent } from 'react';
import { useRouter } from '../context/RouterContext.tsx';
import { useMarketplace } from '../context/MarketplaceContext.tsx';
import './EmailVerificationPage.css';

export function EmailVerificationPage() {
  const { navigate } = useRouter();
  const { user, updateUserProfile } = useMarketplace();

  const [otp, setOtp] = useState(['5', '6', '0', '', '', '']);
  const [isVerified, setIsVerified] = useState(user?.emailVerified || false);
  const [errorMsg, setErrorMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleOtpChange = (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    const newOtp = [...otp];
    newOtp[index] = val.slice(-1);
    setOtp(newOtp);
    setErrorMsg('');

    // Focus next box if filled
    if (val && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < 6) {
      setErrorMsg('Please enter all 6 digits of your verification code.');
      return;
    }

    // Demo verification success
    setIsVerified(true);
    updateUserProfile({ emailVerified: true });
  };

  const handleResend = () => {
    setOtp(['', '', '', '', '', '']);
    setResendCooldown(30);
    setErrorMsg('');
    inputRefs.current[0]?.focus();

    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleFillDemoCode = () => {
    setOtp(['5', '6', '0', '0', '3', '8']);
    setErrorMsg('');
  };

  const displayEmail = user?.email || 'ananya.sharma@example.in';

  return (
    <div className="bb-verify-container">
      <div className="bb-verify-card">
        {isVerified ? (
          <div className="bb-verify-success-box">
            <div className="bb-verify-icon">✓</div>
            <h2 className="bb-verify-title">Email Verified!</h2>
            <p className="bb-verify-desc">
              Your email <strong>{displayEmail}</strong> is now verified. You have full access to marketplace features, order tracking, and express checkout.
            </p>
            <div className="bb-auth-action-row">
              <button
                type="button"
                className="bb-btn bb-btn-primary bb-btn-block"
                onClick={() => navigate('/profile')}
              >
                Go to Profile
              </button>
              <button
                type="button"
                className="bb-btn bb-btn-outline bb-btn-block"
                onClick={() => navigate('/')}
              >
                Start Shopping
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="bb-verify-icon">✉️</div>
            <h1 className="bb-verify-title">Verify Your Email</h1>
            <p className="bb-verify-desc">
              We sent a 6-digit confirmation code to:
            </p>
            <div>
              <span className="bb-verify-email-chip">{displayEmail}</span>
            </div>

            <div className="bb-verify-demo-note">
              ℹ️ <strong>Demo Simulation:</strong> Enter any 6 digits (or use the demo button below) to preview successful email verification.
            </div>

            {errorMsg && (
              <div className="bb-badge bb-badge-danger bb-btn-block bb-auth-error-banner">
                ⚠️ {errorMsg}
              </div>
            )}

            <form onSubmit={handleVerify}>
              <div className="bb-otp-group">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    className="bb-otp-input"
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              <div className="bb-verify-resend-row">
                <span>Didn't receive the code?</span>
                <button
                  type="button"
                  className="bb-verify-resend-btn"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
                </button>
              </div>

              <button
                type="submit"
                className="bb-btn bb-btn-primary bb-btn-block bb-btn-lg"
              >
                Verify & Activate Account
              </button>
            </form>

            <div className="bb-auth-action-row">
              <button
                type="button"
                className="bb-btn bb-btn-secondary bb-btn-sm bb-btn-block"
                onClick={handleFillDemoCode}
              >
                Auto-Fill Demo Code (560038)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
