import { Database, Sparkles } from "lucide-react";

export default function SQLPracticePage() {
  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Gamified Practice</p>
          <h1>SQL Practice</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Learn SQL through gamified practice questions curated by admins.
        </p>
      </section>

      <section className="surface-card" style={{ padding: 32, textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
          background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Database size={26} className="text-olive-600" />
        </div>
        <h2 style={{ margin: "0 0 6px" }}>Coming Soon</h2>
        <p style={{ color: "var(--text-soft)", margin: "0 0 20px" }}>
          SQL practice content is being built out — questions will appear here once they're added.
        </p>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "var(--bg-2)", padding: "10px 18px", borderRadius: 12,
          color: "var(--text-soft)", fontSize: "0.9rem", fontWeight: 600,
        }}>
          <Sparkles size={16} />
          Check back soon.
        </div>
      </section>
    </div>
  );
}
