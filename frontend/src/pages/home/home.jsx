import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { providerService } from '../../services/providerService';

/**
 * Home: welcome hero, a guided map of the dashboard for new users (styled after PTI's "Where Reflect XR fits"
 * diagram), and a compact HIPAA readiness self-assessment. Styles are in index.css under "HOME".
 */

// A guided map of the dashboard for new users, in the style of PTI's "Where Reflect XR fits" diagram.
// Each area has a few features. Click a feature to read what it is; features with a destination can be opened.
const ICONS = {
  clients: (<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.5c2 .8 3.5 2.8 3.5 5.5" /></>),
  rtm: (<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 13l2 2 4-4" /></>),
  work: (<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>),
  apps: (<><rect x="2" y="8" width="20" height="9" rx="3" /><circle cx="8" cy="12.5" r="2" /><circle cx="16" cy="12.5" r="2" /></>),
  safety: (<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>),
  admin: (<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></>),
};

const BRANCHES = [
  {
    id: 'clients', label: 'Your clients', icon: 'clients', roles: ['provider'],
    text: 'Everything about the people you support, in one place.',
    leaves: [
      { id: 'activity', label: 'App activity', to: '/logs/patient-list',
        text: 'Start here. Charts of which modules clients use, when they log in, and who has gone quiet.' },
      { id: 'directory', label: 'Client directory', to: '/logs/patient-list',
        text: 'The last tab on the same page. Search your clients and open any record.' },
      { id: 'record', label: 'Client record',
        text: 'Open a client to see app sessions with start and end times, mood after sessions, medical history and medications.' },
      { id: 'notes', label: 'Notes & communication log',
        text: 'Add progress notes and log phone, email or text contact. Both are recorded in the audit trail.' },
    ],
  },
  {
    id: 'rtm', label: 'Monitoring (RTM)', icon: 'rtm', roles: ['provider'],
    text: 'Remote Therapeutic Monitoring as a clinical workflow.',
    leaves: [
      { id: 'rtmtab', label: 'RTM monitoring tab', to: '/logs/patient-list',
        text: 'The second tab on the client page: who is enrolled, days with app data in the current 30-day period, and documentation status.' },
      { id: 'consent', label: 'Enrollment & consent',
        text: 'On a client record, record enrollment and consent. A client cannot be enrolled without recorded consent.' },
      { id: 'docs', label: 'Period documentation',
        text: 'Mark each 30-day period not started, in progress or complete, and copy a plain-text period summary.' },
      { id: 'time', label: 'Review time',
        text: 'Log time spent reviewing a client’s app data or on other management work.' },
    ],
  },
  {
    id: 'me', label: 'Your work', icon: 'work', roles: ['provider'],
    text: 'Your own time in the dashboard.',
    leaves: [
      { id: 'profile', label: 'My profile & time log', to: '/providers/me',
        text: 'Your details plus a daily log of what you viewed and how long.' },
      { id: 'chat', label: 'AI assistant',
        text: 'The chat button in the corner answers questions about your caseload. It runs on a local model so client data stays on your machine.' },
    ],
  },
  {
    id: 'admin', label: 'Practice admin', icon: 'admin', roles: ['admin'],
    text: 'Oversight of clinicians.',
    leaves: [
      { id: 'providers', label: 'Clinician directory', to: '/admin/providers',
        text: 'All clinicians and their caseloads.' },
      { id: 'daily', label: 'Daily activity',
        text: 'Open a clinician to see what they did on a chosen day: sessions, records viewed, time spent.' },
    ],
  },
  {
    id: 'apps', label: 'Reflect apps', icon: 'apps', roles: ['provider', 'admin'],
    text: 'Where the client activity data comes from.',
    leaves: [
      { id: 'xr', label: 'Reflect XR',
        text: 'VR art therapy modules such as Color Psychology, Catharsis and Flow.' },
      { id: 'mobile', label: 'Reflect Mobile',
        text: 'Mobile modules such as Finger Painting, Pour Paint and Reflection Journals. Some use AI.' },
    ],
  },
  {
    id: 'safety', label: 'Privacy & safety', icon: 'safety', roles: ['provider', 'admin'],
    text: 'How the prototype protects information.',
    leaves: [
      { id: 'rbac', label: 'Role-based access',
        text: 'Confidentiality: admins and providers see different pages, and a provider can open only assigned clients.' },
      { id: 'sig', label: 'Digital signature',
        text: 'Integrity: login tokens are signed with an RSA key, so a changed role or user id is rejected.' },
      { id: 'soft', label: 'Soft delete',
        text: 'Resilience: removed records are flagged rather than erased, so they can be recovered.' },
      { id: 'score', label: 'Readiness self-assessment', to: '#readiness',
        text: 'The safeguards checklist further down this page.' },
    ],
  },
];

const W = 1000;
const H = 640;
const HUB = { x: 500, y: 285 };
// Icon centre of each area. `side` is where the text sits relative to the icon, so connectors never cross text.
const SLOTS = {
  five: [
    { x: 305, y: 105, side: 'left' }, { x: 695, y: 105, side: 'right' },
    { x: 262, y: 330, side: 'left' }, { x: 738, y: 330, side: 'right' },
    { x: 440, y: 525, side: 'right' },
  ],
  four: [
    { x: 305, y: 105, side: 'left' }, { x: 695, y: 105, side: 'right' },
    { x: 262, y: 330, side: 'left' }, { x: 440, y: 525, side: 'right' },
  ],
  three: [
    { x: 305, y: 120, side: 'left' }, { x: 695, y: 120, side: 'right' }, { x: 440, y: 525, side: 'right' },
  ],
};

const HALO = 122;
const ICON_R = 34;

function connector(slot) {
  const dx = slot.x - HUB.x;
  const dy = slot.y - HUB.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const s = { x: HUB.x + ux * HALO, y: HUB.y + uy * HALO };
  const e = { x: slot.x - ux * ICON_R, y: slot.y - uy * ICON_R };
  const vertical = Math.abs(e.y - s.y) > Math.abs(e.x - s.x);
  const d = vertical
    ? `M ${s.x} ${s.y} C ${s.x} ${s.y + (e.y - s.y) * 0.55}, ${e.x} ${e.y - (e.y - s.y) * 0.45}, ${e.x} ${e.y}`
    : `M ${s.x} ${s.y} C ${s.x + (e.x - s.x) * 0.55} ${s.y}, ${e.x - (e.x - s.x) * 0.45} ${e.y}, ${e.x} ${e.y}`;
  return { d, s };
}

function KnowledgeGraph({ role = 'provider' }) {
  const navigate = useNavigate();
  const branches = useMemo(() => BRANCHES.filter((b) => b.roles.includes(role)), [role]);
  const slots = SLOTS[branches.length === 5 ? 'five' : branches.length === 4 ? 'four' : 'three'];
  const all = useMemo(() => branches.flatMap((b) => [b, ...b.leaves.map((l) => ({ ...l, parent: b.id }))]), [branches]);
  const [selectedId, setSelectedId] = useState(role === 'admin' ? 'providers' : 'activity');
  const selected = all.find((n) => n.id === selectedId) || all[0];

  const open = (node) => {
    if (!node.to) return;
    if (node.to.startsWith('#')) {
      document.getElementById(node.to.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate(node.to);
    }
  };

  return (
    <section className="kg-card" aria-labelledby="kg-title">
      <h3 id="kg-title" className="pti-title"><span>Where everything lives</span></h3>
      <p className="kg-sub">Select any item to see what it is. Items with an arrow can be opened directly.</p>

      <svg className="kg-svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Map of the dashboard">
        {branches.map((b, i) => {
          const { d, s } = connector(slots[i]);
          return (
            <g key={`c-${b.id}`}>
              <path d={d} className="kg-curve" />
              <circle cx={s.x} cy={s.y} r="4.5" className="kg-dot" />
            </g>
          );
        })}

        <g className="kg-hub">
          <circle cx={HUB.x} cy={HUB.y} r="122" className="kg-halo" />
          <circle cx={HUB.x} cy={HUB.y} r="104" className="kg-ring" />
          <text x={HUB.x} y={HUB.y - 6} textAnchor="middle" className="kg-hub-title">REFLECT</text>
          <text x={HUB.x} y={HUB.y + 20} textAnchor="middle" className="kg-hub-sub">PROVIDER DASHBOARD</text>
        </g>

        {branches.map((b, i) => {
          const s = slots[i];
          const active = selectedId === b.id;
          const left = s.side === 'left';
          return (
            <g key={b.id} transform={`translate(${s.x} ${s.y})`}>
              <g
                className={`kg-area ${active ? 'is-active' : ''}`}
                role="button" tabIndex={0} aria-pressed={active} aria-label={`${b.label}. ${b.text}`}
                onClick={() => setSelectedId(b.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(b.id); } }}
              >
                <circle r="34" className="kg-icon-bg" />
                <g transform="translate(-14 -14) scale(1.17)" className="kg-icon">{ICONS[b.icon]}</g>
                <text x={left ? -52 : 52} y="-8" textAnchor={left ? 'end' : 'start'} className="kg-area-title">{b.label.toUpperCase()}</text>
              </g>
              {b.leaves.map((leaf, j) => {
                const isActive = selectedId === leaf.id;
                return (
                  <g
                    key={leaf.id}
                    className={`kg-leaf ${isActive ? 'is-active' : ''}`}
                    transform={`translate(${left ? -52 : 52} ${16 + j * 24})`}
                    role="button" tabIndex={0} aria-pressed={isActive} aria-label={`${leaf.label}. ${leaf.text}`}
                    onClick={() => setSelectedId(leaf.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(leaf.id); } }}
                  >
                    <rect x={left ? -236 : -6} y="-14" width="242" height="22" rx="6" className="kg-leaf-hit" />
                    <circle cx={left ? 0 : 0} cy="-3" r="3" className="kg-leaf-dot" />
                    <text x={left ? -12 : 12} y="1" textAnchor={left ? 'end' : 'start'}>{leaf.label}{leaf.to ? '  ›' : ''}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <div className="kg-detail" aria-live="polite">
        <div>
          <span className="kg-kind">{selected.parent ? branches.find((b) => b.id === selected.parent)?.label : 'Area'}</span>
          <h4>{selected.label}</h4>
          <p>{selected.text}</p>
        </div>
        {selected.to && (
          <button type="button" className="kg-go" onClick={() => open(selected)}>
            {selected.to.startsWith('#') ? 'Jump to it' : 'Open'}
          </button>
        )}
      </div>
    </section>
  );
}

const STATUS_LABEL = { met: 'In place', partial: 'Partly', planned: 'Planned' };

function MiniRing({ score }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg className="rr-ring" viewBox="0 0 64 64" role="img" aria-label={`Readiness score ${score} out of 100`}>
      <circle cx="32" cy="32" r={r} className="rr-ring-track" />
      <circle cx="32" cy="32" r={r} className="rr-ring-fill" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" className="rr-ring-num">{score}</text>
    </svg>
  );
}

function ReadinessReport() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    providerService.getReadiness()
      .then((data) => { if (active) setReport(data); })
      .catch((e) => { if (active) setError(e?.message || 'Could not load the readiness report.'); });
    return () => { active = false; };
  }, []);

  return (
    <section id="readiness" className="rr-card" aria-labelledby="rr-title">
      {error && <div className="auth-error-banner" role="alert">{error}</div>}
      {!report && !error && <p className="kg-sub">Checking safeguards…</p>}
      {report && (
        <>
          <div className="rr-row">
            <MiniRing score={report.score} />
            <div className="rr-main">
              <h3 id="rr-title">HIPAA readiness self-assessment</h3>
              <p className="rr-line">
                {report.met} of {report.total} safeguards in place
                {report.partial ? `, ${report.partial} partly` : ''}, {report.planned} planned. Not a compliance certification.
              </p>
            </div>
            <button type="button" className="rr-toggle" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Hide details' : 'View details'}
            </button>
            <ul className="rr-pillars" aria-label="Safeguards by area">
              {report.pillars.map((p) => {
                const total = p.met + p.partial + p.planned;
                return (
                  <li key={p.pillar} title={`${p.pillar}: ${p.met} of ${total} in place`}>
                    <span className="rr-bar" aria-hidden="true">
                      <i className="met" style={{ width: `${(p.met / total) * 100}%` }} />
                      <i className="partial" style={{ width: `${(p.partial / total) * 100}%` }} />
                    </span>
                    <span className="rr-pillar-name">{p.pillar}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {showAll && (
            <>
              <ul className="rr-list">
                {report.checks.map((c) => (
                  <li key={c.key}>
                    <span className={`rr-chip ${c.status}`}>{STATUS_LABEL[c.status]}</span>
                    <div>
                      <strong>{c.title}</strong>
                      <span className="rr-pillar-tag">{c.pillar}{c.live ? ' · checked live' : ''}</span>
                      <p>{c.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="rr-disclaimer">{report.disclaimer}</p>
            </>
          )}
        </>
      )}
    </section>
  );
}

export default function Home() {
  const { user, isAdmin } = useAuth();
  const role = isAdmin ? 'admin' : 'provider';
  const first = (user?.name || '').replace(/^Dr\.?\s+/i, '').split(' ')[0];
  const title = first ? `Welcome, ${/^Dr/i.test(user.name) ? 'Dr. ' : ''}${first}` : 'Welcome';

  return (
    <div className="home-page">
      <section className="home-hero">
        <p className="home-eyebrow">Reflect XR | Reflect Mobile</p>
        <h2>{title}</h2>
        <p className="home-lede">
          {isAdmin
            ? 'Oversee clinicians and see how their clients use Reflect XR and Reflect Mobile.'
            : 'See how your clients engage with Reflect XR and Reflect Mobile, track remote monitoring, and keep your notes in one place.'}
        </p>
        <div className="home-actions">
          <Link to={isAdmin ? '/admin/providers' : '/logs/patient-list'} className="home-btn primary">
            {isAdmin ? 'Open clinician directory' : 'Open client activity'}
          </Link>
          <a href="#readiness" className="home-btn outline">Safeguards</a>
        </div>
      </section>
      <KnowledgeGraph role={role} />
      <ReadinessReport />
    </div>
  );
}