// Admin Dashboard - Advanced Infrastructure Management
// Features: Dynamic Metrics, Multi-Role Personnel Orchestration, Granular Subsystem Locks

import { useState, useEffect } from 'react';
import { 
  Building2, Lock, Unlock, Plus, Shield, Users, 
  Trash2, Activity, Database, LayoutDashboard,
  GraduationCap, Briefcase, Award, Settings,
  ChevronRight, ArrowLeft, BarChart3, HardHat,
  UserCheck, Wrench, Search
} from 'lucide-react';
import api from '../../lib/api';
import DoubleConfirmModal from '../common/DoubleConfirmModal';
import ProblemBankView from './ProblemBankView';

const AdminDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [selectedInstitution, setSelectedInstitution] = useState(null);
  const [showProblemBank, setShowProblemBank] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  
  // System State (Global)
  const [metrics, setMetrics] = useState({ total_users: 0, total_staff: 0, total_problems: 0, total_aptitude: 0 });
  const [institutions, setInstitutions] = useState([]);
  const [globalMaintenance, setGlobalMaintenance] = useState({ staff: false, student: false, hod: false });
  
  // Institution Detail State (Hub)
  const [hubData, setHubData] = useState({
    staff: [],
    students: [],
    departments: [],
    batches: [],
    maintenance: { staff: false, student: false, hod: false, inst_admin: false, ja: false },
    branding: { 
      display_name: '', 
      subheading: '', 
      logo_url: '', 
      website: '', 
      established_year: '', 
      address: '', 
      contact_email: '', 
      contact_phone: '' 
    },
    metrics: { students: 0, staff: 0, departments: 0 }
  });

  const [newInstitution, setNewInstitution] = useState({ institution_id: '', name: '', short_code: '', address: '', contact_email: '', contact_phone: '' });
  const [newDept, setNewDept] = useState({ name: '', code: '' });
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('');
  const [selectedBatchFilter, setSelectedBatchFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [brandingForm, setBrandingForm] = useState({
    display_name: '',
    subheading: '',
    logo_url: '',
    website: '',
    established_year: '',
    address: '',
    contact_email: '',
    contact_phone: ''
  });
  
  // Double Confirmation State
  const [confirmState, setConfirmState] = useState({ 
    show: false, 
    m1: '', 
    m2: '', 
    onConfirm: null 
  });

  const askDouble = (onConfirm, m1, m2) => {
    setConfirmState({ show: true, m1, m2, onConfirm });
  };

  useEffect(() => {
    fetchGlobalData();
  }, []);

  const fetchGlobalData = async () => {
    try {
      const res = await api.get('/admin/dashboard/');
      setMetrics(res.data.metrics);
      setInstitutions(res.data.institutions);
      setGlobalMaintenance(res.data.global_config);
      setLoading(false);
    } catch (err) {
      console.error("Global load failed", err);
      setLoading(false);
    }
  };

  const fetchInstitutionHub = async (inst) => {
    setSelectedInstitution(inst);
    setActiveTab('dashboard');
    try {
      const res = await api.get(`/admin/v2/institutions/${inst.id}/hub/`);
      setHubData(res.data);
      
      // Initialize branding form with current data, using institution defaults if branding fields are empty
      const brandingData = res.data.branding || {};
      setBrandingForm({
        display_name: brandingData.display_name || inst.name || '',
        subheading: brandingData.subheading || '',
        logo_url: brandingData.logo_url || '',
        website: brandingData.website || '',
        established_year: brandingData.established_year || '',
        address: brandingData.address || inst.address || '',
        contact_email: brandingData.contact_email || inst.contact_email || '',
        contact_phone: brandingData.contact_phone || inst.contact_phone || ''
      });
    } catch (err) {
      console.error("Hub load failed", err);
    }
  };

  const handleCreateInstitution = async () => {
    if (!newInstitution.institution_id || !newInstitution.name) return;
    try {
      await api.post('/admin/v2/institutions/', newInstitution);
      setShowCreateModal(false);
      setNewInstitution({ institution_id: '', name: '', short_code: '' });
      fetchGlobalData();
    } catch (err) {
      alert("Creation failed: " + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteInstitution = async (id) => {
    askDouble(
      async () => {
        try {
          await api.delete(`/admin/v2/institutions/${id}/`);
          setShowDeleteConfirm(null);
          fetchGlobalData();
        } catch (err) {
          alert("Deletion failed");
        }
      },
      "Are you sure you want to delete this institution?",
      "CRITICAL: All associated data, databases, and users for this college will be PERMANENTLY DELETED. Confirm final destruction?"
    );
  };

  const toggleGlobalMaintenance = async (role, current) => {
    try {
      await api.post('/admin/v2/global-maintenance/', { role, value: !current });
      setGlobalMaintenance({ ...globalMaintenance, [role]: !current });
    } catch (err) {
      alert("Failed to update global maintenance");
    }
  };

  const toggleInstMaintenance = async (role, current) => {
    const action = current ? 'UNLOCK' : 'LOCK';
    askDouble(
      async () => {
        try {
          await api.patch(`/admin/v2/institutions/${selectedInstitution.id}/hub/`, { 
            action: 'toggle_maintenance', role, value: !current 
          });
          setHubData({ 
            ...hubData, 
            maintenance: { ...hubData.maintenance, [role]: !current } 
          });
        } catch (err) {
          alert("Failed to update maintenance");
        }
      },
      `Are you sure you want to ${action} ${role} access?`,
      `Confirming ${action} for ${selectedInstitution.name}. This will affect all ${role} users immediately.`
    );
  };

  const updateStaffRole = async (staffId, newRole) => {
    try {
      await api.patch(`/admin/v2/institutions/${selectedInstitution.id}/hub/`, { 
        action: 'update_role', staff_id: staffId, role: newRole 
      });
      setHubData({
        ...hubData,
        staff: hubData.staff.map(s => s.id === staffId ? { ...s, role: newRole } : s)
      });
    } catch (err) {
      alert("Role update failed");
    }
  };

  const updateStaffDept = async (staffId, deptId) => {
    try {
      await api.patch(`/admin/v2/institutions/${selectedInstitution.id}/hub/`, { 
        action: 'update_dept', staff_id: staffId, dept_id: deptId 
      });
      const updatedDept = hubData.departments.find(d => d.id === parseInt(deptId));
      setHubData({
        ...hubData,
        staff: hubData.staff.map(s => s.id === staffId ? { 
          ...s, 
          department__id: deptId ? parseInt(deptId) : null,
          department__name: updatedDept ? updatedDept.name : 'Unassigned'
        } : s)
      });
    } catch (err) {
      alert("Department update failed");
    }
  };

  const handleAddDept = async () => {
    if (!newDept.name || !newDept.code) return;
    try {
      await api.post(`/admin/v2/institutions/${selectedInstitution.id}/departments/`, newDept);
      setNewDept({ name: '', code: '' });
      fetchInstitutionHub(selectedInstitution);
    } catch (err) {
      alert("Failed to add department");
    }
  };

  const handleDeleteDept = async (deptId) => {
    askDouble(
      async () => {
        try {
          await api.delete(`/admin/v2/institutions/${selectedInstitution.id}/departments/${deptId}/`);
          fetchInstitutionHub(selectedInstitution);
        } catch (err) {
          alert("Delete failed");
        }
      },
      "Delete this department?",
      "Warning: This will unassign all staff and students from this department. Proceed?"
    );
  };

  const toggleStudentLock = async (studentId, currentStatus) => {
    const action = currentStatus ? 'LOCK' : 'UNLOCK';
    askDouble(
      async () => {
        try {
          await api.patch(`/admin/v2/institutions/${selectedInstitution.id}/hub/`, {
            action: 'toggle_student_lock',
            student_id: studentId
          });
          setHubData({
            ...hubData,
            students: hubData.students.map(s => s.id === studentId ? { ...s, is_active: !currentStatus } : s)
          });
        } catch (err) {
          alert("Failed to toggle student lock");
        }
      },
      `Are you sure you want to ${action} this student account?`,
      `Final confirmation: ${action} student access. They will be unable to login until unlocked.`
    );
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatchFilter) {
      alert("Please select a batch to delete first.");
      return;
    }
    
    askDouble(
      async () => {
        try {
          await api.patch(`/admin/v2/institutions/${selectedInstitution.id}/hub/`, {
            action: 'delete_batch',
            batch: selectedBatchFilter,
            dept_id: selectedDeptFilter || null
          });
          setSelectedBatchFilter('');
          fetchInstitutionHub(selectedInstitution);
        } catch (err) {
          alert("Failed to delete batch");
        }
      },
      `DELETE ENTIRE BATCH: ${selectedBatchFilter}?`,
      `CRITICAL: This will PERMANENTLY DELETE all students and accounts in batch ${selectedBatchFilter}${selectedDeptFilter ? ' for the selected department' : ' across the whole institution'}. Confirm final destruction?`
    );
  };

  const handleUpdateBranding = async () => {
    try {
      await api.patch(`/admin/v2/institutions/${selectedInstitution.id}/hub/`, {
        action: 'update_branding',
        branding: brandingForm
      });
      
      // Update local state
      setHubData({
        ...hubData,
        branding: brandingForm
      });
      
      alert("College branding updated successfully!");
    } catch (err) {
      alert("Failed to update branding: " + (err.response?.data?.error || err.message));
    }
  };

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-2)' }}>
      <div className="loader">Stabilizing System Environment...</div>
    </div>
  );

  return (
    <div className="admin-dashboard" style={{ padding: '40px', background: 'var(--bg-2)', minHeight: '100vh' }}>
      <div className="admin-container" style={{ width: '100%', margin: '0 auto' }}>
        
        {/* HEADER */}
        <header style={{ marginBottom: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {selectedInstitution && (
              <button 
                onClick={() => setSelectedInstitution(null)}
                style={{ background: 'white', border: '1px solid var(--border-soft)', width: 48, height: 48, borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--olive-900)', boxShadow: 'var(--shadow-soft)' }}
              >
                <ArrowLeft size={24} />
              </button>
            )}
            <div>
              <h1 style={{ fontSize: '2.8rem', fontWeight: 950, color: 'var(--olive-950)', letterSpacing: '-0.04em', margin: 0 }}>
                {selectedInstitution ? selectedInstitution.name : "System Administration"}
              </h1>
              <p style={{ color: 'var(--text-soft)', margin: '4px 0 0', fontSize: '1.2rem', fontWeight: 500 }}>
                {selectedInstitution ? `Isolated Node • ${selectedInstitution.short_code}` : "Global infrastructure control center"}
              </p>
            </div>
          </div>
          
          {!selectedInstitution && (
            <button onClick={() => setShowCreateModal(true)} className="primary-button" style={{ borderRadius: 12, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', width: 'fit-content' }}>
              <Plus size={18} /> Provision Institution
            </button>
          )}
        </header>

        {showProblemBank ? (
          <ProblemBankView onBack={() => setShowProblemBank(false)} />
        ) : !selectedInstitution ? (
          /* GLOBAL LANDING VIEW - INSTITUTIONS LIST */
          <div className="global-view animate-fade-in">
            {/* SYSTEM METRICS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 48 }}>
              {[
                { label: 'Total Institutions', value: institutions.length, icon: Building2, color: '#6366f1' },
                { label: 'Active Users', value: metrics.total_users, icon: Users, color: '#10b981' },
                { label: 'Faculty Members', value: metrics.total_staff, icon: Briefcase, color: '#f59e0b' },
                { label: 'Problem Bank', value: metrics.total_problems + metrics.total_aptitude, icon: Database, color: '#ef4444', onClick: () => setShowProblemBank(true) }
              ].map((m, i) => (
                <div
                  key={i}
                  onClick={m.onClick}
                  style={{ padding: 32, borderRadius: 24, background: 'white', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)', cursor: m.onClick ? 'pointer' : 'default' }}
                  title={m.onClick ? 'Click to manage the problem bank and generate test cases' : undefined}
                >
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: `${m.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color, marginBottom: 20 }}>
                    <m.icon size={24} />
                  </div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 950, color: 'var(--olive-950)', marginBottom: 8 }}>{m.value}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-soft)', fontWeight: 600 }}>{m.label}{m.onClick ? ' →' : ''}</div>
                </div>
              ))}
            </div>

            {/* INSTITUTION CARDS */}
            <div style={{ marginBottom: 48 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                <div>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: 8, color: 'var(--olive-900)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Building2 size={28} /> Educational Institutions
                  </h2>
                  <p style={{ color: 'var(--text-soft)', margin: 0, fontSize: '1rem' }}>
                    Manage and monitor institutional nodes across the network
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ padding: '8px 16px', background: 'var(--sage-100)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--olive-700)' }}>
                      {institutions.filter(i => i.is_active).length} Active
                    </span>
                  </div>
                  <button onClick={() => setShowCreateModal(true)} className="primary-button" style={{ borderRadius: 12, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', width: 'fit-content' }}>
                    <Plus size={18} /> Add Institution
                  </button>
                </div>
              </div>
              
              {institutions.length === 0 ? (
                <div style={{ 
                  padding: '80px 40px', 
                  textAlign: 'center', 
                  background: 'white', 
                  borderRadius: '32px', 
                  border: '2px dashed var(--border-soft)' 
                }}>
                  <Building2 size={64} style={{ color: 'var(--text-soft)', opacity: 0.3, marginBottom: 24 }} />
                  <h3 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-soft)', marginBottom: 12 }}>
                    No Institutions Found
                  </h3>
                  <p style={{ color: 'var(--text-soft)', marginBottom: 32, fontSize: '1rem' }}>
                    Get started by adding your first educational institution to the system.
                  </p>
                  <button onClick={() => setShowCreateModal(true)} className="primary-button" style={{ borderRadius: 16, padding: '16px 32px', fontSize: '1rem' }}>
                    <Plus size={20} style={{ marginRight: 8 }} /> Create First Institution
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 24 }}>
                  {institutions.map((inst) => (
                    <article 
                      key={inst.id}
                      onClick={() => fetchInstitutionHub(inst)}
                      className="surface-card"
                      style={{ 
                        padding: 32, 
                        background: 'white', 
                        borderRadius: 32, 
                        border: '1px solid var(--border-soft)', 
                        cursor: 'pointer', 
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
                        position: 'relative',
                        boxShadow: 'var(--shadow-soft)'
                      }}
                      onMouseOver={e => { 
                        e.currentTarget.style.transform = 'translateY(-8px)'; 
                        e.currentTarget.style.borderColor = 'var(--olive-400)'; 
                        e.currentTarget.style.boxShadow = '0 30px 60px rgba(0,0,0,0.12)'; 
                      }}
                      onMouseOut={e => { 
                        e.currentTarget.style.transform = 'translateY(0)'; 
                        e.currentTarget.style.borderColor = 'var(--border-soft)'; 
                        e.currentTarget.style.boxShadow = 'var(--shadow-soft)'; 
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                        <div style={{ 
                          width: 64, 
                          height: 64, 
                          background: 'linear-gradient(135deg, var(--sage-100), var(--sage-200))', 
                          borderRadius: 20, 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: 'var(--olive-900)',
                          boxShadow: '0 8px 16px rgba(97, 115, 76, 0.1)'
                        }}>
                          <Building2 size={32} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[
                            { role: 'S', status: inst.maintenance_staff, label: 'Staff' },
                            { role: 'T', status: inst.maintenance_students, label: 'Students' },
                            { role: 'H', status: inst.maintenance_hod, label: 'HOD' }
                          ].map((item, idx) => (
                            <div 
                              key={idx} 
                              title={`${item.label}: ${item.status ? 'Locked' : 'Active'}`}
                              style={{ 
                                width: 32, 
                                height: 32, 
                                borderRadius: 10, 
                                background: item.status ? '#fee2e2' : '#dcfce7', 
                                color: item.status ? '#ef4444' : '#10b981', 
                                fontSize: '0.8rem', 
                                fontWeight: 900, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                border: `2px solid ${item.status ? '#fecaca' : '#a7f3d0'}`,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {item.role}
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <h3 style={{ 
                        fontSize: '1.4rem', 
                        fontWeight: 900, 
                        color: 'var(--olive-950)', 
                        marginBottom: 8, 
                        lineHeight: 1.3,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {inst.name}
                      </h3>
                      
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 800, 
                          color: 'var(--text-soft)', 
                          background: 'var(--bg-2)', 
                          padding: '6px 12px', 
                          borderRadius: 12 
                        }}>
                          ID: {inst.institution_id}
                        </span>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 800, 
                          color: 'var(--text-soft)', 
                          background: 'var(--bg-2)', 
                          padding: '6px 12px', 
                          borderRadius: 12 
                        }}>
                          {inst.short_code}
                        </span>
                      </div>
                      
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        borderTop: '1px solid var(--border-soft)', 
                        paddingTop: 20 
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ 
                            width: 10, 
                            height: 10, 
                            borderRadius: '50%', 
                            background: inst.is_active ? '#10b981' : '#ef4444' 
                          }} />
                          <span style={{ 
                            fontSize: '0.85rem', 
                            fontWeight: 800, 
                            color: inst.is_active ? '#059669' : '#dc2626', 
                            textTransform: 'uppercase' 
                          }}>
                            {inst.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              fetchInstitutionHub(inst); 
                            }} 
                            style={{ 
                              background: 'var(--olive-900)', 
                              color: 'white', 
                              border: 'none', 
                              padding: '8px 16px', 
                              borderRadius: '10px', 
                              fontSize: '0.8rem', 
                              fontWeight: '700', 
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6
                            }}
                          >
                            <Settings size={14} /> Manage
                          </button>
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              setShowDeleteConfirm(inst); 
                            }} 
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              color: '#ef4444', 
                              cursor: 'pointer', 
                              padding: 8,
                              borderRadius: 8,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title="Delete Institution"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* GLOBAL PERMISSIONS */}
            <div className="surface-card" style={{ padding: 40, borderRadius: 32, background: 'white', border: '1px solid var(--border-soft)', boxShadow: 'var(--shadow-soft)' }}>
              <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--olive-900)', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
                <Shield size={28} /> Global System Permissions
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
                {[
                  { label: 'Student Portal', role: 'student', current: globalMaintenance.student, icon: GraduationCap },
                  { label: 'Staff Console', role: 'staff', current: globalMaintenance.staff, icon: Briefcase },
                  { label: 'HOD Executive', role: 'hod', current: globalMaintenance.hod, icon: Award }
                ].map((p, i) => (
                  <div key={i} style={{ padding: 28, background: 'var(--bg-2)', borderRadius: 24, border: '1px solid var(--border-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 14, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--olive-700)' }}>
                        <p.icon size={24} />
                      </div>
                      <button 
                        onClick={() => toggleGlobalMaintenance(p.role, p.current)} 
                        style={{ 
                          padding: '8px 16px', 
                          borderRadius: 12, 
                          border: 'none', 
                          background: p.current ? '#ef4444' : '#10b981', 
                          color: 'white', 
                          fontSize: '0.8rem', 
                          fontWeight: 900, 
                          cursor: 'pointer' 
                        }}
                      >
                        {p.current ? 'LOCKED' : 'ACTIVE'}
                      </button>
                    </div>
                    <h4 style={{ fontSize: '1.2rem', fontWeight: 850, color: 'var(--olive-900)', marginBottom: 8 }}>{p.label}</h4>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* INSTITUTION HUB VIEW */
          <div className="institution-hub animate-fade-in">
            {/* TABS */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
              {[
                { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                { id: 'branding', label: 'College Branding', icon: Award },
                { id: 'departments', label: 'Departments', icon: Building2 },
                { id: 'staff', label: 'Personnel', icon: Users },
                { id: 'students', label: 'Students', icon: GraduationCap },
                { id: 'settings', label: 'Node Settings', icon: Settings }
              ].map(t => (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: '14px 28px', borderRadius: 18, border: 'none', background: activeTab === t.id ? 'var(--olive-900)' : 'white', color: activeTab === t.id ? 'white' : 'var(--text-soft)', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, boxShadow: activeTab === t.id ? '0 8px 24px rgba(57, 72, 42, 0.2)' : 'none' }}>
                  <t.icon size={20} /> {t.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'block' }}>
              <div className="hub-main">
                <div className="surface-card" style={{ padding: 40, background: 'white', borderRadius: 32, border: '1px solid var(--border-soft)', minHeight: 600 }}>
                  
                  {activeTab === 'dashboard' && (
                    <div className="animate-fade-in">
                      <div style={{ marginBottom: 40 }}>
                        <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>Node Intelligence</h3>
                        <p style={{ color: 'var(--text-soft)', margin: '8px 0 0' }}>Dynamic metrics for {selectedInstitution.name}.</p>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginBottom: 40 }}>
                        {[
                          { label: 'Enrolled Students', value: hubData.metrics.students, icon: GraduationCap, color: '#6366f1' },
                          { label: 'Active Faculty', value: hubData.metrics.staff, icon: Users, color: '#10b981' },
                          { label: 'Departments', value: hubData.metrics.departments, icon: Building2, color: '#f59e0b' }
                        ].map((m, i) => (
                          <div key={i} style={{ padding: 32, borderRadius: 24, background: 'var(--bg-2)', border: '1px solid var(--border-soft)' }}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', color: m.color, marginBottom: 20 }}><m.icon size={24} /></div>
                            <div style={{ fontSize: '2.2rem', fontWeight: 950, color: 'var(--olive-950)' }}>{m.value}</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)', fontWeight: 800 }}>{m.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTab === 'branding' && (
                    <div className="animate-fade-in">
                      <div style={{ marginBottom: 40 }}>
                        <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#2d5016', margin: 0 }}>College Branding & Identity</h3>
                        <p style={{ color: '#6b7280', margin: '8px 0 0' }}>Configure college information, logo, and branding for reports and headers.</p>
                      </div>

                      {/* Preview Section */}
                      <div style={{ 
                        marginBottom: 40, 
                        padding: 32, 
                        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', 
                        borderRadius: 24, 
                        border: '2px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 24
                      }}>
                        {/* Logo Preview */}
                        <div style={{ 
                          width: 120, 
                          height: 120, 
                          borderRadius: 20, 
                          background: 'white', 
                          border: '2px solid #d1d5db',
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden'
                        }}>
                          {(brandingForm.logo_url || hubData.branding?.logo_display_url) ? (
                            <img 
                              src={brandingForm.logo_url || hubData.branding?.logo_display_url} 
                              alt="College Logo" 
                              style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'contain' 
                              }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <div style={{ 
                            display: (brandingForm.logo_url || hubData.branding?.logo_display_url) ? 'none' : 'flex',
                            alignItems: 'center', 
                            justifyContent: 'center',
                            color: '#9ca3af',
                            fontSize: '14px',
                            fontWeight: '600',
                            textAlign: 'center',
                            padding: 16,
                            flexDirection: 'column'
                          }}>
                            <Award size={32} style={{ marginBottom: 8 }} />
                            Logo Preview
                          </div>
                        </div>

                        {/* College Info Preview */}
                        <div style={{ flex: 1 }}>
                          <h2 style={{ 
                            fontSize: '2rem', 
                            fontWeight: '900', 
                            color: '#2d5016', 
                            margin: '0 0 8px',
                            lineHeight: 1.2
                          }}>
                            {brandingForm.display_name || selectedInstitution.name || 'College Name'}
                          </h2>
                          {brandingForm.subheading && (
                            <p style={{ 
                              fontSize: '1.1rem', 
                              color: '#4f7942', 
                              margin: '0 0 12px',
                              fontWeight: '600'
                            }}>
                              {brandingForm.subheading}
                            </p>
                          )}
                          <div style={{ fontSize: '0.95rem', color: '#6b7280', lineHeight: 1.6 }}>
                            {brandingForm.address && <div>{brandingForm.address}</div>}
                            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                              {brandingForm.contact_email && <span>📧 {brandingForm.contact_email}</span>}
                              {brandingForm.contact_phone && <span>📞 {brandingForm.contact_phone}</span>}
                            </div>
                            {brandingForm.established_year && (
                              <div style={{ marginTop: 8, fontWeight: '600' }}>
                                Est. {brandingForm.established_year}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Branding Form */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                        {/* Left Column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                          <div>
                            <label style={{ 
                              display: 'block', 
                              fontSize: '14px', 
                              fontWeight: '700', 
                              color: '#374151', 
                              marginBottom: 8 
                            }}>
                              College Display Name *
                            </label>
                            <input
                              type="text"
                              value={brandingForm.display_name}
                              onChange={(e) => setBrandingForm({...brandingForm, display_name: e.target.value})}
                              placeholder="Full official name for reports and headers"
                              style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: '12px',
                                border: '2px solid #e5e7eb',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#374151',
                                background: 'white',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                              }}
                              onFocus={(e) => e.target.style.borderColor = '#4f7942'}
                              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                            />
                          </div>

                          <div>
                            <label style={{ 
                              display: 'block', 
                              fontSize: '14px', 
                              fontWeight: '700', 
                              color: '#374151', 
                              marginBottom: 8 
                            }}>
                              Subheading / Tagline
                            </label>
                            <input
                              type="text"
                              value={brandingForm.subheading}
                              onChange={(e) => setBrandingForm({...brandingForm, subheading: e.target.value})}
                              placeholder="e.g., Excellence in Education, Autonomous Institution"
                              style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: '12px',
                                border: '2px solid #e5e7eb',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#374151',
                                background: 'white',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                              }}
                              onFocus={(e) => e.target.style.borderColor = '#4f7942'}
                              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                            />
                          </div>

                          <div>
                            <label style={{ 
                              display: 'block', 
                              fontSize: '14px', 
                              fontWeight: '700', 
                              color: '#374151', 
                              marginBottom: 8 
                            }}>
                              College Logo
                            </label>
                            
                            {/* Logo Upload Options */}
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                                <button
                                  type="button"
                                  onClick={() => document.getElementById('logo-file-input').click()}
                                  style={{
                                    padding: '12px 20px',
                                    borderRadius: '12px',
                                    border: '2px solid #4f7942',
                                    background: 'white',
                                    color: '#4f7942',
                                    fontSize: '14px',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    transition: 'all 0.2s'
                                  }}
                                  onMouseOver={(e) => {
                                    e.target.style.background = '#4f7942';
                                    e.target.style.color = 'white';
                                  }}
                                  onMouseOut={(e) => {
                                    e.target.style.background = 'white';
                                    e.target.style.color = '#4f7942';
                                  }}
                                >
                                  <Award size={16} />
                                  Upload Logo File
                                </button>
                                <span style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  fontSize: '14px', 
                                  color: '#6b7280',
                                  fontWeight: '600'
                                }}>
                                  OR
                                </span>
                              </div>
                              
                              <input
                                id="logo-file-input"
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                  const file = e.target.files[0];
                                  if (file) {
                                    try {
                                      // Upload file to server
                                      const formData = new FormData();
                                      formData.append('logo', file);
                                      formData.append('action', 'upload_logo');
                                      
                                      const response = await api.patch(`/admin/v2/institutions/${selectedInstitution.id}/hub/`, formData);
                                      
                                      // Update the logo URL with the uploaded file URL
                                      setBrandingForm({...brandingForm, logo_url: response.data.logo_url});
                                      alert('Logo uploaded successfully!');
                                    } catch (err) {
                                      alert('Failed to upload logo: ' + (err.response?.data?.error || err.message));
                                    }
                                  }
                                }}
                              />
                              
                              <input
                                type="url"
                                value={brandingForm.logo_url}
                                onChange={(e) => setBrandingForm({...brandingForm, logo_url: e.target.value})}
                                placeholder="Or paste logo URL: https://example.com/logo.png"
                                style={{
                                  width: '100%',
                                  padding: '16px 20px',
                                  borderRadius: '12px',
                                  border: '2px solid #e5e7eb',
                                  fontSize: '16px',
                                  fontWeight: '600',
                                  color: '#374151',
                                  background: 'white',
                                  outline: 'none',
                                  transition: 'border-color 0.2s'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#4f7942'}
                                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                              />
                            </div>
                            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 4 }}>
                              Recommended: Square format, minimum 200x200px, PNG or JPG
                            </p>
                          </div>

                          <div>
                            <label style={{ 
                              display: 'block', 
                              fontSize: '14px', 
                              fontWeight: '700', 
                              color: '#374151', 
                              marginBottom: 8 
                            }}>
                              Official Website
                            </label>
                            <input
                              type="url"
                              value={brandingForm.website}
                              onChange={(e) => setBrandingForm({...brandingForm, website: e.target.value})}
                              placeholder="https://www.college.edu"
                              style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: '12px',
                                border: '2px solid #e5e7eb',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#374151',
                                background: 'white',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                              }}
                              onFocus={(e) => e.target.style.borderColor = '#4f7942'}
                              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                            />
                          </div>
                        </div>

                        {/* Right Column */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                          <div>
                            <label style={{ 
                              display: 'block', 
                              fontSize: '14px', 
                              fontWeight: '700', 
                              color: '#374151', 
                              marginBottom: 8 
                            }}>
                              Complete Address
                            </label>
                            <textarea
                              value={brandingForm.address}
                              onChange={(e) => setBrandingForm({...brandingForm, address: e.target.value})}
                              placeholder="Full postal address including city, state, and PIN code"
                              rows={4}
                              style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: '12px',
                                border: '2px solid #e5e7eb',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#374151',
                                background: 'white',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                                resize: 'vertical',
                                fontFamily: 'inherit'
                              }}
                              onFocus={(e) => e.target.style.borderColor = '#4f7942'}
                              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                            />
                          </div>

                          <div>
                            <label style={{ 
                              display: 'block', 
                              fontSize: '14px', 
                              fontWeight: '700', 
                              color: '#374151', 
                              marginBottom: 8 
                            }}>
                              Contact Email
                            </label>
                            <input
                              type="email"
                              value={brandingForm.contact_email}
                              onChange={(e) => setBrandingForm({...brandingForm, contact_email: e.target.value})}
                              placeholder="info@college.edu"
                              style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: '12px',
                                border: '2px solid #e5e7eb',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#374151',
                                background: 'white',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                              }}
                              onFocus={(e) => e.target.style.borderColor = '#4f7942'}
                              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                            />
                          </div>

                          <div>
                            <label style={{ 
                              display: 'block', 
                              fontSize: '14px', 
                              fontWeight: '700', 
                              color: '#374151', 
                              marginBottom: 8 
                            }}>
                              Contact Phone
                            </label>
                            <input
                              type="tel"
                              value={brandingForm.contact_phone}
                              onChange={(e) => setBrandingForm({...brandingForm, contact_phone: e.target.value})}
                              placeholder="+91 12345 67890"
                              style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: '12px',
                                border: '2px solid #e5e7eb',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#374151',
                                background: 'white',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                              }}
                              onFocus={(e) => e.target.style.borderColor = '#4f7942'}
                              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                            />
                          </div>

                          <div>
                            <label style={{ 
                              display: 'block', 
                              fontSize: '14px', 
                              fontWeight: '700', 
                              color: '#374151', 
                              marginBottom: 8 
                            }}>
                              Year Established
                            </label>
                            <input
                              type="number"
                              value={brandingForm.established_year}
                              onChange={(e) => setBrandingForm({...brandingForm, established_year: e.target.value})}
                              placeholder="1985"
                              min="1800"
                              max={new Date().getFullYear()}
                              style={{
                                width: '100%',
                                padding: '16px 20px',
                                borderRadius: '12px',
                                border: '2px solid #e5e7eb',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#374151',
                                background: 'white',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                              }}
                              onFocus={(e) => e.target.style.borderColor = '#4f7942'}
                              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ marginTop: 40, display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <button
                          onClick={async () => {
                            try {
                              const response = await api.getBlob(`/admin/v2/institutions/${selectedInstitution.id}/branding/preview/`);
                              
                              // Create blob URL and download
                              const blob = new Blob([response.data], { type: 'application/pdf' });
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = `College_Branding_Template_${selectedInstitution.short_code}.pdf`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(url);
                            } catch (err) {
                              alert('Failed to generate preview: ' + (err.response?.data?.error || err.response?.data?.detail || err.message));
                            }
                          }}
                          style={{
                            padding: '16px 32px',
                            borderRadius: '16px',
                            border: '2px solid #4f7942',
                            background: 'white',
                            color: '#4f7942',
                            fontSize: '16px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => {
                            e.target.style.background = '#f8f9fa';
                            e.target.style.transform = 'translateY(-2px)';
                          }}
                          onMouseOut={(e) => {
                            e.target.style.background = 'white';
                            e.target.style.transform = 'translateY(0)';
                          }}
                        >
                          <Award size={20} />
                          Preview PDF Template
                        </button>
                        
                        <button
                          onClick={handleUpdateBranding}
                          style={{
                            padding: '16px 48px',
                            borderRadius: '16px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #4f7942, #2d5016)',
                            color: 'white',
                            fontSize: '16px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            boxShadow: '0 8px 24px rgba(79, 121, 66, 0.3)',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12
                          }}
                          onMouseOver={(e) => {
                            e.target.style.transform = 'translateY(-2px)';
                            e.target.style.boxShadow = '0 12px 32px rgba(79, 121, 66, 0.4)';
                          }}
                          onMouseOut={(e) => {
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = '0 8px 24px rgba(79, 121, 66, 0.3)';
                          }}
                        >
                          <Award size={20} />
                          Save College Branding
                        </button>
                      </div>
                    </div>
                  )}

                  {activeTab === 'staff' && (
                    <div className="animate-fade-in">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 24, flexWrap: 'wrap' }}>
                        <div>
                          <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>Personnel Orchestration</h3>
                          <p style={{ color: 'var(--text-soft)', marginTop: 4 }}>Manage faculty roles and departments.</p>
                        </div>
                        <div style={{ position: 'relative', minWidth: 280 }}>
                          <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)' }} />
                          <input
                            placeholder="Search by name or faculty ID..."
                            value={staffSearch}
                            onChange={e => setStaffSearch(e.target.value)}
                            style={{ width: '100%', padding: '12px 16px 12px 48px', borderRadius: 14, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 600, boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 12px' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--text-soft)', fontSize: '0.9rem', fontWeight: 800 }}>
                              <th style={{ padding: '0 20px' }}>FACULTY</th>
                              <th style={{ padding: '0 20px' }}>DEPARTMENT</th>
                              <th style={{ padding: '0 20px' }}>PROMOTE / ROLE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hubData.staff.filter(s => s.faculty_id !== '0001').filter(s => {
                              if (!staffSearch.trim()) return true;
                              const q = staffSearch.trim().toLowerCase();
                              return s.name.toLowerCase().includes(q) || (s.faculty_id || '').toLowerCase().includes(q);
                            }).map(s => (
                              <tr key={s.id} style={{ background: 'var(--bg-2)' }}>
                                <td style={{ padding: 24, borderRadius: '24px 0 0 24px' }}>
                                  <div style={{ fontWeight: 850, color: 'var(--olive-900)', fontSize: '1.1rem' }}>{s.name}</div>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)', fontWeight: 600 }}>ID: {s.faculty_id}</div>
                                </td>
                                <td style={{ padding: 24 }}>
                                  <select 
                                    value={s.department__id || ''} 
                                    onChange={(e) => updateStaffDept(s.id, e.target.value)}
                                    style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border-soft)', background: 'white', color: 'var(--olive-900)', fontWeight: 700, cursor: 'pointer', width: '100%', maxWidth: 180 }}
                                  >
                                    <option value="">Unassigned</option>
                                    {hubData.departments.map(d => (
                                      <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td style={{ padding: 24, borderRadius: '0 24px 24px 0' }}>
                                  <select 
                                    value={s.role} 
                                    onChange={(e) => updateStaffRole(s.id, e.target.value)}
                                    style={{ padding: '10px 16px', borderRadius: 12, border: '1px solid var(--border-soft)', background: 'white', color: 'var(--olive-900)', fontWeight: 800, cursor: 'pointer', width: '100%', maxWidth: 180 }}
                                  >
                                    <option value="staff">Staff Member</option>
                                    <option value="hod">Dept. Head (HOD)</option>
                                    <option value="tpu">TPU Coordinator</option>
                                    <option value="director">Director</option>
                                    <option value="ja">Junior Admin (JA)</option>
                                    <option value="admin">Node Admin</option>
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {activeTab === 'students' && (
                    <div className="animate-fade-in">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, gap: 24, flexWrap: 'wrap' }}>
                        <div>
                          <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>Enrolled Students</h3>
                          <p style={{ color: 'var(--text-soft)', marginTop: 4 }}>Institutional student roster.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, justifyContent: 'flex-end', minWidth: 400 }}>
                          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
                            <Search size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-soft)' }} />
                            <input 
                              placeholder="Search by name or register..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              style={{ width: '100%', padding: '12px 16px 12px 48px', borderRadius: 14, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 600 }}
                            />
                          </div>
                          <select 
                            value={selectedDeptFilter}
                            onChange={(e) => setSelectedDeptFilter(e.target.value)}
                            style={{ padding: '12px 16px', borderRadius: 14, border: '1px solid var(--border-soft)', background: 'white', fontWeight: 700, color: 'var(--olive-900)', cursor: 'pointer', minWidth: 140 }}
                          >
                            <option value="">All Depts</option>
                            {(hubData.departments || []).map(d => (
                              <option key={d.id} value={d.id}>{d.code}</option>
                            ))}
                          </select>
                          <select 
                            value={selectedBatchFilter}
                            onChange={(e) => setSelectedBatchFilter(e.target.value)}
                            style={{ padding: '12px 16px', borderRadius: 14, border: '1px solid var(--border-soft)', background: 'white', fontWeight: 700, color: 'var(--olive-900)', cursor: 'pointer', minWidth: 120 }}
                          >
                            <option value="">All Batches</option>
                            {(hubData.batches || []).map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                          {selectedBatchFilter && (
                            <button 
                              onClick={handleDeleteBatch}
                              style={{ padding: '12px 16px', borderRadius: 14, border: 'none', background: '#fee2e2', color: '#ef4444', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                              title="Delete Selected Batch"
                            >
                              <Trash2 size={18} /> Delete Batch
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 12px' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--text-soft)', fontSize: '0.9rem', fontWeight: 800 }}>
                              <th style={{ padding: '0 20px' }}>STUDENT</th>
                              <th style={{ padding: '0 20px' }}>REGISTER NO</th>
                              <th style={{ padding: '0 20px' }}>BATCH</th>
                              <th style={{ padding: '0 20px' }}>CONTACT</th>
                              <th style={{ padding: '0 20px' }}>STATUS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(hubData.students || [])
                              .filter(s => !selectedDeptFilter || s.department_id === parseInt(selectedDeptFilter))
                              .filter(s => !selectedBatchFilter || s.batch === selectedBatchFilter)
                              .filter(s => !searchQuery || 
                                (s.name && String(s.name).toLowerCase().includes(searchQuery.toLowerCase())) || 
                                (s.register_number && String(s.register_number).toLowerCase().includes(searchQuery.toLowerCase()))
                              )
                              .map(s => (
                              <tr key={s.id} style={{ background: 'var(--bg-2)' }}>
                                <td style={{ padding: 24, borderRadius: '24px 0 0 24px' }}>
                                  <div style={{ fontWeight: 850, color: 'var(--olive-900)', fontSize: '1.1rem' }}>{s.name}</div>
                                </td>
                                <td style={{ padding: 24 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{s.register_number}</div>
                                </td>
                                <td style={{ padding: 24 }}>
                                  <div style={{ fontWeight: 700, color: 'var(--olive-700)', background: 'white', padding: '4px 12px', borderRadius: 8, display: 'inline-block' }}>{s.batch || 'N/A'}</div>
                                </td>
                                <td style={{ padding: 24 }}>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>{s.personal_email}</div>
                                  <div style={{ fontSize: '0.85rem', color: 'var(--text-soft)' }}>{s.mobile_number}</div>
                                </td>
                                <td style={{ padding: 24, borderRadius: '0 24px 24px 0' }}>
                                  <button 
                                    onClick={() => toggleStudentLock(s.id, s.is_active)}
                                    style={{ 
                                      padding: '10px 16px', 
                                      borderRadius: 12, 
                                      border: 'none', 
                                      background: s.is_active ? 'var(--olive-900)' : '#ef4444', 
                                      color: 'white', 
                                      fontSize: '0.8rem', 
                                      fontWeight: 800, 
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      transition: 'all 0.2s'
                                    }}
                                  >
                                    {s.is_active ? <Unlock size={14} /> : <Lock size={14} />}
                                    {s.is_active ? 'Active' : 'Locked'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {hubData.students.length === 0 && (
                          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-soft)' }}>No students found in this node.</div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === 'departments' && (
                    <div className="animate-fade-in">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                        <div><h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>Structure</h3><p style={{ color: 'var(--text-soft)' }}>Manage organizational units.</p></div>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <input placeholder="CODE" value={newDept.code} onChange={e => setNewDept({...newDept, code: e.target.value})} style={{ width: 80, padding: '14px', borderRadius: 14, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 700 }} />
                          <input placeholder="Name" value={newDept.name} onChange={e => setNewDept({...newDept, name: e.target.value})} style={{ width: 180, padding: '14px', borderRadius: 14, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 700 }} />
                          <button onClick={handleAddDept} className="primary-button" style={{ borderRadius: 14 }}>Add</button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                        {hubData.departments.map(d => (
                          <div key={d.id} style={{ padding: 24, background: 'var(--bg-2)', borderRadius: 24, border: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 800, color: 'var(--olive-900)' }}>{d.name}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>Code: {d.code}</div>
                            </div>
                            <button 
                              onClick={() => handleDeleteDept(d.id)}
                              style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {activeTab === 'settings' && (
                    <div className="animate-fade-in">
                      <div style={{ marginBottom: 32 }}>
                        <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--olive-950)', margin: 0 }}>Node Settings</h3>
                        <p style={{ color: 'var(--text-soft)', marginTop: 4 }}>Control parameters and maintenance locks for this node.</p>
                      </div>
                      
                      <section className="surface-card" style={{ padding: 32, borderRadius: 24, background: 'var(--bg-2)', border: '1px solid var(--border-soft)' }}>
                        <h3 style={{ fontSize: '1.3rem', fontWeight: 900, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}><HardHat className="text-olive-600" /> Control Parameters</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                          {[
                            { label: 'Students', role: 'student', current: hubData.maintenance.student, icon: GraduationCap },
                            { label: 'Staff Members', role: 'staff', current: hubData.maintenance.staff, icon: Briefcase },
                            { label: 'HOD Executive', role: 'hod', current: hubData.maintenance.hod, icon: Award },
                            { label: 'Inst Admin', role: 'inst_admin', current: hubData.maintenance.inst_admin, icon: UserCheck },
                            { label: 'JA Subsystem', role: 'ja', current: hubData.maintenance.ja, icon: Wrench }
                          ].map((p, i) => (
                            <div key={i} style={{ padding: 20, background: 'white', borderRadius: 20, border: '1px solid var(--border-soft)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ background: 'var(--bg-2)', padding: 10, borderRadius: 12 }}>
                                    <p.icon size={20} className="text-olive-600" />
                                  </div>
                                  <span style={{ fontWeight: 800, color: 'var(--olive-900)', fontSize: '1.05rem' }}>{p.label}</span>
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: p.current ? '#ef4444' : '#10b981', background: p.current ? '#fee2e2' : '#dcfce7', padding: '4px 10px', borderRadius: 8 }}>{p.current ? 'LOCKED' : 'ACTIVE'}</span>
                              </div>
                              <button onClick={() => toggleInstMaintenance(p.role, p.current)} style={{ width: '100%', padding: '12px', borderRadius: 12, border: p.current ? '2px solid #ef4444' : 'none', background: p.current ? 'white' : 'var(--olive-900)', color: p.current ? '#ef4444' : 'white', fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s' }}>
                                {p.current ? 'Unlock Access' : 'Lock Access'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODALS */}
        {showCreateModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(10px)' }}>
            <div style={{ background: 'white', borderRadius: 32, padding: 40, width: '90%', maxWidth: 420, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
              <h3 style={{ fontSize: '2rem', fontWeight: 950, marginBottom: 8, color: 'var(--olive-950)' }}>Provision Node</h3>
              <p style={{ color: 'var(--text-soft)', marginBottom: 36 }}>Initialize an isolated institutional environment.</p>
              <div style={{ display: 'grid', gap: 24 }}>
                <input type="number" placeholder="Institution ID" value={newInstitution.institution_id} onChange={(e) => setNewInstitution({ ...newInstitution, institution_id: e.target.value })} style={{ width: '100%', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 600 }} />
                <input type="text" placeholder="Organization Name" value={newInstitution.name} onChange={(e) => setNewInstitution({ ...newInstitution, name: e.target.value })} style={{ width: '100%', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 600 }} />
                <input type="text" placeholder="Identity Code" value={newInstitution.short_code} onChange={(e) => setNewInstitution({ ...newInstitution, short_code: e.target.value })} style={{ width: '100%', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 600 }} />
                <input type="text" placeholder="Address / Location" value={newInstitution.address} onChange={(e) => setNewInstitution({ ...newInstitution, address: e.target.value })} style={{ width: '100%', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 600 }} />
                <input type="email" placeholder="Contact Email" value={newInstitution.contact_email} onChange={(e) => setNewInstitution({ ...newInstitution, contact_email: e.target.value })} style={{ width: '100%', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 600 }} />
                <input type="text" placeholder="Contact Phone" value={newInstitution.contact_phone} onChange={(e) => setNewInstitution({ ...newInstitution, contact_phone: e.target.value })} style={{ width: '100%', padding: '16px 20px', borderRadius: 16, border: '1px solid var(--border-soft)', background: 'var(--bg-2)', fontWeight: 600 }} />
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 40 }}>
                <button onClick={() => setShowCreateModal(false)} style={{ flex: 1, padding: '18px', borderRadius: 18, border: '1px solid var(--border-soft)', background: 'white', cursor: 'pointer', fontWeight: 800 }}>Cancel</button>
                <button onClick={handleCreateInstitution} className="primary-button" style={{ flex: 1, borderRadius: 18, fontWeight: 800 }}>Start Provisioning</button>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(10px)' }}>
            <div style={{ background: 'white', borderRadius: 36, padding: 48, width: '90%', maxWidth: 480, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '2px solid #ef4444' }}>
              <div style={{ width: 80, height: 80, background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', marginBottom: 24, margin: '0 auto' }}>
                <Trash2 size={40} />
              </div>
              <h3 style={{ fontSize: '1.8rem', fontWeight: 950, textAlign: 'center', marginBottom: 12 }}>Destroy Node?</h3>
              <p style={{ color: 'var(--text-soft)', textAlign: 'center', marginBottom: 36 }}>
                You are about to permanently delete <strong>{showDeleteConfirm.name}</strong>. 
                This will destroy all databases, student records, and faculty accounts linked to this node.
              </p>
              <div style={{ display: 'flex', gap: 16 }}>
                <button onClick={() => setShowDeleteConfirm(null)} style={{ flex: 1, padding: '18px', borderRadius: 18, border: '1px solid var(--border-soft)', background: 'white', fontWeight: 800 }}>Abort</button>
                <button onClick={() => handleDeleteInstitution(showDeleteConfirm.id)} style={{ flex: 1, padding: '18px', borderRadius: 18, border: 'none', background: '#ef4444', color: 'white', fontWeight: 800 }}>Yes, Destroy</button>
              </div>
            </div>
          </div>
        )}

        {confirmState.show && (
          <DoubleConfirmModal 
            show={confirmState.show}
            m1={confirmState.m1}
            m2={confirmState.m2}
            firstOk={confirmState.firstOk}
            setFirstOk={(val) => setConfirmState(prev => ({ ...prev, firstOk: val }))}
            onConfirm={async () => {
              const cb = confirmState.onConfirm;
              setConfirmState(prev => ({ ...prev, show: false }));
              if (cb) await cb();
            }}
            onCancel={() => setConfirmState(prev => ({ ...prev, show: false }))}
          />
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
