import { X } from 'lucide-react';

// Inline lightbox for a folder-media item (image/video/PDF) — used by both
// the admin managers (CompetitiveBankView/InterviewBankView) and the
// student-facing FolderMediaGrid on Competitive/Interview Practice pages,
// so clicking a tile plays/opens it right here instead of navigating away
// to a new tab.
export default function MediaViewerModal({ media, onClose }) {
  if (!media) return null;

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
          background: 'white', borderRadius: 20, width: '100%', maxWidth: 720, maxHeight: '90vh',
          overflow: 'auto', boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-soft)' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--olive-950)' }}>{media.title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-soft)', padding: 4, flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 20 }}>
          <div style={{ background: 'black', borderRadius: 12, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {media.kind === 'video' ? (
              <video controls autoPlay src={media.url} style={{ width: '100%', maxHeight: '60vh', display: 'block' }} />
            ) : media.kind === 'image' ? (
              <img src={media.url} alt={media.title} style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block' }} />
            ) : media.kind === 'pdf' ? (
              <iframe src={media.url} title={media.title} style={{ width: '100%', height: '60vh', border: 'none', background: 'white' }} />
            ) : (
              <a href={media.url} target="_blank" rel="noopener noreferrer" style={{ padding: 24, color: 'white', textDecoration: 'underline' }}>
                Open file
              </a>
            )}
          </div>

          {media.description && (
            <p style={{ marginTop: 16, marginBottom: 0, color: 'var(--text-soft)', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
              {media.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
