// Learn Programming Through Games — the top-level hub over every gamified
// learning category. Each category lives in its own folder here (sql-games/
// today; python-games/, java-games/ etc. later) exactly the way sql-games/
// itself gives each individual game its own folder (frog/). SQL Games (SQL
// Frog + its coming-soon siblings, see SqlGamesHub) is the first and only
// playable category today; the other cards are visible but locked so "more
// categories are coming" is a real roadmap, not a promise in a changelog.
// Adding a new category later means: build its own folder next to
// sql-games/, add one card below, done — this page never needs a rewrite
// for that.
import { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import SqlGamesHub from "./sql-games/SqlGamesHub";
import PythonGamesHub from "./python-games/PythonGamesHub";
import "./sql-games/sql-games.css";

const CATEGORIES = [
  {
    id: "sql",
    title: "SQL Games",
    subtitle: "Query your way through the SQL Kingdom",
    emoji: "🗄️",
    description: "Learn SQL — SELECT, filtering, sorting, joins and beyond — through playable games like SQL Frog.",
    accent: "linear-gradient(135deg, var(--sqlg-pond), var(--sqlg-pond-dark))",
    playable: true,
  },
  {
    id: "python",
    title: "Python Games",
    subtitle: "Journey to the Kingdom of Python",
    emoji: "🐍",
    description: "Learn Python fundamentals — variables, types, operators and beyond — through playable games like Py's Journey.",
    accent: "linear-gradient(135deg, #475569, #1e293b)",
    playable: true,
    // Institution-level lock only (module_registry.py "python_games") — this
    // category has no top-level nav entry of its own to hide via the usual
    // navItems-filter mechanism, so it's gated here directly instead.
    moduleKey: "python_games",
  },
  {
    id: "java",
    title: "Java Games",
    subtitle: "Coming soon",
    emoji: "☕",
    description: "Learn Java fundamentals and OOP concepts through playable challenges.",
    accent: "linear-gradient(135deg, #7c3aed, #4c1d95)",
    playable: false,
  },
];

function CategoryCard({ category, onOpen }) {
  return (
    <div
      className={`sqlg-hub-card sqlg-card-in${category.playable ? " sqlg-hub-card-playable" : " sqlg-hub-card-locked"}`}
      style={{ background: category.accent, color: "white" }}
      onClick={() => category.playable && onOpen(category.id)}
    >
      <div style={{ fontSize: "2.6rem", marginBottom: 10 }}>{category.emoji}</div>
      <div style={{ fontSize: "0.7rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.8, marginBottom: 4 }}>
        {category.playable ? "Explore" : "Coming Soon"}
      </div>
      <h3 style={{ margin: "0 0 6px", fontSize: "1.3rem" }}>{category.title}</h3>
      <p style={{ margin: "0 0 14px", opacity: 0.9, fontSize: "0.85rem" }}>{category.description}</p>
      {category.playable ? (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: "0.85rem" }}>
          <Sparkles size={15} /> View Games
        </div>
      ) : (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.8rem" }}>
          <Lock size={14} /> Locked
        </div>
      )}
    </div>
  );
}

export default function LearnGamesHub({ lockedModules = [] }) {
  const [activeCategory, setActiveCategory] = useState(null);

  if (activeCategory === "sql") {
    return <SqlGamesHub onBack={() => setActiveCategory(null)} />;
  }
  if (activeCategory === "python") {
    return <PythonGamesHub onBack={() => setActiveCategory(null)} />;
  }

  const categories = CATEGORIES.map((category) => (
    category.moduleKey && lockedModules.includes(category.moduleKey)
      ? { ...category, playable: false, subtitle: "Locked" }
      : category
  ));

  return (
    <div className="page-stack problem-page sqlg-root">
      <section className="page-header compact-header problem-page-header">
        <div>
          <p className="kicker">Gamified Practice</p>
          <h1>🎮 Learn Programming Through Games</h1>
        </div>
        <p style={{ color: "var(--text-soft)", margin: 0 }}>
          Pick a category to start playing — new categories unlock here as they're built.
        </p>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
        {categories.map((category) => (
          <CategoryCard key={category.id} category={category} onOpen={setActiveCategory} />
        ))}
      </div>
    </div>
  );
}
