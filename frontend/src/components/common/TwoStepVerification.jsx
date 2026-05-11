import { useState, useEffect, useRef } from "react";
import { buildJsonPostOptions, extractApiError } from "../../lib/appUtils";
import './TwoStepVerification.css';

/**
 * TwoStepVerification
 * ===================
 * Component for 2-step verification during login process.
 * Generates and validates verification codes.
 */
function TwoStepVerification({ 
  user, 
  userType, 
  onVerificationSuccess, 
  onBack,
  onCancel 
}) {
  const [verificationCode, setVerificationCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  const inputRef = useRef(null);

  // Generate verification code on component mount
  useEffect(() => {
    generateVerificationCode();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [timeLeft]);

  // Auto-focus input
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const generateVerificationCode = async () => {
    try {
      setLoading(true);
      setError("");
      
      // Generate a 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      setGeneratedCode(code);
      
      // In a real implementation, this would send the code via SMS/Email
      // For now, we'll just display it to the user
      setMessage(`Your verification code is: ${code}`);
      setTimeLeft(300); // Reset timer
      setCanResend(false);
    } catch (err) {
      setError("Failed to generate verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    
    if (!verificationCode.trim()) {
      setError("Please enter the verification code");
      return;
    }

    if (verificationCode.length !== 6) {
      setError("Verification code must be 6 digits");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Simulate verification delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (verificationCode === generatedCode) {
        setMessage("Verification successful! Logging you in...");
        setTimeout(() => {
          onVerificationSuccess();
        }, 1000);
      } else {
        throw new Error("Invalid verification code. Please try again.");
      }
    } catch (err) {
      setError(err.message);
      setVerificationCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = () => {
    if (canResend) {
      generateVerificationCode();
      setVerificationCode("");
      setError("");
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCodeInput = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setVerificationCode(value);
    setError("");
  };

  return (
    <div className="two-step-verification">
      <div className="verification-header">
        <div className="verification-icon">🔐</div>
        <h2>Two-Step Verification</h2>
        <p className="user-info">
          {user?.name || user?.register_number || user?.faculty_id}
        </p>
        <p className="verification-subtitle">
          Enter the 6-digit verification code to complete your login
        </p>
      </div>

      <form onSubmit={handleVerifyCode} className="verification-form">
        <div className="code-section">
          <label htmlFor="verification-code">Verification Code</label>
          <input
            id="verification-code"
            ref={inputRef}
            type="text"
            value={verificationCode}
            onChange={handleCodeInput}
            placeholder="000000"
            maxLength={6}
            className="code-input"
            disabled={loading}
          />
          <div className="code-helper">
            {verificationCode.length > 0 && (
              <span className="code-length">{verificationCode.length}/6</span>
            )}
          </div>
        </div>

        {message && (
          <div className="verification-message">
            <div className="code-display">
              📱 {message}
            </div>
            <p className="code-note">
              In a production environment, this code would be sent to your registered mobile number or email.
            </p>
          </div>
        )}

        <div className="timer-section">
          {timeLeft > 0 ? (
            <p className="timer">
              ⏱️ Code expires in {formatTime(timeLeft)}
            </p>
          ) : (
            <p className="timer expired">
              ⏰ Code has expired
            </p>
          )}
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onBack}
            disabled={loading}
          >
            ← Back to Login
          </button>
          
          <button
            type="submit"
            className="primary-button"
            disabled={loading || verificationCode.length !== 6}
          >
            {loading ? "Verifying..." : "Verify & Login"}
          </button>
        </div>

        <div className="resend-section">
          <button
            type="button"
            className={`resend-button ${canResend ? 'active' : 'disabled'}`}
            onClick={handleResendCode}
            disabled={!canResend || loading}
          >
            {canResend ? "Resend Code" : `Resend in ${formatTime(timeLeft)}`}
          </button>
        </div>
      </form>

      {error && (
        <div className="error-message">
          ⚠️ {error}
        </div>
      )}

      <div className="security-note">
        <p>
          🛡️ <strong>Security Notice:</strong> This additional verification step helps protect your account from unauthorized access.
        </p>
      </div>


    </div>
  );
}

export default TwoStepVerification;