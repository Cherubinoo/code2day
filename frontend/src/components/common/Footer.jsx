import React from 'react';

const Footer = ({ onNavigate }) => {
  return (
    <footer style={{
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(10px)',
      borderTop: '1px solid var(--border-soft)',
      padding: '24px 20px',
      marginTop: 'auto',
      width: '100%',
      zIndex: 100
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px'
      }}>
        <p style={{ margin: 0, fontSize: '14px', color: '#64748b', textAlign: 'center' }}>
          © {new Date().getFullYear()} Code2Day. All rights reserved.
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '13px', color: '#94a3b8' }}>
          <span>Developed by</span>
          <a href="https://delightcherubino.com" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: '500' }}>
            delightcherubino.com
          </a>
          <span style={{ margin: '0 5px' }}>|</span>
          <button 
            onClick={() => onNavigate("developers")}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: '#6366f1', 
              cursor: 'pointer', 
              fontSize: '13px', 
              fontWeight: '600',
              padding: 0
            }}
          >
            Developers Profile
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
