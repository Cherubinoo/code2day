import { useState } from "react";
import { buildJsonPostOptions, extractApiError } from "../../lib/appUtils";
import './PasswordResetModal.css';

/**
 * PasswordResetModal
 * ==================
 * Modal component for password reset functionality.
 * Supports both students and staff password reset.
 */
function PasswordResetModal({ isOpen, onClose, userType = "student" }) {
  const [step, setStep] = useState("request"); // "request" | "complete"
  const [identifier, setIdentifier] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleReset = () => {
    setStep("request");
    setIdentifier("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setMessage("");
    setLoading(false);
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    
    if (!identifier.trim()) {
      setError(`Please enter your ${userType === "staff" ? "Faculty ID" : "Register Number"}`);
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/password-reset/", {
        ...buildJsonPostOptions({
          identifier: identifier.trim(),
          user_type: userType
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(data, "Password reset request failed"));
      }

      setResetToken(data.reset_token);
      setMessage(data.message);
      setStep("complete");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async (e) => {
    e.preventDefault();
    
    if (!newPassword.trim()) {
      setError("Please enter a new password");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/password-reset/", {
        ...buildJsonPostOptions({
          reset_token: resetToken,
          new_password: newPassword
        }),
        method: "PUT",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(data, "Password reset failed"));
      }

      setMessage("Password reset successfully! You can now login with your new password.");
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Reset Password</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body">
          {step === "request" ? (
            <form onSubmit={handleRequestReset}>
              <div className="form-section">
                <h3>Request Password Reset</h3>
                <p>Enter your {userType === "staff" ? "Faculty ID" : "Register Number"} to request a password reset.</p>
              </div>

              <div className="form-field">
                <label htmlFor="identifier">
                  {userType === "staff" ? "Faculty ID" : "Register Number"}
                </label>
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={userType === "staff" ? "Enter your Faculty ID" : "Enter your Register Number"}
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? "Requesting..." : "Request Reset"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCompleteReset}>
              <div className="form-section">
                <h3>Complete Password Reset</h3>
                <p>Enter your new password to complete the reset process.</p>
                {resetToken && (
                  <div className="reset-token-info">
                    <p><strong>Reset Token:</strong> {resetToken}</p>
                    <p className="token-note">
                      💡 Save this token and contact your administrator if needed.
                    </p>
                  </div>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="new-password">New Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 8 characters)"
                  disabled={loading}
                  autoFocus
                />
              </div>

              <div className="form-field">
                <label htmlFor="confirm-password">Confirm Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  disabled={loading}
                />
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="secondary-button" 
                  onClick={() => setStep("request")}
                  disabled={loading}
                >
                  ← Back
                </button>
                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          )}

          {message && (
            <div className="message success-message">
              ✅ {message}
            </div>
          )}

          {error && (
            <div className="message error-message">
              ⚠️ {error}
            </div>
          )}
        </div>


      </div>
    </div>
  );
}

export default PasswordResetModal;