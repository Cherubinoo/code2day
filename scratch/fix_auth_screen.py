import sys
import os

path = 'frontend/src/components/common/AuthScreen.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '// ── Dynamic header ──────────────────────────────────────────────────────'
end_marker = '// ── Auth steps ──────────────────────────────────────────────────────────'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"Markers not found: start={start_idx}, end={end_idx}")
    sys.exit(1)

new_function = '''// ── Dynamic header ──────────────────────────────────────────────────────
  const renderHeader = () => {
    if (!selectedInstitution) {
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
            background: "rgba(255,255,255,0.15)",
            padding: "8px 12px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.2)",
            fontWeight: 900, color: "white", fontSize: 24,
            letterSpacing: "1px"
          }}>C2D</div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ color: "white", margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.5px" }}>code-2day</h1>
            <p style={{ color: "rgba(255,255,255,0.7)", margin: 0, fontSize: 13, fontWeight: 500 }}>Universal Academic Excellence Portal</p>
          </div>
        </div>
      );
    }

    const { display_name, name, subheading, address, logo_url } = selectedInstitution;

    return (
      <div style={{
        width: "100%", background: "white", padding: "8px 16px",
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "16px", borderBottom: "1px solid #e5e7eb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)", flexShrink: 0,
      }}>
        {logo_url ? (
          <img src={logo_url} alt={`${name} Logo`}
            style={{ height: 60, width: "auto", objectFit: "contain" }} />
        ) : (
          <div style={{ width: 48, height: 48, background: "#f3f4f6", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🏛️</div>
        )}
        <div style={{ textAlign: "center" }}>
          <h1 style={{ color: "#dc2626", margin: 0, fontSize: 20, fontWeight: 800,
            letterSpacing: "0.5px", textTransform: "uppercase" }}>
            {display_name || name}
          </h1>
          {subheading && (
            <h2 style={{ color: "#eab308", margin: "2px 0", fontSize: 13,
              fontWeight: 700, textTransform: "uppercase" }}>
              {subheading}
            </h2>
          )}
          {address && (
            <div style={{ fontSize: 10.5, color: "#4b5563", lineHeight: 1.3, fontWeight: 500 }}>
              {address.split('\\n').map((line, i) => (
                <p key={i} style={{ margin: 0 }}>{line.trim ? line.trim() : line}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  '''

new_content = content[:start_idx] + new_function + content[end_idx:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Successfully updated AuthScreen.jsx")
