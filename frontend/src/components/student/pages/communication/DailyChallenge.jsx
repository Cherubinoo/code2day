import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Trophy, History, Play, StopCircle, RefreshCw, Send, CheckCircle2, Target, CalendarDays, Gift, Star, Clock, AlertTriangle, ArrowRight, Video, Mic } from 'lucide-react';

const DailyChallenge = ({ token, API_BASE, user, setUser, fetchWithAuth }) => {
  // Navigation & Category states
  const [activeCategory, setActiveCategory] = useState('self_introduction'); // self_introduction, project_explanation, technical, group_discussion, leadership, workplace
  const [difficulty, setDifficulty] = useState('Medium'); // Easy, Medium, Hard

  // Real daily challenge states from backend
  const [challengeData, setChallengeData] = useState(null);
  const [challengeCompleted, setChallengeCompleted] = useState(false);
  const [streakCount, setStreakCount] = useState(0);
  const [userXp, setUserXp] = useState(0);
  const [activityHistory, setActivityHistory] = useState([]);

  // Reading challenge states
  const [isReading, setIsReading] = useState(false);
  const [isReadingPaused, setIsReadingPaused] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [readingFeedback, setReadingFeedback] = useState(null);

  // Video challenge states
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [showRecordingWorkspace, setShowRecordingWorkspace] = useState(false);
  const [videoFeedback, setVideoFeedback] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Calendar states
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState('');
  const [showSessionDetailModal, setShowSessionDetailModal] = useState(false);
  const [activeSessionDetail, setActiveSessionDetail] = useState(null);

  // Review / Restart / Submit states
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [challengeVideos, setChallengeVideos] = useState({});

  // Audio recording refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef(null);
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const scrollIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const scrollerContainerRef = useRef(null);
  const recognitionRef = useRef(null);

  // Real-time Browser Speech recognition
  const [liveTranscript, setLiveTranscript] = useState('');

  // Default passages if backend is delayed
  const passages = {
    self_introduction: {
      text: "Hi, I am Harish S, an AI and Data Science student graduating in 2027. I am highly passionate about engineering deep learning models, training neural networks, and developing responsive full-stack applications with React and Django backends. I thrive in collaborative software engineering environments and aim to solve real-world industry bottlenecks using intelligent automation.",
      vocab: "Intermediate"
    },
    project_explanation: {
      text: "One of my major engineering projects is Learn2Lead AI, an AI-powered career readiness platform. The platform is built using React with Vanilla CSS on the frontend and Django REST Framework on the backend. It integrates with large language models to assess student resumes, calculate mock interview placement scores, and deliver real-time communication feedback.",
      vocab: "Advanced"
    },
    technical: {
      text: "In microservices architecture, minimizing network latency is crucial for scaling. We optimize Django backends by setting up Redis caching layers and optimizing PostgreSQL index layouts. This reduces database query response times by over thirty percent and guarantees seamless client interactions during high-traffic placement drives.",
      vocab: "Advanced"
    },
    group_discussion: {
      text: "I believe that AI tools will not replace developers directly, but developers who harness the power of generative AI will replace those who do not. Using assistant agents enables rapid prototyping and code boilerplate generation, which frees software engineers to focus on system design, database schemas, and robust business logic.",
      vocab: "Intermediate"
    },
    leadership: {
      text: "To lead a software development team effectively during a crunch sprint, a project manager must prioritize tasks and clear blockages early. Facilitating daily agile standups and encouraging regular peer code reviews ensures code quality, keeps engineering pipelines aligned, and helps team members stay motivated.",
      vocab: "Intermediate"
    },
    workplace: {
      text: "When communicating complex technical architectures to non-technical stakeholders, it is important to avoid engineering jargon. Using visual metaphors, drawing flowcharts, and focusing on user-facing benefits rather than underlying infrastructure details helps gain project signoff and alignment across departments.",
      vocab: "Intermediate"
    }
  };

  const currentPassage = passages[activeCategory] || passages.self_introduction;
  const wordCount = currentPassage.text.split(' ').length;
  const estTime = Math.ceil(wordCount / 130);

  // Initialize and load challenge details from backend
  useEffect(() => {
    fetchChallenge();
    logVisit();
  }, [user]);

  const fetchChallenge = async () => {
    if (!token || !fetchWithAuth) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/communication/daily-challenge/`);
      if (res.ok) {
        const data = await res.json();
        setChallengeData(data.challenge);
        setChallengeCompleted(data.completed);
        setStreakCount(data.streak || 0);
        setUserXp(data.xp || 0);
      }
    } catch (err) {
      console.warn("Could not fetch daily challenge:", err);
    }
  };

  const logVisit = async () => {
    if (!token || !fetchWithAuth) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/communication/visit/`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await res.json();
        setStreakCount(data.streak || 0);
        if (data.activity_history) setActivityHistory(data.activity_history);
      }
    } catch (err) {
      console.warn("Could not log visit:", err);
    }
  };

  // Setup camera preview (for video card layout simulation)
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn("Camera preview unavailable, using audio recording only:", err);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // Auto scroll effect for Reading Challenge
  useEffect(() => {
    if (isReading && !isReadingPaused) {
      const speed = difficulty === 'Easy' ? 0.3 : difficulty === 'Medium' ? 0.6 : 1.0;
      scrollIntervalRef.current = setInterval(() => {
        setScrollOffset(prev => {
          const maxScroll = scrollerContainerRef.current
            ? scrollerContainerRef.current.scrollHeight - scrollerContainerRef.current.clientHeight
            : 200;
          if (prev >= maxScroll + 20) {
            clearInterval(scrollIntervalRef.current);
            return prev;
          }
          return prev + speed;
        });
      }, 30);
    } else {
      clearInterval(scrollIntervalRef.current);
    }
    return () => clearInterval(scrollIntervalRef.current);
  }, [isReading, isReadingPaused, difficulty]);

  // Video recording timer
  useEffect(() => {
    if (isRecording && !isRecordingPaused) {
      timerIntervalRef.current = setInterval(() => {
        setRecordTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [isRecording, isRecordingPaused]);

  // Attach webcam stream to video element when it becomes available
  useEffect(() => {
    if (showRecordingWorkspace && videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
    }
  }, [showRecordingWorkspace, isRecording]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle Reading Actions
  const handleStartReading = async () => {
    if (challengeCompleted) return;
    setLiveTranscript('');
    setReadingFeedback(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await submitChallengeAudio(audioBlob, true);
      };

      // Browser Web Speech recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        rec.onresult = (event) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
            else interim += event.results[i][0].transcript;
          }
          setLiveTranscript(final || interim);
        };
        rec.start();
        recognitionRef.current = rec;
      }

      mediaRecorder.start();
      setIsReading(true);
      setIsReadingPaused(false);
      setScrollOffset(0);
    } catch (err) {
      alert("Could not access microphone: " + err.message);
    }
  };

  const handleStopReading = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsReading(false);
    setIsReadingPaused(false);
    stopCamera();
  };

  // Handle Video Speaking Challenge
  const handleStartRecording = async () => {
    if (challengeCompleted) return;
    setLiveTranscript('');
    setVideoFeedback(null);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const videoBlob = new Blob(audioChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(videoBlob);
        setRecordedBlob(videoBlob);
        setRecordedUrl(url);
        setIsReviewing(true);
        stopCamera();
      };

      // Web Speech recognition
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-IN'; // Optimized for Indian English accent
        rec.onresult = (event) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
            else interim += event.results[i][0].transcript;
          }
          setLiveTranscript(final || interim);
        };
        rec.start();
        recognitionRef.current = rec;
      }

      mediaRecorder.start();
      setShowRecordingWorkspace(true);
      setIsRecording(true);
      setIsRecordingPaused(false);
      setRecordTime(0);
    } catch (err) {
      alert("Microphone/Camera access required: " + err.message);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
  };

  const handleRestartChallenge = () => {
    setRecordedBlob(null);
    setRecordedUrl(null);
    setIsReviewing(false);
    setShowRecordingWorkspace(false);
    setIsRecording(false);
    setRecordTime(0);
    setLiveTranscript('');
    setVideoFeedback(null);
  };
  const handleNewChallenge = async () => {
    if (!token || !fetchWithAuth) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/communication/daily-challenge/?refresh=true`);
      if (res.ok) {
        const data = await res.json();
        setChallengeData(data.challenge);
        setChallengeCompleted(false);
        setReadingFeedback(null);
        setVideoFeedback(null);
        setRecordedBlob(null);
        setRecordedUrl(null);
        setIsReviewing(false);
        setShowRecordingWorkspace(false);
        setRecordTime(0);
        setLiveTranscript('');
      }
    } catch (err) {
      console.warn("Could not fetch new daily challenge:", err);
    }
  };

  const handleSubmitChallenge = async () => {
    if (!recordedBlob) return;
    await submitChallengeAudio(recordedBlob, false);
    setIsReviewing(false);
  };

  // Submit audio to backend challenge evaluator
  const submitChallengeAudio = async (blob, isReadingChallenge) => {
    if (!token || !fetchWithAuth) return;

    const formData = new FormData();
    formData.append('audio_file', blob, 'speaking.webm');
    if (liveTranscript) {
      formData.append('backup_text', liveTranscript);
    }

    try {
      const response = await fetchWithAuth(`${API_BASE}/api/communication/daily-challenge/submit/`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setStreakCount(data.streak || streakCount);
        setChallengeCompleted(true);

        const evalObj = data.evaluation || {
          reading_accuracy: 85,
          fluency_score: 80,
          confidence_score: 80,
          overall_score: 82,
          feedback: "Great job completing the challenge!"
        };

        const feedbackObj = {
          completed: true,
          accuracy: evalObj.reading_accuracy,
          fluency: evalObj.fluency_score,
          confidence: evalObj.confidence_score,
          overall: evalObj.overall_score,
          feedback: evalObj.feedback,
          reasoning: evalObj.reasoning || "No expert reasoning details provided.",
          transcript: data.transcript || liveTranscript,
          question: challengeData?.text || currentPassage.text,
          xp: 100
        };

        if (isReadingChallenge) {
          setReadingFeedback(feedbackObj);
        } else {
          setVideoFeedback(feedbackObj);
          // Save video URL to challengeVideos dictionary
          const todayStr = new Date().toISOString().split('T')[0];
          setChallengeVideos(prev => ({
            ...prev,
            [todayStr]: recordedUrl
          }));
        }

        setShowReportModal(true);

        // Trigger user profile sync
        if (setUser && user) {
          const updatedProfile = { ...user.profile, xp: (user.profile?.xp || 0) + 100, streak: data.streak };
          setUser({ ...user, profile: updatedProfile });
        }
      }
    } catch (err) {
      console.error("Error submitting daily challenge:", err);
      alert("Evaluation failed. Keeping offline calculations.");
    }
  };

  const handleDateClick = (day) => {
    const currentMonth = (calendarDate.getMonth() + 1).toString().padStart(2, '0');
    const currentYear = calendarDate.getFullYear();
    const formattedStr = `${currentYear}-${currentMonth}-${day.toString().padStart(2, '0')}`;
    setSelectedDate(formattedStr);
    const dayItem = activityHistory.find(a => a.date === formattedStr);

    if (dayItem && dayItem.has_completed_challenge) {
      const localToday = new Date();
      const todayStr = `${localToday.getFullYear()}-${(localToday.getMonth()+1).toString().padStart(2,'0')}-${localToday.getDate().toString().padStart(2,'0')}`;
      const isToday = formattedStr === todayStr;
      
      const dateVideo = dayItem.video_url || challengeVideos[formattedStr] || (isToday && recordedUrl ? recordedUrl : null) || "https://www.w3schools.com/html/mov_bbb.mp4";
      
      setVideoFeedback({
          completed: true,
          accuracy: dayItem.accuracy || 89,
          fluency: dayItem.fluency || 87,
          confidence: dayItem.confidence || 81,
          overall: dayItem.score || dayItem.overall_score || 84,
          feedback: dayItem.feedback || "Clear explanation of your ideas",
          reasoning: dayItem.reasoning || "Consistent pace, clear pronunciation.",
          transcript: dayItem.transcript || "I am submitting the challenge for this date.",
          question: dayItem.topic || "Daily Communication Challenge",
          pace: dayItem.pace || 145,
          fillers: dayItem.fillers || 3,
          xp: 100,
          videoUrl: dateVideo
      });
      setShowReportModal(true);
    }
  };

  const getMockVocabForDay = (dateStr) => {
    const vocabs = [
      [
        { word: 'ARTICULATE', meaning: 'Express an idea clearly and effectively', example: 'I can articulate complex ideas clearly.' },
        { word: 'ADAPTABILITY', meaning: 'Ability to adjust to change', example: 'Adaptability is important in technology.' },
        { word: 'PROACTIVE', meaning: 'Taking action before being asked', example: 'I take a proactive approach to learning.' }
      ],
      [
        { word: 'ELOQUENT', meaning: 'Fluent or persuasive in speaking', example: 'She gave an eloquent speech.' },
        { word: 'RESILIENT', meaning: 'Able to withstand or recover quickly', example: 'The team was highly resilient.' },
        { word: 'SYNERGY', meaning: 'Interaction yielding a greater effect', example: 'The synergy of our teams led to success.' }
      ],
      [
        { word: 'CONCISE', meaning: 'Giving a lot of information clearly', example: 'His answers were clear and concise.' },
        { word: 'METICULOUS', meaning: 'Showing great attention to detail', example: 'He is meticulous in his coding.' },
        { word: 'INNOVATIVE', meaning: 'Featuring new methods', example: 'An innovative approach to problem solving.' }
      ],
      [
        { word: 'EMPATHY', meaning: 'Ability to understand others feelings', example: 'Empathy is crucial for teamwork.' },
        { word: 'TENACITY', meaning: 'Being very determined', example: 'Her tenacity helped her finish the project.' },
        { word: 'PRAGMATIC', meaning: 'Dealing with things sensibly', example: 'We need a pragmatic solution.' }
      ]
    ];
    if (!dateStr) return vocabs[0];
    let sum = 0; for(let i=0; i<dateStr.length; i++) sum += dateStr.charCodeAt(i);
    return vocabs[sum % vocabs.length];
  };

  const activeFeedback = videoFeedback || readingFeedback;
  const dynamicVocab = activeFeedback?.vocabulary || getMockVocabForDay(selectedDate || new Date().toISOString().split('T')[0]);
  const dynamicStrengths = activeFeedback?.strengths || ["Clear explanation of your ideas", "Good sentence structure", "Professional tone"];
  const dynamicImprovements = activeFeedback?.improvements || ["Reduce filler words", "Speak slightly slower", "Use more precise vocabulary"];

  return (
    <div className="min-h-full bg-[#F7F3ED] font-sans text-[#1F2022] overflow-x-hidden">
      {/* FLOATING TOP BAR */}
      <div className="pt-6 px-6 lg:px-12 relative z-20">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-[24px] p-4 flex flex-col md:flex-row items-center justify-between shadow-[0_15px_45px_rgba(0,0,0,0.05)] border border-[#ECE5DD]"
        >
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#FBF8F5] flex items-center justify-center border border-[#ECE5DD]">
                <Flame className="w-6 h-6 text-[#D89B55]" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#747474] uppercase tracking-wider">Current Streak</p>
                <p className="text-[16px] font-bold text-[#1F2022]">{streakCount} Days Active</p>
              </div>
            </div>

            <div className="h-10 w-[1px] bg-[#ECE5DD] hidden md:block"></div>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#FBF8F5] flex items-center justify-center border border-[#ECE5DD]">
                <Trophy className="w-6 h-6 text-[#C89A63]" />
              </div>
              <div className="min-w-[140px]">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[12px] font-bold text-[#1F2022]">Level {Math.floor(userXp / 500) + 1}</span>
                  <span className="text-[12px] font-bold text-[#C89A63]">{userXp % 500}/500 XP</span>
                </div>
                <div className="h-1.5 w-full bg-[#FBF8F5] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(userXp % 500) / 5}%` }}
                    transition={{ duration: 1 }}
                    className="h-full bg-[#C89A63] rounded-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowCalendar(true)}
            className="mt-4 md:mt-0 px-5 py-3 bg-[#FBF8F5] text-[#1F2022] hover:bg-[#EFE4D5] transition-colors rounded-[16px] text-[14px] font-bold border border-[#ECE5DD] flex items-center gap-2"
          >
            <History className="w-4 h-4" />
            History
          </button>
        </motion.div>
      </div>

      {/* PAGE HEADER */}
      <div className="px-6 lg:px-12 mt-12 mb-10 relative z-10">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-[42px] font-bold text-[#1F2022] tracking-tight leading-tight mb-2"
        >
          Daily Challenge
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-[22px] font-medium text-[#747474] max-w-lg leading-snug"
        >
          Practice daily. Speak confidently.Become placement ready.
        </motion.p>
      </div>

      {/* MAIN LAYOUT */}
      <div className="px-6 lg:px-12 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">

        {/* LEFT COLUMN: HERO CARD */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6"
        >
          <div className="bg-white rounded-[26px] p-8 lg:p-10 border border-[#ECE5DD] shadow-[0_15px_45px_rgba(0,0,0,0.05)] transition-all duration-300 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] group relative overflow-hidden">
            {/* Subtle glow effect */}
            <div className="absolute -top-32 -right-32 w-96 h-96 bg-[#EFE4D5] rounded-full mix-blend-multiply filter blur-[100px] opacity-40 group-hover:opacity-70 transition-opacity duration-700 pointer-events-none"></div>

            <div className="relative z-10">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-[28px] font-bold text-[#1F2022] mb-2 tracking-tight">2-Minute Speaking Challenge</h2>
                  <p className="text-[16px] text-[#747474] font-medium">Record a video response and receive AI coaching.</p>
                </div>
                {challengeCompleted && (
                  <span className="px-4 py-1.5 bg-[#5E9C69]/10 text-[#5E9C69] text-[13px] font-bold rounded-full flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Completed
                  </span>
                )}
              </div>

              <div className="bg-[#FBF8F5] rounded-[20px] p-6 lg:p-8 border border-[#ECE5DD] mb-8">
                <span className="text-[13px] font-bold text-[#C89A63] uppercase tracking-wider block mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4" /> Today's Speaking Topic
                </span>
                <strong className="text-[20px] lg:text-[22px] font-medium text-[#1F2022] leading-relaxed block">
                  "{challengeData?.topic || "Describe a challenging technical bug you resolved in your final year project, and explain the steps."}"
                </strong>
              </div>

              {/* Video Workspace */}
              {(showRecordingWorkspace || challengeCompleted) ? (
                <div className="relative w-full aspect-video bg-[#26282C] rounded-[20px] overflow-hidden shadow-inner mb-8">
                  {challengeCompleted ? (
                    <video src={recordedUrl || "https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-typing-on-a-computer-keyboard-40612-large.mp4"} controls className="w-full h-full object-cover" />
                  ) : isReviewing ? (
                    <video src={recordedUrl} controls className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <div className="absolute top-5 left-5 bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl text-white text-[13px] font-bold flex items-center gap-2 z-10">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#D36C6C] animate-pulse"></span>
                        REC {formatTime(recordTime)}
                      </div>
                      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    </>
                  )}
                </div>
              ) : (
                <div className="mb-10">
                  <span className="text-[13px] font-bold text-[#747474] uppercase tracking-wider block mb-4 flex items-center gap-2">
                    <History className="w-4 h-4" /> Practice Topic Library
                  </span>
                  <ul className="flex flex-col gap-3">
                    {['Tell me about yourself', 'Explain your project architecture', 'Why should we hire you?', 'Team conflict'].map((topic, i) => (
                      <li key={i} className="flex items-center gap-3 text-[16px] text-[#1F2022] font-medium bg-[#FBF8F5] p-3 rounded-xl border border-[#ECE5DD]/50">
                        <div className="w-2 h-2 rounded-full bg-[#C89A63]"></div>
                        {topic}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dictation Box */}
              {(isRecording || isReviewing) && liveTranscript && (
                <div className="bg-[#FBF8F5] rounded-[20px] p-6 border border-[#ECE5DD] max-h-[150px] overflow-y-auto mb-8">
                  <span className="text-[12px] font-bold text-[#2FAE8B] uppercase tracking-wider block mb-3">
                    {isReviewing ? 'Your Spoken Transcript' : 'Real-time Dictation'}
                  </span>
                  <p className="text-[16px] text-[#747474] italic leading-relaxed">"{liveTranscript}"</p>
                </div>
              )}

              {/* Controls */}
              <div className="mt-4">
                {isRecording ? (
                  <button onClick={handleStopRecording} className="w-full py-5 bg-[#D36C6C] hover:bg-[#c25c5c] text-white rounded-[18px] font-bold text-[16px] transition-all transform hover:scale-[1.02] shadow-[0_10px_25px_rgba(211,108,108,0.3)] flex justify-center items-center gap-2">
                    <StopCircle className="w-5 h-5" /> Finish Recording
                  </button>
                ) : isReviewing ? (
                  <div className="flex gap-4">
                    <button onClick={handleRestartChallenge} className="flex-1 py-5 bg-white hover:bg-[#FBF8F5] text-[#1F2022] border border-[#ECE5DD] rounded-[18px] font-bold text-[16px] transition-all transform hover:scale-[1.02]">
                      <div className="flex items-center justify-center gap-2"><RefreshCw className="w-5 h-5" /> Restart</div>
                    </button>
                    <button onClick={handleSubmitChallenge} className="flex-1 py-5 bg-[#26282C] hover:bg-[#1F2022] text-white rounded-[18px] font-bold text-[16px] transition-all transform hover:scale-[1.02] shadow-[0_10px_25px_rgba(38,40,44,0.3)]">
                      <div className="flex items-center justify-center gap-2"><Send className="w-5 h-5" /> Submit Evaluation</div>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={challengeCompleted ? undefined : handleStartRecording}
                    disabled={challengeCompleted}
                    className={`w-full py-5 rounded-[18px] font-bold text-[16px] transition-all flex justify-center items-center gap-2 ${challengeCompleted ? 'bg-[#FBF8F5] text-[#747474] border border-[#ECE5DD] cursor-not-allowed' : 'bg-[#1F2022] hover:bg-[#26282C] text-white hover:scale-[1.02] shadow-[0_10px_30px_rgba(31,32,34,0.25)] hover:shadow-[0_15px_35px_rgba(31,32,34,0.35)] group'}`}
                  >
                    {challengeCompleted ? (
                      <><CheckCircle2 className="w-5 h-5" /> Video Challenge Completed</>
                    ) : (
                      <><Video className="w-5 h-5 group-hover:text-[#C89A63] transition-colors" /> Start Video Speaking Challenge</>
                    )}
                  </button>
                )}
                {challengeCompleted && (
                  <button onClick={handleNewChallenge} className="w-full mt-4 py-5 bg-[#26282C] hover:bg-[#1F2022] text-white rounded-[18px] font-bold text-[16px] transition-all flex justify-center items-center gap-2">
                    <RefreshCw className="w-5 h-5" /> Practice Another Passage
                  </button>
                )}
              </div>
            </div>

            {/* Video Feedback Area */}
            <AnimatePresence>
              {videoFeedback && (
                <motion.div
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 32 }}
                  className="bg-[#FBF8F5] rounded-[20px] p-6 border border-[#ECE5DD] relative z-10"
                >
                  <div className="flex justify-between items-center mb-5">
                    <strong className="text-[18px] text-[#1F2022] flex items-center gap-2"><Target className="w-5 h-5 text-[#2FAE8B]" /> Coaching Report</strong>
                    <span className="px-3 py-1.5 bg-[#C89A63]/10 text-[#C89A63] text-[13px] font-bold rounded-lg flex items-center gap-1"><Star className="w-4 h-4" /> +{videoFeedback.xp} XP</span>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="bg-white border border-[#2FAE8B]/30 p-5 rounded-xl text-[#2FAE8B] flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#2FAE8B]/10 flex items-center justify-center font-bold">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-[16px] text-[#1F2022]">Speech Score: {videoFeedback.overall}%</div>
                        <div className="text-[13px] mt-1">Fluency: {videoFeedback.fluency}% • Accuracy: {videoFeedback.accuracy}%</div>
                      </div>
                    </div>
                    <div className="bg-white border border-[#D89B55]/30 p-5 rounded-xl text-[#D89B55] flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#D89B55]/10 flex items-center justify-center font-bold mt-1">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                      <div className="text-[15px] text-[#1F2022] leading-relaxed font-medium">{videoFeedback.feedback}</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* RIGHT COLUMN: REWARDS & COACH */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="lg:col-span-5 xl:col-span-4 flex flex-col gap-8"
        >
          {/* Daily Rewards Card */}
          <div className="bg-white rounded-[26px] p-8 border border-[#ECE5DD] shadow-[0_15px_45px_rgba(0,0,0,0.05)] hover:-translate-y-1 transition-transform duration-300">
            <div className="flex items-center gap-3 mb-2">
              <Gift className="w-6 h-6 text-[#C89A63]" />
              <h3 className="text-[22px] font-bold text-[#1F2022]">Daily Rewards</h3>
            </div>
            <p className="text-[15px] text-[#747474] font-medium mb-6">Complete tasks to earn XP and grow.</p>

            <div className="grid gap-4 mb-6">
              <div className="flex justify-between items-center bg-[#FBF8F5] p-4 rounded-xl border border-[#ECE5DD]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#5E9C69]/10 flex items-center justify-center">
                    <Trophy className="w-4 h-4 text-[#5E9C69]" />
                  </div>
                  <span className="text-[#1F2022] font-bold text-[14px]">XP Level</span>
                </div>
                <strong className="text-[#5E9C69] text-[15px]">Level {Math.floor(userXp / 500) + 1}</strong>
              </div>

              <div className="flex justify-between items-center bg-[#FBF8F5] p-4 rounded-xl border border-[#ECE5DD]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#D89B55]/10 flex items-center justify-center">
                    <Flame className="w-4 h-4 text-[#D89B55]" />
                  </div>
                  <span className="text-[#1F2022] font-bold text-[14px]">Current Streak</span>
                </div>
                <strong className="text-[#D89B55] text-[15px]">{streakCount} Days Active</strong>
              </div>

              <div className="flex justify-between items-center bg-[#FBF8F5] p-4 rounded-xl border border-[#ECE5DD]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#87B7F5]/10 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-[#87B7F5]" />
                  </div>
                  <span className="text-[#1F2022] font-bold text-[14px]">Daily Status</span>
                </div>
                <strong className="text-[#87B7F5] text-[15px]">{challengeCompleted ? '1/1 Done' : '0/1 Completed'}</strong>
              </div>
            </div>

            <div className="mt-4 pt-6 border-t border-[#ECE5DD]">
              <div className="flex justify-between text-[12px] font-bold text-[#747474] uppercase tracking-wider mb-4">
                <span>Weekly Streak Goal</span>
                <span className="text-[#1F2022]">{streakCount}/7 days</span>
              </div>

              <div className="flex justify-between mb-4">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => {
                  const isCompleted = i < streakCount;
                  return (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <span className="text-[12px] font-bold text-[#747474]">{day}</span>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isCompleted ? 'bg-[#5E9C69] text-white shadow-md' : 'bg-[#FBF8F5] text-[#ECE5DD] border border-[#ECE5DD]'}`}>
                        {isCompleted && <CheckCircle2 className="w-4 h-4" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="h-2 w-full bg-[#FBF8F5] rounded-full overflow-hidden mb-6">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (streakCount / 7) * 100)}%` }}
                  transition={{ duration: 1.2, ease: "easeOut" }}
                  className="h-full bg-[#1F2022] rounded-full"
                />
              </div>

              {/* Reward Banner */}
              <div className="bg-[#EFE4D5]/50 border border-[#EFE4D5] rounded-full px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#C89A63]" />
                  <span className="text-[13px] font-bold text-[#1F2022]">Complete to earn XP!</span>
                </div>
                <span className="bg-[#5E9C69] text-white text-[11px] font-bold px-2 py-1 rounded-md tracking-wide">+50 XP</span>
              </div>
            </div>
          </div>

          {/* AI Coach Card */}
          <div className="bg-white rounded-[26px] p-8 border border-[#ECE5DD] shadow-[0_15px_45px_rgba(0,0,0,0.05)] relative overflow-hidden group">
            {/* Soft decorative background */}
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-[#2FAE8B]/5 rounded-bl-[150px] transition-transform duration-500 group-hover:scale-110 pointer-events-none"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#26282C] flex items-center justify-center shadow-lg">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="4" y="8" width="16" height="12" rx="3" fill="#EFE4D5" />
                    <circle cx="9" cy="14" r="2" fill="#26282C" />
                    <circle cx="15" cy="14" r="2" fill="#26282C" />
                    <path d="M12 8V4M12 4H9M12 4H15" stroke="#EFE4D5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[22px] font-bold text-[#1F2022]">AI Coach</h3>
                  <p className="text-[14px] text-[#747474] font-medium">Placement readiness insight</p>
                </div>
              </div>

              <p className="text-[16px] text-[#1F2022] font-medium leading-relaxed mb-6">
                {challengeCompleted
                  ? "Great effort practicing today! Daily speak training builds vocal rhythm and pacing confidence for interviews."
                  : "Practice today's challenge by speaking aloud. Completing challenges rewards you with XP and increments your placement readiness."
                }
              </p>

              <div className="bg-[#FBF8F5] p-5 rounded-[16px] border border-[#ECE5DD] flex items-start gap-3">
                <Target className="w-5 h-5 text-[#C89A63] mt-0.5" />
                <div>
                  <div className="text-[12px] font-bold text-[#747474] uppercase tracking-wider mb-1">Current Focus</div>
                  <strong className="text-[15px] text-[#1F2022]">
                    {challengeCompleted ? "Leadership Communication Challenge tomorrow." : "Today's Fluency Passage"}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* CALENDAR MODAL */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#1F2022]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCalendar(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[26px] w-full max-w-[480px] p-8 shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setShowCalendar(false)} className="absolute top-6 right-6 text-[#747474] hover:text-[#1F2022] p-2 hover:bg-[#FBF8F5] rounded-full transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <div className="flex items-center justify-between mb-2 pr-10">
                <h3 className="text-2xl font-bold text-[#1F2022] flex items-center gap-2"><CalendarDays className="w-6 h-6" /> Activity Calendar</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="p-1 hover:bg-[#FBF8F5] rounded-md text-[#747474] font-bold">{"<"}</button>
                  <span className="text-[14px] font-bold text-[#1F2022]">{calendarDate.toLocaleString('default', { month: 'short' })} {calendarDate.getFullYear()}</span>
                  <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="p-1 hover:bg-[#FBF8F5] rounded-md text-[#747474] font-bold">{">"}</button>
                </div>
              </div>
              <p className="text-[15px] text-[#747474] font-medium mb-8">Click highlighted days to view past recordings and evaluations.</p>

              <div className="grid grid-cols-7 gap-3 text-center">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="text-[12px] font-bold text-[#747474] uppercase mb-2">{d}</div>
                ))}
                {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1).getDay() }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square"></div>
                ))}
                {Array.from({ length: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0).getDate() }, (_, i) => i + 1).map(day => {
                  const currentMonth = (calendarDate.getMonth() + 1).toString().padStart(2, '0');
                  const currentYear = calendarDate.getFullYear();
                  const formattedStr = `${currentYear}-${currentMonth}-${day.toString().padStart(2, '0')}`;
                  const dayItem = activityHistory.find(a => a.date === formattedStr);
                  const isToday = new Date().getDate() === day && new Date().getMonth() === calendarDate.getMonth() && new Date().getFullYear() === calendarDate.getFullYear();
                  return (
                    <motion.div
                      key={day}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDateClick(day)}
                      className={`aspect-square rounded-[14px] flex items-center justify-center text-[15px] font-bold cursor-pointer transition-colors ${dayItem && dayItem.has_completed_challenge
                          ? 'bg-[#1F2022] text-white shadow-md'
                          : isToday
                            ? 'border-2 border-[#1F2022] text-[#1F2022]'
                            : 'text-[#747474] bg-[#FBF8F5] hover:bg-[#EFE4D5]'
                        }`}
                    >
                      {day}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SESSION DETAILS MODAL */}
      <AnimatePresence>
        {showSessionDetailModal && activeSessionDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#1F2022]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowSessionDetailModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[26px] w-full max-w-[550px] p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setShowSessionDetailModal(false)} className="absolute top-6 right-6 text-[#747474] hover:text-[#1F2022] p-2 hover:bg-[#FBF8F5] rounded-full transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
              <h3 className="text-2xl font-bold text-[#1F2022] mb-2 flex items-center gap-2"><Play className="w-6 h-6" /> Challenge Recording</h3>
              <p className="text-[15px] text-[#747474] font-medium mb-6">Recorded on {activeSessionDetail.date}</p>

              <div className="w-full aspect-video bg-[#26282C] rounded-[16px] overflow-hidden shadow-inner mb-8">
                <video src={activeSessionDetail.videoUrl} controls playsInline preload="auto" className="w-full h-full object-cover" />
              </div>

              <div className="flex flex-col gap-4 text-[15px]">
                <div className="flex justify-between pb-4 border-b border-[#ECE5DD]">
                  <span className="text-[#747474] font-bold">Topic</span>
                  <strong className="text-[#1F2022] text-right max-w-[60%]">{activeSessionDetail.topic}</strong>
                </div>
                <div className="flex justify-between pb-4 border-b border-[#ECE5DD]">
                  <span className="text-[#747474] font-bold">Duration</span>
                  <strong className="text-[#1F2022] flex items-center gap-1"><Clock className="w-4 h-4" /> {activeSessionDetail.duration} mins</strong>
                </div>
                <div className="flex justify-between pb-4 border-b border-[#ECE5DD]">
                  <span className="text-[#747474] font-bold">Strengths</span>
                  <strong className="text-[#5E9C69] text-right max-w-[60%]">{activeSessionDetail.strengths}</strong>
                </div>
                <div className="flex justify-between pb-4 border-b border-[#ECE5DD]">
                  <span className="text-[#747474] font-bold">Improvement Areas</span>
                  <strong className="text-[#D89B55] text-right max-w-[60%]">{activeSessionDetail.improve}</strong>
                </div>

                <div className="mt-4 bg-[#FBF8F5] border-l-4 border-l-[#C89A63] p-5 rounded-r-[16px] text-[#1F2022] leading-relaxed">
                  <strong className="text-[#C89A63] flex items-center gap-2 mb-2"><Target className="w-4 h-4" /> Coach Notes:</strong>
                  <p className="text-[14px] font-medium text-[#747474]">{activeSessionDetail.coachNotes}</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DAILY CHALLENGE REPORT MODAL */}
      <AnimatePresence>
        {showReportModal && (videoFeedback || readingFeedback) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#1F2022]/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setShowReportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[26px] w-full max-w-[1150px] p-8 shadow-2xl relative my-8"
              onClick={e => e.stopPropagation()}
            >
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  #report-modal-content, #report-modal-content * { visibility: visible; }
                  #report-modal-content { position: absolute; left: 0; top: 0; width: 100%; }
                  .no-print { display: none !important; }
                  .print-1-col { grid-template-columns: 1fr !important; gap: 0 !important; }
                  .print-border-hide { border-top: none !important; }
                }
              `}</style>
              
              <div id="report-modal-content" className="w-full">
                
                {/* Header for Screen */}
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-[#ECE5DD] no-print">
                  <h3 className="text-xl font-bold text-[#1F2022] tracking-widest uppercase">Daily Challenge Report</h3>
                  <div className="flex items-center gap-4">
                    <button onClick={() => window.print()} className="flex items-center gap-2 text-[#C89A63] hover:text-[#D89B55] font-bold text-[14px]">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      Download PDF
                    </button>
                    <button onClick={() => setShowReportModal(false)} className="text-[#747474] hover:text-[#1F2022] p-2 hover:bg-[#FBF8F5] rounded-full transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                  </div>
                </div>

                {/* Print Title Only */}
                <div className="text-center mb-6 hidden print:block">
                  <h3 className="text-2xl font-bold text-[#1F2022] tracking-widest uppercase">Daily Challenge Report</h3>
                  <p className="text-[14px] text-[#747474] mt-1 font-medium">September 03 • Challenge #273</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-10 print-1-col">
                  
                  {/* LEFT COLUMN: Score & Recording */}
                  <div className="flex flex-col">
                    <div className="text-center mb-6">
                      <div className="text-[12px] font-bold text-[#747474] uppercase tracking-wider mb-2">Speaking Score</div>
                      <div className="text-4xl font-extrabold text-[#1F2022] mb-4">{(videoFeedback || readingFeedback).overall || 84} <span className="text-lg text-[#747474] font-medium">/ 100</span></div>
                      
                      <div className="grid grid-cols-3 gap-2 text-center border-y border-[#ECE5DD] py-3 mb-4">
                        <div>
                          <div className="text-[12px] text-[#747474] font-bold mb-1">Fluency</div>
                          <div className="text-[16px] font-bold text-[#1F2022]">{(videoFeedback || readingFeedback).fluency || 87}</div>
                        </div>
                        <div>
                          <div className="text-[12px] text-[#747474] font-bold mb-1">Clarity</div>
                          <div className="text-[16px] font-bold text-[#1F2022]">{(videoFeedback || readingFeedback).accuracy || 89}</div>
                        </div>
                        <div>
                          <div className="text-[12px] text-[#747474] font-bold mb-1">Confidence</div>
                          <div className="text-[16px] font-bold text-[#1F2022]">{(videoFeedback || readingFeedback).confidence || 81}</div>
                        </div>
                      </div>
                      
                      <div className="flex justify-center gap-6 text-[13px] font-bold text-[#1F2022]">
                        <div>Speaking Pace: <span className="font-medium text-[#747474]">{(videoFeedback || readingFeedback).pace || 145} WPM</span></div>
                        <div>Filler Words: <span className="font-medium text-[#747474]">{(videoFeedback || readingFeedback).fillers || 3}</span></div>
                      </div>
                    </div>

                    {(videoFeedback?.videoUrl || recordedUrl) && (
                      <div className="mb-6 border-t border-[#ECE5DD] pt-6 print-border-hide">
                        <span className="text-[12px] font-bold text-[#747474] uppercase tracking-wider block mb-3 text-center">Your Recording</span>
                        <div className="w-full aspect-video bg-[#26282C] rounded-[12px] overflow-hidden shadow-inner no-print mb-2">
                          <video src={videoFeedback?.videoUrl || recordedUrl} controls className="w-full h-full object-cover" />
                        </div>
                        <div className="text-center text-[#747474] text-sm font-bold no-print">
                          Duration: {activeFeedback?.duration || formatTime(recordTime || 14)}
                        </div>
                        <div className="hidden print:block text-center text-[#747474] text-sm italic">
                          ▶ 01:47 / 02:00
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CENTER COLUMN: AI Feedback & Coach's Step */}
                  <div className="flex flex-col border-l-0 md:border-l print:border-l-0 border-[#ECE5DD] pl-0 md:pl-8 print:pl-0">
                    <div className="mb-6 pt-0 print:border-t print:pt-6 print:border-[#ECE5DD]">
                      <span className="text-[12px] font-bold text-[#747474] uppercase tracking-wider block mb-3 text-center">AI Communication Feedback</span>
                      <div className="bg-[#FBF8F5] rounded-[12px] p-4 text-[14px]">
                        <ul className="space-y-2 mb-4">
                          {dynamicStrengths.map((str, i) => (
                            <li key={i} className="flex items-start gap-2 text-[#5E9C69]"><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> <span className="text-[#1F2022]">{str}</span></li>
                          ))}
                        </ul>
                        <div className="font-bold text-[#1F2022] mb-2">Improve:</div>
                        <ul className="space-y-2">
                          {dynamicImprovements.map((imp, i) => (
                            <li key={i} className="flex items-start gap-2 text-[#D89B55]"><div className="w-1.5 h-1.5 rounded-full bg-[#D89B55] mt-1.5 shrink-0" /> <span className="text-[#1F2022]">{imp}</span></li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mb-8 border-t border-[#ECE5DD] pt-6 text-center mt-auto">
                      <span className="text-[12px] font-bold text-[#747474] uppercase tracking-wider block mb-3">Coach's Next Step</span>
                      <p className="text-[15px] italic text-[#1F2022] font-medium leading-relaxed">
                        "Focus on reducing filler words and use the vocabulary learned today in your next answer."
                      </p>
                    </div>

                    <button
                      onClick={() => setShowReportModal(false)}
                      className="w-full py-4 bg-[#1F2022] hover:bg-[#26282C] text-white font-bold rounded-[16px] transition-colors shadow-md mt-auto no-print"
                    >
                      Close Report
                    </button>
                  </div>

                  {/* RIGHT COLUMN: Vocabulary */}
                  <div className="flex flex-col border-l-0 md:border-l print:border-l-0 border-[#ECE5DD] pl-0 md:pl-8 print:pl-0">
                    <div className="mb-6 pt-0 print:border-t print:pt-6 print:border-[#ECE5DD]">
                      <span className="text-[12px] font-bold text-[#747474] uppercase tracking-wider block mb-3 text-center">Today's Vocabulary</span>
                      <div className="space-y-5">
                        {dynamicVocab.map((v, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="text-[12px] font-bold text-[#C89A63] pt-0.5">0{i+1}</div>
                            <div>
                              <div className="font-bold text-[#1F2022] text-[14px] uppercase flex items-center gap-1.5">{v.word} <Mic className="w-3.5 h-3.5 text-[#C89A63] cursor-pointer hover:text-[#1F2022]" /></div>
                              <div className="text-[13px] text-[#747474] mb-1">{v.meaning}</div>
                              <div className="text-[13px] italic text-[#1F2022]">"{v.example}"</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-auto mb-2 border-t border-[#ECE5DD] pt-6">
                      <div className="bg-[#FBF8F5] rounded-xl p-4 text-center border border-[#ECE5DD]">
                        <div className="text-[12px] font-bold text-[#747474] uppercase tracking-wider mb-2">Vocabulary Insight</div>
                        <p className="text-[13px] text-[#1F2022] mb-3">These words are useful for technical and behavioral interviews.</p>
                        <button className="px-4 py-2 bg-[#1F2022] text-white text-[13px] font-bold rounded-lg hover:bg-[#26282C] transition-colors no-print">
                          Practice Vocabulary
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DailyChallenge;
