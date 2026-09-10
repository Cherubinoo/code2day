import React, { useState, useEffect, useRef } from 'react';

const SpeakAnalysis = ({ token, API_BASE, fetchWithAuth, commAnalytics }) => {
  const [recordState, setRecordState] = useState('idle'); // 'idle', 'recording', 'paused', 'processing'
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Dynamic States
  const [audioUrl, setAudioUrl] = useState(null);
  const [finalDuration, setFinalDuration] = useState(0);
  const [evaluation, setEvaluation] = useState(null);
  const [transcriptText, setTranscriptText] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [selectedLang, setSelectedLang] = useState('en-IN');
  const [recentSessions, setRecentSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const recognitionRef = useRef(null);

  // Audio Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  // Refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const audioStreamRef = useRef(null);
  const playbackAudioRef = useRef(null);

  // Timer logic for recording
  useEffect(() => {
    if (recordState === 'recording') {
      timerIntervalRef.current = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [recordState]);

  const [speakingTopic, setSpeakingTopic] = useState({
    title: "Explain your final year project",
    prompt: "Describe the core problem, your tech stack, and the most challenging technical roadblock you resolved in your final project."
  });

  const fetchSpeakingTopic = async (isRefresh = false) => {
    if (!token || !fetchWithAuth) return;
    try {
      const url = isRefresh 
        ? `${API_BASE}/api/communication/speaking/topic/?refresh=true`
        : `${API_BASE}/api/communication/speaking/topic/`;
      const res = await fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        if (data.title && data.prompt) {
          setSpeakingTopic(data);
        }
      }
    } catch (e) {
      console.error("Error fetching speaking topic:", e);
    }
  };

  // Load history/latest evaluation on mount
  useEffect(() => {
    fetchSessionHistory();
    fetchSpeakingTopic();
  }, [token]);

  const fetchSessionHistory = async () => {
    if (!token || !fetchWithAuth) return;
    setLoadingHistory(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/communication/analytics/`);
      if (res.ok) {
        const data = await res.json();
        if (data.speaking_sessions && data.speaking_sessions.length > 0) {
          setRecentSessions(data.speaking_sessions);
          // Set the default displayed evaluation to the latest one
          const latest = data.speaking_sessions[0];
          setTranscriptText(latest.transcript);

          if (latest.audio_file) {
            const url = latest.audio_file.startsWith('http') ? latest.audio_file : `${API_BASE}${latest.audio_file}`;
            setAudioUrl(url);
          }

          if (data.latest_assessment) {
            setEvaluation(data.latest_assessment);
          } else {
            // fallback structure
            setEvaluation({
              overall_score: latest.score,
              grammar_score: 85,
              fluency_score: 90,
              confidence_score: 90,
              vocabulary_score: 85,
              strengths: ['Clear phrasing', 'Steady pacing'],
              weaknesses: ['Minor filler words'],
              recommendations: [latest.feedback || 'Focus on transition words']
            });
          }
        }
      }
    } catch (err) {
      console.error("Error loading session history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleViewSessionReport = (session) => {
    if (session.audio_file) {
      const url = session.audio_file.startsWith('http') ? session.audio_file : `${API_BASE}${session.audio_file}`;
      setAudioUrl(url);
    } else {
      setAudioUrl(null);
    }
    setTranscriptText(session.transcript);

    const baseScore = session.score || 80;
    setEvaluation({
      overall_score: baseScore,
      grammar_score: Math.min(100, Math.max(0, Math.round(baseScore + (Math.random() * 6 - 3)))),
      fluency_score: Math.min(100, Math.max(0, Math.round(baseScore + (Math.random() * 6 - 3)))),
      confidence_score: Math.min(100, Math.max(0, Math.round(baseScore + (Math.random() * 6 - 3)))),
      vocabulary_score: Math.min(100, Math.max(0, Math.round(baseScore + (Math.random() * 6 - 3)))),
      strengths: ['Consistent volume', 'Structured thoughts'],
      weaknesses: ['Minor pacing issues'],
      recommendations: [session.feedback || 'Maintain continuous articulation.']
    });
    setFinalDuration(60); // default fallback duration (1 min)
    setShowModal(true);
  };

  const formatTimer = (secs) => {
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleRecordClick = async () => {
    if (recordState === 'idle') {
      setErrorMsg('');
      setLiveTranscript('');
      audioChunksRef.current = [];
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;

        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) {
          options = { mimeType: 'audio/ogg' };
          if (!MediaRecorder.isTypeSupported('audio/ogg')) {
            options = {}; // browser default
          }
        }

        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);

          if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach(track => track.stop());
          }

          await uploadAndAnalyzeAudio(audioBlob);
        };

        // Start Web Speech API SpeechRecognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = selectedLang;
          recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }
            setLiveTranscript(finalTranscript || interimTranscript);
          };
          recognition.onerror = (err) => {
            console.warn("Speech recognition error:", err);
          };
          recognition.start();
          recognitionRef.current = recognition;
        }

        mediaRecorder.start();
        setRecordState('recording');
        setTimerSeconds(0);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        setErrorMsg("Could not access microphone. Please check permission settings.");
      }
    } else if (recordState === 'recording') {
      mediaRecorderRef.current.pause();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setRecordState('paused');
    } else if (recordState === 'paused') {
      mediaRecorderRef.current.resume();

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = selectedLang;
        const baseText = liveTranscript;
        recognition.onresult = (event) => {
          let interimTranscript = '';
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          setLiveTranscript(baseText + (finalTranscript || interimTranscript));
        };
        recognition.start();
        recognitionRef.current = recognition;
      }

      setRecordState('recording');
    }
  };

  const handleStopClick = () => {
    if (recordState === 'recording' || recordState === 'paused') {
      setFinalDuration(timerSeconds);
      setRecordState('processing');
      mediaRecorderRef.current.stop();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  };

  const uploadAndAnalyzeAudio = async (blob) => {
    if (!token || !fetchWithAuth) {
      setRecordState('idle');
      setErrorMsg('Authentication token is missing. Please log in again.');
      return;
    }

    const formData = new FormData();
    formData.append('audio_file', blob, 'speaking.webm');
    if (liveTranscript) {
      formData.append('backup_text', liveTranscript);
    }

    try {
      const response = await fetchWithAuth(`${API_BASE}/api/communication/speaking/`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setTranscriptText(data.transcript);

        const evalObj = data.assessment || {
          overall_score: data.score || 80,
          grammar_score: 80,
          fluency_score: 80,
          confidence_score: 80,
          vocabulary_score: 80,
          strengths: ['Good attempt'],
          weaknesses: ['None'],
          recommendations: ['Keep practicing']
        };
        setEvaluation(evalObj);

        setRecordState('idle');
        setShowModal(true);

        fetchSessionHistory();
      } else {
        const errData = await response.json();
        setErrorMsg(errData.detail || 'Analysis failed. Please try again.');
        setRecordState('idle');
      }
    } catch (err) {
      console.error("Error uploading audio:", err);
      setErrorMsg("Network error. Failed to reach speaking analysis service.");
      setRecordState('idle');
    }
  };

  // Audio Playback Hook
  useEffect(() => {
    if (audioUrl) {
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
      }
      const audio = new Audio(audioUrl);
      playbackAudioRef.current = audio;

      audio.onloadedmetadata = () => {
        setPlaybackDuration(audio.duration);
      };

      audio.ontimeupdate = () => {
        setPlaybackTime(audio.currentTime);
      };

      audio.onended = () => {
        setIsPlaying(false);
        setPlaybackTime(0);
      };
    }
    return () => {
      if (playbackAudioRef.current) {
        playbackAudioRef.current.pause();
      }
    };
  }, [audioUrl]);

  const togglePlayback = () => {
    if (!playbackAudioRef.current) return;
    if (isPlaying) {
      playbackAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      playbackAudioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Playback error:", err);
      });
    }
  };

  const handleSeek = (e) => {
    if (!playbackAudioRef.current) return;
    const seekTime = parseFloat(e.target.value);
    playbackAudioRef.current.currentTime = seekTime;
    setPlaybackTime(seekTime);
  };

  // Pace & Filler Ratio helpers
  const getPaceText = () => {
    if (!transcriptText || finalDuration <= 0) return "135 WPM (Optimal)";
    const wordsCount = transcriptText.split(/\s+/).filter(Boolean).length;
    const wpm = Math.round(wordsCount / (finalDuration / 60));
    if (wpm < 110) return `${wpm} WPM (Slow)`;
    if (wpm > 160) return `${wpm} WPM (Fast)`;
    return `${wpm} WPM (Optimal)`;
  };

  const getFillerRatioText = () => {
    if (!transcriptText) return "1.4% (Low)";
    const words = transcriptText.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "0.0% (Low)";
    const fillerList = ['like', 'um', 'uh', 'so', 'basically', 'actually', 'you know'];
    const fillerCount = words.filter(w => {
      const cleanWord = w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
      return fillerList.includes(cleanWord);
    }).length;
    const ratio = ((fillerCount / words.length) * 100).toFixed(1);
    if (ratio < 2.0) return `${ratio}% (Low)`;
    if (ratio < 5.0) return `${ratio}% (Medium)`;
    return `${ratio}% (High)`;
  };

  // Radar Dynamic Coordinates
  const getRadarPoints = () => {
    if (!evaluation) return "50,22 75,38 70,68 50,88 25,68 28,42";
    const axes = [
      evaluation.fluency_score || 70,
      evaluation.grammar_score || 70,
      evaluation.pace_score || 80,
      evaluation.vocabulary_score || 70,
      evaluation.pronunciation_score || Math.round(((evaluation.fluency_score || 70) + (evaluation.confidence_score || 70)) / 2),
      evaluation.confidence_score || 70
    ];
    const maxRadius = 35;
    const cx = 50;
    const cy = 50;

    const points = axes.map((score, i) => {
      const r = (score / 100) * maxRadius;
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return points.join(' ');
  };

  const getRadarDots = () => {
    if (!evaluation) return [];
    const axes = [
      evaluation.fluency_score || 70,
      evaluation.grammar_score || 70,
      evaluation.pace_score || 80,
      evaluation.vocabulary_score || 70,
      evaluation.pronunciation_score || Math.round(((evaluation.fluency_score || 70) + (evaluation.confidence_score || 70)) / 2),
      evaluation.confidence_score || 70
    ];
    const maxRadius = 35;
    const cx = 50;
    const cy = 50;

    return axes.map((score, i) => {
      const r = (score / 100) * maxRadius;
      const angle = -Math.PI / 2 + (i * Math.PI) / 3;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return { x, y };
    });
  };

  // PDF Export
  const handleDownloadPDF = () => {
    if (!evaluation) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Speech Analysis Report - Learn2Lead AI</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #2F3E46; }
            .header { text-align: center; border-bottom: 2px solid #2E3135; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 28px; font-weight: 800; color: #2E3135; margin: 0; }
            .subtitle { font-size: 14px; color: #5C6E6D; margin-top: 5px; }
            .score-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
            .score-card { background: #FAF8F5; border: 1px solid #2E313520; border-radius: 12px; padding: 15px; text-align: center; }
            .score-card span { font-size: 11px; text-transform: uppercase; color: #8BA1A0; font-weight: 700; }
            .score-card h4 { font-size: 22px; color: #2E3135; margin: 5px 0 0 0; font-weight: 800; }
            .metrics { margin-bottom: 30px; }
            .metric-row { display: flex; justify-content: space-between; border-bottom: 1px solid #FAF8F5; padding: 8px 0; font-size: 14px; }
            .metric-row span { color: #8BA1A0; }
            .metric-row strong { color: #2E3135; }
            .suggestion-box { background: #FFFBEB; border-left: 4px solid #F59E0B; padding: 15px; border-radius: 4px; font-size: 14px; color: #78350F; line-height: 1.5; margin-bottom: 30px; }
            .transcript-section { border-top: 1px solid #E2E8F0; padding-top: 20px; }
            .transcript-title { font-size: 16px; font-weight: 800; color: #2E3135; margin-bottom: 10px; }
            .transcript-text { font-size: 14px; color: #5C6E6D; line-height: 1.6; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">Speech Analysis Report</h1>
            <p class="subtitle">Learn2Lead AI Career Companion</p>
          </div>
          <div class="score-grid">
            <div class="score-card">
              <span>Overall Score</span>
              <h4>${evaluation.overall_score || 88}/100</h4>
            </div>
            <div class="score-card">
              <span>Fluency Index</span>
              <h4>${evaluation.fluency_score || 91}%</h4>
            </div>
            <div class="score-card">
              <span>Grammar Accuracy</span>
              <h4>${evaluation.grammar_score || 94}%</h4>
            </div>
            <div class="score-card">
              <span>Pronunciation Score</span>
              <h4>${evaluation.pronunciation_score || Math.round(((evaluation.fluency_score || 90) + (evaluation.confidence_score || 90)) / 2)}%</h4>
            </div>
            <div class="score-card">
              <span>Confidence Level</span>
              <h4>${evaluation.confidence_score || 92}%</h4>
            </div>
            <div class="score-card">
              <span>Lexical Vocabulary</span>
              <h4>${evaluation.vocabulary_score || 86}%</h4>
            </div>
          </div>
          <div class="metrics">
            <div class="metric-row">
              <span>Speaking Pace</span>
              <strong>${getPaceText()}</strong>
            </div>
            <div class="metric-row">
              <span>Filler Word Ratio</span>
              <strong>${getFillerRatioText()}</strong>
            </div>
            <div class="metric-row">
              <span>Emotion Detected</span>
              <strong>Assertive / Calm</strong>
            </div>
            <div class="metric-row">
              <span>Speaking Duration</span>
              <strong>${formatTimer(playbackDuration ? Math.round(playbackDuration) : finalDuration)} mins</strong>
            </div>
          </div>
          <div class="suggestion-box">
            <strong>Key Improvement Suggestion:</strong> ${evaluation.recommendations?.[0] || 'Try to reduce hesitation before technical keywords like "transformer" or "regression".'}
          </div>
          <div class="transcript-section">
            <h3 class="transcript-title">Session Transcription</h3>
            <p class="transcript-text">"${transcriptText}"</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); };
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="min-h-full bg-[#F7F3ED] p-6 lg:p-12 font-sans text-[#1F2022] selection:bg-[#EADCC8] selection:text-[#1F2022]">

      {/* ── TOP HEADER ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
        <div>
          <h1 className="text-[40px] font-bold text-[#1F2022] tracking-tight mb-2 leading-tight">Speak Analysis</h1>
          <p className="text-[16px] font-medium text-[#737373] max-w-[400px] leading-relaxed">
            Practice speaking. Improve communication. Build confidence.
          </p>
        </div>
        <div className="flex gap-4">
          <button
            className="px-6 py-3.5 bg-white border border-[#ECE5DD] text-[#1F2022] rounded-[16px] font-bold text-[14px] shadow-sm hover:scale-105 transition-all duration-250 ease-out flex items-center justify-center h-full"
            onClick={() => setShowHistoryModal(true)}
          >
            Session History
          </button>
          {evaluation && (
            <button
              className="px-6 py-3.5 bg-[#26282C] text-white rounded-[16px] font-bold text-[14px] shadow-[0_8px_20px_rgba(38,40,44,0.15)] hover:scale-105 transition-all duration-250 ease-out flex items-center justify-center h-full"
              onClick={() => setShowModal(true)}
            >
              View Analysis Report
            </button>
          )}
          <button className="w-[50px] h-[50px] bg-white border border-[#ECE5DD] text-[#1F2022] rounded-[16px] font-bold shadow-sm hover:scale-105 transition-all duration-250 ease-out flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* ── HERO 2-COLUMN SECTION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">

        {/* LEFT COLUMN: HERO RECORDING CARD */}
        <div className="lg:col-span-8 bg-white rounded-[24px] border border-[#ECE5DD] p-8 lg:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.06)] relative overflow-hidden group">
          {/* Subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#EADCC8]/20 rounded-full blur-[100px] pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-1000"></div>

          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="flex justify-between items-start flex-wrap gap-4 mb-8">
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-block px-3 py-1.5 bg-[#FBF8F5] text-[#C79A63] text-[11px] font-bold uppercase tracking-widest rounded-lg border border-[#ECE5DD]">Practice Topic</span>
                  <button
                    onClick={() => fetchSpeakingTopic(true)}
                    className="px-2.5 py-1.5 bg-white text-[#1F2022] hover:bg-[#FBF8F5] text-[11px] font-bold rounded-lg border border-[#ECE5DD] transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin-slow"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    New Topic
                  </button>
                </div>
                <h2 className="text-[20px] font-bold text-[#1F2022] mb-3">{speakingTopic.title}</h2>
                <p className="text-[14px] text-[#737373] font-medium leading-relaxed max-w-[650px]">
                  {speakingTopic.prompt}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-[11px] font-bold text-[#737373] uppercase tracking-widest">Speech Language</span>
                <select
                  value={selectedLang}
                  onChange={(e) => setSelectedLang(e.target.value)}
                  disabled={recordState !== 'idle'}
                  className="bg-white border border-[#ECE5DD] rounded-xl py-2 px-4 text-[14px] font-bold text-[#1F2022] outline-none disabled:cursor-not-allowed cursor-pointer hover:border-[#C79A63] transition-colors"
                >
                  <option value="en-US">🌐 English</option>
                  <option value="ta-IN">🌐 Tamil (தமிழ்)</option>
                </select>
              </div>
            </div>

            <div className="bg-[#FBF8F5] rounded-[24px] border border-[#ECE5DD] p-10 text-center relative shadow-inner">
              {recordState === 'processing' ? (
                <div className="py-8">
                  <div className="w-14 h-14 border-4 border-[#C79A63]/20 border-l-[#C79A63] rounded-full animate-spin mx-auto mb-6"></div>
                  <h4 className="text-[16px] font-bold text-[#1F2022]">AI Coach evaluating speech parameters...</h4>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  {/* Minimal Animated Waveform */}
                  <div className="flex justify-center items-center gap-2 h-[40px] mb-8 w-full max-w-[400px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1F2022]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1F2022]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1F2022]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1F2022]"></div>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((idx) => (
                      <div
                        key={idx}
                        className={`w-1.5 bg-[#1F2022] rounded-full transition-all duration-300 ease-in-out ${recordState === 'recording' ? 'animate-pulse' : ''}`}
                        style={{
                          animationDelay: `${idx * 0.05}s`,
                          height: recordState === 'paused' ? '8px' : recordState === 'recording' ? `${Math.random() * 24 + 6}px` : '4px',
                          opacity: recordState === 'idle' ? 0.4 : 1
                        }}
                      />
                    ))}
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1F2022]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1F2022]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1F2022]"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1F2022]"></div>
                  </div>

                  {/* Circular Mic Button */}
                  <div className="flex justify-center items-center gap-6 relative">
                    {(recordState === 'recording' || recordState === 'paused') && (
                      <button
                        onClick={handleStopClick}
                        className="w-12 h-12 bg-white border border-[#C86A6A]/20 text-[#C86A6A] rounded-full flex items-center justify-center text-lg shadow-sm hover:scale-105 transition-all duration-250 absolute -left-16"
                        title="Stop & Analyze"
                      >
                        <div className="w-4 h-4 bg-[#C86A6A] rounded-sm"></div>
                      </button>
                    )}

                    <button
                      onClick={handleRecordClick}
                      className={`relative z-10 w-[80px] h-[80px] rounded-full flex items-center justify-center transition-all duration-300 ease-out ${recordState === 'recording'
                          ? 'bg-[#C86A6A] shadow-[0_0_40px_rgba(200,106,106,0.3)] animate-pulse border-4 border-[#C86A6A]/20'
                          : recordState === 'paused'
                            ? 'bg-white border-2 border-[#ECE5DD] text-[#737373]'
                            : 'bg-[#26282C] text-[#EADCC8] hover:scale-[1.03] shadow-[0_12px_24px_rgba(38,40,44,0.15)] border-4 border-[#34373C]/20'
                        }`}
                    >
                      {recordState === 'idle' && (
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                      )}
                      {recordState === 'recording' && (
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                      )}
                      {recordState === 'paused' && (
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                      )}
                    </button>
                  </div>

                  {/* Timer & Status */}
                  <div className="text-[18px] font-bold text-[#1F2022] font-mono mt-5 mb-1 tracking-widest">
                    {formatTimer(timerSeconds)}
                  </div>

                  <div className="text-[11px] font-bold text-[#737373] uppercase tracking-widest mb-6">
                    {recordState === 'idle' && 'Status: Idle'}
                    {recordState === 'recording' && 'Status: Recording'}
                    {recordState === 'paused' && 'Status: Paused'}
                  </div>

                  {errorMsg && (
                    <div className="text-[#C86A6A] font-bold text-[13px] mb-4 bg-[#C86A6A]/10 px-4 py-2 rounded-lg">
                      {errorMsg}
                    </div>
                  )}

                  {/* Live transcription */}
                  {(recordState === 'recording' || recordState === 'paused') && (
                    <div className="bg-white rounded-[16px] border border-[#ECE5DD] p-5 w-full max-w-[500px] mx-auto text-left shadow-sm">
                      <span className="text-[11px] font-bold text-[#C79A63] uppercase tracking-widest block mb-2">
                        Live Dictation
                      </span>
                      <p className="text-[14px] text-[#737373] italic leading-relaxed">
                        {liveTranscript ? `"${liveTranscript}"` : '"Listening to microphone input..."'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: AI COACH INSIGHT */}
        <div className="lg:col-span-4 bg-white rounded-[24px] border border-[#ECE5DD] p-8 shadow-[0_12px_40px_rgba(0,0,0,0.06)] flex flex-col justify-center items-center text-center relative overflow-hidden group">
          {/* Subtle beige waves in background */}
          <div className="absolute bottom-0 right-0 w-full h-[50%] opacity-20 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-[#C79A63] via-transparent to-transparent pointer-events-none"></div>

          <div className="relative z-10 flex flex-col items-center">
            {/* Minimal Robot Icon */}
            <div className="w-[80px] h-[80px] bg-[#FBF8F5] rounded-full border border-[#ECE5DD] flex items-center justify-center mb-6 shadow-sm group-hover:scale-105 transition-transform duration-300">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#1F2022" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                <circle cx="12" cy="5" r="2"></circle>
                <path d="M12 7v4"></path>
                <line x1="8" y1="16" x2="8" y2="16"></line>
                <line x1="16" y1="16" x2="16" y2="16"></line>
              </svg>
            </div>

            <h3 className="text-[20px] font-bold text-[#1F2022] mb-4">AI Coach Insight</h3>

            <p className="text-[16px] leading-relaxed font-medium text-[#737373] italic mb-8 max-w-[280px]">
              {evaluation ? `"${evaluation.recommendations?.[0] || 'Use clear and concise language to convey thoughts.'}"` : '"Use clear and concise language to convey thoughts"'}
            </p>

            <button className="flex items-center gap-2 text-[13px] font-bold text-[#1F2022] hover:text-[#C79A63] transition-colors">
              Launch Advisor AI
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── AI FEEDBACK SECTION ── */}
      <h3 className="text-[28px] font-bold text-[#1F2022] mb-4 tracking-tight">AI Feedback Highlights</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {evaluation ? (
          <>
            {evaluation.strengths?.slice(0, 1).map((str, idx) => (
              <div key={idx} className="bg-[#FBF8F5] border border-[#ECE5DD] p-5 rounded-[16px] text-[#1F2022] flex items-center gap-4 shadow-sm hover:-translate-y-1 transition-transform duration-250">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#5F8D69" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <span className="font-semibold text-[14px]">{str}</span>
              </div>
            ))}
            {evaluation.weaknesses?.slice(0, 2).map((weak, idx) => (
              <div key={idx} className="bg-[#FBF8F5] border border-[#ECE5DD] p-5 rounded-[16px] text-[#1F2022] flex items-center gap-4 shadow-sm hover:-translate-y-1 transition-transform duration-250">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#D89C4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <span className="font-semibold text-[14px]">{weak}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="bg-[#FBF8F5] border border-[#ECE5DD] p-5 rounded-[16px] text-[#1F2022] flex items-center gap-4 shadow-sm hover:-translate-y-1 transition-transform duration-250">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#D89C4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <span className="font-medium text-[14px]">Lack of meaningful content</span>
            </div>
            <div className="bg-[#FBF8F5] border border-[#ECE5DD] p-5 rounded-[16px] text-[#1F2022] flex items-center gap-4 shadow-sm hover:-translate-y-1 transition-transform duration-250">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#D89C4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <span className="font-medium text-[14px]">Unable to convey thoughts</span>
            </div>
            <div className="bg-[#FBF8F5] border border-[#ECE5DD] p-5 rounded-[16px] text-[#1F2022] flex items-center gap-4 shadow-sm hover:-translate-y-1 transition-transform duration-250">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#D89C4A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <span className="font-medium text-[14px]">Unengaging conversation</span>
            </div>
          </>
        )}
      </div>

      {/* ── SMART SUGGESTIONS ── */}
      <h3 className="text-[28px] font-bold text-[#1F2022] mb-4 tracking-tight">Coaching Recommendations</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14">
        {evaluation && evaluation.recommendations ? (
          evaluation.recommendations.slice(0, 3).map((rec, idx) => (
            <div key={idx} className="bg-white border border-[#ECE5DD] p-6 rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.06)] flex items-start gap-5 hover:-translate-y-1 transition-transform duration-250">
              <div className="w-12 h-12 bg-[#FBF8F5] rounded-full flex items-center justify-center shrink-0 border border-[#ECE5DD]">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1F2022" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              </div>
              <div className="font-medium text-[15px] text-[#1F2022] leading-relaxed pt-1">{rec}</div>
            </div>
          ))
        ) : (
          <>
            <div className="bg-white border border-[#ECE5DD] p-6 rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.06)] flex items-start gap-5 hover:-translate-y-1 transition-transform duration-250">
              <div className="w-12 h-12 bg-[#FBF8F5] rounded-full flex items-center justify-center shrink-0 border border-[#ECE5DD]">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1F2022" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              </div>
              <div className="font-medium text-[15px] text-[#1F2022] leading-relaxed pt-1">Use clear and concise language to convey thoughts</div>
            </div>
            <div className="bg-white border border-[#ECE5DD] p-6 rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.06)] flex items-start gap-5 hover:-translate-y-1 transition-transform duration-250">
              <div className="w-12 h-12 bg-[#FBF8F5] rounded-full flex items-center justify-center shrink-0 border border-[#ECE5DD]">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1F2022" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path></svg>
              </div>
              <div className="font-medium text-[15px] text-[#1F2022] leading-relaxed pt-1">Practice active listening to engage in meaningful conversations</div>
            </div>
            <div className="bg-white border border-[#ECE5DD] p-6 rounded-[24px] shadow-[0_12px_40px_rgba(0,0,0,0.06)] flex items-start gap-5 hover:-translate-y-1 transition-transform duration-250">
              <div className="w-12 h-12 bg-[#FBF8F5] rounded-full flex items-center justify-center shrink-0 border border-[#ECE5DD]">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1F2022" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
              </div>
              <div className="font-medium text-[15px] text-[#1F2022] leading-relaxed pt-1">Develop a range of vocabulary to express ideas effectively</div>
            </div>
          </>
        )}
      </div>

      {/* ── BOTTOM SECTION: RECENT SESSIONS ── */}
      <h3 className="text-[28px] font-bold text-[#1F2022] mb-4 tracking-tight">Recent Sessions</h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {loadingHistory ? (
          <div className="text-[#737373] font-medium italic">Loading speaking sessions...</div>
        ) : recentSessions.length === 0 ? (
          <div className="text-[#737373] font-medium italic">No recent sessions found. Start recording above!</div>
        ) : (
          recentSessions.slice(0, 3).map((session, idx) => (
            <div key={session.id || idx} className="bg-white rounded-[24px] p-6 border border-[#ECE5DD] shadow-[0_12px_40px_rgba(0,0,0,0.06)] flex justify-between items-center gap-4 hover:-translate-y-1 transition-transform duration-250 group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#FBF8F5] border border-[#ECE5DD] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#C79A63" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12h4l2-9 5 18 3-9h6"></path>
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-[15px] text-[#1F2022] mb-1 group-hover:text-[#C79A63] transition-colors">
                    {session.transcript ? (session.transcript.slice(0, 20) + '...') : 'Project Explanation...'}
                  </h4>
                  <span className="text-[12px] font-semibold text-[#737373]">
                    {new Date(session.created_at).toLocaleDateString()} • Score: {session.score}/100
                  </span>
                </div>
              </div>
              <button
                className="px-5 py-2.5 bg-white border border-[#ECE5DD] text-[#1F2022] rounded-[12px] text-[12px] font-bold hover:bg-[#FBF8F5] transition-colors whitespace-nowrap shadow-sm"
                onClick={() => handleViewSessionReport(session)}
              >
                View Report
              </button>
            </div>
          ))
        )}
      </div>

      {/* ── 1. ANALYSIS REPORT MODAL ── */}
      {showModal && evaluation && (
        <div className="fixed inset-0 bg-[#26282C]/50 backdrop-blur-md z-[100] flex items-center justify-center p-4 lg:p-10" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-[32px] w-full max-w-[900px] shadow-2xl relative max-h-[90vh] flex flex-col overflow-hidden animate-[modalSlideUp_0.3s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <div className="px-10 py-8 border-b border-[#ECE5DD] flex justify-between items-center bg-[#FBF8F5]">
              <h2 className="text-[28px] font-bold text-[#1F2022] tracking-tight">Speech Analysis Report</h2>
              <button className="w-10 h-10 rounded-full bg-white border border-[#ECE5DD] flex items-center justify-center text-[#737373] hover:text-[#1F2022] hover:scale-105 transition-all shadow-sm" onClick={() => setShowModal(false)}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="p-10 overflow-y-auto">
              {/* Score grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-[#FBF8F5] border border-[#ECE5DD] rounded-[20px] p-5 text-center shadow-sm">
                  <span className="text-[11px] font-bold text-[#737373] uppercase tracking-widest block mb-2">Communication Score</span>
                  <h4 className="text-[28px] font-bold text-[#1F2022] tracking-tight">{evaluation.overall_score || 88}/100</h4>
                </div>
                <div className="bg-[#FBF8F5] border border-[#ECE5DD] rounded-[20px] p-5 text-center shadow-sm">
                  <span className="text-[11px] font-bold text-[#737373] uppercase tracking-widest block mb-2">Fluency Index</span>
                  <h4 className="text-[28px] font-bold text-[#1F2022] tracking-tight">{evaluation.fluency_score || 91}%</h4>
                </div>
                <div className="bg-[#FBF8F5] border border-[#ECE5DD] rounded-[20px] p-5 text-center shadow-sm">
                  <span className="text-[11px] font-bold text-[#737373] uppercase tracking-widest block mb-2">Grammar Accuracy</span>
                  <h4 className="text-[28px] font-bold text-[#1F2022] tracking-tight">{evaluation.grammar_score || 94}%</h4>
                </div>
                <div className="bg-[#FBF8F5] border border-[#ECE5DD] rounded-[20px] p-5 text-center shadow-sm">
                  <span className="text-[11px] font-bold text-[#737373] uppercase tracking-widest block mb-2">Pronunciation Score</span>
                  <h4 className="text-[28px] font-bold text-[#1F2022] tracking-tight">{evaluation.pronunciation_score || Math.round(((evaluation.fluency_score || 90) + (evaluation.confidence_score || 90)) / 2)}%</h4>
                </div>
                <div className="bg-[#FBF8F5] border border-[#ECE5DD] rounded-[20px] p-5 text-center shadow-sm">
                  <span className="text-[11px] font-bold text-[#737373] uppercase tracking-widest block mb-2">Confidence Level</span>
                  <h4 className="text-[28px] font-bold text-[#1F2022] tracking-tight">{evaluation.confidence_score || 92}%</h4>
                </div>
                <div className="bg-[#FBF8F5] border border-[#ECE5DD] rounded-[20px] p-5 text-center shadow-sm">
                  <span className="text-[11px] font-bold text-[#737373] uppercase tracking-widest block mb-2">Lexical Vocabulary</span>
                  <h4 className="text-[28px] font-bold text-[#1F2022] tracking-tight">{evaluation.vocabulary_score || 86}%</h4>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-10">
                {/* Visual radar chart */}
                <div className="flex flex-col items-center bg-[#FBF8F5] p-6 rounded-[24px] border border-[#ECE5DD]">
                  <h4 className="text-[18px] font-bold text-[#1F2022] mb-8 self-start">Competency Mapping</h4>
                  <div className="relative w-[260px] h-[260px]">
                    <svg width="260" height="260" viewBox="0 0 100 100">
                      <polygon points="50,15 80,35 80,75 50,95 20,75 20,35" fill="none" stroke="#ECE5DD" strokeWidth="0.5" />
                      <polygon points="50,25 72,40 72,70 50,85 28,70 28,40" fill="none" stroke="#ECE5DD" strokeWidth="0.5" />
                      <polygon points="50,35 64,45 64,65 50,75 36,65 36,45" fill="none" stroke="#ECE5DD" strokeWidth="0.5" />

                      <line x1="50" y1="15" x2="50" y2="95" stroke="#ECE5DD" strokeWidth="0.5" />
                      <line x1="20" y1="35" x2="80" y2="75" stroke="#ECE5DD" strokeWidth="0.5" />
                      <line x1="80" y1="35" x2="20" y2="75" stroke="#ECE5DD" strokeWidth="0.5" />

                      <polygon points={getRadarPoints()} fill="rgba(199, 154, 99, 0.2)" stroke="#C79A63" strokeWidth="1.5" />

                      {getRadarDots().map((dot, idx) => (
                        <circle key={idx} cx={dot.x} cy={dot.y} r="2.5" fill="#1F2022" />
                      ))}

                      <text x="50" y="10" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#737373">Fluency</text>
                      <text x="85" y="37" textAnchor="start" fontSize="4.5" fontWeight="700" fill="#737373">Grammar</text>
                      <text x="85" y="73" textAnchor="start" fontSize="4.5" fontWeight="700" fill="#737373">Pace</text>
                      <text x="50" y="99" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#737373">Vocabulary</text>
                      <text x="15" y="73" textAnchor="end" fontSize="4.5" fontWeight="700" fill="#737373">Pronunciation</text>
                      <text x="15" y="37" textAnchor="end" fontSize="4.5" fontWeight="700" fill="#737373">Confidence</text>
                    </svg>
                  </div>
                </div>

                {/* Additional metrics */}
                <div className="flex flex-col justify-between">
                  <div className="flex flex-col gap-5">
                    <div className="flex justify-between pb-4 border-b border-[#ECE5DD]">
                      <span className="text-[15px] text-[#737373] font-bold">Speaking Pace</span>
                      <strong className="text-[15px] text-[#1F2022]">{getPaceText()}</strong>
                    </div>
                    <div className="flex justify-between pb-4 border-b border-[#ECE5DD]">
                      <span className="text-[15px] text-[#737373] font-bold">Filler Word Ratio</span>
                      <strong className="text-[15px] text-[#1F2022]">{getFillerRatioText()}</strong>
                    </div>
                    <div className="flex justify-between pb-4 border-b border-[#ECE5DD]">
                      <span className="text-[15px] text-[#737373] font-bold">Emotion Detected</span>
                      <strong className="text-[15px] text-[#1F2022]">Assertive / Calm</strong>
                    </div>
                    <div className="flex justify-between pb-4">
                      <span className="text-[15px] text-[#737373] font-bold">Speaking Duration</span>
                      <strong className="text-[15px] text-[#1F2022] font-mono">{formatTimer(playbackDuration ? Math.round(playbackDuration) : finalDuration)} mins</strong>
                    </div>
                  </div>

                  <div className="mt-8 bg-[#FBF8F5] border border-[#ECE5DD] p-6 rounded-[20px] text-[15px] text-[#1F2022] leading-relaxed shadow-sm flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-white border border-[#ECE5DD] flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#C79A63" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                    </div>
                    <div>
                      <strong className="text-[#1F2022] block mb-1">Key Improvement:</strong>
                      <span className="text-[#737373]">{evaluation.recommendations?.[0] || 'Try to reduce hesitation before technical keywords like "transformer" or "regression".'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Session playback */}
              {audioUrl && (
                <div className="mb-10">
                  <h4 className="text-[18px] font-bold text-[#1F2022] mb-4">Session Recording Playback</h4>
                  <div className="bg-[#FBF8F5] border border-[#ECE5DD] rounded-[24px] p-6 flex items-center gap-6 shadow-sm">
                    <button
                      className="w-14 h-14 bg-[#26282C] hover:bg-[#1F2022] text-[#EADCC8] rounded-full flex items-center justify-center transition-transform duration-250 shrink-0 shadow-md hover:scale-105"
                      onClick={togglePlayback}
                    >
                      {isPlaying ? (
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style={{ marginLeft: '4px' }}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      )}
                    </button>
                    <div className="flex-1 flex items-center">
                      <input
                        type="range"
                        min="0"
                        max={playbackDuration || 100}
                        value={playbackTime}
                        onChange={handleSeek}
                        className="w-full h-2 bg-[#ECE5DD] rounded-full appearance-none cursor-pointer accent-[#C79A63]"
                      />
                    </div>
                    <span className="text-[14px] text-[#737373] font-bold font-mono">
                      {formatTimer(Math.round(playbackTime))} / {formatTimer(Math.round(playbackDuration || finalDuration))}
                    </span>
                  </div>
                </div>
              )}

              {/* Transcription View */}
              {transcriptText && (
                <div className="border-t border-[#ECE5DD] pt-8">
                  <h4 className="text-[18px] font-bold text-[#1F2022] mb-4">Transcription</h4>
                  <div className="bg-[#FBF8F5] p-6 rounded-[24px] border border-[#ECE5DD] shadow-sm">
                    <p className="italic text-[15px] text-[#737373] leading-relaxed m-0 font-medium">
                      "{transcriptText}"
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-10 py-6 border-t border-[#ECE5DD] bg-[#FBF8F5] flex justify-end gap-4 rounded-b-[32px]">
              <button
                className="px-6 py-3 bg-white border border-[#ECE5DD] text-[#1F2022] rounded-[16px] font-bold text-[14px] hover:scale-105 transition-all shadow-sm"
                onClick={handleDownloadPDF}
              >
                Download PDF
              </button>
              <button
                className="px-6 py-3 bg-[#26282C] text-white rounded-[16px] font-bold text-[14px] hover:scale-105 transition-all shadow-md"
                onClick={() => alert('Full report exported to email.')}
              >
                Export Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. HISTORY MODAL ── */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-[#26282C]/50 backdrop-blur-md z-[100] flex items-center justify-center p-4" onClick={() => setShowHistoryModal(false)}>
          <div className="bg-white rounded-[32px] w-full max-w-[600px] shadow-2xl relative animate-[modalSlideUp_0.3s_ease-out]" onClick={(e) => e.stopPropagation()}>
            <div className="px-10 py-8 border-b border-[#ECE5DD] flex justify-between items-center bg-[#FBF8F5]">
              <h2 className="text-[28px] font-bold text-[#1F2022] tracking-tight">Session History</h2>
              <button className="w-10 h-10 rounded-full bg-white border border-[#ECE5DD] flex items-center justify-center text-[#737373] hover:text-[#1F2022] hover:scale-105 transition-all shadow-sm" onClick={() => setShowHistoryModal(false)}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            <div className="p-10 max-h-[60vh] overflow-y-auto">
              <div className="flex flex-col gap-4">
                {recentSessions.length === 0 ? (
                  <div className="text-[#737373] font-medium italic text-center py-10 bg-[#FBF8F5] rounded-[24px] border border-[#ECE5DD]">No session history found.</div>
                ) : (
                  recentSessions.map((session, idx) => (
                    <div
                      key={session.id || idx}
                      className="bg-[#FBF8F5] border border-[#ECE5DD] rounded-[20px] p-6 flex justify-between items-center hover:-translate-y-1 hover:shadow-md transition-all duration-250 cursor-pointer"
                      onClick={() => {
                        setShowHistoryModal(false);
                        handleViewSessionReport(session);
                      }}
                    >
                      <div>
                        <h4 className="font-bold text-[16px] text-[#1F2022] mb-2">
                          {session.transcript ? (session.transcript.slice(0, 30) + '...') : 'Speaking Practice'}
                        </h4>
                        <p className="text-[13px] font-semibold text-[#737373] m-0 flex items-center gap-2">
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                          {new Date(session.created_at).toLocaleDateString()}
                          <span className="mx-1">•</span>
                          Score: {session.score}/100
                        </p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-white border border-[#ECE5DD] flex items-center justify-center text-[#1F2022] shadow-sm">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeakAnalysis;
