import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { providerService } from '../../services/providerService';
import ProviderTimeLog from '../../components/activity/ProviderTimeLog';

/**
 * Provider: My Profile
 * Backed by GET /providers?providerId= and GET /providers/{provider_id}/patients.
 */
export default function MyProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      providerService.getProfile(user.id),
      providerService.getPatients(user.id),
    ])
      .then(([profileData, patientsData]) => {
        if (active) {
          setProfile(profileData);
          setPatients(patientsData || []);
        }
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load your profile.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const getStatusBadgeClass = (status) => {
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

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h2>My Profile</h2>
          <p className="subtitle">Your clinician account, time log and current caseload</p>
        </div>
      </header>

      {loading && <div className="table-info-banner">Loading your profile…</div>}
      {error && (
        <div className="auth-error-banner" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && profile && (
        <>
          <div className="patient-card-header">
            <div className="patient-title-group">
              <h2>{profile.name}</h2>
              <span className="pill pill-active" style={{ fontSize: '0.75rem' }}>
                {profile.title}
              </span>
            </div>
            <div className="patient-quick-meta">
              <span>
                <strong>Specialty:</strong> {profile.specialty || 'Not specified'}
              </span>
              <span>
                <strong>Username:</strong> {profile.username}
              </span>
              <span>
                <strong>Email:</strong> {profile.email}
              </span>
              <span>
                <strong>Last Login:</strong> {profile.last_login_at ? new Date(profile.last_login_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Never'}
              </span>
            </div>
          </div>

          <section className="detail-section">
            <h3>Caseload Overview</h3>
            <div className="vitals-grid">
              <div className="vital-card">
                <span className="vital-label">Active Clients</span>
                <span className="vital-value">{profile.active_patient_count}</span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Account Created</span>
                <span className="vital-value" style={{ fontSize: '1rem' }}>{profile.date_created ? new Date(profile.date_created).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown'}</span>
              </div>
            </div>
          </section>

          {/* Same time log the admin sees for this provider */}
          <ProviderTimeLog loadActivity={(date, tz) => providerService.getActivity(user.id, { date, tz })} />

          <section className="detail-section card">
            <h3>My Assigned Clients</h3>
            {!patients.length ? (
              <p style={{ color: 'var(--text-muted)', padding: '16px 0' }}>
                No active clients currently assigned to you.
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
                    {patients.map((patient) => (
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
                          <span className={getStatusBadgeClass(patient.status)}>
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
        </>
      )}
    </div>
  );
}