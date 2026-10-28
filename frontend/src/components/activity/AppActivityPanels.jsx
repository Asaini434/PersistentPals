import React, { useEffect, useState } from 'react';
import {
  AreaChart,
  BarChart,
  ChartCard,
  ChartEmpty,
  HBarList,
  HourChart,
  SplitBar,
  daypartBreakdown,
  fmtHour,
  fmtMinutes,
  fmtShortDate,
} from '../charts/Charts';
import { patientService } from '../../services/patientService';
import { providerService } from '../../services/providerService';

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
const RANGES = [14, 30, 90];

const platformTone = (platform) => (platform === 'XR' ? 'purple' : 'rose');

function lastActiveText(daysSince) {
  if (daysSince == null) return 'Never';
  if (daysSince <= 0) return 'Today';
  if (daysSince === 1) return 'Yesterday';
  return `${daysSince} days ago`;
}

const fmtWhen = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';

function RangeToggle({ days, onChange }) {
  return (
    <div className="range-toggle" role="group" aria-label="Time range">
      {RANGES.map((value) => (
        <button key={value} type="button" className={days === value ? 'active' : ''} onClick={() => onChange(value)}>
          {value} days
        </button>
      ))}
    </div>
  );
}

function moduleItems(rows, limit, showClients) {
  return rows.slice(0, limit).map((m) => ({
    key: m.id,
    label: m.name,
    chips: [
      { text: m.platform, tone: m.platform === 'XR' ? 'xr' : 'mobile' },
      ...(m.uses_ai ? [{ text: 'AI', tone: 'ai' }] : []),
    ],
    value: m.sessions,
    valueLabel: `${m.sessions} ${m.sessions === 1 ? 'session' : 'sessions'}${showClients ? ` · ${m.clients} ${m.clients === 1 ? 'client' : 'clients'}` : ''} · ${fmtMinutes(m.minutes)}`,
    tone: platformTone(m.platform),
  }));
}

function DaypartRow({ counts }) {
  const parts = daypartBreakdown(counts);
  const top = Math.max(...parts.map((p) => p.sessions));
  if (!top) return null;
  return (
    <div className="daypart-row">
      {parts.map((p) => (
        <div key={p.label} className={`daypart${p.sessions === top ? ' top' : ''}`}>
          <span className="daypart-name">{p.label}</span>
          <span className="daypart-pct">{p.percent}%</span>
        </div>
      ))}
    </div>
  );
}

function peakHourText(counts) {
  const max = Math.max(...counts);
  if (!max) return 'No sessions yet';
  const hour = counts.indexOf(max);
  return `Busiest hour: ${fmtHour(hour)} to ${fmtHour((hour + 1) % 24)}`;
}

function Shell({ title, subtitle, days, onDays, children }) {
  return (
    <section className="detail-section card activity-panel">
      <div className="activity-panel-head">
        <div>
          <h3>{title}</h3>
          <p className="profile-subtitle" style={{ margin: '4px 0 0' }}>{subtitle}</p>
        </div>
        <RangeToggle days={days} onChange={onDays} />
      </div>
      {children}
    </section>
  );
}

function useLoad(loader, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    loader()
      .then((data) => active && setState({ data, loading: false, error: '' }))
      .catch((err) => active && setState({ data: null, loading: false, error: err.message || 'Unable to load app activity.' }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

function ErrorBanner({ message }) {
  return (
    <div className="auth-error-banner" role="alert">
      <span className="error-icon">⚠️</span>
      <span>{message}</span>
    </div>
  );
}

/**
 * One client's use of Reflect XR / Reflect Mobile.
 * Backed by GET /patients/{id}/activity.
 */
export function ClientAppActivity({ patientId }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useLoad(
    () => patientService.getActivity(patientId, { days, tz: TIME_ZONE }),
    [patientId, days],
  );

  const subtitle = `How this client uses the apps · times shown in ${TIME_ZONE.replace('_', ' ')}`;

  if (error) {
    return (
      <Shell title="App Activity" subtitle={subtitle} days={days} onDays={setDays}>
        <ErrorBanner message={error} />
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell title="App Activity" subtitle={subtitle} days={days} onDays={setDays}>
        <p style={{ color: 'var(--text-muted)' }}>Loading app activity…</p>
      </Shell>
    );
  }

  const s = data.summary;
  const top = data.by_module[0];
  const trend = s.sessions_last_7 - s.sessions_prev_7;

  return (
    <Shell title="App Activity" subtitle={subtitle} days={days} onDays={setDays}>
      <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 150ms' }}>
        {!s.sessions ? (
          <ChartEmpty>No app activity in the last {days} days.</ChartEmpty>
        ) : (
          <>
            <div className="vitals-grid" style={{ marginBottom: 16 }}>
              <div className="vital-card">
                <span className="vital-label">Sessions</span>
                <span className="vital-value">{s.sessions}</span>
                <span className="vital-note">
                  {s.sessions_last_7} in the last 7 days
                  {trend !== 0 ? ` (${trend > 0 ? '+' : ''}${trend} vs the week before)` : ''}
                </span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Time in app</span>
                <span className="vital-value">{fmtMinutes(s.minutes)}</span>
                <span className="vital-note">about {s.avg_minutes} min per session</span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Active days</span>
                <span className="vital-value">
                  {s.active_days}
                  <span className="vital-sub"> of {data.window_days}</span>
                </span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Last active</span>
                <span className="vital-value" style={{ fontSize: '1.05rem' }}>{lastActiveText(s.days_since_last)}</span>
                <span className="vital-note">{fmtWhen(s.last_active_at)}</span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Mood after sessions</span>
                <span className="vital-value">
                  {s.avg_mood != null ? s.avg_mood : '—'}
                  <span className="vital-sub"> / 5 avg</span>
                </span>
              </div>
              <div className="vital-card">
                <span className="vital-label">Most used</span>
                <span className="vital-value" style={{ fontSize: '1.05rem' }}>{top ? top.name : '—'}</span>
                {top && <span className="vital-note">{top.program} · {top.platform}</span>}
              </div>
            </div>

            <div className="chart-grid-layout">
              <ChartCard className="wide" title="Daily time in app" subtitle="Minutes per day, hover a bar for details">
                <BarChart
                  ariaLabel="Minutes in the apps per day"
                  tone="rose"
                  emptyText="No app activity in this period."
                  data={data.daily.map((d) => ({
                    label: fmtShortDate(d.day),
                    value: d.minutes,
                    tooltip: `${fmtShortDate(d.day)} · ${d.sessions} ${d.sessions === 1 ? 'session' : 'sessions'} · ${d.minutes} min`,
                  }))}
                  formatY={(v) => `${v}m`}
                />
              </ChartCard>

              <ChartCard title="Modules used" subtitle="Which modules this client opens most">
                <HBarList items={moduleItems(data.by_module, 6, false)} emptyText="No modules used yet." />
              </ChartCard>

              <ChartCard title="Time of day" subtitle={`When sessions start · ${peakHourText(data.by_hour)}`}>
                <HourChart counts={data.by_hour} ariaLabel="Sessions by hour of the day" />
                <DaypartRow counts={data.by_hour} />
              </ChartCard>

              <ChartCard title="XR vs mobile" subtitle="Share of sessions on each platform">
                <SplitBar
                  segments={data.by_platform.map((p) => ({
                    label: p.platform,
                    value: p.sessions,
                    tone: platformTone(p.platform),
                    valueLabel: fmtMinutes(p.minutes),
                  }))}
                />
                <div style={{ marginTop: 16 }}>
                  <HBarList
                    items={data.by_program.map((p) => ({
                      key: `${p.platform}-${p.program}`,
                      label: p.program,
                      chips: [{ text: p.platform, tone: p.platform === 'XR' ? 'xr' : 'mobile' }],
                      value: p.sessions,
                      valueLabel: `${p.sessions} ${p.sessions === 1 ? 'session' : 'sessions'}`,
                      tone: platformTone(p.platform),
                    }))}
                  />
                </div>
              </ChartCard>

              <ChartCard title="Mood after sessions" subtitle="Self-reported, 1 (low) to 5 (high)">
                <AreaChart
                  ariaLabel="Mood score after sessions over time"
                  tone="purple"
                  yMin={1}
                  yMax={5}
                  ticks={[1, 2, 3, 4, 5]}
                  data={(data.mood || []).map((m) => ({
                    label: new Date(m.recorded_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                    value: m.mood_score,
                    tooltip: `${fmtWhen(m.recorded_at)} · mood ${m.mood_score}/5`,
                  }))}
                  emptyText="No mood entries in this period."
                />
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

const STATUS_ORDER = { Inactive: 0, 'No activity': 1, 'Less active': 2, Steady: 3, 'More active': 4 };

function trendText(client) {
  const diff = client.sessions_last_7 - client.sessions_prev_7;
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '▬';
  return `${arrow} ${client.sessions_prev_7} → ${client.sessions_last_7}`;
}

/**
 * How one provider's whole caseload uses the apps (what, when, and who has gone quiet).
 * Backed by GET /providers/{id}/engagement. Pass onOpenClient to make client rows clickable.
 */
export function CaseloadEngagement({ providerId, onOpenClient, title = 'Client App Activity' }) {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useLoad(
    () => providerService.getEngagement(providerId, { days, tz: TIME_ZONE }),
    [providerId, days],
  );

  const subtitle = `How assigned clients use Reflect XR and Reflect Mobile · times shown in ${TIME_ZONE.replace('_', ' ')}`;

  if (error) {
    return (
      <Shell title={title} subtitle={subtitle} days={days} onDays={setDays}>
        <ErrorBanner message={error} />
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell title={title} subtitle={subtitle} days={days} onDays={setDays}>
        <p style={{ color: 'var(--text-muted)' }}>Loading app activity…</p>
      </Shell>
    );
  }

  const s = data.summary;
  const clients = [...data.clients].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name),
  );

  return (
    <Shell title={title} subtitle={subtitle} days={days} onDays={setDays}>
      <div style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 150ms' }}>
        <div className="vitals-grid" style={{ marginBottom: 16 }}>
          <div className="vital-card">
            <span className="vital-label">Clients using the apps</span>
            <span className="vital-value">
              {s.active_clients}
              <span className="vital-sub"> of {s.clients}</span>
            </span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Sessions</span>
            <span className="vital-value">{s.sessions}</span>
          </div>
          <div className="vital-card">
            <span className="vital-label">Time in app</span>
            <span className="vital-value">{fmtMinutes(s.minutes)}</span>
          </div>
          <div className={`vital-card${s.needs_attention ? ' warn' : ''}`}>
            <span className="vital-label">Need attention</span>
            <span className="vital-value">{s.needs_attention}</span>
            <span className="vital-note">no app use in 7+ days</span>
          </div>
        </div>

        {!s.sessions ? (
          <ChartEmpty>No app activity in the last {days} days.</ChartEmpty>
        ) : (
          <div className="chart-grid-layout">
            <ChartCard className="wide" title="Sessions per day" subtitle="All assigned clients combined, hover a point for details">
              <AreaChart
                ariaLabel="Client sessions per day"
                data={data.daily.map((d) => ({
                  label: fmtShortDate(d.day),
                  value: d.sessions,
                  tooltip: `${fmtShortDate(d.day)} · ${d.sessions} ${d.sessions === 1 ? 'session' : 'sessions'} from ${d.clients} ${d.clients === 1 ? 'client' : 'clients'} · ${d.minutes} min`,
                }))}
              />
            </ChartCard>

            <ChartCard title="Modules used" subtitle="Most-used modules across the caseload">
              <HBarList items={moduleItems(data.by_module, 8, true)} />
            </ChartCard>

            <ChartCard title="Time of day" subtitle={`When clients open the apps · ${peakHourText(data.by_hour)}`}>
              <HourChart counts={data.by_hour} ariaLabel="Client sessions by hour of the day" />
              <DaypartRow counts={data.by_hour} />
            </ChartCard>

            <ChartCard className="wide" title="XR vs mobile" subtitle="Share of sessions and the programs clients return to">
              <div className="chart-grid-layout" style={{ marginBottom: 0 }}>
                <div>
                  <SplitBar
                    segments={data.by_platform.map((p) => ({
                      label: p.platform,
                      value: p.sessions,
                      tone: platformTone(p.platform),
                      valueLabel: fmtMinutes(p.minutes),
                    }))}
                  />
                </div>
                <HBarList
                  items={data.by_program.slice(0, 5).map((p) => ({
                    key: `${p.platform}-${p.program}`,
                    label: p.program,
                    chips: [{ text: p.platform, tone: p.platform === 'XR' ? 'xr' : 'mobile' }],
                    value: p.sessions,
                    valueLabel: `${p.sessions} sessions`,
                    tone: platformTone(p.platform),
                  }))}
                />
              </div>
            </ChartCard>
          </div>
        )}

        <h4 className="activity-subhead">Client by client</h4>
        <div className="patient-table-container">
          <table className="patient-table" style={{ fontSize: '0.9rem' }}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Sessions</th>
                <th>Time in app</th>
                <th>Last active</th>
                <th title="Sessions in the last 7 days compared with the 7 days before">Week over week</th>
                <th>Latest mood</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.patient_id}
                  className={onOpenClient ? 'clickable-provider-row' : undefined}
                  onClick={onOpenClient ? () => onOpenClient(client.patient_id) : undefined}
                >
                  <td><strong>{client.name}</strong></td>
                  <td>{client.sessions}</td>
                  <td>{fmtMinutes(client.minutes)}</td>
                  <td>{lastActiveText(client.days_since_last)}</td>
                  <td className="trend-cell">{trendText(client)}</td>
                  <td>{client.latest_mood != null ? `${client.latest_mood} / 5` : '—'}</td>
                  <td>
                    <span className={`status-chip status-${client.status.toLowerCase().replace(' ', '-')}`}>{client.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}