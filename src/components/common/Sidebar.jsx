import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MOCK_PROVIDERS } from '../../data/mockProviders';
import { MOCK_PATIENTS } from '../../data/mockPatients';

export default function Sidebar() {
  const { isAdmin, isProvider, user } = useAuth();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-role-indicator">
        <span className="sidebar-role-title">
          {isAdmin ? 'Practice Admin Console' : 'Clinician Station'}
        </span>
        <span className="sidebar-user-name">{user?.name || 'Mental Health Clinician'}</span>
      </div>

      <nav className="sidebar-nav">
        {isAdmin && (
          <>
            <div className="sidebar-section-label">Main Navigation</div>
            <NavLink
              to="/admin/providers"
              end
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              👥 Clinicians Directory
            </NavLink>

            <div className="sidebar-section-label" style={{ marginTop: '16px' }}>
              All Clinicians ({MOCK_PROVIDERS.length})
            </div>
            <div className="sidebar-sub-list">
              {MOCK_PROVIDERS.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/admin/providers/${p.id}`}
                  className={({ isActive }) => (isActive ? 'nav-item-sub active' : 'nav-item-sub')}
                >
                  <span className="sub-dot"></span>
                  <div className="sub-text-wrapper">
                    <span className="sub-name">{p.name}</span>
                    <span className="sub-role">{p.department}</span>
                  </div>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {isProvider && (
          <>
            <div className="sidebar-section-label">Therapy & Caseload</div>
            <NavLink
              to="/logs/patient-list"
              end
              className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            >
              📋 Client Directory & Logs
            </NavLink>

            <div className="sidebar-section-label" style={{ marginTop: '16px' }}>
              Active Clients ({MOCK_PATIENTS.length})
            </div>
            <div className="sidebar-sub-list">
              {MOCK_PATIENTS.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/patients/${p.id}`}
                  className={({ isActive }) => (isActive ? 'nav-item-sub active' : 'nav-item-sub')}
                >
                  <span className="sub-dot"></span>
                  <div className="sub-text-wrapper">
                    <span className="sub-name">{p.name}</span>
                    <span className="sub-role">{p.status}</span>
                  </div>
                </NavLink>
              ))}
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}
