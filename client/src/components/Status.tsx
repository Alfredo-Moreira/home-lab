import {
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconHelpCircleFilled,
} from '@tabler/icons-react';
import { useState } from 'react';
import { cn, uptimePct } from '../lib/format';
import type { CheckState } from '../lib/types';

/*
 * Status is never color alone: every state has an icon and a word. The status
 * hues are reserved for state and not used for decoration anywhere else.
 */
const STATE: Record<CheckState, { label: string; text: string; bg: string; Icon: typeof IconCircleCheckFilled }> = {
  up: { label: 'Operational', text: 'text-good', bg: 'bg-good', Icon: IconCircleCheckFilled },
  degraded: { label: 'Slow', text: 'text-warning', bg: 'bg-warning', Icon: IconAlertTriangleFilled },
  down: { label: 'Down', text: 'text-critical', bg: 'bg-critical', Icon: IconCircleXFilled },
  unknown: { label: 'Not checked yet', text: 'text-muted', bg: 'bg-muted', Icon: IconHelpCircleFilled },
};

export function StatusBadge({ state, className }: { state: CheckState; className?: string }) {
  const { label, text, Icon } = STATE[state];
  // Cross-fade only when a service actually flips (up → down), never on mount:
  // mounting happens on every visit, and navigation doesn't animate.
  const [prev, setPrev] = useState(state);
  const [changed, setChanged] = useState(false);
  if (prev !== state) {
    // React's "adjust state while rendering" pattern: remember the last state.
    setPrev(state);
    setChanged(prev !== 'unknown');
  }
  return (
    <span
      key={state}
      className={cn('inline-flex items-center gap-1.5 text-xs font-medium text-fg', changed && 'state-in', className)}
    >
      <Icon size={14} className={cn('shrink-0', text)} aria-hidden />
      {label}
    </span>
  );
}

function bucketState(r: number | null): CheckState {
  if (r === null) return 'unknown';
  if (r >= 1) return 'up';
  return r >= 0.9 ? 'degraded' : 'down';
}

/**
 * 24 hourly uptime bars, oldest first. One hover/touch target over the whole
 * strip picks the nearest bar (hit area bigger than the mark). Screen readers
 * get the 24h percentage instead of 24 separate stops.
 */
export function UptimeBars({
  hours,
  uptime24h,
  animate = false,
}: {
  hours: (number | null)[];
  uptime24h: number | null;
  /** First visit only: the strip wipes in, oldest hour first. */
  animate?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = hours.length;

  const pick = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setActive(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))));
  };

  const label = (i: number) => {
    const hoursAgo = n - i;
    const r = hours[i] ?? null;
    const when = hoursAgo === 1 ? 'Last hour' : `${hoursAgo}h ago`;
    return `${when} · ${r === null ? 'no data' : `${uptimePct(r)} up`}`;
  };

  return (
    <div className="relative">
      <div
        role="img"
        aria-label={`Uptime, last 24 hours: ${uptimePct(uptime24h)}`}
        className={cn('flex h-6 touch-none items-end gap-[2px]', animate && 'strip-reveal')}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
      >
        {hours.map((r, i) => {
          const s = bucketState(r);
          return (
            <span
              key={i}
              className={cn(
                'h-full flex-1 rounded-[1px] transition-opacity duration-150',
                s === 'unknown' ? 'bg-line' : STATE[s].bg,
                active !== null && active !== i && 'opacity-40',
              )}
            />
          );
        })}
      </div>
      {active !== null && (
        <div
          className="tip pointer-events-none absolute bottom-full z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xs bg-fg px-2 py-1 font-mono text-[11px] text-surface shadow-lg"
          style={{ left: `clamp(60px, ${((active + 0.5) / n) * 100}%, calc(100% - 60px))` }}
        >
          {label(active)}
        </div>
      )}
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted" aria-hidden>
        <span>24h ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
