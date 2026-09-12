// Small, reusable pieces shared between WorldMapView and LevelView — kept
// together rather than one-file-per-component since none of these is more
// than ~40 lines on its own.
import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { sqlFrogSounds } from "../../../../../../lib/sqlFrogSounds";

// Mirrors the backend's WORLD_NAMES (apps/learning/sql_games/frog) — just
// display labels, so keeping a second small copy here is lower-risk than
// threading the name through every response that needs it.
export const WORLD_NAMES = {
  1: "Beginner Pond",
  2: "Frog Village",
  3: "Connected Islands",
  4: "Mystery Forest",
  5: "Wizard Forest",
  6: "Volcano Valley",
  7: "SQL Kingdom",
  8: "The Grand Trial",
};

// One accent color per world so the workspace feels like it's actually in
// that world without shipping any new art/animation — just a recolor of a
// handful of existing elements (kicker text, a card border, the hint
// button) via CSS variables. Deliberately just a palette swap, nothing
// that adds render cost.
export const WORLD_THEMES = {
  1: { accent: "#16a34a", soft: "#f0fdf4" },   // Beginner Pond — lily green
  2: { accent: "#b45309", soft: "#fffbeb" },   // Frog Village — warm amber
  3: { accent: "#0891b2", soft: "#ecfeff" },   // Connected Islands — tropical teal
  4: { accent: "#7c3aed", soft: "#f5f3ff" },   // Mystery Forest — misty purple
  5: { accent: "#4338ca", soft: "#eef2ff" },   // Wizard Forest — indigo
  6: { accent: "#dc2626", soft: "#fef2f2" },   // Volcano Valley — lava red
  7: { accent: "#a16207", soft: "#fefce8" },   // SQL Kingdom — royal gold
  8: { accent: "#334155", soft: "#f1f5f9" },   // The Grand Trial — slate
};

// Mirrors the visual half of the backend's cosmetics catalog
// (apps/learning/sql_games/frog/cosmetics.py) — cost/ownership is fetched
// live from /api/sql-frog/shop/, but the css_filter/emoji used to actually
// render an equipped item is small and static enough to keep a local copy
// of, same reasoning as WORLD_NAMES above.
export const COSMETICS_BY_ID = {
  skin_default: { filter: "none" },
  skin_blue: { filter: "hue-rotate(150deg) saturate(1.4)" },
  skin_purple: { filter: "hue-rotate(230deg) saturate(1.6)" },
  skin_red: { filter: "hue-rotate(-100deg) saturate(2)" },
  skin_gold: { filter: "sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.1)" },
  skin_shadow: { filter: "grayscale(1) brightness(0.55)" },
  acc_none: { emoji: null },
  acc_hat: { emoji: "🎩" },
  acc_glasses: { emoji: "🕶️" },
  acc_bow: { emoji: "🎀" },
  acc_crown: { emoji: "👑" },
  acc_wizard: { emoji: "🧙" },
};

const SOUND_PREF_KEY = "sql-frog-sound-enabled";

export function useSoundPref() {
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

export function playSound(soundEnabled, name) {
  if (!soundEnabled) return;
  sqlFrogSounds[name]?.();
}

// A frog face built from CSS/emoji + a mood-driven animation class, instead
// of a single static emoji — the closest we can get to "a real character
// reacting to you" without shipping image/SVG assets. `equipped` (from
// progress.equipped_cosmetics, e.g. {skin: "skin_blue", accessory: "acc_hat"})
// recolors the frog via a CSS filter and overlays an accessory emoji —
// bought-and-equipped shop items actually show up wherever the mascot does.
export function FrogMascot({ mood = "idle", size = 40, equipped }) {
  const animClass = mood === "happy" ? "sqlg-frog-jump" : mood === "sad" ? "sqlg-frog-shake" : "sqlg-frog-idle";
  const face = mood === "happy" ? "😄" : mood === "sad" ? "😥" : mood === "thinking" ? "🤔" : "🙂";
  const skin = COSMETICS_BY_ID[equipped?.skin] || COSMETICS_BY_ID.skin_default;
  const accessory = COSMETICS_BY_ID[equipped?.accessory];
  return (
    <span className={animClass} style={{ display: "inline-flex", position: "relative", fontSize: size, filter: skin.filter }}>
      🐸
      {accessory?.emoji && (
        <span style={{ position: "absolute", left: "50%", top: -size * 0.35, transform: "translateX(-50%)", fontSize: size * 0.55 }}>{accessory.emoji}</span>
      )}
      {mood !== "idle" && (
        <span style={{ position: "absolute", right: -6, bottom: -2, fontSize: size * 0.4 }}>{face}</span>
      )}
    </span>
  );
}

// A small burst of falling confetti squares, pure CSS — mounts, plays once,
// and unmounts itself so it never lingers as dead DOM.
const CONFETTI_COLORS = ["#16a34a", "#facc15", "#7c3aed", "#0ea5e9", "#f97316", "#f43f5e"];
export function ConfettiBurst({ pieces = 24, onDone }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 1500);
    return () => clearTimeout(t);
  }, [onDone]);
  const bits = useRef(
    Array.from({ length: pieces }).map((_, i) => ({
      left: Math.round(Math.random() * 100),
      delay: Math.round(Math.random() * 260),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.round(Math.random() * 90) - 45,
    }))
  ).current;
  return (
    <div className="sqlg-confetti-layer">
      {bits.map((b, i) => (
        <span
          key={i}
          className="sqlg-confetti-piece"
          style={{
            left: `${b.left}%`,
            background: b.color,
            animationDelay: `${b.delay}ms`,
            transform: `rotate(${b.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// Counts up from 0 to `value` over ~600ms and pops once it lands — makes
// XP/coin rewards feel like they're actually being earned in front of you
// instead of just appearing.
export function AnimatedNumber({ value, durationMs = 650 }) {
  const [display, setDisplay] = useState(0);
  const [popped, setPopped] = useState(false);
  useEffect(() => {
    if (!value) { setDisplay(0); return; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setPopped(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return <span className={popped ? "sqlg-counter-pop" : ""}>{display}</span>;
}

export function LilyPad({ level, isCurrent, onClick, onLocked }) {
  const [wiggle, setWiggle] = useState(false);
  const locked = !level.unlocked;

  const handleClick = () => {
    if (locked) {
      setWiggle(true);
      onLocked?.();
      setTimeout(() => setWiggle(false), 420);
      return;
    }
    onClick(level.id);
  };

  return (
    <div className="sqlg-lilypad-wrap">
      {isCurrent && (
        <div className="sqlg-frog-token sqlg-hop" aria-hidden="true">🐸</div>
      )}
      <button
        onClick={handleClick}
        className={`sqlg-lilypad${locked ? " sqlg-lilypad-locked" : ""}${wiggle ? " sqlg-wiggle" : ""}${isCurrent ? " sqlg-pulse-ring" : ""}`}
        style={{
          border: level.completed ? "2px solid #16a34a" : isCurrent ? "2px solid var(--sqlg-lily)" : "1px solid var(--border-soft)",
          background: locked ? "var(--bg-2)" : level.completed ? "#f0fdf4" : "white",
          opacity: locked ? 0.6 : 1,
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
    </div>
  );
}

// `schemas` is always a list — one table for World 1/2 levels, two
// (frogs + ponds) for every World 3+ level that needs a join partner —
// so this never has to special-case "how many tables does this level use".
export function SchemaPanel({ schemas }) {
  if (!schemas || schemas.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {schemas.map((schema) => (
        <div key={schema.table} style={{ overflowX: "auto" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 800, color: "var(--text-soft)", textTransform: "uppercase", marginBottom: 8 }}>
            Table: {schema.table}
          </div>
          <table style={{ borderCollapse: "collapse", fontSize: "0.76rem", width: "100%" }}>
            <thead>
              <tr>
                {schema.columns.map((c) => (
                  <th key={c} style={{ textAlign: "left", padding: "5px 8px", background: "var(--bg-2)", borderBottom: "2px solid var(--border-soft)", fontWeight: 800, color: "var(--olive-900)" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schema.sample_rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: "5px 8px", borderBottom: "1px solid var(--border-soft)", color: "var(--text-hard)" }}>{cell === null || cell === undefined ? "—" : String(cell)}</td>
                  ))}
                </tr>
              ))}
              <tr><td colSpan={schema.columns.length} style={{ padding: "5px 8px", color: "var(--text-soft)", fontStyle: "italic" }}>...and more in {schema.table}</td></tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function ResultFrogs({ rowCount, state }) {
  const count = Math.max(1, Math.min(rowCount || 0, 10));
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={state === "success" ? "sqlg-frog-jump" : state === "error" ? "sqlg-frog-shake" : ""}
          style={{ fontSize: "1.4rem", animationDelay: `${i * 60}ms` }}
        >
          🐸
        </span>
      ))}
    </div>
  );
}
