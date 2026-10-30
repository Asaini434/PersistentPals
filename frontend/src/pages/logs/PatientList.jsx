import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patientService } from '../../services/patientService';
import { useAuth } from '../../context/AuthContext';
import { CaseloadEngagement } from '../../components/activity/AppActivityPanels';
import { RtmCaseload } from '../../components/RtmPanels';

/**
 * Client Directory & Clinical Logs
 * Backed by GET /logs/patient-list.
 */
export default function PatientList() {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [tab, setTab] = useState('activity'); // 'activity' | 'rtm' | 'clients'
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    patientService
      .getPatientLogs()
      .then((data) => {
        if (active) setPatients(data || []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load the client directory.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredPatients = patients.filter((patient) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (patient.name || '').toLowerCase().includes(term) ||
      (patient.id || '').toLowerCase().includes(term) ||
      (patient.email || '').toLowerCase().includes(term) ||
      (patient.condition || '').toLowerCase().includes(term);

    const matchesStatus =
      statusFilter === 'All' || (patient.status || '').toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

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

  const activeCount = patients.filter((p) => (p.status || '').toLowerCase() === 'active').length;

  return (
    <div className="page-container patient-list-page">
      <header className="page-header">
        <div>
          <h2>Client Directory & Clinical Logs</h2>
          <p className="subtitle">
            Real-time clinical overview of your assigned clients and their condition status
          </p>
        </div>
        <div className="stats-pills">
          <span className="pill">Total Clients: {patients.length}</span>
          <span className="pill pill-active">Active Conditions: {activeCount}</span>
        </div>
      </header>

      <div className="tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'activity'}
          className={`tab-btn${tab === 'activity' ? ' active' : ''}`}
          onClick={() => setTab('activity')}
        >
          App Activity
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'rtm'}
          className={`tab-btn${tab === 'rtm' ? ' active' : ''}`}
          onClick={() => setTab('rtm')}
        >
          RTM Monitoring
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'clients'}
          className={`tab-btn${tab === 'clients' ? ' active' : ''}`}
          onClick={() => setTab('clients')}
        >
          Client Directory
        </button>
      </div>

      {tab === 'activity' && (
        <CaseloadEngagement providerId={user.id} onOpenClient={(patientId) => navigate(`/patients/${patientId}`)} />
      )}

      {tab === 'rtm' && (
        <RtmCaseload providerId={user.id} onOpenClient={(patientId) => navigate(`/patients/${patientId}`)} />
      )}

      {tab === 'clients' && (
      <>
      <div className="toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by client ID, name, email, or condition..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-box">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Condition Statuses</option>
            <option value="Active">Active</option>
            <option value="Chronic">Chronic</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>
      </div>

      {loading && <div className="table-info-banner">Loading client directory…</div>}
      {error && (
        <div className="auth-error-banner" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="patient-table-container">
          <table className="patient-table">
            <thead>
              <tr>
                <th>Client ID</th>
                <th>Client Name</th>
                <th>Age / Gender</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2.5rem' }}>
                    No matching clients found in directory.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => (
                  <tr key={patient.id} className="clickable-provider-row" onClick={() => navigate(`/patients/${patient.id}`)}>
                    <td className="patient-id" style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{patient.id}</td>
                    <td className="patient-name">
                      <strong>{patient.name}</strong>
                      <div className="sub-text">{patient.email}</div>
                    </td>
                    <td>
                      {patient.age != null ? `${patient.age} y/o` : 'N/A'}{' '}
                      <span className="sub-text">({patient.gender || 'Unspecified'})</span>
                    </td>
                    <td className="diagnosis-cell">
                      <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{patient.condition || 'No condition on record'}</span>
                    </td>
                    <td>
                      <span className={getStatusBadgeClass(patient.status)}>
                        {patient.status || 'No record'}
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
      )}
      </>
      )}
    </div>
  );
}