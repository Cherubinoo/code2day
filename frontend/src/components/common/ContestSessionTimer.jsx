// Contest Session Timer - Shows remaining time and handles auto-submit
import { useState, useEffect, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { getCsrfToken } from '../../lib/appUtils';

const ContestSessionTimer = ({ contestId, onSessionExpired, onTimeUpdate }) => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isExpired, setIsExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);
  const hasAutoSubmitted = useRef(false);

  useEffect(() => {
    if (!contestId) return;

    // Initial load of session status
    loadSessionStatus();

    // Set up interval to check session status every 5 seconds
    intervalRef.current = setInterval(() => {
      loadSessionStatus();
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [contestId]);

  useEffect(() => {
    // Update parent component with time remaining
    if (onTimeUpdate) {
      onTimeUpdate(timeRemaining);
    }

    // Auto-submit when time expires
    if (timeRemaining <= 0 && !isExpired && !hasAutoSubmitted.current) {
      handleAutoSubmit();
    }
  }, [timeRemaining, isExpired, onTimeUpdate]);

  async function loadSessionStatus() {
    try {
      const res = await fetch(`/api/student/contests/${contestId}/session-status/`, {
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        const participation = data.participation;

        if (participation.is_active) {
          setTimeRemaining(participation.remaining_time_seconds);
          setIsExpired(false);
        } else {
          setTimeRemaining(0);
          setIsExpired(true);
          
          // Clear interval if session is no longer active
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }

          // Notify parent if session expired
          if (participation.auto_submitted && onSessionExpired) {
            onSessionExpired(participation);
          }
        }
        setError(null);
      } else {
        const data = await res.json();
        setError(data.detail || 'Failed to load session status');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAutoSubmit() {
    if (hasAutoSubmitted.current) return;
    hasAutoSubmitted.current = true;

    try {
      const res = await fetch(`/api/student/contests/${contestId}/auto-submit/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRFToken': getCsrfToken(),
        },
      });

      if (res.ok) {
        const data = await res.json();
        setIsExpired(true);
        setTimeRemaining(0);
        
        // Clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // Notify parent
        if (onSessionExpired) {
          onSessionExpired(data.participation);
        }
      } else {
        const data = await res.json();
        console.error('Auto-submit failed:', data.detail);
      }
    } catch (err) {
      console.error('Auto-submit error:', err);
    }
  }

  function formatTime(seconds) {
    if (seconds <= 0) return '00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }

  function getTimerColor() {
    if (isExpired) return '#dc2626'; // Red
    if (timeRemaining <= 300) return '#ea580c'; // Orange for last 5 minutes
    if (timeRemaining <= 600) return '#d97706'; // Yellow for last 10 minutes
    return '#059669'; // Green
  }

  function getTimerBackground() {
    if (isExpired) return '#fee2e2';
    if (timeRemaining <= 300) return '#fed7aa';
    if (timeRemaining <= 600) return '#fef3c7';
    return '#d1fae5';
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#f3f4f6',
        borderRadius: 8,
        fontSize: 14,
        color: '#666'
      }}>
        <Clock size={16} />
        <span>Loading timer...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#fee2e2',
        borderRadius: 8,
        fontSize: 14,
        color: '#dc2626'
      }}>
        <AlertTriangle size={16} />
        <span>Timer error</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: getTimerBackground(),
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      color: getTimerColor(),
      border: `1px solid ${getTimerColor()}20`,
      minWidth: 120,
      justifyContent: 'center'
    }}>
      <Clock size={16} />
      <span>
        {isExpired ? 'Time Up!' : formatTime(timeRemaining)}
      </span>
      {timeRemaining <= 300 && !isExpired && (
        <AlertTriangle size={14} style={{ marginLeft: 4 }} />
      )}
    </div>
  );
};

export default ContestSessionTimer;