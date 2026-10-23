import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_PATIENTS } from '../../data/mockPatients';

/**
 * Mental Health Client Directory & Therapy Logs Component
 */
export default function PatientList() {
  const [patients] = useState(MOCK_PATIENTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const navigate = useNavigate();

  const filteredPatients = patients.filter((patient) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      patient.name.toLowerCase().includes(term) ||
      patient.id.toLowerCase().includes(term) ||
      patient.diagnosis.toLowerCase().includes(term) ||
      (patient.careTrack && patient.careTrack.toLowerCase().includes(term));

    const matchesStatus =
      statusFilter === 'All' || patient.status.toLowerCase().includes(statusFilter.toLowerCase());

    return matchesSearch && matchesStatus;
  });

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

  const activeCount = patients.filter(
    (p) => !p.status.toLowerCase().includes('completed') && !p.status.toLowerCase().includes('discharged')
  ).length;

  return (
    <div className="page-container patient-list-page">
      <header className="page-header">
        <div>
          <h2>Client Directory & Therapy Logs</h2>
          <p className="subtitle">
            Real-time clinical overview of active mental health clients, XR therapy tracks, and session progress
          </p>
        </div>
        <div className="stats-pills">
          <span className="pill">Total Clients: {patients.length}</span>
          <span className="pill pill-active">Active in Care: {activeCount}</span>
        </div>
      </header>

      <div className="toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by client ID, name, diagnosis, or care track..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-box">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Care Statuses</option>
            <option value="Active Therapy">Active Therapy</option>
            <option value="Maintenance Phase">Maintenance Phase</option>
            <option value="Program Completed">Program Completed</option>
          </select>
        </div>
      </div>

      <div className="patient-table-container">
        <table className="patient-table">
          <thead>
            <tr>
              <th>Client ID</th>
              <th>Client Name</th>
              <th>Age / Pronouns</th>
              <th>Therapy Track & Location</th>
              <th>Primary Clinical Formulation</th>
              <th>Care Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem' }}>
                  No matching clients found in directory.
                </td>
              </tr>
            ) : (
              filteredPatients.map((patient) => (
                <tr key={patient.id} className="clickable-provider-row" onClick={() => navigate(`/patients/${patient.id}`)}>
                  <td className="patient-id">{patient.id}</td>
                  <td className="patient-name">
                    <strong>{patient.name}</strong>
                    <div className="sub-text">{patient.email}</div>
                  </td>
                  <td>
                    {patient.age} y/o{' '}
                    <span className="sub-text">({patient.pronouns || patient.gender})</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: '0.85rem' }}>
                      {patient.room}
                    </div>
                    <div className="sub-text" style={{ fontSize: '0.72rem', color: '#fb7185' }}>
                      {patient.careTrack ? patient.careTrack.split(':')[0] : 'XR Track'}
                    </div>
                  </td>
                  <td className="diagnosis-cell">
                    <span style={{ color: '#f8fafc', fontWeight: 600 }}>{patient.diagnosis}</span>
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(patient.status)}>
                      {patient.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-view-details-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/patients/${patient.id}`);
                      }}
                    >
                      View Profile →
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
