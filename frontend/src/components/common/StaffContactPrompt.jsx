import { useState } from 'react';
import { Mail, Phone } from 'lucide-react';
import { buildJsonPostOptions } from '../../lib/appUtils';

// Shown once per login when a staff-type account (staff/HOD/academics/
// TPU/director/JA) is missing an email or mobile number on file — the
// account itself has no way to add these except through this prompt or an
// admin manually typing them in via Personnel Orchestration.
export default function StaffContactPrompt({ initialEmail, initialMobile, onSaved, onClose }) {
  const [email, setEmail] = useState(initialEmail || '');
  const [mobile, setMobile] = useState(initialMobile || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!email.trim() && !mobile.trim()) {
      setError('Add at least an email or a mobile number.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/staff/contact/', buildJsonPostOptions({
        email: email.trim(), mobile_number: mobile.trim(),
      }));
      if (res.ok) {
        const body = await res.json();
        onSaved(body.email, body.mobile_number);
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error || body.detail || 'Failed to save.');
      }
    } catch (err) {
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', padding: 32 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.3rem', fontWeight: 900, color: 'var(--olive-950)' }}>Add your contact info</h2>
        <p style={{ margin: '0 0 24px', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          We don't have an email or mobile number on file for your account yet. This only takes a moment.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Mail size={13} /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-soft)', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-soft)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Phone size={13} /> Mobile Number
            </label>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 ..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-soft)', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {error && <p style={{ margin: '0 0 16px', color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
          >
            Later
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="primary-button"
            style={{ padding: '10px 24px', borderRadius: 10, fontSize: '0.9rem' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
