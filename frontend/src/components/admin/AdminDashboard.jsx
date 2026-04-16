// Admin Dashboard - System Administration
// Features: Create Institution, Manage Permissions, Lock Departments

import { useState } from 'react';
import { Building2, Lock, Unlock, Plus, Shield, Users } from 'lucide-react';

const AdminDashboard = ({ onSelectInstitution }) => {
  const [activeTab, setActiveTab] = useState('institutions');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [lockedDepartments, setLockedDepartments] = useState([]);

  // Mock institutions data
  const [institutions, setInstitutions] = useState([
    { id: 1, institution_id: 9536, name: 'Ramco Institute of Technology', short_code: 'RIT', is_active: true },
  ]);

  // Mock departments
  const departments = [
    { code: '243', name: 'AD', locked: lockedDepartments.includes('243') },
    { code: '103', name: 'Civil', locked: lockedDepartments.includes('103') },
    { code: '105', name: 'EEE', locked: lockedDepartments.includes('105') },
    { code: '205', name: 'IT', locked: lockedDepartments.includes('205') },
    { code: '244', name: 'CSBS', locked: lockedDepartments.includes('244') },
    { code: '106', name: 'ECE', locked: lockedDepartments.includes('106') },
    { code: '104', name: 'CSE', locked: lockedDepartments.includes('104') },
    { code: '114', name: 'Mech', locked: lockedDepartments.includes('114') },
  ];

  const [newInstitution, setNewInstitution] = useState({
    institution_id: '',
    name: '',
    short_code: '',
  });

  const handleCreateInstitution = () => {
    if (newInstitution.institution_id && newInstitution.name) {
      setInstitutions([...institutions, {
        id: institutions.length + 1,
        ...newInstitution,
        is_active: true,
      }]);
      setShowCreateModal(false);
      setNewInstitution({ institution_id: '', name: '', short_code: '' });
    }
  };

  const toggleDepartmentLock = (code) => {
    if (lockedDepartments.includes(code)) {
      setLockedDepartments(lockedDepartments.filter(d => d !== code));
    } else {
      setLockedDepartments([...lockedDepartments, code]);
    }
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin Dashboard</h1>
          <p>System Administration - Manage institutions and permissions</p>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: '#39482a',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            <Plus size={18} />
            Create Institution
          </button>

          <button
            onClick={() => setShowPermissionModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 20px',
              background: 'rgba(57, 72, 42, 0.1)',
              color: '#39482a',
              border: '1px solid rgba(57, 72, 42, 0.2)',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            <Shield size={18} />
            Manage Permissions
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, borderBottom: '1px solid rgba(57, 72, 42, 0.1)', paddingBottom: 8 }}>
          {['institutions', 'departments', 'staff'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: activeTab === tab ? 'rgba(57, 72, 42, 0.1)' : 'transparent',
                color: activeTab === tab ? '#39482a' : '#666',
                fontWeight: activeTab === tab ? 500 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ padding: 20, background: 'rgba(57, 72, 42, 0.02)', borderRadius: 8 }}>
          {activeTab === 'institutions' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Institutions</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {institutions.map((inst) => (
                  <div
                    key={inst.id}
                    style={{
                      padding: 16,
                      background: 'white',
                      borderRadius: 8,
                      border: '1px solid rgba(57, 72, 42, 0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{inst.name}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666', marginTop: 4 }}>
                        ID: {inst.institution_id} | Code: {inst.short_code}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: 4,
                        fontSize: '0.8rem',
                        background: inst.is_active ? '#d4e8d9' : '#f8d7da',
                        color: inst.is_active ? '#4f8b62' : '#dc3545',
                      }}
                    >
                      {inst.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'departments' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Departments</h3>
              <p style={{ color: 'var(--text-soft)', marginBottom: 16 }}>
                Click the lock icon to lock/unlock departments for editing.
              </p>
              <div style={{ display: 'grid', gap: 12 }}>
                {departments.map((dept) => (
                  <div
                    key={dept.code}
                    style={{
                      padding: 16,
                      background: 'white',
                      borderRadius: 8,
                      border: '1px solid rgba(57, 72, 42, 0.1)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Building2 size={20} color="#39482a" />
                      <div>
                        <div style={{ fontWeight: 500 }}>{dept.name}</div>
                        <div style={{ fontSize: '0.85rem', color: '#666' }}>
                          Code: {dept.code}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleDepartmentLock(dept.code)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: dept.locked ? '#f8d7da' : '#d4e8d9',
                        color: dept.locked ? '#dc3545' : '#4f8b62',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                      }}
                    >
                      {dept.locked ? <Lock size={14} /> : <Unlock size={14} />}
                      {dept.locked ? 'Locked' : 'Unlocked'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'staff' && (
            <div>
              <h3 style={{ marginBottom: 16 }}>Staff Management</h3>
              <div style={{ marginTop: 24, textAlign: 'center', color: '#999', padding: 40 }}>
                <Users size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                <p>Staff management coming soon...</p>
              </div>
            </div>
          )}
        </div>

        {/* Create Institution Modal */}
        {showCreateModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              background: 'white',
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 400,
            }}>
              <h3 style={{ marginBottom: 20 }}>Create Institution</h3>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: 6 }}>
                    Institution ID
                  </label>
                  <input
                    type="number"
                    value={newInstitution.institution_id}
                    onChange={(e) => setNewInstitution({ ...newInstitution, institution_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(57, 72, 42, 0.2)',
                      fontSize: '0.95rem',
                    }}
                    placeholder="e.g., 9536"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: 6 }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={newInstitution.name}
                    onChange={(e) => setNewInstitution({ ...newInstitution, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(57, 72, 42, 0.2)',
                      fontSize: '0.95rem',
                    }}
                    placeholder="Institution Name"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: 6 }}>
                    Short Code
                  </label>
                  <input
                    type="text"
                    value={newInstitution.short_code}
                    onChange={(e) => setNewInstitution({ ...newInstitution, short_code: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(57, 72, 42, 0.2)',
                      fontSize: '0.95rem',
                    }}
                    placeholder="e.g., RIT"
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: '1px solid rgba(57, 72, 42, 0.2)',
                    background: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateInstitution}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#39482a',
                    color: 'white',
                    cursor: 'pointer',
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Permission Modal */}
        {showPermissionModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              background: 'white',
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 400,
            }}>
              <h3 style={{ marginBottom: 16 }}>Manage Permissions</h3>
              <p style={{ color: '#666', marginBottom: 20 }}>
                Lock departments to prevent staff from making changes.
              </p>
              <div style={{ display: 'grid', gap: 12, maxHeight: 300, overflowY: 'auto' }}>
                {departments.map((dept) => (
                  <div
                    key={dept.code}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      background: 'rgba(57, 72, 42, 0.04)',
                      borderRadius: 8,
                    }}
                  >
                    <span>{dept.name}</span>
                    <button
                      onClick={() => toggleDepartmentLock(dept.code)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: 'none',
                        background: lockedDepartments.includes(dept.code) ? '#f8d7da' : '#d4e8d9',
                        color: lockedDepartments.includes(dept.code) ? '#dc3545' : '#4f8b62',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      {lockedDepartments.includes(dept.code) ? 'Locked' : 'Unlocked'}
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowPermissionModal(false)}
                style={{
                  width: '100%',
                  marginTop: 20,
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#39482a',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
