// SQL Frog: Journey to the SQL Kingdom — a gamified SQL-learning game
// living inside the "SQL Practice" nav entry. World 1 (Beginner Pond) is
// fully playable; Worlds 2-7 show as locked/"coming soon" on the map so the
// whole journey is visible even before more content ships. SQL is the
// actual gameplay mechanic — every mission is graded by really running the
// player's query (via the existing Judge0 pipeline, see backend
// SqlFrogRunView) against the pond database, not just checking a keyword.
import { useState, useEffect, useRef } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  ChevronLeft, Loader2, Play, Lightbulb, Star, Coins, Trophy, Lock, CheckCircle2,
  Sparkles, Volume2, VolumeX, RotateCcw,
} from "lucide-react";
import { buildJsonPostOptions, extractApiError } from "../../../lib/appUtils";
import { sqlFrogSounds } from "../../../lib/sqlFrogSounds";

loader.config({ monaco });

const SOUND_PREF_KEY = "sql-frog-sound-enabled";

function useSoundPref() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(SOUND_PREF_KEY) !== "off"; } catch { return true; }
  });
  const toggle = () => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off"); } catch { /* ignore */ }
      return next;
    });
  };
  return [enabled, toggle];
}

function play(soundEnabled, name) {
  if (!soundEnabled) return;
  sqlFrogSounds[name]?.();
}

function PlayerStatsBar({ progress, soundEnabled, onToggleSound }) {
  if (!progress) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      background: "linear-gradient(135deg, var(--olive-700), var(--olive-900))",
      borderRadius: 16, padding: "14px 20px", color: "white", marginBottom: 20,
    }}>
      <div style={{ fontSize: "1.4rem" }}>🐸</div>
      <div style={{ fontWeight: 800 }}>{progress.rank}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
        <Star size={16} color="#fde68a" /> {progress.xp} XP
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
        <Coins size={16} color="#fde68a" /> {progress.coins}
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={onToggleSound}
        title={soundEnabled ? "Mute sound" : "Unmute sound"}
        style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, padding: 8, cursor: "pointer", color: "white", display: "flex" }}
      >
        {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
      </button>
    </div>
  );
}

function LilyPad({ level, onClick }) {
  const locked = !level.unlocked;
  return (
    <button
      onClick={() => !locked && onClick(level.id)}
      disabled={locked}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
        padding: "16px 10px", borderRadius: 16, minWidth: 100,
        border: level.completed ? "2px solid #16a34a" : "1px solid var(--border-soft)",
        background: locked ? "var(--bg-2)" : level.completed ? "#f0fdf4" : "white",
        cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.55 : 1,
      }}
    >
      <div style={{ fontSize: "1.6rem" }}>
        {locked ? <Lock size={22} style={{ color: "var(--text-soft)" }} /> : level.completed ? "🪷✅" : "🪷"}
      </div>
      <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--olive-900)", textAlign: "center" }}>
        {level.order}. {level.title}
      </div>
      <div style={{ fontSize: "0.65rem", color: "var(--text-soft)" }}>{level.skill_unlocked}</div>
    </button>
  );
}

function WorldMapView({ progress, onOpenLevel }) {
  return (
    <div>
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Gamified Practice</p>
          <h1>🐸 SQL Frog: Journey to the SQL Kingdom</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Help the frog reach the SQL Kingdom — every lily pad is a mission, and only a real SQL query moves the frog forward.
        </p>
      </section>

      <PlayerStatsBar progress={progress} soundEnabled={progress.__soundEnabled} onToggleSound={progress.__onToggleSound} />

      <div className="surface-card" style={{ padding: 24, marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "1.2rem" }}>🪷</span> World 1 — Beginner Pond
        </h3>
        <p style={{ color: "var(--text-soft)", fontSize: "0.85rem", margin: "0 0 16px" }}>
          SELECT, WHERE, sorting, and filtering — the frog's very first hops.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {progress.levels.map((lvl) => <LilyPad key={lvl.id} level={lvl} onClick={onOpenLevel} />)}
        </div>
      </div>

      <div className="surface-card" style={{ padding: 24 }}>
        <h3 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={18} style={{ color: "#d97706" }} /> The Road Ahead
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {progress.future_worlds.map((w) => (
            <div key={w.world} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, background: "var(--bg-2)", opacity: 0.75 }}>
              <Lock size={16} style={{ color: "var(--text-soft)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: "var(--olive-900)", fontSize: "0.88rem" }}>World {w.world} — {w.name}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-soft)" }}>{w.skills.join(" · ")}</div>
              </div>
              <span style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase" }}>Coming Soon</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SchemaPanel({ schema }) {
  if (!schema) return null;
  return (
    <div className="surface-card" style={{ padding: 16, marginBottom: 16, overflowX: "auto" }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", marginBottom: 8 }}>
        DATABASE — TABLE: {schema.table}
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: "0.8rem", minWidth: 400 }}>
        <thead>
          <tr>
            {schema.columns.map((c) => (
              <th key={c} style={{ textAlign: "left", padding: "6px 12px", background: "var(--bg-2)", borderBottom: "2px solid var(--border-soft)", fontWeight: 800, color: "var(--olive-900)" }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schema.sample_rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-soft)", color: "var(--text-hard)" }}>{String(cell)}</td>
              ))}
            </tr>
          ))}
          <tr><td colSpan={schema.columns.length} style={{ padding: "6px 12px", color: "var(--text-soft)", fontStyle: "italic" }}>...and more frogs in the pond</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function ResultFrogs({ rowCount, state }) {
  // state: "success" | "error" | null — a small row of frogs that jump on
  // success so the player feels "my query caused this", per the game's
  // core visual-feedback requirement.
  const count = Math.max(1, Math.min(rowCount || 0, 10));
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={state === "success" ? "sql-frog-jump" : state === "error" ? "sql-frog-shake" : ""}
          style={{ fontSize: "1.4rem", animationDelay: `${i * 60}ms` }}
        >
          🐸
        </span>
      ))}
    </div>
  );
}

const ERROR_LABELS = {
  syntax_error: "Syntax Error",
  wrong_result: "Not Quite Right",
  execution_error: "Execution Problem",
};

function LevelView({ levelId, onBack, onCompleted, soundEnabled }) {
  const [level, setLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [hints, setHints] = useState([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [showReward, setShowReward] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    setResult(null);
    setHints([]);
    setShowReward(false);
    fetch(`/api/sql-frog/levels/${levelId}/`, { credentials: "include" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(extractApiError(body, "Could not load this level."));
        return body;
      })
      .then((data) => { setLevel(data); setQuery(""); })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [levelId]);

  const runQuery = async () => {
    if (!query.trim() || running) return;
    setRunning(true);
    try {
      const res = await fetch(`/api/sql-frog/levels/${levelId}/run/`, buildJsonPostOptions({ query }));
      const body = await res.json();
      if (!res.ok) throw new Error(extractApiError(body, "Something went wrong running your query."));
      setResult(body);
      if (body.success) {
        play(soundEnabled, "success");
        if (!body.already_completed) {
          play(soundEnabled, "levelComplete");
          setShowReward(true);
          onCompleted?.();
        }
      } else {
        play(soundEnabled, "error");
      }
    } catch (err) {
      setResult({ success: false, error_category: "execution_error", message: err.message, rows: [] });
      play(soundEnabled, "error");
    } finally {
      setRunning(false);
    }
  };

  const requestHint = async (hintLevel) => {
    setHintLoading(true);
    try {
      const res = await fetch(`/api/sql-frog/levels/${levelId}/hint/`, buildJsonPostOptions({ hint_level: hintLevel }));
      const body = await res.json();
      if (!res.ok) throw new Error(extractApiError(body, "Could not fetch a hint."));
      setHints((prev) => {
        const next = [...prev];
        next[hintLevel - 1] = body.hint;
        return next;
      });
    } catch { /* hint fetch failing is non-critical, just don't show one */ }
    finally { setHintLoading(false); }
  };

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "var(--text-soft)" }}><Loader2 size={20} className="spin" style={{ marginRight: 10 }} /> Loading level…</div>;
  }
  if (loadError || !level) {
    return (
      <div>
        <button onClick={onBack} className="ghost-button" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}><ChevronLeft size={16} /> Back to map</button>
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-soft)" }}>{loadError || "Level not found."}</div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="ghost-button" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        <ChevronLeft size={16} /> Pond Map
      </button>

      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Level {level.order} · World 1</p>
          <h1>{level.title}</h1>
        </div>
      </section>

      <div className="surface-card" style={{ padding: 20, marginBottom: 16, fontStyle: "italic", color: "var(--text-soft)" }}>
        {level.story}
      </div>

      {level.concept_title && (
        <div className="surface-card" style={{ padding: 20, marginBottom: 16, borderLeft: "4px solid #7c3aed" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", marginBottom: 6 }}>New Skill</div>
          <h3 style={{ margin: "0 0 8px" }}>{level.concept_title}</h3>
          <p style={{ margin: "0 0 12px", color: "var(--text-hard)" }}>{level.concept_explanation}</p>
          {level.example && (
            <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: 12 }}>
              <code style={{ fontSize: "0.82rem", color: "var(--olive-900)", fontWeight: 700 }}>{level.example.query}</code>
              <div style={{ marginTop: 8, fontSize: "0.78rem", color: "var(--text-soft)" }}>
                Result: {level.example.result.map((r) => `(${r.join(", ")})`).join("  ")}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="surface-card" style={{ padding: 20, marginBottom: 16, background: "linear-gradient(135deg, #fef3c7, #fde68a)", border: "none" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#92400e", textTransform: "uppercase", marginBottom: 6 }}>Mission</div>
        <div style={{ fontWeight: 700, color: "#78350f" }}>{level.mission}</div>
      </div>

      <SchemaPanel schema={level.schema} />

      <div className="surface-card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-soft)", fontWeight: 800, fontSize: "0.8rem", color: "var(--text-soft)", textTransform: "uppercase" }}>Query</div>
        <Editor
          height="180px"
          language="sql"
          value={query}
          onChange={(v) => setQuery(v || "")}
          theme="vs"
          options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, lineNumbers: "on" }}
        />
        <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border-soft)" }}>
          <button onClick={runQuery} disabled={running || !query.trim()} className="primary-button" style={{ borderRadius: 10, padding: "10px 20px", display: "flex", alignItems: "center", gap: 6 }}>
            {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />} {running ? "Running…" : "Run Query"}
          </button>
          <button onClick={() => setQuery("")} title="Clear" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border-soft)", background: "white", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <RotateCcw size={15} /> Clear
          </button>
        </div>
      </div>

      {result && (
        <div className="surface-card" style={{ padding: 20, marginBottom: 16, border: result.success ? "1px solid #86efac" : "1px solid #fecaca" }}>
          <ResultFrogs rowCount={result.rows?.length} state={result.success ? "success" : "error"} />
          <div style={{ fontWeight: 800, color: result.success ? "#166534" : "#991b1b", marginBottom: 6 }}>
            {result.success ? "🎉 Correct! The frog leaps forward." : ERROR_LABELS[result.error_category] || "Not Quite Right"}
          </div>
          <div style={{ color: "var(--text-soft)", fontSize: "0.88rem", marginBottom: result.rows?.length ? 12 : 0 }}>{result.message}</div>
          {result.rows?.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <tbody>
                  {result.rows.slice(0, 20).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => <td key={j} style={{ padding: "4px 10px", borderBottom: "1px solid var(--border-soft)" }}>{String(cell)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!result?.success && (
        <div className="surface-card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: hints.filter(Boolean).length ? 12 : 0 }}>
            <Lightbulb size={16} style={{ color: "#d97706" }} />
            <span style={{ fontWeight: 800, fontSize: "0.85rem" }}>Need a hint?</span>
            <div style={{ flex: 1 }} />
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                onClick={() => requestHint(n)}
                disabled={hintLoading || !!hints[n - 1]}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-soft)", background: hints[n - 1] ? "var(--bg-2)" : "white", fontSize: "0.75rem", fontWeight: 700, cursor: hints[n - 1] ? "default" : "pointer" }}
              >
                Hint {n}
              </button>
            ))}
          </div>
          {hints.filter(Boolean).map((h, i) => (
            <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "var(--bg-2)", fontSize: "0.85rem", marginBottom: 6 }}>{h}</div>
          ))}
        </div>
      )}

      {showReward && result?.success && (
        <div onClick={() => setShowReward(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={(e) => e.stopPropagation()} className="sql-frog-reward-pop" style={{ background: "white", borderRadius: 24, padding: 36, textAlign: "center", maxWidth: 360 }}>
            <div style={{ fontSize: "2.4rem", marginBottom: 8 }}>⭐🐸⭐</div>
            <h2 style={{ margin: "0 0 4px" }}>Level Complete!</h2>
            <p style={{ color: "var(--text-soft)", margin: "0 0 18px" }}>Frog Progress +1</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 18 }}>
              <div style={{ fontWeight: 800, color: "#7c3aed" }}>⚡ +{result.xp_awarded} XP</div>
              <div style={{ fontWeight: 800, color: "#d97706" }}>🪙 +{result.coins_awarded}</div>
            </div>
            <div style={{ padding: "8px 14px", borderRadius: 10, background: "var(--bg-2)", fontSize: "0.82rem", fontWeight: 700, color: "var(--olive-900)", marginBottom: 18 }}>
              🧠 Skill Unlocked: {result.skill_unlocked}
            </div>
            <button onClick={onBack} className="primary-button" style={{ borderRadius: 12, padding: "10px 24px", width: "100%" }}>
              Next Level <Sparkles size={14} style={{ marginLeft: 6 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SQLPracticePage() {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeLevelId, setActiveLevelId] = useState(null);
  const [soundEnabled, toggleSound] = useSoundPref();

  const fetchProgress = () => {
    return fetch("/api/sql-frog/progress/", { credentials: "include" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(extractApiError(body, "Could not load SQL Frog."));
        return body;
      })
      .then(setProgress)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    fetchProgress().finally(() => setLoading(false));
  }, []);

  const openLevel = (levelId) => {
    play(soundEnabled, "jump");
    window.history.pushState({ sqlFrog: "level", levelId }, "");
    setActiveLevelId(levelId);
  };

  useEffect(() => {
    function handlePopState(e) {
      const s = e.state;
      setActiveLevelId(s && s.sqlFrog === "level" ? s.levelId : null);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "var(--text-soft)" }}><Loader2 size={20} className="spin" style={{ marginRight: 10 }} /> Loading the pond…</div>;
  }
  if (error || !progress) {
    return <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-soft)" }}>{error || "Could not load SQL Frog."}</div>;
  }

  return (
    <div className="page-stack problem-page">
      <style>{`
        @keyframes sqlFrogJump { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-10px) rotate(-6deg); } 60% { transform: translateY(-10px) rotate(6deg); } }
        @keyframes sqlFrogShake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        @keyframes sqlFrogRewardPop { 0% { transform: scale(0.85); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .sql-frog-jump { display: inline-block; animation: sqlFrogJump 0.5s ease; }
        .sql-frog-shake { display: inline-block; animation: sqlFrogShake 0.3s ease; }
        .sql-frog-reward-pop { animation: sqlFrogRewardPop 0.25s ease; }
      `}</style>

      {activeLevelId ? (
        <LevelView
          levelId={activeLevelId}
          onBack={() => window.history.back()}
          onCompleted={fetchProgress}
          soundEnabled={soundEnabled}
        />
      ) : (
        <WorldMapView
          progress={{ ...progress, __soundEnabled: soundEnabled, __onToggleSound: toggleSound }}
          onOpenLevel={openLevel}
        />
      )}
    </div>
  );
}
