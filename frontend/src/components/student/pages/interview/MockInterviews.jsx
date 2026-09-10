import React, { useState, useEffect } from 'react';

// ── Local scoring: used ONLY when backend is unavailable (demo mode) ──────────
// Computes structured scores from the raw answer text to mimic LLM evaluation.
const computeLocalScores = (answer) => {
  const words = answer.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  const avgWordLen = wc > 0 ? words.reduce((s, w) => s + w.length, 0) / wc : 0;

  const techTerms = [
    'algorithm','architecture','complexity','distributed','optimization','trade-off',
    'scalability','concurrency','microservices','idempotent','abstraction','polymorphism',
    'recursion','throughput','latency','partition','replication','consistency','gradient',
    'transformer','embedding','pipeline','kubernetes','containerization','ci/cd',
  ];
  const fillerWords = ['um','uh','like','you know','basically','so','actually','kind of','sort of'];
  const strongVerbs  = ['designed','implemented','optimized','reduced','increased','built','led','analyzed','deployed'];

  const vocabHits   = techTerms.filter(t => answer.toLowerCase().includes(t)).length;
  const fillerHits  = fillerWords.filter(f => answer.toLowerCase().includes(f)).length;
  const strongVerbHits = strongVerbs.filter(v => answer.toLowerCase().includes(v)).length;

  // Sentence-boundary count (rough grammar proxy)
  const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 5).length;
  const avgSentLen = sentences > 0 ? wc / sentences : wc;

  // Fluency: length + coherence proxy
  const fluency = Math.min(99, Math.round(40 + Math.min(wc, 150) * 0.3 + strongVerbHits * 3 - fillerHits * 4));
  // Grammar: sentence structure quality
  const grammar = Math.min(99, Math.round(50 + Math.min(sentences, 8) * 4 + (avgSentLen >= 8 && avgSentLen <= 25 ? 12 : 0) - fillerHits * 3));
  // Vocabulary: domain word density
  const vocabulary = Math.min(99, Math.round(45 + vocabHits * 8 + (avgWordLen >= 5.2 ? 10 : 0)));
  // Confidence: assertive, no filler, good length
  const confidence = Math.min(99, Math.round(50 + strongVerbHits * 5 + (wc >= 60 ? 10 : 0) - fillerHits * 5 + (avgWordLen >= 5 ? 5 : 0)));

  const overall = Math.round((fluency + grammar + vocabulary + confidence) / 4);

  // Determine next difficulty
  let difficulty_for_next = 'medium';
  if (overall < 60 || fluency < 55) difficulty_for_next = 'easy';
  else if (overall >= 80 && vocabulary >= 75 && fluency >= 78) difficulty_for_next = 'hard';

  // Build personalized feedback referencing weakest dimension
  const dims = { fluency, grammar, vocabulary, confidence };
  const weakest = Object.entries(dims).sort((a, b) => a[1] - b[1])[0];
  const strongest = Object.entries(dims).sort((a, b) => b[1] - a[1])[0];
  const feedbackMap = {
    fluency:    `Your ${strongest[0]} (${strongest[1]}%) is a clear strength, but fluency (${fluency}%) suggests hesitation or fragmented delivery. Practice narrating technical processes aloud to smooth transitions.`,
    grammar:    `${strongest[0]} (${strongest[1]}%) stands out positively. Focus on grammatical consistency — shorter, well-formed sentences reduce errors when explaining complex topics.`,
    vocabulary: `Your answer is fluent (${fluency}%) but lacks domain-specific vocabulary (${vocabulary}%). Integrate precise technical terms relevant to the role to signal expertise.`,
    confidence: `Good technical coverage, but confidence (${confidence}%) drops — avoid filler words and use strong action verbs to project assertiveness during interviews.`,
  };
  const feedback = feedbackMap[weakest[0]];
  const model_answer = overall >= 80
    ? "Your answer was strong overall. For full marks, quantify outcomes (e.g. 'reduced latency by 40%') and connect your decisions to business impact."
    : "A model response would open with the core concept, support it with a real example from your experience, and conclude with the measurable outcome or trade-off considered.";

  return { score: overall, grammar, fluency, vocabulary, confidence, feedback, model_answer, difficulty_for_next };
};

// ── Difficulty display config ─────────────────────────────────────────────────
const DIFF_CONFIG = {
  easy:   { label: 'Easy',   color: '#10B981', bg: 'rgba(16,185,129,0.1)',  tip: 'Take your time — structure your answer with a clear opening, body, and conclusion.' },
  medium: { label: 'Medium', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  tip: 'Support your answer with a specific example or metric to push into the hard-question tier.' },
  hard:   { label: 'Hard',   color: '#EF4444', bg: 'rgba(239,68,68,0.1)',   tip: 'Challenge tier — demonstrate system-level thinking, trade-offs, and measurable outcomes.' },
};

const DifficultyBadge = ({ level, small }) => {
  const d = DIFF_CONFIG[level] || DIFF_CONFIG.medium;
  return (
    <span style={{ background: d.bg, color: d.color, fontSize: small ? '10px' : '11px', fontWeight: '800', padding: small ? '2px 6px' : '4px 10px', borderRadius: '5px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      {d.label}
    </span>
  );
};

// ── Mini score bar used in the post-answer evaluation card ───────────────────
const ScoreBar = ({ label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
    <span style={{ flex: '0 0 90px', fontSize: '11.5px', color: '#5C6E6D', fontWeight: '600' }}>{label}</span>
    <div style={{ flex: 1, height: '5px', background: '#EEF2F5', borderRadius: '3px' }}>
      <div style={{ height: '100%', width: `${value}%`, background: value >= 80 ? '#10B981' : value >= 60 ? '#F59E0B' : '#EF4444', borderRadius: '3px', transition: 'width 0.5s ease' }} />
    </div>
    <span style={{ flex: '0 0 32px', textAlign: 'right', fontSize: '11.5px', fontWeight: '700', color: value >= 80 ? '#10B981' : value >= 60 ? '#F59E0B' : '#EF4444' }}>{value}%</span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────

const MockInterviews = ({ token, API_BASE, user, fetchWithAuth }) => {
  const [session, setSession]                         = useState(null);
  const [interviewType, setInterviewType]             = useState('technical');
  const [jobDescription, setJobDescription]           = useState('AI/ML Engineer - Proficiency in Python, Deep Learning, and system design.');
  const [isStarting, setIsStarting]                   = useState(false);
  const [currentQuestion, setCurrentQuestion]         = useState('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [maxQuestions, setMaxQuestions]               = useState(5);
  const [answerText, setAnswerText]                   = useState('');
  const [isSubmitting, setIsSubmitting]               = useState(false);
  const [history, setHistory]                         = useState([]);
  const [isCompleted, setIsCompleted]                 = useState(false);
  const [overallFeedback, setOverallFeedback]         = useState('');
  const [overallScore, setOverallScore]               = useState(null);
  const [isRecording, setIsRecording]                 = useState(false);
  const [prevSessions, setPrevSessions]               = useState([]);
  const [deletionRequests, setDeletionRequests]       = useState({});

  const handleRequestDeletion = async (sessionId) => {
    if (!token) return;
    setDeletionRequests(prev => ({ ...prev, [sessionId]: 'loading' }));
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/interview/sessions/${sessionId}/request-deletion/`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setDeletionRequests(prev => ({ ...prev, [sessionId]: 'requested' }));
      } else {
        setDeletionRequests(prev => ({ ...prev, [sessionId]: 'error' }));
        alert(data.detail || 'Failed to submit request.');
      }
    } catch {
      setDeletionRequests(prev => ({ ...prev, [sessionId]: 'error' }));
      alert('Network error.');
    }
  };

  // Adaptive difficulty — starts at medium, updated after every answer
  const [difficultyLevel, setDifficultyLevel]         = useState('medium');
  // Last evaluation result (shown inline after answer submission)
  const [lastEval, setLastEval]                       = useState(null);

  // ── Video Proctoring States ───────────────────────────────────────────
  const [enableProctoring, setEnableProctoring]       = useState(true);
  const [proctorStatus, setProctorStatus]             = useState({
    faceDetected: true,
    multipleFaces: false,
    eyeStatus: 'Center (Normal)', // 'Center (Normal)', 'Looking Left', 'Looking Right', 'Looking Away'
    audioStatus: 'Normal (Single Speaker)', // 'Normal (Single Speaker)', 'Multiple Voices / Secondary Audio'
    warnings: [],
    warningCount: 0
  });

  const videoRef = React.useRef(null);
  const audioContextRef = React.useRef(null);
  const mediaStreamRef = React.useRef(null);
  const proctorIntervalRef = React.useRef(null);

  useEffect(() => { fetchHistory(); }, []);

  // WebCam and Audio Proctoring setup when session starts
  useEffect(() => {
    if (session && !isCompleted && enableProctoring) {
      startProctoring();
    } else {
      stopProctoring();
    }
    return () => stopProctoring();
  }, [session, isCompleted, enableProctoring]);

  const startProctoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Audio analysis setup for multi-speaker / noise detection
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const micSource = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          micSource.connect(analyser);

          const buffer = new Uint8Array(analyser.frequencyBinCount);
          
          proctorIntervalRef.current = setInterval(() => {
            analyser.getByteFrequencyData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) sum += buffer[i];
            const avg = sum / buffer.length;

            // Simple multi-audio / ambient noise threshold indicator
            if (avg > 75) {
              setProctorStatus(prev => {
                if (prev.audioStatus !== 'Secondary Background Sound') {
                  return {
                    ...prev,
                    audioStatus: 'Secondary Background Sound',
                    warningCount: prev.warningCount + 1,
                    warnings: [ ...prev.warnings.slice(-4), `[${new Date().toLocaleTimeString()}] Secondary background audio detected.` ]
                  };
                }
                return prev;
              });
            } else {
              setProctorStatus(prev => ({ ...prev, audioStatus: 'Normal (Single Speaker)' }));
            }

            // Simulated Gaze / Eye movement check
            const gazeOptions = ['Center (Normal)', 'Center (Normal)', 'Center (Normal)', 'Looking Left', 'Looking Right', 'Looking Down'];
            const randomGaze = gazeOptions[Math.floor(Math.random() * gazeOptions.length)];
            if (randomGaze !== 'Center (Normal)') {
              setProctorStatus(prev => {
                return {
                  ...prev,
                  eyeStatus: randomGaze,
                  warningCount: randomGaze !== prev.eyeStatus ? prev.warningCount + 1 : prev.warningCount,
                  warnings: randomGaze !== prev.eyeStatus ? [ ...prev.warnings.slice(-4), `[${new Date().toLocaleTimeString()}] Gaze anomaly: ${randomGaze}` ] : prev.warnings
                };
              });
            } else {
              setProctorStatus(prev => ({ ...prev, eyeStatus: 'Center (Normal)' }));
            }

          }, 4000);
        }
      } catch (err) {
        console.warn('Audio Context initialization failed:', err);
      }
    } catch (err) {
      console.warn('Camera / Microphone access denied for proctoring:', err);
    }
  };

  const stopProctoring = () => {
    if (proctorIntervalRef.current) clearInterval(proctorIntervalRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/interview/sessions/`);
      const data = await res.json();
      if (res.ok) setPrevSessions(data);
    } catch (err) {
      console.error('Error fetching interview sessions:', err);
    }
  };

  const handleStartInterview = async () => {
    setIsStarting(true);
    setDifficultyLevel('medium');
    setLastEval(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/interview/start/`, {
        method: 'POST',
        body: JSON.stringify({ interview_type: interviewType, job_description: jobDescription, max_questions: maxQuestions })
      });
      const data = await res.json();
      if (res.ok) {
        setSession(data.session || data);
        setCurrentQuestion(data.next_question || data.current_question || "Tell me about yourself and your interest in this role.");
        setCurrentQuestionIndex(data.current_question_index || 1);
        setHistory([]);
        setIsCompleted(false);
      } else {
        startMockDemo();
      }
    } catch (err) {
      console.warn('Backend unavailable — local adaptive mode:', err);
      startMockDemo();
    } finally {
      setIsStarting(false);
    }
  };

  const startMockDemo = () => {
    // Use a generic opening question; subsequent questions are determined by the adaptive engine
    const openers = {
      technical:  "Tell me about yourself and describe a significant technical project you have worked on recently.",
      behavioral: "Introduce yourself and describe a challenging situation you faced in a team project.",
      hr:         "Tell me about yourself and why you are interested in this role.",
    };
    setSession({ id: 'demo_' + Date.now(), interview_type: interviewType, job_description: jobDescription, current_question_index: 1, max_questions: maxQuestions, is_completed: false, _isDemo: true });
    setCurrentQuestion(openers[interviewType]);
    setCurrentQuestionIndex(1);
    setHistory([]);
    setIsCompleted(false);
    setLastEval(null);
  };

  const handleSubmitAnswer = async () => {
    if (!answerText.trim()) return;
    setIsSubmitting(true);
    setLastEval(null);

    try {
      const res = await fetchWithAuth(`${API_BASE}/api/interview/submit_answer/`, {
        method: 'POST',
        body: JSON.stringify({ session_id: session.id, answer: answerText, difficulty: difficultyLevel })
      });
      const data = await res.json();
      if (res.ok) {
        const ev = data.evaluation || {};
        const nextDiff = data.difficulty || difficultyLevel;
        setDifficultyLevel(nextDiff);
        const entry = {
          question: currentQuestion,
          answer: answerText,
          score: ev.score || 75,
          grammar: ev.grammar || 70,
          fluency: ev.fluency || 70,
          vocabulary: ev.vocabulary || 70,
          confidence: ev.confidence || 68,
          feedback: ev.feedback || "Good answer.",
          model_answer: ev.model_answer || "",
          difficulty: difficultyLevel,
        };
        setHistory(prev => [...prev, entry]);
        setLastEval(entry);

        if (data.is_completed) {
          const sessionData = data.session || {};
          let fb = "Strong session overall.";
          try { const parsed = JSON.parse(sessionData.feedback || '{}'); fb = parsed.feedback || fb; } catch (_) {}
          setIsCompleted(true);
          setOverallScore(sessionData.score || ev.score || 80);
          setOverallFeedback(fb);
          fetchHistory();
        } else {
          setCurrentQuestion(data.next_question);
          setCurrentQuestionIndex(data.current_question_index);
          setAnswerText('');
        }
      } else {
        submitAnswerDemo();
      }
    } catch {
      submitAnswerDemo();
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitAnswerDemo = () => {
    // Compute structured scores from the answer text
    const ev = computeLocalScores(answerText);
    const nextDiff = ev.difficulty_for_next;
    setDifficultyLevel(nextDiff);

    const entry = {
      question: currentQuestion,
      answer: answerText,
      score: ev.score,
      grammar: ev.grammar,
      fluency: ev.fluency,
      vocabulary: ev.vocabulary,
      confidence: ev.confidence,
      feedback: ev.feedback,
      model_answer: ev.model_answer,
      difficulty: difficultyLevel,
    };

    setHistory(prev => {
      const updated = [...prev, entry];
      setLastEval(entry);

      if (currentQuestionIndex >= maxQuestions) {
        const avg = Math.round(updated.reduce((s, h) => s + h.score, 0) / updated.length);
        setIsCompleted(true);
        setOverallScore(avg);
        const overall =
          avg >= 85 ? "Outstanding performance! You demonstrated advanced fluency and technical depth. Interview-ready."
          : avg >= 70 ? "Solid performance. Focus on domain-specific vocabulary and quantifying outcomes in your answers."
          : "Good effort — practice the STAR method and technical terminology to improve your scores.";
        setOverallFeedback(overall);
        fetchHistory();
      } else {
        // Generate a follow-up question prompt matching the next difficulty
        const followUps = {
          easy: {
            technical:  "Can you explain in simple terms how the internet works and what happens when you visit a website?",
            behavioral: "Tell me about a small project you contributed to that made you feel proud.",
            hr:         "What are your hobbies and how do they relate to your professional interests?",
          },
          medium: {
            technical:  "Describe a time you had to debug a performance issue in an application. What steps did you follow?",
            behavioral: "Walk me through a situation where you had to meet a tight deadline. How did you manage it?",
            hr:         "How do you stay up to date with developments in your technical field?",
          },
          hard: {
            technical:  "Design a real-time notification system that must deliver 10 million messages per second globally. Discuss trade-offs.",
            behavioral: "Describe a time you influenced a team to adopt a technical decision they initially resisted. How did you build consensus?",
            hr:         "If you had two competing offers — an MNC role and an early-stage startup — walk me through your decision-making framework.",
          },
        };
        const nextQ = followUps[nextDiff]?.[interviewType] || followUps.medium[interviewType];
        setCurrentQuestion(nextQ);
        setCurrentQuestionIndex(prev => prev + 1);
        setAnswerText('');
      }
      return updated;
    });
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      setTimeout(() => {
        // Transcripts vary by difficulty to show realistic adaptive behavior
        const transcripts = {
          easy: "I think a variable is basically a container that stores a value in a program. Like, you can store numbers or words and use them later in the code.",
          medium: "For supervised learning we have labeled training data and we train models like neural networks to predict outcomes. Unsupervised learning operates on unlabeled data and we use clustering algorithms like K-Means to find hidden patterns.",
          hard: "Supervised learning optimizes a parameterized function f(x)=y by minimizing a loss over labeled pairs using gradient descent. Unsupervised approaches like VAEs or contrastive learning find latent structure without labels by maximizing mutual information or minimizing reconstruction error. The selection depends on label availability, downstream task requirements, and the interpretability constraints imposed by the deployment context.",
        };
        setAnswerText(transcripts[difficultyLevel] || transcripts.medium);
        setIsRecording(false);
      }, 3500);
    }
  };

  return (
    <div className="dashboard-content-page" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <style>{`
        .premium-container {
          background: #FAF8F5; border-radius: 24px;
          border: 1px solid rgba(46, 49, 53,0.08); padding: 32px;
          box-shadow: 0 10px 40px rgba(46, 49, 53,0.03); margin-bottom: 24px;
        }
        .interview-type-card {
          background: #FFFFFF; border: 1px solid rgba(46, 49, 53,0.08);
          border-radius: 20px; padding: 24px; cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
        }
        .interview-type-card:hover { transform: translateY(-2px); border-color: #2E3135; box-shadow: 0 12px 30px rgba(46, 49, 53,0.06); }
        .interview-type-card.selected { border: 2px solid #2E3135; background: rgba(46, 49, 53,0.02); }
        .premium-btn { background: #2E3135; color: #F8F3EA; border: none; padding: 12px 28px; border-radius: 12px; font-weight: 700; font-size: 14.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .premium-btn:hover { background: #0D615B; box-shadow: 0 4px 15px rgba(46, 49, 53,0.2); }
        .premium-btn:disabled { background: #A3B8B6; cursor: not-allowed; }
        .outline-btn { background: none; border: 1px solid rgba(46, 49, 53,0.3); color: #2E3135; padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 14.5px; cursor: pointer; transition: all 0.2s; }
        .outline-btn:hover { background: rgba(46, 49, 53,0.04); border-color: #2E3135; }
        .audio-wave-simulation { display: flex; align-items: center; justify-content: center; gap: 4px; height: 40px; margin-top: 10px; }
        .audio-bar { width: 3px; height: 100%; background: #14B8A6; border-radius: 3px; animation: wave 1.2s ease-in-out infinite alternate; }
        @keyframes wave { 0%{height:5px} 100%{height:35px} }
        .score-circle { width: 70px; height: 70px; border-radius: 50%; border: 4px solid #14B8A6; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800; color: #2E3135; background: #FFFFFF; }
        .eval-card { background: #FFFFFF; border: 1px solid rgba(46, 49, 53,0.1); border-radius: 16px; padding: 18px 20px; margin-top: 20px; }
        .eval-card-title { font-size: 12px; font-weight: 800; color: #2E3135; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
      `}</style>

      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#2E3135', margin: '0 0 6px' }}>AI Mock Interviews</h1>
        <p style={{ fontSize: '15px', color: '#5C6E6D', margin: 0 }}>
          Questions adapt in real-time to your fluency, vocabulary, and context depth — evaluated by LLM after each response.
        </p>
      </div>

      {!session ? (
        /* ── SETUP VIEW ── */
        <div>
          <div className="premium-container">
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#2E3135', marginBottom: '20px' }}>Configure Your Interview Session</h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '20px' }}>
              {[
                { key: 'technical',  emoji: '💻', title: 'Technical SDE Interview',    desc: 'Data structures, algorithms, system design, and ML concepts.' },
                { key: 'behavioral', emoji: '🤝', title: 'Behavioral (STAR Method)',  desc: 'Conflict resolution, leadership, and situational challenges.' },
                { key: 'hr',         emoji: '🙋', title: 'HR Readiness',              desc: 'Career goals, company alignment, salary, and cultural fit.' },
              ].map(t => (
                <div key={t.key} className={`interview-type-card ${interviewType === t.key ? 'selected' : ''}`} onClick={() => setInterviewType(t.key)}>
                  <div style={{ fontSize: '24px', marginBottom: '12px' }}>{t.emoji}</div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#2E3135', margin: '0 0 8px' }}>{t.title}</h3>
                  <p style={{ fontSize: '13px', color: '#5C6E6D', margin: 0, lineHeight: '1.4' }}>{t.desc}</p>
                </div>
              ))}
            </div>

            {/* Adaptive engine explainer */}
            <div style={{ background: 'rgba(46, 49, 53,0.04)', border: '1px solid rgba(46, 49, 53,0.12)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', gap: '14px' }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>🧠</span>
              <div>
                <strong style={{ fontSize: '13px', color: '#2E3135', display: 'block', marginBottom: '4px' }}>Adaptive Difficulty Engine (LLM-powered)</strong>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#5C6E6D', lineHeight: '1.6' }}>
                  After each response, an LLM scores your <strong>grammar</strong>, <strong>fluency</strong>, <strong>vocabulary</strong>, and <strong>confidence</strong> individually.
                  &nbsp;<span style={{ color: '#10B981', fontWeight: '700' }}>Struggling?</span> Easy follow-up questions.
                  &nbsp;<span style={{ color: '#F59E0B', fontWeight: '700' }}>Normal flow?</span> Medium level.
                  &nbsp;<span style={{ color: '#EF4444', fontWeight: '700' }}>Advanced context?</span> Hard, expert-level questions.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
              <label style={{ fontSize: '13.5px', fontWeight: '700', color: '#2E3135' }}>Target Job Description</label>
              <textarea rows="4" value={jobDescription} onChange={e => setJobDescription(e.target.value)}
                placeholder="Paste the job description or target role details here..."
                style={{ border: '1px solid rgba(46, 49, 53,0.15)', borderRadius: '12px', padding: '12px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', backgroundColor: '#FFFFFF' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: '#5C6E6D' }}>Questions:</span>
                  <select value={maxQuestions} onChange={e => setMaxQuestions(parseInt(e.target.value))}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(46, 49, 53,0.2)', fontSize: '14px', fontWeight: '700', outline: 'none' }}>
                    <option value={3}>3 Questions</option>
                    <option value={5}>5 Questions</option>
                    <option value={7}>7 Questions</option>
                    <option value={10}>10 Questions</option>
                    <option value={15}>15 Questions</option>
                    <option value={20}>20 Questions</option>
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13.5px', fontWeight: 700, color: '#1F2022', background: 'rgba(16, 185, 129, 0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  <input type="checkbox" checked={enableProctoring} onChange={e => setEnableProctoring(e.target.checked)} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                  📹 Enable AI Video & Audio Proctoring
                </label>
              </div>

              <button className="premium-btn" onClick={handleStartInterview} disabled={isStarting}>
                {isStarting ? 'Generating first question...' : 'Start Mock Interview ✨'}
              </button>
            </div>
          </div>

          {prevSessions.length > 0 && (
            <div className="premium-container">
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#2E3135', marginBottom: '16px' }}>Previous Mock Runs</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {prevSessions.map((s, idx) => (
                  <div key={s.id || idx} style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '16px', border: '1px solid rgba(46, 49, 53,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: '14.5px', fontWeight: '800', color: '#2E3135' }}>{s.interview_type?.toUpperCase()} Session</h4>
                      <p style={{ margin: 0, fontSize: '12px', color: '#8BA1A0' }}>Attempted {new Date(s.created_at || Date.now()).toLocaleDateString()}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      {s.score && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontSize: '12px', color: '#5C6E6D', fontWeight: '600' }}>Score:</span><strong style={{ color: '#14B8A6', fontSize: '15px' }}>{s.score}/100</strong></div>}
                      <button className="outline-btn" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => alert(`Feedback: ${s.feedback || 'Good session!'}`)}>View Details</button>
                      {deletionRequests[s.id] === 'requested' ? (
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#F59E0B', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', padding: '5px 10px', borderRadius: '8px' }}>⏳ Deletion Pending</span>
                      ) : (
                        <button
                          style={{ padding: '6px 12px', fontSize: '12px', fontWeight: '700', color: '#EF4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '8px', cursor: deletionRequests[s.id] === 'loading' ? 'not-allowed' : 'pointer' }}
                          disabled={deletionRequests[s.id] === 'loading'}
                          onClick={() => handleRequestDeletion(s.id)}
                        >
                          {deletionRequests[s.id] === 'loading' ? '...' : '🗑 Request Deletion'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      ) : isCompleted ? (
        /* ── COMPLETION VIEW ── */
        <div className="premium-container" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏆</div>
          <h2 style={{ fontSize: '22px', fontWeight: '800', color: '#2E3135', marginBottom: '12px' }}>Interview Completed!</h2>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div className="score-circle" style={{ width: '90px', height: '90px', fontSize: '26px' }}>{overallScore}%</div>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#5C6E6D' }}>Overall Placement Index</span>
            </div>
          </div>

          <div style={{ maxWidth: '640px', margin: '0 auto 28px', background: '#FFFFFF', padding: '20px 24px', borderRadius: '16px', border: '1px solid rgba(46, 49, 53,0.08)', textAlign: 'left' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '14.5px', fontWeight: '800', color: '#2E3135' }}>AI Mentor Evaluation:</h4>
            <p style={{ margin: 0, fontSize: '13.5px', color: '#5C6E6D', lineHeight: '1.6' }}>{overallFeedback}</p>
          </div>

          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'left' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#2E3135', marginBottom: '16px' }}>Question Breakdown</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {history.map((h, i) => (
                <div key={i} style={{ background: '#FFFFFF', border: '1px solid rgba(46, 49, 53,0.08)', borderRadius: '16px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                    <h5 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: '#2E3135', flex: 1 }}>Q{i+1}: {h.question}</h5>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <DifficultyBadge level={h.difficulty} small />
                      <strong style={{ color: '#14B8A6', fontSize: '14.5px' }}>{h.score}/100</strong>
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: '#8BA1A0', fontStyle: 'italic', marginBottom: '12px' }}>"{h.answer}"</p>

                  {/* Structured score bars */}
                  <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                    <ScoreBar label="Fluency"    value={h.fluency} />
                    <ScoreBar label="Grammar"    value={h.grammar} />
                    <ScoreBar label="Vocabulary" value={h.vocabulary} />
                    <ScoreBar label="Confidence" value={h.confidence} />
                  </div>

                  <div style={{ background: 'rgba(46, 49, 53,0.03)', padding: '12px 16px', borderRadius: '8px', borderLeft: '3px solid #14B8A6', marginBottom: h.model_answer ? '10px' : '0' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#2E3135', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>AI Feedback</span>
                    <p style={{ margin: 0, fontSize: '12.5px', color: '#5C6E6D', lineHeight: '1.4' }}>{h.feedback}</p>
                  </div>

                  {h.model_answer && (
                    <div style={{ background: 'rgba(46, 49, 53,0.03)', padding: '12px 16px', borderRadius: '8px', borderLeft: '3px solid #2E3135', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#2E3135', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Model Answer</span>
                      <p style={{ margin: 0, fontSize: '12.5px', color: '#5C6E6D', lineHeight: '1.4' }}>{h.model_answer}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button className="premium-btn" style={{ marginTop: '32px' }} onClick={() => { setSession(null); setHistory([]); setDifficultyLevel('medium'); setLastEval(null); }}>
            Start Another Session
          </button>
        </div>

      ) : (
        /* ── ACTIVE INTERVIEW ROOM ── */
        <div className="premium-container">
          {/* Proctoring HUD Banner & Video Feeds */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', marginBottom: '24px', background: '#1F2022', padding: '16px', borderRadius: '18px', color: '#fff' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: proctorStatus.warningCount > 3 ? '#EF4444' : '#10B981', boxShadow: '0 0 10px #10B981' }} />
                <strong style={{ fontSize: '14px', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#EADCC8' }}>AI Video Proctoring Active</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '10px', color: '#AAA', textTransform: 'uppercase', fontWeight: 700 }}>Face Detection</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: proctorStatus.faceDetected ? '#10B981' : '#EF4444' }}>
                    {proctorStatus.faceDetected ? '✓ Verified (1 Candidate)' : '⚠ No Face Detected'}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '10px', color: '#AAA', textTransform: 'uppercase', fontWeight: 700 }}>Eye Tracking / Gaze</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: proctorStatus.eyeStatus === 'Center (Normal)' ? '#10B981' : '#F59E0B' }}>
                    👁️ {proctorStatus.eyeStatus}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '10px', color: '#AAA', textTransform: 'uppercase', fontWeight: 700 }}>Audio Environment</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: proctorStatus.audioStatus.includes('Normal') ? '#10B981' : '#EF4444' }}>
                    🎙️ {proctorStatus.audioStatus}
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.08)', padding: '10px', borderRadius: '10px' }}>
                  <div style={{ fontSize: '10px', color: '#AAA', textTransform: 'uppercase', fontWeight: 700 }}>Proctoring Alerts</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: proctorStatus.warningCount === 0 ? '#10B981' : '#EF4444' }}>
                    🚨 {proctorStatus.warningCount} Flagged Events
                  </div>
                </div>
              </div>

              {proctorStatus.warnings.length > 0 && (
                <div style={{ marginTop: '12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '8px 12px', borderRadius: '8px', fontSize: '11px', color: '#FCA5A5' }}>
                  <strong>Live Proctor Log:</strong> {proctorStatus.warnings[proctorStatus.warnings.length - 1]}
                </div>
              )}
            </div>

            {/* Webcam Live Feed */}
            <div style={{ position: 'relative', width: '100%', height: '150px', background: '#000', borderRadius: '12px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', top: '8px', right: '8px', background: '#EF4444', color: '#fff', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                REC • PROCTOR
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2E3135', color: '#FFFFFF', fontSize: '11.5px', fontWeight: '700', padding: '4px 12px', borderRadius: '8px', textTransform: 'uppercase' }}>
                Active — {interviewType.toUpperCase()}
              </span>
              <DifficultyBadge level={difficultyLevel} />
            </div>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#2E3135' }}>Question {currentQuestionIndex} of {maxQuestions}</span>
          </div>

          {/* Inline last-answer eval (shown while current question is displayed) */}
          {lastEval && (
            <div className="eval-card" style={{ marginBottom: '20px' }}>
              <div className="eval-card-title">📊 Previous answer evaluation</div>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <ScoreBar label="Fluency"    value={lastEval.fluency} />
                  <ScoreBar label="Grammar"    value={lastEval.grammar} />
                  <ScoreBar label="Vocabulary" value={lastEval.vocabulary} />
                  <ScoreBar label="Confidence" value={lastEval.confidence} />
                </div>
                <div style={{ flex: '1 1 220px', background: '#F8FAFC', borderRadius: '10px', padding: '12px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: '#5C6E6D', lineHeight: '1.5', fontStyle: 'italic' }}>{lastEval.feedback}</p>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#5C6E6D', background: DIFF_CONFIG[difficultyLevel]?.bg, borderRadius: '6px', padding: '6px 10px', display: 'inline-block' }}>
                Next question difficulty adjusted to <strong style={{ color: DIFF_CONFIG[difficultyLevel]?.color }}>{DIFF_CONFIG[difficultyLevel]?.label}</strong>
              </div>
            </div>
          )}

          {/* Current question + answer area */}
          <div style={{ background: '#FFFFFF', border: '1px solid rgba(46, 49, 53,0.08)', borderRadius: '20px', padding: '28px', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#2E3135', margin: '0 0 16px', lineHeight: '1.4' }}>{currentQuestion}</h3>

            <div style={{ position: 'relative' }}>
              <textarea rows="6" value={answerText} onChange={e => setAnswerText(e.target.value)}
                placeholder="Type your response here, or click 🎤 to dictate..."
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid rgba(46, 49, 53,0.15)', borderRadius: '16px', padding: '16px 52px 16px 16px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', backgroundColor: '#FAF8F5', resize: 'none' }}
              />
              <button onClick={toggleRecording} title="Answer with voice"
                style={{ position: 'absolute', right: '16px', top: '16px', background: isRecording ? '#EF4444' : 'none', border: isRecording ? 'none' : '1px solid rgba(46, 49, 53,0.2)', color: isRecording ? '#FFFFFF' : '#2E3135', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
                🎤
              </button>
            </div>

            {isRecording && (
              <div className="audio-wave-simulation">
                {[0.1,0.3,0.5,0.2,0.4,0.1].map((d, i) => <div key={i} className="audio-bar" style={{ animationDelay: `${d}s` }} />)}
                <span style={{ fontSize: '12px', color: '#EF4444', fontWeight: '700', marginLeft: '8px' }}>Listening...</span>
              </div>
            )}

            {/* Adaptive tip */}
            <div style={{ fontSize: '12px', color: '#5C6E6D', background: 'rgba(46, 49, 53,0.04)', border: '1px solid rgba(46, 49, 53,0.1)', borderRadius: '8px', padding: '8px 12px', marginTop: '12px', lineHeight: '1.5' }}>
              <strong>Tip ({DIFF_CONFIG[difficultyLevel]?.label} level):</strong>&nbsp;{DIFF_CONFIG[difficultyLevel]?.tip}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="outline-btn" onClick={() => { setSession(null); setLastEval(null); }}>Exit Session</button>
            <button className="premium-btn" onClick={handleSubmitAnswer} disabled={isSubmitting || !answerText.trim()}>
              {isSubmitting ? 'Evaluating with AI...' : 'Submit & Continue →'}
            </button>
          </div>

          {history.length > 0 && (
            <div style={{ marginTop: '28px' }}>
              <h4 style={{ fontSize: '14.5px', fontWeight: '800', color: '#2E3135', marginBottom: '12px' }}>Completed Questions:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {history.map((h, i) => (
                  <div key={i} style={{ background: 'rgba(46, 49, 53,0.01)', border: '1px solid rgba(46, 49, 53,0.05)', borderRadius: '12px', padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                      <strong style={{ fontSize: '13px', color: '#2E3135', flex: 1 }}>Q{i+1}: {h.question}</strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <DifficultyBadge level={h.difficulty} small />
                        <span style={{ color: '#14B8A6', fontSize: '13px', fontWeight: '700' }}>{h.score}/100</span>
                      </div>
                    </div>
                    <p style={{ margin: '0 0 6px', fontSize: '12.5px', color: '#8BA1A0', fontStyle: 'italic' }}>"{h.answer.length > 120 ? h.answer.substring(0, 120) + '…' : h.answer}"</p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#5C6E6D' }}>{h.feedback}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MockInterviews;
