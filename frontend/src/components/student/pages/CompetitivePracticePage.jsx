import React, { useState, useEffect } from "react";
import { Swords, ChevronLeft, ChevronDown, ChevronRight, Link2, Loader2 } from "lucide-react";

export default function CompetitivePracticePage() {
  const [examinations, setExaminations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedExam, setSelectedExam] = useState(null);
  const [syllabus, setSyllabus] = useState(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    fetch("/api/competitive/examinations/", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load Competitive Practice.");
        return res.json();
      })
      .then(setExaminations)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const openExam = (exam) => {
    setSelectedExam(exam);
    setSyllabusLoading(true);
    fetch(`/api/competitive/examinations/${exam.id}/syllabus/`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setSyllabus(data);
        setExpandedSections(Object.fromEntries((data?.sections || []).map((s) => [s.id, true])));
      })
      .finally(() => setSyllabusLoading(false));
  };

  if (selectedExam) {
    return (
      <div className="page-stack problem-page">
        <section className="page-header compact-header problem-page-header">
          <button
            type="button"
            onClick={() => { setSelectedExam(null); setSyllabus(null); }}
            className="ghost-button"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, width: "fit-content" }}
          >
            <ChevronLeft size={16} /> All Examinations
          </button>
          <div>
            <p className="kicker">Competitive Practice</p>
            <h1>{selectedExam.name}</h1>
          </div>
          {selectedExam.description && (
            <p style={{ color: "var(--text-soft)", margin: 0 }}>{selectedExam.description}</p>
          )}
        </section>

        {syllabusLoading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-soft)" }}><Loader2 size={28} className="spin" /></div>
        ) : !syllabus || (syllabus.sections || []).length === 0 ? (
          <div className="surface-card" style={{ padding: 48, textAlign: "center", color: "var(--text-soft)" }}>
            Syllabus for {selectedExam.name} is coming soon.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {syllabus.sections.map((section) => (
              <div key={section.id} className="surface-card" style={{ overflow: "hidden", padding: 0 }}>
                <button
                  type="button"
                  onClick={() => setExpandedSections((prev) => ({ ...prev, [section.id]: !prev[section.id] }))}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "18px 24px", background: "var(--bg-2)", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  {expandedSections[section.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span style={{ fontWeight: 850, fontSize: "1.05rem" }}>{section.title}</span>
                  <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-soft)", fontWeight: 700 }}>{section.topics.length} topics</span>
                </button>

                {expandedSections[section.id] && (
                  <div style={{ padding: "8px 24px 20px" }}>
                    {section.topics.map((topic) => {
                      const hasLinks = (topic.resource_links || []).length > 0;
                      return (
                        <div key={topic.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--border-soft)" }}>
                          {hasLinks ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                              <Link2 size={14} style={{ color: "var(--olive-600)" }} />
                              {topic.resource_links.map((link, i) => (
                                <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="topic-link" style={{ fontWeight: 700, color: "var(--olive-700)", fontSize: "0.95rem" }}>
                                  {topic.title}{link.label ? ` — ${link.label}` : ""}
                                </a>
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-soft)" }}>
                              <Link2 size={14} />
                              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{topic.title}</span>
                            </div>
                          )}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, paddingLeft: 22 }}>
                            {topic.subtopics.map((st) => (
                              <span key={st.id} style={{ fontSize: "0.78rem", color: "var(--text-soft)", background: "var(--bg-2)", padding: "4px 10px", borderRadius: 8 }}>
                                {st.title}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Placement Prep</p>
          <h1>Competitive Practice</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Browse the syllabus for competitive exams and prepare topic by topic.
        </p>
      </section>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-soft)" }}><Loader2 size={28} className="spin" /></div>
      ) : error ? (
        <div className="surface-card" style={{ padding: 32, textAlign: "center", color: "var(--text-soft)" }}>{error}</div>
      ) : examinations.length === 0 ? (
        <div className="surface-card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
            background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Swords size={26} className="text-olive-600" />
          </div>
          <h2 style={{ margin: "0 0 6px" }}>No examinations yet</h2>
          <p style={{ color: "var(--text-soft)", margin: 0 }}>Check back soon — examinations will appear here once added.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
          {examinations.map((exam) => (
            <button
              key={exam.id}
              type="button"
              onClick={() => openExam(exam)}
              className="surface-card"
              style={{ textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 12, padding: 24 }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: "var(--bg-2)",
                display: "flex", alignItems: "center", justifyContent: "center", color: "var(--olive-700)",
              }}>
                <Swords size={20} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "1.1rem", fontWeight: 850 }}>{exam.name}</h3>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-soft)" }}>{exam.description || "Practice syllabus"}</p>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-soft)", fontWeight: 700 }}>
                {exam.section_count} sections · {exam.topic_count} topics
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
