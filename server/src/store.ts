import { MongoClient, type Collection } from 'mongodb';

export type CheckState = 'up' | 'degraded' | 'down';

export type Sample = {
  service: string;
  ts: Date;
  state: CheckState;
  latencyMs: number | null;
  /** HTTP status, or null when the request never completed. */
  code: number | null;
};

export type Uptime = {
  /** Fraction of checks that were up or degraded, or null with no data. */
  uptime24h: number | null;
  uptime30d: number | null;
  /** 24 hourly buckets, oldest first: fraction up in that hour, or null. */
  hours: (number | null)[];
  /** Average latency of successful checks over 24h. */
  avgLatencyMs: number | null;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Store {
  record(sample: Sample): Promise<void>;
  uptime(services: string[], now?: Date): Promise<Record<string, Uptime>>;
  /** Most recent sample per service (used to seed state after a restart). */
  latest(services: string[]): Promise<Record<string, Sample>>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

const isUp = (s: CheckState) => s !== 'down';
const ratio = (ok: number, total: number) => (total ? ok / total : null);

function emptyUptime(): Uptime {
  return { uptime24h: null, uptime30d: null, hours: Array(24).fill(null), avgLatencyMs: null };
}

/** Pure aggregation, shared by the memory store and tests. */
export function aggregate(samples: Sample[], now: Date): Uptime {
  const out = emptyUptime();
  const start24 = now.getTime() - DAY;
  const start30 = now.getTime() - 30 * DAY;
  const hourOk = Array(24).fill(0);
  const hourTotal = Array(24).fill(0);
  let ok24 = 0,
    total24 = 0,
    ok30 = 0,
    total30 = 0,
    latSum = 0,
    latN = 0;

  for (const s of samples) {
    const t = s.ts.getTime();
    if (t < start30 || t > now.getTime()) continue;
    total30++;
    if (isUp(s.state)) ok30++;
    if (t < start24) continue;
    total24++;
    const up = isUp(s.state);
    if (up) ok24++;
    if (up && s.latencyMs !== null) {
      latSum += s.latencyMs;
      latN++;
    }
    const h = Math.min(23, Math.floor((t - start24) / HOUR));
    hourTotal[h]++;
    if (up) hourOk[h]++;
  }
  out.uptime24h = ratio(ok24, total24);
  out.uptime30d = ratio(ok30, total30);
  out.hours = hourTotal.map((n, i) => ratio(hourOk[i], n));
  out.avgLatencyMs = latN ? Math.round(latSum / latN) : null;
  return out;
}

/** Dev / no-database fallback. Keeps 48h per service so memory stays bounded. */
export class MemoryStore implements Store {
  private samples = new Map<string, Sample[]>();

  async record(sample: Sample) {
    const list = this.samples.get(sample.service) ?? [];
    list.push(sample);
    const cutoff = sample.ts.getTime() - 2 * DAY;
    while (list.length && list[0]!.ts.getTime() < cutoff) list.shift();
    this.samples.set(sample.service, list);
  }

  async uptime(services: string[], now = new Date()) {
    return Object.fromEntries(services.map((id) => [id, aggregate(this.samples.get(id) ?? [], now)]));
  }

  async latest(services: string[]) {
    const out: Record<string, Sample> = {};
    for (const id of services) {
      const last = this.samples.get(id)?.at(-1);
      if (last) out[id] = last;
    }
    return out;
  }

  async ping() {
    return true;
  }

  async close() {}
}

type CheckDoc = Sample;

export class MongoStore implements Store {
  private constructor(
    private client: MongoClient,
    private checks: Collection<CheckDoc>,
  ) {}

  static async connect(uri: string, retentionDays: number) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    // Database comes from the URI path (mongodb://host/homelab); default "homelab".
    const db = client.db(new URL(uri).pathname.slice(1) || 'homelab');
    const checks = db.collection<CheckDoc>('checks');
    await checks.createIndex({ service: 1, ts: -1 });
    await ensureTtl(checks, retentionDays * 86_400);
    return new MongoStore(client, checks);
  }

  async record(sample: Sample) {
    await this.checks.insertOne({ ...sample });
  }

  /** Bulk insert (demo seeding only). */
  async insertMany(samples: Sample[]) {
    if (samples.length)
      await this.checks.insertMany(
        samples.map((s) => ({ ...s })),
        { ordered: false },
      );
  }

  /** Whether a service has any sample older than `before`. */
  async hasHistory(service: string, before: Date) {
    return (await this.checks.countDocuments({ service, ts: { $lt: before } }, { limit: 1 })) > 0;
  }

  async clear(services: string[]) {
    await this.checks.deleteMany({ service: { $in: services } });
  }

  async uptime(services: string[], now = new Date()) {
    const start24 = new Date(now.getTime() - DAY);
    const start30 = new Date(now.getTime() - 30 * DAY);
    const up = { $ne: ['$state', 'down'] };
    const in24 = { $gte: ['$ts', start24] };

    const [totals, hours] = await Promise.all([
      this.checks
        .aggregate<{ _id: string; ok30: number; n30: number; ok24: number; n24: number; lat: number | null }>([
          { $match: { service: { $in: services }, ts: { $gte: start30, $lte: now } } },
          {
            $group: {
              _id: '$service',
              n30: { $sum: 1 },
              ok30: { $sum: { $cond: [up, 1, 0] } },
              n24: { $sum: { $cond: [in24, 1, 0] } },
              ok24: { $sum: { $cond: [{ $and: [in24, up] }, 1, 0] } },
              lat: { $avg: { $cond: [{ $and: [in24, up] }, '$latencyMs', null] } },
            },
          },
        ])
        .toArray(),
      this.checks
        .aggregate<{ _id: { s: string; h: number }; ok: number; n: number }>([
          { $match: { service: { $in: services }, ts: { $gte: start24, $lte: now } } },
          {
            $group: {
              _id: {
                s: '$service',
                h: { $min: [23, { $floor: { $divide: [{ $subtract: ['$ts', start24] }, HOUR] } }] },
              },
              n: { $sum: 1 },
              ok: { $sum: { $cond: [up, 1, 0] } },
            },
          },
        ])
        .toArray(),
    ]);

    const out: Record<string, Uptime> = Object.fromEntries(services.map((id) => [id, emptyUptime()]));
    for (const t of totals) {
      const u = out[t._id];
      if (!u) continue;
      u.uptime30d = ratio(t.ok30, t.n30);
      u.uptime24h = ratio(t.ok24, t.n24);
      u.avgLatencyMs = t.lat === null ? null : Math.round(t.lat);
    }
    for (const h of hours) {
      const u = out[h._id.s];
      if (u) u.hours[h._id.h] = ratio(h.ok, h.n);
    }
    return out;
  }

  async latest(services: string[]) {
    const rows = await this.checks
      .aggregate<{ _id: string; doc: Sample }>([
        { $match: { service: { $in: services } } },
        { $sort: { ts: -1 } },
        { $group: { _id: '$service', doc: { $first: '$$ROOT' } } },
      ])
      .toArray();
    return Object.fromEntries(rows.map((r) => [r._id, r.doc]));
  }

  async ping() {
    try {
      await this.client.db('admin').command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async close() {
    await this.client.close();
  }
}

/** Create or update the TTL index so retention changes in config take effect. */
async function ensureTtl(checks: Collection<CheckDoc>, seconds: number) {
  const name = 'ts_ttl';
  const existing = (await checks.indexes()).find((i) => i.name === name);
  if (existing && existing.expireAfterSeconds !== seconds) {
    await checks.db.command({ collMod: checks.collectionName, index: { name, expireAfterSeconds: seconds } });
  } else if (!existing) {
    await checks.createIndex({ ts: 1 }, { name, expireAfterSeconds: seconds });
  }
}
