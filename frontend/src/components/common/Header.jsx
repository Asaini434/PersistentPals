import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function Header() {
  const { user, isAuthenticated, isAdmin, isProvider, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="app-header-container">
      {/* Top Utility Bar */}
      <div className="top-utility-bar">
        <div className="utility-links">
          <span>REFLECT XR | IMMERSIVE WELLNESS & CLINICAL LOGS</span>
        </div>
        <div className="utility-links-right">
          {isAuthenticated && (
            <span className="user-indicator">
              Logged in as: <strong>{user?.name}</strong> ({user?.role?.toUpperCase()})
            </span>
          )}
          <span className="divider">|</span>
          <a href="#employees">Employees</a>
          <span className="divider">|</span>
          <a href="#careers">Careers</a>
        </div>
      </div>

      {/* Main Floating Navbar */}
      <div className="main-navbar-wrapper">
        <nav className="floating-navbar">
          <div className="header-brand">
            <Link to={isAdmin ? '/admin/providers' : '/logs/patient-list'} className="brand-link">
              <div className="brand-logo-icon">
                {/* SVG Tree / Neural Icon */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </div>
              <div className="brand-text">
                <span className="brand-company">PERSISTENT</span>
                <span className="brand-sub">TECHNOLOGY</span>
              </div>
            </Link>

            {/* Role Badge Indicator */}
            {isAuthenticated && (
              <span className={`portal-tag-badge ${isAdmin ? 'portal-tag-admin' : 'portal-tag-provider'}`}>
                {isAdmin ? 'ADMIN PORTAL' : 'PROVIDER PORTAL'}
              </span>
            )}
          </div>

          {/* Center Navigation Links: Rendered strictly according to role */}
          <div className="header-nav-center">
            {isAdmin ? (
              <>
                <NavLink
                  to="/admin/providers"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
                  PROVIDERS DIRECTORY
                </NavLink>
              </>
            ) : isProvider ? (
              <>
                <NavLink
                  to="/logs/patient-list"
                  className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                >
                  PATIENT LIST & LOGS
                </NavLink>
              </>
            ) : null}
          </div>

          {/* Right Nav Actions */}
          <div className="header-nav-right">
            {isAuthenticated ? (
              <>
                <button
                  type="button"
                  className="btn-nav-outline btn-logout"
                  onClick={handleLogout}
                >
                  LOG OUT
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-nav-primary">
                  LOG IN
                </Link>
                <Link to="/signup" className="btn-nav-outline">
                  SIGN UP
                </Link>
              </>
            )}

            <div className="reflect-xr-badge">
              <span className="badge-title">REFLECT XR</span>
              <span className="badge-sub">BY PERSISTENT</span>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
