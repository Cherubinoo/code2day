import { useEffect, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import {
  ChevronLeft, Loader2, Play, Lightbulb, Sparkles, RotateCcw, ScrollText,
  PartyPopper, X,
} from "lucide-react";
import { buildJsonPostOptions, extractApiError } from "../../../../../../lib/appUtils";
import { playSound, PyMascot, ConfettiBurst, AnimatedNumber, ResultSnakes, VisualEffectPanel, WORLD_NAMES, WORLD_THEMES } from "./shared";

// Use the bundled ESM Monaco build instead of the AMD/CDN loader path —
// same configuration ProblemsPage.jsx/LabsPage.jsx/SQL Frog's LevelView
// already do; a page that lands here first still needs it.
loader.config({ monaco });

const ERROR_LABELS = {
  syntax_error: "Something's Not Right",
  wrong_result: "Not Quite Right",
  execution_error: "Execution Problem",
};

function MissionBriefingModal({ level, onDismiss }) {
  return (
    <div className="sqlg-modal-backdrop sqlg-backdrop-in" onClick={onDismiss}>
      <div className="sqlg-modal-card sqlg-modal-in" onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: "2.4rem", marginBottom: 6 }}>🐍📜</div>
        <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: 0.4 }}>
          Mission Briefing · Level {level.order}
        </div>
        <h2 style={{ margin: "4px 0 14px" }}>{level.title}</h2>

        <p style={{ fontStyle: "italic", color: "var(--text-soft)", textAlign: "left", margin: "0 0 16px" }}>{level.story}</p>

        {level.concept_title && (
          <div style={{ textAlign: "left", background: "var(--bg-2)", borderRadius: 12, padding: 14, marginBottom: 14, borderLeft: "4px solid var(--sqlg-purple)" }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--sqlg-purple)", textTransform: "uppercase", marginBottom: 4 }}>New Skill</div>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{level.concept_title}</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-hard)" }}>{level.concept_explanation}</div>
            {level.example && (
              <div style={{ background: "white", borderRadius: 8, padding: 10, marginTop: 10 }}>
                <code style={{ fontSize: "0.8rem", color: "var(--olive-900)", fontWeight: 700, whiteSpace: "pre-wrap" }}>{level.example.code}</code>
                <div style={{ marginTop: 6, fontSize: "0.75rem", color: "var(--text-soft)" }}>
                  Output: {level.example.output}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: "left", background: "linear-gradient(135deg, #fef3c7, #fde68a)", borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "#92400e", textTransform: "uppercase", marginBottom: 4 }}>Your Mission</div>
          <div style={{ fontWeight: 700, color: "#78350f" }}>{level.mission}</div>
        </div>

        <button onClick={onDismiss} className="primary-button" style={{ borderRadius: 12, padding: "12px 24px", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          Let's Slither In! <span className="sqlg-hop" style={{ display: "inline-block" }}>🐍</span>
        </button>
      </div>
    </div>
  );
}

function RewardModal({ level, result, perfectSolve, onBack, onNext, onClose }) {
  const [confettiKey, setConfettiKey] = useState(0);
  return (
    <div className="sqlg-modal-backdrop sqlg-backdrop-in" onClick={onClose}>
      <div className="sqlg-modal-card sqlg-modal-in" style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          title="Close — stay here and look at the output"
          style={{ position: "absolute", top: 14, right: 14, background: "var(--bg-2)", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "var(--text-soft)", display: "flex" }}
        >
          <X size={16} />
        </button>
        {confettiKey >= 0 && <ConfettiBurst key={confettiKey} onDone={() => setConfettiKey(-1)} />}
        <div style={{ fontSize: "2.6rem", marginBottom: 8 }}>⭐🐍⭐</div>
        <h2 style={{ margin: "0 0 4px" }}>Level Complete!</h2>
        <p style={{ color: "var(--text-soft)", margin: "0 0 14px" }}>Py's Progress +1 — {level.title}</p>

        {perfectSolve && (
          <div className="sqlg-perfect-badge" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 800, color: "#78350f", marginBottom: 14 }}>
            <PartyPopper size={14} /> Perfect Solve — no hints used!
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 18 }}>
          <div style={{ fontWeight: 800, color: "var(--sqlg-purple)", fontSize: "1.05rem" }}>
            ⚡ +<AnimatedNumber value={result.xp_awarded} /> XP
          </div>
          <div style={{ fontWeight: 800, color: "var(--sqlg-gold)", fontSize: "1.05rem" }}>
            🪙 +<AnimatedNumber value={result.coins_awarded} />
          </div>
        </div>
        <div style={{ padding: "8px 14px", borderRadius: 10, background: "var(--bg-2)", fontSize: "0.82rem", fontWeight: 700, color: "var(--olive-900)", marginBottom: 20 }}>
          🐍 Skill Unlocked: {result.skill_unlocked}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={onBack} style={{ flex: 1, padding: "10px 16px", borderRadius: 12, border: "1px solid var(--border-soft)", background: "white", fontWeight: 700, cursor: "pointer" }}>
            Journey Map
          </button>
          {onNext && (
            <button onClick={onNext} className="primary-button" style={{ flex: 1, borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              Next Level <Sparkles size={14} />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          style={{ width: "100%", padding: "8px 16px", borderRadius: 12, border: "none", background: "none", fontWeight: 700, fontSize: "0.82rem", color: "var(--text-soft)", cursor: "pointer" }}
        >
          Review the output first
        </button>
      </div>
    </div>
  );
}

export default function LevelView({ levelId, allLevels, equipped, onBack, onCompleted, onOpenLevel, soundEnabled }) {
  const [level, setLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [hints, setHints] = useState([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [showBriefing, setShowBriefing] = useState(true);
  const [showReward, setShowReward] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    setResult(null);
    setHints([]);
    setHintOpen(false);
    setShowReward(false);
    setShowBriefing(true);
    fetch(`/api/py-journey/levels/${levelId}/`, { credentials: "include" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(extractApiError(body, "Could not load this level."));
        return body;
      })
      .then((data) => { setLevel(data); setCode(data.starter_code || ""); })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [levelId]);

  const runCode = async () => {
    if (!code.trim() || running) return;
    setRunning(true);
    playSound(soundEnabled, "jump");
    try {
      const res = await fetch(`/api/py-journey/levels/${levelId}/run/`, buildJsonPostOptions({ code }));
      const body = await res.json();
      if (!res.ok) throw new Error(extractApiError(body, "Something went wrong running your code."));
      setResult(body);
      if (body.success) {
        playSound(soundEnabled, "success");
        if (!body.already_completed) {
          playSound(soundEnabled, "coin");
          setTimeout(() => playSound(soundEnabled, "levelComplete"), 150);
          setShowReward(true);
          onCompleted?.();
        }
      } else {
        playSound(soundEnabled, "error");
      }
    } catch (err) {
      setResult({ success: false, error_category: "execution_error", message: err.message, output: "" });
      playSound(soundEnabled, "error");
    } finally {
      setRunning(false);
    }
  };

  const requestHint = async (hintLevel) => {
    setHintLoading(true);
    playSound(soundEnabled, "jump");
    try {
      const res = await fetch(`/api/py-journey/levels/${levelId}/hint/`, buildJsonPostOptions({ hint_level: hintLevel }));
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

  const dismissBriefing = () => {
    playSound(soundEnabled, "click");
    setShowBriefing(false);
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

  const mascotMood = running ? "thinking" : result?.success ? "happy" : result && !result.success ? "sad" : "idle";
  const nextLevel = allLevels?.find((l) => l.order === level.order + 1);
  const perfectSolve = hints.filter(Boolean).length === 0;
  const theme = WORLD_THEMES[level.world] || WORLD_THEMES[1];

  return (
    <div>
      {showBriefing && <MissionBriefingModal level={level} onDismiss={dismissBriefing} />}
      {showReward && result?.success && (
        <RewardModal
          level={level}
          result={result}
          perfectSolve={perfectSolve}
          onBack={onBack}
          onNext={nextLevel?.unlocked ? () => onOpenLevel(nextLevel.id) : null}
          onClose={() => setShowReward(false)}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={onBack} className="ghost-button" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <ChevronLeft size={16} /> Journey Map
        </button>
        <button
          onClick={() => setShowBriefing(true)}
          className="ghost-button"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          title="Re-read the mission briefing"
        >
          <ScrollText size={16} /> Mission
        </button>
        <div style={{ flex: 1 }} />
        <PyMascot mood={mascotMood} size={30} equipped={equipped} />
      </div>

      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker" style={{ color: theme.accent }}>Level {level.order} · World {level.world} — {WORLD_NAMES[level.world] || ""}</p>
          <h1>{level.title}</h1>
        </div>
      </section>

      <div className="sqlg-workspace">
        {/* LEFT: the mission description is always visible here (not just in
            the one-time briefing modal, which disappears once dismissed) so
            a player can re-check what they're supposed to do without
            leaving the workspace. Sticky on desktop, same as SQL Frog's
            reference panel. No schema panel here — Python levels don't have
            a database to reference. */}
        <div className="sqlg-reference-panel">
          <div className="surface-card sqlg-card-in" style={{ padding: 16 }}>
            <div style={{ fontSize: "0.68rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
              📜 Description
            </div>
            {level.story && (
              <p style={{ fontStyle: "italic", color: "var(--text-soft)", fontSize: "0.85rem", margin: "0 0 12px" }}>{level.story}</p>
            )}
            {level.concept_title && (
              <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: 10, marginBottom: 12, borderLeft: "3px solid var(--sqlg-purple)" }}>
                <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "var(--sqlg-purple)", textTransform: "uppercase", marginBottom: 3 }}>New Skill</div>
                <div style={{ fontWeight: 800, fontSize: "0.85rem", marginBottom: 3 }}>{level.concept_title}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-hard)" }}>{level.concept_explanation}</div>
              </div>
            )}
            <div style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#92400e", textTransform: "uppercase", marginBottom: 3 }}>Your Mission</div>
              <div style={{ fontWeight: 700, color: "#78350f", fontSize: "0.85rem" }}>{level.mission}</div>
            </div>
          </div>
        </div>

        {/* RIGHT: the actual play space. */}
        <div>
          <div className="surface-card sqlg-card-in" style={{ padding: 0, overflow: "hidden", marginBottom: 16, borderTop: `3px solid ${theme.accent}` }}>
            <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border-soft)", fontWeight: 800, fontSize: "0.8rem", color: "var(--text-soft)", textTransform: "uppercase" }}>Code</div>
            <div className="sqlg-editor-shell">
              <Editor
                height="320px"
                language="python"
                value={code}
                onChange={(v) => setCode(v || "")}
                theme="vs"
                options={{ minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false, lineNumbers: "on", padding: { top: 12 } }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border-soft)", position: "relative" }}>
              <button onClick={runCode} disabled={running || !code.trim()} className="primary-button" style={{ borderRadius: 10, padding: "10px 20px", display: "flex", alignItems: "center", gap: 6 }}>
                {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />} {running ? "Running…" : "Run Code"}
              </button>
              <button onClick={() => setCode(level.starter_code || "")} title="Reset to starter code" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border-soft)", background: "white", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <RotateCcw size={15} /> Reset
              </button>

              {!result?.success && (
                <div style={{ marginLeft: "auto", position: "relative" }}>
                  <button
                    onClick={() => setHintOpen((v) => !v)}
                    className="sqlg-hint-btn"
                    style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #fde68a", background: "#fffbeb", color: "#92400e", fontWeight: 800, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  >
                    🐍 <Lightbulb size={15} /> Hint{hints.filter(Boolean).length > 0 ? ` ${hints.filter(Boolean).length}/3` : ""}
                  </button>

                  {hintOpen && (
                    <div className="sqlg-modal-in" style={{
                      position: "absolute", bottom: "calc(100% + 10px)", right: 0, width: 260, zIndex: 50,
                      background: "white", border: "1px solid var(--border-soft)", borderRadius: 14, padding: 14,
                      boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <span style={{ fontSize: "1.05rem" }}>🐍💡</span>
                        <span style={{ fontWeight: 800, fontSize: "0.8rem" }}>Need a hint?</span>
                        <div style={{ flex: 1 }} />
                        <button onClick={() => setHintOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-soft)", display: "flex" }}>
                          <X size={14} />
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        {[1, 2, 3].map((n) => (
                          <button
                            key={n}
                            onClick={() => requestHint(n)}
                            disabled={hintLoading || !!hints[n - 1]}
                            className="sqlg-hint-btn"
                            style={{ flex: 1, padding: "5px 0", borderRadius: 8, border: "1px solid var(--border-soft)", background: hints[n - 1] ? "var(--bg-2)" : "white", fontSize: "0.75rem", fontWeight: 700, cursor: hints[n - 1] ? "default" : "pointer" }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                        {hints.filter(Boolean).length === 0 ? (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-soft)" }}>Tap a number — 1 is gentle, 3 is the answer.</div>
                        ) : (
                          hints.filter(Boolean).map((h, i) => (
                            <div key={i} className="sqlg-toast-in" style={{ padding: "8px 10px", borderRadius: 8, background: "var(--bg-2)", fontSize: "0.78rem" }}>{h}</div>
                          ))
                        )}
                      </div>
                      <div style={{ position: "absolute", bottom: -6, right: 28, width: 12, height: 12, background: "white", borderRight: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)", transform: "rotate(45deg)" }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {result && (
            <div className="surface-card sqlg-card-in" style={{ padding: 20, marginBottom: 16, border: result.success ? "1px solid #86efac" : "1px solid #fecaca", position: "relative", overflow: "hidden" }}>
              <ResultSnakes count={result.success ? 3 : 1} state={result.success ? "success" : "error"} />
              <div style={{ fontWeight: 800, color: result.success ? "#166534" : "#991b1b", marginBottom: 6 }}>
                {result.success ? "🎉 Correct! Py slithers forward." : ERROR_LABELS[result.error_category] || "Not Quite Right"}
              </div>
              <div style={{ color: "var(--text-soft)", fontSize: "0.88rem", marginBottom: 12 }}>{result.message}</div>
              {result.success && level.visual_effect && <VisualEffectPanel effect={level.visual_effect} />}
              {result.output && (
                <div style={{ background: "var(--bg-2)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>
                  {result.output}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
