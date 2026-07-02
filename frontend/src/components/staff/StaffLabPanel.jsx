import { useState, useEffect } from "react";
import { getCsrfToken } from "../../lib/appUtils";
import {
  FlaskConical, ChevronLeft, Plus, Users, Calendar, BookOpen,
  CheckCircle2, Circle, Pencil, Trash2, X, Save, Clock, UserCheck,
  Search, TrendingUp,
} from "lucide-react";

function apiFetch(url, method, body) {
  const token = getCsrfToken();
  const opts = { method, credentials: "include", headers: { "Content-Type": "application/json" } };
  if (token) opts.headers["X-CSRFToken"] = token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(url, opts);
}

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function fmtDT(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

function useCountdown(end) {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    function calc() {
      const diff = new Date(end) - new Date();
      if (diff <= 0) { setTxt("Expired"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const d = Math.floor(h / 24);
      if (d > 0) setTxt(`${d}d ${h % 24}h left`);
      else if (h > 0) setTxt(`${h}h ${m}m left`);
      else setTxt(`${m}m left`);
    }
    calc();
    const t = setInterval(calc, 30000);
    return () => clearInterval(t);
  }, [end]);
  return txt;
}

// ─── Lab list card ────────────────────────────────────────────────────────────
function LabCard({ lab, onClick }) {
  const countdown = useCountdown(lab.end_date);
  const expired = lab.is_expired;
  return (
    <div className={`slp2-card${expired ? " expired" : ""}`} onClick={() => onClick(lab)}>
      <div className={`slp2-card-stripe${expired ? " expired" : ""}`} />
      <div className="slp2-card-body">
        <div className="slp2-card-top">
          <span className="slp2-card-name">{lab.name}</span>
          <span className={`slp2-badge${expired ? " expired" : " active"}`}>
            <Clock size={9} /> {countdown}
          </span>
        </div>
        <div className="slp2-card-chips">
          <span className="slp2-chip"><Users size={10} /> {lab.batch}</span>
          {lab.section && <span className="slp2-chip">§ {lab.section}</span>}
          <span className="slp2-chip"><BookOpen size={10} /> {lab.exercise_count} exercises</span>
        </div>
        <div className="slp2-card-dates">
          <Calendar size={11} />
          <span>{fmt(lab.start_date)}</span>
          <span className="slp2-sep">→</span>
          <span>{fmt(lab.end_date)}</span>
        </div>
        <div className="slp2-card-view">View Lab →</div>
      </div>
    </div>
  );
}

// ─── Exercise template helpers ────────────────────────────────────────────────
const BLANK_TEMPLATE = {
  problem: "",
  examples: [{ input: "", output: "", explanation: "" }],
  constraints: [""],
  difficulty: "Medium",
  hint: "",
};

function compileDescription(f) {
  const parts = [];
  if (f.problem.trim()) parts.push(f.problem.trim());
  const exs = f.examples.filter((e) => e.input.trim() || e.output.trim());
  if (exs.length) {
    parts.push("\nExamples:");
    exs.forEach((e) => {
      if (e.input.trim()) parts.push(`  Input:  ${e.input.trim()}`);
      if (e.output.trim()) parts.push(`  Output: ${e.output.trim()}`);
      if (e.explanation.trim()) parts.push(`  Explanation: ${e.explanation.trim()}`);
    });
  }
  const cs = f.constraints.filter((c) => c.trim());
  if (cs.length) {
    parts.push("\nConstraints:");
    cs.forEach((c) => parts.push(`  - ${c.trim()}`));
  }
  if (f.difficulty) parts.push(`\nDifficulty: ${f.difficulty}`);
  if (f.hint.trim()) parts.push(`\nHint: ${f.hint.trim()}`);
  return parts.join("\n");
}

function parseDescription(text) {
  if (!text) return { ...BLANK_TEMPLATE, examples: [{ input: "", output: "", explanation: "" }], constraints: [""] };
  const lines = text.split("\n");
  const result = { problem: "", examples: [], constraints: [], difficulty: "Medium", hint: "" };
  let section = "problem";
  const problemLines = [];
  let curEx = null;

  for (const line of lines) {
    const t = line.trim();
    if (t === "Examples:") { section = "examples"; curEx = { input: "", output: "", explanation: "" }; continue; }
    if (t === "Constraints:") {
      if (curEx) { result.examples.push(curEx); curEx = null; }
      section = "constraints"; continue;
    }
    const diffMatch = t.match(/^Difficulty:\s*(.*)/);
    if (diffMatch) { result.difficulty = diffMatch[1].trim() || "Medium"; continue; }
    const hintMatch = t.match(/^Hint:\s*(.*)/);
    if (hintMatch) { result.hint = hintMatch[1].trim(); continue; }

    if (section === "problem") {
      problemLines.push(line);
    } else if (section === "examples") {
      const im = line.match(/^\s*Input:\s*(.*)/);
      const om = line.match(/^\s*Output:\s*(.*)/);
      const em = line.match(/^\s*Explanation:\s*(.*)/);
      if (im) {
        if (curEx && curEx.input) { result.examples.push(curEx); curEx = { input: "", output: "", explanation: "" }; }
        if (curEx) curEx.input = im[1];
      } else if (om && curEx) {
        curEx.output = om[1];
      } else if (em && curEx) {
        curEx.explanation = em[1];
      }
    } else if (section === "constraints") {
      const c = t.replace(/^-\s*/, "").trim();
      if (c) result.constraints.push(c);
    }
  }
  if (curEx) result.examples.push(curEx);
  result.problem = problemLines.join("\n").trim();
  if (!result.examples.length) result.examples = [{ input: "", output: "", explanation: "" }];
  if (!result.constraints.length) result.constraints = [""];
  return result;
}

// ─── Add / Edit exercise form ─────────────────────────────────────────────────
function ExerciseForm({ labId, exercise, onSaved, onCancel }) {
  const editing = !!exercise;
  const [title, setTitle] = useState(exercise?.title ?? "");
  const [fields, setFields] = useState(() => parseDescription(exercise?.description ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function setEx(idx, key, val) {
    setFields((f) => {
      const exs = f.examples.map((e, i) => i === idx ? { ...e, [key]: val } : e);
      return { ...f, examples: exs };
    });
  }
  function addEx() { setFields((f) => ({ ...f, examples: [...f.examples, { input: "", output: "", explanation: "" }] })); }
  function removeEx(idx) { setFields((f) => ({ ...f, examples: f.examples.filter((_, i) => i !== idx) || [{ input: "", output: "", explanation: "" }] })); }
  function setConstraint(idx, val) { setFields((f) => { const cs = f.constraints.map((c, i) => i === idx ? val : c); return { ...f, constraints: cs }; }); }
  function addConstraint() { setFields((f) => ({ ...f, constraints: [...f.constraints, ""] })); }
  function removeConstraint(idx) { setFields((f) => ({ ...f, constraints: f.constraints.filter((_, i) => i !== idx).length ? f.constraints.filter((_, i) => i !== idx) : [""] })); }

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) { setErr("Title is required"); return; }
    if (!fields.problem.trim()) { setErr("Problem Statement is required"); return; }
    setBusy(true); setErr("");
    try {
      const url = editing
        ? `/api/lab/v2/${labId}/exercises/${exercise.id}/`
        : `/api/lab/v2/${labId}/exercises/`;
      const res = await apiFetch(url, editing ? "PUT" : "POST", {
        title: title.trim(),
        description: compileDescription(fields),
      });
      if (!res.ok) { setErr("Save failed"); return; }
      onSaved(await res.json(), editing);
    } catch { setErr("Network error"); }
    finally { setBusy(false); }
  }

  const DIFF = ["Easy", "Medium", "Hard"];

  return (
    <form className="slp2-ex-form" onSubmit={submit}>
      {/* Title */}
      <div className="slp2-form-field">
        <label className="slp2-form-label">Exercise Title *</label>
        <input className="slp2-input" placeholder="e.g. Reverse a Linked List"
          value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {/* Problem Statement */}
      <div className="slp2-form-field">
        <label className="slp2-form-label">Problem Statement *</label>
        <textarea className="slp2-textarea" rows={5}
          placeholder="Write a program to…"
          value={fields.problem}
          onChange={(e) => setFields((f) => ({ ...f, problem: e.target.value }))} />
      </div>

      {/* Examples */}
      <div className="slp2-form-field">
        <label className="slp2-form-label">Examples</label>
        <div className="slp2-ex-blocks">
          {fields.examples.map((ex, idx) => (
            <div key={idx} className="slp2-ex-block">
              <div className="slp2-ex-block-hdr">
                <span className="slp2-ex-block-label">Example {idx + 1}</span>
                {fields.examples.length > 1 && (
                  <button type="button" className="slp2-icon-btn danger" onClick={() => removeEx(idx)}><X size={12} /></button>
                )}
              </div>
              <div className="slp2-ex-row">
                <label className="slp2-mini-label">Input</label>
                <input className="slp2-input" placeholder="e.g. arr = [1, 2, 3]"
                  value={ex.input} onChange={(e) => setEx(idx, "input", e.target.value)} />
              </div>
              <div className="slp2-ex-row">
                <label className="slp2-mini-label">Output</label>
                <input className="slp2-input" placeholder="e.g. 6"
                  value={ex.output} onChange={(e) => setEx(idx, "output", e.target.value)} />
              </div>
              <div className="slp2-ex-row">
                <label className="slp2-mini-label">Explanation</label>
                <input className="slp2-input" placeholder="Optional explanation…"
                  value={ex.explanation} onChange={(e) => setEx(idx, "explanation", e.target.value)} />
              </div>
            </div>
          ))}
          <button type="button" className="slp2-add-row-btn" onClick={addEx}>
            <Plus size={12} /> Add Example
          </button>
        </div>
      </div>

      {/* Constraints */}
      <div className="slp2-form-field">
        <label className="slp2-form-label">Constraints</label>
        <div className="slp2-constraints">
          {fields.constraints.map((c, idx) => (
            <div key={idx} className="slp2-constraint-row">
              <span className="slp2-constraint-bullet">—</span>
              <input className="slp2-input" placeholder="e.g. 1 ≤ n ≤ 1000"
                value={c} onChange={(e) => setConstraint(idx, e.target.value)} />
              {fields.constraints.length > 1 && (
                <button type="button" className="slp2-icon-btn danger" onClick={() => removeConstraint(idx)}><X size={12} /></button>
              )}
            </div>
          ))}
          <button type="button" className="slp2-add-row-btn" onClick={addConstraint}>
            <Plus size={12} /> Add Constraint
          </button>
        </div>
      </div>

      {/* Difficulty */}
      <div className="slp2-form-field">
        <label className="slp2-form-label">Difficulty</label>
        <div className="slp2-diff-pills">
          {DIFF.map((d) => (
            <button key={d} type="button"
              className={`slp2-diff-pill${d === "Easy" ? " easy" : d === "Hard" ? " hard" : " medium"}${fields.difficulty === d ? " active" : ""}`}
              onClick={() => setFields((f) => ({ ...f, difficulty: d }))}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Hint */}
      <div className="slp2-form-field">
        <label className="slp2-form-label">Hint <span style={{ fontWeight: 400, color: "var(--text-soft)" }}>(optional)</span></label>
        <input className="slp2-input" placeholder="A clue or approach hint for students…"
          value={fields.hint} onChange={(e) => setFields((f) => ({ ...f, hint: e.target.value }))} />
      </div>

      {err && <p className="slp2-error">{err}</p>}
      <div className="slp2-form-actions">
        <button type="button" className="slp2-btn-ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="slp2-btn-primary" disabled={busy}>
          <Save size={14} /> {busy ? "Saving…" : editing ? "Save Changes" : "Add Exercise"}
        </button>
      </div>
    </form>
  );
}

// ─── Student completion table ─────────────────────────────────────────────────
function StudentTable({ students, exercises, activeExIdx }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  if (!exercises.length) {
    return <div className="slp2-empty-msg">No exercises added yet.</div>;
  }

  const ex = exercises[activeExIdx];
  const rows = students.map((s) => {
    const stat = s.exercises[activeExIdx] ?? {};
    return { ...s, completed: stat.completed, submitted_at: stat.submitted_at, language: stat.language };
  });

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.student_name.toLowerCase().includes(q) || r.register_number.toLowerCase().includes(q);
    const matchFilter =
      filter === "all" ? true :
      filter === "done" ? r.completed :
      !r.completed;
    return matchSearch && matchFilter;
  });

  const doneCount = rows.filter((r) => r.completed).length;
  const pct = rows.length ? Math.round((doneCount / rows.length) * 100) : 0;

  return (
    <div className="slp2-student-section">
      {/* Stats bar */}
      <div className="slp2-sub-stats">
        <div className="slp2-sub-stat done">
          <CheckCircle2 size={14} />
          <span className="slp2-sub-n">{doneCount}</span> Completed
        </div>
        <div className="slp2-sub-stat pending">
          <Circle size={14} />
          <span className="slp2-sub-n">{rows.length - doneCount}</span> Pending
        </div>
        <div className="slp2-rate-bar-wrap">
          <div className="slp2-rate-bar">
            <div className="slp2-rate-fill" style={{ width: `${pct}%` }} />
          </div>
          <span>{pct}%</span>
        </div>
      </div>

      {/* Search + filter */}
      <div className="slp2-toolbar">
        <div className="slp2-search-wrap">
          <Search size={13} />
          <input className="slp2-search" placeholder="Search by name or reg. no…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="slp2-filter-pills">
          {[["all", "All"], ["done", "Completed"], ["pending", "Not Done"]].map(([k, l]) => (
            <button key={k} type="button"
              className={`slp2-filter-pill${filter === k ? " active" : ""}`}
              onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <span className="slp2-count">{filtered.length} / {rows.length}</span>
      </div>

      {/* Table */}
      <div className="slp2-table-wrap">
        <table className="slp2-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Student</th>
              <th>Reg. No.</th>
              <th>Section</th>
              <th>Status</th>
              <th>Language</th>
              <th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.student_id} className={r.completed ? "slp2-row-done" : ""}>
                <td className="slp2-td-idx">{i + 1}</td>
                <td className="slp2-td-name">{r.student_name}</td>
                <td className="slp2-td-reg">{r.register_number || "—"}</td>
                <td>{r.section || "—"}</td>
                <td>
                  {r.completed
                    ? <span className="slp2-done-badge"><CheckCircle2 size={11} /> Done</span>
                    : <span className="slp2-pending-badge"><Circle size={11} /> Pending</span>}
                </td>
                <td className="slp2-td-mono">{r.language || "—"}</td>
                <td className="slp2-td-time">{r.submitted_at ? fmtDT(r.submitted_at) : "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="slp2-empty-row">No students match this filter</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Lab detail page ──────────────────────────────────────────────────────────
function LabDetail({ lab: initLab, onBack }) {
  const [lab, setLab] = useState(initLab);
  const [exercises, setExercises] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingEx, setLoadingEx] = useState(true);
  const [loadingSt, setLoadingSt] = useState(true);
  const [activeEx, setActiveEx] = useState(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editExercise, setEditExercise] = useState(null);
  const [delEx, setDelEx] = useState(null);
  const [tab, setTab] = useState("exercises"); // "exercises" | "students"

  useEffect(() => {
    fetchExercises();
    fetchStudents();
  }, [lab.id]);

  async function fetchExercises() {
    setLoadingEx(true);
    const res = await fetch(`/api/lab/v2/${lab.id}/exercises/`, { credentials: "include" });
    if (res.ok) { const d = await res.json(); setExercises(d.exercises ?? []); }
    setLoadingEx(false);
  }

  async function fetchStudents() {
    setLoadingSt(true);
    const res = await fetch(`/api/lab/v2/${lab.id}/students/`, { credentials: "include" });
    if (res.ok) { const d = await res.json(); setStudents(d.students ?? []); }
    setLoadingSt(false);
  }

  function onExSaved(ex, isEdit) {
    if (isEdit) {
      setExercises((prev) => prev.map((e) => e.id === ex.id ? ex : e));
    } else {
      setExercises((prev) => [...prev, ex]);
      setActiveEx(exercises.length);
    }
    setShowAddForm(false);
    setEditExercise(null);
    fetchStudents();
  }

  async function deleteExercise(ex) {
    const res = await apiFetch(`/api/lab/v2/${lab.id}/exercises/${ex.id}/`, "DELETE");
    if (res.ok) {
      setExercises((prev) => prev.filter((e) => e.id !== ex.id));
      setDelEx(null);
      setActiveEx((i) => Math.max(0, i - 1));
      fetchStudents();
    }
  }

  const activeExercise = exercises[activeEx];

  return (
    <div className="slp2-detail">
      <button type="button" className="slp2-back" onClick={onBack}><ChevronLeft size={15} /> All Labs</button>

      {/* Header */}
      <div className="slp2-detail-hdr">
        <div>
          <h2 className="slp2-detail-title">{lab.name}</h2>
          <p className="slp2-detail-meta">
            Batch {lab.batch}{lab.section ? ` · §${lab.section}` : ""}
            {" · "}{fmt(lab.start_date)} → {fmt(lab.end_date)}
          </p>
        </div>
        <div className="slp2-detail-stats">
          <span className="slp2-chip"><BookOpen size={10} /> {exercises.length} exercises</span>
          <span className="slp2-chip"><Users size={10} /> {students.length} students</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="slp2-tabs">
        <button type="button" className={`slp2-tab${tab === "exercises" ? " active" : ""}`}
          onClick={() => setTab("exercises")}>Exercises</button>
        <button type="button" className={`slp2-tab${tab === "students" ? " active" : ""}`}
          onClick={() => setTab("students")}>Student Submissions</button>
      </div>

      {/* ── EXERCISES TAB ── */}
      {tab === "exercises" && (
        <div className="slp2-ex-panel">
          <div className="slp2-ex-toolbar">
            <span className="slp2-ex-count">{exercises.length} exercise{exercises.length !== 1 ? "s" : ""}</span>
            <button type="button" className="slp2-btn-primary"
              onClick={() => { setShowAddForm(true); setEditExercise(null); }}>
              <Plus size={14} /> Add Exercise
            </button>
          </div>

          {(showAddForm || editExercise) && (
            <ExerciseForm
              labId={lab.id}
              exercise={editExercise}
              onSaved={onExSaved}
              onCancel={() => { setShowAddForm(false); setEditExercise(null); }}
            />
          )}

          {loadingEx ? (
            <div className="slp2-loading">Loading exercises…</div>
          ) : exercises.length === 0 && !showAddForm ? (
            <div className="slp2-empty">
              <BookOpen size={36} />
              <p>No exercises yet. Add your first exercise above.</p>
            </div>
          ) : (
            <div className="slp2-ex-list">
              {exercises.map((ex, i) => (
                <div key={ex.id} className="slp2-ex-item">
                  <div className="slp2-ex-num">{i + 1}</div>
                  <div className="slp2-ex-content">
                    <div className="slp2-ex-title">{ex.title}</div>
                    {ex.description && (
                      <div className="slp2-ex-desc">{ex.description.slice(0, 120)}{ex.description.length > 120 ? "…" : ""}</div>
                    )}
                    <div className="slp2-ex-meta">
                      {ex.submission_count !== null && (
                        <span className="slp2-chip"><CheckCircle2 size={9} /> {ex.submission_count} submitted</span>
                      )}
                    </div>
                  </div>
                  <div className="slp2-ex-actions">
                    <button type="button" className="slp2-icon-btn"
                      onClick={() => { setEditExercise(ex); setShowAddForm(false); }}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" className="slp2-icon-btn danger" onClick={() => setDelEx(ex)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── STUDENTS TAB ── */}
      {tab === "students" && (
        <div className="slp2-students-panel">
          {exercises.length > 0 && (
            <div className="slp2-ex-selector">
              <span className="slp2-ex-sel-label">Exercise:</span>
              {exercises.map((ex, i) => {
                const done = students.filter((s) => s.exercises[i]?.completed).length;
                return (
                  <button key={ex.id} type="button"
                    className={`slp2-ex-sel-btn${activeEx === i ? " active" : ""}`}
                    onClick={() => setActiveEx(i)}>
                    {ex.title}
                    <span className="slp2-ex-sel-stat">{done}/{students.length}</span>
                  </button>
                );
              })}
            </div>
          )}

          {loadingSt ? (
            <div className="slp2-loading">Loading students…</div>
          ) : (
            <StudentTable students={students} exercises={exercises} activeExIdx={activeEx} />
          )}
        </div>
      )}

      {/* Delete exercise confirm */}
      {delEx && (
        <>
          <div className="hlc2-overlay" onClick={() => setDelEx(null)} />
          <div className="hlc2-confirm">
            <Trash2 size={26} />
            <h3>Delete Exercise?</h3>
            <p><strong>{delEx.title}</strong> and all student submissions will be deleted.</p>
            <div className="hlc2-confirm-btns">
              <button type="button" className="hlc2-btn-ghost" onClick={() => setDelEx(null)}>Cancel</button>
              <button type="button" className="hlc2-btn-danger" onClick={() => deleteExercise(delEx)}>Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function StaffLabPanel() {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch("/api/lab/v2/staff/", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setLabs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (selected) return <LabDetail lab={selected} onBack={() => setSelected(null)} />;

  if (loading) return <div className="slp2-loading-page">Loading labs…</div>;

  const active = labs.filter((l) => !l.is_expired);
  const expired = labs.filter((l) => l.is_expired);

  return (
    <div className="slp2-root">
      <div className="slp2-page-head">
        <div className="slp2-page-title"><FlaskConical size={20} /> Lab</div>
        <div className="slp2-head-stats">
          <span className="slp2-hstat"><TrendingUp size={13} /> {active.length} active</span>
          <span className="slp2-hstat"><BookOpen size={13} /> {labs.length} total</span>
        </div>
      </div>

      {labs.length === 0 ? (
        <div className="slp2-empty-page">
          <FlaskConical size={48} />
          <h3>No labs assigned</h3>
          <p>Labs assigned to you by the HOD will appear here.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="slp2-section">
              <div className="slp2-section-label">Active</div>
              <div className="slp2-list">
                {active.map((l) => <LabCard key={l.id} lab={l} onClick={setSelected} />)}
              </div>
            </section>
          )}
          {expired.length > 0 && (
            <section className="slp2-section">
              <div className="slp2-section-label">Expired</div>
              <div className="slp2-list">
                {expired.map((l) => <LabCard key={l.id} lab={l} onClick={setSelected} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
