import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { patientService } from '../../services/patientService';

/**
 * Client Detail Page
 * Backed by GET /patients/{patient_id}, with GET /logs/patient-list
 * supplying the roster used for the prev/next switcher.
 */
export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [roster, setRoster] = useState([]);
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    patientService
      .getPatientLogs()
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
    patientService
      .getPatientById(id)
      .then((data) => {
        if (active) setPatient(data);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load this client record.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

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

  const currentIndex = roster.findIndex((p) => p.id === id);
  const prevPatient = roster.length ? roster[(currentIndex - 1 + roster.length) % roster.length] : null;
  const nextPatient = roster.length ? roster[(currentIndex + 1) % roster.length] : null;

  if (loading) {
    return (
      <div className="page-container patient-detail-page">
        <div className="table-info-banner">Loading client record…</div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="page-container patient-detail-page">
        <Link to="/logs/patient-list" className="btn-back">
          <span className="back-arrow">←</span> Back to Client Directory
        </Link>
        <div className="auth-error-banner" role="alert" style={{ marginTop: '16px' }}>
          <span className="error-icon">⚠️</span>
          <span>{error || 'Client not found.'}</span>
        </div>
      </div>
    );
  }

  const latestStatus = patient.medical_history?.[0]?.status;

  return (
    <div className="page-container patient-detail-page">
      {/* Top Navigation Bar */}
      <div className="detail-top-nav">
        <Link to="/logs/patient-list" className="btn-back">
          <span className="back-arrow">←</span> Back to Client Directory
        </Link>

        {prevPatient && nextPatient && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '8px 16px' }}
              onClick={() => navigate(`/patients/${prevPatient.id}`)}
              title={`Switch to ${prevPatient.name}`}
            >
              ← Prev ({prevPatient.name.split(' ')[0]})
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: '0.8rem', padding: '8px 16px' }}
              onClick={() => navigate(`/patients/${nextPatient.id}`)}
              title={`Switch to ${nextPatient.name}`}
            >
              Next ({nextPatient.name.split(' ')[0]}) →
            </button>
          </div>
        )}
      </div>

      {/* Client Switcher Bar */}
      {roster.length > 1 && (
        <div className="provider-switcher-container">
          <span className="switcher-label">Switch Client Overview:</span>
          <div className="switcher-pills">
            {roster.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`switcher-pill ${p.id === patient.id ? 'active' : ''}`}
                onClick={() => navigate(`/patients/${p.id}`)}
              >
                <span className="switcher-pill-name">{p.name}</span>
                <span className="switcher-pill-dept">{p.status || 'No record'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Client Header Banner */}
      <div className="client-hero-card">
        <div className="client-hero-top">
          <div className="client-identity">
            <div className="client-avatar-ring">
              <span className="client-avatar-initials">
                {patient.name.split(' ').map((n) => n[0]).join('')}
              </span>
            </div>
            <div>
              <div className="client-title-row">
                <h2>{patient.name}</h2>
                <span className="patient-id-tag" style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{patient.id}</span>
                {latestStatus && (
                  <span className={getStatusBadgeClass(latestStatus)}>{latestStatus}</span>
                )}
              </div>
              <p className="client-care-track-text">
                {patient.providers?.length
                  ? `Assigned to ${patient.providers.map((p) => p.name).join(', ')}`
                  : 'No provider currently assigned'}
              </p>
            </div>
          </div>

          <div className="client-meta-box">
            <div className="client-meta-item">
              <span className="meta-label">Phone</span>
              <span className="meta-value">{patient.phone || 'Not on file'}</span>
            </div>
            <div className="client-meta-item">
              <span className="meta-label">Email</span>
              <span className="meta-value">{patient.email || 'Not on file'}</span>
            </div>
            <div className="client-meta-item">
              <span className="meta-label">Date of Birth</span>
              <span className="meta-value">{patient.date_of_birth || 'Not on file'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overview Stats Row */}
      <section className="detail-section" style={{ marginTop: '24px' }}>
        <div className="section-title-row">
          <h3>Client Overview</h3>
        </div>
        <div className="vitals-grid">
          <div className="vital-card">
            <span className="vital-label">Age</span>
            <span className="vital-value">{patient.age != null ? patient.age : 'N/A'}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Gender</span>
            <span className="vital-value">{patient.gender || 'Unspecified'}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Assigned Providers</span>
            <span className="vital-value">{patient.providers?.length || 0}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Medical History Entries</span>
            <span className="vital-value">{patient.medical_history?.length || 0}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Clinical Sessions</span>
            <span className="vital-value">{patient.clinical_sessions?.length || 0}</span>
          </div>
        </div>
      </section>

      {/* Main Details Grid */}
      <div className="detail-layout">
        {/* Left Column: Medical History & Sessions */}
        <div className="detail-column main-col">
          <section className="detail-section card">
            <div className="profile-card-header">
              <div>
                <h3>Medical History</h3>
                <p className="profile-subtitle">Conditions on record for this client</p>
              </div>
            </div>

            {!patient.medical_history?.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No medical history recorded.</p>
            ) : (
              <div className="profile-section-group" style={{ marginBottom: 0 }}>
                {patient.medical_history.map((entry, idx) => (
                  <div key={idx} className="narrative-history-box" style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong>{entry.condition}</strong>
                      <span className={getStatusBadgeClass(entry.status)}>{entry.status}</span>
                    </div>
                    <div className="sub-text" style={{ marginBottom: '4px' }}>
                      Onset: {entry.onset_date || 'Unknown'} • Recorded: {entry.date_created}
                    </div>
                    {entry.notes && <p style={{ margin: 0 }}>{entry.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="detail-section card">
            <div className="profile-card-header">
              <div>
                <h3>App Sessions</h3>
                <p className="profile-subtitle">Reflect XR / Reflect Mobile module usage</p>
              </div>
            </div>
            {!patient.sessions?.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No app sessions recorded.</p>
            ) : (
              <div className="patient-table-container">
                <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Platform</th>
                      <th>Date</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patient.sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.application_name}</td>
                        <td>{session.platform}</td>
                        <td>{session.session_date}</td>
                        <td>
                          {session.duration_seconds != null
                            ? `${Math.round(session.duration_seconds / 60)} min`
                            : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="detail-section card">
            <div className="profile-card-header">
              <div>
                <h3>Clinical Sessions</h3>
                <p className="profile-subtitle">Provider therapy sessions, remote or in person</p>
              </div>
            </div>
            {!patient.clinical_sessions?.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No clinical sessions recorded.</p>
            ) : (
              <div className="patient-table-container">
                <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th>Mode</th>
                      <th>Date</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patient.clinical_sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.provider_name}</td>
                        <td>{session.mode}</td>
                        <td>{session.session_date}</td>
                        <td>
                          {session.duration_seconds != null
                            ? `${Math.round(session.duration_seconds / 60)} min`
                            : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Providers & Clinical Notes */}
        <div className="detail-column side-col">
          <section className="detail-section card">
            <div className="profile-card-header">
              <div>
                <h3>Assigned Providers</h3>
              </div>
            </div>
            {!patient.providers?.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No providers currently assigned.</p>
            ) : (
              patient.providers.map((provider) => (
                <div key={provider.id} className="demo-item" style={{ marginBottom: '10px' }}>
                  <span className="demo-label">{provider.specialty || 'Provider'}</span>
                  <p className="demo-value">{provider.name}</p>
                  <p className="sub-text">{provider.email}</p>
                </div>
              ))
            )}
          </section>

          <section className="detail-section card">
            <div className="profile-card-header">
              <div>
                <h3>Clinical Notes & Logs</h3>
                <p className="profile-subtitle">Provider-entered record</p>
              </div>
            </div>

            <div className="logs-timeline">
              {!patient.logs?.length ? (
                <p style={{ color: 'var(--text-muted)' }}>No clinical notes recorded yet.</p>
              ) : (
                patient.logs.map((log) => (
                  <div key={log.id} className="log-entry mental-log-entry">
                    <div className="log-header-row">
                      <span className="log-timestamp">{log.timestamp}</span>
                      <span className="log-session-badge">{log.type || 'Note'}</span>
                    </div>
                    <p className="log-text">{log.note}</p>
                    <div className="sub-text">— {log.provider_name}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
