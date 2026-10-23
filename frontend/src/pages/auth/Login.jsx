import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * Modern Role-Based Login Component
 * Supports separate Admin and Provider credentials
 */
export default function Login() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [activeTab, setActiveTab] = useState('provider'); // 'provider' or 'admin'
  const [localError, setLocalError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setLocalError('');
  };

  const handleSelectRole = (role) => {
    setActiveTab(role);
    setLocalError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!formData.email.trim() || !formData.password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await login(formData.email, formData.password);
      if (result.success) {
        if (result.role === 'admin') {
          navigate('/admin/providers', { replace: true });
        } else {
          navigate('/logs/patient-list', { replace: true });
        }
      } else {
        setLocalError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card-wrapper">
      <div className="auth-page">
        <div className="auth-header">
          <div className="auth-brand-badge">
            <span className="brand-logo-icon" style={{ color: '#f43f5e', display: 'inline-flex', verticalAlign: 'middle', marginRight: '6px' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </span>
            <span style={{ fontWeight: 800, letterSpacing: '0.08em', color: '#ffffff' }}>REFLECT XR</span>
          </div>

          <div className="auth-badge-row" style={{ marginTop: '10px' }}>
            <span className="badge badge-treatment">CONFIDENTIAL ACCESS</span>
            <span className="pill pill-active">MENTAL HEALTH OS</span>
          </div>
          <h2 style={{ marginTop: '12px' }}>Sign In to ReflectX</h2>
          <p className="subtitle" style={{ textAlign: 'center', marginBottom: '20px' }}>
            Immersive mental wellness & therapy portal. Select your role to authenticate.
          </p>
        </div>

        {/* Portal Role Selector Tabs */}
        <div className="role-selector-tabs">
          <button
            type="button"
            className={`role-tab ${activeTab === 'provider' ? 'active' : ''}`}
            onClick={() => handleSelectRole('provider')}
          >
            <div className="role-tab-title">Clinician Portal</div>
            <div className="role-tab-subtitle">Therapists & Psychologists</div>
          </button>
          <button
            type="button"
            className={`role-tab ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => handleSelectRole('admin')}
          >
            <div className="role-tab-title">Practice Portal</div>
            <div className="role-tab-subtitle">Operations & Compliance</div>
          </button>
        </div>

        {localError && (
          <div className="auth-error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <span>{localError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="e.g. provider@reflectx.com or admin@reflectx.com"
              required
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter your security password"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', marginTop: '12px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : `Enter ${activeTab === 'admin' ? 'Practice' : 'Clinician'} Portal →`}
          </button>
        </form>

        <div className="auth-footer-note">
          <p>
            🔒 Enforcing Strict HIPAA & HITECH Client Confidentiality. Clinician credentials access Client Therapy Tracks; Admin credentials access the Clinicians Directory.
          </p>
        </div>
      </div>
    </div>
  );
}