import React, { useState, useEffect } from 'react';
import { 
  Mic, MessageSquare, Sparkles, Volume2, Calendar, 
  BarChart3, Flame, Trophy, LayoutDashboard, ArrowRight
} from 'lucide-react';
import CommunicationDashboard from './communication/CommunicationDashboard';
import DailyChallenge from './communication/DailyChallenge';
import SpeakAnalysis from './communication/SpeakAnalysis';
import ConversationPartner from './communication/ConversationPartner';

export default function CommunicationPage() {
  const [activeTab, setActiveTab] = useState('daily'); // 'dashboard', 'daily', 'speak', 'partner'
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    try {
      return savedUser ? JSON.parse(savedUser) : { username: 'Student', profile: { xp: 120, streak: 3 } };
    } catch (e) {
      return { username: 'Student', profile: { xp: 120, streak: 3 } };
    }
  });

  const [commAnalytics, setCommAnalytics] = useState(null);
  const token = localStorage.getItem('token') || '';
  const API_BASE = '';

  const fetchWithAuth = async (url, options = {}) => {
    const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};
    const headers = {
      ...authHeaders,
      ...options.headers
    };
    return fetch(url, { ...options, headers });
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const res = await fetchWithAuth('/api/communication/analytics/');
      if (res.ok) {
        const data = await res.json();
        setCommAnalytics(data);
      }
    } catch (e) {
      console.warn('Could not fetch comm analytics:', e);
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#F8F3EA', padding: '24px 32px', boxSizing: 'border-box' }}>
      
      {/* Top Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #1f2816 0%, #39482a 100%)',
        borderRadius: '24px',
        padding: '24px 32px',
        color: '#fff',
        marginBottom: '24px',
        boxShadow: '0 10px 30px rgba(31, 40, 22, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: '#c49743', padding: '14px', borderRadius: '16px', display: 'flex', boxShadow: '0 4px 14px rgba(196, 151, 67, 0.3)' }}>
              <Mic size={28} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#c49743', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '2px' }}>
                CODE2DAY • COMMUNICATION
              </div>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                Communication Hub
              </h1>
              <p style={{ margin: '4px 0 0', color: 'rgba(255, 255, 255, 0.75)', fontSize: '0.9rem' }}>
                AI-driven teleprompter challenges and voice speech analytics.
              </p>
            </div>
          </div>

          {/* Stats Pills */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.15)', padding: '8px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame size={18} color="#F59E0B" />
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#FFF' }}>
                {user.profile?.streak || 0} Day Streak
              </span>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.15)', padding: '8px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy size={18} color="#10B981" />
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#FFF' }}>
                {user.profile?.xp || 0} XP
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '16px' }}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'daily', label: 'Daily Challenge', icon: Calendar },
            { id: 'speak', label: 'Speak Analysis', icon: Volume2 },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  border: 'none',
                  fontWeight: isActive ? 800 : 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  background: isActive ? '#e6ebdd' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#1f2816' : 'rgba(255, 255, 255, 0.8)',
                  boxShadow: isActive ? '0 4px 14px rgba(0, 0, 0, 0.15)' : 'none',
                  transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  fontFamily: 'inherit'
                }}
              >
                <Icon size={16} color={isActive ? '#1f2816' : 'currentColor'} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content View */}
      <div style={{ borderRadius: '24px', overflow: 'hidden', minHeight: '600px' }}>
        {activeTab === 'dashboard' && (
          <CommunicationDashboard
            setActiveTab={setActiveTab}
            commAnalytics={commAnalytics}
            user={user}
            token={token}
            API_BASE={API_BASE}
            fetchWithAuth={fetchWithAuth}
          />
        )}

        {activeTab === 'daily' && (
          <DailyChallenge
            token={token}
            API_BASE={API_BASE}
            user={user}
            setUser={setUser}
            fetchWithAuth={fetchWithAuth}
          />
        )}

        {activeTab === 'speak' && (
          <SpeakAnalysis
            token={token}
            API_BASE={API_BASE}
            fetchWithAuth={fetchWithAuth}
            commAnalytics={commAnalytics}
          />
        )}
      </div>

    </div>
  );
}
