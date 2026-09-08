// Report Filter Modal - Reusable component for filtering reports
import { useState, useEffect } from 'react';
import { FileText, X, RotateCcw, Download, Layers, Calendar, Tag, GraduationCap } from 'lucide-react';

const REPORT_TYPES = [
  { value: 'overall', label: 'Overall Performance' },
  { value: 'programming', label: 'Programming Only' },
  { value: 'aptitude', label: 'Aptitude Only' },
  { value: 'contests', label: 'Contest Management' },
];

const TOPICS = [
  { value: 'arrays', label: 'Arrays & Strings' },
  { value: 'algorithms', label: 'Algorithms' },
  { value: 'data-structures', label: 'Data Structures' },
  { value: 'dynamic-programming', label: 'Dynamic Programming' },
  { value: 'graphs', label: 'Graphs & Trees' },
  { value: 'mathematics', label: 'Mathematics' },
  { value: 'sql', label: 'SQL & Databases' },
  { value: 'system-design', label: 'System Design' },
];

const fieldLabelStyle = {
  display: 'flex', alignItems: 'center', gap: 6,
  fontSize: 12.5, fontWeight: 700, color: 'var(--text-soft)',
  textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8,
};

const controlStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--border-soft)',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-hard)',
  cursor: 'pointer',
  outline: 'none',
  background: 'white',
};

function Field({ icon: Icon, label, children }) {
  return (
    <div>
      <label style={fieldLabelStyle}>
        <Icon size={13} /> {label}
      </label>
      {children}
    </div>
  );
}

const ReportFilterModal = ({
  show,
  onClose,
  onGenerate,
  title = "Generate Report",
  studentId = null,
  batches = [],
  showBatchFilter = true,
  showTopicFilter = true,
  showReportTypeFilter = true
}) => {
  const [filters, setFilters] = useState({
    reportType: 'overall',
    batch: '',
    dateFrom: '',
    dateTo: '',
    topic: ''
  });

  const [preview, setPreview] = useState([]);

  const updatePreview = () => {
    const reportTypeText = REPORT_TYPES.find((t) => t.value === filters.reportType)?.label || 'Overall Performance';
    const batchText = filters.batch ? `Batch ${filters.batch}` : 'All Batches';
    const dateText = (filters.dateFrom && filters.dateTo) ? `${filters.dateFrom} → ${filters.dateTo}` :
                    filters.dateFrom ? `From ${filters.dateFrom}` :
                    filters.dateTo ? `Until ${filters.dateTo}` : 'All Time';
    const topicText = TOPICS.find((t) => t.value === filters.topic)?.label || 'All Topics';

    setPreview([reportTypeText, batchText, dateText, topicText]);
  };

  useEffect(() => {
    updatePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleGenerate = () => {
    onGenerate(filters);
    onClose();
  };

  const handleReset = () => {
    setFilters({
      reportType: 'overall',
      batch: '',
      dateFrom: '',
      dateTo: '',
      topic: ''
    });
  };

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        background: 'white',
        borderRadius: 16,
        padding: 28,
        width: '100%',
        maxWidth: 560,
        border: '1px solid var(--border-soft)',
        boxShadow: '0 20px 44px rgba(15, 23, 42, 0.18)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              background: 'var(--bg-2)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <FileText size={19} style={{ color: 'var(--olive-700)' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--olive-950)' }}>
                {title}
              </h3>
              <p style={{ margin: '2px 0 0', color: 'var(--text-soft)', fontSize: 13 }}>
                Choose filters, then export a PDF with the college header and full analytics
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              color: 'var(--text-soft)',
              flexShrink: 0,
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
          {showReportTypeFilter && (
            <Field icon={Layers} label="Report Type">
              <select
                value={filters.reportType}
                onChange={(e) => handleFilterChange('reportType', e.target.value)}
                style={controlStyle}
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
          )}

          {showBatchFilter && (
            <Field icon={GraduationCap} label="Batch">
              <select
                value={filters.batch}
                onChange={(e) => handleFilterChange('batch', e.target.value)}
                style={controlStyle}
              >
                <option value="">All Batches</option>
                {batches.map(batch => (
                  <option key={batch} value={batch}>Batch {batch}</option>
                ))}
              </select>
            </Field>
          )}

          <Field icon={Calendar} label="From Date">
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              style={controlStyle}
            />
          </Field>

          <Field icon={Calendar} label="To Date">
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              style={controlStyle}
            />
          </Field>

          {showTopicFilter && (
            <Field icon={Tag} label="Topic">
              <select
                value={filters.topic}
                onChange={(e) => handleFilterChange('topic', e.target.value)}
                style={controlStyle}
              >
                <option value="">All Topics</option>
                {TOPICS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {/* Filter Preview */}
        <div style={{
          marginBottom: 22,
          padding: '12px 14px',
          background: 'var(--bg-2)',
          borderRadius: 10,
          border: '1px solid var(--border-soft)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-soft)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
            Report Preview
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {preview.map((chip, i) => (
              <span key={i} style={{
                fontSize: 12, fontWeight: 700, color: 'var(--olive-900)',
                background: 'white', border: '1px solid var(--border-soft)',
                padding: '4px 10px', borderRadius: 999,
              }}>
                {chip}
              </span>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={handleGenerate}
            className="primary-button"
            style={{
              flex: '1 1 200px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              fontSize: 14,
            }}
          >
            <Download size={16} />
            Download PDF Report
          </button>

          <button
            onClick={handleReset}
            className="ghost-button"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}
          >
            <RotateCcw size={14} /> Reset
          </button>

          <button
            onClick={onClose}
            className="ghost-button"
            style={{ fontSize: 13.5 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportFilterModal;
