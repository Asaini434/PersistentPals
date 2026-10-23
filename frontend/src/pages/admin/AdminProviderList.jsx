import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminService } from '../../services/adminService';

/**
 * Admin: Providers Directory
 * Backed by GET /admin/providers.
 */
export default function AdminProviderList() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('All');
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    adminService
      .getProviders()
      .then((data) => {
        if (active) setProviders(data || []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load the clinicians directory.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const specialties = ['All', ...new Set(providers.map((p) => p.specialty).filter(Boolean))];

  const filteredProviders = providers.filter((provider) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (provider.name || '').toLowerCase().includes(term) ||
      (provider.id || '').toLowerCase().includes(term) ||
      (provider.email || '').toLowerCase().includes(term) ||
      (provider.username || '').toLowerCase().includes(term) ||
      (provider.specialty || '').toLowerCase().includes(term);

    const matchesSpecialty =
      specialtyFilter === 'All' || (provider.specialty || '') === specialtyFilter;

    return matchesSearch && matchesSpecialty;
  });

  const totalPatientsAssigned = providers.reduce((sum, p) => sum + (p.active_patient_count || 0), 0);

  return (
    <div className="page-container provider-list-page">
      <header className="page-header">
        <div>
          <h2>Clinicians Directory</h2>
          <p className="subtitle">
            Practice management registry of provider accounts and their active caseloads
          </p>
        </div>
        <div className="stats-pills">
          <span className="pill">Total Clinicians: {providers.length}</span>
          <span className="pill pill-active">Caseloads Covered: {totalPatientsAssigned}</span>
        </div>
      </header>

      {loading && <div className="table-info-banner">Loading clinicians directory…</div>}
      {error && (
        <div className="auth-error-banner" role="alert">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Quick Clinician Cards Grid */}
          <div className="quick-provider-grid">
            {providers.map((p) => (
              <div
                key={p.id}
                className="quick-provider-card"
                onClick={() => navigate(`/admin/providers/${p.id}`)}
              >
                <div className="quick-card-top">
                  <span className="patient-id" style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{p.id.slice(0, 8)}</span>
                </div>
                <div className="quick-card-name">{p.name}</div>
                <div className="quick-card-dept">{p.title || p.specialty || 'Provider'}</div>
                <div className="quick-card-meta">
                  <span>{p.active_patient_count} Active Clients</span>
                  <span className="quick-card-link">View Profile →</span>
                </div>
              </div>
            ))}
          </div>

          <div className="toolbar" style={{ marginTop: '24px' }}>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search by name, username, email, or specialty..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-box">
              <select value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)}>
                {specialties.map((specialty) => (
                  <option key={specialty} value={specialty}>
                    {specialty === 'All' ? 'All Specialties' : specialty}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-info-banner">
            <span>👥 Showing <strong>{filteredProviders.length}</strong> of <strong>{providers.length}</strong> provider accounts. Click any row or <strong>View Profile</strong> to open their caseload.</span>
          </div>

          <div className="patient-table-container">
            <table className="patient-table provider-table">
              <thead>
                <tr>
                  <th>Clinician & Title</th>
                  <th>Specialty</th>
                  <th>Username</th>
                  <th>Caseload</th>
                  <th>Last Login</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProviders.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2.5rem' }}>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '12px' }}>
                        No clinicians found matching your criteria.
                      </div>
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          setSearchTerm('');
                          setSpecialtyFilter('All');
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
                      <td className="patient-name">
                        <strong>{provider.name}</strong>
                        <div className="sub-text" style={{ color: 'var(--accent-coral)', fontSize: '0.8rem' }}>
                          {provider.title}
                        </div>
                        <div className="sub-text" style={{ fontSize: '0.75rem' }}>{provider.email}</div>
                      </td>
                      <td>{provider.specialty || 'Not specified'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{provider.username}</td>
                      <td>
                        <span className="pill" style={{ fontSize: '0.78rem', padding: '3px 8px', whiteSpace: 'nowrap' }}>
                          {provider.active_patient_count} Clients
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {provider.last_login_at || 'Never'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-view-details-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/admin/providers/${provider.id}`);
                          }}
                          title={`View full profile for ${provider.name}`}
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
        </>
      )}
    </div>
  );
}
