import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, PRESET_CREDENTIALS } from '../../context/AuthContext';

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

  const handleFillCredentials = (role) => {
    setActiveTab(role);
    setLocalError('');
    if (role === 'admin') {
      setFormData({
        email: PRESET_CREDENTIALS.admin.email,
        password: PRESET_CREDENTIALS.admin.password,
      });
    } else {
      setFormData({
        email: PRESET_CREDENTIALS.provider.email,
        password: PRESET_CREDENTIALS.provider.password,
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);

    if (!formData.email.trim() || !formData.password.trim()) {
      setLocalError('Please enter both email and password.');
      setLoading(false);
      return;
    }

    const result = login(formData.email, formData.password);
    setLoading(false);

    if (result.success) {
      if (result.role === 'admin') {
        navigate('/admin/providers', { replace: true });
      } else {
        navigate('/logs/patient-list', { replace: true });
      }
    } else {
      setLocalError(result.error);
    }
  };

  return (
    <div className="auth-card-wrapper">
      <div className="auth-page">
        <div className="auth-header">
          <div className="auth-badge-row">
            <span className="badge badge-treatment">RESTRICTED ACCESS</span>
            <span className="pill pill-active">HEALTHCARE OS</span>
          </div>
          <h2>Sign In to ReflectX</h2>
          <p className="subtitle" style={{ textAlign: 'center', marginBottom: '20px' }}>
            Select your portal to authenticate with role-restricted credentials
          </p>
        </div>

        {/* Portal Role Selector Tabs */}
        <div className="role-selector-tabs">
          <button
            type="button"
            className={`role-tab ${activeTab === 'provider' ? 'active' : ''}`}
            onClick={() => handleFillCredentials('provider')}
          >
            <div className="role-tab-title">Provider Portal</div>
            <div className="role-tab-subtitle">Doctors & Clinicians</div>
          </button>
          <button
            type="button"
            className={`role-tab ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => handleFillCredentials('admin')}
          >
            <div className="role-tab-title">Admin Portal</div>
            <div className="role-tab-subtitle">Staff & Compliance</div>
          </button>
        </div>

        {/* Quick Credentials Info Card */}
        <div className="credentials-helper-card">
          <div className="helper-header">
            <span>
              Preset Credentials ({activeTab === 'admin' ? 'Admin Portal' : 'Provider Portal'})
            </span>
          </div>
          <div className="helper-body">
            <div>
              <strong>Email:</strong>{' '}
              <code>{activeTab === 'admin' ? PRESET_CREDENTIALS.admin.email : PRESET_CREDENTIALS.provider.email}</code>
            </div>
            <div>
              <strong>Password:</strong>{' '}
              <code>{activeTab === 'admin' ? PRESET_CREDENTIALS.admin.password : PRESET_CREDENTIALS.provider.password}</code>
            </div>
          </div>
          <button
            type="button"
            className="btn-quick-fill"
            onClick={() => handleFillCredentials(activeTab)}
          >
            Auto-Fill These Credentials
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
            {loading ? 'Authenticating...' : `Enter ${activeTab === 'admin' ? 'Admin' : 'Provider'} Portal →`}
          </button>
        </form>

        <div className="auth-footer-note">
          <p>
            🔒 Enforcing Strict Role-Based Separation. Admin credentials can only access the Providers Chain, and Provider credentials can only access the Patients Chain.
          </p>
        </div>
      </div>
    </div>
  );
}
