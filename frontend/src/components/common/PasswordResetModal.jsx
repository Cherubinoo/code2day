import { useState } from "react";
import { buildJsonPostOptions, extractApiError } from "../../lib/appUtils";
import './PasswordResetModal.css';

function PasswordResetModal({ isOpen, onClose, userType = "student" }) {
  const [step, setStep] = useState("request");
  const [registerNumber, setRegisterNumber] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleReset = () => {
    setStep("request");
    setRegisterNumber("");
    setFacultyId("");
    setOtp("");
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

  const identifierBody = () =>
    userType === "student"
      ? { user_type: "student", register_number: registerNumber.trim() }
      : { user_type: "staff", faculty_id: facultyId.trim() };

  const handleRequestOtp = async (e) => {
    e.preventDefault();

    if (userType === "student" && !registerNumber.trim()) {
      setError("Please enter your register number");
      return;
    }
    if (userType === "staff" && !facultyId.trim()) {
      setError("Please enter your Faculty ID");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/password-reset/", buildJsonPostOptions(identifierBody()));
      const data = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(data, "Could not send a reset code. Please check your details."));
      }

      setMessage(data.message || "A code was sent to your registered email.");
      setStep("verify");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async (e) => {
    e.preventDefault();

    if (!otp.trim()) { setError("Please enter the code from your email"); return; }
    if (!newPassword.trim()) { setError("Please enter a new password"); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/password-reset/", {
        ...buildJsonPostOptions({ ...identifierBody(), otp: otp.trim(), new_password: newPassword }),
        method: "PUT",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(extractApiError(data, "Password reset failed. Please try again."));
      }

      setMessage("Password reset successfully! You can now log in with your new password.");
      setTimeout(() => { handleClose(); }, 2500);
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
            <form onSubmit={handleRequestOtp}>
              <div className="form-section">
                <h3>Verify Your Identity</h3>
                {userType === "student" ? (
                  <p>Enter your register number — we'll email a 6-digit code to your registered address.</p>
                ) : (
                  <p>Enter your Faculty ID — we'll email a 6-digit code to your registered address.</p>
                )}
              </div>

              {userType === "student" ? (
                <div className="form-field">
                  <label htmlFor="reset-register">Register Number</label>
                  <input
                    id="reset-register"
                    type="text"
                    value={registerNumber}
                    onChange={(e) => setRegisterNumber(e.target.value)}
                    placeholder="e.g. 953623243023"
                    disabled={loading}
                    autoFocus
                  />
                </div>
              ) : (
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

              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={handleClose}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={loading}>
                  {loading ? "Sending…" : "Send Code"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyAndReset}>
              <div className="form-section">
                <h3>Enter Code & New Password</h3>
                <p>Check your email for a 6-digit code — it expires in 5 minutes.</p>
              </div>

              <div className="form-field">
                <label htmlFor="reset-otp">6-Digit Code</label>
                <input
                  id="reset-otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  disabled={loading}
                  autoFocus
                />
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
                  onClick={() => { setStep("request"); setOtp(""); setError(""); setMessage(""); }}
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
