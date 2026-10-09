import { loadConfig } from './config';
import { MongoStore, type CheckState, type Sample } from './store';

/*
 * Demo only: backfill 30 days of synthetic health checks so a fresh local
 * stack shows real-looking uptime bars and percentages straight away.
 *
 *   MONGODB_URI=… CONFIG_PATH=config/homelab.demo.yaml node dist/seed.js [--force]
 *
 * Deterministic per service id (same history every run). Skips services that
 * already have history unless --force. Never run this against production data.
 */

const STEP_MS = 5 * 60_000;
const DAYS = 30;

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Incident = { start: number; end: number; state: CheckState };

export function synthesize(service: string, now: number, index: number): Sample[] {
  const rand = rng(service);
  const from = now - DAYS * 86_400_000;
  const baseLatency = 15 + rand() * 180;
  const blipRate = rand() * 0.004;

  // A few incidents spread over the month, plus one in the last day for every
  // third service so the 24h bars aren't all green.
  const incidents: Incident[] = [];
  const count = Math.floor(rand() * 4);
  for (let i = 0; i < count; i++) {
    const start = from + rand() * (now - from - 86_400_000);
    incidents.push({ start, end: start + (10 + rand() * 110) * 60_000, state: rand() < 0.6 ? 'down' : 'degraded' });
  }
  if (index % 3 === 1) {
    const start = now - (2 + rand() * 18) * 3_600_000;
    incidents.push({ start, end: start + (15 + rand() * 50) * 60_000, state: index % 2 ? 'down' : 'degraded' });
  }

  const out: Sample[] = [];
  for (let t = from; t < now - STEP_MS; t += STEP_MS) {
    const hit = incidents.find((i) => t >= i.start && t < i.end);
    let state: CheckState = hit?.state ?? (rand() < blipRate ? 'down' : 'up');
    // Gentle daily rhythm: a little slower in the evening.
    const hour = new Date(t).getUTCHours();
    let latency = baseLatency * (1 + 0.25 * Math.sin(((hour - 6) / 24) * 2 * Math.PI)) * (0.8 + rand() * 0.4);
    if (state === 'degraded') latency = 1600 + rand() * 1200;
    if (state === 'up' && latency > 1500) state = 'degraded';
    out.push({
      service,
      ts: new Date(t),
      state,
      latencyMs: state === 'down' ? null : Math.round(latency),
      code: state === 'down' ? (rand() < 0.5 ? null : 503) : 200,
    });
  }
  return out;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const force = process.argv.includes('--force');
  const config = loadConfig();
  const store = await MongoStore.connect(uri, config.checks.retentionDays);
  const ids = config.services.filter((s) => s.check).map((s) => s.id);
  const now = Date.now();

  if (force) await store.clear(ids);
  for (const [i, id] of ids.entries()) {
    if (!force && (await store.hasHistory(id, new Date(now - 3_600_000)))) {
      console.log(`[seed] ${id}: already has history, skipping`);
      continue;
    }
    const samples = synthesize(id, now, i);
    await store.insertMany(samples);
    console.log(`[seed] ${id}: ${samples.length} samples`);
  }
  await store.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[seed]', (err as Error).message);
    process.exit(1);
  });
}
