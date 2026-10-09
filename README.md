# homelab

A public dashboard for my homelab: a **UGREEN NASync DH4300 Plus** (RK3588C, arm64) running my apps, Home Assistant and experiments behind a **Cloudflare tunnel** and **Zoraxy**. It shows live service health, NAS metrics, running containers, the network architecture, the hardware, and a build log.

The whole site is public, so the server sends only an **allowlisted** view of the lab. Internal hostnames, IPs, ports, image tags and Docker labels never reach the browser, and that's enforced by tests.

## Features

- **Live service status**: health checks on an interval, with 24 hourly uptime bars, 24h and 30d uptime, and latency. Public services link out; LAN-only ones show status but never a link.
- **NAS metrics** from [Glances](https://nicolargo.github.io/glances/): CPU, memory and SoC temperature with sparklines, plus load, network throughput, uptime and storage meters.
- **Containers** through a read-only [docker-socket-proxy](https://github.com/Tecnativa/docker-socket-proxy) (`CONTAINERS=1` only; the raw socket is never mounted into the app).
- **Architecture**: an interactive diagram of the public path (Cloudflare → tunnel → Zoraxy) and the LAN path.
- **Hardware & stack**, each with the reason it was chosen.
- **Build log**: Markdown files in `content/log/`.
- **Demo mode**: a fake NAS with 30 days of seeded history, for working without the real box.

## Tech stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, React Router      |
| Backend  | Node 22, Express 5, TypeScript, zod-validated YAML config      |
| Storage  | MongoDB (check history, TTL-expired), in-memory fallback       |
| Metrics  | Glances REST API v4, docker-socket-proxy                       |
| Tests    | Vitest (server + client), Testing Library, Playwright + axe    |

## Project structure

```
home-lab/
├── client/                 # React SPA
│   └── src/
│       ├── pages/          # Overview, Architecture, Hardware, Log, LogEntry, NotFound
│       ├── components/     # Layout, Card, Status (badge + uptime bars), Sparkline, Meter, Social
│       ├── lib/            # api (polling hook), format, motion, site context, types
│       └── test/           # Vitest setup + API fixtures
├── server/src/
│   ├── config.ts           # YAML schema, env interpolation, public allowlist
│   ├── monitor.ts          # health checks
│   ├── store.ts            # MongoDB / memory store + uptime aggregation
│   ├── nas.ts              # Glances adapter (sanitised)
│   ├── docker.ts           # socket-proxy adapter (sanitised)
│   ├── log.ts              # build-log loader
│   ├── app.ts              # HTTP: helmet CSP, rate limit, read-only API, static client
│   └── seed.ts             # demo only: backfill 30 days of checks
├── config/
│   ├── homelab.example.yaml  # copy to homelab.yaml (gitignored)
│   └── homelab.demo.yaml     # points at the mock
├── content/log/            # build-log entries (Markdown + frontmatter)
├── demo/mock-server.mjs    # fake Glances + Docker + services
├── e2e/                    # Playwright tests (pages, a11y, API leak checks)
├── docker-compose.yml      # local: real Glances + socket proxy + Mongo
├── docker-compose.demo.yml # local: fake data, no NAS needed
├── docker-compose.nas.yml  # NAS deployment (arm64, nas-bridge)
└── scripts/build-and-push.sh
```

## Getting started

```bash
npm install && npm install --prefix server && npm install --prefix client && npm install --prefix e2e
```

### Fastest: the demo (fake data, Docker)

```bash
npm run demo          # docker compose -f docker-compose.demo.yml up --build
open http://localhost:3080
npm run demo:down     # stop and wipe the demo database
```

The mock rotates through realistic behavior: CPU bursts, a slow service, a flaky one, a 3-minutes-in-20 outage, an unhealthy container and stopped containers.

### Hot reload against the demo (no Docker)

```bash
npm run dev:demo      # mock on :9000, API on :3080, Vite on :5173
```

Without `MONGODB_URI`, history is kept in memory. Set it to see seeded 30-day bars.

### Hot reload against real services

```bash
cp config/homelab.example.yaml config/homelab.yaml   # edit it
cp .env.example .env                                  # optional
npm run dev
```

## Configuration

Everything lives in `config/homelab.yaml` (validated at startup; a bad file fails fast with a readable error).

- **Public fields** (`site`, `hardware`, `stack`, and each service's `name`, `description`, `category`, `visibility`, `url`) are shown to every visitor. Never put internal addresses there.
- **Private fields** (each service's `check`, and `nas`/`docker` endpoints) stay on the server.
- `visibility: internal` services can't have a `url`; the schema rejects it.
- `${VAR}` and `${VAR:-default}` are expanded from the environment.

| Env var              | Default                          | Purpose                                   |
| -------------------- | -------------------------------- | ----------------------------------------- |
| `PORT`               | `3080`                           | HTTP port                                 |
| `MONGODB_URI`        | unset (memory)                   | Check history                             |
| `GLANCES_URL`        | from config                      | Glances API base URL                      |
| `DOCKER_PROXY_URL`   | from config                      | docker-socket-proxy base URL              |
| `CONFIG_PATH`        | `config/homelab.yaml` or example | Config file                               |
| `CONTENT_DIR`        | `content/log`                    | Build-log entries                         |
| `TRUST_PROXY`        | private ranges                   | So `req.ip` is the visitor behind Zoraxy  |
| `RATE_LIMIT_PER_MIN` | `120`                            | Per-IP API limit                          |

### Build-log entries

Add `content/log/YYYY-MM-DD-slug.md`:

```markdown
---
title: Moved ingress to Zoraxy
date: 2026-10-09
tags: [network, zoraxy]
summary: One line for the list view.
---

Markdown body. Raw HTML is not rendered.
```

## Deploying to the NAS

Same flow as MealPrepCalculator: build multi-arch on the laptop, push to the private registry, pull on the NAS.

```bash
./scripts/build-and-push.sh          # tags from VERSION, pushes :vX.Y.Z and :latest, bumps docker-compose.nas.yml
```

On the NAS, next to `docker-compose.nas.yml`, put `config/homelab.yaml` and `content/log/`, then:

```bash
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d
```

The compose file runs three containers:

- **homelab** on `:3080`. It joins `nas-bridge` and reuses `mongo-nas` with database `homelab`. It runs read-only with all capabilities dropped and `no-new-privileges`.
- **glances** on the host network, so it sees the real NIC. Mount every volume you list under `nas.volumes`.
- **docker-socket-proxy** on `nas-bridge`, with no published ports.

Then:

1. **Zoraxy**: route your hostname to `http://<nas-ip>:3080`.
2. **Cloudflare tunnel**: add a public hostname that points at Zoraxy.
3. Never route Glances (`:61208`) or the socket proxy through Zoraxy or the tunnel.

## Testing

| Command                            | What                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `npm test`                         | Server (config, sanitisers, uptime maths, HTTP, rate limit) + client (components, pages, motion rules) |
| `npm run lint`                     | ESLint + typechecks                                                                 |
| `npm run format:check`             | Prettier                                                                            |
| `npm run test:e2e`                 | Playwright, desktop + mobile, against a running demo stack (`npm run demo` first): pages, axe accessibility, console/CSP errors, overflow, API leak checks, headers |

Set `CHROME_PATH` to use an installed Chrome instead of Playwright's Chromium.

CI (`.github/workflows/ci.yml`) runs all of this on every PR. It also builds the image for amd64 and arm64, checks that it runs non-root with no real config inside, boots it read-only until healthy, validates the compose files, and runs shellcheck on the scripts.

## Motion

Motion follows the rules from the Ouril repo's `emil-design-eng`, `emilkowalski-motion` and `review-animations` skills:

- `transform`/`opacity` only (plus `clip-path` for reveals), with strong ease-out curves.
- UI motion stays at or under 300ms. The longer ones are explanatory and rare: the first-visit entrance and the architecture packet.
- Nothing animates on navigation or keyboard input.
- Live values animate only when they change.
- `prefers-reduced-motion` keeps fades and drops movement.
