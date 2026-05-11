import { useEffect, useRef, useState } from "react";
import PasswordResetModal from './PasswordResetModal';

/**
 * AuthScreen
 * ==========
 * Flow:
 *  1. "institution" → select institution
 *  2. "identify"    → enter register number / faculty ID
 *  3. "first-login" → create password ONCE (new users only)
 *  4. "login"       → enter existing password
 */
function AuthScreen({
  authBusy,
  authError,
  authMessage,
  authMode,
  authStudent,
  handleLookup,
  handlePasswordSubmit,
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
  selectedInstitutionId,
  setSelectedInstitutionId,
  onNavigate,
}) {
  const passwordRef = useRef(null);
  const [authStep, setAuthStep] = useState("institution");
  const [selectedInstitution, setSelectedInstitution] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [instLoading, setInstLoading] = useState(true);
  const [instError, setInstError] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  // Load institutions on mount
  useEffect(() => {
    async function load() {
      try {
        setInstLoading(true);
        const res = await fetch("/api/institutions/", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to load institutions");
        const data = await res.json();
        setInstitutions(data.institutions || []);
      } catch (e) {
        setInstError(e.message);
      } finally {
        setInstLoading(false);
      }
    }
    load();
  }, []);

  // Restore institution from localStorage
  useEffect(() => {
    if (selectedInstitutionId) {
      const stored = window.localStorage.getItem("code2day-selected-institution");
      if (stored) {
        try {
          setSelectedInstitution(JSON.parse(stored));
          setAuthStep("identify");
        } catch (_) {}
      }
    }
  }, [selectedInstitutionId]);

  // Auto-focus password field
  useEffect(() => {
    if ((authMode === "login" || authMode === "first-login") && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [authMode]);

  const handleInstitutionContinue = (inst) => {
    setSelectedInstitution(inst);
    setSelectedInstitutionId(inst.id);
    window.localStorage.setItem("code2day-selected-institution", JSON.stringify(inst));
    window.localStorage.setItem("code2day-institution-id", inst.id);
    setAuthStep("identify");
  };

  const handleChangeInstitution = () => {
    setSelectedInstitution(null);
    setSelectedInstitutionId(null);
    window.localStorage.removeItem("code2day-selected-institution");
    window.localStorage.removeItem("code2day-institution-id");
    setAuthStep("institution");
    setAuthMode("identify");
    setAuthStudent(null);
    setPassword("");
    setRegisterNumber("");
    setAuthError("");
  };

  function handleBack() {
    setAuthMode("identify");
    setAuthStudent(null);
    setPassword("");
    setStudentMatches([]);
    setAuthError("");
  }

  // ── Dynamic header ──────────────────────────────────────────────────────
  const renderHeader = () => {
    if (selectedInstitution) {
      const isRamco =
        selectedInstitution.name.toLowerCase().includes("ramco") ||
        selectedInstitution.code === "RIT";

      if (isRamco) {
        return (
          <div style={{
            width: "100%", background: "white", padding: "14px 24px",
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: "20px", borderBottom: "1px solid #e5e7eb",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)", flexShrink: 0,
          }}>
            <img src="/logo/logo.jpeg" alt="RIT Logo"
              style={{ height: 90, width: "auto", objectFit: "contain" }} />
            <div style={{ textAlign: "center" }}>
              <h1 style={{ color: "#dc2626", margin: 0, fontSize: 26, fontWeight: 800,
                letterSpacing: "0.5px", textTransform: "uppercase" }}>
                RAMCO INSTITUTE OF TECHNOLOGY
              </h1>
              <h2 style={{ color: "#eab308", margin: "3px 0", fontSize: 16,
                fontWeight: 700, textTransform: "uppercase" }}>
                (AN AUTONOMOUS INSTITUTION)
              </h2>
              <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.5, fontWeight: 500 }}>
                <p style={{ margin: 0 }}>Approved By AICTE, New Delhi &amp; Affiliated to Anna University</p>
                <p style={{ margin: 0 }}>NAAC Accredited with 'A+' Grade &amp; An ISO 9001:2015 Certified Institution</p>
                <p style={{ margin: 0 }}>Rajapalayam, Tamil Nadu, India - 626 117.</p>
              </div>
            </div>
          </div>
        );
      }

      return (
        <div style={{
          width: "100%", padding: "16px 24px", flexShrink: 0,
          background: selectedInstitution.primary_color
            ? `linear-gradient(135deg, ${selectedInstitution.primary_color}, ${selectedInstitution.secondary_color || selectedInstitution.primary_color})`
            : "linear-gradient(135deg, #1e3a5f, #2d5a8e)",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 10, overflow: "hidden",
            background: "rgba(255,255,255,0.15)", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
            border: "2px solid rgba(255,255,255,0.25)",
          }}>
            {selectedInstitution.logo_url ? (
              <img src={selectedInstitution.logo_url} alt={selectedInstitution.name}
                style={{ width: "100%", height: "100%", objectFit: "contain", background: "white" }} />
            ) : (
              <span style={{ color: "white", fontSize: 28, fontWeight: 700 }}>
                {selectedInstitution.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ color: "white", margin: 0, fontSize: 26, fontWeight: 800,
              textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
              {selectedInstitution.name}
            </h1>
            {selectedInstitution.code && (
              <h2 style={{ color: "rgba(255,255,255,0.85)", margin: "4px 0",
                fontSize: 15, fontWeight: 600, textTransform: "uppercase" }}>
                ({selectedInstitution.code})
              </h2>
            )}
            {selectedInstitution.location && (
              <p style={{ color: "rgba(255,255,255,0.75)", margin: 0, fontSize: 13 }}>
                📍 {selectedInstitution.location}
              </p>
            )}
          </div>
        </div>
      );
    }

    // No institution selected — Code2Day header
    return (
      <div style={{
        width: "100%", flexShrink: 0,
        background: "linear-gradient(135deg, #4a5526, #5c6b2e)",
        padding: "18px 32px",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "16px", borderBottom: "3px solid #8a9a3c",
        boxShadow: "0 3px 12px rgba(74,85,38,0.25)",
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: "rgba(245,240,232,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: "2px solid rgba(245,240,232,0.3)", fontSize: 22, flexShrink: 0,
        }}>
          💻
        </div>
        <div style={{ textAlign: "center" }}>
          <h1 style={{
            color: "#f5f0e8", margin: 0, fontSize: 28, fontWeight: 800,
            letterSpacing: "3px", textTransform: "uppercase",
            textShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}>
            CODE2DAY
          </h1>
          <p style={{
            color: "#c8d48a", margin: "4px 0 0", fontSize: 12,
            fontWeight: 500, letterSpacing: "1.5px", textTransform: "uppercase",
          }}>
            Learning Management Platform
          </p>
        </div>
      </div>
    );
  };

  // ── Auth steps ──────────────────────────────────────────────────────────

  const identifyStep = (
    <div className="auth-step" key="identify">
      <div className="auth-step-header">
        <span className="auth-step-icon">{loginType === "staff" ? "👔" : "🎓"}</span>
        <h2 className="auth-step-title">Welcome back</h2>
        <p className="auth-step-sub">
          {loginType === "staff"
            ? "Enter your Faculty ID to continue"
            : "Enter your register number to continue"}
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
                <button key={s.register_number} type="button" className="student-match-item"
                  onClick={() => { setRegisterNumber(s.register_number); setAuthStudent(s); setStudentMatches([]); setAuthError(""); }}>
                  <div><strong>{s.register_number}</strong><p>{s.name}</p></div>
                  <span className="match-state">{s.password_is_set ? "Login" : "First time"}</span>
                </button>
              ))}
            </div>
          )}
          {loginType === "staff" && staffMatches.length > 0 && (
            <div className="student-match-list">
              {staffMatches.map((s) => (
                <button key={s.faculty_id} type="button" className="student-match-item"
                  onClick={() => { setRegisterNumber(s.faculty_id); setAuthStudent(s); setStaffMatches([]); setAuthError(""); }}>
                  <div><strong>{s.faculty_id}</strong><p>{s.name}</p></div>
                  <span className="match-state">{s.password_is_set ? "Login" : "First time"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="submit" className="primary-button" disabled={authBusy}>
          {authBusy ? "Checking…" : "Continue →"}
        </button>
        <div style={{ marginTop: 10, textAlign: "center" }}>
          <button type="button" className="auth-link-btn" onClick={() => setShowPasswordReset(true)}>
            Forgot Password?
          </button>
        </div>
      </form>
    </div>
  );

  const firstLoginStep = (
    <div className="auth-step" key="first-login">
      <div className="auth-step-header">
        <span className="auth-step-icon">🔐</span>
        <h2 className="auth-step-title">Create your password</h2>
        <p className="auth-step-name">{authStudent?.name}</p>
        <p className="auth-step-sub auth-once-badge">You only need to do this once</p>
      </div>
      <form className="auth-form" onSubmit={handlePasswordSubmit}>
        <div className="auth-field">
          <label htmlFor="student-password">New Password</label>
          <input id="student-password" ref={passwordRef} type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose a strong password" autoComplete="new-password" />
          <p className="auth-hint">At least 8 characters</p>
        </div>
        <button type="submit" className="primary-button" disabled={authBusy}>
          {authBusy ? "Setting up…" : "Set Password & Login"}
        </button>
      </form>
      <button className="auth-back-btn" type="button" onClick={handleBack}>← Back</button>
    </div>
  );

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
          <input id="student-password" ref={passwordRef} type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password" autoComplete="current-password" />
        </div>
        <button type="submit" className="primary-button" disabled={authBusy}>
          {authBusy ? "Logging in…" : "Login"}
        </button>
      </form>
      <button className="auth-back-btn" type="button" onClick={handleBack}>← Not you? Go back</button>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────

  // INSTITUTION STEP
  if (authStep === "institution") {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {renderHeader()}
        <div className="auth-shell" style={{ flex: 1, minHeight: 0, padding: "20px 24px" }}>
          <div className="auth-background auth-left" />
          <div className="auth-background auth-right" />
          <section className="auth-card">
            {/* LEFT */}
            <div className="auth-copy">
              <p className="brand-label">code-2day</p>
              <h1>code2day practice for your campus.</h1>
              <p>
                Select your institution to get started. Your workspace, progress, and
                contest history are private to your account.
              </p>
            </div>
            {/* RIGHT */}
            <div className="auth-panel">
              <div className="auth-step">
                <div className="auth-step-header">
                  <span className="auth-step-icon">🏛️</span>
                  <h2 className="auth-step-title">Select Institution</h2>
                  <p className="auth-step-sub">Choose your institution to continue</p>
                </div>
                {instLoading ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}>
                    <div style={{
                      width: 36, height: 36, border: "3px solid #e5e7eb",
                      borderTopColor: "#4a5526", borderRadius: "50%",
                      animation: "spin 0.8s linear infinite", margin: "0 auto 12px",
                    }} />
                    <p style={{ color: "var(--text-soft)", fontSize: "0.9rem" }}>Loading institutions…</p>
                  </div>
                ) : instError ? (
                  <div style={{ textAlign: "center", padding: "20px 0" }}>
                    <p className="auth-error">⚠️ {instError}</p>
                    <button className="primary-button" onClick={() => window.location.reload()}>Retry</button>
                  </div>
                ) : (
                  <InstSelectForm
                    institutions={institutions}
                    onContinue={handleInstitutionContinue}
                    authBusy={authBusy}
                  />
                )}
              </div>
            </div>
          </section>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // LOGIN / PASSWORD STEPS
  const activeStep =
    authMode === "first-login" ? firstLoginStep
    : authMode === "login" ? loginStep
    : identifyStep;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {renderHeader()}
      <div className="auth-shell" style={{ flex: 1, minHeight: 0, padding: "20px 24px" }}>
        <div className="auth-background auth-left" />
        <div className="auth-background auth-right" />
        <section className="auth-card">
          {/* LEFT */}
          <div className="auth-copy">
            <p className="brand-label">code-2day</p>
            <h1>code2day practice for your campus.</h1>
            <p>
              Log in with your register number. Your workspace, progress, and
              contest history are private to your account.
            </p>
            {selectedInstitution && (
              <div className="auth-inst-badge">
                <span><strong>Institution:</strong> {selectedInstitution.name}</span>
                <button type="button" className="auth-inst-change" onClick={handleChangeInstitution}>
                  Change Institution
                </button>
              </div>
            )}
          </div>
          {/* RIGHT */}
          <div className="auth-panel">
            <div className="auth-tabs">
              <span
                className={`auth-tab ${loginType === "student" ? "active" : ""}`}
                onClick={() => { setLoginType("student"); setAuthMode("identify"); setAuthError(""); setAuthStudent(null); setPassword(""); setRegisterNumber(""); }}
              >
                Student Login
              </span>
              <span
                className={`auth-tab ${loginType === "staff" ? "active" : ""}`}
                onClick={() => { setLoginType("staff"); setAuthMode("identify"); setAuthError(""); setAuthStudent(null); setPassword(""); setRegisterNumber(""); }}
              >
                Staff Login
              </span>
            </div>

            {activeStep}

            {authMessage && (
              <p className={authMessage.toLowerCase().includes("block") ? "auth-error" : "auth-message"}
                style={authMessage.toLowerCase().includes("block") ? { fontWeight: 600 } : undefined}>
                {authMessage.toLowerCase().includes("block") ? "🚫 " : ""}{authMessage}
              </p>
            )}
            {authError && <p className="auth-error">{authError}</p>}
          </div>
        </section>
      </div>

      <PasswordResetModal
        isOpen={showPasswordReset}
        onClose={() => setShowPasswordReset(false)}
        userType={loginType}
      />

      <style>{`
        .auth-inst-badge {
          margin-top: 24px;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 10px;
          padding: 12px 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 0.88rem;
          color: rgba(248,246,239,0.9);
        }
        .auth-inst-change {
          background: rgba(255,255,255,0.18);
          border: 1px solid rgba(255,255,255,0.3);
          color: #f8f6ef;
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          align-self: flex-start;
          transition: background 0.2s;
        }
        .auth-inst-change:hover { background: rgba(255,255,255,0.28); }
        .auth-link-btn {
          background: none;
          border: none;
          color: var(--olive-600, #5c6b2e);
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
        }
        .auth-link-btn:hover { color: var(--olive-800, #3a4220); }
      `}</style>
    </div>
  );
}

// ── Institution select form sub-component ─────────────────────────────────
function InstSelectForm({ institutions, onContinue, authBusy }) {
  const [selected, setSelected] = useState(null);

  return (
    <>
      <div className="auth-field" style={{ marginBottom: 0 }}>
        <label htmlFor="inst-select">Institution</label>
        <select
          id="inst-select"
          value={selected?.id || ""}
          onChange={(e) => {
            const id = parseInt(e.target.value);
            setSelected(institutions.find((i) => i.id === id) || null);
          }}
          style={{
            width: "100%", padding: "11px 14px",
            border: "2px solid #e5e7eb", borderRadius: "8px",
            fontSize: "15px", background: "white", color: "#1f2937",
            cursor: "pointer", appearance: "none",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
            paddingRight: "40px", transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#4a5526")}
          onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
        >
          <option value="">— Select your institution —</option>
          {institutions.map((inst) => (
            <option key={inst.id} value={inst.id}>
              {inst.name}{inst.code ? ` (${inst.code})` : ""}{inst.location ? ` · ${inst.location}` : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginTop: 14,
          padding: "10px 12px", background: "#f5f2ea",
          border: "1.5px solid #d4c9a8", borderRadius: 10,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 8, overflow: "hidden",
            background: "#4a5526", display: "flex", alignItems: "center",
            justifyContent: "center", flexShrink: 0,
          }}>
            {selected.logo_url ? (
              <img src={selected.logo_url} alt={selected.name}
                style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ color: "white", fontWeight: 700, fontSize: 18 }}>
                {selected.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#1f2937" }}>{selected.name}</div>
            {selected.location && (
              <div style={{ fontSize: 12, color: "#6b7280" }}>📍 {selected.location}</div>
            )}
          </div>
        </div>
      )}

      <button
        className="primary-button"
        style={{ marginTop: 20, width: "100%" }}
        onClick={() => selected && onContinue(selected)}
        disabled={!selected || authBusy}
      >
        Continue →
      </button>
    </>
  );
}

export default AuthScreen;
