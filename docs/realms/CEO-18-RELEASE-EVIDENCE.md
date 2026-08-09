# CEO-18 — Release, chaos and rollback evidence

Ngày: 2026-08-09. Branch: `codex/realm-design-system-v2-implementation`.

## Gates

- Production build: PASS.
- RepositoryRealms command/receipt tests: PASS.
- Executive contract v2 and multi-currency invariants: PASS.
- Existing Realm chaos suite: database slow, API timeout, stale cache, notification failure, partial rollout, approval timeout and WebSocket loss: PASS.
- CEO chaos additions: Vercel pool bounding, per-entity timeout isolation, unsupported-contract isolation and command capability fallback: PASS.
- Authenticated password + TOTP + SSO to four entity stable domains: PASS before release.

## Rollout discipline

CEO Portal is the only deployment target for the control-plane release. Entity projects are not redeployed from this branch because `origin/main` contains an approved LeozOps change not integrated into this isolated branch. New entity-side v2 endpoints/actions therefore remain capability-gated until an approved integration PR applies the additive patch on top of current main.

Canary deployment ID, stable promotion ID, authenticated post-deploy smoke and rollback observation are appended after deployment. No Git history rewrite and no direct production database write are permitted.
