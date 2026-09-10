// Contest Container - Manages navigation between contest list and workspace
import { useState, useEffect } from 'react';
import StudentContestsPage from './StudentContestsPage';
import ContestWorkspacePage from './ContestWorkspacePage';
import AptitudeContestWorkspacePage from './AptitudeContestWorkspacePage';
import CombinedContestWorkspacePage from './CombinedContestWorkspacePage';
import ExtensionBlockOverlay from '../../common/ExtensionBlockOverlay';
import { useExtensionGuard } from '../../../lib/extensionGuard';

const ContestContainer = ({ targetContestId, setTargetContestId, onToggleWorkspace }) => {
  const [view, setView] = useState('list'); // 'list' or 'workspace'
  const [selectedContestId, setSelectedContestId] = useState(null);
  const [contestType, setContestType] = useState(null); // 'programming' or 'aptitude'
  const [loadingType, setLoadingType] = useState(false);

  // Block browser-extension usage for the whole duration of a contest session.
  const inWorkspace = view === 'workspace' && !!selectedContestId;
  const { blocked: extBlocked, details: extDetails, recheck: extRecheck } = useExtensionGuard({ active: inWorkspace });

  // Sync isInsideWorkspace state with parent
  useEffect(() => {
    if (onToggleWorkspace) {
      onToggleWorkspace(view === 'workspace');
    }
    // Cleanup: reset when leaving contest page
    return () => {
      if (onToggleWorkspace) onToggleWorkspace(false);
    };
  }, [view, onToggleWorkspace]);

  function handleNavigateToContest(contestId) {
    console.log('Navigating to contest workspace:', contestId);
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (err) {
      console.warn("Fullscreen request error:", err);
    }
    setSelectedContestId(contestId);
    setLoadingType(true);
  }

  useEffect(() => {
    if (selectedContestId && loadingType) {
      async function fetchType() {
        try {
          const res = await fetch(`/api/student/contests/${selectedContestId}/`, { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            setContestType(data.contest_type || 'programming');
            setView('workspace');
          } else {
            const data = await res.json().catch(() => ({}));
            alert(data.detail || "Failed to load contest");
            setView('list');
            setSelectedContestId(null);
          }
        } catch (err) {
          console.error("Failed to fetch contest type:", err);
          alert("Failed to load contest: " + err.message);
          setView('list');
          setSelectedContestId(null);
        } finally {
          setLoadingType(false);
        }
      }
      fetchType();
    }
  }, [selectedContestId, loadingType]);

  function handleBackToContestList() {
    console.log('Back to contest list');
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* no-op */ }
    setView('list');
    setSelectedContestId(null);
    setContestType(null);
  }

  if (loadingType) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>Preparing workspace...</p>
      </div>
    );
  }

  // Show workspace view
  if (view === 'workspace' && selectedContestId) {
    let workspace;
    if (contestType === 'combined') {
      workspace = (
        <CombinedContestWorkspacePage
          contestId={selectedContestId}
          onBack={handleBackToContestList}
        />
      );
    } else if (contestType === 'aptitude') {
      workspace = (
        <AptitudeContestWorkspacePage
          contestId={selectedContestId}
          onBack={handleBackToContestList}
        />
      );
    } else {
      workspace = (
        <ContestWorkspacePage
          contestId={selectedContestId}
          onBack={handleBackToContestList}
        />
      );
    }

    return (
      <>
        {workspace}
        {extBlocked && (
          <ExtensionBlockOverlay
            details={extDetails}
            onRecheck={extRecheck}
            onLeave={handleBackToContestList}
          />
        )}
      </>
    );
  }

  // Default: show contest list
  return (
    <StudentContestsPage
      onNavigateToContest={handleNavigateToContest}
      autoOpenContestId={targetContestId}
      onResetAutoOpen={() => setTargetContestId(null)}
    />
  );
};

export default ContestContainer;
