// Mirrors the server's public API shapes (server/src/app.ts). Read-only.

export type LinkKind =
  'portfolio' | 'github' | 'linkedin' | 'instagram' | 'facebook' | 'x' | 'youtube' | 'email' | 'other';
export type Category = 'apps' | 'infra' | 'home' | 'media' | 'dev' | 'other';

export type PublicService = {
  id: string;
  name: string;
  description: string;
  category: Category;
  visibility: 'public' | 'internal';
  url?: string;
  monitored: boolean;
};

export type Site = {
  site: {
    title: string;
    tagline: string;
    owner: { name: string; handle: string; role: string; bio: string; location?: string };
    links: { label: string; url: string; kind: LinkKind }[];
  };
  hardware: { group: string; items: { name: string; detail: string; why?: string }[] }[];
  stack: { name: string; role: string; why: string; href?: string }[];
  services: PublicService[];
};

export type CheckState = 'up' | 'degraded' | 'down' | 'unknown';

export type ServiceStatus = {
  id: string;
  state: CheckState;
  latencyMs: number | null;
  checkedAt: string | null;
  since: string | null;
  uptime24h: number | null;
  uptime30d: number | null;
  hours: (number | null)[];
  avgLatencyMs: number | null;
};

export type StatusResponse = {
  generatedAt: string;
  summary: { up: number; total: number };
  services: ServiceStatus[];
};

export type NasPoint = { t: number; cpu: number | null; mem: number | null; temp: number | null };

export type NasResponse = {
  enabled: boolean;
  available: boolean;
  updatedAt: string | null;
  cpu: { percent: number | null; cores: number | null };
  memory: { percent: number | null; totalBytes: number | null; usedBytes: number | null };
  load: [number, number, number] | null;
  temperatureC: number | null;
  volumes: { label: string; sizeBytes: number; usedBytes: number; percent: number }[];
  network: { rxBps: number; txBps: number } | null;
  uptimeSeconds: number | null;
  history: NasPoint[];
};

export type Container = {
  name: string;
  image: string | null;
  state: 'running' | 'restarting' | 'paused' | 'exited' | 'created' | 'dead' | 'unknown';
  status: string;
  health: 'healthy' | 'unhealthy' | 'starting' | null;
};

export type ContainersResponse = { enabled: boolean; available: boolean; containers: Container[] };

export type LogSummary = { slug: string; title: string; date: string; tags: string[]; summary?: string };
export type LogEntry = LogSummary & { body: string };
