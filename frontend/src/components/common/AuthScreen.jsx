import { useEffect, useRef } from "react";
import Footer from './Footer';

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
  handleStaffLookup,
  handleStaffPasswordSubmit,
  loginType,
  password,
  registerNumber,
  setAuthError,
  setAuthMode,
  setAuthStudent,
  setLoginType,
  setPassword,
  setRegisterNumber,
  setStaffMatches,
  staffMatches,
  setStudentMatches,
  studentMatches,
  onNavigate
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

  // ── Step 1: Register number / Faculty ID identification ─────────────────────────────
  const identifyStep = (
    <div className="auth-step" key="identify">
      <div className="auth-step-header">
        <span className="auth-step-icon">{loginType === "staff" ? "👔" : "🎓"}</span>
        <h2 className="auth-step-title">Welcome back</h2>
        <p className="auth-step-sub">
          {loginType === "staff" ? "Enter your Faculty ID to continue" : "Enter your register number to continue"}
        </p>
      </div>

      <form className="auth-form" onSubmit={handleLookup}>
        <div className="auth-field">
          <label htmlFor="register-number">
            {loginType === "staff" ? "Faculty ID" : "Register Number"}
          </label>
          <input
            id="register-number"
            value={registerNumber}
            onChange={(e) => setRegisterNumber(e.target.value)}
            placeholder={loginType === "staff" ? "e.g. FAC001" : "e.g. 95362324xxxx"}
            autoComplete="username"
            autoFocus
          />
          {loginType === "student" && studentMatches.length > 0 && (
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
          {loginType === "staff" && staffMatches.length > 0 && (
            <div className="student-match-list">
              {staffMatches.map((s) => (
                <button
                  key={s.faculty_id}
                  type="button"
                  className="student-match-item"
                  onClick={() => {
                    setRegisterNumber(s.faculty_id);
                    setAuthStudent(s);
                    setStaffMatches([]);
                    setAuthError("");
                  }}
                >
                  <div>
                    <strong>{s.faculty_id}</strong>
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
    <div className="auth-shell" style={{ 
      background: '#f9fafb', 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'flex-start',
      padding: 0,
      minHeight: '100vh',
      overflowY: 'auto'
    }}>
      <div style={{
        width: '100%',
        background: 'white',
        padding: '15px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        borderBottom: '1px solid #e5e7eb',
        zIndex: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <img 
          src="/logo/logo.jpeg" 
          alt="RIT Logo" 
          style={{ height: '100px', width: 'auto', objectFit: 'contain' }} 
        />
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ 
            color: '#dc2626', 
            margin: 0, 
            fontSize: '28px', 
            fontWeight: '800',
            letterSpacing: '0.5px',
            textTransform: 'uppercase'
          }}>
            RAMCO INSTITUTE OF TECHNOLOGY
          </h1>
          <h2 style={{ 
            color: '#eab308', 
            margin: '4px 0', 
            fontSize: '18px', 
            fontWeight: '700',
            textTransform: 'uppercase'
          }}>
            (AN AUTONOMOUS INSTITUTION)
          </h2>
          <div style={{ 
            fontSize: '14px', 
            color: '#4b5563', 
            lineHeight: '1.5',
            fontWeight: '500'
          }}>
            <p style={{ margin: 0 }}>Approved By AICTE, New Delhi & Affiliated to Anna University</p>
            <p style={{ margin: 0 }}>NAAC Accredited with ‘A+’ Grade & An ISO 9001:2015 Certified Institution</p>
            <p style={{ margin: 0 }}>Rajapalayam, Tamil Nadu, India - 626 117.</p>
          </div>
        </div>
      </div>

      <section className="auth-card" style={{ marginTop: '40px', alignSelf: 'center' }}>
        <div className="auth-copy">
          <p className="brand-label">code-2day</p>
          <h1>code2day practice for your campus.</h1>
          <p>
            Log in with your register number. Your workspace, progress, and
            contest history are private to your account.
          </p>
        </div>

        <div className="auth-panel">
          <div className="auth-tabs">
            <span
              className={`auth-tab ${loginType === "student" ? "active" : ""}`}
              onClick={() => {
                setLoginType("student");
                setAuthMode("identify");
                setAuthError("");
                setAuthStudent(null);
                setPassword("");
                setRegisterNumber("");
              }}
            >
              Student Login
            </span>
            <span
              className={`auth-tab ${loginType === "staff" ? "active" : ""}`}
              onClick={() => {
                setLoginType("staff");
                setAuthMode("identify");
                setAuthError("");
                setAuthStudent(null);
                setPassword("");
                setRegisterNumber("");
              }}
            >
              Staff Login
            </span>
          </div>

          {/* Single active step — no stacked forms */}
          {activeStep}

          {authMessage && (
            <p className={authMessage.toLowerCase().includes('block') ? 'auth-error' : 'auth-message'}
               style={authMessage.toLowerCase().includes('block') ? { fontWeight: 600 } : undefined}>
              {authMessage.toLowerCase().includes('block') ? '🚫 ' : ''}{authMessage}
            </p>
          )}
          {authError && <p className="auth-error">{authError}</p>}
        </div>
      </section>

      <Footer onNavigate={onNavigate} />
    </div>
  );
}

export default AuthScreen;
