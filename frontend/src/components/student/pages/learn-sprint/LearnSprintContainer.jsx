// Learn Sprint Container — mirrors ContestContainer's list/workspace
// routing. A day's contest is always contest_type="combined" (see
// publish_learn_sprint_helper), so it always reuses
// CombinedContestWorkspacePage directly — no type-detection fetch needed.
import { useState, useEffect } from 'react';
import LearnSprintListPage from './LearnSprintListPage';
import LearnSprintResultsPage from './LearnSprintResultsPage';
import CombinedContestWorkspacePage from '../CombinedContestWorkspacePage';
import ExtensionBlockOverlay from '../../../common/ExtensionBlockOverlay';
import { useExtensionGuard } from '../../../../lib/extensionGuard';

export default function LearnSprintContainer({ onToggleWorkspace }) {
  const [view, setView] = useState('list'); // 'list' | 'workspace' | 'results'
  const [activeContestId, setActiveContestId] = useState(null);
  const [activeSprintId, setActiveSprintId] = useState(null);

  const inWorkspace = view === 'workspace' && !!activeContestId;
  const { blocked: extBlocked, details: extDetails, recheck: extRecheck } = useExtensionGuard({ active: inWorkspace });

  useEffect(() => {
    onToggleWorkspace && onToggleWorkspace(view === 'workspace');
    return () => onToggleWorkspace && onToggleWorkspace(false);
  }, [view, onToggleWorkspace]);

  function openDay(contestId) {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    } catch { /* no-op */ }
    setActiveContestId(contestId);
    setView('workspace');
  }
  function openResults(sprintId) {
    setActiveSprintId(sprintId);
    setView('results');
  }
  function backToList() {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* no-op */ }
    setActiveContestId(null);
    setActiveSprintId(null);
    setView('list');
  }

  if (view === 'workspace' && activeContestId) {
    return (
      <>
        <CombinedContestWorkspacePage contestId={activeContestId} onBack={backToList} />
        {extBlocked && (
          <ExtensionBlockOverlay details={extDetails} onRecheck={extRecheck} onLeave={backToList} />
        )}
      </>
    );
  }

  if (view === 'results' && activeSprintId) {
    return <LearnSprintResultsPage sprintId={activeSprintId} onBack={backToList} />;
  }

  return <LearnSprintListPage onOpenDay={openDay} onOpenResults={openResults} />;
}
