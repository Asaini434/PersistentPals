import React, { useCallback, useEffect, useState } from 'react';
import { patientService } from '../services/patientService';
import { providerService } from '../services/providerService';

/**
 * Remote Therapeutic Monitoring (RTM) screens.
 *   RtmCaseload: the "RTM Monitoring" tab on the client directory (every client, current 30-day period).
 *   RtmPanel: the RTM section on one client's page (enrollment and consent, status, documentation, review time).
 * Dates use the US format PTI asks for: M/d/yyyy, 12-hour clock, US Eastern time.
 */

// US formats required by the PTI tech spec: M/d/yyyy dates, 12-hour clock, US Eastern time.
export function fmtDate(value) {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric' });
}

export function fmtDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export const RTM_STATUS_LABEL = { Enrolled: 'Enrolled', NotEnrolled: 'Not enrolled', Withdrawn: 'Withdrawn' };
export const DOC_STATUS_LABEL = { NotStarted: 'Not started', InProgress: 'In progress', Complete: 'Complete' };

function DayProgress({ days, required }) {
  const pct = Math.min(100, Math.round((days / required) * 100));
  return (
    <div className="rtm-progress" title={`${days} of ${required} days with app data`}>
      <span className="rtm-progress-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} className={days >= required ? 'met' : ''} /></span>
      <span className="rtm-progress-text">{days} / {required}</span>
    </div>
  );
}

export function RtmCaseload({ providerId, onOpenClient }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    providerService.getRtm(providerId)
      .then((d) => { if (active) setData(d); })
      .catch((e) => { if (active) setError(e?.message || 'Unable to load RTM monitoring.'); });
    return () => { active = false; };
  }, [providerId]);

  if (error) return <div className="auth-error-banner" role="alert">{error}</div>;
  if (!data) return <div className="table-info-banner">Loading monitoring status…</div>;

  const { summary, clients, required_days: required } = data;
  return (
    <section className="rtm-card">
      <div className="rtm-head">
        <div>
          <h3>Remote Therapeutic Monitoring</h3>
          <p className="rtm-sub">Enrollment, consent, app-data days and documentation for each 30-day period.</p>
        </div>
      </div>

      <div className="rtm-stats">
        <div><strong>{summary.enrolled}</strong><span>of {summary.total} clients enrolled</span></div>
        <div><strong>{summary.qualifying_met}</strong><span>reached {required} data days this period</span></div>
        <div><strong>{summary.documentation_open}</strong><span>documentation open</span></div>
        <div><strong>{summary.documentation_complete}</strong><span>documentation complete</span></div>
      </div>

      <div className="patient-table-container">
        <table className="patient-table rtm-table">
          <thead>
            <tr>
              <th>Client</th><th>RTM</th><th>This period</th><th>Data days</th>
              <th>Last period</th><th>Mgmt time</th><th>Docs</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.patient_id} className="rtm-row" onClick={() => onOpenClient(c.patient_id)}>
                <td className="rtm-nowrap"><strong>{c.name}</strong></td>
                <td className="rtm-nowrap">
                  <span className={`rtm-chip ${c.rtm_status}`}>{RTM_STATUS_LABEL[c.rtm_status]}</span>
                  {c.rtm_status === 'Enrolled' && !c.consent_given && <span className="rtm-chip warn">No consent</span>}
                </td>
                {c.rtm_status === 'Enrolled' ? (
                  <>
                    <td className="rtm-nowrap">{fmtDate(c.period.start).replace(/\/\d{4}$/, '')} – {fmtDate(c.period.end)}<span className="rtm-sub-line">Day {c.period.day_number} of {c.period.length}</span></td>
                    <td><DayProgress days={c.data_days} required={required} /></td>
                    <td>
                      {c.last_period
                        ? <><DayProgress days={c.last_period.data_days} required={required} /></>
                        : <span className="rtm-muted">—</span>}
                    </td>
                    <td className="rtm-nowrap">{c.management_minutes} min</td>
                    <td className="rtm-nowrap"><span className={`rtm-chip doc-${c.documentation_status}`}>{DOC_STATUS_LABEL[c.documentation_status]}</span></td>
                  </>
                ) : (
                  <td colSpan={5} className="rtm-muted">Open the client to enroll and record consent.</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rtm-note">
        The {required}-day target and time definitions are placeholders until Persistent Technology confirms them. Statuses help
        track the workflow; they are not billing advice.
      </p>
    </section>
  );
}

function summaryText(clientName, d) {
  const m = d.metrics;
  return [
    `Remote Therapeutic Monitoring summary${clientName ? ` for ${clientName}` : ''}`,
    `Period: ${fmtDate(d.period.start)} to ${fmtDate(d.period.end)} (day ${d.period.day_number} of ${d.period.length})`,
    `Enrollment: ${RTM_STATUS_LABEL[d.enrollment.status]}; consent ${d.enrollment.consent_given ? `recorded ${fmtDate(d.enrollment.consent_date)}` : 'not recorded'}`,
    `Days with app data: ${m.data_days} (target ${d.qualifying.required_days}, ${d.qualifying.met ? 'met' : 'not yet met'})`,
    `App sessions: ${m.sessions}; time in app: ${m.engagement_minutes} min; mood check-ins: ${m.response_entries}`,
    `Provider data reviews: ${m.reviews}; client communications: ${m.communications}`,
    `Provider management time: ${m.management_minutes} min`,
    `Documentation status: ${DOC_STATUS_LABEL[d.documentation.status]}`,
  ].join('\n');
}

export function RtmPanel({ patientId, clientName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ status: 'NotEnrolled', consent_given: false, consent_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState({ activity_type: 'Review', minutes: 10, summary: '' });

  const load = useCallback(() => {
    return patientService.getRtm(patientId)
      .then((d) => {
        setData(d);
        setForm({
          status: d.enrollment.status,
          consent_given: d.enrollment.consent_given,
          consent_date: d.enrollment.consent_date || '',
          notes: d.enrollment.notes || '',
        });
      })
      .catch((e) => setError(e?.message || 'Unable to load RTM details.'));
  }, [patientId]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn, okText) => {
    setSaving(true); setError(''); setMsg('');
    try { await fn(); await load(); setMsg(okText); }
    catch (e) { setError(e?.message || 'Something went wrong.'); }
    finally { setSaving(false); }
  };

  if (!data && !error) return <section className="rtm-card"><p className="rtm-sub">Loading RTM details…</p></section>;
  if (!data) return <section className="rtm-card"><div className="auth-error-banner" role="alert">{error}</div></section>;

  const enrolled = data.enrollment.status === 'Enrolled';
  const m = data.metrics;
  const pct = Math.min(100, Math.round((data.qualifying.days / data.qualifying.required_days) * 100));

  return (
    <section className="rtm-card" aria-labelledby="rtm-title">
      <div className="rtm-head">
        <div>
          <h3 id="rtm-title">Remote Therapeutic Monitoring</h3>
          <p className="rtm-sub">Enrollment, consent, the current 30-day period and documentation.</p>
        </div>
        <span className={`rtm-chip ${data.enrollment.status}`}>{RTM_STATUS_LABEL[data.enrollment.status]}</span>
      </div>
      {error && <div className="auth-error-banner" role="alert">{error}</div>}
      {msg && <div className="rtm-ok" role="status">{msg}</div>}

      <form
        className="rtm-enroll"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => patientService.saveRtmEnrollment(patientId, form), 'Enrollment saved.');
        }}
      >
        <label>
          <span>Status</span>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="NotEnrolled">Not enrolled</option>
            <option value="Enrolled">Enrolled</option>
            <option value="Withdrawn">Withdrawn</option>
          </select>
        </label>
        <label className="rtm-check">
          <input type="checkbox" checked={form.consent_given}
            onChange={(e) => setForm({ ...form, consent_given: e.target.checked })} />
          <span>Client consent recorded</span>
        </label>
        <label>
          <span>Consent date</span>
          <input type="date" value={form.consent_date} disabled={!form.consent_given}
            onChange={(e) => setForm({ ...form, consent_date: e.target.value })} />
        </label>
        <label className="rtm-wide">
          <span>Notes</span>
          <input type="text" maxLength={1000} value={form.notes} placeholder="Optional"
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
        <button type="submit" className="btn-primary" disabled={saving || (form.status === 'Enrolled' && !form.consent_given)}>
          {saving ? 'Saving…' : 'Save enrollment'}
        </button>
      </form>

      {enrolled && (
        <>
          <div className="rtm-period">
            <div>
              <span className="rtm-label">Current period</span>
              <strong>{fmtDate(data.period.start)} to {fmtDate(data.period.end)}</strong>
              <span className="rtm-muted"> · day {data.period.day_number} of {data.period.length}</span>
            </div>
            <div className="rtm-progress wide" title="Days with app data this period">
              <span className="rtm-progress-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} className={data.qualifying.met ? 'met' : ''} /></span>
              <span className="rtm-progress-text">
                {data.qualifying.days} of {data.qualifying.required_days} data days{data.qualifying.met ? ' · target met' : ''}
              </span>
            </div>
          </div>

          <dl className="rtm-metrics">
            <div><dt>App sessions</dt><dd>{m.sessions}</dd></div>
            <div><dt>Time in app</dt><dd>{m.engagement_minutes} min</dd></div>
            <div><dt>Mood check-ins</dt><dd>{m.response_entries}</dd></div>
            <div><dt>Data reviews</dt><dd>{m.reviews}</dd></div>
            <div><dt>Communications</dt><dd>{m.communications}</dd></div>
            <div><dt>Management time</dt><dd>{m.management_minutes} min</dd></div>
          </dl>

          <div className="rtm-two">
            <div>
              <h4>Documentation</h4>
              <div className="rtm-seg" role="group" aria-label="Documentation status">
                {['NotStarted', 'InProgress', 'Complete'].map((s) => (
                  <button key={s} type="button" disabled={saving}
                    className={data.documentation.status === s ? 'active' : ''}
                    aria-pressed={data.documentation.status === s}
                    onClick={() => run(() => patientService.setRtmDocumentation(patientId, s), 'Documentation status updated.')}>
                    {DOC_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <button type="button" className="rtm-link"
                onClick={() => navigator.clipboard?.writeText(summaryText(clientName, data)).then(() => setMsg('Summary copied.'))}>
                Copy period summary
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              run(() => patientService.logRtmActivity(patientId, log).then(() => setLog({ ...log, summary: '' })), 'Time logged.');
            }}>
              <h4>Log review or management time</h4>
              <div className="rtm-log-row">
                <select value={log.activity_type} onChange={(e) => setLog({ ...log, activity_type: e.target.value })} aria-label="Type">
                  <option value="Review">Reviewed app data</option>
                  <option value="ManagementTime">Other management</option>
                </select>
                <input type="number" min="1" max="240" value={log.minutes} className="inline-minutes"
                  onChange={(e) => setLog({ ...log, minutes: e.target.value })} aria-label="Minutes" />
                <span className="rtm-muted">min</span>
              </div>
              <input type="text" maxLength={1000} placeholder="What did you review or do?" value={log.summary}
                onChange={(e) => setLog({ ...log, summary: e.target.value })} />
              <button type="submit" className="btn-secondary" disabled={saving}>Log time</button>
            </form>
          </div>

          {data.recent_activity.length > 0 && (
            <div className="rtm-tablewrap">
              <h4>Recent review and management time</h4>
              <table className="patient-table rtm-mini">
                <thead><tr><th>When</th><th>Type</th><th>Minutes</th><th>By</th><th>Summary</th></tr></thead>
                <tbody>
                  {data.recent_activity.map((a) => (
                    <tr key={a.id}>
                      <td>{fmtDateTime(a.started_at)}</td>
                      <td>{a.activity_type === 'Review' ? 'Data review' : 'Management'}</td>
                      <td>{a.minutes}</td><td>{a.provider_name}</td><td>{a.summary || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.history.length > 0 && (
            <div className="rtm-tablewrap">
              <h4>Previous periods</h4>
              <table className="patient-table rtm-mini">
                <thead><tr><th>Period</th><th>Data days</th><th>Management time</th><th>Documentation</th></tr></thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr key={h.start}>
                      <td>{fmtDate(h.start)} to {fmtDate(h.end)}</td>
                      <td>{h.data_days} / {data.qualifying.required_days}{h.qualifying_met ? ' · met' : ''}</td>
                      <td>{h.management_minutes} min</td>
                      <td><span className={`rtm-chip doc-${h.status}`}>{DOC_STATUS_LABEL[h.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="rtm-note">{data.notes}</p>
    </section>
  );
}