import { useEffect, useState } from "react";

/**
 * InstitutionSelector
 * ==================
 * Rendered inside the auth-card layout (same two-column style as login).
 * Left panel = olive green branding, Right panel = beige form.
 */
function InstitutionSelector({ 
  onInstitutionSelected, 
  selectedInstitutionId, 
  setSelectedInstitutionId,
}) {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localSelected, setLocalSelected] = useState(null);

  useEffect(() => {
    async function loadInstitutions() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/institutions/", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to load institutions");
        const data = await response.json();
        setInstitutions(data.institutions || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadInstitutions();
  }, []);

  const handleSelect = (e) => {
    const id = parseInt(e.target.value);
    const inst = institutions.find(i => i.id === id) || null;
    setLocalSelected(inst);
    if (inst) setSelectedInstitutionId(inst.id);
  };

  const handleContinue = () => {
    if (localSelected) {
      window.localStorage.setItem("code2day-institution-id", localSelected.id);
      onInstitutionSelected(localSelected);
    }
  };

  return (
    <>
      {/* LEFT — olive green branding panel */}
      <div className="auth-copy">
        <p className="brand-label">code-2day</p>
        <h1>code2day practice for your campus.</h1>
        <p>
          Select your institution to get started. Your workspace, progress, and
          contest history are private to your account.
        </p>

        {localSelected && (
          <div className="selected-institution-info">
            <p>
              <strong>Selected:</strong> {localSelected.name}
            </p>
          </div>
        )}
      </div>

      {/* RIGHT — beige form panel */}
      <div className="auth-panel">
        <div className="inst-form-header">
          <h2>Select Institution</h2>
          <p>Choose your institution to continue</p>
        </div>

        {loading ? (
          <div className="inst-loading">
            <div className="inst-spinner" />
            <p>Loading institutions…</p>
          </div>
        ) : error ? (
          <div className="inst-error">
            <p>⚠️ {error}</p>
            <button onClick={() => window.location.reload()} className="primary-button">
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="auth-field">
              <label htmlFor="institution-select">Institution</label>
              <select
                id="institution-select"
                value={localSelected?.id || ""}
                onChange={handleSelect}
                className="inst-select"
              >
                <option value="">— Select your institution —</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}{inst.code ? ` (${inst.code})` : ""}
                    {inst.location ? ` · ${inst.location}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {localSelected && (
              <div className="inst-preview">
                <div className="inst-preview-logo">
                  {localSelected.logo_url ? (
                    <img src={localSelected.logo_url} alt={localSelected.name} />
                  ) : (
                    <span>{localSelected.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="inst-preview-info">
                  <strong>{localSelected.name}</strong>
                  {localSelected.location && <small>📍 {localSelected.location}</small>}
                </div>
              </div>
            )}

            <button
              className="primary-button"
              onClick={handleContinue}
              disabled={!localSelected}
              style={{ marginTop: localSelected ? '16px' : '24px' }}
            >
              Continue →
            </button>
          </>
        )}
      </div>

      <style>{`
        .inst-form-header {
          margin-bottom: 24px;
        }
        .inst-form-header h2 {
          font-size: 22px;
          font-weight: 700;
          color: #1f2937;
          margin: 0 0 6px 0;
        }
        .inst-form-header p {
          font-size: 14px;
          color: #6b7280;
          margin: 0;
        }
        .inst-select {
          width: 100%;
          padding: 11px 14px;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          font-size: 15px;
          background: white;
          color: #1f2937;
          cursor: pointer;
          transition: border-color 0.2s;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 40px;
        }
        .inst-select:focus {
          outline: none;
          border-color: #4a5526;
          box-shadow: 0 0 0 3px rgba(74,85,38,0.12);
        }
        .inst-preview {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 16px;
          padding: 12px 14px;
          background: #f9f7f2;
          border: 1.5px solid #d4c9a8;
          border-radius: 10px;
        }
        .inst-preview-logo {
          width: 44px;
          height: 44px;
          border-radius: 8px;
          overflow: hidden;
          background: #4a5526;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .inst-preview-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .inst-preview-logo span {
          color: white;
          font-size: 20px;
          font-weight: 700;
        }
        .inst-preview-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .inst-preview-info strong {
          font-size: 14px;
          color: #1f2937;
          font-weight: 600;
        }
        .inst-preview-info small {
          font-size: 12px;
          color: #6b7280;
        }
        .inst-loading {
          text-align: center;
          padding: 40px 0;
        }
        .inst-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #e5e7eb;
          border-top-color: #4a5526;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 12px;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .inst-loading p {
          color: #6b7280;
          font-size: 14px;
        }
        .inst-error {
          text-align: center;
          padding: 20px 0;
        }
        .inst-error p {
          color: #dc2626;
          margin-bottom: 12px;
          font-size: 14px;
        }
      `}</style>
    </>
  );
}

export default InstitutionSelector;
