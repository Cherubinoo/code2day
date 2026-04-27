import { Shield } from 'lucide-react';

const DoubleConfirmModal = ({ show, m1, m2, onConfirm, onCancel, firstOk, setFirstOk }) => {
  if (!show) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(15px)' }}>
      <div style={{ background: 'white', borderRadius: 36, padding: 48, width: '90%', maxWidth: 500, boxShadow: '0 30px 60px rgba(0,0,0,0.5)', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, background: 'var(--sage-100)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--olive-900)', marginBottom: 24, margin: '0 auto' }}>
          <Shield size={32} />
        </div>
        
        {!firstOk ? (
          <div className="animate-fade-in">
            <h3 style={{ fontSize: '1.8rem', fontWeight: 950, marginBottom: 12 }}>Security Verification</h3>
            <p style={{ color: 'var(--text-soft)', fontSize: '1.1rem', marginBottom: 40 }}>{m1}</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={onCancel} style={{ flex: 1, padding: '18px', borderRadius: 18, border: '1px solid var(--border-soft)', background: 'white', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => setFirstOk(true)} className="primary-button" style={{ flex: 1, borderRadius: 18, fontWeight: 800, cursor: 'pointer' }}>Confirm</button>
            </div>
          </div>
        ) : (
          <div className="animate-bounce-in">
            <h3 style={{ fontSize: '1.8rem', fontWeight: 950, marginBottom: 12, color: '#ef4444' }}>Final Confirmation</h3>
            <p style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 700, marginBottom: 40 }}>{m2}</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={onCancel} style={{ flex: 1, padding: '18px', borderRadius: 18, border: '1px solid var(--border-soft)', background: 'white', fontWeight: 800, cursor: 'pointer' }}>Abort Action</button>
              <button 
                onClick={onConfirm} 
                style={{ flex: 1, padding: '18px', borderRadius: 18, border: 'none', background: '#ef4444', color: 'white', fontWeight: 900, boxShadow: '0 10px 20px rgba(239, 68, 68, 0.3)', cursor: 'pointer' }}
              >
                Execute Now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DoubleConfirmModal;
