import React, { useEffect, useState } from 'react';
import { ChartCard, StackedBars } from '../charts/Charts';

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

const fmtTime = (value) =>
  value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
const fmtDateTime = (value) =>
  value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'None';

/**
 * A provider's time log: one day in detail (therapy sessions with start and end times,
 * notes written, time per client) plus the last 30 days toward the monthly target.
 * The admin page and the provider's own profile show exactly the same thing.
 *
 * loadActivity(day, tz) must resolve to { day, period }:
 *   day    the daily summary for that date
 *   period the 30-day summary (or null to hide that section)
 */
export default function ProviderTimeLog({ loadActivity }) {
  const todayString = new Date().toLocaleDateString('en-CA');
  const [day, setDay] = useState(todayString);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!day) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    loadActivity(day, TIME_ZONE)
      .then((result) => active && setData(result))
      .catch((err) => active && setError(err.message || 'Unable to load activity for this day.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // loadActivity is rebuilt on every render by the parent; the date is what should trigger a reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const dayData = data?.day;
  const period = data?.period;

  return (
    <>
      {/* One day: sessions, notes and time per client */}
      <section className="detail-section card">
        <div className="activity-toolbar">
          <h3 style={{ margin: 0, border: 'none' }}>Daily Activity</h3>
          <div className="activity-toolbar-controls">
            <input
              type="date"
              value={day}
              max={todayString}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              aria-label="Activity date"
            />
            {day !== todayString && (
              <button type="button" className="btn-secondary" onClick={() => setDay(todayString)}>
                Today
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="auth-error-banner" role="alert" style={{ marginTop: '12px' }}>
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {loading && !dayData && <p style={{ color: 'var(--text-muted)' }}>Loading activity…</p>}

        {dayData && (
          <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 150ms' }}>
            <div className="vitals-grid" style={{ marginTop: '16px' }}>
              <div className="vital-card">
                <span className="vital-label">Therapy Sessions</span>
                <span className="vital-value">
                  {dayData.summary.sessions_completed}
                  <span className="vital-sub"> / {dayData.summary.sessions_total}</span>
                </span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Clients Met</span>
                <span className="vital-value">{dayData.summary.patients_met}</span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Time in Therapy</span>
                <span className="vital-value">{dayData.summary.therapy_minutes}<span className="vital-sub"> min</span></span>
              </div>
              <div className="vital-card">
                <span className="vital-label">New Notes Written</span>
                <span className="vital-value">{dayData.summary.notes_written}</span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Chart Review Time</span>
                <span className="vital-value">{dayData.summary.review_minutes}<span className="vital-sub"> min</span></span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Communications</span>
                <span className="vital-value">{dayData.summary.communications}</span>
              </div>
            </div>

            <h4 className="activity-subhead">Therapy sessions</h4>
            {!dayData.sessions.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No therapy sessions on this day.</p>
            ) : (
              <div className="patient-table-container">
                <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Length</th>
                      <th>Mode</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayData.sessions.map((session) => (
                      <tr key={session.id}>
                        <td><strong>{session.patient_name}</strong></td>
                        <td>{fmtTime(session.started_at)}</td>
                        <td>{fmtTime(session.ended_at)}</td>
                        <td>{session.minutes} min</td>
                        <td>{session.mode === 'InPerson' ? 'In person' : session.mode}</td>
                        <td>
                          <span className={`status-chip status-${session.status.toLowerCase().replace(' ', '-')}`}>
                            {session.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="activity-subhead">Time spent on each client</h4>
            {!dayData.time_per_client.length ? (
              <p style={{ color: 'var(--text-muted)' }}>No chart review or communication logged on this day.</p>
            ) : (
              <div className="patient-table-container">
                <table className="patient-table" style={{ fontSize: '0.9rem' }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Reviewing data</th>
                      <th>Care management</th>
                      <th>Communication</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayData.time_per_client.map((row) => (
                      <tr key={row.patient_id}>
                        <td><strong>{row.patient_name}</strong></td>
                        <td>{row.review_minutes} min</td>
                        <td>{row.management_minutes} min</td>
                        <td>{row.communications ? `${row.communications} logged · ${row.communication_minutes} min` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Last 30 days: time per client toward the monthly target */}
      {period && (
        <section className="detail-section card">
          <div className="activity-toolbar">
            <div>
              <h3 style={{ margin: 0, border: 'none' }}>Last {period.window_days} Days</h3>
              <p className="profile-subtitle" style={{ margin: '4px 0 0' }}>
                Time spent per client toward the {period.target_minutes}-minute monthly target
              </p>
            </div>
            <span className="pill pill-active">
              {period.totals.enrolled_meeting_target} of {period.totals.enrolled_clients} enrolled clients at target
            </span>
          </div>

          <div className="vitals-grid" style={{ marginTop: '16px' }}>
            <div className="vital-card">
              <span className="vital-label">Therapy Sessions</span>
              <span className="vital-value">{period.totals.therapy_sessions}</span>
            </div>
            <div className="vital-card">
              <span className="vital-label">Notes Written</span>
              <span className="vital-value">{period.totals.notes_written}</span>
            </div>
            <div className="vital-card">
              <span className="vital-label">Monitoring Time</span>
              <span className="vital-value">{period.totals.rtm_minutes}<span className="vital-sub"> min</span></span>
            </div>
          </div>

          <ChartCard
            title="Time per client"
            subtitle={`Minutes in the last ${period.window_days} days; the line marks the ${period.target_minutes}-minute target`}
          >
            <StackedBars
              target={period.target_minutes}
              targetLabel={`${period.target_minutes} min target`}
              legend={[
                { label: 'Reviewing data', tone: 'purple' },
                { label: 'Care management', tone: 'slate' },
                { label: 'Communication', tone: 'rose' },
              ]}
              rows={period.clients.map((c) => ({
                key: c.patient_id,
                label: c.name,
                total: c.rtm_minutes,
                segments: [
                  { label: 'Reviewing data', value: c.review_minutes, tone: 'purple' },
                  { label: 'Care management', value: c.management_minutes, tone: 'slate' },
                  { label: 'Communication', value: c.communication_minutes, tone: 'rose' },
                ],
              }))}
            />
          </ChartCard>

          <div className="patient-table-container" style={{ marginTop: '16px' }}>
            <table className="patient-table" style={{ fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Monitoring</th>
                  <th>Reviewing</th>
                  <th>Care mgmt</th>
                  <th>Communication</th>
                  <th>Total</th>
                  <th>Therapy sessions</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {period.clients.map((client) => (
                  <tr key={client.patient_id}>
                    <td><strong>{client.name}</strong></td>
                    <td>{client.rtm_status === 'NotEnrolled' ? 'Not enrolled' : client.rtm_status}</td>
                    <td>{client.review_minutes} min</td>
                    <td>{client.management_minutes} min</td>
                    <td>{client.communication_minutes} min</td>
                    <td>
                      <span className={client.rtm_status === 'Enrolled' ? (client.target_met ? 'target-met' : 'target-short') : ''}>
                        {client.rtm_minutes} min
                        {client.rtm_status === 'Enrolled' && (client.target_met ? ' ✓' : ' · below target')}
                      </span>
                    </td>
                    <td>{client.therapy_sessions}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{fmtDateTime(client.last_activity_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}