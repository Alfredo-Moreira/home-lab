# TODO

Open items from the initial build (2026-10-09). Nothing has been committed or pushed yet.

## Before the first NAS deploy

- [ ] Copy `config/homelab.example.yaml` to `config/homelab.yaml` (gitignored) and edit it:
  - [ ] Home Assistant check URL and port (`home-assistant` service)
  - [ ] Zoraxy admin URL and port, and which status codes count as up (`zoraxy` service)
  - [ ] UGOS Pro URL and port (`ugos` service)
  - [ ] Your actual drives and RAID level (`hardware` → Storage)
  - [ ] UGOS volume paths and labels (`nas.volumes`)
  - [ ] Optional: `site.owner.location`
- [ ] In `docker-compose.nas.yml`, add one Glances mount line per volume listed in `nas.volumes` (currently only `/volume1`).
- [ ] Confirm the analytics service at `analytics.moreiralabs.org` should be listed publicly.
- [ ] Run `./scripts/build-and-push.sh`, then on the NAS: `docker compose -f docker-compose.nas.yml pull && up -d`.
- [ ] Zoraxy: route `lab.moreiralabs.org` to `http://<nas-ip>:3080`.
- [ ] Cloudflare tunnel: add the public hostname `lab.moreiralabs.org` pointing at Zoraxy.
- [ ] Make sure Glances (`:61208`) and the socket proxy are never routed through Zoraxy or the tunnel.

## Content to review

- [ ] The bio in `site.owner.bio` (drafted in your voice).
- [ ] The two build-log entries in `content/log/` (drafts):
  - `2026-09-14-macroleaf-on-the-nas.md`
  - `2026-10-09-homelab-site-launch.md`
- [ ] Hardware and stack descriptions, including the "why" lines.

## Repo and CI

- [x] Review the code, then commit and push (remote: `Alfredo-Moreira/home-lab`).
- [ ] Watch the first CI run on GitHub. It has only been run locally so far.
- [ ] `release.yml` creates a tag on every push to `main` (same as Ouril). Those tags are separate from the `VERSION` file that tags Docker images. Keep both, or drop one.
- [ ] Optional: enable branch protection and "Require review from Code Owners".

## Ideas for later

- [ ] Home Assistant entities on the dashboard (would need an HA long-lived token, kept server-side).
- [ ] More build-log entries as the lab changes.
