import React from 'react';
import SpeakAnalysis from './SpeakAnalysis';

const CommunicationCoach = ({ token, API_BASE, commAnalytics, fetchWithAuth }) => {
  return (
    <SpeakAnalysis token={token} API_BASE={API_BASE} fetchWithAuth={fetchWithAuth} commAnalytics={commAnalytics} />
  );
};

export default CommunicationCoach;
