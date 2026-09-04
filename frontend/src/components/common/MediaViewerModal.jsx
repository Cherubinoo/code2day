import { useEffect, useRef, useState } from 'react';
import { X, Maximize, Minimize } from 'lucide-react';

// Inline lightbox for a folder-media item (image/video/PDF) — used by both
// the admin managers (CompetitiveBankView/InterviewBankView) and the
// student-facing FolderMediaGrid on Competitive/Interview Practice pages,
// so clicking a tile plays/opens it right here instead of navigating away
// to a new tab. The Fullscreen button drives the real browser Fullscreen
// API on the media box itself (not just a bigger modal) — a plain
// <video controls> already offers its own fullscreen icon in most
// browsers, but that only fullscreens the raw video with no title/
// description; this gives one consistent fullscreen control for every
// media kind.
export default function MediaViewerModal({ media, onClose }) {
  const mediaBoxRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  if (!media) return null;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (mediaBoxRef.current?.requestFullscreen) {
      mediaBoxRef.current.requestFullscreen();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 20, width: '100%', maxWidth: 1100, maxHeight: '94vh',
          overflow: 'auto', boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--olive-950)' }}>{media.title}</h3>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', padding: 4, display: 'flex' }}>
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', padding: 4, display: 'flex' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          <div
            ref={mediaBoxRef}
            style={{
              background: 'black', borderRadius: isFullscreen ? 0 : 12, overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
              height: isFullscreen ? '100vh' : 'auto',
            }}
          >
            {media.kind === 'video' ? (
              <video
                controls autoPlay src={media.url}
                style={{
                  display: 'block',
                  width: isFullscreen ? 'auto' : '100%',
                  height: isFullscreen ? '100%' : 'auto',
                  maxWidth: '100%', maxHeight: isFullscreen ? '100%' : '78vh',
                }}
              />
            ) : media.kind === 'image' ? (
              <img
                src={media.url} alt={media.title}
                style={{
                  display: 'block', objectFit: 'contain',
                  width: isFullscreen ? 'auto' : '100%',
                  height: isFullscreen ? '100%' : 'auto',
                  maxWidth: '100%', maxHeight: isFullscreen ? '100%' : '78vh',
                }}
              />
            ) : media.kind === 'pdf' ? (
              <iframe src={media.url} title={media.title} style={{ width: '100%', height: isFullscreen ? '100vh' : '78vh', border: 'none', background: 'white' }} />
            ) : (
              <a href={media.url} target="_blank" rel="noopener noreferrer" style={{ padding: 24, color: 'white', textDecoration: 'underline' }}>
                Open file
              </a>
            )}
          </div>

          {!isFullscreen && media.description && (
            <p style={{ marginTop: 16, marginBottom: 0, color: 'var(--text-soft)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
              {media.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
