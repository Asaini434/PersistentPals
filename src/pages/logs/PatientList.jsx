import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_PATIENTS } from '../../data/mockPatients';

/**
 * Logs / Patient List Page Component
 */
export default function PatientList() {
  const [patients] = useState(MOCK_PATIENTS);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const navigate = useNavigate();

  const filteredPatients = patients.filter((patient) => {
    const matchesSearch =
      patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.diagnosis.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus =
      statusFilter === 'All' || patient.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

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
    <div className="page-container patient-list-page">
      <header className="page-header">
        <div>
          <h2>Patient List & Clinical Logs</h2>
          <p className="subtitle">Real-time overview of active hospital patients and recent clinical updates</p>
        </div>
        <div className="stats-pills">
          <span className="pill">Total: {patients.length}</span>
          <span className="pill pill-active">Active: {patients.filter(p => p.status !== 'Discharged').length}</span>
        </div>
      </header>

      <div className="toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by ID, name, or diagnosis..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-box">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Admitted">Admitted</option>
            <option value="In Treatment">In Treatment</option>
            <option value="Observation">Observation</option>
            <option value="Discharged">Discharged</option>
          </select>
        </div>
      </div>

      <div className="patient-table-container">
        <table className="patient-table">
          <thead>
            <tr>
              <th>Patient ID</th>
              <th>Name</th>
              <th>Age / Gender</th>
              <th>Room</th>
              <th>Diagnosis</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                  No matching patients found.
                </td>
              </tr>
            ) : (
              filteredPatients.map((patient) => (
                <tr key={patient.id}>
                  <td className="patient-id">{patient.id}</td>
                  <td className="patient-name">
                    <strong>{patient.name}</strong>
                    <div className="sub-text">{patient.email}</div>
                  </td>
                  <td>{patient.age} y/o ({patient.gender})</td>
                  <td>{patient.room}</td>
                  <td className="diagnosis-cell">{patient.diagnosis}</td>
                  <td>
                    <span className={getStatusBadgeClass(patient.status)}>
                      {patient.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-secondary"
                      onClick={() => navigate(`/patients/${patient.id}`)}
                    >
                      View Details
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
