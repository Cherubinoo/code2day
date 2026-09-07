import { useState } from "react";
import { Trophy, Lock, Star, Coins, Volume2, VolumeX } from "lucide-react";
import { LilyPad } from "./shared";

function PlayerStatsBar({ progress, soundEnabled, onToggleSound }) {
  return (
    <div className="sqlg-card-in" style={{
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      background: "linear-gradient(135deg, var(--sqlg-pond), var(--sqlg-pond-dark))",
      borderRadius: 16, padding: "14px 20px", color: "white", marginBottom: 20,
    }}>
      <div className="sqlg-frog-idle" style={{ fontSize: "1.4rem" }}>🐸</div>
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

const WORLD_EMOJI = { 1: "🪷", 2: "🏘️", 3: "🏝️", 4: "🌫️", 5: "🧙", 6: "🌋", 7: "👑", 8: "🏆" };

export default function WorldMapView({ progress, soundEnabled, onToggleSound, onOpenLevel }) {
  const [lockedNotice, setLockedNotice] = useState(false);
  const allLevels = progress.worlds.flatMap((w) => w.levels);
  const currentLevel = allLevels.find((l) => l.unlocked && !l.completed);
  const totalLevels = allLevels.length;
  const completedCount = allLevels.filter((l) => l.completed).length;

  return (
    <div>
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Gamified Practice · SQL Games</p>
          <h1>🐸 SQL Frog: Journey to the SQL Kingdom</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Help the frog reach the SQL Kingdom — every lily pad is a mission, and only a real SQL query moves the frog forward.
          {" "}({completedCount}/{totalLevels} missions complete)
        </p>
      </section>

      <PlayerStatsBar progress={progress} soundEnabled={soundEnabled} onToggleSound={onToggleSound} />

      {lockedNotice && (
        <div className="sqlg-toast-in" style={{
          display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10,
          background: "#fef3c7", color: "#92400e", fontSize: "0.8rem", fontWeight: 700, marginBottom: 16,
        }}>
          <Lock size={14} /> Finish the previous mission first — the frog can't hop that far yet!
        </div>
      )}

      {progress.worlds.map((world) => {
        const worldCompleted = world.levels.every((l) => l.completed);
        const worldLocked = world.levels.every((l) => !l.unlocked);
        return (
          <div
            key={world.world}
            className="surface-card sqlg-card-in"
            style={{ padding: 24, marginBottom: 20, opacity: worldLocked ? 0.6 : 1 }}
          >
            <h3 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: "1.2rem" }}>{WORLD_EMOJI[world.world] || "🪷"}</span>
              World {world.world} — {world.name}
              {worldCompleted && <span style={{ fontSize: "0.7rem", fontWeight: 800, color: "#16a34a", textTransform: "uppercase" }}>✓ Complete</span>}
            </h3>
            <div className="sqlg-lilypad-row">
              {world.levels.map((lvl) => (
                <LilyPad
                  key={lvl.id}
                  level={lvl}
                  isCurrent={currentLevel?.id === lvl.id}
                  onClick={onOpenLevel}
                  onLocked={() => {
                    setLockedNotice(true);
                    setTimeout(() => setLockedNotice(false), 2200);
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {progress.future_worlds?.length > 0 && (
        <div className="surface-card sqlg-card-in" style={{ padding: 24 }}>
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
      )}
    </div>
  );
}
