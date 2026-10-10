import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPence } from '../lib/money';
import type { ProfitPoint, Rival } from '../lib/rivals';
import { Avatar, formatDate } from '../ui';

// ---------------------------------------------------------------------------
// Performance: running profit over time. One series (so no legend; the
// section title names it), a 2px line with a 10% wash down to £0, a hairline
// grid, an end-dot with a surface ring, and a crosshair + tooltip that snaps
// to the nearest game. The game-by-game list below is the table view.
// ---------------------------------------------------------------------------

const H = 220;
const M = { top: 14, right: 58, bottom: 26, left: 46 };

function niceStep(range: number, target = 4) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function compactPounds(pence: number) {
  const v = pence / 100;
  const abs = Math.abs(v);
  const s = abs >= 1000 ? `£${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '')}K` : `£${Math.round(abs)}`;
  return v < 0 ? `-${s}` : v > 0 ? `+${s}` : '£0';
}

export function PerformanceChart({ points }: { points: ProfitPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const totals = points.map((p) => p.total);
    let lo = Math.min(0, ...totals);
    let hi = Math.max(0, ...totals);
    if (lo === hi) hi = lo + 1000;
    const step = niceStep(hi - lo);
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t));
    const iw = width - M.left - M.right;
    const ih = H - M.top - M.bottom;
    const x = (i: number) => M.left + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = (v: number) => M.top + ih - ((v - lo) / (hi - lo)) * ih;
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join('');
    const area = `${line}L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
    // A few date labels along the bottom, never overlapping.
    const maxLabels = Math.max(2, Math.floor(iw / 70));
    const every = Math.max(1, Math.ceil(points.length / maxLabels));
    const xLabels = points.map((p, i) => ({ i, p })).filter(({ i }) => i % every === 0 || i === points.length - 1);
    if (xLabels.length > 1 && xLabels[xLabels.length - 1].i - xLabels[xLabels.length - 2].i < every / 2) xLabels.splice(xLabels.length - 2, 1);
    return { ticks, x, y, line, area, xLabels };
  }, [points, width]);

  if (points.length < 2) {
    return <div className="card small muted">Your chart appears after your first finalised game in this period.</div>;
  }

  const last = points[points.length - 1];
  const a = active === null ? null : points[active];
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * width;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(geo.x(i) - px) < Math.abs(geo.x(best) - px)) best = i;
    setActive(best);
  };

  return (
    <div className="chart-card card" ref={wrap}>
      <div style={{ position: 'relative' }}>
        <svg
          width="100%"
          viewBox={`0 0 ${width} ${H}`}
          role="img"
          aria-label={`Running profit over ${points.length - 1} games, now ${formatPence(last.total, { sign: true })}`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              e.preventDefault();
              const cur = active ?? points.length - 1;
              setActive(Math.min(points.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1))));
            }
          }}
          style={{ display: 'block', touchAction: 'pan-y', outline: 'none' }}
        >
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={geo.y(t)} y2={geo.y(t)} stroke={t === 0 ? 'var(--border-strong)' : 'var(--border)'} strokeWidth={1} />
              <text x={M.left - 8} y={geo.y(t)} dy="0.32em" textAnchor="end" className="chart-axis">
                {compactPounds(t)}
              </text>
            </g>
          ))}
          {geo.xLabels.map(({ i, p }) => (
            <text key={i} x={geo.x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="chart-axis">
              {formatDate(p.date, { day: 'numeric', month: 'short' })}
            </text>
          ))}
          <path d={geo.area} fill="var(--lime)" opacity={0.1} />
          <path d={geo.line} fill="none" stroke="var(--lime)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {a && (
            <>
              <line x1={geo.x(active!)} x2={geo.x(active!)} y1={M.top} y2={H - M.bottom} stroke="var(--text-faint)" strokeWidth={1} />
              <circle cx={geo.x(active!)} cy={geo.y(a.total)} r={5} fill="var(--lime)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
          <circle cx={geo.x(points.length - 1)} cy={geo.y(last.total)} r={4} fill="var(--lime)" stroke="var(--surface)" strokeWidth={2} />
          <text x={geo.x(points.length - 1) + 8} y={geo.y(last.total)} dy="0.32em" className="chart-end">
            {formatPence(last.total, { sign: true })}
          </text>
        </svg>
        {a && (
          <div
            className="chart-tip"
            style={{
              left: `${(geo.x(active!) / width) * 100}%`,
              transform: `translateX(${geo.x(active!) > width * 0.6 ? 'calc(-100% - 10px)' : '10px'})`,
            }}
          >
            <b className="num">{formatPence(a.total, { sign: true })}</b>
            <span className="tiny muted">
              {a.gameId ? (
                <>
                  {a.label} · {formatDate(a.date, { day: 'numeric', month: 'short', year: 'numeric' })}
                  <br />
                  That night: <span className="num">{formatPence(a.profit, { sign: true })}</span>
                </>
              ) : (
                'Start of period'
              )}
            </span>
          </div>
        )}
      </div>
      <div className="row-between tiny muted" style={{ marginTop: 6 }}>
        <span>
          {points.length - 1} {points.length - 1 === 1 ? 'game' : 'games'}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span aria-hidden style={{ width: 14, height: 2, background: 'var(--lime)', borderRadius: 2, display: 'inline-block' }} />
          Running profit
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rivalries
// ---------------------------------------------------------------------------

export function RivalCard({
  rival,
  kind,
  name,
  avatar,
}: {
  rival: Rival | null;
  kind: 'nemesis' | 'friend';
  name: (id: string) => string;
  avatar: (id: string) => string | null;
}) {
  const nemesis = kind === 'nemesis';
  return (
    <div className={`rival ${kind}`}>
      <span className="rival-icon" aria-hidden>
        {nemesis ? '🔥' : '♥'}
      </span>
      {rival ? (
        <>
          <Avatar name={name(rival.playerId)} src={avatar(rival.playerId)} size={56} />
          <b className="ellipsis" style={{ maxWidth: '100%' }}>
            {name(rival.playerId)}
          </b>
          <span className="small muted num">
            {rival.wins}W – {rival.losses}L{rival.ties ? ` – ${rival.ties}T` : ''}
          </span>
        </>
      ) : (
        <>
          <Avatar name="?" size={56} />
          <b className="muted">Nobody yet</b>
          <span className="small muted">&nbsp;</span>
        </>
      )}
      <span className="rival-label">{nemesis ? 'Arch nemesis' : 'Best friend'}</span>
      <span className="tiny faint">{nemesis ? 'Finishes above you most' : 'You finish above them most'}</span>
    </div>
  );
}
