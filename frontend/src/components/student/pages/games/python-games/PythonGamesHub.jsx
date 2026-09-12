// Python Games — the landing page for every Python-learning game. Py's
// Journey is the first and only playable one today; the other cards are
// visible but locked so "more games are coming" is a real roadmap, not a
// promise in a changelog — same pattern SqlGamesHub already uses one level
// up in LearnGamesHub, and one level down here for individual games.
// Adding a second playable game later means: build its own folder next to
// py/ here, add one more card below, done — this page never needs a
// rewrite for that.
import { useState } from "react";
import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import PyJourneyGame from "./py/PyJourneyGame";
import "../sql-games/sql-games.css";

const GAMES = [
  {
    id: "py",
    title: "Py's Journey",
    subtitle: "Journey to the Kingdom of Python",
    emoji: "🐍",
    description: "Help Py the snake reach the Kingdom of Python by writing real Python — print, variables, types, operators, and beyond.",
    accent: "linear-gradient(135deg, var(--sqlg-pond), var(--sqlg-pond-dark))",
    playable: true,
  },
  {
    id: "quest",
    title: "Code Quest",
    subtitle: "Coming soon",
    emoji: "🗺️",
    description: "Explore a growing world of Python challenges — loops, functions, and data structures brought to life.",
    accent: "linear-gradient(135deg, #475569, #1e293b)",
    playable: false,
  },
];

function GameCard({ game, onPlay }) {
  return (
    <div
      className={`sqlg-hub-card sqlg-card-in${game.playable ? " sqlg-hub-card-playable" : " sqlg-hub-card-locked"}`}
      style={{ background: game.accent, color: "white" }}
      onClick={() => game.playable && onPlay(game.id)}
    >
      <div style={{ fontSize: "2.6rem", marginBottom: 10 }}>{game.emoji}</div>
      <div style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.8, marginBottom: 4 }}>
        {game.playable ? "Play Now" : "Coming Soon"}
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: "1.3rem" }}>{game.title}</h3>
      <p style={{ margin: "0 0 14px", opacity: 0.9, fontSize: "0.85rem" }}>{game.description}</p>
      {game.playable ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: "0.85rem" }}>
          <Sparkles size={15} /> Start Playing
        </div>
      ) : (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.8rem" }}>
          <Lock size={14} /> Locked
        </div>
      )}
    </div>
  );
}

export default function PythonGamesHub({ onBack }) {
  const [activeGame, setActiveGame] = useState(null);

  if (activeGame === "py") {
    return <PyJourneyGame onExitToHub={() => setActiveGame(null)} />;
  }

  return (
    <div className="page-stack problem-page sqlg-root">
      <section className="page-header compact-header problem-page-header">
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 10,
                background: "none", border: "none", padding: 0, cursor: "pointer",
                color: "var(--text-soft)", fontWeight: 700, fontSize: "0.85rem",
              }}
            >
              <ArrowLeft size={15} /> Learn Programming Through Games
            </button>
          )}
          <p className="kicker">Gamified Practice</p>
          <h1>🐍 Python Games</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Learn Python by actually playing — pick a game below. New games unlock here as they're built.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
        {GAMES.map((game) => (
          <GameCard key={game.id} game={game} onPlay={setActiveGame} />
        ))}
      </div>
    </div>
  );
}
