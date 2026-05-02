// Report Filter Modal - Reusable component for filtering reports
import { useState, useEffect } from 'react';
import { FileText, X } from 'lucide-react';

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

  const [preview, setPreview] = useState('');

  const updatePreview = () => {
    const reportTypeText = {
      'overall': 'Overall Performance',
      'programming': 'Programming Only',
      'aptitude': 'Aptitude Only',
      'contests': 'Contest Management'
    }[filters.reportType] || 'Overall Performance';
    
    const batchText = filters.batch ? `Batch ${filters.batch}` : 'All Batches';
    const dateText = (filters.dateFrom && filters.dateTo) ? `${filters.dateFrom} to ${filters.dateTo}` : 
                    filters.dateFrom ? `From ${filters.dateFrom}` : 
                    filters.dateTo ? `Until ${filters.dateTo}` : 'All Time';
    const topicText = filters.topic ? filters.topic.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'All Topics';
    
    setPreview(`📋 Report Preview: ${reportTypeText} • ${batchText} • ${dateText} • ${topicText}`);
  };

  useEffect(() => {
    updatePreview();
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
      background: 'rgba(0,0,0,0.6)', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 1000,
      backdropFilter: 'blur(8px)'
    }}>
      <div style={{ 
        background: 'white', 
        borderRadius: '24px', 
        padding: '32px', 
        width: '90%', 
        maxWidth: 600, 
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 48,
              height: 48,
              background: 'linear-gradient(135deg, #4f7942, #2d5016)',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText size={24} style={{ color: 'white' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0, color: '#2d5016' }}>
                {title}
              </h3>
              <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
                Select filters and generate a comprehensive PDF report
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              padding: 8,
              borderRadius: '8px',
              color: '#6b7280'
            }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
          {/* Report Type */}
          {showReportTypeFilter && (
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '700', 
                color: '#374151', 
                marginBottom: 8
              }}>
                Report Type
              </label>
              <select 
                value={filters.reportType}
                onChange={(e) => handleFilterChange('reportType', e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '12px 16px', 
                  borderRadius: '12px', 
                  border: '2px solid #e5e7eb', 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  color: '#374151', 
                  cursor: 'pointer', 
                  outline: 'none',
                  background: 'white'
                }}
              >
                <option value="overall">📊 Overall Performance</option>
                <option value="programming">💻 Programming Only</option>
                <option value="aptitude">🧠 Aptitude Only</option>
                <option value="contests">🏆 Contest Management</option>
              </select>
            </div>
          )}
          
          {/* Batch Filter */}
          {showBatchFilter && (
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '700', 
                color: '#374151', 
                marginBottom: 8
              }}>
                Batch Filter
              </label>
              <select 
                value={filters.batch}
                onChange={(e) => handleFilterChange('batch', e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '12px 16px', 
                  borderRadius: '12px', 
                  border: '2px solid #e5e7eb', 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  color: '#374151', 
                  cursor: 'pointer', 
                  outline: 'none',
                  background: 'white'
                }}
              >
                <option value="">All Batches</option>
                {batches.map(batch => (
                  <option key={batch} value={batch}>Batch {batch}</option>
                ))}
              </select>
            </div>
          )}

          {/* From Date */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '700', 
              color: '#374151', 
              marginBottom: 8
            }}>
              From Date
            </label>
            <input 
              type="date" 
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              style={{ 
                width: '100%',
                padding: '12px 16px', 
                borderRadius: '12px', 
                border: '2px solid #e5e7eb', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#374151', 
                cursor: 'pointer', 
                outline: 'none',
                background: 'white'
              }}
            />
          </div>
          
          {/* To Date */}
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '700', 
              color: '#374151', 
              marginBottom: 8
            }}>
              To Date
            </label>
            <input 
              type="date" 
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              style={{ 
                width: '100%',
                padding: '12px 16px', 
                borderRadius: '12px', 
                border: '2px solid #e5e7eb', 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#374151', 
                cursor: 'pointer', 
                outline: 'none',
                background: 'white'
              }}
            />
          </div>

          {/* Topic Filter */}
          {showTopicFilter && (
            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '700', 
                color: '#374151', 
                marginBottom: 8
              }}>
                Topic Filter
              </label>
              <select 
                value={filters.topic}
                onChange={(e) => handleFilterChange('topic', e.target.value)}
                style={{ 
                  width: '100%',
                  padding: '12px 16px', 
                  borderRadius: '12px', 
                  border: '2px solid #e5e7eb', 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  color: '#374151', 
                  cursor: 'pointer', 
                  outline: 'none',
                  background: 'white'
                }}
              >
                <option value="">All Topics</option>
                <option value="arrays">Arrays & Strings</option>
                <option value="algorithms">Algorithms</option>
                <option value="data-structures">Data Structures</option>
                <option value="dynamic-programming">Dynamic Programming</option>
                <option value="graphs">Graphs & Trees</option>
                <option value="mathematics">Mathematics</option>
                <option value="sql">SQL & Databases</option>
                <option value="system-design">System Design</option>
              </select>
            </div>
          )}
        </div>

        {/* Filter Preview */}
        <div style={{ 
          marginBottom: 24, 
          padding: '16px 20px', 
          background: '#f8f9fa', 
          borderRadius: '12px', 
          border: '1px solid #e9ecef',
          fontSize: '14px',
          color: '#6c757d',
          fontWeight: '600',
          textAlign: 'center'
        }}>
          {preview}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <button 
            onClick={handleGenerate}
            style={{ 
              padding: '16px 32px', 
              borderRadius: '12px', 
              border: 'none',
              background: 'linear-gradient(135deg, #4f7942, #2d5016)', 
              color: 'white', 
              cursor: 'pointer',
              display: 'flex', 
              alignItems: 'center', 
              gap: 12, 
              fontSize: '16px', 
              fontWeight: '700',
              boxShadow: '0 6px 20px rgba(79, 121, 66, 0.3)',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 8px 25px rgba(79, 121, 66, 0.4)';
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 6px 20px rgba(79, 121, 66, 0.3)';
            }}
          >
            <FileText size={20} /> 
            Generate PDF Report
          </button>

          <button 
            onClick={handleReset}
            style={{ 
              padding: '16px 24px', 
              borderRadius: '12px', 
              border: '2px solid #e5e7eb',
              background: 'white', 
              color: '#6b7280', 
              cursor: 'pointer',
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              fontSize: '14px', 
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.target.style.borderColor = '#9ca3af';
              e.target.style.color = '#374151';
            }}
            onMouseOut={(e) => {
              e.target.style.borderColor = '#e5e7eb';
              e.target.style.color = '#6b7280';
            }}
          >
            🔄 Reset Filters
          </button>

          <button 
            onClick={onClose}
            style={{ 
              padding: '16px 24px', 
              borderRadius: '12px', 
              border: '2px solid #e5e7eb',
              background: 'white', 
              color: '#6b7280', 
              cursor: 'pointer',
              fontSize: '14px', 
              fontWeight: '600',
              transition: 'all 0.2s ease'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportFilterModal;