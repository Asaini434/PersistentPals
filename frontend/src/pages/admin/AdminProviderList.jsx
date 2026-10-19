import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_PROVIDERS } from '../../data/mockProviders';

/**
 * Admin: Provider List & Directory Component
 * Allows administrators to see all healthcare providers in a table,
 * search/filter them, and view their individual details.
 */
export default function AdminProviderList() {
  const [providers] = useState(MOCK_PROVIDERS);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const navigate = useNavigate();

  // Extract unique departments for the dropdown
  const departments = ['All', ...new Set(providers.map((p) => p.department))];

  const filteredProviders = providers.filter((provider) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      provider.name.toLowerCase().includes(term) ||
      provider.id.toLowerCase().includes(term) ||
      provider.specialty.toLowerCase().includes(term) ||
      provider.department.toLowerCase().includes(term) ||
      provider.licenseNumber.toLowerCase().includes(term);

    const matchesDept =
      departmentFilter === 'All' || provider.department.toLowerCase() === departmentFilter.toLowerCase();

    const matchesStatus =
      statusFilter === 'All' || provider.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesDept && matchesStatus;
  });

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

  const totalPatientsAssigned = providers.reduce(
    (sum, p) => sum + (p.assignedPatients ? p.assignedPatients.length : 0),
    0
  );

  const activeStaffCount = providers.filter(
    (p) => p.status.toLowerCase() === 'active' || p.status.toLowerCase() === 'on-duty'
  ).length;

  return (
    <div className="page-container provider-list-page">
      <header className="page-header">
        <div>
          <h2>Healthcare Providers Directory</h2>
          <p className="subtitle">
            Administrative registry of clinical staff, active shifts, medical licensing, and patient coverage
          </p>
        </div>
        <div className="stats-pills">
          <span className="pill">Total Providers: {providers.length}</span>
          <span className="pill pill-active">Active / On-Duty: {activeStaffCount}</span>
          <span className="pill">Inpatients Covered: {totalPatientsAssigned}</span>
        </div>
      </header>

      {/* Quick Provider Cards Grid for Instant Navigation */}
      <div className="quick-provider-grid">
        {providers.map((p) => (
          <div
            key={p.id}
            className="quick-provider-card"
            onClick={() => navigate(`/admin/providers/${p.id}`)}
          >
            <div className="quick-card-top">
              <span className="patient-id">{p.id}</span>
              <span className={getStatusBadgeClass(p.status)}>{p.status}</span>
            </div>
            <div className="quick-card-name">{p.name}</div>
            <div className="quick-card-dept">{p.department}</div>
            <div className="quick-card-meta">
              <span>{p.assignedPatients.length} Patients</span>
              <span className="quick-card-link">View Details →</span>
            </div>
          </div>
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: '24px' }}>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by ID, doctor name, specialty, or license #..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-box">
          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept === 'All' ? 'All Departments' : dept}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-box">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="On-Duty">On-Duty</option>
            <option value="In Consultation">In Consultation</option>
            <option value="On Leave">On Leave</option>
          </select>
        </div>
      </div>

      <div className="table-info-banner">
        <span>📋 Showing <strong>{filteredProviders.length}</strong> of <strong>{providers.length}</strong> clinical providers. Click any row or the <strong>View Details</strong> button to open their individual page.</span>
      </div>

      <div className="patient-table-container">
        <table className="patient-table provider-table">
          <thead>
            <tr>
              <th style={{ width: '10%' }}>Provider ID</th>
              <th style={{ width: '22%' }}>Provider & Title</th>
              <th style={{ width: '25%' }}>Department & Office</th>
              <th style={{ width: '16%' }}>License & NPI</th>
              <th style={{ width: '10%' }}>Inpatients</th>
              <th style={{ width: '12%' }}>Status</th>
              <th style={{ width: '15%', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProviders.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
                    No healthcare providers found matching your criteria.
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setSearchTerm('');
                      setDepartmentFilter('All');
                      setStatusFilter('All');
                    }}
                  >
                    Clear Filters
                  </button>
                </td>
              </tr>
            ) : (
              filteredProviders.map((provider) => (
                <tr
                  key={provider.id}
                  className="clickable-provider-row"
                  onClick={() => navigate(`/admin/providers/${provider.id}`)}
                  title={`Click to open ${provider.name}'s details page`}
                >
                  <td className="patient-id">{provider.id}</td>
                  <td className="patient-name">
                    <strong>{provider.name}</strong>
                    <div className="sub-text" style={{ color: 'var(--accent-coral)', fontSize: '0.8rem' }}>
                      {provider.title}
                    </div>
                    <div className="sub-text" style={{ fontSize: '0.75rem' }}>{provider.email}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{provider.department}</div>
                    <div className="sub-text">{provider.specialty}</div>
                    <div className="sub-text" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                      📍 {provider.office}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: 600 }}>
                      {provider.licenseNumber}
                    </div>
                    <div className="sub-text" style={{ fontSize: '0.75rem' }}>NPI: {provider.npi}</div>
                  </td>
                  <td>
                    <span className="pill" style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap' }}>
                      {provider.assignedPatients.length} Patients
                    </span>
                  </td>
                  <td>
                    <span className={getStatusBadgeClass(provider.status)}>
                      {provider.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="btn-view-details-action"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/providers/${provider.id}`);
                      }}
                      title={`View full clinical profile for ${provider.name}`}
                    >
                      View Details →
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
