import React from 'react';

const DevelopersProfile = ({ onBack }) => {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '40px auto',
      padding: '30px',
      background: 'white',
      borderRadius: '20px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
      fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ color: '#1f2937', fontSize: '32px', marginBottom: '10px' }}>Developers Profile</h1>
        <div style={{ height: '4px', width: '60px', background: '#3b82f6', margin: '0 auto', borderRadius: '2px' }}></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        {/* Delight Cherubino */}
        <div style={{ padding: '20px', border: '1px solid #e5e7eb', borderRadius: '16px', background: '#f8fafc' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '8px' }}>Lead Developer</div>
          <h2 style={{ fontSize: '22px', color: '#1e293b', margin: '0 0 10px 0' }}>Delight Cherubino</h2>
          <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6', marginBottom: '20px' }}>
            Developed the full project architecture, backend services, and main frontend application features.
          </p>
          <div style={{ fontSize: '14px', color: '#334155' }}>
            <div style={{ marginBottom: '6px' }}><strong>📞 Contact:</strong> +91 8220789878</div>
            <div style={{ marginBottom: '6px' }}><strong>📧 Mail:</strong> delightcherubino@gmail.com</div>
            <div style={{ marginBottom: '6px' }}><strong>🌐 Domain:</strong> delightcherubino.com</div>
            <div style={{ marginBottom: '6px' }}><strong>🎓 Batch:</strong> 2023 - 2027</div>
          </div>
        </div>

        {/* Sanjay R */}
        <div style={{ padding: '20px', border: '1px solid #e5e7eb', borderRadius: '16px', background: '#f8fafc' }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#8b5cf6', textTransform: 'uppercase', marginBottom: '8px' }}>Module Developer</div>
          <h2 style={{ fontSize: '22px', color: '#1e293b', margin: '0 0 10px 0' }}>Sanjay R</h2>
          <p style={{ fontSize: '14px', color: '#64748b', lineHeight: '1.6', marginBottom: '20px' }}>
            Developed aptitude questions generation, question validation modules, and related analytics.
          </p>
          <div style={{ fontSize: '14px', color: '#334155' }}>
            <div style={{ marginBottom: '6px' }}><strong>📞 Contact:</strong> +91 8523999020</div>
            <div style={{ marginBottom: '6px' }}><strong>📧 Mail:</strong> sanjaydharsaan007@gmail.com</div>
            <div style={{ marginBottom: '6px' }}><strong>🎓 Batch:</strong> 2023 - 2027</div>
          </div>
        </div>
      </div>

      <div style={{ 
        marginTop: '40px', 
        padding: '20px', 
        textAlign: 'center', 
        borderTop: '1px solid #eee',
        background: '#fff7ed',
        borderRadius: '12px'
      }}>
        <h3 style={{ color: '#9a3412', margin: '0 0 8px 0' }}>Special Thanks</h3>
        <p style={{ fontSize: '16px', color: '#c2410c', fontWeight: '600', margin: 0 }}>
          Dr. M. Kaliappan, Professor and Head
        </p>
        <p style={{ fontSize: '12px', color: '#ea580c', marginTop: '4px' }}>
          For guidance and support throughout the development process.
        </p>
      </div>

      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <button 
          onClick={onBack}
          style={{
            padding: '10px 24px',
            background: '#1f2937',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default DevelopersProfile;
