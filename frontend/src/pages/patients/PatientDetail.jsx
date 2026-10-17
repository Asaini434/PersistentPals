import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MOCK_PATIENTS } from '../../data/mockPatients';

/**
 * Patient Detail Page Component
 */
export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Find patient by ID or fallback to the first patient
  const initialPatient = MOCK_PATIENTS.find((p) => p.id === id) || MOCK_PATIENTS[0];
  const [patient, setPatient] = useState(initialPatient);
  const [newLogNote, setNewLogNote] = useState('');

  const handleAddLog = (e) => {
    e.preventDefault();
    if (!newLogNote.trim()) return;

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 5);
    
    const updatedLogs = [
      { timestamp, note: newLogNote.trim() },
      ...patient.logs,
    ];

    setPatient((prev) => ({
      ...prev,
      logs: updatedLogs,
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

  if (!patient) {
    return (
      <div className="page-container patient-detail-page">
        <div className="empty-state">
          <h3>Patient Not Found</h3>
          <p>The patient record you requested could not be located.</p>
          <Link to="/logs/patient-list" className="btn-back">
            <span className="back-arrow">←</span> Back to Patient List
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container patient-detail-page">
      <nav className="breadcrumb">
        <Link to="/logs/patient-list" className="btn-back">
          <span className="back-arrow">←</span> Back to Patient List
        </Link>
      </nav>

      {/* Patient Header Banner */}
      <div className="patient-card-header">
        <div className="patient-title-group">
          <h2>{patient.name}</h2>
          <span className="patient-id-tag">{patient.id}</span>
          <span className={getStatusBadgeClass(patient.status)}>{patient.status}</span>
        </div>

        <div className="patient-quick-meta">
          <span><strong>Room:</strong> {patient.room}</span>
          <span><strong>Admitted:</strong> {patient.admissionDate}</span>
        </div>
      </div>

      {/* Vitals Summary Row */}
      <section className="detail-section">
        <h3>Current Vitals</h3>
        <div className="vitals-grid">
          <div className="vital-card">
            <span className="vital-label">Heart Rate</span>
            <span className="vital-value">{patient.vitals.heartRate}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Blood Pressure</span>
            <span className="vital-value">{patient.vitals.bloodPressure}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">SpO₂</span>
            <span className="vital-value">{patient.vitals.oxygenSaturation}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Temperature</span>
            <span className="vital-value">{patient.vitals.temperature}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Resp. Rate</span>
            <span className="vital-value">{patient.vitals.respiratoryRate}</span>
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
                <p><strong>{patient.diagnosis}</strong></p>
              </div>
              <div className="info-item">
                <label>Attending Physician</label>
                <p>{patient.attendingPhysician}</p>
              </div>
              <div className="info-item">
                <label>Age / Gender</label>
                <p>{patient.age} years ({patient.gender})</p>
              </div>
              <div className="info-item">
                <label>Blood Type</label>
                <p>{patient.bloodType}</p>
              </div>
              <div className="info-item">
                <label>Contact Phone</label>
                <p>{patient.phone}</p>
              </div>
              <div className="info-item">
                <label>Email Address</label>
                <p>{patient.email}</p>
              </div>
              <div className="info-item full-width">
                <label>Allergies</label>
                <div className="allergy-tags">
                  {patient.allergies.map((allergy, i) => (
                    <span key={i} className="allergy-tag">{allergy}</span>
                  ))}
                </div>
              </div>
              <div className="info-item full-width">
                <label>Medical History</label>
                <p>{patient.history}</p>
              </div>
            </div>
          </section>

          {/* Active Medications */}
          <section className="detail-section card">
            <h3>Active Medications</h3>
            <ul className="medication-list">
              {patient.medications.map((med, index) => (
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
              <button type="submit" className="btn-primary">
                Add Log Entry
              </button>
            </form>

            <div className="logs-timeline">
              {patient.logs.map((log, index) => (
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
