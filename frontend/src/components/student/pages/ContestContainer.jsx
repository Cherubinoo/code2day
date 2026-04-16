// Contest Container - Manages navigation between contest list and workspace
import { useState } from 'react';
import StudentContestsPage from './StudentContestsPage';
import ContestWorkspacePage from './ContestWorkspacePage';

const ContestContainer = () => {
  const [view, setView] = useState('list'); // 'list' or 'workspace'
  const [selectedContestId, setSelectedContestId] = useState(null);

  function handleNavigateToContest(contestId) {
    console.log('Navigating to contest workspace:', contestId);
    setSelectedContestId(contestId);
    setView('workspace');
  }

  function handleBackToContestList() {
    console.log('Back to contest list');
    setView('list');
    setSelectedContestId(null);
  }

  // Show workspace view
  if (view === 'workspace' && selectedContestId) {
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
    />
  );
};

export default ContestContainer;
