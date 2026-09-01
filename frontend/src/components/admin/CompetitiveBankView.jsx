import { ArrowLeft, Swords, Sparkles } from 'lucide-react';

// Placeholder shell for the Competitive Practice content bank — mirrors
// ProblemBankView/AptitudeBankView's entry point so the tile exists ahead
// of the actual question bank, which will follow once its shape is decided.
export default function CompetitiveBankView({ onBack }) {
  return (
    <div className="global-view animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <button onClick={onBack} style={{ background: 'white', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 10, cursor: 'pointer', display: 'flex' }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, color: 'var(--olive-950)' }}>Competitive Bank</h2>
          <p style={{ color: 'var(--text-soft)', margin: '4px 0 0' }}>Manage the Competitive Practice question bank.</p>
        </div>
      </div>

      <div style={{ padding: '80px 40px', textAlign: 'center', background: 'white', borderRadius: 32, border: '2px dashed var(--border-soft)' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, margin: '0 auto 24px',
          background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Swords size={30} style={{ color: 'var(--text-soft)' }} />
        </div>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-soft)', marginBottom: 12 }}>
          Content management coming soon
        </h3>
        <p style={{ color: 'var(--text-soft)', marginBottom: 0, fontSize: '1rem' }}>
          Adding and organizing Competitive Practice questions will live here once the content format is finalized.
        </p>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 24,
          background: 'var(--bg-2)', padding: '10px 18px', borderRadius: 12,
          color: 'var(--text-soft)', fontSize: '0.9rem', fontWeight: 600,
        }}>
          <Sparkles size={16} />
          Coming soon.
        </div>
      </div>
    </div>
  );
}
