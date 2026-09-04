import React, { useState, useEffect } from "react";
import { Mic, ChevronLeft, ChevronDown, ChevronRight, Loader2, Folder, FileText, Link2 } from "lucide-react";
import MediaViewerModal from "../../common/MediaViewerModal";

const QUESTION_TYPE_LABELS = {
  conceptual: "Conceptual", technical: "Technical", scenario: "Scenario-Based", tool: "Tool-Based",
  troubleshooting: "Troubleshooting", comparison: "Comparison", process: "Process / Procedure", behavioral: "Behavioral / Experience",
};

// A folder's own questions plus every subfolder's, all the way down — same
// recursive-count idea as the admin Interview Bank view.
function sumFolderQuestions(folder) {
  return (folder.questions || []).length + (folder.subfolders || []).reduce((acc, f) => acc + sumFolderQuestions(f), 0);
}
function topicTotalQuestions(topic) {
  return (topic.questions || []).length + (topic.folders || []).reduce((acc, f) => acc + sumFolderQuestions(f), 0);
}

function FolderMediaGrid({ media }) {
  const [viewerMedia, setViewerMedia] = useState(null);
  if (!media || media.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
      {media.map((m) => (
        <div key={m.id} onClick={() => setViewerMedia(m)} style={{ display: "block", cursor: "pointer" }}>
          {m.kind === "image" ? (
            <img src={m.url} alt={m.title} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border-soft)" }} />
          ) : m.kind === "video" ? (
            <video src={m.url} style={{ width: 160, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border-soft)" }} />
          ) : (
            <div style={{ width: 120, height: 80, borderRadius: 10, border: "1px solid var(--border-soft)", background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, padding: 8 }}>
              {m.kind === "pdf" ? <FileText size={22} style={{ color: "#0891b2" }} /> : <Link2 size={22} style={{ color: "var(--text-soft)" }} />}
              <span style={{ fontSize: "0.68rem", color: "var(--text-soft)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 104 }}>{m.title}</span>
            </div>
          )}
        </div>
      ))}
      {viewerMedia && <MediaViewerModal media={viewerMedia} onClose={() => setViewerMedia(null)} />}
    </div>
  );
}

// Self-study card — no submit/scoring, the backend already sends the full
// answer up front (see InterviewTrackView), so revealing it is purely
// client-side state.
function QuestionCard({ question, index }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="surface-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#7c3aed", background: "rgba(124,58,237,0.1)", padding: "2px 8px", borderRadius: 6 }}>
          {QUESTION_TYPE_LABELS[question.question_type] || question.question_type}
        </span>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--olive-700)", background: "var(--bg-2)", padding: "2px 8px", borderRadius: 6 }}>
          {question.difficulty}
        </span>
      </div>
      <div style={{ fontWeight: 700, marginBottom: 12, color: "var(--text-hard)" }}>
        {index + 1}. {question.question_text}
      </div>
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="ghost-button"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: revealed ? 12 : 0 }}
      >
        {revealed ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {revealed ? "Hide Answer" : "Show Answer"}
      </button>
      {revealed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 14, borderRadius: 10, background: "var(--bg-1)", border: "1px solid var(--border-soft)" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", marginBottom: 6 }}>Answer</div>
            <div style={{ whiteSpace: "pre-wrap", color: "var(--text-hard)" }}>{question.answer}</div>
          </div>
          {question.follow_up_question && (
            <div style={{ padding: 14, borderRadius: 10, background: "var(--bg-1)", border: "1px solid var(--border-soft)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", marginBottom: 6 }}>Follow-up</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{question.follow_up_question}</div>
              {question.follow_up_answer && <div style={{ whiteSpace: "pre-wrap", color: "var(--text-hard)" }}>{question.follow_up_answer}</div>}
            </div>
          )}
          {(question.tools_technologies || question.key_concepts || question.source_reference) && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-soft)", display: "flex", flexDirection: "column", gap: 4 }}>
              {question.tools_technologies && <div><strong>Tools/Technologies:</strong> {question.tools_technologies}</div>}
              {question.key_concepts && <div><strong>Key Concepts:</strong> {question.key_concepts}</div>}
              {question.source_reference && <div><strong>Source:</strong> {question.source_reference}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FolderSection({ folder }) {
  const [open, setOpen] = useState(false);
  const count = sumFolderQuestions(folder);
  return (
    <div className="surface-card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Folder size={16} style={{ color: "#d97706" }} />
        <div style={{ flex: 1, fontWeight: 800, color: "var(--text-hard)" }}>{folder.title}</div>
        {count > 0 && <span style={{ fontSize: "0.72rem", color: "#7c3aed", fontWeight: 700 }}>{count} question{count > 1 ? "s" : ""}</span>}
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          <FolderMediaGrid media={folder.media} />
          {(folder.questions || []).map((q, i) => <QuestionCard key={q.id} question={q} index={i} />)}
          {(folder.subfolders || []).map((sf) => <FolderSection key={sf.id} folder={sf} />)}
        </div>
      )}
    </div>
  );
}

function TopicDetailView({ trackLabel, topic, onBack }) {
  const hasContent = (topic.questions || []).length > 0 || (topic.folders || []).length > 0;
  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <button type="button" onClick={onBack} className="ghost-button" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, width: "fit-content" }}>
          <ChevronLeft size={16} /> {trackLabel}
        </button>
        <div>
          <p className="kicker">Interview Practice</p>
          <h1>{topic.title}</h1>
        </div>
      </section>

      {(topic.questions || []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {topic.questions.map((q, i) => <QuestionCard key={q.id} question={q} index={i} />)}
        </div>
      )}

      {(topic.folders || []).length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
            <Folder size={16} style={{ color: "#d97706" }} /> Folders
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topic.folders.map((folder) => <FolderSection key={folder.id} folder={folder} />)}
          </div>
        </div>
      )}

      {!hasContent && (
        <div className="surface-card" style={{ padding: 48, textAlign: "center", color: "var(--text-soft)" }}>
          No questions in this topic yet.
        </div>
      )}
    </div>
  );
}

export default function InterviewPracticePage() {
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTopicId, setActiveTopicId] = useState(null);

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

  const openTopic = (topicId) => {
    window.history.pushState({ interviewPractice: "topic", topicId }, "");
    setActiveTopicId(topicId);
  };

  // Browser/mouse Back support for the topic-list <-> topic-detail
  // drill-down — same pushState/popstate pattern CompetitivePracticePage
  // uses one level deeper (exam -> topic -> subtopic).
  useEffect(() => {
    function handlePopState(e) {
      const s = e.state;
      if (!s || s.interviewPractice !== "topic") {
        setActiveTopicId(null);
        return;
      }
      setActiveTopicId(s.topicId);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "var(--text-soft)" }}>
        <Loader2 size={20} className="spin" style={{ marginRight: 10 }} /> Loading your track…
      </div>
    );
  }

  if (error) {
    return <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-soft)" }}>{error}</div>;
  }

  const activeTopic = (track.topics || []).find((t) => t.id === activeTopicId);
  if (activeTopic) {
    return <TopicDetailView trackLabel={`${track.track_label} Track`} topic={activeTopic} onBack={() => window.history.back()} />;
  }

  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Placement Prep</p>
          <h1>Interview Practice</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          {track.track_label} track — interview questions for the {track.department} department.
        </p>
      </section>

      {(track.topics || []).length === 0 ? (
        <div className="surface-card" style={{ padding: 48, textAlign: "center", color: "var(--text-soft)" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px",
            background: "var(--bg-2)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Mic size={26} className="text-olive-600" />
          </div>
          Questions for this track are coming soon.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {track.topics.map((topic) => {
            const count = topicTotalQuestions(topic);
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => openTopic(topic.id)}
                className="surface-card"
                style={{ textAlign: "left", cursor: "pointer", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ fontWeight: 800, color: "var(--text-hard)" }}>{topic.title}</div>
                {count > 0 && <div style={{ fontSize: "0.75rem", color: "#7c3aed", fontWeight: 700 }}>{count} question{count > 1 ? "s" : ""}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
