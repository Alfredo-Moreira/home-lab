import type { AddressInfo } from 'net';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { configSchema, interpolate, loadConfig, toPublicSite } from './config';
import { Docker, sanitize, shortImage } from './docker';
import { loadLog, parseEntry } from './log';
import { classify, Monitor } from './monitor';
import { Nas, parseUptime, pickNetwork, pickTemperature, pickVolumes } from './nas';
import { aggregate, MemoryStore, type Sample } from './store';

const EXAMPLE = path.resolve(__dirname, '../../config/homelab.example.yaml');

const minimal = {
  site: { tagline: 't', owner: { name: 'n', handle: 'h', role: 'r', bio: 'b' } },
};

describe('config', () => {
  it('accepts the committed example', () => {
    expect(() => loadConfig(EXAMPLE)).not.toThrow();
  });

  it('interpolates env vars with defaults', () => {
    expect(interpolate('a ${X} ${Y:-dflt}', { X: '1' })).toBe('a 1 dflt');
    expect(() => interpolate('${MISSING}', {})).toThrow(/MISSING/);
  });

  it('accepts the demo config', () => {
    expect(() => loadConfig(path.resolve(__dirname, '../../config/homelab.demo.yaml'))).not.toThrow();
  });

  it('rejects a public url on an internal service', () => {
    const r = configSchema.safeParse({
      ...minimal,
      services: [{ id: 'ha', name: 'HA', description: 'd', visibility: 'internal', url: 'https://ha.example.com' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects duplicate service ids', () => {
    const svc = { id: 'a', name: 'A', description: 'd', visibility: 'internal' };
    expect(configSchema.safeParse({ ...minimal, services: [svc, svc] }).success).toBe(false);
  });

  it('never exposes check urls or nas/docker endpoints', () => {
    const config = loadConfig(EXAMPLE);
    config.nas.glancesUrl = 'http://10.0.0.5:61208';
    config.docker.proxyUrl = 'http://docker-socket-proxy:2375';
    const json = JSON.stringify(toPublicSite(config));
    // A public service may legitimately check its own public URL; internal ones must never leak.
    for (const s of config.services)
      if (s.check && s.visibility === 'internal') expect(json).not.toContain(s.check.url);
    expect(json).not.toMatch(/192\.168\.|10\.0\.0\.|socket-proxy|61208|volume1/);
    expect(json).not.toContain('"check"');
  });
});

describe('store.aggregate', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const at = (minsAgo: number, state: Sample['state'], latencyMs: number | null = 100): Sample => ({
    service: 's',
    ts: new Date(now.getTime() - minsAgo * 60_000),
    state,
    latencyMs,
    code: state === 'down' ? null : 200,
  });

  it('counts degraded as up and buckets by hour', () => {
    const u = aggregate([at(10, 'up'), at(20, 'degraded', 300), at(30, 'down', null), at(90, 'up')], now);
    expect(u.uptime24h).toBeCloseTo(3 / 4);
    expect(u.hours[23]).toBeCloseTo(2 / 3);
    expect(u.hours[22]).toBe(1);
    expect(u.hours[0]).toBeNull();
    expect(u.avgLatencyMs).toBe(Math.round((100 + 300 + 100) / 3));
  });

  it('separates 24h from 30d and ignores older samples', () => {
    const u = aggregate([at(60 * 48, 'down', null), at(60 * 24 * 40, 'down', null), at(5, 'up')], now);
    expect(u.uptime24h).toBe(1);
    expect(u.uptime30d).toBe(0.5);
  });

  it('returns nulls without data', () => {
    const u = aggregate([], now);
    expect(u.uptime24h).toBeNull();
    expect(u.hours.every((h) => h === null)).toBe(true);
  });
});

describe('monitor.classify', () => {
  const check = { url: 'http://x', method: 'GET' as const, timeoutMs: 1000, degradedMs: 500, insecureTls: false };
  it('maps codes and latency to states', () => {
    expect(classify(check, 200, 100)).toBe('up');
    expect(classify(check, 302, 100)).toBe('up');
    expect(classify(check, 200, 900)).toBe('degraded');
    expect(classify(check, 500, 100)).toBe('down');
    expect(classify(check, null, 100)).toBe('down');
    expect(classify({ ...check, expect: [401] }, 401, 100)).toBe('up');
    expect(classify({ ...check, expect: [401] }, 200, 100)).toBe('down');
  });
});

describe('docker sanitizer', () => {
  it('strips registry hosts, tags and digests', () => {
    expect(shortImage('192.168.4.79:5000/meal-prep-calculator:v2.1.3')).toBe('meal-prep-calculator');
    expect(shortImage('ghcr.io/org/app:1@sha256:abc')).toBe('org/app');
    expect(shortImage('nicolargo/glances:latest')).toBe('nicolargo/glances');
    expect(shortImage('library/mongo:7')).toBe('mongo');
    expect(shortImage('localhost/app')).toBe('app');
    expect(shortImage('sha256:deadbeef')).toBeNull();
  });

  it('hides by pattern and label and drops everything else', () => {
    const out = sanitize(
      [
        {
          Names: ['/web'],
          Image: '10.0.0.1:5000/web:1',
          State: 'running',
          Status: 'Up 2 days (healthy)',
          Labels: { secret: 'x' },
        },
        { Names: ['/cloudflared-1'], Image: 'cloudflare/cloudflared', State: 'running', Status: 'Up' },
        { Names: ['/hidden'], Image: 'x', State: 'running', Status: 'Up', Labels: { 'homelab.hide': 'true' } },
        { Names: ['/old'], Image: 'y', State: 'exited', Status: 'Exited (0) 3 hours ago' },
      ],
      ['cloudflared*'],
    );
    expect(out.map((c) => c.name)).toEqual(['web', 'old']);
    expect(out[0]).toEqual({
      name: 'web',
      image: 'web',
      state: 'running',
      status: 'Up 2 days (healthy)',
      health: 'healthy',
    });
    expect(JSON.stringify(out)).not.toMatch(/10\.0\.0\.1|secret|Labels/);
  });
});

describe('nas parsers', () => {
  it('parses glances uptime strings', () => {
    expect(parseUptime('12 days, 3:04:05')).toBe(12 * 86400 + 3 * 3600 + 4 * 60 + 5);
    expect(parseUptime('1 day, 0:00:01')).toBe(86401);
    expect(parseUptime('3:04:05')).toBe(11045);
    expect(parseUptime(42)).toBeNull();
  });

  it('picks the hottest temperature sensor', () => {
    expect(
      pickTemperature([
        { label: 'soc', value: 48.2, unit: 'C', type: 'temperature_core' },
        { label: 'big', value: 51, unit: 'C', type: 'temperature_core' },
        { label: 'fan', value: 1200, unit: 'R', type: 'fan_speed' },
      ]),
    ).toBe(51);
    expect(pickTemperature([])).toBeNull();
  });

  it('sums physical interfaces, v4 and v3 shapes', () => {
    expect(
      pickNetwork([
        { interface_name: 'eth0', bytes_recv_rate_per_sec: 1000, bytes_sent_rate_per_sec: 500 },
        { interface_name: 'docker0', bytes_recv_rate_per_sec: 9e9, bytes_sent_rate_per_sec: 9e9 },
        { interface_name: 'eth1', rx: 200, tx: 100, time_since_update: 2 },
      ]),
    ).toEqual({ rxBps: 1100, txBps: 550 });
  });

  it('reports only configured volumes, by label', () => {
    const v = pickVolumes(
      [
        { mnt_point: '/volume1', size: 1000, used: 250, percent: 25 },
        { mnt_point: '/etc/hosts', size: 10, used: 5, percent: 50 },
      ],
      [{ mount: '/volume1', label: 'Volume 1' }],
    );
    expect(v).toEqual([{ label: 'Volume 1', sizeBytes: 1000, usedBytes: 250, percent: 25 }]);
  });
});

describe('build log', () => {
  it('parses frontmatter and normalises dates', () => {
    const e = parseEntry('2026-01-02-hello.md', '---\ntitle: Hi\ndate: 2026-01-02\n---\nBody');
    expect(e).toMatchObject({ slug: '2026-01-02-hello', title: 'Hi', date: '2026-01-02', tags: [], body: 'Body' });
  });

  it('loads the committed entries newest first', () => {
    const log = loadLog(path.resolve(__dirname, '../../content/log'));
    expect(log.length).toBeGreaterThan(0);
    expect([...log].sort((a, b) => b.date.localeCompare(a.date))).toEqual(log);
  });
});

describe('http', () => {
  let base = '';
  let close = () => {};

  beforeAll(async () => {
    const config = loadConfig(EXAMPLE);
    config.services = config.services.map(({ check: _check, ...s }) => s); // no network in tests
    const store = new MemoryStore();
    const app = createApp({
      config,
      store,
      monitor: new Monitor(config, store),
      nas: new Nas(config),
      docker: new Docker(config),
      log: loadLog(path.resolve(__dirname, '../../content/log')),
    });
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  afterAll(() => close());

  it('serves the public site with security headers', async () => {
    const res = await fetch(`${base}/api/site`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('is read-only', async () => {
    expect((await fetch(`${base}/api/site`, { method: 'POST' })).status).toBe(405);
  });

  it('404s unknown and malformed log slugs', async () => {
    expect((await fetch(`${base}/api/log/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/log/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
  });

  it('reports disabled integrations without erroring', async () => {
    const nas = await (await fetch(`${base}/api/nas`)).json();
    const containers = await (await fetch(`${base}/api/containers`)).json();
    expect(nas).toMatchObject({ enabled: false, available: false });
    expect(containers).toMatchObject({ enabled: false, containers: [] });
  });
});

describe('demo seed', () => {
  it('is deterministic and covers 30 days', async () => {
    const { synthesize } = await import('./seed');
    const now = Date.UTC(2026, 9, 9);
    const a = synthesize('svc', now, 1);
    const b = synthesize('svc', now, 1);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(8000);
    expect(aggregate(a, new Date(now)).uptime30d).toBeGreaterThan(0.9);
  });
});

describe('rate limit', () => {
  it('returns 429 past the per-minute limit', async () => {
    process.env.RATE_LIMIT_PER_MIN = '3';
    const config = loadConfig(EXAMPLE);
    config.services = [];
    const store = new MemoryStore();
    const app = createApp({
      config,
      store,
      monitor: new Monitor(config, store),
      nas: new Nas(config),
      docker: new Docker(config),
      log: [],
    });
    delete process.env.RATE_LIMIT_PER_MIN;
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/site`;
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await fetch(url)).status);
    server.close();
    expect(codes).toEqual([200, 200, 200, 429]);
  });
});
