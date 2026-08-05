import { useState } from 'react';
import { Calendar, Clock, Download, X, Building2, Filter } from 'lucide-react';

const HourlyBatchReportModal = ({ isOpen, onClose, availableBatches = [], availableSections = ['A', 'B', 'C', 'D'] }) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedBatch, setSelectedBatch] = useState(availableBatches[0] || '');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [downloading, setDownloading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const presets = [
    { label: 'P1: 09:00 - 10:00', start: '09:00', end: '10:00' },
    { label: 'P2: 10:00 - 11:00', start: '10:00', end: '11:00' },
    { label: 'P3: 11:15 - 12:15', start: '11:15', end: '12:15' },
    { label: 'P4: 13:30 - 14:30', start: '13:30', end: '14:30' },
    { label: 'P5: 14:30 - 15:30', start: '14:30', end: '15:30' },
    { label: 'Full Day (00:00 - 23:59)', start: '00:00', end: '23:59' },
  ];

  async function handleDownloadReport() {
    if (!selectedBatch) {
      setErrorMsg('Please select a batch.');
      return;
    }
    setErrorMsg('');
    setDownloading(true);

    try {
      const dateFrom = `${selectedDate}T${startTime}`;
      const dateTo = `${selectedDate}T${endTime}`;

      const query = new URLSearchParams();
      if (selectedSection) query.append('section', selectedSection);
      query.append('date_from', dateFrom);
      query.append('date_to', dateTo);

      const url = `/api/batches/${encodeURIComponent(selectedBatch)}/report/?${query.toString()}`;
      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.detail || 'Failed to generate hourly batch report PDF');
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const sectionSuffix = selectedSection ? `_Sec_${selectedSection}` : '';
      a.download = `Batch_${selectedBatch}${sectionSuffix}_Report_${selectedDate}_${startTime.replace(':', '')}-${endTime.replace(':', '')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Error generating hourly PDF report');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#ffffff', width: '100%', maxWidth: '520px', borderRadius: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden',
        border: '1px solid #e2e8f0', animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 10 }}>
              <Clock size={20} color="#38bdf8" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Hourly Batch PDF Report</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Generate student performance report for a specific hour/session
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {errorMsg && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
              {errorMsg}
            </div>
          )}

          {/* Batch & Section Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Select Batch *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 12px', background: '#f8fafc' }}>
                <Building2 size={16} color="#64748b" />
                <select
                  value={selectedBatch}
                  onChange={e => setSelectedBatch(e.target.value)}
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: '#1e293b', outline: 'none' }}
                >
                  {availableBatches.length === 0 ? (
                    <option value="">No batches available</option>
                  ) : (
                    availableBatches.map(b => (
                      <option key={b} value={b}>Batch {b}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Section (Optional)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 12px', background: '#f8fafc' }}>
                <Filter size={16} color="#64748b" />
                <select
                  value={selectedSection}
                  onChange={e => setSelectedSection(e.target.value)}
                  style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: '#1e293b', outline: 'none' }}
                >
                  <option value="">All Sections</option>
                  {availableSections.map(s => (
                    <option key={s} value={s}>Section {s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Date Picker */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              Report Date *
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 12px', background: '#f8fafc' }}>
              <Calendar size={16} color="#64748b" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 13, fontWeight: 700, color: '#1e293b', outline: 'none' }}
              />
            </div>
          </div>

          {/* Quick Time Presets */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
              Quick Hour Presets
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {presets.map(p => {
                const isActive = startTime === p.start && endTime === p.end;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setStartTime(p.start); setEndTime(p.end); }}
                    style={{
                      padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      border: isActive ? '1px solid #0284c7' : '1px solid #e2e8f0',
                      background: isActive ? '#e0f2fe' : '#f8fafc',
                      color: isActive ? '#0369a1' : '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Time Range */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 13, fontWeight: 700, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
            * Generates an official PDF report showing problems solved, submissions, accuracy, and individual student rankings for <strong>Batch {selectedBatch || '...'} {selectedSection ? `(Sec ${selectedSection})` : ''}</strong> on <strong>{selectedDate} ({startTime} to {endTime})</strong>.
          </p>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #cbd5e1', background: 'white', color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownloadReport}
              disabled={downloading}
              style={{
                padding: '10px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                color: 'white', fontWeight: 700, fontSize: 13, cursor: downloading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(3, 105, 161, 0.25)'
              }}
            >
              <Download size={16} />
              {downloading ? 'Generating PDF...' : 'Download Hourly PDF Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HourlyBatchReportModal;
