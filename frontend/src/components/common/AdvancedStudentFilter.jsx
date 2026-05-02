import React, { useState, useEffect } from 'react';
import { getCsrfToken, buildJsonPostOptions } from '../../lib/appUtils';
import './AdvancedStudentFilter.css';

/**
 * AdvancedStudentFilter Component
 * ==============================
 * 
 * Comprehensive filtering system for students based on:
 * 1. Overall Performance (problems solved, difficulty levels)
 * 2. Topic-wise Performance (algorithms, data structures, etc.)
 * 3. Aptitude Performance (quantitative, logical reasoning)
 * 4. Programming Efficiency (success rate, time spent)
 * 5. Programming Languages (Python, Java, C++, etc.)
 * 
 * Features:
 * - Role-based data access (staff see department, HOD sees all dept, admin sees all)
 * - Real-time filtering with debounced API calls
 * - Export functionality (CSV download)
 * - Performance statistics dashboard
 * - Responsive design for mobile and desktop
 */

const AdvancedStudentFilter = ({ userType, onStudentsUpdate, onStatsUpdate }) => {
  // Filter state
  const [filters, setFilters] = useState({
    // Basic filters
    search: '',
    batch: '',
    department_id: '',
    
    // Performance filters
    min_problems_solved: '',
    max_problems_solved: '',
    min_easy_solved: '',
    min_medium_solved: '',
    min_hard_solved: '',
    min_current_streak: '',
    
    // Topic filters
    topics: [],
    min_topic_solved: '',
    
    // Aptitude filters
    min_aptitude_solved: '',
    aptitude_topics: [],
    
    // Efficiency filters
    max_avg_time_minutes: '',
    min_success_rate: '',
    
    // Language filters
    languages: [],
    min_language_problems: ''
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [activeTab, setActiveTab] = useState('performance');
  const [showExportModal, setShowExportModal] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [batches, setBatches] = useState([]);

  // Available options
  const topicOptions = [
    'Array', 'String', 'Hash Table', 'Dynamic Programming', 'Math',
    'Sorting', 'Greedy', 'Depth-First Search', 'Binary Search', 'Tree',
    'Breadth-First Search', 'Two Pointers', 'Stack', 'Heap', 'Graph',
    'Sliding Window', 'Backtracking', 'Linked List', 'Binary Tree'
  ];

  const aptitudeTopicOptions = [
    'Quantitative Aptitude', 'Logical Reasoning', 'Verbal Ability',
    'Data Interpretation', 'General Awareness', 'Technical Aptitude'
  ];

  const languageOptions = [
    'Python', 'Java', 'C++', 'JavaScript', 'C', 'Go', 'Rust', 'Swift',
    'Kotlin', 'TypeScript', 'C#', 'Ruby', 'PHP', 'Scala'
  ];

  // Load initial data
  useEffect(() => {
    loadDepartments();
    loadBatches();
    applyFilters();
  }, []);

  // Debounced filter application
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      applyFilters();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [filters, currentPage, pageSize]);

  const loadDepartments = async () => {
    try {
      const response = await fetch('/api/departments/', {
        method: "GET",
        credentials: "include",
        headers: {
          "X-CSRFToken": getCsrfToken(),
        },
      });
      if (response.ok) {
        const data = await response.json();
        setDepartments(data.departments || []);
      }
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  };

  const loadBatches = async () => {
    try {
      const response = await fetch('/api/batches/', {
        method: "GET",
        credentials: "include",
        headers: {
          "X-CSRFToken": getCsrfToken(),
        },
      });
      if (response.ok) {
        const data = await response.json();
        setBatches(data.batches || []);
      }
    } catch (error) {
      console.error('Failed to load batches:', error);
    }
  };

  const applyFilters = async () => {
    setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          if (Array.isArray(value)) {
            if (value.length > 0) {
              params.append(key, value.join(','));
            }
          } else {
            params.append(key, value);
          }
        }
      });

      params.append('page', currentPage);
      params.append('page_size', pageSize);

      // Fetch filtered students
      const studentsResponse = await fetch(`/api/students/advanced-filter/?${params}`, {
        method: "GET",
        credentials: "include",
        headers: {
          "X-CSRFToken": getCsrfToken(),
        },
      });

      if (studentsResponse.ok) {
        const studentsData = await studentsResponse.json();
        setStudents(studentsData.students);
        setTotalCount(studentsData.total);
        
        if (onStudentsUpdate) {
          onStudentsUpdate(studentsData);
        }
      }

      // Fetch performance stats
      const statsResponse = await fetch(`/api/students/performance-stats/?${params}`, {
        method: "GET",
        credentials: "include",
        headers: {
          "X-CSRFToken": getCsrfToken(),
        },
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
        
        if (onStatsUpdate) {
          onStatsUpdate(statsData);
        }
      }

    } catch (error) {
      console.error('Failed to apply filters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleArrayFilterChange = (key, value, checked) => {
    setFilters(prev => ({
      ...prev,
      [key]: checked 
        ? [...prev[key], value]
        : prev[key].filter(item => item !== value)
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      batch: '',
      department_id: '',
      min_problems_solved: '',
      max_problems_solved: '',
      min_easy_solved: '',
      min_medium_solved: '',
      min_hard_solved: '',
      min_current_streak: '',
      topics: [],
      min_topic_solved: '',
      min_aptitude_solved: '',
      aptitude_topics: [],
      max_avg_time_minutes: '',
      min_success_rate: '',
      languages: [],
      min_language_problems: ''
    });
    setCurrentPage(1);
  };

  const exportData = async (format = 'csv') => {
    try {
      const filterData = {};
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== '') {
          if (Array.isArray(value)) {
            if (value.length > 0) {
              filterData[key] = value.join(',');
            }
          } else {
            filterData[key] = value;
          }
        }
      });

      const endpoint = format === 'pdf' ? '/api/students/export-pdf/' : '/api/students/export/';
      const response = await fetch(endpoint, {
        ...buildJsonPostOptions(filterData),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileExtension = format === 'pdf' ? 'pdf' : 'csv';
        a.download = `student_performance_report_${new Date().toISOString().split('T')[0]}.${fileExtension}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setShowExportModal(false);
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Export failed');
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const renderPerformanceFilters = () => (
    <div className="filter-section">
      <h3>Overall Performance</h3>
      <div className="filter-grid">
        <div className="filter-group">
          <label>Problems Solved Range</label>
          <div className="range-inputs">
            <input
              type="number"
              placeholder="Min"
              value={filters.min_problems_solved}
              onChange={(e) => handleFilterChange('min_problems_solved', e.target.value)}
            />
            <span>to</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.max_problems_solved}
              onChange={(e) => handleFilterChange('max_problems_solved', e.target.value)}
            />
          </div>
        </div>

        <div className="filter-group">
          <label>Minimum Easy Problems</label>
          <input
            type="number"
            placeholder="e.g., 10"
            value={filters.min_easy_solved}
            onChange={(e) => handleFilterChange('min_easy_solved', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Minimum Medium Problems</label>
          <input
            type="number"
            placeholder="e.g., 5"
            value={filters.min_medium_solved}
            onChange={(e) => handleFilterChange('min_medium_solved', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Minimum Hard Problems</label>
          <input
            type="number"
            placeholder="e.g., 2"
            value={filters.min_hard_solved}
            onChange={(e) => handleFilterChange('min_hard_solved', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Minimum Current Streak</label>
          <input
            type="number"
            placeholder="e.g., 5"
            value={filters.min_current_streak}
            onChange={(e) => handleFilterChange('min_current_streak', e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const renderTopicFilters = () => (
    <div className="filter-section">
      <h3>Topic-wise Performance</h3>
      <div className="filter-group">
        <label>Programming Topics</label>
        <div className="checkbox-grid">
          {topicOptions.map(topic => (
            <label key={topic} className="checkbox-item">
              <input
                type="checkbox"
                checked={filters.topics.includes(topic)}
                onChange={(e) => handleArrayFilterChange('topics', topic, e.target.checked)}
              />
              {topic}
            </label>
          ))}
        </div>
      </div>
      
      <div className="filter-group">
        <label>Minimum Problems in Selected Topics</label>
        <input
          type="number"
          placeholder="e.g., 3"
          value={filters.min_topic_solved}
          onChange={(e) => handleFilterChange('min_topic_solved', e.target.value)}
        />
      </div>
    </div>
  );

  const renderAptitudeFilters = () => (
    <div className="filter-section">
      <h3>Aptitude Performance</h3>
      <div className="filter-group">
        <label>Aptitude Topics</label>
        <div className="checkbox-grid">
          {aptitudeTopicOptions.map(topic => (
            <label key={topic} className="checkbox-item">
              <input
                type="checkbox"
                checked={filters.aptitude_topics.includes(topic)}
                onChange={(e) => handleArrayFilterChange('aptitude_topics', topic, e.target.checked)}
              />
              {topic}
            </label>
          ))}
        </div>
      </div>
      
      <div className="filter-group">
        <label>Minimum Aptitude Questions Solved</label>
        <input
          type="number"
          placeholder="e.g., 10"
          value={filters.min_aptitude_solved}
          onChange={(e) => handleFilterChange('min_aptitude_solved', e.target.value)}
        />
      </div>
    </div>
  );

  const renderEfficiencyFilters = () => (
    <div className="filter-section">
      <h3>Programming Efficiency</h3>
      <div className="filter-grid">
        <div className="filter-group">
          <label>Max Average Time per Problem (minutes)</label>
          <input
            type="number"
            placeholder="e.g., 30"
            value={filters.max_avg_time_minutes}
            onChange={(e) => handleFilterChange('max_avg_time_minutes', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Minimum Success Rate (%)</label>
          <input
            type="number"
            placeholder="e.g., 70"
            min="0"
            max="100"
            value={filters.min_success_rate}
            onChange={(e) => handleFilterChange('min_success_rate', e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const renderLanguageFilters = () => (
    <div className="filter-section">
      <h3>Programming Languages</h3>
      <div className="filter-group">
        <label>Languages</label>
        <div className="checkbox-grid">
          {languageOptions.map(language => (
            <label key={language} className="checkbox-item">
              <input
                type="checkbox"
                checked={filters.languages.includes(language)}
                onChange={(e) => handleArrayFilterChange('languages', language, e.target.checked)}
              />
              {language}
            </label>
          ))}
        </div>
      </div>
      
      <div className="filter-group">
        <label>Minimum Problems in Selected Languages</label>
        <input
          type="number"
          placeholder="e.g., 5"
          value={filters.min_language_problems}
          onChange={(e) => handleFilterChange('min_language_problems', e.target.value)}
        />
      </div>
    </div>
  );

  const renderBasicFilters = () => (
    <div className="filter-section">
      <h3>Basic Filters</h3>
      <div className="filter-grid">
        <div className="filter-group">
          <label>Search</label>
          <input
            type="text"
            placeholder="Name or Register Number"
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>Batch</label>
          <select
            value={filters.batch}
            onChange={(e) => handleFilterChange('batch', e.target.value)}
          >
            <option value="">All Batches</option>
            {batches.map(batch => (
              <option key={batch} value={batch}>{batch}</option>
            ))}
          </select>
        </div>

        {(userType === 'admin' || userType === 'director') && (
          <div className="filter-group">
            <label>Department</label>
            <select
              value={filters.department_id}
              onChange={(e) => handleFilterChange('department_id', e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>{dept.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );

  const renderStudentsList = () => (
    <div className="students-list">
      <div className="list-header">
        <h3>Filtered Students ({totalCount})</h3>
        <div className="list-controls">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
          <button 
            className="export-btn"
            onClick={() => setShowExportModal(true)}
            disabled={totalCount === 0}
          >
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading students...</div>
      ) : (
        <>
          <div className="students-table">
            <table>
              <thead>
                <tr>
                  <th>Register Number</th>
                  <th>Name</th>
                  <th>Batch</th>
                  <th>Department</th>
                  <th>Problems Solved</th>
                  <th>Success Rate</th>
                  <th>Current Streak</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student.id}>
                    <td>{student.register_number}</td>
                    <td>{student.name}</td>
                    <td>{student.batch}</td>
                    <td>{student.department}</td>
                    <td>
                      <div className="problems-breakdown">
                        <span className="total">{student.performance.total_problems_solved}</span>
                        <div className="difficulty-breakdown">
                          <span className="easy">E: {student.performance.easy_solved}</span>
                          <span className="medium">M: {student.performance.medium_solved}</span>
                          <span className="hard">H: {student.performance.hard_solved}</span>
                        </div>
                      </div>
                    </td>
                    <td>{student.performance.success_rate}%</td>
                    <td>{student.current_streak}</td>
                    <td>
                      {student.performance.last_activity 
                        ? new Date(student.performance.last_activity).toLocaleDateString()
                        : 'Never'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalCount > pageSize && (
            <div className="pagination">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
              >
                Previous
              </button>
              <span>
                Page {currentPage} of {Math.ceil(totalCount / pageSize)}
              </span>
              <button
                disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                onClick={() => setCurrentPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderStats = () => (
    <div className="performance-stats">
      <h3>Performance Statistics</h3>
      {stats ? (
        <div className="stats-grid">
          <div className="stat-card">
            <h4>Total Students</h4>
            <div className="stat-value">{stats.aggregate_stats.total_students}</div>
          </div>
          <div className="stat-card">
            <h4>Avg Problems Solved</h4>
            <div className="stat-value">
              {Math.round(stats.aggregate_stats.avg_problems_solved || 0)}
            </div>
          </div>
          <div className="stat-card">
            <h4>Avg Success Rate</h4>
            <div className="stat-value">
              {Math.round(stats.aggregate_stats.avg_success_rate || 0)}%
            </div>
          </div>
          <div className="stat-card">
            <h4>Max Problems Solved</h4>
            <div className="stat-value">{stats.aggregate_stats.max_problems_solved || 0}</div>
          </div>
        </div>
      ) : (
        <div className="loading">Loading statistics...</div>
      )}
    </div>
  );

  return (
    <div className="advanced-student-filter">
      <div className="filter-header">
        <h2>Advanced Student Filter & Analytics</h2>
        <div className="header-controls">
          <button className="clear-filters-btn" onClick={clearFilters}>
            Clear All Filters
          </button>
        </div>
      </div>

      <div className="filter-tabs">
        <button
          className={activeTab === 'basic' ? 'active' : ''}
          onClick={() => setActiveTab('basic')}
        >
          Basic
        </button>
        <button
          className={activeTab === 'performance' ? 'active' : ''}
          onClick={() => setActiveTab('performance')}
        >
          Performance
        </button>
        <button
          className={activeTab === 'topics' ? 'active' : ''}
          onClick={() => setActiveTab('topics')}
        >
          Topics
        </button>
        <button
          className={activeTab === 'aptitude' ? 'active' : ''}
          onClick={() => setActiveTab('aptitude')}
        >
          Aptitude
        </button>
        <button
          className={activeTab === 'efficiency' ? 'active' : ''}
          onClick={() => setActiveTab('efficiency')}
        >
          Efficiency
        </button>
        <button
          className={activeTab === 'languages' ? 'active' : ''}
          onClick={() => setActiveTab('languages')}
        >
          Languages
        </button>
      </div>

      <div className="filter-content">
        {activeTab === 'basic' && renderBasicFilters()}
        {activeTab === 'performance' && renderPerformanceFilters()}
        {activeTab === 'topics' && renderTopicFilters()}
        {activeTab === 'aptitude' && renderAptitudeFilters()}
        {activeTab === 'efficiency' && renderEfficiencyFilters()}
        {activeTab === 'languages' && renderLanguageFilters()}
      </div>

      {renderStats()}
      {renderStudentsList()}

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Export Student Performance Report</h3>
            <p>
              This will export {totalCount} students with the current filters applied.
              Choose your preferred format:
            </p>
            
            <div className="export-format-options">
              <div className="format-option">
                <h4>📊 PDF Report (Recommended)</h4>
                <p>Professional report with college branding, performance summary, and detailed analytics. Perfect for presentations and official documentation.</p>
                <ul>
                  <li>College logo and institutional header</li>
                  <li>Performance summary and statistics</li>
                  <li>Top 50 students with detailed metrics</li>
                  <li>Professional formatting</li>
                </ul>
              </div>
              
              <div className="format-option">
                <h4>📈 CSV Data Export</h4>
                <p>Raw data export for further analysis in Excel or other tools. Contains all student records with complete performance metrics.</p>
                <ul>
                  <li>All {totalCount} student records</li>
                  <li>Complete performance data</li>
                  <li>Suitable for data analysis</li>
                  <li>Excel compatible</li>
                </ul>
              </div>
            </div>
            
            <div className="modal-actions">
              <button onClick={() => setShowExportModal(false)}>Cancel</button>
              <button onClick={() => exportData('csv')} className="secondary">Export CSV</button>
              <button onClick={() => exportData('pdf')} className="primary">Export PDF Report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedStudentFilter;