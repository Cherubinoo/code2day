import { useState, useEffect } from 'react';
import { Activity, Users, Briefcase, Calendar, TrendingUp, Filter } from 'lucide-react';
import api from '../../lib/api';
import AnimatedNumber from '../common/AnimatedNumber';

const DAUAnalyticsChart = ({ institutions = [] }) => {
  const [selectedInstId, setSelectedInstId] = useState('');
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [dauData, setDauData] = useState([]);

  useEffect(() => {
    fetchDAUData();
  }, [selectedInstId, days]);

  const fetchDAUData = async () => {
    try {
      setLoading(true);
      const url = `/admin/analytics/dau/?days=${days}${selectedInstId ? `&institution_id=${selectedInstId}` : ''}`;
      const res = await api.get(url);
      setDauData(res.data.daily_active_users || []);
    } catch (err) {
      console.error('Failed to fetch DAU data', err);
    } finally {
      setLoading(false);
    }
  };

  const maxTotal = Math.max(...dauData.map(d => Math.max(d.total, 10)), 10);
  const todayStat = dauData[dauData.length - 1] || { students: 0, staff: 0, total: 0 };
  const peakStudents = Math.max(...dauData.map(d => d.students), 0);
  const peakStaff = Math.max(...dauData.map(d => d.staff), 0);

  return (
    <div style={{
      background: 'white',
      borderRadius: 24,
      padding: 32,
      border: '1px solid var(--border-soft, #e2e8f0)',
      boxShadow: 'var(--shadow-soft, 0 10px 30px rgba(0,0,0,0.05))',
      marginBottom: 48
    }}>
      {/* HEADER & FILTERS */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 28
      }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--olive-950, #0f172a)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={26} style={{ color: '#10b981' }} />
            Daily Active Users (DAU) Analytics
          </h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.95rem' }}>
            Institution-wise daily active students vs faculty activity tracking
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Institution Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f8fafc', padding: '6px 14px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <Filter size={16} color="#64748b" />
            <select
              value={selectedInstId}
              onChange={(e) => setSelectedInstId(e.target.value)}
              style={{ background: 'transparent', border: 'none', fontWeight: 700, fontSize: '0.88rem', color: '#334155', cursor: 'pointer', outline: 'none' }}
            >
              <option value="">All Institutions (Network)</option>
              {institutions.map(inst => (
                <option key={inst.id} value={inst.id}>{inst.name} ({inst.short_code})</option>
              ))}
            </select>
          </div>

          {/* Time Range Selector */}
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 12 }}>
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: days === d ? '#0f172a' : 'transparent',
                  color: days === d ? 'white' : '#64748b',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {d} Days
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SUMMARY STATS BAR */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        marginBottom: 32,
        background: '#f8fafc',
        padding: 20,
        borderRadius: 16,
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
            <Users size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Active Students (Today)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
              <AnimatedNumber value={todayStat.students} duration={0.8} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1' }}>
            <Briefcase size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Active Faculty (Today)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
              <AnimatedNumber value={todayStat.staff} duration={0.8} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Peak Students ({days}d)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
              <AnimatedNumber value={peakStudents} duration={0.8} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(139, 92, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
            <Calendar size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Peak Faculty ({days}d)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a' }}>
              <AnimatedNumber value={peakStaff} duration={0.8} />
            </div>
          </div>
        </div>
      </div>

      {/* GRAPH LEGEND */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 20, fontSize: '0.85rem', fontWeight: 700 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 14, height: 14, borderRadius: 4, background: '#10b981' }} />
          <span>Students</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 14, height: 14, borderRadius: 4, background: '#6366f1' }} />
          <span>Faculty Members</span>
        </div>
      </div>

      {/* GRAPH VISUALIZATION */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
          Loading daily activity analytics...
        </div>
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: Math.max(6, Math.floor(600 / dauData.length)),
          height: 240,
          paddingTop: 20,
          borderBottom: '2px solid #e2e8f0',
          position: 'relative'
        }}>
          {dauData.map((item, idx) => {
            const studentPct = Math.round((item.students / maxTotal) * 100);
            const staffPct = Math.round((item.staff / maxTotal) * 100);

            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end',
                  position: 'relative',
                  group: 'bar'
                }}
                title={`${item.display_date} (${item.day_name}): ${item.students} Students, ${item.staff} Faculty (Total: ${item.total})`}
              >
                {/* BARS CONTAINER */}
                <div style={{
                  width: '100%',
                  maxWidth: 32,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 3,
                  height: '100%'
                }}>
                  {/* Student Bar */}
                  <div style={{
                    width: '45%',
                    height: `${Math.max(studentPct, 4)}%`,
                    background: 'linear-gradient(180deg, #34d399 0%, #10b981 100%)',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.4s ease-out'
                  }} />
                  {/* Staff Bar */}
                  <div style={{
                    width: '45%',
                    height: `${Math.max(staffPct, 4)}%`,
                    background: 'linear-gradient(180deg, #818cf8 0%, #6366f1 100%)',
                    borderRadius: '6px 6px 0 0',
                    transition: 'all 0.4s ease-out'
                  }} />
                </div>

                {/* DATE LABEL */}
                <div style={{
                  marginTop: 10,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#64748b',
                  whiteSpace: 'nowrap'
                }}>
                  {item.display_date}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DAUAnalyticsChart;
