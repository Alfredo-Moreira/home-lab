import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { z } from 'zod';

/*
 * Everything the site shows comes from one YAML file (config/homelab.yaml),
 * validated here at startup. Fields fall into two groups:
 *
 * - public: rendered to visitors (names, descriptions, public URLs, specs)
 * - private: used only by the server (health-check URLs, Glances/Docker
 *   endpoints). These never leave the process; see `toPublicSite()`.
 *
 * A bad config fails fast at boot with a readable error, not at request time.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/, 'lowercase letters, digits and dashes');
const text = (max: number) => z.string().trim().min(1).max(max);
const httpUrl = z.url({ protocol: /^https?$/ });

const LINK_KINDS = [
  'portfolio',
  'github',
  'linkedin',
  'instagram',
  'facebook',
  'x',
  'youtube',
  'email',
  'other',
] as const;

const linkSchema = z.object({
  label: text(40),
  url: z.union([httpUrl, z.string().regex(/^mailto:[^\s@]+@[^\s@]+$/)]),
  kind: z.enum(LINK_KINDS).default('other'),
});

const checkSchema = z.object({
  url: httpUrl,
  method: z.enum(['GET', 'HEAD']).default('GET'),
  /** Status codes that count as up. Default: any 2xx/3xx. */
  expect: z.array(z.number().int().min(100).max(599)).optional(),
  timeoutMs: z.number().int().min(500).max(30_000).default(5000),
  /** Latency above this marks the service degraded rather than up. */
  degradedMs: z.number().int().min(50).max(30_000).default(1500),
  /** Accept self-signed certificates (LAN services like the NAS UI). */
  insecureTls: z.boolean().default(false),
});

const CATEGORIES = ['apps', 'infra', 'home', 'media', 'dev', 'other'] as const;

const serviceSchema = z
  .object({
    id,
    name: text(40),
    description: text(160),
    category: z.enum(CATEGORIES).default('apps'),
    /** public = reachable through the Cloudflare tunnel; internal = LAN only. */
    visibility: z.enum(['public', 'internal']),
    /** Link shown to visitors. Public services only, and HTTPS only. */
    url: z.url({ protocol: /^https$/ }).optional(),
    check: checkSchema.optional(),
  })
  .refine((s) => s.visibility === 'public' || !s.url, {
    message: 'internal services must not have a public url (it would be shown to visitors)',
    path: ['url'],
  });

const hardwareItemSchema = z.object({
  name: text(60),
  detail: text(160),
  why: text(240).optional(),
});

const stackItemSchema = z.object({
  name: text(40),
  role: text(80),
  why: text(240),
  href: z.url({ protocol: /^https$/ }).optional(),
});

export const configSchema = z.object({
  site: z.object({
    title: text(40).default('homelab'),
    tagline: text(160),
    owner: z.object({
      name: text(60),
      handle: text(30),
      role: text(80),
      bio: text(600),
      location: text(60).optional(),
    }),
    links: z.array(linkSchema).max(12).default([]),
  }),
  hardware: z
    .array(z.object({ group: text(30), items: z.array(hardwareItemSchema).min(1).max(20) }))
    .max(10)
    .default([]),
  stack: z.array(stackItemSchema).max(30).default([]),
  services: z
    .array(serviceSchema)
    .max(60)
    .default([])
    .refine((list) => new Set(list.map((s) => s.id)).size === list.length, 'service ids must be unique'),
  checks: z
    .object({
      intervalSeconds: z.number().int().min(15).max(3600).default(60),
      retentionDays: z.number().int().min(1).max(365).default(30),
    })
    .default({ intervalSeconds: 60, retentionDays: 30 }),
  nas: z
    .object({
      glancesUrl: httpUrl.optional(),
      /** Mount points to report, with the label visitors see (never the raw path). */
      volumes: z
        .array(z.object({ mount: z.string().startsWith('/'), label: text(30) }))
        .max(8)
        .default([]),
      /** Network interface to report throughput for (e.g. eth0). Omit to sum all physical ones. */
      interface: z.string().max(20).optional(),
    })
    .default({ volumes: [] }),
  docker: z
    .object({
      proxyUrl: httpUrl.optional(),
      /** Container names to hide. `*` wildcards allowed, e.g. "cloudflared*". */
      hide: z.array(z.string().max(60)).max(50).default([]),
    })
    .default({ hide: [] }),
});

export type Config = z.infer<typeof configSchema>;
export type ServiceConfig = Config['services'][number];

/** Read and validate the config, applying env overrides for deployment-specific endpoints. */
export function loadConfig(file = process.env.CONFIG_PATH ?? defaultConfigPath()): Config {
  if (!fs.existsSync(file)) {
    throw new Error(`Config not found at ${file}. Copy config/homelab.example.yaml to config/homelab.yaml.`);
  }
  const raw = YAML.parse(interpolate(fs.readFileSync(file, 'utf8'))) ?? {};
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid config ${file}:\n${z.prettifyError(parsed.error)}`);
  }
  const config = parsed.data;
  if (process.env.GLANCES_URL) config.nas.glancesUrl = httpUrl.parse(process.env.GLANCES_URL);
  if (process.env.DOCKER_PROXY_URL) config.docker.proxyUrl = httpUrl.parse(process.env.DOCKER_PROXY_URL);
  return config;
}

/** Replace `${VAR}` / `${VAR:-default}` with environment values (used by the demo config). */
export function interpolate(source: string, env: NodeJS.ProcessEnv = process.env) {
  return source.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_m, name: string, fallback?: string) => {
    const v = env[name];
    if (v !== undefined && v !== '') return v;
    if (fallback !== undefined) return fallback;
    throw new Error(`Config references \${${name}} but it is not set`);
  });
}

function defaultConfigPath() {
  // Real config if present, else the committed example (dev / first run).
  const dir = path.resolve(__dirname, '../../config');
  const real = path.join(dir, 'homelab.yaml');
  return fs.existsSync(real) ? real : path.join(dir, 'homelab.example.yaml');
}

/** The subset of config that is safe to send to any visitor. Explicit allowlist. */
export function toPublicSite(config: Config) {
  return {
    site: config.site,
    hardware: config.hardware,
    stack: config.stack,
    services: config.services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      visibility: s.visibility,
      url: s.visibility === 'public' ? s.url : undefined,
      monitored: Boolean(s.check),
    })),
  };
}
