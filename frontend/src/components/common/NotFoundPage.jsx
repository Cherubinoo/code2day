import ErrorAnimation from './ErrorAnimation';

export default function NotFoundPage({ onGoHome }) {
  return (
    <div style={{
      minHeight: '100vh',
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
        Page Not Found
      </h1>
      <p style={{ color: 'var(--text-soft, #64748b)', fontSize: '1.05rem', maxWidth: 420, margin: '0 0 28px' }}>
        The page you're looking for doesn't exist or may have moved.
      </p>
      <button
        onClick={onGoHome}
        className="primary-button"
        style={{ padding: '14px 32px', borderRadius: 14, fontSize: '1rem', fontWeight: 700 }}
      >
        Go Home
      </button>
    </div>
  );
}
