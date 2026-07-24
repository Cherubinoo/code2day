import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { getCsrfToken } from "../../lib/appUtils";
import {
  FlaskConical, ChevronLeft, Plus, Users, Calendar, BookOpen,
  CheckCircle2, Circle, Pencil, Trash2, X, Save, Clock, UserCheck,
  Search, TrendingUp, Upload, Download, AlertTriangle, Loader2,
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
          {lab.lab_type === "company" && lab.company && (
            <span className="slp2-chip company">🏢 {lab.company.name}</span>
          )}
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
  if (f.difficulty) parts.push(`\nDifficulty: ${f.difficulty}`);
  if (f.hint.trim()) parts.push(`\nHint: ${f.hint.trim()}`);
  return parts.join("\n");
}

function parseDescription(text) {
  if (!text) return { ...BLANK_TEMPLATE, examples: [{ input: "", output: "", explanation: "" }] };
  const lines = text.split("\n");
  const result = { problem: "", examples: [], difficulty: "Medium", hint: "" };
  let section = "problem";
  const problemLines = [];
  let curEx = null;

  for (const line of lines) {
    const t = line.trim();
    if (t === "Examples:") { section = "examples"; curEx = { input: "", output: "", explanation: "" }; continue; }
    if (t === "Constraints:") {
      // Legacy exercises may still have a Constraints section in their stored
      // description — skip over it so it doesn't get parsed into the problem text.
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
    }
    // section === "constraints": intentionally dropped, not shown anywhere anymore.
  }
  if (curEx) result.examples.push(curEx);
  result.problem = problemLines.join("\n").trim();
  if (!result.examples.length) result.examples = [{ input: "", output: "", explanation: "" }];
  return result;
}

// ─── Bulk import (CSV) helpers ────────────────────────────────────────────────
const BULK_HEADERS = [
  "title", "problem_statement", "example_input", "example_output",
  "example_explanation", "difficulty", "hint",
];

function csvEscape(field) {
  const s = String(field ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

// Minimal RFC-4180 parser: handles quoted fields, escaped quotes, and
// commas/newlines inside quotes (so multi-line problem statements survive).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === ',') { row.push(field); field = ""; continue; }
    if (char === '\r') { continue; }
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

function downloadCsv(rows, filename) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadBulkTemplate() {
  const sample = [
    "Reverse a Linked List",
    "Write a program to reverse a singly linked list in place.",
    "1 -> 2 -> 3 -> NULL",
    "3 -> 2 -> 1 -> NULL",
    "The list is reversed by relinking each node's next pointer.",
    "Medium",
    "Track previous, current, and next pointers as you walk the list.",
  ];
  downloadCsv([BULK_HEADERS, sample], "lab_exercises_template.csv");
}

// ─── Bulk import (CSV) helpers: test cases ────────────────────────────────────
// A separate file from the questions template — rows are matched to an
// exercise by its exact title (case-insensitive), so one exercise can have
// several test-case rows.
const TESTCASE_BULK_HEADERS = ["title", "stdin", "expected_output", "is_sample"];

function downloadTestCaseTemplate() {
  const rows = [
    TESTCASE_BULK_HEADERS,
    ["Reverse a Linked List", "1 -> 2 -> 3 -> NULL", "3 -> 2 -> 1 -> NULL", "yes"],
    ["Reverse a Linked List", "5 -> NULL", "5 -> NULL", "no"],
  ];
  downloadCsv(rows, "lab_test_cases_template.csv");
}

// Converts parsed CSV rows into {title, description} payloads, reusing the
// same compileDescription() format the manual Add-Exercise form produces.
// Spreadsheet cells can come back as numbers, booleans, undefined, etc.
// (especially from XLSX) — always coerce to a trimmed string before use.
function cellStr(row, idx) {
  if (idx === -1 || !row) return "";
  const v = row[idx];
  return v === undefined || v === null ? "" : String(v).trim();
}

// Header cells are matched loosely so a staff member's own spreadsheet (not
// necessarily downloaded from the template) still works: underscores/hyphens
// are treated as spaces, and each logical column accepts common synonyms.
function normalizeHeader(h) {
  return String(h ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

const COLUMN_ALIASES = {
  title: ["title", "exercise title", "name", "problem title"],
  problem_statement: ["problem statement", "description", "statement", "question", "problem"],
  example_input: ["example input", "sample input", "input"],
  example_output: ["example output", "sample output", "output"],
  example_explanation: ["example explanation", "explanation"],
  difficulty: ["difficulty", "level"],
  hint: ["hint", "hints"],
};

function findColumn(header, key, aliasMap = COLUMN_ALIASES) {
  for (const alias of aliasMap[key]) {
    const idx = header.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

const TESTCASE_COLUMN_ALIASES = {
  title: ["title", "exercise title", "name", "problem title"],
  stdin: ["stdin", "input", "test input"],
  expected_output: ["expected output", "output", "expected"],
  is_sample: ["is sample", "sample", "visible"],
};

// Loosely-truthy parse for the "is_sample" cell — spreadsheets return all
// kinds of representations (string, boolean, number) depending on format.
function parseBoolCell(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return ["yes", "y", "true", "1"].includes(s);
}

function rowsToTestCases(rows) {
  if (!rows.length) {
    return { test_cases: [], errors: [], headerError: "This file has no rows." };
  }
  const header = rows[0].map(normalizeHeader);
  const iTitle = findColumn(header, "title", TESTCASE_COLUMN_ALIASES);
  const iStdin = findColumn(header, "stdin", TESTCASE_COLUMN_ALIASES);
  const iExpected = findColumn(header, "expected_output", TESTCASE_COLUMN_ALIASES);
  const iSample = findColumn(header, "is_sample", TESTCASE_COLUMN_ALIASES);

  if (iTitle === -1 || iExpected === -1) {
    return {
      test_cases: [],
      errors: [],
      headerError: "Couldn't find a title/expected-output column in the header row. Download the template to see the expected format.",
    };
  }

  const test_cases = [];
  const errors = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const title = cellStr(row, iTitle);
    const expected_output = cellStr(row, iExpected);
    if (!title && !expected_output) continue; // blank row
    if (!title) { errors.push({ row: r + 1, error: "Missing exercise title" }); continue; }
    if (!expected_output) { errors.push({ row: r + 1, error: "Missing expected output" }); continue; }

    test_cases.push({
      title,
      stdin: cellStr(row, iStdin),
      expected_output,
      is_sample: iSample !== -1 ? parseBoolCell(row[iSample]) : false,
    });
  }
  return { test_cases, errors, headerError: null };
}

function rowsToExercises(rows) {
  if (!rows.length) {
    return { exercises: [], errors: [], headerError: "This file has no rows." };
  }
  const header = rows[0].map(normalizeHeader);
  const iTitle = findColumn(header, "title");
  const iProblem = findColumn(header, "problem_statement");
  const iExIn = findColumn(header, "example_input");
  const iExOut = findColumn(header, "example_output");
  const iExExp = findColumn(header, "example_explanation");
  const iDifficulty = findColumn(header, "difficulty");
  const iHint = findColumn(header, "hint");

  if (iTitle === -1 || iProblem === -1) {
    return {
      exercises: [],
      errors: [],
      headerError: "Couldn't find a title/problem-statement column in the header row. Download the template to see the expected format.",
    };
  }

  const exercises = [];
  const errors = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const title = cellStr(row, iTitle);
    const problem = cellStr(row, iProblem);
    if (!title && !problem) continue; // blank row
    if (!title) { errors.push({ row: r + 1, error: "Missing title" }); continue; }
    if (!problem) { errors.push({ row: r + 1, error: "Missing problem statement" }); continue; }

    const difficultyRaw = cellStr(row, iDifficulty);
    const difficulty = ["Easy", "Medium", "Hard"].includes(difficultyRaw) ? difficultyRaw : "Medium";

    const fields = {
      problem,
      examples: [{
        input: cellStr(row, iExIn),
        output: cellStr(row, iExOut),
        explanation: cellStr(row, iExExp),
      }],
      difficulty,
      hint: cellStr(row, iHint),
    };

    exercises.push({ title, description: compileDescription(fields) });
  }
  return { exercises, errors, headerError: null };
}

// Parses a File (.csv or .xlsx/.xls) into a 2D array of cell strings.
function parseSpreadsheetFile(file) {
  const isExcel = /\.xlsx?$/i.test(file.name);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    if (isExcel) {
      reader.onload = () => {
        try {
          const workbook = XLSX.read(reader.result, { type: "array", cellDates: true });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          // raw: false returns each cell's displayed text (respecting its number/date
          // format) instead of the underlying value — Excel silently coerces things like
          // "5-10" or "1/2" typed into example/constraint cells into date serial numbers,
          // and raw values would surface those meaningless numbers instead of the text.
          const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, blankrows: false, defval: "", raw: false });
          resolve(rows);
        } catch {
          reject(new Error("Could not parse this Excel file. Make sure it's a valid .xlsx/.xls workbook."));
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = () => resolve(parseCsv(String(reader.result ?? "")));
      reader.readAsText(file);
    }
  });
}

// ─── Add / Edit exercise form ─────────────────────────────────────────────────
const blankTestCase = (order = 0) => ({
  stdin: "",
  expected_output: "",
  is_sample: false,
  order,
});

function TestCaseEditor({ labId, exerciseId, refreshKey, onCountChange }) {
  const [cases, setCases] = useState([]);
  const [newCase, setNewCase] = useState(() => blankTestCase());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState({});
  const [msg, setMsg] = useState("");

  async function loadCases() {
    setLoading(true); setMsg("");
    try {
      const res = await fetch(`/api/lab/v2/${labId}/exercises/${exerciseId}/test-cases/`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error || "Could not load test cases."); return; }
      const rows = data.test_cases ?? [];
      setCases(rows);
      setNewCase(blankTestCase(rows.length));
      onCountChange?.(rows.length);
    } catch {
      setMsg("Network error while loading test cases.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (exerciseId) loadCases();
  }, [exerciseId, refreshKey]);

  function updateCase(id, key, value) {
    setCases((prev) => prev.map((tc) => tc.id === id ? { ...tc, [key]: value } : tc));
  }

  async function saveCase(tc) {
    if (!String(tc.expected_output || "").trim()) { setMsg("Expected output is required."); return; }
    setSaving((s) => ({ ...s, [tc.id]: true })); setMsg("");
    try {
      const res = await apiFetch(`/api/lab/v2/${labId}/exercises/${exerciseId}/test-cases/${tc.id}/`, "PUT", {
        stdin: tc.stdin,
        expected_output: tc.expected_output,
        is_sample: tc.is_sample,
        order: Number(tc.order) || 0,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error || "Save failed."); return; }
      setCases((prev) => prev.map((row) => row.id === tc.id ? data : row));
      setMsg("Test case saved.");
    } catch {
      setMsg("Network error while saving.");
    } finally {
      setSaving((s) => ({ ...s, [tc.id]: false }));
    }
  }

  async function addCase() {
    if (!String(newCase.expected_output || "").trim()) { setMsg("Expected output is required."); return; }
    setSaving((s) => ({ ...s, new: true })); setMsg("");
    try {
      const res = await apiFetch(`/api/lab/v2/${labId}/exercises/${exerciseId}/test-cases/`, "POST", {
        ...newCase,
        order: Number(newCase.order) || cases.length,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error || "Could not add test case."); return; }
      const rows = [...cases, data];
      setCases(rows);
      setNewCase(blankTestCase(rows.length));
      onCountChange?.(rows.length);
      setMsg("Test case added.");
    } catch {
      setMsg("Network error while adding.");
    } finally {
      setSaving((s) => ({ ...s, new: false }));
    }
  }

  async function deleteCase(tc) {
    setSaving((s) => ({ ...s, [tc.id]: true })); setMsg("");
    try {
      const res = await apiFetch(`/api/lab/v2/${labId}/exercises/${exerciseId}/test-cases/${tc.id}/`, "DELETE");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(data.error || "Delete failed.");
        return;
      }
      const rows = cases.filter((row) => row.id !== tc.id);
      setCases(rows);
      setNewCase((prev) => ({ ...prev, order: rows.length }));
      onCountChange?.(rows.length);
      setMsg("Test case deleted.");
    } catch {
      setMsg("Network error while deleting.");
    } finally {
      setSaving((s) => ({ ...s, [tc.id]: false }));
    }
  }

  return (
    <div className="slp2-tc-editor">
      <div className="slp2-tc-head">
        <span>{cases.length} editable test case{cases.length !== 1 ? "s" : ""}</span>
        <button type="button" className="slp2-btn-ghost" onClick={loadCases} disabled={loading}>
          {loading ? <Loader2 size={13} className="spin" /> : <Search size={13} />}
          Refresh
        </button>
      </div>

      {cases.map((tc, idx) => (
        <div key={tc.id} className="slp2-tc-card">
          <div className="slp2-tc-card-head">
            <strong>Test Case {idx + 1}</strong>
            <label className="slp2-check-label">
              <input type="checkbox" checked={!!tc.is_sample} onChange={(e) => updateCase(tc.id, "is_sample", e.target.checked)} />
              Sample
            </label>
          </div>
          <label className="slp2-mini-label">Input</label>
          <textarea className="slp2-textarea slp2-tc-area" rows={3} value={tc.stdin} onChange={(e) => updateCase(tc.id, "stdin", e.target.value)} />
          <label className="slp2-mini-label">Expected Output *</label>
          <textarea className="slp2-textarea slp2-tc-area" rows={3} value={tc.expected_output} onChange={(e) => updateCase(tc.id, "expected_output", e.target.value)} />
          <div className="slp2-tc-actions">
            <label className="slp2-order-label">Order
              <input className="slp2-order-input" type="number" min="0" value={tc.order} onChange={(e) => updateCase(tc.id, "order", e.target.value)} />
            </label>
            <button type="button" className="slp2-btn-ghost" disabled={!!saving[tc.id]} onClick={() => saveCase(tc)}>
              {saving[tc.id] ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
              Save
            </button>
            <button type="button" className="slp2-icon-btn danger" disabled={!!saving[tc.id]} onClick={() => deleteCase(tc)}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      <div className="slp2-tc-card new">
        <div className="slp2-tc-card-head"><strong>Add Test Case</strong></div>
        <label className="slp2-mini-label">Input</label>
        <textarea className="slp2-textarea slp2-tc-area" rows={3} value={newCase.stdin} onChange={(e) => setNewCase((tc) => ({ ...tc, stdin: e.target.value }))} />
        <label className="slp2-mini-label">Expected Output *</label>
        <textarea className="slp2-textarea slp2-tc-area" rows={3} value={newCase.expected_output} onChange={(e) => setNewCase((tc) => ({ ...tc, expected_output: e.target.value }))} />
        <div className="slp2-tc-actions">
          <label className="slp2-check-label">
            <input type="checkbox" checked={!!newCase.is_sample} onChange={(e) => setNewCase((tc) => ({ ...tc, is_sample: e.target.checked }))} />
            Sample
          </label>
          <label className="slp2-order-label">Order
            <input className="slp2-order-input" type="number" min="0" value={newCase.order} onChange={(e) => setNewCase((tc) => ({ ...tc, order: e.target.value }))} />
          </label>
          <button type="button" className="slp2-btn-primary" disabled={!!saving.new} onClick={addCase}>
            {saving.new ? <Loader2 size={13} className="spin" /> : <Plus size={13} />}
            Add Test Case
          </button>
        </div>
      </div>

      {msg && <p className={/error|failed|required|could not/i.test(msg) ? "slp2-error" : "slp2-tc-msg"}>{msg}</p>}
    </div>
  );
}

function ExerciseForm({ labId, exercise, onSaved, onCancel }) {
  const editing = !!exercise;
  const [title, setTitle] = useState(exercise?.title ?? "");
  const [fields, setFields] = useState(() => parseDescription(exercise?.description ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  const [genCount, setGenCount] = useState(exercise?.test_case_count ?? null);
  const [explanation, setExplanation] = useState(exercise?.explanation ?? "");
  const [tcRefreshKey, setTcRefreshKey] = useState(0);

  useEffect(() => {
    if (exercise) {
      setTitle(exercise.title ?? "");
      setFields(parseDescription(exercise.description ?? ""));
      setGenCount(exercise.test_case_count ?? null);
      setExplanation(exercise.explanation ?? "");
    }
  }, [exercise]);

  async function generateTestCases(force) {
    setGenBusy(true); setGenMsg("");
    const body = force ? { force: true } : {};

    // Test cases and the explanation are independent LLM calls — fire both
    // at once instead of waiting for one before starting the other.
    const [tcOutcome, expOutcome] = await Promise.all([
      apiFetch(`/api/lab/v2/${labId}/exercises/${exercise.id}/generate-test-cases/`, "POST", body)
        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
        .catch(() => ({ ok: false, data: null, networkError: true })),
      apiFetch(`/api/lab/v2/${labId}/exercises/${exercise.id}/generate-explanation/`, "POST", body)
        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
        .catch(() => ({ ok: false, data: null, networkError: true })),
    ]);

    const messages = [];
    if (tcOutcome.ok) {
      setGenCount(tcOutcome.data.test_cases?.length ?? tcOutcome.data.generated_count ?? 0);
      messages.push(`Generated ${tcOutcome.data.generated_count} test case(s).`);
      // Generation also backfills the Hint/Examples lines in the
      // description when they were missing — re-parse so the form fields
      // pick up whatever it added instead of showing stale (empty) ones.
      if (tcOutcome.data.description) {
        setFields(parseDescription(tcOutcome.data.description));
      }
      setTcRefreshKey((key) => key + 1);
    } else {
      messages.push(`Test cases: ${tcOutcome.networkError ? "network error." : (tcOutcome.data?.error || "failed.")}`);
    }
    if (expOutcome.ok) {
      setExplanation(expOutcome.data.explanation);
      messages.push("Explanation generated.");
    } else {
      messages.push(`Explanation: ${expOutcome.networkError ? "network error." : (expOutcome.data?.error || "failed.")}`);
    }
    setGenMsg(messages.join(" "));
    setGenBusy(false);
  }

  function setEx(idx, key, val) {
    setFields((f) => {
      const exs = f.examples.map((e, i) => i === idx ? { ...e, [key]: val } : e);
      return { ...f, examples: exs };
    });
  }
  function addEx() { setFields((f) => ({ ...f, examples: [...f.examples, { input: "", output: "", explanation: "" }] })); }
  function removeEx(idx) { setFields((f) => ({ ...f, examples: f.examples.filter((_, i) => i !== idx) || [{ input: "", output: "", explanation: "" }] })); }

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

      {/* Test case + explanation generation (only available once the exercise exists) */}
      {editing && (
        <div className="slp2-form-field">
          <label className="slp2-form-label">Test Cases &amp; Explanation</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="slp2-btn-ghost"
              disabled={genBusy}
              onClick={() => generateTestCases(genCount > 0)}
            >
              {genBusy ? <Loader2 size={14} className="spin" /> : <FlaskConical size={14} />}
              {genBusy ? "Generating…" : genCount > 0 ? "Regenerate" : "Generate"}
            </button>
            {genCount > 0 && <span style={{ fontSize: 12, color: "var(--text-soft)" }}>{genCount} test case(s) on file</span>}
            {genMsg && <span style={{ fontSize: 12, color: /failed|error/i.test(genMsg) ? "#dc2626" : "var(--easy, #4f8b62)" }}>{genMsg}</span>}
          </div>
          {explanation && (
            <p className="formatted-explanation" style={{ marginTop: 8, fontSize: 12, color: "var(--text-soft)", fontStyle: "italic" }}>{explanation}</p>
          )}
          <TestCaseEditor
            labId={labId}
            exerciseId={exercise.id}
            refreshKey={tcRefreshKey}
            onCountChange={setGenCount}
          />
        </div>
      )}

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

// ─── Bulk import modal (CSV) ──────────────────────────────────────────────────
function BulkImportModal({ labId, onImported, onClose }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState([]);
  const [parseErrors, setParseErrors] = useState([]);
  const [headerError, setHeaderError] = useState("");
  const [reading, setReading] = useState(false);

  const [tcFileName, setTcFileName] = useState("");
  const [tcParsed, setTcParsed] = useState([]);
  const [tcParseErrors, setTcParseErrors] = useState([]);
  const [tcHeaderError, setTcHeaderError] = useState("");
  const [tcReading, setTcReading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [resultMsg, setResultMsg] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErr(""); setResultMsg(""); setParsed([]); setParseErrors([]); setHeaderError("");
    setReading(true);
    try {
      const rows = await parseSpreadsheetFile(file);
      const { exercises, errors, headerError: hdrErr } = rowsToExercises(rows);
      if (hdrErr) {
        setHeaderError(hdrErr);
      } else if (!exercises.length) {
        setErr("No exercise rows found in this file — check that rows below the header aren't all blank.");
      } else {
        setParsed(exercises);
        setParseErrors(errors);
      }
    } catch (parseErr) {
      setErr(parseErr.message || "Could not read this file.");
    } finally {
      setReading(false);
    }
  }

  async function handleTcFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTcFileName(file.name);
    setErr(""); setResultMsg(""); setTcParsed([]); setTcParseErrors([]); setTcHeaderError("");
    setTcReading(true);
    try {
      const rows = await parseSpreadsheetFile(file);
      const { test_cases, errors, headerError: hdrErr } = rowsToTestCases(rows);
      if (hdrErr) {
        setTcHeaderError(hdrErr);
      } else if (!test_cases.length) {
        setErr("No test-case rows found in this file — check that rows below the header aren't all blank.");
      } else {
        setTcParsed(test_cases);
        setTcParseErrors(errors);
      }
    } catch (parseErr) {
      setErr(parseErr.message || "Could not read this file.");
    } finally {
      setTcReading(false);
    }
  }

  async function doImport() {
    if (!parsed.length && !tcParsed.length) return;
    setBusy(true); setErr(""); setResultMsg("");
    try {
      const res = await apiFetch(`/api/lab/v2/${labId}/exercises/bulk/`, "POST", {
        exercises: parsed, test_cases: tcParsed,
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Import failed — please try again."); return; }

      const parts = [];
      if (parsed.length) {
        parts.push(
          `${data.created_count} exercise${data.created_count !== 1 ? "s" : ""}` +
          (data.skipped_count ? ` (${data.skipped_count} skipped)` : "")
        );
      }
      if (tcParsed.length) {
        parts.push(
          `${data.test_cases_created_count} test case${data.test_cases_created_count !== 1 ? "s" : ""}` +
          (data.test_cases_skipped_count ? ` (${data.test_cases_skipped_count} skipped)` : "")
        );
      }
      setResultMsg(`Success — imported ${parts.join(" and ")}.`);
      if (data.test_case_errors?.length) {
        setErr(
          `${data.test_case_errors.length} test-case row${data.test_case_errors.length !== 1 ? "s" : ""} skipped: ` +
          data.test_case_errors.slice(0, 3).map((e) => `Row ${e.row} (${e.error})`).join(", ") +
          (data.test_case_errors.length > 3 ? "…" : "")
        );
      }
      onImported(data.created);
      setParsed([]); setFileName("");
      setTcParsed([]); setTcFileName("");
    } catch { setErr("Network error — check your connection and try again."); }
    finally { setBusy(false); }
  }

  const totalToImport = parsed.length + tcParsed.length;

  return (
    <>
      <div className="hlc2-overlay" onClick={onClose} />
      <div className="slp2-bulk-modal">
        <div className="slp2-bulk-hdr">
          <h3><Upload size={16} /> Bulk Import Exercises &amp; Test Cases</h3>
          <button type="button" className="slp2-icon-btn" onClick={onClose}><X size={15} /></button>
        </div>

        <p className="slp2-bulk-desc">
          Import uses two separate files: one for the questions, one for their test cases.
          Each test-case row is matched to a question by its exact title.
          CSV and Excel (.xlsx / .xls) files are both accepted.
        </p>

        <div className="slp2-bulk-file-block">
          <div className="slp2-bulk-file-hdr">1. Questions</div>
          <button type="button" className="slp2-btn-ghost" onClick={downloadBulkTemplate}>
            <Download size={14} /> Download Questions Template
          </button>
          <label className="slp2-bulk-upload-label">
            {reading ? <Loader2 size={14} className="slp2-spin" /> : <Upload size={14} />}
            {reading ? "Reading file…" : fileName || "Choose a CSV or Excel file…"}
            <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFile} disabled={reading} hidden />
          </label>

          {headerError && (
            <div className="slp2-bulk-warnings error">
              <AlertTriangle size={13} />
              <span>{headerError}</span>
            </div>
          )}
          {parseErrors.length > 0 && (
            <div className="slp2-bulk-warnings">
              <AlertTriangle size={13} />
              <span>
                {parseErrors.length} row{parseErrors.length !== 1 ? "s" : ""} will be skipped:{" "}
                {parseErrors.slice(0, 3).map((e) => `Row ${e.row} (${e.error})`).join(", ")}
                {parseErrors.length > 3 ? "…" : ""}
              </span>
            </div>
          )}
          {parsed.length > 0 && (
            <div className="slp2-bulk-preview">
              <div className="slp2-bulk-preview-hdr">
                <CheckCircle2 size={13} /> {parsed.length} exercise{parsed.length !== 1 ? "s" : ""} parsed and ready to import
              </div>
              <div className="slp2-bulk-preview-list">
                {parsed.slice(0, 8).map((ex, i) => (
                  <div key={i} className="slp2-bulk-preview-row">{i + 1}. {ex.title}</div>
                ))}
                {parsed.length > 8 && <div className="slp2-bulk-preview-row">…and {parsed.length - 8} more</div>}
              </div>
            </div>
          )}
        </div>

        <div className="slp2-bulk-file-block">
          <div className="slp2-bulk-file-hdr">2. Test Cases <span className="hlc2-optional">(optional)</span></div>
          <button type="button" className="slp2-btn-ghost" onClick={downloadTestCaseTemplate}>
            <Download size={14} /> Download Test Case Template
          </button>
          <label className="slp2-bulk-upload-label">
            {tcReading ? <Loader2 size={14} className="slp2-spin" /> : <Upload size={14} />}
            {tcReading ? "Reading file…" : tcFileName || "Choose a CSV or Excel file…"}
            <input type="file" accept=".csv,text/csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleTcFile} disabled={tcReading} hidden />
          </label>

          {tcHeaderError && (
            <div className="slp2-bulk-warnings error">
              <AlertTriangle size={13} />
              <span>{tcHeaderError}</span>
            </div>
          )}
          {tcParseErrors.length > 0 && (
            <div className="slp2-bulk-warnings">
              <AlertTriangle size={13} />
              <span>
                {tcParseErrors.length} row{tcParseErrors.length !== 1 ? "s" : ""} will be skipped:{" "}
                {tcParseErrors.slice(0, 3).map((e) => `Row ${e.row} (${e.error})`).join(", ")}
                {tcParseErrors.length > 3 ? "…" : ""}
              </span>
            </div>
          )}
          {tcParsed.length > 0 && (
            <div className="slp2-bulk-preview">
              <div className="slp2-bulk-preview-hdr">
                <CheckCircle2 size={13} /> {tcParsed.length} test case{tcParsed.length !== 1 ? "s" : ""} parsed and ready to import
              </div>
              <div className="slp2-bulk-preview-list">
                {tcParsed.slice(0, 8).map((tc, i) => (
                  <div key={i} className="slp2-bulk-preview-row">{i + 1}. {tc.title}</div>
                ))}
                {tcParsed.length > 8 && <div className="slp2-bulk-preview-row">…and {tcParsed.length - 8} more</div>}
              </div>
            </div>
          )}
        </div>

        {err && <p className="slp2-error">{err}</p>}
        {resultMsg && <p className="slp2-bulk-success"><CheckCircle2 size={13} /> {resultMsg}</p>}

        <div className="slp2-form-actions">
          <button type="button" className="slp2-btn-ghost" onClick={onClose}>Close</button>
          <button type="button" className="slp2-btn-primary" onClick={doImport} disabled={busy || reading || tcReading || !totalToImport}>
            <Save size={14} /> {busy ? "Importing…" : "Import"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Student completion table ─────────────────────────────────────────────────
function StudentTable({ students, exercises, activeExIdx, labId }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [downloading, setDownloading] = useState({});

  if (!exercises.length) {
    return <div className="slp2-empty-msg">No exercises added yet.</div>;
  }

  const ex = exercises[activeExIdx];

  async function downloadReport(row) {
    const regNo = row.register_number;
    setDownloading((d) => ({ ...d, [regNo]: true }));
    try {
      const res = await apiFetch(
        `/api/lab/v2/${labId}/exercises/${ex.id}/students/${regNo}/report/`, "POST", {},
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to generate report.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lab_record_${ex.id}_${regNo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Network error.");
    } finally {
      setDownloading((d) => ({ ...d, [regNo]: false }));
    }
  }
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

  const [unlocking, setUnlocking] = useState({});

  async function handleUnlockStudent(regNo) {
    setUnlocking((prev) => ({ ...prev, [regNo]: true }));
    try {
      const res = await apiFetch(`/api/lab/v2/staff/labs/${labId}/student/${regNo}/unlock/`, "POST");
      if (res.ok) {
        alert(`✅ Student ${regNo} unlocked successfully!`);
        window.location.reload();
      }
    } catch {
      alert("Failed to unlock student");
    } finally {
      setUnlocking((prev) => ({ ...prev, [regNo]: false }));
    }
  }

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
              <th>Status / Security</th>
              <th>Language</th>
              <th>Submitted At</th>
              <th>Report</th>
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
                  {r.is_locked ? (
                    <button
                      type="button"
                      style={{ padding: "4px 10px", fontSize: 12, background: "#fee2e2", color: "#991b1b", border: "1px solid #f87171", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}
                      disabled={!!unlocking[r.register_number]}
                      onClick={() => handleUnlockStudent(r.register_number)}
                    >
                      🔓 {unlocking[r.register_number] ? "Unlocking…" : "Unlock Student"}
                    </button>
                  ) : r.completed ? (
                    <span className="slp2-done-badge"><CheckCircle2 size={11} /> Done</span>
                  ) : (
                    <span className="slp2-pending-badge"><Circle size={11} /> Pending</span>
                  )}
                </td>
                <td className="slp2-td-mono">{r.language || "—"}</td>
                <td className="slp2-td-time">{r.submitted_at ? fmtDT(r.submitted_at) : "—"}</td>
                <td>
                  <button
                    type="button"
                    className="slp2-btn-ghost"
                    disabled={!r.completed || !!downloading[r.register_number]}
                    onClick={() => downloadReport(r)}
                    title={r.completed ? "Download this student's lab record PDF" : "No submission yet"}
                    style={{ padding: "5px 10px", fontSize: 12, opacity: r.completed ? 1 : 0.4 }}
                  >
                    {downloading[r.register_number] ? <Loader2 size={12} className="spin" /> : <Download size={12} />}
                    {downloading[r.register_number] ? "…" : "Report"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="slp2-empty-row">No students match this filter</td></tr>
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
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editExercise, setEditExercise] = useState(null);
  const [delEx, setDelEx] = useState(null);
  const [tab, setTab] = useState("exercises"); // "exercises" | "students"
  const [genState, setGenState] = useState({}); // { [exerciseId]: { busy, msg } }

  useEffect(() => {
    fetchExercises();
    fetchStudents();
  }, [lab.id]);

  async function generateTestCases(ex, force) {
    setGenState((s) => ({ ...s, [ex.id]: { busy: true, msg: "" } }));
    const body = force ? { force: true } : {};

    // Test cases and the explanation are independent LLM calls — fire both
    // at once instead of waiting for one before starting the other.
    const [tcOutcome, expOutcome] = await Promise.all([
      apiFetch(`/api/lab/v2/${lab.id}/exercises/${ex.id}/generate-test-cases/`, "POST", body)
        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
        .catch(() => ({ ok: false, data: null, networkError: true })),
      apiFetch(`/api/lab/v2/${lab.id}/exercises/${ex.id}/generate-explanation/`, "POST", body)
        .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => null) }))
        .catch(() => ({ ok: false, data: null, networkError: true })),
    ]);

    const messages = [];
    const update = {};
    if (tcOutcome.ok) {
      update.test_case_count = tcOutcome.data.test_cases?.length ?? tcOutcome.data.generated_count;
      // Generation also backfills the Hint/Examples lines in the
      // description when they were missing.
      if (tcOutcome.data.description) update.description = tcOutcome.data.description;
      messages.push(`Generated ${tcOutcome.data.generated_count} test case(s).`);
    } else {
      messages.push(`Test cases: ${tcOutcome.networkError ? "network error." : (tcOutcome.data?.error || "failed.")}`);
    }
    if (expOutcome.ok) {
      update.explanation = expOutcome.data.explanation;
      messages.push("Explanation generated.");
    } else {
      messages.push(`Explanation: ${expOutcome.networkError ? "network error." : (expOutcome.data?.error || "failed.")}`);
    }

    setExercises((prev) => prev.map((e) => (e.id === ex.id ? { ...e, ...update } : e)));
    await fetchExercises();
    setGenState((s) => ({ ...s, [ex.id]: { busy: false, msg: messages.join(" ") } }));
  }

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

  function onBulkImported(created) {
    setExercises((prev) => [...prev, ...created]);
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
      <div className="slp2-detail-hdr" style={{ flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2 className="slp2-detail-title" style={{ margin: 0 }}>{lab.name}</h2>
            {lab.lab_type === "university" && (
              <span style={{ padding: "3px 10px", borderRadius: 8, background: "#ede9fe", color: "#6d28d9", fontSize: 11, fontWeight: 700 }}>
                🏛️ University Lab
              </span>
            )}
            {lab.approval_status === "pending_approval" && (
              <span style={{ padding: "3px 10px", borderRadius: 8, background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 700 }}>
                ⏳ Pending HOD Approval
              </span>
            )}
            {lab.approval_status === "approved" && (
              <span style={{ padding: "3px 10px", borderRadius: 8, background: "#dcfce7", color: "#166534", fontSize: 11, fontWeight: 700 }}>
                ✅ HOD Approved
              </span>
            )}
          </div>
          <p className="slp2-detail-meta">
            Batch {lab.batch}{lab.section ? ` · §${lab.section}` : ""}
            {" · "}{fmt(lab.start_date)} → {fmt(lab.end_date)}
          </p>
        </div>
        <div className="slp2-detail-stats" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {lab.approval_status === "pending_approval" && (
            <button
              type="button"
              style={{ background: "#10b981", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              onClick={async () => {
                const res = await apiFetch(`/api/lab/v2/hod/${lab.id}/approve/`, "POST");
                if (res.ok) {
                  alert("✅ University Lab approved successfully!");
                  const data = await res.json();
                  setLab(data.lab);
                } else {
                  alert("Only HOD can approve University Labs");
                }
              }}
            >
              ✅ Approve University Lab
            </button>
          )}

          {lab.approval_status === "approved" && !lab.is_published && (
            <button
              type="button"
              style={{ background: "#2563eb", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              onClick={async () => {
                const res = await apiFetch(`/api/lab/v2/staff/labs/${lab.id}/publish/`, "POST");
                if (res.ok) {
                  alert("🟢 Lab published & activated for students!");
                  const data = await res.json();
                  setLab(data.lab);
                }
              }}
            >
              🟢 Publish to Students
            </button>
          )}

          <button
            type="button"
            style={{ background: "#005696", color: "white", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => window.open(`/api/lab/v2/staff/labs/${lab.id}/full-report/`, '_blank')}
          >
            <Download size={14} /> Download Full Lab Report (PDF)
          </button>
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
            <div className="slp2-ex-toolbar-actions">
              <button type="button" className="slp2-btn-ghost" onClick={() => setShowBulkImport(true)}>
                <Upload size={14} /> Bulk Import
              </button>
              <button type="button" className="slp2-btn-primary"
                onClick={() => { setShowAddForm(true); setEditExercise(null); }}>
                <Plus size={14} /> Add Exercise
              </button>
            </div>
          </div>

          {showBulkImport && (
            <BulkImportModal
              labId={lab.id}
              onImported={onBulkImported}
              onClose={() => setShowBulkImport(false)}
            />
          )}

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
              {exercises.map((ex, i) => {
                const gen = genState[ex.id] || {};
                const hasCases = !!ex.test_case_count;
                return (
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
                      <span className="slp2-chip" style={!hasCases ? { background: "#fee2e2", color: "#991b1b" } : undefined}>
                        {hasCases ? `${ex.test_case_count} test case${ex.test_case_count !== 1 ? "s" : ""}` : "⚠ No test cases"}
                      </span>
                      <span className="slp2-chip" style={!ex.explanation ? { background: "#f1f5f9", color: "#94a3b8" } : undefined}>
                        {ex.explanation ? "Explanation ✓" : "No explanation"}
                      </span>
                      {gen.msg && (
                        <span className="slp2-chip" style={{ color: /failed|error/i.test(gen.msg) ? "#dc2626" : "#166534" }}>
                          {gen.msg}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="slp2-ex-actions">
                    <button type="button" className="slp2-icon-btn" title={hasCases ? "Regenerate test cases & explanation" : "Generate test cases & explanation"}
                      disabled={gen.busy}
                      onClick={() => generateTestCases(ex, hasCases)}>
                      {gen.busy ? <Loader2 size={13} className="spin" /> : <FlaskConical size={13} />}
                    </button>
                    <button type="button" className="slp2-icon-btn"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditExercise(null);
                        setTimeout(() => setEditExercise(ex), 0);
                      }}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" className="slp2-icon-btn danger" onClick={() => setDelEx(ex)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                );
              })}
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
            <StudentTable students={students} exercises={exercises} activeExIdx={activeEx} labId={lab.id} />
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
  const [labTypeTab, setLabTypeTab] = useState("all"); // "all" | "practical" | "university"

  useEffect(() => {
    fetch("/api/lab/v2/staff/", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { setLabs(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (selected) return <LabDetail lab={selected} onBack={() => setSelected(null)} />;

  if (loading) return <div className="slp2-loading-page">Loading labs…</div>;

  const filteredLabs = labs.filter((l) => {
    if (labTypeTab === "practical") return l.lab_type !== "university";
    if (labTypeTab === "university") return l.lab_type === "university";
    return true;
  });

  const active = filteredLabs.filter((l) => !l.is_expired);
  const expired = filteredLabs.filter((l) => l.is_expired);

  return (
    <div className="slp2-root">
      <div className="slp2-page-head" style={{ flexWrap: "wrap", gap: 16 }}>
        <div className="slp2-page-title"><FlaskConical size={20} /> Lab Practical Center</div>
        <div className="slp2-head-stats">
          <span className="slp2-hstat"><TrendingUp size={13} /> {active.length} active</span>
          <span className="slp2-hstat"><BookOpen size={13} /> {labs.length} total</span>
        </div>
      </div>

      {/* Category Tab Bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, borderBottom: "1px solid #e2e8f0", paddingBottom: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setLabTypeTab("all")}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: labTypeTab === "all" ? "#005696" : "#f1f5f9",
            color: labTypeTab === "all" ? "white" : "#475569",
            fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}
        >
          🧪 All Labs ({labs.length})
        </button>
        <button
          type="button"
          onClick={() => setLabTypeTab("practical")}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: labTypeTab === "practical" ? "#005696" : "#f1f5f9",
            color: labTypeTab === "practical" ? "white" : "#475569",
            fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}
        >
          💻 Curriculum / Practice Labs ({labs.filter(l => l.lab_type !== "university").length})
        </button>
        <button
          type="button"
          onClick={() => setLabTypeTab("university")}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: labTypeTab === "university" ? "#6d28d9" : "#f1f5f9",
            color: labTypeTab === "university" ? "white" : "#475569",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6
          }}
        >
          🏛️ University Labs ({labs.filter(l => l.lab_type === "university").length})
        </button>
      </div>

      {filteredLabs.length === 0 ? (
        <div className="slp2-empty-page">
          <FlaskConical size={48} />
          <h3>No labs found</h3>
          <p>{labTypeTab === "university" ? "No University Practical Labs assigned yet." : "No labs assigned to you by the HOD will appear here."}</p>
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
