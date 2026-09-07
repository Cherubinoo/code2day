// SQL Frog: Journey to the SQL Kingdom — the first game under sql-games/.
// SQL is the actual gameplay mechanic: every mission is graded by really
// running the player's query (via the existing Judge0 pipeline, see backend
// SqlFrogRunView) against the pond database, not just checking a keyword.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { extractApiError } from "../../../../../lib/appUtils";
import { useSoundPref, playSound } from "./shared";
import WorldMapView from "./WorldMapView";
import LevelView from "./LevelView";
import "../sql-games.css";

export default function SqlFrogGame({ onExitToHub }) {
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
    playSound(soundEnabled, "jump");
    window.history.pushState({ sqlFrog: "level", levelId }, "");
    setActiveLevelId(levelId);
  };

  const backToMap = () => {
    window.history.back();
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
    <div className="page-stack problem-page sqlg-root">
      {activeLevelId ? (
        <LevelView
          levelId={activeLevelId}
          allLevels={progress.worlds.flatMap((w) => w.levels)}
          onBack={backToMap}
          onOpenLevel={openLevel}
          onCompleted={fetchProgress}
          soundEnabled={soundEnabled}
        />
      ) : (
        <WorldMapView
          progress={progress}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          onOpenLevel={openLevel}
        />
      )}
    </div>
  );
}
