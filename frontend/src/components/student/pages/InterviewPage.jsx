import React, { useState } from 'react';
import MockInterviews from './interview/MockInterviews';

export default function InterviewPage() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    try {
      return savedUser ? JSON.parse(savedUser) : { username: 'Student', profile: { xp: 120, streak: 3 } };
    } catch (e) {
      return { username: 'Student', profile: { xp: 120, streak: 3 } };
    }
  });

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

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: '#F8F3EA', padding: '24px 32px', boxSizing: 'border-box' }}>
      <MockInterviews
        token={token}
        API_BASE={API_BASE}
        user={user}
        setUser={setUser}
        fetchWithAuth={fetchWithAuth}
      />
    </div>
  );
}
