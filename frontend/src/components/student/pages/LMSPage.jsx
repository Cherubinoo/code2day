import { GraduationCap, Sparkles } from "lucide-react";

export default function LMSPage() {
  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Learning</p>
          <h1>LMS</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Course content, notes, and lessons for students, staff, and department coordinators.
        </p>
      </section>

      <section className="surface-card" style={{ padding: 32, textAlign: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
          background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <GraduationCap size={26} className="text-olive-600" />
        </div>
        <h2 style={{ margin: "0 0 6px" }}>Coming Soon</h2>
        <p style={{ color: "var(--text-soft)", margin: "0 0 20px" }}>
          The LMS is being built out — course content will appear here once it's added.
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
