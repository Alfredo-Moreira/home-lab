# CLAUDE.md

Guidance for Claude Code in this repo.

## Commands

```bash
npm install && npm install --prefix server && npm install --prefix client && npm install --prefix e2e
npm run demo            # full stack with fake data on :3080 (Docker)
npm run dev:demo        # hot reload against the mock (no Docker)
npm run dev             # hot reload against config/homelab.yaml
npm test                # server + client unit tests
npm run lint            # ESLint + typechecks
npm run format:check    # Prettier
npm run test:e2e        # Playwright against a running demo stack
```

## Rules

1. **The site is public.** Every API field is allowlisted on purpose (`toPublicSite` in `server/src/config.ts`, the sanitisers in `nas.ts` and `docker.ts`). Never pass through raw upstream objects. A new field needs a leak check in `e2e/tests/api.spec.ts`.
2. **No user-controlled fetches.** Health-check targets come only from config (no SSRF surface). Keep it that way.
3. **Config is the source of content.** Keep `site`/`hardware`/`stack` identical in `homelab.example.yaml` and `homelab.demo.yaml` (CI checks it). `config/homelab.yaml` is gitignored; never commit it.
4. **Motion** follows Ouril's `review-animations` standards (`../Ouril/.claude/skills/review-animations/`):
   - At most 300ms for UI motion; `transform`/`opacity` only.
   - Nothing animates on navigation or keyboard input; first-visit entrances go through `firstVisit()`.
   - Live values and statuses animate only on change.
   - Always add reduced-motion fallbacks.
   Run that review on any motion change.
5. **Design:** a light "clean room" dashboard, with tokens in `client/src/index.css`. Status colors (good/warning/critical) are reserved and always paired with an icon and a label.
6. The NAS is **arm64**. Images are built multi-arch by `scripts/build-and-push.sh`; the NAS never builds.
7. Don't commit or push unless asked.
