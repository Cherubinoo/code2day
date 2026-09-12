// PY: Journey to the Kingdom of Python — the first game under
// python-games/. Python is the actual gameplay mechanic: every mission is
// graded by really running the player's code (via the existing Judge0
// pipeline, see backend PyJourneyRunView) and diffing its printed output,
// not just checking a keyword.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { extractApiError } from "../../../../../../lib/appUtils";
import { useSoundPref, playSound } from "./shared";
import WorldMapView from "./WorldMapView";
import LevelView from "./LevelView";
import "../../sql-games/sql-games.css";

export default function PyJourneyGame({ onExitToHub }) {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeLevelId, setActiveLevelId] = useState(null);
  const [soundEnabled, toggleSound] = useSoundPref();

  const fetchProgress = () => {
    return fetch("/api/py-journey/progress/", { credentials: "include" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(extractApiError(body, "Could not load Py's Journey."));
        return body;
      })
      .then(setProgress)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    fetchProgress().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Plain component state, not browser history — same reasoning as
  // SqlFrogGame: a level -> map -> hub stack that's just React state can't
  // drift out of sync with what's on screen.
  const openLevel = (levelId) => {
    playSound(soundEnabled, "jump");
    setActiveLevelId(levelId);
  };

  const backToMap = () => {
    playSound(soundEnabled, "click");
    setActiveLevelId(null);
  };

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "var(--text-soft)" }}><Loader2 size={20} className="spin" style={{ marginRight: 10 }} /> Waking Py up…</div>;
  }
  if (error || !progress) {
    return <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-soft)" }}>{error || "Could not load Py's Journey."}</div>;
  }

  return (
    <div className="page-stack problem-page sqlg-root">
      {activeLevelId ? (
        <LevelView
          levelId={activeLevelId}
          allLevels={progress.worlds.flatMap((w) => w.levels)}
          equipped={progress.equipped_cosmetics}
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
          onExitToHub={onExitToHub}
          onProgressChanged={fetchProgress}
        />
      )}
    </div>
  );
}
