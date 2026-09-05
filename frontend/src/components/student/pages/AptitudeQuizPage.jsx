
import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Info, Brain, Clock, Award, ImageOff } from 'lucide-react';
import { getCsrfToken, extractApiError } from '../../../lib/appUtils';
import FormattedText from '../../common/FormattedText';
import { useDrillDownParam } from '../../../lib/useDrillDownParam';

const AptitudeQuizPage = ({ topicId, onBack }) => {
  const [questions, setQuestions] = useState([]);

  // useDrillDownParam (not plain useState + replaceState) so the browser
  // Back button steps back through previously-viewed questions instead of
  // exiting the quiz — the previous replaceState-only version never
  // created a back-able history entry.
  const [currentIndex, setCurrentIndexRaw] = useDrillDownParam("q", {
    defaultValue: (() => {
      const saved = sessionStorage.getItem(`code2day-aptitude-question-index-${topicId}`);
      return saved ? parseInt(saved, 10) : 0;
    })(),
    parse: (v) => {
      const n = parseInt(v, 10);
      return !isNaN(n) && n >= 1 ? n - 1 : 0;
    },
    serialize: (v) => String(v + 1),
  });

  const setCurrentIndex = (val) => {
    const next = typeof val === 'function' ? val(currentIndex) : val;
    sessionStorage.setItem(`code2day-aptitude-question-index-${topicId}`, String(next));
    setCurrentIndexRaw(next);
  };

  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [score, setScore] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [startTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [finalTimeTaken, setFinalTimeTaken] = useState(null);

  useEffect(() => {
    if (showSummary) return; // stop ticking once practice is complete
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime, showSummary]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  
  // Filters — restored from sessionStorage per-topic so a refresh doesn't
  // silently reset to "All"/"all" and show a *different* question at the
  // same restored index (the index alone doesn't identify which question
  // it was; the filters that produced that ordering matter just as much).
  const [difficulty, setDifficulty] = useState(() => (
    sessionStorage.getItem(`code2day-aptitude-difficulty-${topicId}`) || 'All'
  ));
  const [status, setStatus] = useState(() => (
    sessionStorage.getItem(`code2day-aptitude-status-${topicId}`) || 'all'
  ));

  useEffect(() => {
    sessionStorage.setItem(`code2day-aptitude-difficulty-${topicId}`, difficulty);
  }, [topicId, difficulty]);

  useEffect(() => {
    sessionStorage.setItem(`code2day-aptitude-status-${topicId}`, status);
  }, [topicId, status]);

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    fetch(`/api/aptitude/questions/?topic_id=${topicId}&difficulty=${difficulty}&status=${status}`, { credentials: 'include' })
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && (data.detail || data.error)) || `Failed to load questions (HTTP ${res.status}).`);
        }
        return data;
      })
      .then(data => {
        const loadedQuestions = Array.isArray(data) ? data : [];
        setQuestions(loadedQuestions);
        
        const params = new URLSearchParams(window.location.search);
        const qParam = params.get("q");
        let targetIdx = -1;
        if (qParam) {
          const parsedQ = parseInt(qParam, 10);
          if (!isNaN(parsedQ) && parsedQ >= 1 && parsedQ <= loadedQuestions.length) {
            targetIdx = parsedQ - 1;
          }
        }
        if (targetIdx < 0) {
          const savedIdx = parseInt(sessionStorage.getItem(`code2day-aptitude-question-index-${topicId}`), 10);
          if (!isNaN(savedIdx) && savedIdx >= 0 && savedIdx < loadedQuestions.length) {
            targetIdx = savedIdx;
          } else {
            targetIdx = 0;
          }
        }
        
        setCurrentIndexRaw(targetIdx);
        sessionStorage.setItem(`code2day-aptitude-question-index-${topicId}`, String(targetIdx));
        const url = new URL(window.location.href);
        url.searchParams.set("q", String(targetIdx + 1));
        window.history.replaceState(window.history.state, "", url.href);
        
        setSelectedOption(null);
        setIsSubmitted(false);
        setResult(null);
        setShowAnswer(false);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching questions:", err);
        setLoadError(err.message || 'Failed to load questions.');
        setQuestions([]);
        setLoading(false);
      });
  }, [topicId, difficulty, status, reloadKey]);

  const handleSubmit = () => {
    if (!selectedOption || isSubmitted) return;

    const question = questions[currentIndex];
    setSubmitError('');

    fetch('/api/aptitude/questions/submit/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Shared helper (has a fetch-it-yourself fallback if the cookie
        // isn't set) — a hand-rolled document.cookie read here previously
        // sent an empty token whenever that cookie was missing, so the
        // server's CSRF-rejection body (no correct_option/explanation
        // fields) got treated as a real submit result, showing "the
        // correct answer is: undefined" instead of a visible error.
        'X-CSRFToken': getCsrfToken(),
      },
      body: JSON.stringify({
        question_id: question.id,
        selected_option: selectedOption
      }),
      credentials: 'include'
    })
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(extractApiError(data, `Failed to submit answer (HTTP ${res.status}).`));
        }
        return data;
      })
      .then(data => {
        setResult(data);
        setIsSubmitted(true);
        if (data.is_correct) {
          setScore(prev => prev + 1);
          setQuestions(prev =>
            prev.map((q, i) =>
              i === currentIndex ? { ...q, is_solved: true } : q
            )
          );
        }
      })
      .catch(err => {
        console.error("Error submitting answer:", err);
        setSubmitError(err.message || 'Failed to submit answer.');
      });
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsSubmitted(false);
      setResult(null);
      setShowAnswer(false);
      setSubmitError('');
    } else {
      setFinalTimeTaken(Math.floor((Date.now() - startTime) / 1000));
      setShowSummary(true);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spinner"></div>
        <p style={{ marginTop: '20px', color: 'var(--text-soft)' }}>Preparing your quiz...</p>
      </div>
    );
  }

  if (showSummary) {
    const timeTaken = finalTimeTaken ?? Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(timeTaken / 60);
    const seconds = timeTaken % 60;

    return (
      <div style={{ maxWidth: '600px', margin: '40px auto', padding: '40px', background: 'var(--bg-1)', borderRadius: '24px', textAlign: 'center', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--sage-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: 'var(--olive-900)' }}>
          <Award size={40} />
        </div>
        <h2 style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--olive-900)', marginBottom: '8px' }}>Practice Complete!</h2>
        <p style={{ color: 'var(--text-soft)', marginBottom: '32px' }}>Great job finishing this module.</p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '40px' }}>
          <div style={{ padding: '20px', background: 'var(--bg-2)', borderRadius: '16px', border: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--olive-900)' }}>{score}/{questions.length}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-soft)' }}>Total Score</div>
          </div>
          <div style={{ padding: '20px', background: 'var(--bg-2)', borderRadius: '16px', border: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--olive-900)' }}>{minutes}m {seconds}s</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-soft)' }}>Time Taken</div>
          </div>
        </div>

        <button onClick={onBack} className="primary-button" style={{ width: '100%', padding: '16px', borderRadius: '12px' }}>
          Return to Topics
        </button>
      </div>
    );
  }

  const currentQ = questions[currentIndex] || {};
  const options = currentQ.id ? [
    { key: 'A', value: currentQ.option_a, image: currentQ.option_a_image },
    { key: 'B', value: currentQ.option_b, image: currentQ.option_b_image },
    { key: 'C', value: currentQ.option_c, image: currentQ.option_c_image },
    { key: 'D', value: currentQ.option_d, image: currentQ.option_d_image }
  ] : [];

  const progress = questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  // Correct answer stays hidden after a wrong submission until the student
  // asks for it — a right answer has nothing left to hide, so it reveals
  // immediately.
  const revealed = Boolean(isSubmitted && (result?.is_correct || showAnswer));

  return (
    <div style={{ maxWidth: '1200px', margin: '20px auto', padding: '0 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-soft)', cursor: 'pointer', fontWeight: '600' }}>
          <ChevronLeft size={20} /> Exit Practice
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--olive-900)', fontWeight: '700' }}>
          <Brain size={20} />
          <span>{currentQ.topic}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--olive-700)', fontWeight: '700' }}>
          <Clock size={16} />
          <span style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>{formatTime(elapsedTime)}</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: 'var(--bg-2)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-soft)' }}>
          {['All', 'Easy', 'Medium', 'Hard'].map(lvl => (
            <button
              key={lvl}
              onClick={() => setDifficulty(lvl)}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                background: difficulty === lvl ? 'var(--olive-900)' : 'transparent',
                color: difficulty === lvl ? '#fff' : 'var(--text-soft)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '700',
                transition: 'all 0.2s ease'
              }}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', background: 'var(--bg-2)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-soft)' }}>
          {[
            { id: 'all', label: 'All Questions' },
            { id: 'unsolved', label: 'Unsolved' },
            { id: 'solved', label: 'Solved' }
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setStatus(s.id)}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                background: status === s.id ? 'var(--olive-900)' : 'transparent',
                color: status === s.id ? '#fff' : 'var(--text-soft)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: '700',
                transition: 'all 0.2s ease'
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Question Navigator */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-soft)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Question Navigator
          </h4>
          <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', fontWeight: '600' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' }}></div>
              <span style={{ color: 'var(--text-soft)' }}>Solved</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--olive-900)' }}></div>
              <span style={{ color: 'var(--text-soft)' }}>Current</span>
            </div>
          </div>
        </div>
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap', 
          padding: '16px', 
          background: 'white', 
          borderRadius: '16px', 
          border: '1px solid var(--border-soft)',
          maxHeight: '120px',
          overflowY: 'auto'
        }}>
          {questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => {
                setCurrentIndex(idx);
                setSelectedOption(null);
                setIsSubmitted(false);
                setResult(null);
                setShowAnswer(false);
                setSubmitError('');
              }}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                border: currentIndex === idx ? '2px solid var(--olive-900)' : '1px solid var(--border-soft)',
                background: currentIndex === idx ? 'var(--sage-100)' : q.is_solved ? '#dcfce7' : 'var(--bg-2)',
                color: currentIndex === idx ? 'var(--olive-900)' : q.is_solved ? '#15803d' : 'var(--text-soft)',
              }}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{ height: '8px', background: 'var(--bg-2)', borderRadius: '4px', marginBottom: '32px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: 'var(--olive-900)', width: `${progress}%`, transition: 'width 0.4s ease' }}></div>
      </div>

      {/* Question Card */}
      {questions.length > 0 ? (
        <>
          <div style={{ background: 'var(--bg-1)', borderRadius: '24px', border: '1px solid var(--border-soft)', padding: '40px', boxShadow: 'var(--shadow-soft)', marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
              <span style={{ background: 'var(--sage-200)', color: 'var(--olive-900)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '700' }}>
                Question {currentIndex + 1} of {questions.length}
              </span>
              <span style={{ color: 'var(--text-soft)', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Difficulty: {currentQ.difficulty}
                {currentQ.is_solved && <CheckCircle size={14} color="#22c55e" />}
              </span>
            </div>

            <h3 style={{ fontSize: '1.4rem', lineHeight: '1.5', fontWeight: '600', color: 'var(--text-main)', marginBottom: currentQ.question_image ? '16px' : '32px' }}>
              <FormattedText text={currentQ.question_text} />
            </h3>

            {currentQ.question_image && (
              <div style={{ marginBottom: '32px' }}>
                <img
                  src={currentQ.question_image}
                  alt="Question"
                  style={{ maxWidth: '100%', maxHeight: '360px', borderRadius: '12px', display: 'block' }}
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
                <div style={{ display: 'none', alignItems: 'center', gap: 8, padding: '14px 16px', borderRadius: '12px', background: 'var(--bg-2)', color: 'var(--text-soft)', fontSize: '0.85rem' }}>
                  <ImageOff size={16} /> Image couldn't be loaded.
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
              {options.map((opt) => {
                let bgColor = 'var(--bg-2)';
                let borderColor = 'var(--border-soft)';
                let textColor = 'var(--text-main)';
                let boxShadow = 'none';

                if (selectedOption === opt.key) {
                  bgColor = 'var(--sage-100)';
                  borderColor = 'var(--olive-400)';
                  textColor = 'var(--olive-900)';
                }

                if (isSubmitted) {
                  if (revealed && opt.key === result.correct_option) {
                    bgColor = '#dcfce7'; // Success green
                    borderColor = '#22c55e';
                    if (selectedOption !== opt.key) {
                      boxShadow = '0 0 15px rgba(34, 197, 94, 0.4)'; // Glow for correct answer if missed
                    }
                  } else if (selectedOption === opt.key) {
                    bgColor = '#fee2e2'; // Error red
                    borderColor = '#ef4444';
                  }
                }

                return (
                  <button
                    key={opt.key}
                    disabled={isSubmitted}
                    onClick={() => setSelectedOption(opt.key)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '16px 20px',
                      borderRadius: '16px',
                      border: `2px solid ${borderColor}`,
                      background: bgColor,
                      color: textColor,
                      boxShadow: boxShadow,
                      cursor: isSubmitted ? 'default' : 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.2s ease',
                      fontSize: '1.1rem',
                      fontWeight: '500'
                    }}
                  >
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: '800', border: '1px solid var(--border-soft)', flexShrink: 0 }}>
                      {opt.key}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <FormattedText text={opt.value} />
                      {opt.image && (
                        <div>
                          <img
                            src={opt.image}
                            alt={`Option ${opt.key}`}
                            style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '8px', display: 'block' }}
                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                          />
                          <div style={{ display: 'none', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-1)', color: 'var(--text-soft)', fontSize: '0.75rem' }}>
                            <ImageOff size={13} /> Image couldn't be loaded.
                          </div>
                        </div>
                      )}
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      {revealed && opt.key === result.correct_option && <CheckCircle size={20} color="#22c55e" />}
                      {isSubmitted && selectedOption === opt.key && opt.key !== result.correct_option && <XCircle size={20} color="#ef4444" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {isSubmitted && (
              <div style={{
                marginTop: '32px',
                padding: '24px',
                background: result.is_correct ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                borderRadius: '20px',
                border: `1px solid ${result.is_correct ? '#22c55e' : '#ef4444'}`,
                animation: 'slideUp 0.4s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: revealed ? '12px' : 0 }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: result.is_correct ? '#22c55e' : '#ef4444',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                  }}>
                    {result.is_correct ? <CheckCircle size={18} /> : <Info size={18} />}
                  </div>
                  <span style={{ fontWeight: '800', fontSize: '1.1rem', color: result.is_correct ? '#166534' : '#991b1b' }}>
                    {result.is_correct
                      ? 'Brilliant! Correct Answer'
                      : revealed
                        ? `Incorrect. The correct answer is: ${result.correct_option}. ${options.find(o => o.key === result.correct_option)?.value || ''}`
                        : 'Incorrect answer.'}
                  </span>
                </div>

                {!revealed && (
                  <button
                    onClick={() => setShowAnswer(true)}
                    className="secondary-button"
                    style={{ marginLeft: '42px', padding: '10px 20px', borderRadius: '10px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <Info size={16} /> Show Answer &amp; Explanation
                  </button>
                )}

                {revealed && (
                  <div style={{ paddingLeft: '42px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Explanation:</h4>
                    <p style={{ color: 'var(--text-main)', margin: 0, fontSize: '1rem', lineHeight: '1.6', fontWeight: '500' }}>
                      {result.explanation && result.explanation !== 'nan' ? <FormattedText text={result.explanation} /> : "Analyze the question logic carefully. Review the core concepts for this topic if you're stuck!"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {submitError && (
            <div style={{ marginTop: '20px', padding: '12px 16px', background: '#fef2f2', color: '#dc2626', borderRadius: '12px', fontWeight: 600, fontSize: '0.9rem' }}>
              {submitError}
            </div>
          )}

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
            {!isSubmitted ? (
              <button 
                disabled={!selectedOption} 
                onClick={handleSubmit} 
                className="primary-button" 
                style={{ padding: '16px 60px', borderRadius: '16px', fontSize: '1.1rem', fontWeight: '700', opacity: selectedOption ? 1 : 0.5 }}
              >
                Submit Answer
              </button>
            ) : (
              <button 
                onClick={handleNext} 
                className="primary-button" 
                style={{ 
                  padding: '16px 60px', 
                  borderRadius: '16px', 
                  fontSize: '1.1rem', 
                  fontWeight: '700', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '12px',
                  background: 'var(--olive-900)',
                  boxShadow: '0 10px 20px rgba(57, 72, 42, 0.2)'
                }}
              >
                {currentIndex === questions.length - 1 ? 'Finish Practice' : 'Next Question'} <ChevronRight size={22} />
              </button>
            )}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '80px 40px', background: 'white', borderRadius: '24px', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)' }}>
          <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: loadError ? '#fef2f2' : 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: loadError ? '#dc2626' : 'var(--text-soft)' }}>
            <Info size={40} />
          </div>
          {loadError ? (
            <>
              <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#dc2626', marginBottom: '12px' }}>Couldn't Load Questions</h2>
              <p style={{ color: 'var(--text-soft)', fontSize: '1.1rem', maxWidth: '400px', margin: '0 auto 32px' }}>
                {loadError}
              </p>
              <button
                onClick={() => setReloadKey(k => k + 1)}
                className="secondary-button"
                style={{ padding: '12px 32px', borderRadius: '12px' }}
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <h2 style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--olive-900)', marginBottom: '12px' }}>No Questions Found</h2>
              <p style={{ color: 'var(--text-soft)', fontSize: '1.1rem', maxWidth: '400px', margin: '0 auto 32px' }}>
                We couldn't find any questions matching your current filters. Try selecting a different difficulty or status.
              </p>
              <button
                onClick={() => { setDifficulty('All'); setStatus('all'); }}
                className="secondary-button"
                style={{ padding: '12px 32px', borderRadius: '12px' }}
              >
                Reset All Filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AptitudeQuizPage;
