// Small, reusable pieces shared between WorldMapView and LevelView —
// structurally a copy of sql-games/frog/shared.jsx's pattern (self-contained
// per game, not imported across games — same convention SQL Frog itself
// uses), themed for Py the snake instead of the frog.
import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { sqlFrogSounds } from "../../../../../../lib/sqlFrogSounds";

// Mirrors the backend's WORLD_NAMES (apps/learning/python_journey) — just
// display labels, same reasoning as SQL Frog's copy of the same idea.
export const WORLD_NAMES = {
  1: "The Beginning",
  2: "The Operator Mountains",
  3: "The Kingdom of Decisions",
  4: "The Loop Dungeon",
  5: "The Collection Valley",
  6: "The String Kingdom",
  7: "The Function Village",
  8: "Python Power",
  9: "The Error Dungeon",
  10: "File Village",
  11: "Module Mountains",
  12: "The OOP Kingdom",
  13: "Python Engineering",
  14: "Data & Real Programming",
  15: "Debugging & Code Quality",
  16: "Data Structures & Algorithmic Thinking",
  17: "The Kingdom of Python",
};

// One accent color per world, same palette-swap-only approach as SQL Frog's
// WORLD_THEMES — no new art/animation, just a recolor of a handful of
// existing elements.
export const WORLD_THEMES = {
  1: { accent: "#16a34a", soft: "#f0fdf4" },    // The Beginning — garden green
  2: { accent: "#b45309", soft: "#fffbeb" },    // The Operator Mountains — mountain amber
  3: { accent: "#0891b2", soft: "#ecfeff" },    // The Kingdom of Decisions — teal
  4: { accent: "#7c3aed", soft: "#f5f3ff" },    // The Loop Dungeon — dungeon purple
  5: { accent: "#4d7c0f", soft: "#f7fee7" },    // The Collection Valley — valley olive
  6: { accent: "#be185d", soft: "#fdf2f8" },    // The String Kingdom — royal pink
  7: { accent: "#0369a1", soft: "#f0f9ff" },    // The Function Village — village blue
  8: { accent: "#ca8a04", soft: "#fefce8" },    // Python Power — power gold
  9: { accent: "#dc2626", soft: "#fef2f2" },    // The Error Dungeon — warning red
  10: { accent: "#0d9488", soft: "#f0fdfa" },   // File Village — parchment teal
  11: { accent: "#78716c", soft: "#fafaf9" },   // Module Mountains — stone gray
  12: { accent: "#4338ca", soft: "#eef2ff" },   // The OOP Kingdom — indigo
  13: { accent: "#0f766e", soft: "#f0fdfa" },   // Python Engineering — engineering teal
  14: { accent: "#9333ea", soft: "#faf5ff" },   // Data & Real Programming — data purple
  15: { accent: "#ea580c", soft: "#fff7ed" },   // Debugging & Code Quality — bugfix orange
  16: { accent: "#1e293b", soft: "#f1f5f9" },   // Data Structures & Algorithmic Thinking — slate
  17: { accent: "#a16207", soft: "#fefce8" },   // The Kingdom of Python — royal gold
};

// Mirrors the visual half of the backend's cosmetics catalog
// (apps/learning/python_journey/cosmetics.py).
export const COSMETICS_BY_ID = {
  skin_default: { filter: "none" },
  skin_sunset: { filter: "hue-rotate(60deg) saturate(1.6)" },
  skin_ocean: { filter: "hue-rotate(150deg) saturate(1.4)" },
  skin_royal: { filter: "hue-rotate(230deg) saturate(1.6)" },
  skin_golden: { filter: "sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.1)" },
  skin_shadow: { filter: "grayscale(1) brightness(0.55)" },
  acc_none: { emoji: null },
  acc_hat: { emoji: "🎩" },
  acc_glasses: { emoji: "🕶️" },
  acc_scarf: { emoji: "🧣" },
  acc_crown: { emoji: "👑" },
  acc_wizard: { emoji: "🧙" },
};

const SOUND_PREF_KEY = "py-journey-sound-enabled";

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

// Reuses sqlFrogSounds as-is — its tone-synth implementation is 100%
// generic (jump/success/error/coin/levelComplete/click), nothing SQL- or
// frog-specific about it despite the filename.
export function playSound(soundEnabled, name) {
  if (!soundEnabled) return;
  sqlFrogSounds[name]?.();
}

// A snake face built from CSS/emoji + a mood-driven animation class — same
// technique as SQL Frog's FrogMascot (mood -> CSS keyframe, no image/SVG
// assets), just a 🐍 base emoji and Py's own cosmetics map.
export function PyMascot({ mood = "idle", size = 40, equipped }) {
  const animClass = mood === "happy" ? "sqlg-frog-jump" : mood === "sad" ? "sqlg-frog-shake" : "sqlg-frog-idle";
  const face = mood === "happy" ? "😄" : mood === "sad" ? "😥" : mood === "thinking" ? "🤔" : "🙂";
  const skin = COSMETICS_BY_ID[equipped?.skin] || COSMETICS_BY_ID.skin_default;
  const accessory = COSMETICS_BY_ID[equipped?.accessory];
  return (
    <span className={animClass} style={{ display: "inline-flex", position: "relative", fontSize: size, filter: skin.filter }}>
      🐍
      {accessory?.emoji && (
        <span style={{ position: "absolute", left: "50%", top: -size * 0.35, transform: "translateX(-50%)", fontSize: size * 0.55 }}>{accessory.emoji}</span>
      )}
      {mood !== "idle" && (
        <span style={{ position: "absolute", right: -6, bottom: -2, fontSize: size * 0.4 }}>{face}</span>
      )}
    </span>
  );
}

// A small burst of falling confetti squares — identical technique to SQL
// Frog's ConfettiBurst (pure CSS, self-unmounting).
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

// Counts up (or down) from a start value to `value` over ~600ms and pops
// once it lands — same as SQL Frog's AnimatedNumber, plus a `from` prop so
// it can also count DOWN (used by VisualEffectPanel's before -> after reveal).
export function AnimatedNumber({ value, from = 0, durationMs = 650 }) {
  const [display, setDisplay] = useState(from);
  const [popped, setPopped] = useState(false);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + eased * (value - from)));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setPopped(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, from, durationMs]);
  return <span className={popped ? "sqlg-counter-pop" : ""}>{display}</span>;
}

export function PathTile({ level, isCurrent, onClick, onLocked }) {
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
        <div className="sqlg-frog-token sqlg-hop" aria-hidden="true">🐍</div>
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
          {locked ? <Lock size={22} style={{ color: "var(--text-soft)" }} /> : level.completed ? "🪨✅" : "🪨"}
        </div>
        <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--olive-900)", textAlign: "center" }}>
          {level.order}. {level.title}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--text-soft)" }}>{level.skill_unlocked}</div>
      </button>
    </div>
  );
}

export function ResultSnakes({ count, state }) {
  const n = Math.max(1, Math.min(count || 1, 10));
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className={state === "success" ? "sqlg-frog-jump" : state === "error" ? "sqlg-frog-shake" : ""}
          style={{ fontSize: "1.4rem", animationDelay: `${i * 60}ms` }}
        >
          🐍
        </span>
      ))}
    </div>
  );
}

// The genuinely-new "CODE -> LOGIC -> RESULT" visual reaction the design
// spec asks for — a level can optionally declare a `visual_effect` (e.g.
// {"type": "counter", "icon": "❤️", "label": "Health", "before": 100,
// "after": 80}), shown here as a before -> after reveal using the
// generic AnimatedNumber count transition. Intentionally modest — a
// numeric/lock-icon reveal, not a full scene animation — reusing an
// already-built, proven primitive rather than a new animation engine.
export function VisualEffectPanel({ effect }) {
  if (!effect) return null;
  if (effect.type === "counter") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "var(--bg-2)", marginBottom: 12 }}>
        <span style={{ fontSize: "1.3rem" }}>{effect.icon}</span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-soft)" }}>{effect.label}</span>
        <span style={{ fontWeight: 800, fontSize: "1rem" }}>
          <AnimatedNumber value={effect.before} from={effect.before} durationMs={1} />
          {" → "}
          <AnimatedNumber value={effect.after} from={effect.before} />
        </span>
      </div>
    );
  }
  if (effect.type === "lock") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "var(--bg-2)", marginBottom: 12, fontSize: "1.3rem" }}>
        🔑 → 🔓 → 🚪
      </div>
    );
  }
  return null;
}
