import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { patientService } from '../../services/patientService';
import { ClientAppActivity } from '../../components/activity/AppActivityPanels';
import { RtmPanel } from '../../components/RtmPanels';

// "Oct 23", or "Oct 23, 2025" when it is not this year
const fmtDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
};
const fmtTime = (value) =>
  value ? new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';

const formatWhen = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

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

  // "Add note" form
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSession, setNoteSession] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');

  // "Log communication" form
  const [comm, setComm] = useState({ direction: 'Outbound', channel: 'Email', minutes: 0, summary: '' });
  const [commSaving, setCommSaving] = useState(false);
  const [commError, setCommError] = useState('');

  // App sessions list: show the latest few, expand on request
  const [showAllApp, setShowAllApp] = useState(false);

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

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteDraft.trim()) return;
    setNoteSaving(true);
    setNoteError('');
    try {
      const created = await patientService.addNote(id, {
        content: noteDraft.trim(),
        clinical_session_id: noteSession,
      });
      setPatient((prev) => ({ ...prev, logs: [created, ...(prev.logs || [])] }));
      setNoteDraft('');
      setNoteSession('');
    } catch (err) {
      setNoteError(err.message || 'Unable to save the note.');
    } finally {
      setNoteSaving(false);
    }
  };

  const handleLogCommunication = async (e) => {
    e.preventDefault();
    if (!comm.summary.trim()) return;
    setCommSaving(true);
    setCommError('');
    try {
      const created = await patientService.addCommunication(id, {
        ...comm,
        summary: comm.summary.trim(),
      });
      setPatient((prev) => ({ ...prev, communications: [created, ...(prev.communications || [])] }));
      setComm((prev) => ({ ...prev, minutes: 0, summary: '' }));
    } catch (err) {
      setCommError(err.message || 'Unable to log the communication.');
    } finally {
      setCommSaving(false);
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

      {/* App usage: charts for modules, time of day and trend */}
      <ClientAppActivity patientId={id} />

      {/* Remote Therapeutic Monitoring: enrollment, consent, 30-day status, documentation */}
      <RtmPanel patientId={id} clientName={patient.name} />

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
                      <span className="badge-group">
                        {entry.severity && (
                          <span className={`severity-badge severity-${entry.severity.toLowerCase()}`}>
                            {entry.severity}
                          </span>
                        )}
                        <span className={getStatusBadgeClass(entry.status)}>{entry.status}</span>
                      </span>
                    </div>
                    <div className="sub-text" style={{ marginBottom: '4px' }}>
                      Onset: {entry.onset_date || 'Unknown'} • In treatment since:{' '}
                      {entry.treatment_start_date || 'Unknown'}
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
                <h3>Medications</h3>
                <p className="profile-subtitle">Current and past prescriptions on record</p>
              </div>
            </div>
            {!patient.medications?.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No medications recorded (therapy only).</p>
            ) : (
              <div className="patient-table-container">
                <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Medication</th>
                      <th>Dose</th>
                      <th>Frequency</th>
                      <th>Started</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patient.medications.map((med) => (
                      <tr key={med.id}>
                        <td>{med.name}</td>
                        <td>{med.dosage}</td>
                        <td>{med.frequency}</td>
                        <td>{med.started_on || 'Unknown'}</td>
                        <td>{med.status}</td>
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
                <h3>App Sessions</h3>
                <p className="profile-subtitle">Each Reflect XR / Reflect Mobile session, with start and end times</p>
              </div>
            </div>
            {!patient.sessions?.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No app sessions recorded.</p>
            ) : (
              <>
                <div className="patient-table-container">
                  <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Date</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Mood after</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(showAllApp ? patient.sessions : patient.sessions.slice(0, 10)).map((session) => (
                        <tr key={session.id}>
                          <td>
                            {session.application_name}
                            <div className="sub-text">
                              {session.platform}
                              {session.program ? ` · ${session.program}` : ''}
                              {session.uses_ai ? ' · AI' : ''}
                            </div>
                          </td>
                          <td className="nowrap">{fmtDate(session.in_time)}</td>
                          <td className="nowrap">{fmtTime(session.in_time)}</td>
                          <td className="nowrap">{fmtTime(session.out_time)}</td>
                          <td className="nowrap">{session.mood_after != null ? `${session.mood_after} / 5` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {patient.sessions.length > 10 && (
                  <div className="show-more-row">
                    <button type="button" className="btn-secondary" onClick={() => setShowAllApp((prev) => !prev)}>
                      {showAllApp ? 'Show fewer' : `Show all ${patient.sessions.length} sessions`}
                    </button>
                  </div>
                )}
              </>
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
                      <th>Start</th>
                      <th>End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {patient.clinical_sessions.map((session) => (
                      <tr key={session.id}>
                        <td>{session.provider_name}</td>
                        <td>{session.mode === 'InPerson' ? 'In person' : session.mode}</td>
                        <td className="nowrap">{fmtDate(session.in_time)}</td>
                        <td className="nowrap">{fmtTime(session.in_time)}</td>
                        <td className="nowrap">{fmtTime(session.out_time)}</td>
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
                <h3>Communication Log</h3>
                <p className="profile-subtitle">Messages with this client that happened outside the app</p>
              </div>
            </div>

            <form className="inline-form" onSubmit={handleLogCommunication}>
              <div className="inline-form-row">
                <select
                  value={comm.direction}
                  onChange={(e) => setComm((prev) => ({ ...prev, direction: e.target.value }))}
                  aria-label="Direction"
                >
                  <option value="Outbound">Sent to client</option>
                  <option value="Inbound">Received from client</option>
                </select>
                <select
                  value={comm.channel}
                  onChange={(e) => setComm((prev) => ({ ...prev, channel: e.target.value }))}
                  aria-label="Channel"
                >
                  <option value="Email">Email</option>
                  <option value="Text">Text</option>
                  <option value="Phone">Phone</option>
                  <option value="Portal">Portal</option>
                  <option value="Other">Other</option>
                </select>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={comm.minutes}
                  onChange={(e) => setComm((prev) => ({ ...prev, minutes: e.target.value }))}
                  aria-label="Minutes spent"
                  title="Minutes spent"
                  className="inline-minutes"
                />
              </div>
              <textarea
                rows={2}
                maxLength={1000}
                placeholder="What was discussed?"
                value={comm.summary}
                onChange={(e) => setComm((prev) => ({ ...prev, summary: e.target.value }))}
              />
              <div className="inline-form-row inline-form-actions">
                <button type="submit" className="btn-primary" disabled={commSaving || !comm.summary.trim()}>
                  {commSaving ? 'Saving…' : 'Log Communication'}
                </button>
              </div>
              {commError && <div className="inline-form-error">{commError}</div>}
            </form>

            <div className="logs-timeline">
              {!patient.communications?.length ? (
                <p style={{ color: 'var(--text-muted)' }}>No communication logged yet.</p>
              ) : (
                patient.communications.map((item) => (
                  <div key={item.id} className="log-entry mental-log-entry">
                    <div className="log-header-row">
                      <span className="log-timestamp">{formatWhen(item.started_at)}</span>
                      <span className="log-session-badge">
                        {item.direction === 'Inbound' ? 'From client' : 'To client'} · {item.channel}
                      </span>
                    </div>
                    <p className="log-text">{item.summary}</p>
                    <div className="sub-text">
                      — {item.provider_name}
                      {item.duration_seconds ? ` · ${Math.round(item.duration_seconds / 60)} min` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="detail-section card">
            <div className="profile-card-header">
              <div>
                <h3>Clinical Notes & Logs</h3>
                <p className="profile-subtitle">Provider-entered record</p>
              </div>
            </div>

            <form className="inline-form" onSubmit={handleAddNote}>
              <textarea
                rows={3}
                maxLength={4000}
                placeholder="Add a progress note or observation…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div className="inline-form-row">
                <select value={noteSession} onChange={(e) => setNoteSession(e.target.value)} aria-label="Link to a therapy session">
                  <option value="">General note (not tied to a session)</option>
                  {(patient.clinical_sessions || []).map((session) => (
                    <option key={session.id} value={session.id}>
                      Session {fmtDate(session.in_time)} {fmtTime(session.in_time)} · {session.mode === 'InPerson' ? 'In person' : session.mode}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-primary" disabled={noteSaving || !noteDraft.trim()}>
                  {noteSaving ? 'Saving…' : 'Add Note'}
                </button>
              </div>
              {noteError && <div className="inline-form-error">{noteError}</div>}
            </form>

            <div className="logs-timeline">
              {!patient.logs?.length ? (
                <p style={{ color: 'var(--text-muted)' }}>No clinical notes recorded yet.</p>
              ) : (
                patient.logs.map((log) => (
                  <div key={log.id} className="log-entry mental-log-entry">
                    <div className="log-header-row">
                      <span className="log-timestamp">{formatWhen(log.timestamp)}</span>
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