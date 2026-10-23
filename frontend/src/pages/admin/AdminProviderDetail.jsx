import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MOCK_PROVIDERS } from '../../data/mockProviders';

/**
 * Admin: Clinician Detail Page Component
 * Renders individual credentials, clinical schedules, and active client caseloads.
 */
export default function AdminProviderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Find provider by ID (case-insensitive) or fallback to first provider
  const activeProvider =
    MOCK_PROVIDERS.find((p) => p.id.toLowerCase() === (id || '').toLowerCase()) ||
    MOCK_PROVIDERS.find((p) => p.name.toLowerCase().includes((id || '').toLowerCase())) ||
    MOCK_PROVIDERS[0];

  // Store added audit logs keyed by provider ID so state persists per provider during session
  const [customLogs, setCustomLogs] = useState({});
  const [newAuditNote, setNewAuditNote] = useState('');

  // Current provider's audit logs combined with initial mock logs
  const providerLogs = [
    ...(customLogs[activeProvider.id] || []),
    ...activeProvider.adminAuditLogs,
  ];

  // Calculate previous and next provider for quick pagination
  const currentIndex = MOCK_PROVIDERS.findIndex((p) => p.id === activeProvider.id);
  const prevProvider = MOCK_PROVIDERS[(currentIndex - 1 + MOCK_PROVIDERS.length) % MOCK_PROVIDERS.length];
  const nextProvider = MOCK_PROVIDERS[(currentIndex + 1) % MOCK_PROVIDERS.length];

  const handleAddAuditNote = (e) => {
    e.preventDefault();
    if (!newAuditNote.trim()) return;

    const now = new Date();
    const timestamp =
      now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 5);

    const newEntry = {
      timestamp,
      author: 'Clinical Supervisor (Current Session)',
      note: newAuditNote.trim(),
    };

    setCustomLogs((prev) => ({
      ...prev,
      [activeProvider.id]: [newEntry, ...(prev[activeProvider.id] || [])],
    }));

    setNewAuditNote('');
  };

  const getStatusBadgeClass = (status) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'badge badge-admitted';
      case 'on-duty':
        return 'badge badge-treatment';
      case 'in consultation':
        return 'badge badge-observation';
      case 'on leave':
        return 'badge badge-discharged';
      default:
        return 'badge';
    }
  };

  const getPatientStatusBadgeClass = (status = '') => {
    const s = status.toLowerCase();
    if (s.includes('active') || s.includes('treatment') || s.includes('admitted')) {
      return 'badge badge-treatment';
    }
    if (s.includes('maintenance') || s.includes('observation')) {
      return 'badge badge-observation';
    }
    if (s.includes('completed') || s.includes('discharged')) {
      return 'badge badge-discharged';
    }
    return 'badge';
  };

  return (
    <div className="page-container patient-detail-page">
      {/* Top Navigation Row */}
      <div className="detail-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Link to="/admin/providers" className="btn-back">
          <span className="back-arrow">←</span> Back to Clinicians Directory
        </Link>

        {/* Previous / Next Clinician Jump Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            onClick={() => navigate(`/admin/providers/${prevProvider.id}`)}
            title={`Switch to ${prevProvider.name}`}
          >
            ← Prev ({prevProvider.name.split(' ')[1] || prevProvider.name})
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            onClick={() => navigate(`/admin/providers/${nextProvider.id}`)}
            title={`Switch to ${nextProvider.name}`}
          >
            Next ({nextProvider.name.split(' ')[1] || nextProvider.name}) →
          </button>
        </div>
      </div>

      {/* Quick All-Clinicians Switcher Bar */}
      <div className="provider-switcher-container">
        <span className="switcher-label">Switch Clinician Overview:</span>
        <div className="switcher-pills">
          {MOCK_PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`switcher-pill ${p.id === activeProvider.id ? 'active' : ''}`}
              onClick={() => navigate(`/admin/providers/${p.id}`)}
            >
              <span className="switcher-pill-name">{p.name}</span>
              <span className="switcher-pill-dept">{p.department}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Clinician Header Banner */}
      <div className="patient-card-header" style={{ marginTop: '20px' }}>
        <div className="patient-title-group">
          <h2>{activeProvider.name}</h2>
          <span className="patient-id-tag">{activeProvider.id}</span>
          <span className={getStatusBadgeClass(activeProvider.status)}>{activeProvider.status}</span>
          <span className="pill pill-active" style={{ fontSize: '0.75rem' }}>
            {activeProvider.title}
          </span>
        </div>

        <div className="patient-quick-meta">
          <span>
            <strong>Department:</strong> {activeProvider.department}
          </span>
          <span>
            <strong>Suite:</strong> {activeProvider.office}
          </span>
          <span>
            <strong>Phone:</strong> {activeProvider.phone}
          </span>
          <span>
            <strong>Email:</strong> {activeProvider.email}
          </span>
        </div>
      </div>

      {/* Clinical Metrics Summary Grid */}
      <section className="detail-section">
        <h3>Clinician Practice & Caseload Metrics</h3>
        <div className="vitals-grid">
          <div className="vital-card">
            <span className="vital-label">Active Clients</span>
            <span className="vital-value">{activeProvider.metrics.activePatientsCount}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Weekly Therapy Hours</span>
            <span className="vital-value">{activeProvider.metrics.weeklyShiftHours} hrs</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">XR Sessions / Month</span>
            <span className="vital-value">{activeProvider.metrics.proceduresMonth}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Client Satisfaction</span>
            <span className="vital-value">{activeProvider.metrics.satisfactionRating} / 5.0</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Practice Experience</span>
            <span className="vital-value">{activeProvider.experienceYears} Years</span>
          </div>
        </div>
      </section>

      {/* Main Details Grid */}
      <div className="detail-layout">
        {/* Left Column: Credentials & Assigned Clients */}
        <div className="detail-column main-col">
          {/* Clinical Credentials & Licensing Card */}
          <section className="detail-section card">
            <h3>Clinical Credentials & Licensure</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>State Clinical License</label>
                <p style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--accent-coral)' }}>
                  {activeProvider.licenseNumber}
                </p>
              </div>
              <div className="info-item">
                <label>National Provider ID (NPI)</label>
                <p style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                  {activeProvider.npi}
                </p>
              </div>
              <div className="info-item">
                <label>Doctoral / Medical School</label>
                <p>{activeProvider.education.medicalSchool}</p>
              </div>
              <div className="info-item">
                <label>Residency / Clinical Training</label>
                <p>{activeProvider.education.residency}</p>
              </div>
              <div className="info-item full-width">
                <label>Fellowship & Advanced Specialization</label>
                <p>{activeProvider.education.fellowship}</p>
              </div>
              <div className="info-item full-width">
                <label>Official Board Certifications & Accreditations</label>
                <div className="allergy-tags" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                  {activeProvider.education.boardCertifications.map((cert, i) => (
                    <span
                      key={i}
                      className="allergy-tag"
                      style={{
                        background: 'rgba(168, 85, 247, 0.15)',
                        borderColor: 'rgba(168, 85, 247, 0.4)',
                        color: '#c084fc',
                      }}
                    >
                      ✓ {cert}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Assigned Clients Table */}
          <section className="detail-section card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, border: 'none' }}>Assigned Clients in Active Therapy</h3>
              <span className="pill pill-active">
                {activeProvider.assignedPatients.length} Active
              </span>
            </div>

            {activeProvider.assignedPatients.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', padding: '16px 0' }}>
                No active clients currently assigned to this clinician.
              </p>
            ) : (
              <div className="patient-table-container" style={{ marginTop: '12px' }}>
                <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Suite / Track</th>
                      <th>Clinical Formulation</th>
                      <th>Care Status</th>
                      <th>Intake Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeProvider.assignedPatients.map((patient) => (
                      <tr key={patient.id}>
                        <td>
                          <strong>{patient.name}</strong>
                          <div className="sub-text" style={{ fontFamily: 'monospace' }}>{patient.id}</div>
                        </td>
                        <td>{patient.room}</td>
                        <td style={{ maxWidth: '240px' }}>{patient.diagnosis}</td>
                        <td>
                          <span className={getPatientStatusBadgeClass(patient.status)}>
                            {patient.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {patient.admissionDate}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Shift Roster & Admin Audit Logs */}
        <div className="detail-column side-col">
          {/* Shift Schedule Card */}
          <section className="detail-section card">
            <h3>Therapy Schedule & XR Roster</h3>
            <div className="shift-schedule-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeProvider.schedule.map((shift, idx) => (
                <div
                  key={idx}
                  style={{
                    background: 'rgba(10, 13, 24, 0.6)',
                    border: '1px solid var(--border-color)',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>{shift.day}</strong>
                    <span style={{ color: 'var(--accent-coral)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      {shift.hours}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{shift.type}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Admin Audit Trail & Entry Form */}
          <section className="detail-section card">
            <h3>Clinical Supervision & Audit Logs</h3>

            <form onSubmit={handleAddAuditNote} className="add-log-form">
              <textarea
                rows="3"
                placeholder={`Log a supervisory note for ${activeProvider.name}...`}
                value={newAuditNote}
                onChange={(e) => setNewAuditNote(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                Record Supervisory Audit Note
              </button>
            </form>

            <div className="logs-timeline" style={{ marginTop: '20px' }}>
              {providerLogs.map((log, index) => (
                <div key={index} className="log-entry">
                  <div className="log-timestamp" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{log.timestamp}</span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{log.author}</span>
                  </div>
                  <p className="log-text">{log.note}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
