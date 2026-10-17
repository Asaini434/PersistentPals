import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  return (
    <aside className="app-sidebar">
      <nav className="sidebar-nav">
        <NavLink 
          to="/logs/patient-list" 
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          Patient Logs List
        </NavLink>
        <NavLink 
          to="/patients/PT-1001" 
          className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
        >
          Patient Detail
        </NavLink>
      </nav>
    </aside>
  );
}
