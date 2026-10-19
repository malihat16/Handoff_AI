import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { fmtDay, fmtHours, niceTicks } from '../format';
import type { DayStat } from '../types';

function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (w: number) => setWidth(Math.max(260, Math.floor(w)));
    measure(el.clientWidth || 560);
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ---------------------------------------------------------------- frame with table twin
interface FrameProps {
  title: string;
  hint?: string;
  stale?: boolean;
  chart: ReactNode;
  table: ReactNode;
}

/** Every chart has a table twin: tooltips enhance, they never gate the numbers. */
export function ChartFrame({ title, hint, stale, chart, table }: FrameProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <section className="chart">
      <div className="chart__head">
        <div>
          <h3 className="chart__title">{title}</h3>
          {hint && <p className="chart__hint">{hint}</p>}
        </div>
        <div className="seg" role="group" aria-label={`${title}: view`}>
          <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Chart</button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
        </div>
      </div>
      <div className={`chart__body${stale ? ' is-stale' : ''}`}>{view === 'chart' ? chart : table}</div>
    </section>
  );
}

export function DayTable({ days, columns }: { days: DayStat[]; columns: { label: string; get: (d: DayStat) => string }[] }) {
  return (
    <div className="table-wrap">
      <table className="table table--compact">
        <thead>
          <tr>
            <th>Day</th>
            {columns.map((c) => <th key={c.label} className="r">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <td>{fmtDay(d.date)}</td>
              {columns.map((c) => <td key={c.label} className="r">{c.get(d)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- stacked columns
const SERIES = [
  { key: 'completed', label: 'Completed', color: 'var(--series-1)' },
  { key: 'failed', label: 'Failed or blocked', color: 'var(--series-2)' },
  { key: 'other', label: 'In progress or waiting', color: 'var(--series-gray)' },
] as const;

/** A column whose top corners are rounded and whose base sits square on the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function StackedColumns({ days }: { days: DayStat[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const rows = days.map((d) => ({
    date: d.date,
    completed: d.completed,
    failed: d.failed,
    other: Math.max(0, d.runs - d.completed - d.failed),
    total: d.runs,
  }));
  const H = 214;
  const m = { t: 22, r: 6, b: 28, l: 30 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = Math.max(0, ...rows.map((r) => r.total));
  const ticks = niceTicks(max, 4, true);
  const top = ticks[ticks.length - 1];
  const band = iw / rows.length;
  const bw = Math.min(24, band * 0.56);
  const y = (v: number) => m.t + ih * (1 - v / top);
  const peak = max > 0 ? rows.findIndex((r) => r.total === max) : -1;
  const sparse = band < 52;

  const tip = hover == null ? null : rows[hover];
  const tipX = hover == null ? 0 : Math.min(Math.max(m.l + band * (hover + 0.5), 84), W - 84);

  return (
    <div ref={ref}>
      <div className="legend">
        {SERIES.map((s) => (
          <span key={s.key} className="legend__item">
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative' }} onPointerLeave={() => setHover(null)}>
        <svg width={W} height={H} role="group" aria-label="Runs per day for the last seven days, by outcome">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis-line' : 'grid-line'} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
            </g>
          ))}
          {hover != null && (
            <rect x={m.l + band * hover} y={m.t - 6} width={band} height={ih + 6} rx={6} fill="var(--ink)" opacity={0.05} />
          )}
          {rows.map((r, i) => {
            const cx = m.l + band * (i + 0.5);
            const x = cx - bw / 2;
            const present = SERIES.filter((s) => r[s.key] > 0);
            let cum = 0;
            const marks = present.map((s, idx) => {
              const v = r[s.key];
              const yTop = y(cum + v);
              const yBottom = y(cum);
              const h = Math.max(2, yBottom - yTop - (idx > 0 ? 2 : 0)); // 2px surface gap between segments
              cum += v;
              return idx === present.length - 1
                ? <path key={s.key} d={topRounded(x, yTop, bw, h, 4)} fill={s.color} />
                : <rect key={s.key} x={x} y={yTop} width={bw} height={h} fill={s.color} />;
            });
            return (
              <g key={r.date} opacity={hover == null || hover === i ? 1 : 0.5} style={{ transition: 'opacity .15s' }}>
                {marks}
                {i === peak && <text className="is-strong" x={cx} y={y(r.total) - 7} textAnchor="middle">{r.total}</text>}
                {(!sparse || i % 2 === 0) && <text x={cx} y={H - 9} textAnchor="middle">{fmtDay(r.date)}</text>}
              </g>
            );
          })}
          {rows.map((r, i) => (
            <rect
              key={`hit-${r.date}`}
              className="hit"
              x={m.l + band * i}
              y={m.t - 6}
              width={band}
              height={ih + 6}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={`${fmtDay(r.date, 'long')}: ${r.completed} completed, ${r.failed} failed, ${r.other} in progress or waiting`}
              onPointerEnter={() => setHover(i)}
              onPointerMove={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          ))}
        </svg>
        {tip && (
          <div className="tip" style={{ left: tipX, top: Math.max(y(tip.total), 28) }}>
            <div className="tip__head">{fmtDay(tip.date, 'long')}</div>
            {SERIES.map((s) => (
              <div key={s.key} className="tip__row">
                <span className="tip__key" style={{ background: s.color }} />
                {s.label}
                <span className="tip__val">{tip[s.key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- single-series area line
export function AreaLine({ days }: { days: DayStat[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const maxHours = Math.max(0, ...days.map((d) => d.hours_saved));
  const inMinutes = maxHours * 60 < 90;
  const scale = inMinutes ? 60 : 1;
  const unit = inMinutes ? 'min' : 'h';
  const values = days.map((d) => d.hours_saved * scale);
  const ticks = niceTicks(Math.max(0, ...values), 4, inMinutes);
  const top = ticks[ticks.length - 1];

  const H = 214;
  const m = { t: 22, r: 14, b: 28, l: 52 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = days.length;
  const inset = 12;
  const step = n > 1 ? (iw - inset * 2) / (n - 1) : 0;
  const px = (i: number) => m.l + inset + i * step;
  const py = (v: number) => m.t + ih * (1 - v / top);
  const base = py(0);

  const line = values.map((v, i) => `${i ? 'L' : 'M'}${px(i)},${py(v)}`).join('');
  const area = `${line}L${px(n - 1)},${base}L${px(0)},${base}Z`;
  const last = n - 1;

  const move = (clientX: number, rect: DOMRect) => {
    const i = Math.round((clientX - rect.left - m.l - inset) / (step || 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(n - 1, (h ?? last) + (e.key === 'ArrowRight' ? 1 : -1))));
  };
  const tipX = hover == null ? 0 : Math.min(Math.max(px(hover), 84), W - 84);

  return (
    <div ref={ref}>
      <div className="legend">
        <span className="legend__item">
          <span className="swatch" style={{ background: 'var(--series-1)' }} />
          Estimated time saved
        </span>
      </div>
      <div style={{ position: 'relative' }} onPointerLeave={() => setHover(null)}>
        <svg width={W} height={H} role="group" aria-label="Estimated time saved per day for the last seven days">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis-line' : 'grid-line'} x1={m.l} x2={W - m.r} y1={py(t)} y2={py(t)} />
              <text x={m.l - 8} y={py(t) + 4} textAnchor="end">{t === 0 ? '0' : `${t} ${unit}`}</text>
            </g>
          ))}
          <path d={area} fill="var(--series-1)" opacity={0.1} />
          <path d={line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {days.map((d, i) => (
            <text key={d.date} x={px(i)} y={H - 9} textAnchor="middle" style={{ display: W < 420 && i % 2 ? 'none' : undefined }}>
              {fmtDay(d.date)}
            </text>
          ))}
          {hover != null && (
            <line x1={px(hover)} x2={px(hover)} y1={m.t - 6} y2={base} stroke="var(--ink-3)" strokeWidth={1} />
          )}
          <circle cx={px(last)} cy={py(values[last])} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          {hover != null && hover !== last && (
            <circle cx={px(hover)} cy={py(values[hover])} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
          )}
          {hover == null && values[last] > 0 && (
            <text className="is-strong" x={px(last)} y={py(values[last]) - 11} textAnchor="end">
              {fmtHours(days[last].hours_saved)}
            </text>
          )}
          <rect
            className="hit"
            x={m.l}
            y={m.t - 6}
            width={iw}
            height={ih + 6}
            fill="transparent"
            tabIndex={0}
            role="img"
            aria-label="Time saved per day. Use the left and right arrow keys to read each day."
            onPointerMove={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerEnter={(e) => move(e.clientX, e.currentTarget.getBoundingClientRect())}
            onFocus={() => setHover(last)}
            onBlur={() => setHover(null)}
            onKeyDown={onKey}
          />
        </svg>
        {hover != null && (
          <div className="tip" style={{ left: tipX, top: Math.max(py(values[hover]), 28) }}>
            <div className="tip__head">{fmtDay(days[hover].date, 'long')}</div>
            <div className="tip__row">
              <span className="tip__key" style={{ background: 'var(--series-1)' }} />
              Time saved
              <span className="tip__val">{fmtHours(days[hover].hours_saved)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sparkline
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const W = 92;
  const H = 30;
  const pad = 4;
  const max = Math.max(0, ...values);
  const pts = values.map((v, i) => [
    pad + (i * (W - pad * 2)) / Math.max(1, values.length - 1),
    H - pad - (max ? (v / max) * (H - pad * 2) : 0),
  ]);
  const end = pts[pts.length - 1];
  return (
    <svg width={W} height={H} role="img" aria-label={label} style={{ flex: 'none' }}>
      <polyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="var(--series-gray)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={end[0]} cy={end[1]} r={3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}
