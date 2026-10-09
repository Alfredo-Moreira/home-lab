import { fetch } from 'undici';
import type { Config } from './config';

/*
 * NAS metrics from a Glances container (REST API v4). UGOS has no public
 * metrics API, so Glances runs alongside on the NAS.
 *
 * Only derived numbers leave this module: no hostnames, device names, raw
 * mount paths, interface names or IPs. Volumes are reported only when listed
 * in config, under the label given there.
 */

type GlancesSensor = { label?: string; value?: number; unit?: string; type?: string };
type GlancesFs = { mnt_point?: string; size?: number; used?: number; percent?: number };
type GlancesNet = {
  interface_name?: string;
  bytes_recv_rate_per_sec?: number;
  bytes_sent_rate_per_sec?: number;
  // Glances 3.x
  rx?: number;
  tx?: number;
  time_since_update?: number;
};

export type NasPoint = { t: number; cpu: number | null; mem: number | null; temp: number | null };

export type NasMetrics = {
  available: boolean;
  updatedAt: string | null;
  cpu: { percent: number | null; cores: number | null };
  memory: { percent: number | null; totalBytes: number | null; usedBytes: number | null };
  load: [number, number, number] | null;
  temperatureC: number | null;
  volumes: { label: string; sizeBytes: number; usedBytes: number; percent: number }[];
  network: { rxBps: number; txBps: number } | null;
  uptimeSeconds: number | null;
  /** ~30 minutes of samples for sparklines, oldest first. */
  history: NasPoint[];
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

/** "12 days, 3:04:05" / "1 day, 0:00:01" / "3:04:05" → seconds. */
export function parseUptime(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^(?:(\d+)\s+days?,\s*)?(\d+):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, d = '0', h, mi, se] = m;
  return Number(d) * 86400 + Number(h) * 3600 + Number(mi) * 60 + Number(se);
}

/** Hottest CPU/SoC temperature sensor, in °C. */
export function pickTemperature(sensors: unknown): number | null {
  if (!Array.isArray(sensors)) return null;
  const temps = (sensors as GlancesSensor[])
    .filter((s) => (s.type ?? '').startsWith('temperature') && (s.unit ?? 'C') === 'C')
    .map((s) => num(s.value))
    .filter((v): v is number => v !== null && v > 0 && v < 150);
  return temps.length ? Math.max(...temps) : null;
}

const VIRTUAL_IF = /^(lo|docker|br-|veth|virbr|tun|tap|wg|tailscale|zt|cni|flannel)/;

export function pickNetwork(nets: unknown, iface?: string): NasMetrics['network'] {
  if (!Array.isArray(nets)) return null;
  const list = (nets as GlancesNet[]).filter((n) =>
    iface ? n.interface_name === iface : !VIRTUAL_IF.test(n.interface_name ?? 'lo'),
  );
  if (!list.length) return null;
  let rx = 0,
    tx = 0;
  for (const n of list) {
    const secs = num(n.time_since_update) || 1;
    rx += num(n.bytes_recv_rate_per_sec) ?? (num(n.rx) ?? 0) / secs;
    tx += num(n.bytes_sent_rate_per_sec) ?? (num(n.tx) ?? 0) / secs;
  }
  return { rxBps: Math.round(rx), txBps: Math.round(tx) };
}

export function pickVolumes(fs: unknown, wanted: Config['nas']['volumes']): NasMetrics['volumes'] {
  if (!Array.isArray(fs)) return [];
  const byMount = new Map((fs as GlancesFs[]).map((f) => [f.mnt_point, f]));
  return wanted.flatMap(({ mount, label }) => {
    const f = byMount.get(mount);
    const size = num(f?.size),
      used = num(f?.used);
    if (!f || size === null || used === null || size <= 0) return [];
    return [{ label, sizeBytes: size, usedBytes: used, percent: round1(num(f.percent) ?? (used / size) * 100)! }];
  });
}

const HISTORY_MAX = 120;

export class Nas {
  private current: NasMetrics = Nas.empty();
  private history: NasPoint[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private config: Config) {}

  static empty(): NasMetrics {
    return {
      available: false,
      updatedAt: null,
      cpu: { percent: null, cores: null },
      memory: { percent: null, totalBytes: null, usedBytes: null },
      load: null,
      temperatureC: null,
      volumes: [],
      network: null,
      uptimeSeconds: null,
      history: [],
    };
  }

  get enabled() {
    return Boolean(this.config.nas.glancesUrl);
  }

  start(intervalMs = 15_000) {
    if (!this.enabled) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  metrics(): NasMetrics {
    return { ...this.current, history: this.history };
  }

  private async get(endpoint: string): Promise<unknown> {
    const base = this.config.nas.glancesUrl!.replace(/\/$/, '');
    const res = await fetch(`${base}/api/4/${endpoint}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`glances ${endpoint}: HTTP ${res.status}`);
    return res.json();
  }

  async poll() {
    const names = ['cpu', 'mem', 'load', 'sensors', 'fs', 'uptime', 'network', 'core'] as const;
    const results = await Promise.allSettled(names.map((n) => this.get(n)));
    const val = (i: number) =>
      results[i]!.status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<unknown>).value : null;
    const [cpu, mem, load, sensors, fs, uptime, network, core] = names.map((_, i) => val(i)) as [
      { total?: number } | null,
      { percent?: number; total?: number; used?: number } | null,
      { min1?: number; min5?: number; min15?: number } | null,
      unknown,
      unknown,
      unknown,
      unknown,
      { log?: number; phys?: number } | null,
    ];

    if (results.every((r) => r.status === 'rejected')) {
      if (this.current.available)
        console.warn('[nas] glances unreachable:', (results[0] as PromiseRejectedResult).reason?.message);
      this.current = { ...this.current, available: false };
      return;
    }

    const l1 = num(load?.min1),
      l5 = num(load?.min5),
      l15 = num(load?.min15);
    this.current = {
      available: true,
      updatedAt: new Date().toISOString(),
      cpu: { percent: round1(num(cpu?.total)), cores: num(core?.log) ?? num(core?.phys) },
      memory: { percent: round1(num(mem?.percent)), totalBytes: num(mem?.total), usedBytes: num(mem?.used) },
      load: l1 !== null && l5 !== null && l15 !== null ? [round1(l1)!, round1(l5)!, round1(l15)!] : null,
      temperatureC: round1(pickTemperature(sensors)),
      volumes: pickVolumes(fs, this.config.nas.volumes),
      network: pickNetwork(network, this.config.nas.interface),
      uptimeSeconds: parseUptime(uptime),
      history: [],
    };
    this.history.push({
      t: Date.now(),
      cpu: this.current.cpu.percent,
      mem: this.current.memory.percent,
      temp: this.current.temperatureC,
    });
    if (this.history.length > HISTORY_MAX) this.history.shift();
  }
}
