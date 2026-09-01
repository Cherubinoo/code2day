import React from "react";
import { Swords, Sparkles } from "lucide-react";

export default function CompetitivePracticePage() {
  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Placement Prep</p>
          <h1>Competitive Practice</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Timed, competitive-programming-style practice to sharpen speed and accuracy under pressure.
        </p>
      </section>

      <section className="surface-card" style={{ padding: 32, textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
          background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Swords size={26} className="text-olive-600" />
        </div>
        <h2 style={{ margin: "0 0 6px" }}>Competitive Practice</h2>
        <p style={{ color: "var(--text-soft)", margin: "0 0 20px" }}>
          A dedicated space for competitive-programming-style practice is on its way.
        </p>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "var(--bg-2)", padding: "10px 18px", borderRadius: 12,
          color: "var(--text-soft)", fontSize: "0.9rem", fontWeight: 600,
        }}>
          <Sparkles size={16} />
          Coming soon.
        </div>
      </section>
    </div>
  );
}
