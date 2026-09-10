import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Users, BrainCircuit, Briefcase,
  TrendingUp, Activity, Play, Settings, X, Mic,
  Award, Zap, Flame, Clock, Send, StopCircle, RefreshCw
} from 'lucide-react';
import conversationImg from '../../../../assets/conversation1.png';

const ConversationPartner = ({ token, API_BASE, fetchWithAuth, user, setUser }) => {
  // Navigation states
  const [activeMode, setActiveMode] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Stats
  const level = Math.floor((user?.profile?.xp || 0) / 100) + 1;
  const [streak, setStreak] = useState(user?.profile?.streak || 0);
  const [xpGoal, setXpGoal] = useState(() => {
    const xp = user?.profile?.xp || 0;
    return `${xp}/${(level) * 100} XP`;
  });
  const [durationTarget, setDurationTarget] = useState('15/20 min');

  // Conversational states
  const [transcript, setTranscript] = useState([]);
  const [badges, setBadges] = useState({
    confidence: 'Good (80%)',
    fluency: 'Average (74%)',
    vocabulary: 'Average (76%)',
    grammar: 'Good (82%)'
  });
  const [vocabList, setVocabList] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [typedMessage, setTypedMessage] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isWaitingForAI, setIsWaitingForAI] = useState(false);

  const timerIntervalRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Sync profile values if user changes
  useEffect(() => {
    if (user?.profile) {
      setStreak(user.profile.streak || 0);
      const xp = user.profile.xp || 0;
      const lv = Math.floor(xp / 100) + 1;
      setXpGoal(`${xp}/${lv * 100} XP`);
    }
  }, [user]);

  // Clean up timer/recognition on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const formatTimer = (secs) => {
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const modes = [
    {
      id: 'friendly',
      title: 'Friendly Conversation',
      icon: <Users className="w-6 h-6 text-[#9A8CE8]" />,
      iconBg: 'bg-[#9A8CE8]/10',
      color: 'hover:border-[#9A8CE8] hover:shadow-[#9A8CE8]/10',
      desc: 'Practice casual, everyday conversational English. Perfect for building small-talk confidence.',
      scenario: 'Friendly Conversation small talk'
    },
    {
      id: 'professional',
      title: 'Professional Communication',
      icon: <Briefcase className="w-6 h-6 text-[#87B7F5]" />,
      iconBg: 'bg-[#87B7F5]/10',
      color: 'hover:border-[#87B7F5] hover:shadow-[#87B7F5]/10',
      desc: 'Speak formally, use professional vocabulary, and practice structured explanations.',
      scenario: 'Professional Workplace Communication'
    },
    {
      id: 'technology',
      title: 'Technology Discussion',
      icon: <BrainCircuit className="w-6 h-6 text-[#98D8C8]" />,
      iconBg: 'bg-[#98D8C8]/10',
      color: 'hover:border-[#98D8C8] hover:shadow-[#98D8C8]/10',
      desc: 'Dive into tech trends, system design trade-offs, programming paradigms, and scalability.',
      scenario: 'Technology Discussion SDE monolithic vs microservices'
    },
    {
      id: 'workplace',
      title: 'Workplace Communication',
      icon: <MessageSquare className="w-6 h-6 text-[#A98EFF]" />,
      iconBg: 'bg-[#A98EFF]/10',
      color: 'hover:border-[#A98EFF] hover:shadow-[#A98EFF]/10',
      desc: 'Simulate high-stakes discussions with coworkers, alignment meetings, and peer-to-peer reviews.',
      scenario: 'Workplace peer feedback and deadlines'
    },
    {
      id: 'leadership',
      title: 'Leadership Discussion',
      icon: <Activity className="w-6 h-6 text-[#C89B63]" />,
      iconBg: 'bg-[#C89B63]/10',
      color: 'hover:border-[#C89B63] hover:shadow-[#C89B63]/10',
      desc: 'Practice inspiring teams, delivering constructive reviews, defining goals, and managing milestones.',
      scenario: 'Engineering Leadership and developer morale'
    },
    {
      id: 'career',
      title: 'Career Growth',
      icon: <TrendingUp className="w-6 h-6 text-[#FF8E8B]" />,
      iconBg: 'bg-[#FF8E8B]/10',
      color: 'hover:border-[#FF8E8B] hover:shadow-[#FF8E8B]/10',
      desc: 'Simulate career growth planning discussions, placement expectations, and articulating goals.',
      scenario: 'Career Growth and Placement Goals'
    }
  ];

  const handleStartRoom = (mode) => {
    setActiveMode(mode);
    setTimerSeconds(0);
    setIsRecording(false);
    setVocabList([]);
    setCorrections([]);
    setLiveTranscript("");
    setIsWaitingForAI(false);

    setBadges({
      confidence: 'Average (72%)',
      fluency: 'Average (70%)',
      vocabulary: 'Average (71%)',
      grammar: 'Good (78%)'
    });

    const initialGreeting = `Hi there! I'm your AI speaking companion. Let's practice some ${mode.title} today. What are you focusing on, and how can we kick off this session?`;
    setTranscript([
      { sender: 'AI', text: initialGreeting }
    ]);
  };

  const handleMicClick = () => {
    if (isRecording) {
      const messageToSend = liveTranscript;
      stopListening();
      if (messageToSend.trim()) {
        sendMessageToAI(messageToSend);
      }
    } else {
      setLiveTranscript("");
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-IN'; // Optimized for Indian English accent
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
        recognition.onend = () => {
          setIsRecording(false);
        };
        recognition.start();
        recognitionRef.current = recognition;
        setIsRecording(true);
        setTimerSeconds(0);
        timerIntervalRef.current = setInterval(() => {
          setTimerSeconds(prev => prev + 1);
        }, 1000);
      } else {
        alert("Speech Recognition is not supported in this browser. Please type your message instead.");
      }
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };

  const handleSendTextMessage = () => {
    if (typedMessage.trim() && !isWaitingForAI) {
      sendMessageToAI(typedMessage);
    }
  };

  const sendMessageToAI = async (messageText) => {
    if (!messageText.trim() || !activeMode) return;
    setIsWaitingForAI(true);

    setTranscript(prev => [
      ...prev,
      { sender: 'Student', text: messageText }
    ]);
    setTypedMessage("");

    const formattedHistory = transcript.map(t => ({
      sender: t.sender,
      text: t.text
    }));

    try {
      const response = await fetchWithAuth(`${API_BASE}/api/communication/language-practice/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          language: 'English',
          level: 'Advanced',
          scenario: activeMode.scenario,
          message: messageText,
          chat_history: formattedHistory
        })
      });

      if (response.ok) {
        const data = await response.json();

        setTranscript(prev => [
          ...prev,
          { sender: 'AI', text: data.response }
        ]);

        if (data.corrections && data.corrections.length > 0) {
          const newCorrections = data.corrections.map(c => {
            if (typeof c === 'string') {
              const match = c.match(/You said\s+['"](.+?)['"].+?Suggested:\s+['"](.+?)['"]/i);
              if (match) {
                return { original: match[1], suggested: match[2], explanation: c };
              }
              return { original: messageText, suggested: "Rephrase suggested", explanation: c };
            }
            return c;
          });
          setCorrections(prev => [...newCorrections, ...prev]);
        }

        if (data.vocab && data.vocab.word) {
          setVocabList(prev => [data.vocab, ...prev]);
        }

        if (data.language_progress && setUser) {
          setUser(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              profile: {
                ...prev.profile,
                xp: prev.profile.xp + 10
              }
            };
          });
        }
      }
    } catch (err) {
      console.error("Error communicating with AI partner:", err);
    } finally {
      setIsWaitingForAI(false);
    }
  };

  const handleEndSession = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setIsRecording(false);
    setActiveMode(null);
  };

  // ----------------------------------------------------
  // RENDER SELECTION SCREEN
  // ----------------------------------------------------
  if (!activeMode) {
    return (
      <div className="min-h-full bg-[#F6F1EA] p-6 lg:p-10 font-sans text-premium-primary flex flex-col items-center">
        <div className="w-full max-w-[1100px]">
        {/* Premium Hero Banner Image */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative w-full h-[240px] rounded-[30px] overflow-hidden mb-8 shadow-[0_30px_80px_rgba(0,0,0,0.08)] flex items-center justify-center bg-white"
        >
          <img
            src={conversationImg}
            alt="Conversation Partner Banner"
            className="w-full h-full object-cover object-center"
          />
        </motion.div>

        {/* Floating Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          className="flex flex-wrap items-center justify-between gap-6 bg-white/90 backdrop-blur-[12px] rounded-[24px] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.06)] border border-[#ECE5DD] mb-12"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#C89B63]/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-[#C89B63]" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[#747474] uppercase tracking-wider">Level {level}</div>
              <div className="text-[16px] font-bold text-[#1F2022]">Current Level</div>
            </div>
          </div>

          <div className="h-10 w-[1px] bg-[#ECE5DD] hidden md:block"></div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FF8E8B]/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-[#FF8E8B]" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[#747474] uppercase tracking-wider">{streak} Days</div>
              <div className="text-[16px] font-bold text-[#1F2022]">Daily Streak</div>
            </div>
          </div>

          <div className="h-10 w-[1px] bg-[#ECE5DD] hidden md:block"></div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#98D8C8]/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#98D8C8]" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[#747474] uppercase tracking-wider">{xpGoal} Goal</div>
              <div className="text-[16px] font-bold text-[#1F2022]">Experience</div>
            </div>
          </div>

          <div className="h-10 w-[1px] bg-[#ECE5DD] hidden lg:block"></div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#9A8CE8]/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-[#9A8CE8]" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-[#747474] uppercase tracking-wider">{durationTarget} Target</div>
              <div className="text-[16px] font-bold text-[#1F2022]">Minutes Today</div>
            </div>
          </div>
        </motion.div>

        {/* Section Title */}
        <h2 className="text-[28px] font-bold text-[#1F2022] mb-6">Select Conversation Mode</h2>

        {/* Modes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {modes.map((mode, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.4 }}
              whileHover={{ y: -6, boxShadow: '0 24px 50px rgba(0,0,0,0.06)' }}
              className={`bg-white rounded-[24px] p-8 border border-[#ECE5DD] flex flex-col justify-between transition-all duration-300 group ${mode.color}`}
              style={{ minHeight: '260px' }}
            >
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center ${mode.iconBg}`}>
                    {mode.icon}
                  </div>
                  <h3 className="text-[20px] font-bold text-[#1F2022] leading-tight flex-1">{mode.title}</h3>
                </div>
                <p className="text-[14px] text-[#747474] font-medium leading-relaxed mb-6">
                  {mode.desc}
                </p>
              </div>

              <button
                onClick={() => handleStartRoom(mode)}
                className="bg-[#2F3338] text-white py-3.5 px-6 rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 transition-all duration-300 group-hover:bg-[#C89B63] group-hover:shadow-[0_8px_20px_rgba(200,155,99,0.3)] mt-auto"
              >
                Start Conversation
                <Play className="w-4 h-4 fill-current" />
              </button>
            </motion.div>
          ))}
        </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER ACTIVE ROOM
  // ----------------------------------------------------
  return (
    <div className="min-h-full bg-[#F6F1EA] p-4 lg:p-6 font-sans flex flex-col items-center">
      <div className="w-full max-w-[1100px] flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-[20px] p-4 lg:p-6 shadow-[0_12px_40px_rgba(0,0,0,0.05)] border border-[#ECE5DD] mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#2F3338] flex items-center justify-center shadow-lg">
            <Mic className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-[#1F2022]">{activeMode.title}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
              <span className="text-[13px] font-bold text-[#10B981] uppercase tracking-wider">Session Active</span>
              <span className="text-[13px] font-bold text-[#747474] ml-2">⏱ {formatTimer(timerSeconds)}</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleEndSession}
          className="bg-white border border-[#ECE5DD] text-[#747474] hover:bg-[#FF8E8B]/10 hover:text-[#FF8E8B] hover:border-[#FF8E8B]/30 px-5 py-2.5 rounded-xl text-[14px] font-semibold transition-all flex items-center gap-2"
        >
          <X className="w-4 h-4" /> End Session
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">

        {/* Main Chat Area */}
        <div className="lg:col-span-2 flex flex-col bg-white rounded-[24px] border border-[#ECE5DD] shadow-[0_12px_40px_rgba(0,0,0,0.05)] overflow-hidden">

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <AnimatePresence>
              {transcript.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${msg.sender === 'Student' ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[11px] font-bold text-[#747474] uppercase tracking-wider mb-2 ml-1">
                    {msg.sender === 'Student' ? 'You' : 'AI Coach'}
                  </span>
                  <div className={`p-4 rounded-2xl max-w-[85%] text-[15px] leading-relaxed shadow-sm ${msg.sender === 'Student'
                    ? 'bg-[#2F3338] text-white rounded-tr-sm'
                    : 'bg-[#F6F1EA] text-[#1F2022] rounded-tl-sm border border-[#ECE5DD]'
                    }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}

              {isWaitingForAI && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="flex flex-col items-start"
                >
                  <span className="text-[11px] font-bold text-[#747474] uppercase tracking-wider mb-2 ml-1">AI Coach</span>
                  <div className="p-4 rounded-2xl bg-[#F6F1EA] border border-[#ECE5DD] rounded-tl-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#2F3338] rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-[#2F3338] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    <span className="w-2 h-2 bg-[#2F3338] rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={transcriptEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 bg-white border-t border-[#ECE5DD]">
            {liveTranscript && (
              <div className="mb-4 p-3 bg-[#F6F1EA] rounded-xl border border-[#ECE5DD] text-[14px] text-[#747474] italic">
                {liveTranscript}...
              </div>
            )}
            <div className="flex items-center gap-4">
              <button
                onClick={handleMicClick}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all shadow-md ${isRecording
                  ? 'bg-[#FF8E8B] text-white shadow-[#FF8E8B]/40 animate-pulse'
                  : 'bg-[#2F3338] text-white hover:bg-[#3B4046]'
                  }`}
              >
                {isRecording ? <StopCircle className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              <input
                type="text"
                value={typedMessage}
                onChange={e => setTypedMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendTextMessage()}
                placeholder={isRecording ? "Listening..." : "Type your message here..."}
                disabled={isRecording || isWaitingForAI}
                className="flex-1 bg-[#F6F1EA] border-none rounded-2xl px-6 py-4 text-[15px] font-medium text-[#1F2022] focus:outline-none focus:ring-2 focus:ring-[#C89B63]/50 disabled:opacity-50"
              />
              <button
                onClick={handleSendTextMessage}
                disabled={!typedMessage.trim() || isRecording || isWaitingForAI}
                className="w-14 h-14 rounded-2xl bg-[#C89B63] text-white flex items-center justify-center shrink-0 hover:bg-[#B58B55] disabled:opacity-50 transition-colors shadow-md shadow-[#C89B63]/20"
              >
                <Send className="w-6 h-6 ml-1" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Real-time Feedback */}
        <div className="flex flex-col gap-6 overflow-y-auto">

          {/* Performance Badges */}
          <div className="bg-white rounded-[24px] p-6 border border-[#ECE5DD] shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
            <h3 className="text-[16px] font-bold text-[#1F2022] mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#87B7F5]" />
              Real-time Analysis
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(badges).map(([key, value]) => (
                <div key={key} className="bg-[#F6F1EA] p-3 rounded-xl border border-[#ECE5DD]">
                  <div className="text-[11px] font-bold text-[#747474] uppercase mb-1">{key}</div>
                  <div className="text-[13px] font-bold text-[#2F3338]">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Corrections */}
          {corrections.length > 0 && (
            <div className="bg-white rounded-[24px] p-6 border border-[#ECE5DD] shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
              <h3 className="text-[16px] font-bold text-[#1F2022] mb-4 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-[#FF8E8B]" />
                Grammar Corrections
              </h3>
              <div className="space-y-4">
                {corrections.map((corr, idx) => (
                  <div key={idx} className="bg-[#F6F1EA] p-4 rounded-xl border border-[#ECE5DD]">
                    <div className="text-[13px] text-[#FF8E8B] line-through mb-1 font-medium">{corr.original}</div>
                    <div className="text-[14px] text-[#10B981] font-bold mb-2">{corr.suggested}</div>
                    <div className="text-[12px] text-[#747474] leading-relaxed">{corr.explanation}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vocabulary */}
          {vocabList.length > 0 && (
            <div className="bg-white rounded-[24px] p-6 border border-[#ECE5DD] shadow-[0_12px_40px_rgba(0,0,0,0.05)]">
              <h3 className="text-[16px] font-bold text-[#1F2022] mb-4 flex items-center gap-2">
                <Zap className="w-5 h-5 text-[#C89B63]" />
                New Vocabulary
              </h3>
              <div className="space-y-3">
                {vocabList.map((v, idx) => (
                  <div key={idx} className="bg-[#F6F1EA] p-3 rounded-xl border border-[#ECE5DD] flex justify-between items-start gap-2">
                    <div>
                      <div className="text-[14px] font-bold text-[#2F3338]">{v.word}</div>
                      <div className="text-[12px] text-[#747474] mt-1">{v.meaning}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
      </div>
    </div>
  );
};

export default ConversationPartner;
