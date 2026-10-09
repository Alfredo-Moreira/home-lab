import { fetch } from 'undici';
import type { Config } from './config';

/*
 * Running containers, read through a docker-socket-proxy that only allows
 * GET /containers (CONTAINERS=1, everything else denied). The raw socket is
 * never mounted into this app: socket access is root on the host.
 *
 * Only name, short image name, state, status text and health are returned.
 * Ports, mounts, networks, env, labels, commands, IDs and image tags/registry
 * hosts are dropped.
 */

type RawContainer = {
  Names?: string[];
  Image?: string;
  State?: string;
  Status?: string;
  Labels?: Record<string, string>;
};

export type Container = {
  name: string;
  image: string | null;
  state: 'running' | 'restarting' | 'paused' | 'exited' | 'created' | 'dead' | 'unknown';
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | null;
};

const STATES = new Set<Container['state']>(['running', 'restarting', 'paused', 'exited', 'created', 'dead']);

/** "192.168.4.79:5000/team/app:v1@sha256:…" → "team/app"; "sha256:…" → null. */
export function shortImage(image: string | undefined): string | null {
  if (!image || image.startsWith('sha256:')) return null;
  let s = image.split('@')[0]!;
  const parts = s.split('/');
  // A first segment with a dot, colon or "localhost" is a registry host.
  if (parts.length > 1 && /[.:]|^localhost$/.test(parts[0]!)) parts.shift();
  s = parts.join('/');
  const colon = s.lastIndexOf(':');
  if (colon > s.lastIndexOf('/')) s = s.slice(0, colon);
  return s.replace(/^library\//, '') || null;
}

export function healthOf(status: string): Container['health'] {
  if (/\(healthy\)/.test(status)) return 'healthy';
  if (/\(unhealthy\)/.test(status)) return 'unhealthy';
  if (/health: starting/.test(status)) return 'starting';
  return null;
}

function globToRegex(glob: string) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

export function sanitize(raw: RawContainer[], hide: string[]): Container[] {
  const hidden = hide.map(globToRegex);
  return raw
    .map((c) => {
      const name = (c.Names?.[0] ?? '').replace(/^\//, '');
      const status = (c.Status ?? '').slice(0, 60);
      const state = STATES.has(c.State as Container['state']) ? (c.State as Container['state']) : 'unknown';
      return { name, image: shortImage(c.Image), state, status, health: healthOf(status), labels: c.Labels ?? {} };
    })
    .filter((c) => c.name && c.labels['homelab.hide'] !== 'true' && !hidden.some((r) => r.test(c.name)))
    .map(({ labels: _labels, ...c }) => c)
    .sort((a, b) => Number(b.state === 'running') - Number(a.state === 'running') || a.name.localeCompare(b.name));
}

export class Docker {
  private cache: { at: number; value: Container[] | null } | null = null;

  constructor(private config: Config) {}

  get enabled() {
    return Boolean(this.config.docker.proxyUrl);
  }

  /** null when the proxy is unreachable; cached 15s. */
  async containers(): Promise<Container[] | null> {
    if (!this.enabled) return null;
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.value;
    let value: Container[] | null = null;
    try {
      const base = this.config.docker.proxyUrl!.replace(/\/$/, '');
      const res = await fetch(`${base}/containers/json?all=1`, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      value = sanitize((await res.json()) as RawContainer[], this.config.docker.hide);
    } catch (err) {
      console.warn('[docker] proxy unreachable:', (err as Error).message);
    }
    this.cache = { at: Date.now(), value };
    return value;
  }
}
