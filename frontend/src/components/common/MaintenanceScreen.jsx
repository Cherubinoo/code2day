import React from 'react';
import { HardHat, RefreshCw, AlertTriangle } from 'lucide-react';

const MaintenanceScreen = ({ message, onRetry, onBack }) => {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-main, #f8fafc)',
      fontFamily: 'var(--font-primary, "Inter", sans-serif)'
    }}>
      <div style={{
        background: 'white',
        padding: '60px 40px',
        borderRadius: '32px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.02)',
        maxWidth: '540px',
        width: '90%',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Decorative background blobs */}
        <div style={{
          position: 'absolute',
          top: '-50px',
          right: '-50px',
          width: '150px',
          height: '150px',
          background: 'var(--accent-1-light, #e0e7ff)',
          borderRadius: '50%',
          filter: 'blur(40px)',
          opacity: 0.6,
          zIndex: 0
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-50px',
          left: '-50px',
          width: '150px',
          height: '150px',
          background: 'var(--accent-2-light, #fce7f3)',
          borderRadius: '50%',
          filter: 'blur(40px)',
          opacity: 0.6,
          zIndex: 0
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            width: '96px',
            height: '96px',
            background: 'var(--warning-light, #fef3c7)',
            borderRadius: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 32px',
            boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.2)'
          }}>
            <HardHat size={48} color="var(--warning-dark, #d97706)" />
          </div>
          
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 850,
            color: 'var(--text-main, #0f172a)',
            margin: '0 0 16px 0',
            letterSpacing: '-0.03em'
          }}>
            We'll be right back
          </h1>
          
          <p style={{
            fontSize: '1.1rem',
            color: 'var(--text-soft, #64748b)',
            lineHeight: 1.6,
            margin: '0 0 32px 0'
          }}>
            {message || "The platform is currently undergoing scheduled maintenance. We are working hard to improve your experience and will be back online shortly."}
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: 'var(--bg-2, #f1f5f9)',
            padding: '16px',
            borderRadius: '16px',
            marginBottom: '32px'
          }}>
            <AlertTriangle size={20} color="var(--text-soft, #64748b)" />
            <span style={{ color: 'var(--text-soft, #64748b)', fontSize: '0.95rem', fontWeight: 500 }}>
              Your progress and data are safe.
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <button 
              onClick={onBack}
              style={{
                padding: '16px 24px',
                borderRadius: '16px',
                border: '2px solid var(--border-soft, #e2e8f0)',
                background: 'transparent',
                color: 'var(--text-main, #0f172a)',
                fontSize: '1.05rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'var(--bg-2, #f1f5f9)';
                e.currentTarget.style.borderColor = 'var(--border-main, #cbd5e1)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'var(--border-soft, #e2e8f0)';
              }}
            >
              Return to Login
            </button>
            <button 
              onClick={onRetry}
              style={{
                padding: '16px 32px',
                borderRadius: '16px',
                border: 'none',
                background: 'var(--accent-1, #4f46e5)',
                color: 'white',
                fontSize: '1.05rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 10px 20px -5px rgba(79, 70, 229, 0.3)',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <RefreshCw size={18} />
              Check Status Again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MaintenanceScreen;
