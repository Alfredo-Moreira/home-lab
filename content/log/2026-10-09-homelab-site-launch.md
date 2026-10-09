---
title: This site is live
date: 2026-10-09
tags: [launch, cloudflare, zoraxy, security]
summary: A public page for the homelab, with live status pulled from the box itself, and the rules that keep it safe to expose.
---

The homelab finally has a front door. Everything on this page, from service status to NAS temperature to running containers, comes live from the box it's running on.

## How a request gets here

1. Your browser talks to **Cloudflare**, which terminates TLS at the edge.
2. Cloudflare sends the request down an **outbound-only tunnel** (`cloudflared`) running on the NAS. The router has no open ports.
3. **Zoraxy** routes the hostname to the right container.
4. This app answers.

LAN-only services skip the tunnel entirely: Zoraxy serves them on internal hostnames that Cloudflare doesn't know about.

## Making live data safe to publish

Showing real infrastructure data on a public page means being deliberate about what leaves the server:

- **Allowlist, not blocklist.** Every API response is built field by field. Internal hostnames, IPs, ports, image tags and registry hosts never reach the browser.
- **Internal services show status, not links.** You can see that Home Assistant is up; you can't see where it lives.
- **No Docker socket in the app.** Container data comes through a socket proxy that only allows read access to the container list.
- **Health checks come from config only.** No request parameter can make the server fetch a URL, so there's no SSRF surface.
- Strict CSP, rate limits, and a read-only API.
