// SQL Games — the landing page for every SQL-learning game. SQL Frog is the
// first game and the only playable one today; the other cards are visible
// but locked so the "more games are coming" roadmap is real, not a promise
// in a changelog. Adding a second playable game later means: build its
// folder next to frog/ here, add one more card below, done — this page
// never needs a rewrite for that.
import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import SqlFrogGame from "./frog/SqlFrogGame";
import "./sql-games.css";

const GAMES = [
  {
    id: "frog",
    title: "SQL Frog",
    subtitle: "Journey to the SQL Kingdom",
    emoji: "🐸",
    description: "Help a frog hop across the pond by writing real SQL — SELECT, WHERE, sorting, filtering, and beyond.",
    accent: "linear-gradient(135deg, var(--sqlg-pond), var(--sqlg-pond-dark))",
    playable: true,
  },
  {
    id: "heist",
    title: "Query Heist",
    subtitle: "Coming soon",
    emoji: "🕵️",
    description: "Crack a vault of relational tables using joins and subqueries to pull off the perfect data heist.",
    accent: "linear-gradient(135deg, #475569, #1e293b)",
    playable: false,
  },
  {
    id: "kingdom",
    title: "SQL Kingdom Builder",
    subtitle: "Coming soon",
    emoji: "🏰",
    description: "Design and query a growing kingdom's database using aggregates, CTEs, and window functions.",
    accent: "linear-gradient(135deg, #7c3aed, #4c1d95)",
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

export default function SqlGamesHub() {
  const [activeGame, setActiveGame] = useState(null);

  if (activeGame === "frog") {
    return <SqlFrogGame onExitToHub={() => setActiveGame(null)} />;
  }

  return (
    <div className="page-stack problem-page sqlg-root">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Gamified Practice</p>
          <h1>🎮 SQL Games</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Learn SQL by actually playing — pick a game below. New games unlock here as they're built.
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
