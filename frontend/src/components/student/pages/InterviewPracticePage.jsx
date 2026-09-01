import React, { useState, useEffect } from "react";
import { Mic, Sparkles } from "lucide-react";

export default function InterviewPracticePage() {
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/interview/track/", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || "Could not load Interview Practice.");
        }
        return res.json();
      })
      .then(setTrack)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Placement Prep</p>
          <h1>Interview Practice</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Department-focused interview questions to prepare for placement interviews.
        </p>
      </section>

      <section className="surface-card" style={{ padding: 32, textAlign: "center" }}>
        {loading ? (
          <p style={{ color: "var(--text-soft)" }}>Loading your track…</p>
        ) : error ? (
          <p style={{ color: "var(--text-soft)" }}>{error}</p>
        ) : (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
              background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Mic size={26} className="text-olive-600" />
            </div>
            <h2 style={{ margin: "0 0 6px" }}>{track.track_label} Track</h2>
            <p style={{ color: "var(--text-soft)", margin: "0 0 20px" }}>
              Interview questions for the {track.department} department fall under this track.
            </p>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "var(--bg-2)", padding: "10px 18px", borderRadius: 12,
              color: "var(--text-soft)", fontSize: "0.9rem", fontWeight: 600,
            }}>
              <Sparkles size={16} />
              Questions for this track are coming soon.
            </div>
          </>
        )}
      </section>
    </div>
  );
}
