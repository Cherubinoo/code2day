import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Download, Calendar, Mic, MessageSquare, Video, 
  BarChart3, Zap, Flame, Trophy, Activity, ArrowRight
} from 'lucide-react';
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, Tooltip 
} from 'recharts';

const CommunicationDashboard = ({ setActiveTab, commAnalytics, user, token, API_BASE, fetchWithAuth }) => {
  const [recentSessions, setRecentSessions] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    if (fetchWithAuth && API_BASE) {
      fetchHistory();
    }
  }, []);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/communication/analytics/`);
      if (res.ok) {
        const data = await res.json();
        if (data.recent_sessions) setRecentSessions(data.recent_sessions);
        else if (data.activity_history) setRecentSessions(data.activity_history);
      }
    } catch (e) {
      console.warn('Could not fetch comm history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const latest = commAnalytics?.latest_assessment || null;
  const latestSession = recentSessions.length > 0 ? recentSessions[0] : null;

  const grammar = latest?.grammar_score ?? latestSession?.grammar ?? 85;
  const fluency = latest?.fluency_score ?? latestSession?.fluency ?? 87;
  const confidence = latest?.confidence_score ?? latestSession?.confidence ?? 81;
  const vocab = latest?.vocabulary_score ?? latestSession?.vocabulary ?? 90;
  const overall = latest?.overall_score ?? latestSession?.score ?? latestSession?.overall_score ?? 84;
  const pronunciation = grammar !== null ? Math.round((fluency + confidence) / 2) : 84;

  const streak = user?.profile?.streak || 0;
  const xp = user?.profile?.xp || 0;
  const level = Math.floor(xp / 100) + 1;

  const getLabel = (s) => {
    if (s === null) return 'Not Assessed';
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Average';
    return 'Needs Work';
  };

  const radarData = [
    { subject: 'Fluency', A: fluency || 0, fullMark: 100 },
    { subject: 'Grammar', A: grammar || 0, fullMark: 100 },
    { subject: 'Overall', A: overall || 0, fullMark: 100 },
    { subject: 'Vocab', A: vocab || 0, fullMark: 100 },
    { subject: 'Pronunciation', A: pronunciation || 0, fullMark: 100 },
    { subject: 'Confidence', A: confidence || 0, fullMark: 100 },
  ];

  const handleDownloadReport = () => {
    window.print();
  };

  const MetricBar = ({ label, score }) => (
    <div className="mb-4">
      <div className="flex justify-between items-end mb-2">
        <span className="text-sm font-semibold text-premium-primary">{label}</span>
        <span className="text-sm font-bold text-premium-sidebar">{score !== null ? `${score}%` : 'N/A'}</span>
      </div>
      <div className="h-2 w-full bg-premium-border/40 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${score || 0}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full bg-premium-sidebar rounded-full"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-full p-6 lg:p-10 bg-premium-bg font-sans">
      
      {/* Hero Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-premium-sidebar rounded-3xl p-8 shadow-sm"
      >
        <div>
          <div className="text-xs font-bold tracking-widest text-white/50 uppercase mb-2">Communication Hub</div>
          <h2 className="text-3xl font-bold mb-2 tracking-tight" style={{ color: '#FBF7F3' }}>Your Communication Dashboard</h2>
          <p className="text-white/70 text-sm font-medium">Track your speaking skills, daily streaks, and AI-powered feedback</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowPreviewModal(true)}
          className="flex items-center gap-2 bg-white/10 border border-white/20 text-white px-5 py-3 rounded-xl font-semibold text-sm shadow-sm transition-colors hover:bg-white/20"
        >
          <Download className="w-4 h-4" />
          View Full Report
        </motion.button>
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Overall Score', value: overall !== null ? `${overall}%` : 'N/A', sub: getLabel(overall), icon: <BarChart3 className="w-5 h-5 text-premium-accent" /> },
          { label: 'Day Streak', value: `${streak}d`, sub: streak > 0 ? 'Keep it up!' : 'Start today!', icon: <Flame className="w-5 h-5 text-orange-500" /> },
          { label: 'Current Level', value: `Lv ${level}`, sub: `${xp} XP total`, icon: <Zap className="w-5 h-5 text-yellow-600" /> },
          { label: 'XP Earned', value: xp, sub: `${100 - (xp % 100)} XP to Lv ${level + 1}`, icon: <Trophy className="w-5 h-5 text-premium-sidebar" /> },
        ].map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-premium-card border border-premium-border rounded-2xl p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="bg-premium-bg p-2 rounded-xl border border-premium-border/50">
                {stat.icon}
              </div>
            </div>
            <div className="text-2xl font-bold text-premium-primary mb-1">{stat.value}</div>
            <div className="text-xs font-semibold text-premium-primary">{stat.label}</div>
            <div className="text-[10px] font-medium text-premium-secondary mt-1">{stat.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {[
          { icon: <Calendar className="w-6 h-6 text-[#1F2022]" />, label: 'Daily Challenge', desc: "Complete today's challenge and track your streak.", tab: 'daily_challenge' },
          { icon: <Activity className="w-6 h-6 text-[#1F2022]" />, label: 'Speak Analysis', desc: 'Analyze your speaking and grammar instantly.', tab: 'coaching' },
          { icon: <MessageSquare className="w-6 h-6 text-[#1F2022]" />, label: 'AI Conversation', desc: 'Practice conversational skills in realistic scenarios.', tab: 'conversation_partner' },
          { icon: <Video className="w-6 h-6 text-[#1F2022]" />, label: 'Mock Interviews', desc: 'Simulate technical interviews and boost confidence.', tab: 'interviews' },
        ].map((item, idx) => (
          <motion.button
            key={idx}
            whileHover={{ y: -4, scale: 1.01 }}
            onClick={() => setActiveTab(item.tab)}
            className="group relative flex flex-col items-start rounded-[26px] p-6 text-left transition-all duration-300 overflow-hidden shadow-lg hover:shadow-2xl h-[260px]"
            style={{ 
              backgroundColor: '#1F2022',
              backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 40px, transparent 40px, transparent 80px)'
            }}
          >
            {/* Soft inner glow top left */}
            <div className="absolute -top-16 -left-16 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none"></div>

            <div className="mb-auto p-3 rounded-2xl bg-[#EFE3D2] shadow-inner transition-transform duration-300 group-hover:scale-105">
              {item.icon}
            </div>
            
            <div className="w-[85%]">
              <h3 className="font-bold text-white text-[18px] mb-2 group-hover:text-[#EFE3D2] transition-colors">{item.label}</h3>
              <p className="text-[14px] text-[#ECE5DD]/70 font-medium leading-relaxed">{item.desc}</p>
            </div>

            <div className="absolute bottom-6 right-6 w-10 h-10 rounded-full bg-[#EFE3D2] flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1 group-hover:shadow-[0_0_15px_rgba(239,227,210,0.5)]">
              <ArrowRight className="w-5 h-5 text-[#1F2022]" />
            </div>
          </motion.button>
        ))}
      </div>

      {/* Main Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        
        {/* Score Breakdown */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-premium-card border border-premium-border rounded-3xl p-6 lg:p-8 shadow-sm flex flex-col"
        >
          <h3 className="text-base font-bold text-premium-primary mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-premium-accent" />
            Score Breakdown
          </h3>
          
          {latest ? (
            <div className="flex-1 flex flex-col justify-center">
              <MetricBar label="Grammar & Accuracy" score={grammar} />
              <MetricBar label="Fluency & Pace" score={fluency} />
              <MetricBar label="Confidence & Delivery" score={confidence} />
              <MetricBar label="Vocabulary Range" score={vocab} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <div className="w-16 h-16 bg-premium-bg border border-premium-border/50 rounded-full flex items-center justify-center mb-4">
                <Mic className="w-8 h-8 text-premium-secondary" />
              </div>
              <p className="text-sm font-medium text-premium-secondary mb-4">Complete a speaking session to see your breakdown</p>
              <button
                onClick={() => setActiveTab('coaching')}
                className="bg-premium-sidebar text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-premium-sidebar/90 transition-colors"
              >
                Start Speaking
              </button>
            </div>
          )}
        </motion.div>

        {/* AI Feedback & Competency Radar */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col gap-6"
        >
          {/* Feedback Card */}
          <div className="bg-premium-card border border-premium-border rounded-3xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-premium-primary mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-premium-accent" />
              AI Coach Feedback
            </h3>
            {latest?.feedback || latest?.overall_feedback ? (
              <div className="bg-premium-bg border border-premium-border/50 rounded-2xl p-5 text-sm font-medium text-premium-primary leading-relaxed">
                {latest.feedback || latest.overall_feedback}
              </div>
            ) : (
              <div className="bg-premium-bg border border-premium-border/50 rounded-2xl p-6 text-center text-sm font-medium text-premium-secondary">
                AI feedback will appear here after your first assessment.
              </div>
            )}
          </div>

          {/* Competency Radar */}
          <div className="bg-premium-card border border-premium-border rounded-3xl p-6 shadow-sm flex-1 flex flex-col items-center justify-center min-h-[250px]">
            <h3 className="text-sm font-bold text-premium-primary uppercase tracking-wider mb-2 self-start">Competency Mapping</h3>
            <div className="w-full h-full max-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#ECE5DD" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#747474', fontSize: 10, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Student" dataKey="A" stroke="#2E3135" fill="#2E3135" fillOpacity={0.15} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #ECE5DD' }} itemStyle={{ color: '#2E3135', fontWeight: 600 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </motion.div>
      </div>

      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-premium-card border border-premium-border rounded-3xl p-6 lg:p-8 shadow-sm"
        >
          <h3 className="text-base font-bold text-premium-primary mb-6">Recent Sessions</h3>
          <div className="flex flex-col gap-3">
            {recentSessions.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-premium-bg border border-premium-border/50 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-premium-border/50 flex items-center justify-center text-lg shadow-sm">
                    {s.has_completed_challenge ? '✅' : '📅'}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-premium-primary">{s.topic || s.challenge_type || 'Daily Challenge'}</div>
                    <div className="text-xs font-medium text-premium-secondary">
                      {s.date || (s.created_at ? new Date(s.created_at).toLocaleDateString() : 'N/A')}
                    </div>
                  </div>
                </div>
                {(s.score || s.overall_score) && (
                  <div className="text-lg font-black text-premium-sidebar bg-premium-sidebar/5 px-3 py-1 rounded-lg">
                    {s.score || s.overall_score}%
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Full Report Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-[#1F2022]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowPreviewModal(false)}>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #dashboard-report-content, #dashboard-report-content * { visibility: visible; }
              #dashboard-report-content { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; box-shadow: none !important; border: none !important; }
              .no-print { display: none !important; }
              .print-hide-bg { background: transparent !important; }
            }
          `}</style>
          <motion.div 
            id="dashboard-report-content"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white w-full max-w-3xl rounded-[26px] shadow-2xl overflow-hidden relative my-8" 
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-[#1F2022] text-white p-8 pb-12 relative">
              <button 
                onClick={() => setShowPreviewModal(false)}
                className="absolute top-6 right-6 text-white/50 hover:text-white p-2 transition-colors no-print"
              >
                ✕
              </button>
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-6 h-6 text-[#C89A63]" />
                <h3 className="text-2xl font-bold tracking-tight">Communication Progress Report</h3>
              </div>
              <p className="text-white/70 text-[15px] font-medium">Generated for {user?.username || 'Student'}</p>
            </div>

            {/* Report Content */}
            <div className="p-8 -mt-8 relative z-10">
              <div className="bg-white rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-6 mb-8 border border-[#ECE5DD] flex items-center justify-between">
                <div>
                  <div className="text-[12px] font-bold text-[#747474] uppercase tracking-wider mb-1">Overall Readiness</div>
                  <div className="text-4xl font-extrabold text-[#1F2022]">{overall !== null ? overall : 0}<span className="text-xl text-[#747474] font-medium">/100</span></div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] font-bold text-[#747474] uppercase tracking-wider mb-1">Performance Level</div>
                  <div className={`text-xl font-bold ${overall >= 80 ? 'text-[#5E9C69]' : overall >= 60 ? 'text-[#D89B55]' : 'text-[#D36C6C]'}`}>
                    {getLabel(overall)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Metric Bars */}
                <div>
                  <h4 className="text-[16px] font-bold text-[#1F2022] mb-4">Detailed Metrics</h4>
                  <MetricBar label="Fluency" score={fluency} />
                  <MetricBar label="Grammar" score={grammar} />
                  <MetricBar label="Confidence" score={confidence} />
                  <MetricBar label="Vocabulary" score={vocab} />
                </div>

                {/* Radar Chart */}
                <div className="bg-[#FBF8F5] rounded-2xl p-4 border border-[#ECE5DD] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={250}>
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#EFE4D5" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#747474', fontSize: 11, fontWeight: 600 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Student" dataKey="A" stroke="#C89A63" fill="#C89A63" fillOpacity={0.3} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ color: '#1F2022', fontWeight: 600 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="border-t border-[#ECE5DD] pt-6 flex flex-col sm:flex-row gap-4 justify-end no-print">
                <button 
                  onClick={() => {
                    const url = `whatsapp://send?text=Check out my communication progress report on Learn2Lead! I scored ${overall}%!`;
                    window.open(url, '_blank');
                  }}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl transition-colors shadow-sm"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a5.8 5.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.81 11.81 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.8 11.8 0 0 0-3.48-8.413z"/></svg>
                  Share
                </button>
                <a 
                  href={`mailto:?subject=${encodeURIComponent("My Communication Progress Report")}&body=${encodeURIComponent(`I've scored ${overall}% on my latest communication challenge!\n\nCheck out my performance on Learn2Lead.`)}`}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-[#EFE4D5] hover:bg-[#e4d5c1] text-[#1F2022] font-bold rounded-xl transition-colors shadow-sm"
                >
                  <MessageSquare className="w-5 h-5" />
                  Email
                </a>
                <button 
                  onClick={handleDownloadReport}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-[#1F2022] hover:bg-[#26282C] text-white font-bold rounded-xl transition-colors shadow-md"
                >
                  <Download className="w-5 h-5" />
                  Download PDF
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
};

export default CommunicationDashboard;