import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MOCK_PATIENTS } from '../../data/mockPatients';

/**
 * Patient Detail Page Component
 * Renders individual patient vitals, diagnosis, and clinical logs.
 */
export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Find active patient by ID (case-insensitive) or fallback to first patient
  const activePatient =
    MOCK_PATIENTS.find((p) => p.id.toLowerCase() === (id || '').toLowerCase()) ||
    MOCK_PATIENTS[0];

  const [customLogs, setCustomLogs] = useState({});
  const [newLogNote, setNewLogNote] = useState('');

  // Combine custom logs with mock patient logs
  const patientLogs = [
    ...(customLogs[activePatient.id] || []),
    ...activePatient.logs,
  ];

  const currentIndex = MOCK_PATIENTS.findIndex((p) => p.id === activePatient.id);
  const prevPatient = MOCK_PATIENTS[(currentIndex - 1 + MOCK_PATIENTS.length) % MOCK_PATIENTS.length];
  const nextPatient = MOCK_PATIENTS[(currentIndex + 1) % MOCK_PATIENTS.length];

  const handleAddLog = (e) => {
    e.preventDefault();
    if (!newLogNote.trim()) return;

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 5);
    
    const newEntry = { timestamp, note: newLogNote.trim() };

    setCustomLogs((prev) => ({
      ...prev,
      [activePatient.id]: [newEntry, ...(prev[activePatient.id] || [])],
    }));

    setNewLogNote('');
  };

  const getStatusBadgeClass = (status) => {
    switch (status.toLowerCase()) {
      case 'admitted':
        return 'badge badge-admitted';
      case 'in treatment':
        return 'badge badge-treatment';
      case 'observation':
        return 'badge badge-observation';
      case 'discharged':
        return 'badge badge-discharged';
      default:
        return 'badge';
    }
  };

  return (
    <div className="page-container patient-detail-page">
      <div className="detail-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <Link to="/logs/patient-list" className="btn-back">
          <span className="back-arrow">←</span> Back to Patient List
        </Link>

        {/* Quick Prev / Next Jump */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            onClick={() => navigate(`/patients/${prevPatient.id}`)}
            title={`Switch to ${prevPatient.name}`}
          >
            ← Prev ({prevPatient.name.split(' ')[0]})
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
            onClick={() => navigate(`/patients/${nextPatient.id}`)}
            title={`Switch to ${nextPatient.name}`}
          >
            Next ({nextPatient.name.split(' ')[0]}) →
          </button>
        </div>
      </div>

      {/* Patient Switcher Bar */}
      <div className="provider-switcher-container">
        <span className="switcher-label">Switch Patient View:</span>
        <div className="switcher-pills">
          {MOCK_PATIENTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`switcher-pill ${p.id === activePatient.id ? 'active' : ''}`}
              onClick={() => navigate(`/patients/${p.id}`)}
            >
              <span className="switcher-pill-name">{p.name}</span>
              <span className="switcher-pill-dept">{p.room} • {p.status}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Patient Header Banner */}
      <div className="patient-card-header" style={{ marginTop: '20px' }}>
        <div className="patient-title-group">
          <h2>{activePatient.name}</h2>
          <span className="patient-id-tag">{activePatient.id}</span>
          <span className={getStatusBadgeClass(activePatient.status)}>{activePatient.status}</span>
        </div>

        <div className="patient-quick-meta">
          <span><strong>Room:</strong> {activePatient.room}</span>
          <span><strong>Admitted:</strong> {activePatient.admissionDate}</span>
          <span><strong>Attending:</strong> {activePatient.attendingPhysician}</span>
        </div>
      </div>

      {/* Vitals Summary Row */}
      <section className="detail-section">
        <h3>Current Vitals</h3>
        <div className="vitals-grid">
          <div className="vital-card">
            <span className="vital-label">Heart Rate</span>
            <span className="vital-value">{activePatient.vitals.heartRate}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Blood Pressure</span>
            <span className="vital-value">{activePatient.vitals.bloodPressure}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">SpO₂</span>
            <span className="vital-value">{activePatient.vitals.oxygenSaturation}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Temperature</span>
            <span className="vital-value">{activePatient.vitals.temperature}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Resp. Rate</span>
            <span className="vital-value">{activePatient.vitals.respiratoryRate}</span>
          </div>
        </div>
      </section>

      {/* Main Details Grid */}
      <div className="detail-layout">
        {/* Left Column: Demographic & Clinical Info */}
        <div className="detail-column main-col">
          <section className="detail-section card">
            <h3>Medical Profile</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Primary Diagnosis</label>
                <p><strong>{activePatient.diagnosis}</strong></p>
              </div>
              <div className="info-item">
                <label>Attending Physician</label>
                <p>{activePatient.attendingPhysician}</p>
              </div>
              <div className="info-item">
                <label>Age / Gender</label>
                <p>{activePatient.age} years ({activePatient.gender})</p>
              </div>
              <div className="info-item">
                <label>Blood Type</label>
                <p>{activePatient.bloodType}</p>
              </div>
              <div className="info-item">
                <label>Contact Phone</label>
                <p>{activePatient.phone}</p>
              </div>
              <div className="info-item">
                <label>Email Address</label>
                <p>{activePatient.email}</p>
              </div>
              <div className="info-item full-width">
                <label>Allergies</label>
                <div className="allergy-tags">
                  {activePatient.allergies.map((allergy, i) => (
                    <span key={i} className="allergy-tag">{allergy}</span>
                  ))}
                </div>
              </div>
              <div className="info-item full-width">
                <label>Medical History</label>
                <p>{activePatient.history}</p>
              </div>
            </div>
          </section>

          {/* Active Medications */}
          <section className="detail-section card">
            <h3>Active Medications</h3>
            <ul className="medication-list">
              {activePatient.medications.map((med, index) => (
                <li key={index} className="medication-item">
                  <div>
                    <strong>{med.name}</strong> - <span>{med.dosage}</span>
                  </div>
                  <span className="sub-text">{med.timing}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right Column: Clinical Logs Timeline & Add Log */}
        <div className="detail-column side-col">
          <section className="detail-section card">
            <h3>Clinical Activity Logs</h3>
            
            <form onSubmit={handleAddLog} className="add-log-form">
              <textarea
                rows="3"
                placeholder="Enter new clinical observation note..."
                value={newLogNote}
                onChange={(e) => setNewLogNote(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                Add Log Entry
              </button>
            </form>

            <div className="logs-timeline">
              {patientLogs.map((log, index) => (
                <div key={index} className="log-entry">
                  <div className="log-timestamp">{log.timestamp}</div>
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
