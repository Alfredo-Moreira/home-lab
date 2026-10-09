import { cn } from '../lib/format';

/**
 * Ratio against a limit. The fill carries severity (accent → warning →
 * critical); the track is a light step of the same hue so state reads across
 * the whole bar. Severity is also spelled out in text by the caller.
 */
export function Meter({ value, label, animate = false }: { value: number; label: string; animate?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const tone = v >= 90 ? 'critical' : v >= 75 ? 'warning' : 'accent';
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      className={cn(
        'h-2 overflow-hidden rounded-full',
        tone === 'accent' && 'bg-accent-soft',
        tone === 'warning' && 'bg-warning/15',
        tone === 'critical' && 'bg-critical/20',
      )}
    >
      <div
        className={cn(
          'meter-fill h-full rounded-full',
          animate && 'meter-enter',
          tone === 'accent' && 'bg-accent',
          tone === 'warning' && 'bg-warning',
          tone === 'critical' && 'bg-critical',
        )}
        style={{ '--v': v / 100 } as React.CSSProperties}
      />
    </div>
  );
}
