<!--
Keep the PR focused on one concern.
Title: Conventional Commits, e.g. `feat(client): …`, `fix(server): …`, `docs: …`.
Delete sections that don't apply.
-->

## Summary

<!-- What does this change and why? One or two sentences. -->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Content only (build log, config example)
- [ ] Refactor, tooling or CI (no behaviour change)

## Affected areas

- [ ] Server
- [ ] Client
- [ ] Docker / NAS deployment
- [ ] Demo stack
- [ ] CI

## Definition of done

- [ ] Tests added or updated (`npm test`, and `npm run test:e2e` against the demo stack for UI changes).
- [ ] **Public exposure:** any new API field is allowlisted on purpose and covered by `e2e/tests/api.spec.ts` leak checks.
- [ ] Motion changes reviewed with the `review-animations` rules (≤300 ms UI, transform/opacity only, reduced motion, no animation on keyboard or navigation).
- [ ] Bumped `VERSION` if this ships to the NAS.
