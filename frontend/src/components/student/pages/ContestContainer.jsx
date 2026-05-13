// Contest Container - Manages navigation between contest list and workspace
import { useState, useEffect } from 'react';
import StudentContestsPage from './StudentContestsPage';
import ContestWorkspacePage from './ContestWorkspacePage';
import AptitudeContestWorkspacePage from './AptitudeContestWorkspacePage';

const ContestContainer = ({ targetContestId, setTargetContestId, onToggleWorkspace }) => {
  const [view, setView] = useState('list'); // 'list' or 'workspace'
  const [selectedContestId, setSelectedContestId] = useState(null);
  const [contestType, setContestType] = useState(null); // 'programming' or 'aptitude'
  const [loadingType, setLoadingType] = useState(false);

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
          }
        } catch (err) {
          console.error("Failed to fetch contest type:", err);
        } finally {
          setLoadingType(false);
        }
      }
      fetchType();
    }
  }, [selectedContestId, loadingType]);

  function handleBackToContestList() {
    console.log('Back to contest list');
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
    if (contestType === 'aptitude') {
      return (
        <AptitudeContestWorkspacePage
          contestId={selectedContestId}
          onBack={handleBackToContestList}
        />
      );
    }
    return (
      <ContestWorkspacePage
        contestId={selectedContestId}
        onBack={handleBackToContestList}
      />
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
