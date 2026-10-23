import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminService } from '../../services/adminService';

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

  // One day of activity (defaults to today in the viewer's time zone)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const [day, setDay] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [dayData, setDayData] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState('');

  useEffect(() => {
    if (!id || !day) return;
    let active = true;
    setDayLoading(true);
    setDayError('');
    adminService
      .getProviderActivity(id, { date: day, tz: timeZone })
      .then((data) => {
        if (active) setDayData(data);
      })
      .catch((err) => {
        if (active) setDayError(err.message || 'Unable to load activity for this day.');
      })
      .finally(() => {
        if (active) setDayLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, day, timeZone]);

  const fmtTime = (value) =>
    value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const fmtDateTime = (value) =>
    value
      ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'None';
  const todayString = new Date().toLocaleDateString('en-CA');

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

      {/* Day view: sessions, notes and time per client */}
      <section className="detail-section card">
        <div className="activity-toolbar">
          <h3 style={{ margin: 0, border: 'none' }}>Daily Activity</h3>
          <div className="activity-toolbar-controls">
            <input
              type="date"
              value={day}
              max={todayString}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              aria-label="Activity date"
            />
            {day !== todayString && (
              <button type="button" className="btn-secondary" onClick={() => setDay(todayString)}>
                Today
              </button>
            )}
          </div>
        </div>

        {dayError && (
          <div className="auth-error-banner" role="alert" style={{ marginTop: '12px' }}>
            <span className="error-icon">⚠️</span>
            <span>{dayError}</span>
          </div>
        )}

        {dayLoading && !dayData && <p style={{ color: 'var(--text-muted)' }}>Loading activity…</p>}

        {dayData && (
          <div style={{ opacity: dayLoading ? 0.55 : 1, transition: 'opacity 150ms' }}>
            <div className="vitals-grid" style={{ marginTop: '16px' }}>
              <div className="vital-card">
                <span className="vital-label">Therapy Sessions</span>
                <span className="vital-value">
                  {dayData.summary.sessions_completed}
                  <span className="vital-sub"> / {dayData.summary.sessions_total}</span>
                </span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Clients Met</span>
                <span className="vital-value">{dayData.summary.patients_met}</span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Time in Therapy</span>
                <span className="vital-value">{dayData.summary.therapy_minutes}<span className="vital-sub"> min</span></span>
              </div>
              <div className="vital-card">
                <span className="vital-label">New Notes Written</span>
                <span className="vital-value">{dayData.summary.notes_written}</span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Chart Review Time</span>
                <span className="vital-value">{dayData.summary.review_minutes}<span className="vital-sub"> min</span></span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Communications</span>
                <span className="vital-value">{dayData.summary.communications}</span>
              </div>
            </div>

            <h4 className="activity-subhead">Therapy sessions</h4>
            {!dayData.sessions.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No therapy sessions on this day.</p>
            ) : (
              <div className="patient-table-container">
                <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Length</th>
                      <th>Mode</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayData.sessions.map((session) => (
                      <tr key={session.id}>
                        <td><strong>{session.patient_name}</strong></td>
                        <td>{fmtTime(session.started_at)}</td>
                        <td>{fmtTime(session.ended_at)}</td>
                        <td>{session.minutes} min</td>
                        <td>{session.mode === 'InPerson' ? 'In person' : session.mode}</td>
                        <td>
                          <span className={`status-chip status-${session.status.toLowerCase().replace(' ', '-')}`}>
                            {session.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="activity-subhead">Time spent on each client</h4>
            {!dayData.time_per_client.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No chart review or communication logged on this day.</p>
            ) : (
              <div className="patient-table-container">
                <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Reviewing data</th>
                      <th>Care management</th>
                      <th>Communication</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayData.time_per_client.map((row) => (
                      <tr key={row.patient_id}>
                        <td><strong>{row.patient_name}</strong></td>
                        <td>{row.review_minutes} min</td>
                        <td>{row.management_minutes} min</td>
                        <td>{row.communications ? `${row.communications} logged · ${row.communication_minutes} min` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Last 30 days: time per client toward the monthly RTM target */}
      {provider.activity && (
        <section className="detail-section card">
          <div className="activity-toolbar">
            <div>
              <h3 style={{ margin: 0, border: 'none' }}>Last {provider.activity.window_days} Days</h3>
              <p className="profile-subtitle" style={{ margin: '4px 0 0' }}>
                Time spent per client toward the {provider.activity.target_minutes}-minute monthly target
              </p>
            </div>
            <span className="pill pill-active">
              {provider.activity.totals.enrolled_meeting_target} of {provider.activity.totals.enrolled_clients} enrolled clients at target
            </span>
          </div>

          <div className="vitals-grid" style={{ marginTop: '16px' }}>
            <div className="vital-card">
              <span className="vital-label">Therapy Sessions</span>
              <span className="vital-value">{provider.activity.totals.therapy_sessions}</span>
            </div>
            <div className="vital-card">
              <span className="vital-label">Notes Written</span>
              <span className="vital-value">{provider.activity.totals.notes_written}</span>
            </div>
            <div className="vital-card">
              <span className="vital-label">Monitoring Time</span>
              <span className="vital-value">{provider.activity.totals.rtm_minutes}<span className="vital-sub"> min</span></span>
            </div>
          </div>

          <div className="patient-table-container" style={{ marginTop: '16px' }}>
            <table className="patient-table" style={{ fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Monitoring</th>
                  <th>Reviewing</th>
                  <th>Care mgmt</th>
                  <th>Communication</th>
                  <th>Total</th>
                  <th>Therapy sessions</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {provider.activity.clients.map((client) => (
                  <tr key={client.patient_id}>
                    <td><strong>{client.name}</strong></td>
                    <td>{client.rtm_status === 'NotEnrolled' ? 'Not enrolled' : client.rtm_status}</td>
                    <td>{client.review_minutes} min</td>
                    <td>{client.management_minutes} min</td>
                    <td>{client.communication_minutes} min</td>
                    <td>
                      <span className={client.rtm_status === 'Enrolled' ? (client.target_met ? 'target-met' : 'target-short') : ''}>
                        {client.rtm_minutes} min
                        {client.rtm_status === 'Enrolled' && (client.target_met ? ' ✓' : ' · below target')}
                      </span>
                    </td>
                    <td>{client.therapy_sessions}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{fmtDateTime(client.last_activity_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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