---
title: MacroLeaf v2.1.3 on the NAS
date: 2026-09-14
tags: [deploy, arm64, mongodb]
summary: My meal-planning app now runs on the NAS from a multi-arch image in the private registry.
---

MacroLeaf, the meal planning and nutrition tracker I built, now runs on the NAS full time.

## How it ships

- `VERSION` holds the semver. `build-and-push.sh` runs `docker buildx` for **linux/amd64 and linux/arm64** and pushes both a versioned tag and `:latest` to the private registry.
- The NAS never builds anything. It pulls the arm64 image with `docker-compose.nas.yml` and joins the shared `nas-bridge` network, where MongoDB already runs.
- Rolling back means changing a tag.

## Why arm64 matters

The DH4300 Plus is an RK3588C, so every image I deploy has to exist for arm64. Building multi-arch from day one means the same image runs on my laptop and on the box.
