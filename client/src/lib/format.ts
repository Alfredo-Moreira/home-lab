export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** Disk sizes are decimal (vendors sell 16 TB drives); pass base 1024 for RAM. */
export function bytes(n: number | null | undefined, digits = 1, base: 1000 | 1024 = 1000) {
  if (n === null || n === undefined) return '—';
  let i = 0;
  let v = n;
  while (v >= base && i < UNITS.length - 1) {
    v /= base;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : digits)} ${UNITS[i]}`;
}

export function bitsPerSecond(bps: number | null | undefined) {
  if (bps === null || bps === undefined) return '—';
  const bits = bps * 8;
  if (bits >= 1e9) return `${(bits / 1e9).toFixed(1)} Gb/s`;
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(1)} Mb/s`;
  if (bits >= 1e3) return `${(bits / 1e3).toFixed(0)} kb/s`;
  return `${Math.round(bits)} b/s`;
}

export function percent(v: number | null | undefined, digits = 0) {
  return v === null || v === undefined ? '—' : `${v.toFixed(digits)}%`;
}

/** Uptime ratios: 1 → "100%", 0.99934 → "99.93%". Never rounds a miss up to 100. */
export function uptimePct(r: number | null | undefined) {
  if (r === null || r === undefined) return '—';
  if (r >= 1) return '100%';
  return `${(Math.floor(r * 10000) / 100).toFixed(2)}%`;
}

export function duration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function longDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Stable 7-char hex, the "commit hash" motif shared with the portfolio. */
export function shortHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}
