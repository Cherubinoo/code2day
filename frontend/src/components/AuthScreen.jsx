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
  setAuthStudent,
  setPassword,
  setRegisterNumber,
  setStudentMatches,
  studentMatches,
}) {
  return (
    <div className="auth-shell">
      <div className="auth-background auth-left" />
      <div className="auth-background auth-right" />

      <section className="auth-card">
        <div className="auth-copy">
          <p className="brand-label">code-2day</p>
          <h1>LeetCode-style practice for your campus.</h1>
          <p>
            Log in with your register number. First-time students can create a password
            after we verify the student record. Each account opens only its own
            private coding workspace.
          </p>
        </div>

        <div className="auth-panel">
          <div className="auth-tabs">
            <span className="auth-tab active">Student Login</span>
            <span className="auth-subtitle">{authStudent?.name ?? "Private student access"}</span>
          </div>

          <form className="auth-form" onSubmit={handleLookup}>
            <label htmlFor="register-number">Register Number</label>
            <input
              id="register-number"
              value={registerNumber}
              onChange={(event) => setRegisterNumber(event.target.value)}
              placeholder="953624243083"
            />
            {studentMatches.length > 0 ? (
              <div className="student-match-list">
                {studentMatches.map((student) => (
                  <button
                    key={student.register_number}
                    type="button"
                    className="student-match-item"
                    onClick={() => {
                      setRegisterNumber(student.register_number);
                      setAuthStudent(student);
                      setStudentMatches([]);
                      setAuthError("");
                    }}
                  >
                    <div>
                      <strong>{student.register_number}</strong>
                      <p>{student.name}</p>
                    </div>
                    <span className="match-state">
                      {student.password_is_set ? "Login" : "First time"}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <button type="submit" className="primary-button" disabled={authBusy}>
              {authBusy ? "Checking..." : "Continue"}
            </button>
          </form>

          {(authMode === "first-login" || authMode === "login") && (
            <form className="auth-form auth-form-secondary" onSubmit={handlePasswordSubmit}>
              <label htmlFor="student-password">
                {authMode === "first-login" ? "Create Password" : "Password"}
              </label>
              <input
                id="student-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  authMode === "first-login" ? "Choose a strong password" : "Enter password"
                }
              />
              <p className="password-hint">Use at least 6 characters for the password.</p>
              <button type="submit" className="primary-button" disabled={authBusy}>
                {authBusy
                  ? "Please wait..."
                  : authMode === "first-login"
                    ? "Set Password"
                    : "Login"}
              </button>
            </form>
          )}

          {authMessage ? <p className="auth-message">{authMessage}</p> : null}
          {authError ? <p className="auth-error">{authError}</p> : null}
        </div>
      </section>
    </div>
  );
}

export default AuthScreen;
