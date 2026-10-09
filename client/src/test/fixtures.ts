import { vi } from 'vitest';
import type { ContainersResponse, LogSummary, NasResponse, Site, StatusResponse } from '../lib/types';

export const site: Site = {
  site: {
    title: 'homelab',
    tagline: 'A test lab.',
    owner: { name: 'Alfredo Moreira', handle: 'alfredo', role: 'Software engineer', bio: 'Bio text.' },
    links: [
      { label: 'Portfolio', url: 'https://example.com', kind: 'portfolio' },
      { label: 'GitHub', url: 'https://github.com/example', kind: 'github' },
    ],
  },
  hardware: [{ group: 'Compute', items: [{ name: 'DH4300 Plus', detail: 'RK3588C', why: 'Low power.' }] }],
  stack: [{ name: 'Zoraxy', role: 'Reverse proxy', why: 'One place to route.', href: 'https://zoraxy.aroz.org' }],
  services: [
    {
      id: 'web',
      name: 'Website',
      description: 'Public site.',
      category: 'apps',
      visibility: 'public',
      url: 'https://example.com',
      monitored: true,
    },
    {
      id: 'ha',
      name: 'Home Assistant',
      description: 'House.',
      category: 'home',
      visibility: 'internal',
      monitored: true,
    },
    {
      id: 'idle',
      name: 'Idle',
      description: 'Not watched.',
      category: 'other',
      visibility: 'internal',
      monitored: false,
    },
  ],
};

const hours = (v: number | null) => Array.from({ length: 24 }, () => v);

export const status: StatusResponse = {
  generatedAt: '2026-10-09T12:00:00Z',
  summary: { up: 1, total: 2 },
  services: [
    {
      id: 'web',
      state: 'up',
      latencyMs: 42,
      checkedAt: '2026-10-09T12:00:00Z',
      since: null,
      uptime24h: 1,
      uptime30d: 0.9991,
      hours: hours(1),
      avgLatencyMs: 40,
    },
    {
      id: 'ha',
      state: 'down',
      latencyMs: null,
      checkedAt: '2026-10-09T12:00:00Z',
      since: null,
      uptime24h: 0.5,
      uptime30d: 0.98,
      hours: hours(0.5),
      avgLatencyMs: null,
    },
  ],
};

export const nas: NasResponse = {
  enabled: true,
  available: true,
  updatedAt: '2026-10-09T12:00:00Z',
  cpu: { percent: 23.4, cores: 8 },
  memory: { percent: 51, totalBytes: 8 * 1024 ** 3, usedBytes: 4 * 1024 ** 3 },
  load: [1.2, 1.1, 0.9],
  temperatureC: 52.3,
  volumes: [{ label: 'Volume 1', sizeBytes: 16e12, usedBytes: 15e12, percent: 93.8 }],
  network: { rxBps: 1_250_000, txBps: 125_000 },
  uptimeSeconds: 90061,
  history: [
    { t: 0, cpu: 10, mem: 50, temp: 50 },
    { t: 60_000, cpu: 23.4, mem: 51, temp: 52.3 },
  ],
};

export const containers: ContainersResponse = {
  enabled: true,
  available: true,
  containers: [
    { name: 'web', image: 'web', state: 'running', status: 'Up 2 days (healthy)', health: 'healthy' },
    { name: 'broken', image: 'x/broken', state: 'running', status: 'Up 1 hour (unhealthy)', health: 'unhealthy' },
    { name: 'old', image: null, state: 'exited', status: 'Exited (0) 1 day ago', health: null },
  ],
};

export const log: LogSummary[] = [
  { slug: '2026-10-09-launch', title: 'Launch', date: '2026-10-09', tags: ['launch'], summary: 'It is live.' },
];

/** Route /api/* to fixtures. Override per test with `overrides`. */
export function mockApi(overrides: Record<string, unknown> = {}) {
  const routes: Record<string, unknown> = {
    '/api/site': site,
    '/api/status': status,
    '/api/nas': nas,
    '/api/containers': containers,
    '/api/log': log,
    ...overrides,
  };
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const path = new URL(url, 'http://test').pathname;
    if (!(path in routes)) return new Response('{"error":"Not found"}', { status: 404 });
    const body = routes[path];
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  });
}
