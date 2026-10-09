import { useId, useState } from 'react';

/*
 * Single-series trend line for a stat tile: 2px line, de-emphasised hue, the
 * current point in the accent. Hover/touch shows a crosshair and the value at
 * that point. One series, so no legend: the tile's label names it.
 */
export function Sparkline({
  points,
  format,
  max,
  label,
}: {
  points: { t: number; v: number }[];
  format: (v: number) => string;
  /** Fixed top of the scale (e.g. 100 for percentages) so the line isn't over-dramatised. */
  max?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId();
  const W = 120;
  const H = 32;

  if (points.length < 2) {
    return <div className="h-8" aria-hidden />;
  }

  const vs = points.map((p) => p.v);
  const top = max ?? Math.max(...vs) * 1.15;
  const bottom = max !== undefined ? 0 : Math.min(...vs) * 0.85;
  const span = top - bottom || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - bottom) / span) * (H - 4);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const last = points.length - 1;
  const at = hover ?? last;

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.round(((e.clientX - r.left) / r.width) * last));
  };

  const minutesAgo = Math.round((points[last]!.t - points[at]!.t) / 60_000);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-8 w-full touch-none overflow-visible"
        role="img"
        aria-label={`${label}, last ${Math.round((points[last]!.t - points[0]!.t) / 60_000)} minutes`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d}L${W},${H}L0,${H}Z`} fill={`url(#${gid})`} />
        <path
          d={d}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {hover !== null && (
          <line
            x1={x(at)}
            x2={x(at)}
            y1="0"
            y2={H}
            stroke="var(--color-line-strong)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {/* The marker is HTML so it stays round under preserveAspectRatio="none". */}
      <span
        aria-hidden
        className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
        style={{ left: `${(x(at) / W) * 100}%`, top: `${(y(points[at]!.v) / H) * 100}%` }}
      />
      {hover !== null && (
        <div className="tip tip-right pointer-events-none absolute bottom-full right-0 mb-1 whitespace-nowrap rounded-xs bg-fg px-2 py-0.5 font-mono text-[11px] text-surface shadow-lg">
          {format(points[at]!.v)} · {minutesAgo ? `${minutesAgo}m ago` : 'now'}
        </div>
      )}
    </div>
  );
}
