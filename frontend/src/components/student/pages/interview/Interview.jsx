import React from 'react';
import InterviewDashboard from './InterviewDashboard';
import InterviewSetup from './InterviewSetup';
import InterviewRoom from './InterviewRoom';
import InterviewReview from './InterviewReview';

const Interview = ({
  interviewState,
  setInterviewState,
  interviewSessions,
  setSelectedReviewSession,
  setActiveSession,
  setInterviewNextQuestion,
  setInterviewQuestionIndex,
  setUserAnswerText,
  // Setup props
  selectedInterviewType,
  setSelectedInterviewType,
  customJdText,
  setCustomJdText,
  isStartingInterview,
  handleStartInterview,
  // Active interview props
  activeSession,
  interviewQuestionIndex,
  interviewNextQuestion,
  userAnswerText,
  speechDictationActive,
  handleSpeechDictation,
  isSubmittingAnswer,
  handleSubmitAnswer,
  // Review props
  selectedReviewSession
}) => {
  return (
    <div className="dashboard-content-page">
      {/* VIEW 1: DASHBOARD */}
      {interviewState === 'dashboard' && (
        <InterviewDashboard 
          interviewSessions={interviewSessions}
          setInterviewState={setInterviewState}
          setCustomJdText={setCustomJdText}
          setSelectedReviewSession={setSelectedReviewSession}
          setActiveSession={setActiveSession}
          setInterviewNextQuestion={setInterviewNextQuestion}
          setInterviewQuestionIndex={setInterviewQuestionIndex}
          setUserAnswerText={setUserAnswerText}
        />
      )}

      {/* VIEW 2: SETUP SCREEN */}
      {interviewState === 'setup' && (
        <InterviewSetup 
          selectedInterviewType={selectedInterviewType}
          setSelectedInterviewType={setSelectedInterviewType}
          customJdText={customJdText}
          setCustomJdText={setCustomJdText}
          isStartingInterview={isStartingInterview}
          handleStartInterview={handleStartInterview}
          setInterviewState={setInterviewState}
        />
      )}

      {/* VIEW 3: ACTIVE INTERVIEW ROOM */}
      {interviewState === 'active' && activeSession && (
        <InterviewRoom 
          activeSession={activeSession}
          interviewQuestionIndex={interviewQuestionIndex}
          interviewNextQuestion={interviewNextQuestion}
          userAnswerText={userAnswerText}
          setUserAnswerText={setUserAnswerText}
          speechDictationActive={speechDictationActive}
          handleSpeechDictation={handleSpeechDictation}
          isSubmittingAnswer={isSubmittingAnswer}
          handleSubmitAnswer={handleSubmitAnswer}
        />
      )}

      {/* VIEW 4: SCORECARD & REVIEW */}
      {interviewState === 'review' && selectedReviewSession && (
        <InterviewReview 
          selectedReviewSession={selectedReviewSession}
          setInterviewState={setInterviewState}
        />
      )}
    </div>
  );
};

export default Interview;