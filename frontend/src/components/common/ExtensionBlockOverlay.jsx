// Full-screen blocking message shown when a browser extension is detected
// during a student's contest session. Non-dismissable while extensions are
// present — the student must remove them and re-check (or leave).

export default function ExtensionBlockOverlay({ details = [], onRecheck, onLeave }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483647,
        background: 'rgba(15, 23, 42, 0.98)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}
    >
      <div
        style={{
          background: 'white', borderRadius: 20, maxWidth: 520, width: '100%',
          padding: '36px 32px', textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            width: 72, height: 72, borderRadius: '50%', background: '#fef2f2',
            color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 36,
          }}
        >
          🧩
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
          Browser Extensions Are Blocked
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
          Browser extensions are not allowed during this contest. Please disable or
          remove <strong>all</strong> browser extensions, then re-check to continue.
          On Chrome open <code>chrome://extensions</code>, turn everything off, and
          reload this page. Using an Incognito / Guest window with no extensions also works.
        </p>

        {details.length > 0 && (
          <div
            style={{
              textAlign: 'left', background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 12, padding: '12px 14px', marginBottom: 20,
              fontSize: 12, color: '#475569', maxHeight: 140, overflowY: 'auto',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6, color: '#334155' }}>Detected:</div>
            {details.map((d, i) => (
              <div key={i} style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>• {d}</div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onRecheck}
            style={{
              padding: '12px 24px', borderRadius: 12, border: 'none',
              background: '#4f46e5', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Re-check
          </button>
          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              style={{
                padding: '12px 24px', borderRadius: 12, border: '1px solid #cbd5e1',
                background: 'white', color: '#334155', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Back to Contests
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
