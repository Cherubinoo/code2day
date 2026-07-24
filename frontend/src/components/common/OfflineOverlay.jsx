import { useEffect, useState } from 'react';
import ErrorAnimation from './ErrorAnimation';

// Full-screen takeover for genuine connectivity loss (navigator.onLine),
// not for individual failed API calls — most fetches in this app already
// have their own graceful fallback (e.g. falling back to demo data), and
// replacing those with a full-page error would be a regression. This is
// additive: it only fires when the browser itself reports being offline,
// and clears automatically the moment connectivity returns.
export default function OfflineOverlay() {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100001,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-1, #ffffff)',
      padding: 24,
      textAlign: 'center',
    }}>
      <ErrorAnimation />
      <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--olive-950, #1f2816)', margin: '16px 0 8px' }}>
        You're Offline
      </h1>
      <p style={{ color: 'var(--text-soft, #64748b)', fontSize: '1.05rem', maxWidth: 420, margin: 0 }}>
        Check your internet connection — this will automatically reconnect once you're back online.
      </p>
    </div>
  );
}
