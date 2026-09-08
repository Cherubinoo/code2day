import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Mic, ChevronLeft, ChevronDown, ChevronRight, Loader2, Folder, FileText, Link2, PlayCircle,
  LayoutGrid, List, RotateCcw, Check, PartyPopper, Eye,
} from "lucide-react";
import MediaViewerModal from "../../common/MediaViewerModal";
import { buildJsonPostOptions } from "../../../lib/appUtils";

const QUESTION_TYPE_LABELS = {
  conceptual: "Conceptual", technical: "Technical", scenario: "Scenario-Based", tool: "Tool-Based",
  troubleshooting: "Troubleshooting", comparison: "Comparison", process: "Process / Procedure", behavioral: "Behavioral / Experience",
};

const DIFFICULTY_COLORS = { Beginner: "#16a34a", Intermediate: "#d97706", Advanced: "#dc2626" };

// A folder's own questions plus every subfolder's, all the way down — same
// recursive-count idea as the admin Interview Bank view.
function sumFolderQuestions(folder) {
  return (folder.questions || []).length + (folder.subfolders || []).reduce((acc, f) => acc + sumFolderQuestions(f), 0);
}
function topicTotalQuestions(topic) {
  return (topic.questions || []).length + (topic.folders || []).reduce((acc, f) => acc + sumFolderQuestions(f), 0);
}

// Every question under a topic, top-level and nested inside folders,
// flattened into one linear list — the deck Practice Mode swipes through.
// Mirrors the backend's _flatten_interview_topic_questions so the two
// never quietly disagree about what's "in" a topic.
function flattenFolderQuestions(folder) {
  return [...(folder.questions || []), ...(folder.subfolders || []).flatMap(flattenFolderQuestions)];
}
function flattenTopicQuestions(topic) {
  return [...(topic.questions || []), ...(topic.folders || []).flatMap(flattenFolderQuestions)];
}

function FolderMediaGrid({ media }) {
  const [viewerMedia, setViewerMedia] = useState(null);
  if (!media || media.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16, marginBottom: 16 }}>
      {media.map((m) => (
        <div key={m.id} onClick={() => setViewerMedia(m)} style={{ cursor: "pointer" }}>
          <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-soft)", background: "var(--bg-2)" }}>
            {m.kind === "image" ? (
              <img src={m.url} alt={m.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : m.kind === "video" ? (
              <>
                <video src={m.url} preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PlayCircle size={28} color="white" />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {m.kind === "pdf" ? <FileText size={30} style={{ color: "#0891b2" }} /> : <Link2 size={30} style={{ color: "var(--text-soft)" }} />}
              </div>
            )}
          </div>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-hard)", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
        </div>
      ))}
      {viewerMedia && <MediaViewerModal media={viewerMedia} onClose={() => setViewerMedia(null)} />}
    </div>
  );
}

// Self-study card — no submit/scoring, the backend already sends the full
// answer up front (see InterviewTrackView), so revealing it is purely
// client-side state. `progressStatus` (from the swipe deck) shows as a
// small badge so the same question reads consistently in list view too.
function QuestionCard({ question, index, progressStatus }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="surface-card" style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#7c3aed", background: "rgba(124,58,237,0.1)", padding: "2px 8px", borderRadius: 6 }}>
          {QUESTION_TYPE_LABELS[question.question_type] || question.question_type}
        </span>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--olive-700)", background: "var(--bg-2)", padding: "2px 8px", borderRadius: 6 }}>
          {question.difficulty}
        </span>
        {progressStatus === "learned" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.68rem", fontWeight: 800, color: "#15803d", background: "#f0fdf4", padding: "2px 8px", borderRadius: 6 }}>
            <Check size={11} /> Learned
          </span>
        )}
        {progressStatus === "review_again" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "0.68rem", fontWeight: 800, color: "#b45309", background: "#fffbeb", padding: "2px 8px", borderRadius: 6 }}>
            <RotateCcw size={11} /> Review again
          </span>
        )}
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

function FolderSection({ folder, progressMap }) {
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
          {(folder.questions || []).map((q, i) => <QuestionCard key={q.id} question={q} index={i} progressStatus={progressMap[q.id]} />)}
          {(folder.subfolders || []).map((sf) => <FolderSection key={sf.id} folder={sf} progressMap={progressMap} />)}
        </div>
      )}
    </div>
  );
}

// ── Practice Mode: a gamified, swipeable card deck ─────────────────────
// Push/click left = "Review Again" (stays in rotation), push/click right =
// "Learned" (retired). A real drag gesture is supported via pointer events
// for the "swipe" feel; the two buttons are the accessible, no-drag-needed
// equivalent of the same action.
const SWIPE_COMMIT_PX = 110;

function PracticeCard({ question, onDecide, revealed, onReveal, dragX, onDragStart, dragging }) {
  const rotate = dragX / 18;
  const rightGlow = Math.max(0, Math.min(1, dragX / SWIPE_COMMIT_PX));
  const leftGlow = Math.max(0, Math.min(1, -dragX / SWIPE_COMMIT_PX));

  return (
    <div
      onPointerDown={onDragStart}
      className="surface-card"
      style={{
        padding: 24, minHeight: 280, position: "relative", touchAction: "pan-y",
        cursor: dragging ? "grabbing" : "grab", userSelect: "none",
        transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
        transition: dragging ? "none" : "transform 0.25s ease",
        boxShadow: rightGlow > 0.05
          ? `0 0 0 2px rgba(22,163,74,${rightGlow})`
          : leftGlow > 0.05
          ? `0 0 0 2px rgba(217,119,6,${leftGlow})`
          : undefined,
      }}
    >
      {rightGlow > 0.15 && (
        <div style={{ position: "absolute", top: 16, right: 16, fontWeight: 900, fontSize: "0.85rem", color: "#16a34a", opacity: rightGlow, display: "flex", alignItems: "center", gap: 4 }}>
          <Check size={16} /> LEARNED
        </div>
      )}
      {leftGlow > 0.15 && (
        <div style={{ position: "absolute", top: 16, left: 16, fontWeight: 900, fontSize: "0.85rem", color: "#d97706", opacity: leftGlow, display: "flex", alignItems: "center", gap: 4 }}>
          <RotateCcw size={16} /> REVIEW
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "#7c3aed", background: "rgba(124,58,237,0.1)", padding: "2px 8px", borderRadius: 6 }}>
          {QUESTION_TYPE_LABELS[question.question_type] || question.question_type}
        </span>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, color: DIFFICULTY_COLORS[question.difficulty] || "var(--olive-700)", background: "var(--bg-2)", padding: "2px 8px", borderRadius: 6 }}>
          {question.difficulty}
        </span>
      </div>

      <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--text-hard)", marginBottom: 16, lineHeight: 1.4 }}>
        {question.question_text}
      </div>

      {revealed ? (
        <div style={{ padding: 14, borderRadius: 10, background: "var(--bg-1)", border: "1px solid var(--border-soft)" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", marginBottom: 6 }}>Answer</div>
          <div style={{ whiteSpace: "pre-wrap", color: "var(--text-hard)" }}>{question.answer}</div>
          {question.follow_up_question && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--border-soft)" }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{question.follow_up_question}</div>
              {question.follow_up_answer && <div style={{ whiteSpace: "pre-wrap", color: "var(--text-hard)", fontSize: "0.9rem" }}>{question.follow_up_answer}</div>}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={onReveal}
          className="ghost-button"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <Eye size={14} /> Show Answer
        </button>
      )}
    </div>
  );
}

function PracticeDeck({ topic, progressMap, onSwipe }) {
  const allQuestions = useMemo(() => flattenTopicQuestions(topic), [topic]);
  // A fresh pass through the deck excludes anything already marked
  // "learned" from a previous session — "review_again" and never-swiped
  // questions both stay in rotation. "Practice again" (below) resets this
  // local queue without touching what's saved server-side.
  const buildQueue = () => allQuestions.filter((q) => progressMap[q.id] !== "learned").map((q) => q.id);
  const [queue, setQueue] = useState(buildQueue);
  const [revealed, setRevealed] = useState(false);
  const [dragX, setDragX] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const [sessionLearned, setSessionLearned] = useState(0);
  const [sessionReview, setSessionReview] = useState(0);

  useEffect(() => {
    setQueue(buildQueue());
    setRevealed(false);
    setDragX(0);
    setSessionLearned(0);
    setSessionReview(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id]);

  const currentId = queue[0];
  const current = allQuestions.find((q) => q.id === currentId);
  const totalInTopic = allQuestions.length;

  const commit = (decision) => {
    if (!current) return;
    onSwipe(current.id, decision);
    if (decision === "learned") setSessionLearned((n) => n + 1);
    else setSessionReview((n) => n + 1);
    setQueue((prev) => prev.slice(1));
    setRevealed(false);
    setDragX(0);
  };

  const handlePointerDown = (e) => {
    dragging.current = true;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (!dragging.current) return;
    setDragX(e.clientX - startX.current);
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX >= SWIPE_COMMIT_PX) commit("learned");
    else if (dragX <= -SWIPE_COMMIT_PX) commit("review_again");
    else setDragX(0);
  };

  const practiceAgain = () => {
    setQueue(allQuestions.map((q) => q.id));
    setRevealed(false);
    setSessionLearned(0);
    setSessionReview(0);
  };

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-soft)" }}>
          {queue.length} left in this pass · {totalInTopic} total in topic
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: "0.78rem", fontWeight: 800 }}>
          <span style={{ color: "#16a34a", display: "inline-flex", alignItems: "center", gap: 3 }}><Check size={13} /> {sessionLearned}</span>
          <span style={{ color: "#d97706", display: "inline-flex", alignItems: "center", gap: 3 }}><RotateCcw size={13} /> {sessionReview}</span>
        </div>
      </div>

      {current ? (
        <>
          <PracticeCard
            question={current}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            dragX={dragX}
            dragging={dragging.current}
            onDragStart={handlePointerDown}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button
              type="button"
              onClick={() => commit("review_again")}
              style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", fontWeight: 800, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <RotateCcw size={16} /> Review Again
            </button>
            <button
              type="button"
              onClick={() => commit("learned")}
              className="primary-button"
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <Check size={16} /> Learned
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: "0.72rem", color: "var(--text-soft)", marginTop: 10 }}>
            Drag the card, or use the buttons — left to keep reviewing, right once it's learned.
          </div>
        </>
      ) : (
        <div className="surface-card" style={{ padding: 40, textAlign: "center" }}>
          <PartyPopper size={32} style={{ color: "#d97706", marginBottom: 10 }} />
          <div style={{ fontWeight: 800, color: "var(--text-hard)", marginBottom: 6 }}>
            {totalInTopic === 0 ? "No questions in this topic yet." : "You're all caught up on this topic!"}
          </div>
          {totalInTopic > 0 && (
            <button type="button" onClick={practiceAgain} className="ghost-button" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <RotateCcw size={14} /> Practice Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TopicDetailView({ trackLabel, topic, onBack }) {
  const hasContent = (topic.questions || []).length > 0 || (topic.folders || []).length > 0;
  const totalQuestions = topicTotalQuestions(topic);

  // Progress lives here (not inside PracticeDeck) so switching to List Mode
  // still shows accurate "Learned"/"Review again" badges on every card.
  const [progressMap, setProgressMap] = useState(() => {
    const map = {};
    for (const q of flattenTopicQuestions(topic)) {
      if (q.progress_status) map[q.id] = q.progress_status;
    }
    return map;
  });
  const [mode, setMode] = useState(totalQuestions > 0 ? "practice" : "list");

  const handleSwipe = (questionId, decision) => {
    setProgressMap((prev) => ({ ...prev, [questionId]: decision }));
    fetch(`/api/interview/questions/${questionId}/swipe/`, buildJsonPostOptions({ status: decision })).catch(() => {
      // Best-effort — a failed sync just means this one decision doesn't
      // persist; the deck itself already moved on locally.
    });
  };

  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <button type="button" onClick={onBack} className="ghost-button" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, width: "fit-content" }}>
          <ChevronLeft size={16} /> {trackLabel}
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <p className="kicker">Interview Practice</p>
            <h1>{topic.title}</h1>
          </div>
          {totalQuestions > 0 && (
            <div style={{ display: "flex", background: "var(--bg-2)", borderRadius: 10, padding: 3, gap: 2 }}>
              <button
                type="button"
                onClick={() => setMode("practice")}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 800, background: mode === "practice" ? "white" : "transparent", color: mode === "practice" ? "var(--olive-900)" : "var(--text-soft)", boxShadow: mode === "practice" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
              >
                <LayoutGrid size={14} /> Practice Cards
              </button>
              <button
                type="button"
                onClick={() => setMode("list")}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "0.78rem", fontWeight: 800, background: mode === "list" ? "white" : "transparent", color: mode === "list" ? "var(--olive-900)" : "var(--text-soft)", boxShadow: mode === "list" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
              >
                <List size={14} /> Browse List
              </button>
            </div>
          )}
        </div>
      </section>

      {!hasContent && (
        <div className="surface-card" style={{ padding: 48, textAlign: "center", color: "var(--text-soft)" }}>
          No questions in this topic yet.
        </div>
      )}

      {hasContent && mode === "practice" && (
        <PracticeDeck topic={topic} progressMap={progressMap} onSwipe={handleSwipe} />
      )}

      {hasContent && mode === "list" && (
        <>
          {(topic.questions || []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: (topic.folders || []).length > 0 ? 20 : 0 }}>
              {topic.questions.map((q, i) => <QuestionCard key={q.id} question={q} index={i} progressStatus={progressMap[q.id]} />)}
            </div>
          )}

          {(topic.folders || []).length > 0 && (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
                <Folder size={16} style={{ color: "#d97706" }} /> Folders
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {topic.folders.map((folder) => <FolderSection key={folder.id} folder={folder} progressMap={progressMap} />)}
              </div>
            </div>
          )}
        </>
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
