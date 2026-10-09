// Fake homelab for local testing. Zero dependencies: `node demo/mock-server.mjs`.
//
// Pretends to be three things the site talks to on the real NAS:
//   GET /api/4/<plugin>          Glances REST API v4 (cpu, mem, load, sensors, fs, uptime, network, core)
//   GET /containers/json         docker-socket-proxy (container list)
//   GET /svc/<id>                services to health-check, each with its own failure profile
//
// Numbers drift as random walks so sparklines move. Container data deliberately
// includes fields the site must strip (ports, labels, registry hosts, tags) so
// the sanitisers are exercised.

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 9000);
const started = Date.now();
const GB = 1e9;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const walk = (v, step, lo, hi) => clamp(v + (Math.random() - 0.5) * 2 * step, lo, hi);

// ---- Glances ---------------------------------------------------------------

const sys = { cpu: 14, mem: 46, temp: 47, rx: 2.2e6, tx: 0.6e6, burst: 0 };

setInterval(() => {
  // Occasional CPU bursts (a backup, an image pull) so the sparkline has shape.
  if (sys.burst > 0) sys.burst--;
  else if (Math.random() < 0.04) sys.burst = 6 + Math.floor(Math.random() * 10);
  const target = sys.burst ? 62 : 12;
  sys.cpu = clamp(sys.cpu + (target - sys.cpu) * 0.25 + (Math.random() - 0.5) * 6, 1, 98);
  sys.mem = walk(sys.mem, 0.6, 38, 71);
  sys.temp = clamp(sys.temp + (38 + sys.cpu * 0.28 - sys.temp) * 0.2 + (Math.random() - 0.5), 35, 85);
  sys.rx = walk(sys.rx, 4e5, 1e5, 2.5e7) + (sys.burst ? 8e6 : 0);
  sys.tx = walk(sys.tx, 1.5e5, 4e4, 8e6);
}, 2000).unref();

const volumes = [
  { mnt_point: '/volume1', device_name: '/dev/md0', fs_type: 'btrfs', size: 15.9e12, base: 9.42e12 },
  { mnt_point: '/volume2', device_name: '/dev/nvme0n1p1', fs_type: 'ext4', size: 0.98e12, base: 0.81e12 },
];

function uptimeString() {
  const s = Math.floor((Date.now() - started) / 1000) + 41 * 86400 + 5 * 3600 + 17 * 60;
  const d = Math.floor(s / 86400);
  const hms = new Date((s % 86400) * 1000).toISOString().slice(11, 19).replace(/^0/, '');
  return `${d} days, ${hms}`;
}

const glances = {
  cpu: () => ({ total: +sys.cpu.toFixed(1), user: +(sys.cpu * 0.7).toFixed(1), system: +(sys.cpu * 0.3).toFixed(1) }),
  mem: () => ({
    total: 8 * 1024 ** 3,
    used: Math.round((8 * 1024 ** 3 * sys.mem) / 100),
    percent: +sys.mem.toFixed(1),
  }),
  load: () => ({
    min1: +(sys.cpu / 18).toFixed(2),
    min5: +(sys.cpu / 22).toFixed(2),
    min15: +(sys.cpu / 26).toFixed(2),
    cpucore: 8,
  }),
  core: () => ({ phys: 8, log: 8 }),
  sensors: () => [
    { label: 'soc_thermal 0', value: +sys.temp.toFixed(1), unit: 'C', type: 'temperature_core' },
    { label: 'bigcore0_thermal 0', value: +(sys.temp + 1.4).toFixed(1), unit: 'C', type: 'temperature_core' },
    { label: 'gpu_thermal 0', value: +(sys.temp - 2.1).toFixed(1), unit: 'C', type: 'temperature_core' },
    { label: 'fan1', value: Math.round(900 + sys.temp * 12), unit: 'R', type: 'fan_speed' },
  ],
  fs: () =>
    [
      ...volumes,
      { mnt_point: '/etc/hosts', device_name: '/dev/mmcblk0p8', fs_type: 'ext4', size: 26e9, base: 9e9 },
    ].map((v) => {
      const used = v.base + ((Date.now() - started) / 1000) * 25_000; // slowly fills
      return {
        mnt_point: v.mnt_point,
        device_name: v.device_name,
        fs_type: v.fs_type,
        size: v.size,
        used,
        free: v.size - used,
        percent: +((used / v.size) * 100).toFixed(1),
      };
    }),
  uptime: () => uptimeString(),
  network: () => [
    {
      interface_name: 'eth0',
      bytes_recv_rate_per_sec: Math.round(sys.rx),
      bytes_sent_rate_per_sec: Math.round(sys.tx),
      time_since_update: 2,
    },
    {
      interface_name: 'docker0',
      bytes_recv_rate_per_sec: 50_000,
      bytes_sent_rate_per_sec: 50_000,
      time_since_update: 2,
    },
    { interface_name: 'lo', bytes_recv_rate_per_sec: 9e6, bytes_sent_rate_per_sec: 9e6, time_since_update: 2 },
  ],
};

// ---- Docker ----------------------------------------------------------------

const REG = '192.168.4.79:5000';
const day = 86400;
const containers = [
  ['homelab', `${REG}/homelab:v1.0.0`, 'running', `Up ${3} days (healthy)`],
  ['meal-prep-calculator', `${REG}/meal-prep-calculator:v2.1.3`, 'running', 'Up 3 weeks'],
  ['portfolio', `${REG}/portfolio:v4.2.0`, 'running', 'Up 12 days (healthy)'],
  ['homeassistant', 'ghcr.io/home-assistant/home-assistant:2026.10', 'running', 'Up 9 days (healthy)'],
  ['zoraxy', 'zoraxydocker/zoraxy:latest', 'running', 'Up 3 weeks'],
  ['cloudflared', 'cloudflare/cloudflared:2026.9.1', 'running', 'Up 3 weeks'],
  ['mongo-nas', 'mongo:7', 'running', 'Up 5 weeks'],
  ['registry', 'registry:2', 'running', 'Up 5 weeks'],
  ['matomo', 'matomo:5-apache', 'running', 'Up 6 days (unhealthy)'],
  ['jellyfin', 'jellyfin/jellyfin:10.10', 'exited', 'Exited (0) 2 days ago'],
  ['watchtower-test', 'containrrr/watchtower', 'exited', 'Exited (1) 5 hours ago'],
  ['homelab-glances', 'nicolargo/glances:latest', 'running', 'Up 3 days'],
  ['homelab-docker-proxy', 'tecnativa/docker-socket-proxy:latest', 'running', 'Up 3 days'],
  ['secret-experiment', 'ghcr.io/me/secret:dev', 'running', 'Up 2 hours'],
].map(([name, image, state, status], i) => ({
  Id: `${(i + 1).toString(16).padStart(4, '0')}${'f'.repeat(60)}`,
  Names: [`/${name}`],
  Image: image,
  ImageID: `sha256:${'a'.repeat(64)}`,
  Command: '/init --secret-flag',
  Created: Math.floor(Date.now() / 1000) - (i + 1) * day,
  State: state,
  Status: status,
  Ports: [{ IP: '0.0.0.0', PrivatePort: 3000 + i, PublicPort: 3000 + i, Type: 'tcp' }],
  // Must never reach the browser:
  Labels:
    name === 'secret-experiment'
      ? { 'homelab.hide': 'true' }
      : { 'com.docker.compose.project': 'nas', 'internal.note': 'do-not-leak' },
  NetworkSettings: { Networks: { 'nas-bridge': { IPAddress: `172.20.0.${10 + i}` } } },
  Mounts: [{ Source: '/volume1/docker/' + name, Destination: '/data' }],
}));

// ---- Fake services ---------------------------------------------------------
//
// Each id gets a behaviour. Unknown ids are healthy.
//   steady:   always 200, 20-60ms
//   slow:     200, but every few minutes a spell of 1.6-2.5s responses (degraded)
//   flaky:    ~6% 503s
//   outage:   down for 3 minutes out of every 20 (so you see it flip)
//   auth:     401 (expected by config for login-walled UIs)
//   redirect: 302

const PROFILE = {
  homelab: 'steady',
  portfolio: 'steady',
  analytics: 'slow',
  macroleaf: 'flaky',
  'home-assistant': 'steady',
  zoraxy: 'auth',
  registry: 'steady',
  ugos: 'redirect',
  jellyfin: 'outage',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function service(id, res) {
  const profile = PROFILE[id] ?? 'steady';
  const minute = Math.floor(Date.now() / 60_000);
  let latency = 20 + Math.random() * 40;
  let code = 200;
  if (profile === 'slow' && minute % 7 < 2) latency = 1600 + Math.random() * 900;
  if (profile === 'flaky' && Math.random() < 0.06) code = 503;
  if (profile === 'outage' && minute % 20 < 3) {
    res.destroy(); // connection reset: the checker sees "down", no status code
    return;
  }
  if (profile === 'auth') code = 401;
  if (profile === 'redirect') code = 302;
  await sleep(latency);
  res.writeHead(code, { 'content-type': 'text/plain', ...(code === 302 ? { location: '/login' } : {}) });
  res.end(`${id}: ${code}\n`);
}

// ---- HTTP ------------------------------------------------------------------

const json = (res, body) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const g = url.pathname.match(/^\/api\/4\/([a-z]+)$/);
    if (g && glances[g[1]]) return json(res, glances[g[1]]());
    if (url.pathname === '/containers/json') return json(res, containers);
    const s = url.pathname.match(/^\/svc\/([a-z0-9-]+)$/);
    if (s) return service(s[1], res);
    if (url.pathname === '/')
      return json(res, { mock: 'homelab', endpoints: ['/api/4/<plugin>', '/containers/json', '/svc/<id>'] });
    res.writeHead(404).end();
  })
  .listen(PORT, () => console.log(`[mock] fake glances + docker + services on :${PORT}`));
