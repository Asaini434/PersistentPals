import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import ProviderTimeLog from '../../components/activity/ProviderTimeLog';
import { CaseloadEngagement } from '../../components/activity/AppActivityPanels';

/**
 * Admin: Clinician Detail Page
 * Backed by GET /admin/providers/{provider_id}, with GET /admin/providers
 * supplying the roster used for the prev/next switcher.
 */
export default function AdminProviderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [roster, setRoster] = useState([]);
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    adminService
      .getProviders()
      .then((data) => {
        if (active) setRoster(data || []);
      })
      .catch(() => {
        /* roster is a nice-to-have for the switcher; detail fetch below reports errors */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    setError('');
    adminService
      .getProviderById(id)
      .then((data) => {
        if (active) setProvider(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load this clinician record.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const fmtDateTime = (value) =>
    value
      ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'None';

  const getPatientStatusBadgeClass = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'active':
        return 'badge badge-treatment';
      case 'chronic':
        return 'badge badge-observation';
      case 'resolved':
        return 'badge badge-discharged';
      default:
        return 'badge';
    }
  };

  const currentIndex = roster.findIndex((p) => p.id === id);
  const prevProvider = roster.length ? roster[(currentIndex - 1 + roster.length) % roster.length] : null;
  const nextProvider = roster.length ? roster[(currentIndex + 1) % roster.length] : null;

  if (loading) {
    return (
      <div className="page-container patient-detail-page">
        <div className="table-info-banner">Loading clinician record…</div>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="page-container patient-detail-page">
        <Link to="/admin/providers" className="btn-back">
          <span className="back-arrow">←</span> Back to Clinicians Directory
        </Link>
        <div className="auth-error-banner" role="alert" style={{ marginTop: '16px' }}>
          <span className="error-icon">⚠️</span>
          <span>{error || 'Clinician not found.'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container patient-detail-page">
      {/* Top Navigation Row */}
      <div className="detail-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Link to="/admin/providers" className="btn-back">
          <span className="back-arrow">←</span> Back to Clinicians Directory
        </Link>

        {prevProvider && nextProvider && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              onClick={() => navigate(`/admin/providers/${prevProvider.id}`)}
              title={`Switch to ${prevProvider.name}`}
            >
              ← Prev ({prevProvider.name.split(' ')[0]})
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 14px' }}
              onClick={() => navigate(`/admin/providers/${nextProvider.id}`)}
              title={`Switch to ${nextProvider.name}`}
            >
              Next ({nextProvider.name.split(' ')[0]}) →
            </button>
          </div>
        )}
      </div>

      {/* Quick All-Clinicians Switcher Bar */}
      {roster.length > 1 && (
        <div className="provider-switcher-container">
          <span className="switcher-label">Switch Clinician Overview:</span>
          <div className="switcher-pills">
            {roster.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`switcher-pill ${p.id === provider.id ? 'active' : ''}`}
                onClick={() => navigate(`/admin/providers/${p.id}`)}
              >
                <span className="switcher-pill-name">{p.name}</span>
                <span className="switcher-pill-dept">{p.specialty || p.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clinician Header Banner */}
      <div className="patient-card-header" style={{ marginTop: '20px' }}>
        <div className="patient-title-group">
          <h2>{provider.name}</h2>
          <span className="pill pill-active" style={{ fontSize: '0.75rem' }}>
            {provider.title}
          </span>
        </div>

        <div className="patient-quick-meta">
          <span>
            <strong>Specialty:</strong> {provider.specialty || 'Not specified'}
          </span>
          <span>
            <strong>Username:</strong> {provider.username}
          </span>
          <span>
            <strong>Email:</strong> {provider.email}
          </span>
          <span>
            <strong>Account Created:</strong> {provider.date_created ? new Date(provider.date_created).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'}
          </span>
        </div>
      </div>

      {/* Clinical Metrics Summary Grid */}
      <section className="detail-section">
        <h3>Caseload & Account Activity</h3>
        <div className="vitals-grid">
          <div className="vital-card">
            <span className="vital-label">Active Clients</span>
            <span className="vital-value">{provider.active_patient_count}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Last Login</span>
            <span className="vital-value" style={{ fontSize: '1rem' }}>{provider.last_login_at ? fmtDateTime(provider.last_login_at) : 'Never'}</span>
          </div>
        </div>
      </section>

      {/* Day view and last 30 days: the same time log the provider sees on My Profile */}
      <ProviderTimeLog
        key={id}
        loadActivity={async (date, tz) => ({
          day: await adminService.getProviderActivity(id, { date, tz }),
          period: provider.activity,
        })}
      />

      {/* How this provider's clients use the apps (counts and times only, no notes) */}
      <CaseloadEngagement providerId={id} title="Client App Engagement" />

      {/* Assigned Clients Table */}
      <section className="detail-section card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, border: 'none' }}>Assigned Clients</h3>
          <span className="pill pill-active">
            {provider.patients?.length || 0} Active
          </span>
        </div>

        {!provider.patients?.length ? (
          <p style={{ color: 'var(--text-muted)', padding: '16px 0' }}>
            No active clients currently assigned to this clinician.
          </p>
        ) : (
          <div className="patient-table-container" style={{ marginTop: '12px' }}>
            <table className="patient-table" style={{ fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Condition Since</th>
                </tr>
              </thead>
              <tbody>
                {provider.patients.map((patient) => (
                  <tr
                    key={patient.id}
                    className="clickable-provider-row"
                    onClick={() => navigate(`/patients/${patient.id}`)}
                  >
                    <td>
                      <strong>{patient.name}</strong>
                      <div className="sub-text" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{patient.id}</div>
                    </td>
                    <td style={{ maxWidth: '240px' }}>{patient.condition || 'Not recorded'}</td>
                    <td>
                      <span className={getPatientStatusBadgeClass(patient.status)}>
                        {patient.status || 'No record'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {patient.condition_since || 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}