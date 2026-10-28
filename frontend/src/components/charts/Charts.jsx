import React, { useEffect, useId, useRef, useState } from 'react';
import './charts.css';

/**
 * Small dependency-free chart components (plain SVG + CSS, no chart library).
 * Colors come from the CSS variables in index.css, so they follow the Reflect theme.
 */

// ---------- formatting helpers ----------

export function fmtMinutes(minutes) {
  const total = Math.round(minutes || 0);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function fmtHour(hour) {
  return `${((hour + 11) % 12) + 1} ${hour < 12 ? 'AM' : 'PM'}`;
}

// 0 -> "12a", 15 -> "3p": short axis labels
function fmtHourShort(hour) {
  return `${((hour + 11) % 12) + 1}${hour < 12 ? 'a' : 'p'}`;
}

export function fmtShortDate(value) {
  // value is "YYYY-MM-DD" (a calendar day, not an instant), so build it without time-zone shifts
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------- layout helpers ----------

function useWidth(fallback = 480) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// 1 / 2 / 5 x 10^k steps so the y axis shows round numbers
function niceTicks(maxValue, count = 4) {
  if (maxValue <= 0) return [0, 1];
  const raw = maxValue / count;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  const ticks = [];
  for (let v = 0; v < maxValue + step; v += step) {
    ticks.push(Number(v.toFixed(6)));
    if (v >= maxValue) break;
  }
  return ticks;
}

const MARGIN = { top: 12, right: 10, bottom: 26, left: 36 };

function Axes({ width, height, ticks, yScale, formatY, xLabels }) {
  const innerW = width - MARGIN.left - MARGIN.right;
  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick}>
          <line className="chart-grid" x1={MARGIN.left} x2={MARGIN.left + innerW} y1={yScale(tick)} y2={yScale(tick)} />
          <text className="chart-axis-text" x={MARGIN.left - 6} y={yScale(tick) + 4} textAnchor="end">
            {formatY(tick)}
          </text>
        </g>
      ))}
      {xLabels.map((item) => (
        <text key={item.key} className="chart-axis-text" x={item.x} y={height - 8} textAnchor="middle">
          {item.text}
        </text>
      ))}
    </g>
  );
}

function pickLabelIndexes(count, innerW, minGap = 64) {
  if (count <= 1) return [0];
  const maxLabels = Math.max(2, Math.floor(innerW / minGap));
  const step = Math.ceil(count / maxLabels);
  const indexes = [];
  for (let i = 0; i < count; i += step) indexes.push(i);
  return indexes;
}

// ---------- chart card wrapper ----------

export function ChartCard({ title, subtitle, children, className = '', action }) {
  return (
    <div className={`chart-card ${className}`}>
      <div className="chart-card-head">
        <div>
          <h4 className="chart-card-title">{title}</h4>
          {subtitle && <p className="chart-card-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ChartEmpty({ children }) {
  return <p className="chart-empty">{children}</p>;
}

// ---------- area / line chart ----------

/**
 * data: [{ label, value, tooltip }] in x order.
 * yMin / yMax / ticks let a chart use a fixed scale (e.g. mood 1 to 5).
 */
export function AreaChart({
  data,
  height = 190,
  ariaLabel,
  yMin = 0,
  yMax,
  ticks,
  formatY = (v) => v,
  tone = 'rose',
  emptyText = 'Nothing to show for this period.',
}) {
  const [ref, width] = useWidth();
  const gradientId = `area-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const hasData = data.some((d) => d.value > 0);
  if (!data.length || !hasData) {
    return <ChartEmpty>{emptyText}</ChartEmpty>;
  }

  const maxValue = Math.max(...data.map((d) => d.value));
  const axisTicks = ticks || niceTicks(maxValue);
  const top = yMax ?? axisTicks[axisTicks.length - 1];
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const x = (i) => MARGIN.left + (data.length === 1 ? innerW / 2 : (i * innerW) / (data.length - 1));
  const y = (v) => MARGIN.top + innerH - ((v - yMin) / (top - yMin)) * innerH;

  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${y(yMin)} L${x(0).toFixed(1)},${y(yMin)} Z`;
  const labels = pickLabelIndexes(data.length, innerW).map((i) => ({ key: i, x: x(i), text: data[i].label }));

  return (
    <div ref={ref} className="chart-box">
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" className={`chart-stop chart-stop-${tone}`} stopOpacity="0.45" />
            <stop offset="100%" className={`chart-stop chart-stop-${tone}`} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <Axes width={width} height={height} ticks={axisTicks} yScale={y} formatY={formatY} xLabels={labels} />
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} className={`chart-line chart-line-${tone}`} fill="none" />
        {data.map((d, i) => (
          <circle key={i} className={`chart-dot chart-dot-${tone}`} cx={x(i)} cy={y(d.value)} r="3">
            <title>{d.tooltip || `${d.label}: ${d.value}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

// ---------- bar chart ----------

/** data: [{ label, value, tooltip }]. The tallest bar is highlighted. */
export function BarChart({
  data,
  height = 190,
  ariaLabel,
  labelEvery,
  formatY = (v) => v,
  tone = 'purple',
  emptyText = 'Nothing to show for this period.',
}) {
  const [ref, width] = useWidth();
  if (!data.length || !data.some((d) => d.value > 0)) {
    return <ChartEmpty>{emptyText}</ChartEmpty>;
  }

  const maxValue = Math.max(...data.map((d) => d.value));
  const axisTicks = niceTicks(maxValue);
  const top = axisTicks[axisTicks.length - 1];
  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const slot = innerW / data.length;
  const barW = Math.max(3, slot * 0.68);
  const y = (v) => MARGIN.top + innerH - (v / top) * innerH;

  const indexes = labelEvery
    ? data.map((_, i) => i).filter((i) => i % labelEvery === 0)
    : pickLabelIndexes(data.length, innerW);
  const labels = indexes.map((i) => ({ key: i, x: MARGIN.left + slot * i + slot / 2, text: data[i].label }));

  return (
    <div ref={ref} className="chart-box">
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        <Axes width={width} height={height} ticks={axisTicks} yScale={y} formatY={formatY} xLabels={labels} />
        {data.map((d, i) => {
          const barH = Math.max(d.value > 0 ? 2 : 0, MARGIN.top + innerH - y(d.value));
          return (
            <rect
              key={i}
              className={`chart-bar chart-bar-${tone}${d.value === maxValue ? ' chart-bar-peak' : ''}`}
              x={MARGIN.left + slot * i + (slot - barW) / 2}
              y={MARGIN.top + innerH - barH}
              width={barW}
              height={barH}
              rx="2"
            >
              <title>{d.tooltip || `${d.label}: ${d.value}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

/** 24 bars, one per hour of the day. counts[h] = number of sessions that started in hour h. */
export function HourChart({ counts, height = 190, ariaLabel }) {
  const data = counts.map((value, hour) => ({
    label: fmtHourShort(hour),
    value,
    tooltip: `${fmtHour(hour)}: ${value} ${value === 1 ? 'session' : 'sessions'}`,
  }));
  return <BarChart data={data} height={height} labelEvery={3} ariaLabel={ariaLabel} emptyText="No sessions to chart yet." />;
}

/** Morning 5 to 11, afternoon 12 to 4 PM, evening 5 to 8 PM, night 9 PM to 4 AM. */
export function daypartBreakdown(counts) {
  const parts = [
    { key: 'Morning', hours: [5, 6, 7, 8, 9, 10, 11] },
    { key: 'Afternoon', hours: [12, 13, 14, 15, 16] },
    { key: 'Evening', hours: [17, 18, 19, 20] },
    { key: 'Night', hours: [21, 22, 23, 0, 1, 2, 3, 4] },
  ];
  const total = counts.reduce((a, b) => a + b, 0);
  return parts.map((part) => {
    const sessions = part.hours.reduce((sum, h) => sum + counts[h], 0);
    return { label: part.key, sessions, percent: total ? Math.round((sessions / total) * 100) : 0 };
  });
}

// ---------- ranked horizontal bars ----------

/** items: [{ key, label, chips: [{ text, tone }], value, valueLabel, tone }] */
export function HBarList({ items, emptyText = 'Nothing to show.' }) {
  if (!items.length) return <ChartEmpty>{emptyText}</ChartEmpty>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="hbar-list">
      {items.map((item) => (
        <li key={item.key} className="hbar-row">
          <div className="hbar-top">
            <span className="hbar-label">
              {item.label}
              {(item.chips || []).map((chip) => (
                <span key={chip.text} className={`chip chip-${chip.tone || 'plain'}`}>
                  {chip.text}
                </span>
              ))}
            </span>
            <span className="hbar-value">{item.valueLabel}</span>
          </div>
          <div className="hbar-track">
            <div className={`hbar-fill hbar-${item.tone || 'rose'}`} style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- one bar split into parts (e.g. VR vs mobile) ----------

/** segments: [{ label, value, tone, valueLabel }] */
export function SplitBar({ segments }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (!total) return <ChartEmpty>No sessions to compare yet.</ChartEmpty>;
  return (
    <div className="splitbar">
      <div className="splitbar-track" role="img" aria-label={segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.label} className={`splitbar-part hbar-${s.tone}`} style={{ width: `${(s.value / total) * 100}%` }} />
          ))}
      </div>
      <ul className="splitbar-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className={`legend-dot hbar-${s.tone}`} />
            <strong>{s.label}</strong> {Math.round((s.value / total) * 100)}%
            {s.valueLabel && <span className="legend-sub"> · {s.valueLabel}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- stacked horizontal bars with a target line ----------

/**
 * rows: [{ key, label, segments: [{ value, tone, label }], total }]
 * target draws a vertical marker (e.g. the monthly minutes goal).
 */
export function StackedBars({ rows, target, targetLabel, legend }) {
  if (!rows.length) return <ChartEmpty>No time logged in this period.</ChartEmpty>;
  const max = Math.max(...rows.map((r) => r.total), target || 0, 1);
  return (
    <div className="stacked">
      {legend && (
        <ul className="splitbar-legend stacked-legend">
          {legend.map((l) => (
            <li key={l.label}>
              <span className={`legend-dot hbar-${l.tone}`} /> {l.label}
            </li>
          ))}
          {target ? (
            <li>
              <span className="legend-target" /> {targetLabel || `Target ${target}`}
            </li>
          ) : null}
        </ul>
      )}
      {rows.map((row) => (
        <div key={row.key} className="stacked-row">
          <span className="stacked-label" title={row.label}>
            {row.label}
          </span>
          <div className="stacked-track">
            {row.segments
              .filter((s) => s.value > 0)
              .map((s) => (
                <div
                  key={s.label}
                  className={`stacked-part hbar-${s.tone}`}
                  style={{ width: `${(s.value / max) * 100}%` }}
                  title={`${s.label}: ${s.value} min`}
                />
              ))}
            {target ? <div className="stacked-target" style={{ left: `${(target / max) * 100}%` }} /> : null}
          </div>
          <span className="stacked-total">{row.total} min</span>
        </div>
      ))}
    </div>
  );
}