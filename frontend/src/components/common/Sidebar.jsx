import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminService } from '../../services/adminService';
import { patientService } from '../../services/patientService';

export default function Sidebar() {
  const { isAdmin, isProvider, user } = useAuth();
  const [providers, setProviders] = useState([]);
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    adminService
      .getProviders()
      .then((data) => {
        if (active) setProviders(data || []);
      })
      .catch(() => {
        /* nav sub-list is a nice-to-have; failures are silent here */
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isProvider) return;
    let active = true;
    patientService
      .getPatientLogs()
      .then((data) => {
        if (active) setPatients(data || []);
      })
      .catch(() => {
        /* nav sub-list is a nice-to-have; failures are silent here */
      });
    return () => {
      active = false;
    };
  }, [isProvider]);

  return (
    <aside className="app-sidebar">
      <div className="sidebar-role-indicator">
        <span className="sidebar-role-title">
          {isAdmin ? 'Practice Admin Console' : 'Clinician Station'}
        </span>
        <span className="sidebar-user-name">{user?.name || 'Mental Health Clinician'}</span>
      </div>

      <nav className="sidebar-nav">
        <NavLink to="/home" className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
          🏠 Home
        </NavLink>
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
              All Clinicians ({providers.length})
            </div>
            <div className="sidebar-sub-list">
              {providers.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/admin/providers/${p.id}`}
                  className={({ isActive }) => (isActive ? 'nav-item-sub active' : 'nav-item-sub')}
                >
                  <span className="sub-dot"></span>
                  <div className="sub-text-wrapper">
                    <span className="sub-name">{p.name}</span>
                    <span className="sub-role">{p.specialty || p.title}</span>
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
              Active Clients ({patients.length})
            </div>
            <div className="sidebar-sub-list">
              {patients.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/patients/${p.id}`}
                  className={({ isActive }) => (isActive ? 'nav-item-sub active' : 'nav-item-sub')}
                >
                  <span className="sub-dot"></span>
                  <div className="sub-text-wrapper">
                    <span className="sub-name">{p.name}</span>
                    <span className="sub-role">{p.status || 'No record'}</span>
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