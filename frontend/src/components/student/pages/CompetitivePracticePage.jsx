import React, { useState, useEffect } from "react";
import { Swords, ChevronLeft, ChevronDown, ChevronRight, Link2, Loader2, BookOpen, Code2, ExternalLink } from "lucide-react";
import { getYoutubeEmbedUrl } from "../../../lib/appUtils";

function ResourceCard({ item }) {
  if (item.type === "aptitude_topic") {
    return (
      <a href={`/aptitude?topic=${item.aptitude_topic_id}`} className="surface-card resource-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, textDecoration: "none" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f5f3ff", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <BookOpen size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.04em" }}>Aptitude Practice</div>
          <div style={{ fontWeight: 700, color: "var(--text-hard)" }}>{item.label || item.aptitude_topic_title}</div>
        </div>
        <ExternalLink size={14} style={{ color: "var(--text-soft)", flexShrink: 0 }} />
      </a>
    );
  }

  if (item.type === "problem") {
    return (
      <a href={`/problems?slug=${encodeURIComponent(item.problem_slug)}`} className="surface-card resource-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, textDecoration: "none" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e0f2fe", color: "#0891b2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Code2 size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#0891b2", textTransform: "uppercase", letterSpacing: "0.04em" }}>Coding Problem · {item.problem_difficulty}</div>
          <div style={{ fontWeight: 700, color: "var(--text-hard)" }}>{item.label || item.problem_title}</div>
        </div>
        <ExternalLink size={14} style={{ color: "var(--text-soft)", flexShrink: 0 }} />
      </a>
    );
  }

  // type === "link"
  const embedUrl = getYoutubeEmbedUrl(item.url);
  if (embedUrl) {
    return (
      <div className="surface-card" style={{ padding: 16 }}>
        {item.label && <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text-hard)" }}>{item.label}</div>}
        <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden" }}>
          <iframe
            src={embedUrl}
            title={item.label || "Video resource"}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="surface-card resource-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, textDecoration: "none" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-2)", color: "var(--olive-700)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Link2 size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: "var(--text-hard)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label || item.url}</div>
        {item.label && <div style={{ fontSize: "0.78rem", color: "var(--text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.url}</div>}
      </div>
      <ExternalLink size={14} style={{ color: "var(--text-soft)", flexShrink: 0 }} />
    </a>
  );
}

function TopicLearnView({ examName, section, topic, onBack }) {
  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <button
          type="button"
          onClick={onBack}
          className="ghost-button"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, width: "fit-content" }}
        >
          <ChevronLeft size={16} /> {examName}
        </button>
        <div>
          <p className="kicker">{section.title}</p>
          <h1>{topic.title}</h1>
        </div>
      </section>

      {topic.subtopics.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {topic.subtopics.map((st) => (
            <span key={st.id} style={{ fontSize: "0.82rem", color: "var(--text-soft)", background: "var(--bg-2)", padding: "6px 14px", borderRadius: 10, fontWeight: 600 }}>
              {st.title}
            </span>
          ))}
        </div>
      )}

      {topic.resource_links.length === 0 ? (
        <div className="surface-card" style={{ padding: 48, textAlign: "center", color: "var(--text-soft)" }}>
          Resources for this topic are coming soon.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {topic.resource_links.map((item, i) => <ResourceCard key={i} item={item} />)}
        </div>
      )}
    </div>
  );
}

export default function CompetitivePracticePage() {
  const [examinations, setExaminations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedExam, setSelectedExam] = useState(null);
  const [syllabus, setSyllabus] = useState(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [activeTopic, setActiveTopic] = useState(null); // { section, topic }

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
    setActiveTopic(null);
    setSyllabusLoading(true);
    fetch(`/api/competitive/examinations/${exam.id}/syllabus/`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setSyllabus(data);
        setExpandedSections(Object.fromEntries((data?.sections || []).map((s) => [s.id, true])));
      })
      .finally(() => setSyllabusLoading(false));
  };

  if (selectedExam && activeTopic) {
    return (
      <TopicLearnView
        examName={selectedExam.name}
        section={activeTopic.section}
        topic={activeTopic.topic}
        onBack={() => setActiveTopic(null)}
      />
    );
  }

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
                  <div style={{ padding: "16px 24px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                    {section.topics.map((topic) => (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => setActiveTopic({ section, topic })}
                        style={{
                          textAlign: "left", padding: 16, borderRadius: 14, border: "1px solid var(--border-soft)",
                          background: "var(--bg-2)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Link2 size={14} style={{ color: "var(--olive-600)", flexShrink: 0 }} />
                          <span style={{ fontWeight: 750, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic.title}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-soft)", fontWeight: 700 }}>
                          <span>{topic.subtopics.length} subtopics</span>
                          <span>{topic.resource_links.length > 0 ? `${topic.resource_links.length} resource${topic.resource_links.length > 1 ? "s" : ""}` : "coming soon"}</span>
                        </div>
                      </button>
                    ))}
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
