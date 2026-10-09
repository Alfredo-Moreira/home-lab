import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { toPublicSite, type Config } from './config';
import type { Docker } from './docker';
import { SLUG, type LogEntry } from './log';
import type { Monitor } from './monitor';
import type { Nas } from './nas';
import type { Store } from './store';

/*
 * The whole site is public (served through the Cloudflare tunnel), so every
 * response is built from an explicit allowlist: see toPublicSite(), the NAS
 * and Docker sanitizers, and the status shape. The API is read-only (GET).
 */

export type Deps = { config: Config; store: Store; monitor: Monitor; nas: Nas; docker: Docker; log: LogEntry[] };

export function createApp({ config, store, monitor, nas, docker, log }: Deps) {
  const app = express();
  app.disable('x-powered-by');
  // cloudflared → Zoraxy → app: trust the private hops so req.ip is the visitor.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          // The site is also opened over plain HTTP on the LAN; Cloudflare does HTTPS.
          upgradeInsecureRequests: null,
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression());

  const api = express.Router();
  // Per visitor IP. The page itself polls ~6 requests/minute; tests raise this.
  const perMinute = Number(process.env.RATE_LIMIT_PER_MIN ?? 120);
  api.use(rateLimit({ windowMs: 60_000, limit: perMinute, standardHeaders: 'draft-8', legacyHeaders: false }));
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    res.set('Cache-Control', 'no-store');
    next();
  });

  const publicSite = toPublicSite(config);
  const logIndex = log.map(({ body: _body, ...rest }) => rest);

  api.get('/health', async (_req, res) => {
    const db = await store.ping();
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded' });
  });

  api.get('/site', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(publicSite);
  });

  api.get('/status', async (_req, res) => {
    const services = await monitor.status();
    const up = services.filter((s) => s.state === 'up' || s.state === 'degraded').length;
    res.json({ generatedAt: new Date().toISOString(), summary: { up, total: services.length }, services });
  });

  api.get('/nas', (_req, res) => {
    res.json({ enabled: nas.enabled, ...nas.metrics() });
  });

  api.get('/containers', async (_req, res) => {
    const containers = await docker.containers();
    res.json({ enabled: docker.enabled, available: containers !== null, containers: containers ?? [] });
  });

  api.get('/log', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(logIndex);
  });

  api.get('/log/:slug', (req, res) => {
    const slug = String(req.params.slug);
    const entry = SLUG.test(slug) ? log.find((e) => e.slug === slug) : undefined;
    if (!entry) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.set('Cache-Control', 'public, max-age=300');
    res.json(entry);
  });

  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use('/api', api);

  // Client build (production). Hashed assets are immutable; index.html is not.
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(
      '/assets',
      express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
    );
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Generic errors only; details go to the server log.
  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) console.error('[http]', err);
    res.status(status).json({ error: status === 500 ? 'Internal error' : 'Bad request' });
  });

  return app;
}
