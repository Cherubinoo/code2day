import React from 'react';
import CommunicationHeader from './CommunicationHeader';
import LettersSounds from './LettersSounds';
import WordBuilder from './WordBuilder';
import SentenceLab from './SentenceLab';
import MCQChallenges from './MCQChallenges';
import ConversationPartner from './ConversationPartner';
import SpeakingAnalysis from './SpeakingAnalysis';
import ProgressAnalytics from './ProgressAnalytics';

const Communication = ({
  commSubTab,
  setCommSubTab,
  // Letters & Sounds props
  practiceLanguage,
  setPracticeLanguage,
  selectedSound,
  setSelectedSound,
  soundsQuizActive,
  setSoundsQuizActive,
  soundsQuizPair,
  setSoundsQuizPair,
  soundsQuizTarget,
  setSoundsQuizTarget,
  soundsQuizResult,
  setSoundsQuizResult,
  soundsQuizScore,
  setSoundsQuizScore,
  soundsQuizIndex,
  setSoundsQuizIndex,
  commonSentencesLevel,
  setCommonSentencesLevel,
  speakText,
  // Word Builder props
  wordBuilderIndex,
  setWordBuilderIndex,
  assembledWord,
  setAssembledWord,
  scrambledLetters,
  setScrambledLetters,
  wordBuilderSuccess,
  setWordBuilderSuccess,
  // Sentence Lab props
  sentenceLabIndex,
  setSentenceLabIndex,
  scrambledWords,
  setScrambledWords,
  assembledSentence,
  setAssembledSentence,
  sentenceLabSuccess,
  setSentenceLabSuccess,
  sentenceLabStage,
  setSentenceLabStage,
  challengeAssembledSentence,
  setChallengeAssembledSentence,
  challengeScrambledWords,
  setChallengeScrambledWords,
  sentenceLabChallengeSuccess,
  setSentenceLabChallengeSuccess,
  // MCQ props
  mcqIndex,
  setMcqIndex,
  mcqSelectedOption,
  setMcqSelectedOption,
  mcqShowResult,
  setMcqShowResult,
  mcqScore,
  setMcqScore,
  mcqMistakeLog,
  setMcqMistakeLog,
  mcqRevisionMode,
  setMcqRevisionMode,
  // Chat props
  chatLanguage,
  setChatLanguage,
  chatLevel,
  setChatLevel,
  chatMessages,
  setChatMessages,
  chatInput,
  setChatInput,
  isSendingChatMessage,
  setIsSendingChatMessage,
  chatScenario,
  setChatScenario,
  handleSendChatMessage,
  // Speaking props
  isRecording,
  setIsRecording,
  recordingTime,
  startRecording,
  stopRecording,
  speechResult,
  setSpeechResult,
  writingText,
  setWritingText,
  writingContext,
  setWritingContext,
  isEvaluatingWriting,
  handleEvaluateWriting,
  writingResult,
  setWritingResult,
  // Analytics props
  commAnalytics,
  isLoadingCommAnalytics,
  fetchCommAnalytics
}) => {
  return (
    <div className="dashboard-content-page">
      <div className="comm-split-container">
        <div className="comm-main-panel" style={{ display: 'flex', flexDirection: 'column', gap: '24px', flex: 1 }}>
          
          {/* Header */}
          <CommunicationHeader 
            commSubTab={commSubTab}
            setCommSubTab={setCommSubTab}
          />

          <div className="comm-subtab-content">
            {/* MODULE 1: LETTERS & SOUNDS */}
            {commSubTab === 'sounds' && (
              <LettersSounds 
                practiceLanguage={practiceLanguage}
                setPracticeLanguage={setPracticeLanguage}
                selectedSound={selectedSound}
                setSelectedSound={setSelectedSound}
                soundsQuizActive={soundsQuizActive}
                setSoundsQuizActive={setSoundsQuizActive}
                soundsQuizPair={soundsQuizPair}
                setSoundsQuizPair={setSoundsQuizPair}
                soundsQuizTarget={soundsQuizTarget}
                setSoundsQuizTarget={setSoundsQuizTarget}
                soundsQuizResult={soundsQuizResult}
                setSoundsQuizResult={setSoundsQuizResult}
                soundsQuizScore={soundsQuizScore}
                setSoundsQuizScore={setSoundsQuizScore}
                soundsQuizIndex={soundsQuizIndex}
                setSoundsQuizIndex={setSoundsQuizIndex}
                commonSentencesLevel={commonSentencesLevel}
                setCommonSentencesLevel={setCommonSentencesLevel}
                speakText={speakText}
              />
            )}

            {/* MODULE 2: WORD BUILDER */}
            {commSubTab === 'wordbuilder' && (
              <WordBuilder 
                practiceLanguage={practiceLanguage}
                setPracticeLanguage={setPracticeLanguage}
                wordBuilderIndex={wordBuilderIndex}
                setWordBuilderIndex={setWordBuilderIndex}
                assembledWord={assembledWord}
                setAssembledWord={setAssembledWord}
                scrambledLetters={scrambledLetters}
                setScrambledLetters={setScrambledLetters}
                wordBuilderSuccess={wordBuilderSuccess}
                setWordBuilderSuccess={setWordBuilderSuccess}
                speakText={speakText}
              />
            )}

            {/* MODULE 3: SENTENCE LAB */}
            {commSubTab === 'sentence_lab' && (
              <SentenceLab 
                practiceLanguage={practiceLanguage}
                setPracticeLanguage={setPracticeLanguage}
                sentenceLabIndex={sentenceLabIndex}
                setSentenceLabIndex={setSentenceLabIndex}
                scrambledWords={scrambledWords}
                setScrambledWords={setScrambledWords}
                assembledSentence={assembledSentence}
                setAssembledSentence={setAssembledSentence}
                sentenceLabSuccess={sentenceLabSuccess}
                setSentenceLabSuccess={setSentenceLabSuccess}
                sentenceLabStage={sentenceLabStage}
                setSentenceLabStage={setSentenceLabStage}
                challengeAssembledSentence={challengeAssembledSentence}
                setChallengeAssembledSentence={setChallengeAssembledSentence}
                challengeScrambledWords={challengeScrambledWords}
                setChallengeScrambledWords={setChallengeScrambledWords}
                sentenceLabChallengeSuccess={sentenceLabChallengeSuccess}
                setSentenceLabChallengeSuccess={setSentenceLabChallengeSuccess}
                speakText={speakText}
              />
            )}

            {/* MODULE 4: MCQ & CHALLENGES */}
            {commSubTab === 'challenges' && (
              <MCQChallenges 
                practiceLanguage={practiceLanguage}
                setPracticeLanguage={setPracticeLanguage}
                mcqIndex={mcqIndex}
                setMcqIndex={setMcqIndex}
                mcqSelectedOption={mcqSelectedOption}
                setMcqSelectedOption={setMcqSelectedOption}
                mcqShowResult={mcqShowResult}
                setMcqShowResult={setMcqShowResult}
                mcqScore={mcqScore}
                setMcqScore={setMcqScore}
                mcqMistakeLog={mcqMistakeLog}
                setMcqMistakeLog={setMcqMistakeLog}
                mcqRevisionMode={mcqRevisionMode}
                setMcqRevisionMode={setMcqRevisionMode}
              />
            )}

            {/* MODULE 5: CONVERSATION PARTNER */}
            {commSubTab === 'chat' && (
              <ConversationPartner 
                chatLanguage={chatLanguage}
                setChatLanguage={setChatLanguage}
                chatLevel={chatLevel}
                setChatLevel={setChatLevel}
                chatMessages={chatMessages}
                setChatMessages={setChatMessages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                isSendingChatMessage={isSendingChatMessage}
                setIsSendingChatMessage={setIsSendingChatMessage}
                chatScenario={chatScenario}
                setChatScenario={setChatScenario}
                handleSendChatMessage={handleSendChatMessage}
              />
            )}

            {/* MODULE 6: SPEAKING ANALYSIS */}
            {commSubTab === 'speaking' && (
              <SpeakingAnalysis 
                isRecording={isRecording}
                setIsRecording={setIsRecording}
                recordingTime={recordingTime}
                startRecording={startRecording}
                stopRecording={stopRecording}
                speechResult={speechResult}
                setSpeechResult={setSpeechResult}
                writingText={writingText}
                setWritingText={setWritingText}
                writingContext={writingContext}
                setWritingContext={setWritingContext}
                isEvaluatingWriting={isEvaluatingWriting}
                handleEvaluateWriting={handleEvaluateWriting}
                writingResult={writingResult}
                setWritingResult={setWritingResult}
              />
            )}

            {/* MODULE 7: PROGRESS ANALYTICS */}
            {commSubTab === 'analytics' && (
              <ProgressAnalytics 
                commAnalytics={commAnalytics}
                isLoadingCommAnalytics={isLoadingCommAnalytics}
                fetchCommAnalytics={fetchCommAnalytics}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Communication;