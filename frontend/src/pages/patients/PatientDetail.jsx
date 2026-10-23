import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MOCK_PATIENTS } from '../../data/mockPatients';

/**
 * Mental Health Client Detail Component
 * Displays individual psychological formulation, biometric affect metrics,
 * therapeutic goals, emotional triggers, and session progress logs.
 */
export default function PatientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Find active client by ID (case-insensitive) or fallback to first client
  const activePatient =
    MOCK_PATIENTS.find((p) => p.id.toLowerCase() === (id || '').toLowerCase()) ||
    MOCK_PATIENTS[0];

  const [customLogs, setCustomLogs] = useState({});
  const [newLogNote, setNewLogNote] = useState('');
  const [sessionType, setSessionType] = useState('XR Immersion');

  // Combine custom session notes with mock client logs
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

    const newEntry = {
      timestamp,
      sessionType,
      note: newLogNote.trim(),
    };

    setCustomLogs((prev) => ({
      ...prev,
      [activePatient.id]: [newEntry, ...(prev[activePatient.id] || [])],
    }));

    setNewLogNote('');
  };

  const getStatusBadgeClass = (status = '') => {
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
      {/* Top Navigation Bar */}
      <div className="detail-top-nav">
        <Link to="/logs/patient-list" className="btn-back">
          <span className="back-arrow">←</span> Back to Client Directory
        </Link>

        {/* Quick Prev / Next Jump */}
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
      </div>

      {/* Client Switcher Bar */}
      <div className="provider-switcher-container">
        <span className="switcher-label">Switch Client Overview:</span>
        <div className="switcher-pills">
          {MOCK_PATIENTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`switcher-pill ${p.id === activePatient.id ? 'active' : ''}`}
              onClick={() => navigate(`/patients/${p.id}`)}
            >
              <span className="switcher-pill-name">{p.name}</span>
              <span className="switcher-pill-dept">{p.status}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Client Header Banner */}
      <div className="client-hero-card">
        <div className="client-hero-top">
          <div className="client-identity">
            <div className="client-avatar-ring">
              <span className="client-avatar-initials">
                {activePatient.name.split(' ').map((n) => n[0]).join('')}
              </span>
            </div>
            <div>
              <div className="client-title-row">
                <h2>{activePatient.name}</h2>
                {activePatient.pronouns && (
                  <span className="client-pronouns-tag">{activePatient.pronouns}</span>
                )}
                <span className="patient-id-tag">{activePatient.id}</span>
                <span className={getStatusBadgeClass(activePatient.status)}>
                  {activePatient.status}
                </span>
              </div>
              <p className="client-care-track-text">
                🌿 {activePatient.careTrack || 'Immersive XR Therapy Track'}
              </p>
            </div>
          </div>

          <div className="client-meta-box">
            <div className="client-meta-item">
              <span className="meta-label">Lead Clinician</span>
              <span className="meta-value">{activePatient.attendingPhysician}</span>
            </div>
            <div className="client-meta-item">
              <span className="meta-label">Intake Date</span>
              <span className="meta-value">{activePatient.admissionDate}</span>
            </div>
            <div className="client-meta-item">
              <span className="meta-label">Location / Suite</span>
              <span className="meta-value">{activePatient.room}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Biometrics & Affect Indicators Row */}
      <section className="detail-section" style={{ marginTop: '24px' }}>
        <div className="section-title-row">
          <h3>Current Affect & Wellness Biometrics</h3>
          <span className="section-tag-live">● Live Biofeedback Coherence</span>
        </div>
        <div className="vitals-grid">
          <div className="vital-card mental-vital-card">
            <span className="vital-label">Mood / Affect State</span>
            <span className="vital-value" style={{ fontSize: '1.2rem', color: '#38bdf8' }}>
              {activePatient.vitals.affect || 'Calm & Grounded'}
            </span>
            <span className="vital-sub">Subjective Scale: 8/10</span>
          </div>

          <div className="vital-card mental-vital-card">
            <span className="vital-label">Heart Rate Variability</span>
            <span className="vital-value">{activePatient.vitals.hrv || '72 ms'}</span>
            <span className="vital-sub">Parasympathetic Tone</span>
          </div>

          <div className="vital-card mental-vital-card">
            <span className="vital-label">Clinical Scale Index</span>
            <span className="vital-value" style={{ fontSize: '1.15rem' }}>
              {activePatient.vitals.anxietyScale || '6/21 (Mild)'}
            </span>
            <span className="vital-sub">Validated Intake Metric</span>
          </div>

          <div className="vital-card mental-vital-card">
            <span className="vital-label">XR Calm & Coherence</span>
            <span className="vital-value" style={{ color: '#34d399' }}>
              {activePatient.vitals.xrCalmIndex || '92%'}
            </span>
            <span className="vital-sub">Spatial Biofeedback Score</span>
          </div>

          <div className="vital-card mental-vital-card">
            <span className="vital-label">Sleep Architecture</span>
            <span className="vital-value">{activePatient.vitals.sleepQuality || '7.8 hrs'}</span>
            <span className="vital-sub">Restorative Sleep Index</span>
          </div>
        </div>
      </section>

      {/* Main Details Grid */}
      <div className="detail-layout">
        {/* Left Column: Mental Health Profile & Care Regimen */}
        <div className="detail-column main-col">
          {/* Mental Health Profile Card */}
          <section className="detail-section card mental-profile-card">
            <div className="profile-card-header">
              <div>
                <h3>Mental Health Profile</h3>
                <p className="profile-subtitle">Clinical Formulation, Modality & Safety Anchors</p>
              </div>
              <span className="profile-badge-pill">Clinical Track</span>
            </div>

            {/* Diagnostic & Modality Highlight Box */}
            <div className="clinical-highlight-banner">
              <div className="highlight-item">
                <span className="highlight-label">Primary Diagnostic Formulation</span>
                <p className="highlight-title">{activePatient.diagnosis}</p>
              </div>
              <div className="highlight-grid">
                <div>
                  <span className="highlight-label">Therapeutic Modality</span>
                  <p className="highlight-value">{activePatient.modality || 'CBT + Somatic XR Immersion'}</p>
                </div>
                <div>
                  <span className="highlight-label">Current Phase</span>
                  <p className="highlight-value">{activePatient.carePhase || 'Phase 2: Exposure & Restructuring'}</p>
                </div>
              </div>
            </div>

            {/* Demographics & Contact Mini-Grid */}
            <div className="demographics-grid">
              <div className="demo-item">
                <span className="demo-label">Client Age & Gender</span>
                <p className="demo-value">{activePatient.age} years • {activePatient.gender}</p>
              </div>
              <div className="demo-item">
                <span className="demo-label">Preferred Session Mode</span>
                <p className="demo-value">{activePatient.preferredFormat || 'Immersive XR Headset + Telehealth'}</p>
              </div>
              <div className="demo-item">
                <span className="demo-label">Contact Phone</span>
                <p className="demo-value">{activePatient.phone}</p>
              </div>
              <div className="demo-item">
                <span className="demo-label">Email Address</span>
                <p className="demo-value">{activePatient.email}</p>
              </div>
              <div className="demo-item full-span">
                <span className="demo-label">Emergency Safety Contact</span>
                <p className="demo-value">{activePatient.emergencyContact || 'Designated Family Contact'}</p>
              </div>
            </div>

            {/* Identified Triggers & Emotional Sensitivities */}
            <div className="profile-section-group">
              <div className="group-title-row">
                <h4>⚡ Identified Emotional Triggers & Sensitivities</h4>
                <span className="tag-calm">De-escalation Protocols</span>
              </div>
              <div className="trigger-tags-wrapper">
                {(activePatient.triggers || ['Crowded Sensory Spaces', 'Sudden Loud Noises', 'Tight Deadlines']).map((trigger, i) => (
                  <span key={i} className="trigger-pill">
                    <span className="trigger-dot"></span>
                    {trigger}
                  </span>
                ))}
              </div>

              {activePatient.copingAnchor && (
                <div className="coping-anchor-box">
                  <strong>⚓ Coping Anchor / Safety Plan:</strong> {activePatient.copingAnchor}
                </div>
              )}
            </div>

            {/* Therapeutic Goals & Progress */}
            {activePatient.goals && (
              <div className="profile-section-group">
                <div className="group-title-row">
                  <h4>🎯 Active Therapeutic Goals & Milestones</h4>
                  <span className="tag-calm">Progress Metrics</span>
                </div>
                <div className="goals-list">
                  {activePatient.goals.map((goal, idx) => (
                    <div key={idx} className="goal-item-card">
                      <div className="goal-item-header">
                        <span className="goal-text">{goal.text}</span>
                        <span className={`goal-status-badge status-${goal.status.toLowerCase().replace(/\s+/g, '-')}`}>
                          {goal.status} ({goal.progress}%)
                        </span>
                      </div>
                      <div className="goal-progress-bar-bg">
                        <div
                          className="goal-progress-fill"
                          style={{ width: `${goal.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Psychological Background & Clinical Narrative */}
            <div className="profile-section-group" style={{ marginBottom: 0 }}>
              <div className="group-title-row">
                <h4>📜 Psychological Intake Summary & Narrative</h4>
              </div>
              <div className="narrative-history-box">
                <p>{activePatient.history}</p>
              </div>
            </div>
          </section>

          {/* Prescribed Care & Regimen Card */}
          <section className="detail-section card">
            <div className="profile-card-header">
              <div>
                <h3>Prescribed Care & Therapeutic Regimen</h3>
                <p className="profile-subtitle">Somatic Interventions, Psychotropics & XR Dosage</p>
              </div>
              <span className="profile-badge-pill">Active Plan</span>
            </div>

            <div className="regimen-grid">
              {activePatient.medications.map((med, index) => (
                <div key={index} className="regimen-card">
                  <div className="regimen-top">
                    <strong className="regimen-name">{med.name}</strong>
                    <span className="regimen-type-pill">{med.type || 'Therapeutic Regimen'}</span>
                  </div>
                  <div className="regimen-dosage">{med.dosage}</div>
                  <div className="regimen-timing">⏰ {med.timing}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Column: Therapeutic Progress Notes Timeline & Add Note */}
        <div className="detail-column side-col">
          <section className="detail-section card">
            <div className="profile-card-header">
              <div>
                <h3>Session Notes & XR Logs</h3>
                <p className="profile-subtitle">Real-time clinical timeline</p>
              </div>
            </div>

            <form onSubmit={handleAddLog} className="add-log-form">
              <div className="session-type-selector">
                <label>Session Modality:</label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value)}
                  className="session-select-input"
                >
                  <option value="XR Immersion">Reflect XR Immersion</option>
                  <option value="Psychotherapy">1-on-1 Psychotherapy</option>
                  <option value="Biofeedback Check-in">Biofeedback Check-in</option>
                  <option value="Self-Care Log">Self-Guided Practice</option>
                </select>
              </div>

              <textarea
                rows="4"
                placeholder="Enter session observation, client affect, biofeedback insights, or XR breakthroughs..."
                value={newLogNote}
                onChange={(e) => setNewLogNote(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ width: '100%' }}>
                + Add Therapeutic Note
              </button>
            </form>

            <div className="logs-timeline" style={{ marginTop: '24px' }}>
              {patientLogs.map((log, index) => (
                <div key={index} className="log-entry mental-log-entry">
                  <div className="log-header-row">
                    <span className="log-timestamp">{log.timestamp}</span>
                    <span className="log-session-badge">
                      {log.sessionType || 'Clinical Session'}
                    </span>
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
