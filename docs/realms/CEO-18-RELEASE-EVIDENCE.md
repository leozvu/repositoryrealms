# CEO-18 — Release, chaos and rollback evidence

Ngày: 2026-08-09. Branch: `codex/realm-design-system-v2-implementation`.

## Gates

- Production build: PASS.
- RepositoryRealms command/receipt tests: PASS.
- Executive contract v2 and multi-currency invariants: PASS.
- Existing Realm chaos suite: database slow, API timeout, stale cache, notification failure, partial rollout, approval timeout and WebSocket loss: PASS.
- CEO chaos additions: Vercel pool bounding, per-entity timeout isolation, unsupported-contract isolation and command capability fallback: PASS.
- Authenticated password + TOTP + SSO to four entity stable domains: PASS on protected canary and again after stable promotion.

## Rollout discipline

The release started as a CEO-Portal-only promotion. Authenticated stable drills then exposed a shared Postgres `EMAXCONN` condition caused by the legacy entity artifacts opening unbounded Prisma pools. The release was extended to the four entity projects only for the already-tested pool hardening and target-side RepositoryRealms capability contract in immutable commit `b0af34b`.

No migration ran and no business data was rewritten. `origin/main` and `feat/leozops-s1a` remained unchanged. The later LeozOps task-command change on `origin/main` is deliberately not represented as shipped by this release; LeozOps continues on its separate integration path. Entity capability negotiation prevents the CEO UI from exposing unsupported actions.

## Production evidence

- Protected canary: `dpl_CCpgYtuUe9uMJqrdGTDbzPHtQvCC` (`ceo-terminal-leoz-vhbvp6ma5-leozs-projects-64a5f0c8.vercel.app`).
- Stable promotion: the same immutable deployment is active at `https://ceo-terminal-leoz.vercel.app`.
- Previous CEO stable rollback point: `dpl_ByF5RCHvBxYcY5VmES6a12WHAHRm`.
- Authenticated canary SSO: PASS for AIm, Egoric, VNECOM and Egolive; every Portal API check returned HTTP 200, callback returned 303, target role was `DIRECTOR` and a secure NextAuth session was established.
- Authenticated stable SSO: PASS for the same four entities after promotion.
- Canary runtime observation: 200 recent records, zero 5xx, zero error/fatal entries and no `EMAXCONN` on the CEO Portal deployment.
- Egolive first exposed the shared Postgres `EMAXCONN` condition during the stable drill. Recycling its prior immutable artifact as `dpl_wHrAprGqtDLMo6VnjQPr7qM8UZd4` restored access temporarily and proved stale serverless pools were the trigger.
- Pool-hardened entity deployments were then built with `--skip-domain` and promoted only after all four builds were READY: AIm `dpl_5SyEfVuneLtCf5wpsBXBpgaeotbW`, Egoric `dpl_FjAfMgTg1uCmFySrXrd7xPo5wejJ`, VNECOM `dpl_69L7bXo8puX94UAjLww3pAGi9ePc`, Egolive `dpl_B39QEDvdpiATRYYryxEBvBmTvXFX`.
- Entity rollback points: AIm `dpl_2wdKb7RzMMtukGytCgufCnzhtJjA`, Egoric `dpl_BLw3joRx3EUPM5LDcR48xwXYtT1Q`, VNECOM `dpl_3WTArswEcqM3zdUvP7wKCxx9Jnmh`, Egolive `dpl_wHrAprGqtDLMo6VnjQPr7qM8UZd4` (with older pre-recycle point `dpl_AdvgYVquGvLnzUWrCQ5Lu6r3u3CP`).
- Post-cutover authenticated drills passed 4/4 sequentially: eight Portal endpoints HTTP 200, executive workspace `ready=4/degraded=0`, target capability source `entity`, callback 303, secure session role `DIRECTOR`, and final URL `/dashboard`.
- Post-cutover observation sampled 200 log records from each of the five active deployments: zero error/fatal entries, zero 5xx and no `EMAXCONN`.

No Git history rewrite, schema migration or direct production database write occurred.
