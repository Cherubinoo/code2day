import { useEffect, useRef } from "react";

/**
 * AuthScreen
 * ==========
 * Three-step card flow rendered one step at a time:
 *
 *  "identify"    → enter register number  (always first)
 *  "first-login" → create password ONCE   (new students only, never again)
 *  "login"       → enter existing password (returning students)
 *
 * The register number form is fully replaced when moving to step 2, so
 * returning students never see "Create Password" and new students are
 * clearly told this happens only once.
 */
function AuthScreen({
  authBusy,
  authError,
  authMessage,
  authMode,
  authStudent,
  handleLookup,
  handlePasswordSubmit,
  password,
  registerNumber,
  setAuthError,
  setAuthMode,
  setAuthStudent,
  setPassword,
  setRegisterNumber,
  setStudentMatches,
  studentMatches,
}) {
  const passwordRef = useRef(null);

  // Auto-focus the password field when the mode changes to login/first-login
  useEffect(() => {
    if ((authMode === "login" || authMode === "first-login") && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [authMode]);

  function handleBack() {
    setAuthMode("identify");
    setAuthStudent(null);
    setPassword("");
    setStudentMatches([]);
    setAuthError("");
  }

  // ── Step 1: Register number identification ─────────────────────────────
  const identifyStep = (
    <div className="auth-step" key="identify">
      <div className="auth-step-header">
        <span className="auth-step-icon">🎓</span>
        <h2 className="auth-step-title">Welcome back</h2>
        <p className="auth-step-sub">Enter your register number to continue</p>
      </div>

      <form className="auth-form" onSubmit={handleLookup}>
        <div className="auth-field">
          <label htmlFor="register-number">Register Number</label>
          <input
            id="register-number"
            value={registerNumber}
            onChange={(e) => setRegisterNumber(e.target.value)}
            placeholder="e.g. 953624243083"
            autoComplete="username"
            autoFocus
          />
          {studentMatches.length > 0 && (
            <div className="student-match-list">
              {studentMatches.map((s) => (
                <button
                  key={s.register_number}
                  type="button"
                  className="student-match-item"
                  onClick={() => {
                    setRegisterNumber(s.register_number);
                    setAuthStudent(s);
                    setStudentMatches([]);
                    setAuthError("");
                  }}
                >
                  <div>
                    <strong>{s.register_number}</strong>
                    <p>{s.name}</p>
                  </div>
                  <span className="match-state">
                    {s.password_is_set ? "Login" : "First time"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button type="submit" className="primary-button" disabled={authBusy}>
          {authBusy ? "Checking…" : "Continue →"}
        </button>
      </form>
    </div>
  );

  // ── Step 2a: First-time password creation (one-time only) ──────────────
  const firstLoginStep = (
    <div className="auth-step" key="first-login">
      <div className="auth-step-header">
        <span className="auth-step-icon">🔐</span>
        <h2 className="auth-step-title">Create your password</h2>
        <p className="auth-step-name">{authStudent?.name}</p>
        <p className="auth-step-sub auth-once-badge">
          You only need to do this once
        </p>
      </div>

      <form className="auth-form" onSubmit={handlePasswordSubmit}>
        <div className="auth-field">
          <label htmlFor="student-password">New Password</label>
          <input
            id="student-password"
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose a strong password"
            autoComplete="new-password"
          />
          <p className="auth-hint">At least 8 characters</p>
        </div>

        <button type="submit" className="primary-button" disabled={authBusy}>
          {authBusy ? "Setting up…" : "Set Password & Login"}
        </button>
      </form>

      <button className="auth-back-btn" type="button" onClick={handleBack}>
        ← Back
      </button>
    </div>
  );

  // ── Step 2b: Normal login (all subsequent visits) ──────────────────────
  const loginStep = (
    <div className="auth-step" key="login">
      <div className="auth-step-header">
        <span className="auth-step-icon">👋</span>
        <h2 className="auth-step-title">Enter your password</h2>
        <p className="auth-step-name">{authStudent?.name ?? registerNumber}</p>
        <p className="auth-step-sub">{authStudent?.register_number ?? ""}</p>
      </div>

      <form className="auth-form" onSubmit={handlePasswordSubmit}>
        <div className="auth-field">
          <label htmlFor="student-password">Password</label>
          <input
            id="student-password"
            ref={passwordRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            autoComplete="current-password"
          />
        </div>

        <button type="submit" className="primary-button" disabled={authBusy}>
          {authBusy ? "Logging in…" : "Login"}
        </button>
      </form>

      <button className="auth-back-btn" type="button" onClick={handleBack}>
        ← Not you? Go back
      </button>
    </div>
  );

  // Pick which step to render
  const activeStep =
    authMode === "first-login"
      ? firstLoginStep
      : authMode === "login"
        ? loginStep
        : identifyStep;

  return (
    <div className="auth-shell">
      <div className="auth-background auth-left" />
      <div className="auth-background auth-right" />

      <section className="auth-card">
        <div className="auth-copy">
          <p className="brand-label">code-2day</p>
          <h1>LeetCode-style practice for your campus.</h1>
          <p>
            Log in with your register number. Your workspace, progress, and
            contest history are private to your account.
          </p>
        </div>

        <div className="auth-panel">
          <div className="auth-tabs">
            <span className="auth-tab active">Student Login</span>
          </div>

          {/* Single active step — no stacked forms */}
          {activeStep}

          {authMessage && <p className="auth-message">{authMessage}</p>}
          {authError && <p className="auth-error">{authError}</p>}
        </div>
      </section>
    </div>
  );
}

export default AuthScreen;
