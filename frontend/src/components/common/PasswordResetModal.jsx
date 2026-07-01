import { useState } from "react";
import { buildJsonPostOptions, extractApiError } from "../../lib/appUtils";
import './PasswordResetModal.css';

function PasswordResetModal({ isOpen, onClose, userType = "student" }) {
  const [step, setStep] = useState("request");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleReset = () => {
    setStep("request");
    setEmail("");
    setPhone("");
    setFacultyId("");
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

    if (userType === "student") {
      if (!email.trim() || !phone.trim()) {
        setError("Please enter both your email address and phone number");
        return;
      }
    } else {
      if (!facultyId.trim() || !email.trim()) {
        setError("Please enter both your Faculty ID and email address");
        return;
      }
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const body =
        userType === "student"
          ? { user_type: "student", email: email.trim(), phone: phone.trim() }
          : { user_type: "staff", faculty_id: facultyId.trim(), email: email.trim() };

      const response = await fetch("/api/auth/password-reset/", {
        ...buildJsonPostOptions(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(data, "Password reset request failed"));
      }

      setResetToken(data.reset_token);
      setMessage(data.message || "Identity verified. Set your new password below.");
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
      setError("Password must be at least 8 characters");
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
        ...buildJsonPostOptions({ reset_token: resetToken, new_password: newPassword }),
        method: "PUT",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(data, "Password reset failed"));
      }

      setMessage("Password reset successfully! You can now log in with your new password.");
      setTimeout(() => {
        handleClose();
      }, 2500);
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
                <h3>Verify Your Identity</h3>
                {userType === "student" ? (
                  <p>Enter the email address and phone number linked to your account.</p>
                ) : (
                  <p>Enter your Faculty ID and the email address linked to your account.</p>
                )}
              </div>

              {userType === "staff" && (
                <div className="form-field">
                  <label htmlFor="faculty-id">Faculty ID</label>
                  <input
                    id="faculty-id"
                    type="text"
                    value={facultyId}
                    onChange={(e) => setFacultyId(e.target.value)}
                    placeholder="Enter your Faculty ID"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              )}

              <div className="form-field">
                <label htmlFor="reset-email">Email Address</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  disabled={loading}
                  autoFocus={userType === "student"}
                />
              </div>

              {userType === "student" && (
                <div className="form-field">
                  <label htmlFor="reset-phone">Phone Number</label>
                  <input
                    id="reset-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter your 10-digit phone number"
                    disabled={loading}
                  />
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? "Verifying..." : "Verify & Continue"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCompleteReset}>
              <div className="form-section">
                <h3>Set New Password</h3>
                <p>Enter and confirm your new password.</p>
              </div>

              <div className="form-field">
                <label htmlFor="new-password">New Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
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
                  placeholder="Re-enter new password"
                  disabled={loading}
                />
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => { setStep("request"); setError(""); setMessage(""); }}
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
