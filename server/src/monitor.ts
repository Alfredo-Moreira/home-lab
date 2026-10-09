import { Agent, fetch } from 'undici';
import type { Config, ServiceConfig } from './config';
import type { CheckState, Sample, Store, Uptime } from './store';

/*
 * Health checks. Every service with a `check` block is probed on an interval;
 * samples go to the store, the latest result stays in memory for /api/status.
 *
 * Check URLs come only from config (never from a request), so there is no
 * SSRF surface here. Redirects are not followed: a 3xx counts as up by
 * default, and following one could leave the network the operator intended.
 */

const strictAgent = new Agent({ connect: { timeout: 5000 } });
const insecureAgent = new Agent({ connect: { timeout: 5000, rejectUnauthorized: false } });

type Check = NonNullable<ServiceConfig['check']>;

export function classify(check: Check, code: number | null, latencyMs: number): CheckState {
  if (code === null) return 'down';
  const ok = check.expect ? check.expect.includes(code) : code >= 200 && code < 400;
  if (!ok) return 'down';
  return latencyMs > check.degradedMs ? 'degraded' : 'up';
}

export async function probe(id: string, check: Check, now = () => Date.now()): Promise<Sample> {
  const started = now();
  let code: number | null = null;
  try {
    const res = await fetch(check.url, {
      method: check.method,
      redirect: 'manual',
      signal: AbortSignal.timeout(check.timeoutMs),
      dispatcher: check.insecureTls ? insecureAgent : strictAgent,
      headers: { 'user-agent': 'homelab-status/1.0' },
    });
    code = res.status;
    await res.body?.cancel();
  } catch {
    code = null; // refused, DNS, TLS or timeout: all "down"
  }
  const latencyMs = Math.round(now() - started);
  return {
    service: id,
    ts: new Date(),
    state: classify(check, code, latencyMs),
    latencyMs: code === null ? null : latencyMs,
    code,
  };
}

export type ServiceStatus = {
  id: string;
  state: CheckState | 'unknown';
  latencyMs: number | null;
  checkedAt: string | null;
  /** When the current state began, if seen in this process. */
  since: string | null;
} & Uptime;

export class Monitor {
  private latest = new Map<string, Sample>();
  private since = new Map<string, Date>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private cache: { at: number; value: ServiceStatus[] } | null = null;

  constructor(
    private config: Config,
    private store: Store,
  ) {}

  private get monitored() {
    return this.config.services.filter((s): s is ServiceConfig & { check: Check } => Boolean(s.check));
  }

  async start() {
    const ids = this.monitored.map((s) => s.id);
    if (!ids.length) return;
    try {
      for (const [id, s] of Object.entries(await this.store.latest(ids))) this.latest.set(id, s);
    } catch (err) {
      console.warn('[monitor] could not load previous results:', (err as Error).message);
    }
    await this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.config.checks.intervalSeconds * 1000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    if (this.running) return; // a slow round never overlaps the next one
    this.running = true;
    try {
      const samples = await Promise.all(this.monitored.map((s) => probe(s.id, s.check)));
      for (const sample of samples) {
        const prev = this.latest.get(sample.service);
        if (!prev || prev.state !== sample.state) this.since.set(sample.service, sample.ts);
        this.latest.set(sample.service, sample);
      }
      await Promise.all(samples.map((s) => this.store.record(s))).catch((err) =>
        console.warn('[monitor] failed to record samples:', (err as Error).message),
      );
      this.cache = null;
    } finally {
      this.running = false;
    }
  }

  /** Status for every monitored service. Cached briefly so public traffic can't hammer the DB. */
  async status(): Promise<ServiceStatus[]> {
    if (this.cache && Date.now() - this.cache.at < 15_000) return this.cache.value;
    const ids = this.monitored.map((s) => s.id);
    const uptime = await this.store.uptime(ids);
    const value = ids.map((id) => {
      const last = this.latest.get(id);
      return {
        id,
        state: last?.state ?? 'unknown',
        latencyMs: last?.latencyMs ?? null,
        checkedAt: last?.ts.toISOString() ?? null,
        since: this.since.get(id)?.toISOString() ?? null,
        ...uptime[id]!,
      } satisfies ServiceStatus;
    });
    this.cache = { at: Date.now(), value };
    return value;
  }
}
