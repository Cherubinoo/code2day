import React, { useState, useEffect } from "react";
import { Swords, ChevronLeft, ChevronDown, ChevronRight, Link2, Loader2, BookOpen, Code2, ExternalLink, CheckCircle2, XCircle, FileText, Folder, PlayCircle } from "lucide-react";
import { getYoutubeEmbedUrl, getMediaKind, buildJsonPostOptions } from "../../../lib/appUtils";
import CompetitiveProblemWorkspace from "./CompetitiveProblemWorkspace";
import MediaViewerModal from "../../common/MediaViewerModal";

const OPTION_LETTERS = ["A", "B", "C", "D"];

function QuestionCard({ question, index }) {
  const [selected, setSelected] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const answer = async (letter) => {
    if (result || submitting) return;
    setSelected(letter);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/competitive/questions/${question.id}/submit/`, buildJsonPostOptions({ selected_option: letter }));
      if (res.ok) setResult(await res.json());
    } finally {
      setSubmitting(false);
    }
  };

  const embedUrl = question.video_url ? getYoutubeEmbedUrl(question.video_url) : null;

  return (
    <div className="surface-card" style={{ padding: 20 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, color: "var(--text-hard)" }}>
        {index + 1}. {question.question_text}
      </div>
      {question.question_image && (
        <img src={question.question_image} alt="" style={{ maxWidth: "100%", borderRadius: 10, marginBottom: 12, display: "block" }} />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {OPTION_LETTERS.map((letter) => {
          const optionText = question[`option_${letter.toLowerCase()}`];
          const isSelected = selected === letter;
          const isCorrectAnswer = result && result.correct_option === letter;
          const isWrongSelected = result && isSelected && !result.is_correct;
          return (
            <button
              key={letter}
              type="button"
              onClick={() => answer(letter)}
              disabled={!!result}
              style={{
                textAlign: "left", padding: "10px 14px", borderRadius: 10, cursor: result ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", fontWeight: 600,
                border: isCorrectAnswer ? "1px solid #10b981" : isWrongSelected ? "1px solid #ef4444" : "1px solid var(--border-soft)",
                background: isCorrectAnswer ? "#f0fdf4" : isWrongSelected ? "#fef2f2" : "white",
                color: "var(--text-hard)",
              }}
            >
              <span style={{ fontWeight: 800, color: "var(--text-soft)" }}>{letter}</span>
              <span style={{ flex: 1 }}>{optionText}</span>
              {isCorrectAnswer && <CheckCircle2 size={16} style={{ color: "#10b981" }} />}
              {isWrongSelected && <XCircle size={16} style={{ color: "#ef4444" }} />}
            </button>
          );
        })}
      </div>

      {result && (
        <div style={{ marginTop: 14, padding: 14, borderRadius: 10, background: "var(--bg-2)" }}>
          <div style={{ fontWeight: 800, marginBottom: result.explanation || embedUrl ? 8 : 0, color: result.is_correct ? "#059669" : "#dc2626" }}>
            {result.is_correct ? "Correct!" : `Incorrect — correct answer is ${result.correct_option}`}
          </div>
          {result.explanation && <p style={{ margin: embedUrl ? "0 0 12px" : 0, color: "var(--text-soft)", fontSize: "0.88rem" }}>{result.explanation}</p>}
          {embedUrl && (
            <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
              <iframe
                src={embedUrl}
                title="Explanation video"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionsPractice({ subtopicId, folderId }) {
  const [questions, setQuestions] = useState(null);

  useEffect(() => {
    const url = `/api/competitive/subtopics/${subtopicId}/questions/${folderId ? `?folder_id=${folderId}` : ""}`;
    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then(setQuestions)
      .catch(() => setQuestions([]));
  }, [subtopicId, folderId]);

  if (questions === null) {
    return <div style={{ textAlign: "center", padding: 40, color: "var(--text-soft)" }}><Loader2 size={24} className="spin" /></div>;
  }
  if (questions.length === 0) return null;

  return (
    <div>
      <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Practice Questions</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {questions.map((q, i) => <QuestionCard key={q.id} question={q} index={i} />)}
      </div>
    </div>
  );
}

function ResourceCard({ item, onOpenProblem }) {
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
      <button
        type="button"
        onClick={() => onOpenProblem?.(item.problem_slug)}
        className="surface-card resource-card"
        style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, textDecoration: "none", border: "none", cursor: "pointer", width: "100%", textAlign: "left" }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#e0f2fe", color: "#0891b2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Code2 size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "#0891b2", textTransform: "uppercase", letterSpacing: "0.04em" }}>Coding Problem · {item.problem_difficulty}</div>
          <div style={{ fontWeight: 700, color: "var(--text-hard)" }}>{item.label || item.problem_title}</div>
        </div>
        <ExternalLink size={14} style={{ color: "var(--text-soft)", flexShrink: 0 }} />
      </button>
    );
  }

  // type === "link" — smart-rendered by what the URL actually is
  const kind = getMediaKind(item.url);

  if (kind === "youtube") {
    const embedUrl = getYoutubeEmbedUrl(item.url);
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

  if (kind === "image") {
    return (
      <div className="surface-card" style={{ padding: 16 }}>
        {item.label && <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text-hard)" }}>{item.label}</div>}
        <img src={item.url} alt={item.label || ""} style={{ width: "100%", borderRadius: 12, display: "block" }} />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="surface-card" style={{ padding: 16 }}>
        {item.label && <div style={{ fontWeight: 700, marginBottom: 10, color: "var(--text-hard)" }}>{item.label}</div>}
        <video src={item.url} controls style={{ width: "100%", borderRadius: 12, display: "block" }} />
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

function FolderSection({ subtopicId, folder, onOpenProblem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="surface-card" style={{ padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", padding: "14px 18px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, color: "var(--text-hard)" }}>{folder.title}</div>
          {folder.description && <div style={{ fontSize: "0.8rem", color: "var(--text-soft)", marginTop: 2 }}>{folder.description}</div>}
        </div>
        {folder.question_count > 0 && (
          <span style={{ fontSize: "0.72rem", color: "#7c3aed", fontWeight: 700 }}>{folder.question_count} question{folder.question_count > 1 ? "s" : ""}</span>
        )}
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          <FolderMediaGrid media={folder.media} />
          {(folder.resource_links || []).length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
              {folder.resource_links.map((item, i) => <ResourceCard key={i} item={item} onOpenProblem={onOpenProblem} />)}
            </div>
          )}
          <QuestionsPractice subtopicId={subtopicId} folderId={folder.id} />
        </div>
      )}
    </div>
  );
}

function TopicLearnView({ examName, section, topic, onOpenSubtopic, onOpenProblem, onBack }) {
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {topic.subtopics.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => onOpenSubtopic(st)}
              className="surface-card"
              style={{ textAlign: "left", cursor: "pointer", padding: "14px 16px", fontSize: "0.85rem", fontWeight: 700 }}
            >
              {st.title}
              {st.question_count > 0 && (
                <div style={{ fontSize: "0.72rem", color: "#7c3aed", fontWeight: 700, marginTop: 4 }}>{st.question_count} question{st.question_count > 1 ? "s" : ""}</div>
              )}
              {(st.folders || []).length > 0 && (
                <div style={{ fontSize: "0.72rem", color: "#d97706", fontWeight: 700, marginTop: 2 }}>{st.folders.length} folder{st.folders.length > 1 ? "s" : ""}</div>
              )}
              {(st.description || (st.resource_links || []).length > 0) && (
                <div style={{ fontSize: "0.72rem", color: "var(--text-soft)", fontWeight: 600, marginTop: 4 }}>Learn more →</div>
              )}
            </button>
          ))}
        </div>
      )}

      {(topic.resource_links || []).length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Resources</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {topic.resource_links.map((item, i) => <ResourceCard key={i} item={item} onOpenProblem={onOpenProblem} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function SubtopicLearnView({ examName, topicTitle, subtopic, onOpenProblem, onBack }) {
  return (
    <div className="page-stack problem-page">
      <section className="page-header compact-header problem-page-header">
        <button
          type="button"
          onClick={onBack}
          className="ghost-button"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 12, width: "fit-content" }}
        >
          <ChevronLeft size={16} /> {topicTitle}
        </button>
        <div>
          <p className="kicker">{examName}</p>
          <h1>{subtopic.title}</h1>
        </div>
        {subtopic.description && (
          <p style={{ color: "var(--text-soft)", margin: 0 }}>{subtopic.description}</p>
        )}
      </section>

      <QuestionsPractice subtopicId={subtopic.id} />

      {(subtopic.folders || []).length > 0 && (
        <div>
          <h3 style={{ margin: "0 0 12px", fontSize: "1rem", display: "flex", alignItems: "center", gap: 8 }}>
            <Folder size={16} style={{ color: "#d97706" }} /> Folders
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {subtopic.folders.map((folder) => (
              <FolderSection key={folder.id} subtopicId={subtopic.id} folder={folder} onOpenProblem={onOpenProblem} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>Resources</h3>
        {(subtopic.resource_links || []).length === 0 ? (
          <div className="surface-card" style={{ padding: 48, textAlign: "center", color: "var(--text-soft)" }}>
            Resources for this subtopic are coming soon.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {subtopic.resource_links.map((item, i) => <ResourceCard key={i} item={item} onOpenProblem={onOpenProblem} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CompetitivePracticePage({ dashboard }) {
  const [examinations, setExaminations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedExam, setSelectedExam] = useState(null);
  const [syllabus, setSyllabus] = useState(null);
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [activeTopic, setActiveTopic] = useState(null); // { section, topic }
  const [activeSubtopic, setActiveSubtopic] = useState(null); // syllabus subtopic object
  const [activeProblemSlug, setActiveProblemSlug] = useState(null); // embedded coding workspace

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

  // Browser/mouse Back support for the exam -> topic -> subtopic
  // drill-down. Each level pushes a history entry carrying just enough to
  // restore it (never changing the pathname, so the app's top-level
  // router — which only cares about the path — stays untouched and
  // doesn't fight with this). Back/forward then just replays these
  // states via popstate instead of leaving the page entirely.
  const fetchSyllabusFor = (examId) => {
    setSyllabusLoading(true);
    return fetch(`/api/competitive/examinations/${examId}/syllabus/`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setSyllabus(data);
        setExpandedSections(Object.fromEntries((data?.sections || []).map((s) => [s.id, true])));
        return data;
      })
      .finally(() => setSyllabusLoading(false));
  };

  const openExam = (exam) => {
    window.history.pushState({ competitivePractice: "exam", examId: exam.id }, "");
    setSelectedExam(exam);
    setActiveTopic(null);
    setActiveSubtopic(null);
    setActiveProblemSlug(null);
    fetchSyllabusFor(exam.id);
  };

  const openTopic = (section, topic) => {
    window.history.pushState(
      { competitivePractice: "topic", examId: selectedExam.id, sectionId: section.id, topicId: topic.id },
      "",
    );
    setActiveTopic({ section, topic });
    setActiveSubtopic(null);
    setActiveProblemSlug(null);
  };

  const openSubtopic = (subtopic) => {
    window.history.pushState(
      {
        competitivePractice: "subtopic", examId: selectedExam.id,
        sectionId: activeTopic.section.id, topicId: activeTopic.topic.id, subtopicId: subtopic.id,
      },
      "",
    );
    setActiveSubtopic(subtopic);
    setActiveProblemSlug(null);
  };

  // Opens a "Programming" resource's coding workspace inline, layered on
  // top of whatever topic/subtopic view is currently showing — carries that
  // same state forward in the pushed entry so Back closes the workspace
  // back to exactly where it was opened from, not further up the tree.
  const openProblem = (slug) => {
    window.history.pushState(
      {
        competitivePractice: "problem", examId: selectedExam.id,
        sectionId: activeTopic?.section?.id, topicId: activeTopic?.topic?.id, subtopicId: activeSubtopic?.id,
        problemSlug: slug,
      },
      "",
    );
    setActiveProblemSlug(slug);
  };

  useEffect(() => {
    function handlePopState(e) {
      const s = e.state;

      if (!s || !s.competitivePractice) {
        // Popped back out past the exam list itself — nothing left of
        // ours to restore.
        setSelectedExam(null);
        setSyllabus(null);
        setActiveTopic(null);
        setActiveSubtopic(null);
        setActiveProblemSlug(null);
        return;
      }

      const exam = examinations.find((x) => x.id === s.examId);
      if (!exam) return; // stale state from a previous session — ignore

      const restore = (data) => {
        setSelectedExam(exam);
        // "problem" carries whichever of section/topic/subtopic were active
        // when it was opened — restore those the same way "topic"/"subtopic"
        // do, then layer the workspace back on top.
        setActiveProblemSlug(s.competitivePractice === "problem" ? s.problemSlug : null);
        if (s.competitivePractice === "exam") {
          setActiveTopic(null);
          setActiveSubtopic(null);
          return;
        }
        const section = (data?.sections || []).find((sec) => sec.id === s.sectionId);
        const topic = section?.topics.find((t) => t.id === s.topicId);
        if (!section || !topic) { setActiveTopic(null); setActiveSubtopic(null); return; }
        setActiveTopic({ section, topic });
        if (s.competitivePractice === "subtopic" || (s.competitivePractice === "problem" && s.subtopicId)) {
          const subtopic = topic.subtopics.find((st) => st.id === s.subtopicId);
          setActiveSubtopic(subtopic || null);
        } else {
          setActiveSubtopic(null);
        }
      };

      if (syllabus && selectedExam?.id === exam.id) {
        restore(syllabus);
      } else {
        fetchSyllabusFor(exam.id).then(restore);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [examinations, syllabus, selectedExam]);

  if (selectedExam && activeProblemSlug) {
    return (
      <CompetitiveProblemWorkspace
        problemSlug={activeProblemSlug}
        dashboard={dashboard}
        onBack={() => window.history.back()}
      />
    );
  }

  if (selectedExam && activeTopic && activeSubtopic) {
    return (
      <SubtopicLearnView
        examName={selectedExam.name}
        topicTitle={activeTopic.topic.title}
        subtopic={activeSubtopic}
        onOpenProblem={openProblem}
        onBack={() => window.history.back()}
      />
    );
  }

  if (selectedExam && activeTopic) {
    return (
      <TopicLearnView
        examName={selectedExam.name}
        section={activeTopic.section}
        topic={activeTopic.topic}
        onOpenSubtopic={openSubtopic}
        onOpenProblem={openProblem}
        onBack={() => window.history.back()}
      />
    );
  }

  if (selectedExam) {
    return (
      <div className="page-stack problem-page">
        <section className="page-header compact-header problem-page-header">
          <button
            type="button"
            onClick={() => window.history.back()}
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
                        onClick={() => openTopic(section, topic)}
                        style={{
                          textAlign: "left", padding: 16, borderRadius: 14, border: "1px solid var(--border-soft)",
                          background: "var(--bg-2)", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Link2 size={14} style={{ color: "var(--olive-600)", flexShrink: 0 }} />
                          <span style={{ fontWeight: 750, fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic.title}</span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-soft)", fontWeight: 700 }}>
                          {topic.subtopics.length} subtopic{topic.subtopics.length !== 1 ? "s" : ""}
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
