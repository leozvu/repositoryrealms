# CEO-0 — Four-entity read-only inventory

Audit time: 2026-07-21T15:25:56.9089118Z

Decision: **HOLD**

No database mutation, migration, Vercel relink of the repository, deployment, merge or production configuration change was performed.

## Executive result

| Entity | Vercel project | Expected schema | Production | Rollback deployment | Live DB metadata | Production backup |
|---|---|---|---|---|---|---|
| AIm Agency | `agency-erp` | `public` | READY / HTTP 200 | READY | connectivity verified; metadata blocked | not evidenced |
| Egoric Agency | `erp-egoric` | `egoric` | READY / HTTP 200 | READY | connectivity verified; metadata blocked | not evidenced |
| Vnecom LLC | `erp-vnecom` | `vnecom` | READY / HTTP 200 | READY | connectivity verified; metadata blocked | not evidenced |
| Egolive | `erp-egolive` | `egolive` | READY / HTTP 200 | READY | connectivity verified; metadata blocked | not evidenced |

## Verified facts

1. All four Vercel projects exist in team `leozs-projects-64a5f0c8`.
2. All four stable URLs return HTTP 200 and redirect unauthenticated users to `/login`.
3. All four production projects expose encrypted configuration entries named `DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL` and `NEXTAUTH_SECRET`.
4. A read-only invalid-key request to `/api/v1/summary` returned HTTP 401 for every entity. The route performs an API-key database lookup before returning 401, so the deployed runtime can reach its database.
5. All four current production deployments are READY and report release message v3.36.
6. All four have a previous READY production deployment reporting v3.35, usable as a Vercel-level rollback candidate.
7. Repository configuration identifies schemas `public`, `egoric`, `vnecom` and `egolive`.
8. Egolive code contains its full livestream vertical: sessions, reconciliation, settlement, host payout and violation points.
9. The repeatable audit script was proven against isolated Realm staging inside a PostgreSQL `READ ONLY` transaction: 73 tables, 11 migrations and 9 accounts were read without mutation.

## Blockers

### B1 — Production backup evidence missing

- The repository backup directory contains only a Realm staging snapshot from 2026-07-20.
- No production backup artifact for `public`, `egoric`, `vnecom` or `egolive` was found.
- Windows Task Scheduler does not contain the documented task `AgencyERP-Backup`.
- Production restore readiness is therefore unverified.

Do not deploy a schema-changing release until a fresh backup of all four schemas is created, checksummed and restore-tested outside production.

### B2 — Production database metadata cannot be independently read

Vercel exposes the four required variables as encrypted values. The authorized project metadata proves their presence, but their values cannot be retrieved for the read-only audit. Therefore these facts remain unknown:

- database fingerprint;
- live schema identity;
- Prisma migration level/table count;
- `Setting.company` and enabled modules;
- active/inactive account counts and role distribution;
- `master-dashboard` API-key presence and last use.

No value was guessed from seed or staging data.

### B3 — Deployment Git lineage mismatch

The live Vercel deployment reports Git SHA `d78f686a7dd5e5be2dc96826acce2c18d5ea1986`; its rollback candidate reports `42576b5cfdfc4ef22deafa75bd13b7bb4aa16f88`. Neither object exists in the current repository object database.

The equivalent RepositoryRealms/upstream release is `76082dc287258203a7a6515545b2dd2ba5fbd202` with the same v3.36 release message. Production provenance must be normalized before automated branch-to-deployment guarantees are trusted.

### B4 — Existing Master Dashboard is outside this workspace

`erp-master-leoz` is online and password-protected, but its repository, entity credentials and authorization implementation are not available in this workspace. CEO Portal must not inherit that implementation without a separate audit.

## Required remediation before CEO-1 or four-entity preview deployment

1. Create and verify a fresh production backup for all four schemas.
2. Restore each backup into an isolated temporary database/schema and compare row/table counts.
3. Provision a time-limited, read-only PostgreSQL audit credential or a least-privilege `/api/ceo/v1/manifest` endpoint in each entity.
4. Populate the unknown manifest fields from live evidence.
5. Reconcile Vercel deployment Git metadata with the RepositoryRealms commit lineage.
6. Audit the separate `erp-master-leoz` source and revoke/rotate broad Director API keys before reuse.
7. Amend the deployment safety directive explicitly before targeting `agency-erp`, `erp-egoric`, `erp-vnecom` or `erp-egolive`.

## Artifacts

- `docs/realms/ceo-0/aim.json`
- `docs/realms/ceo-0/egoric.json`
- `docs/realms/ceo-0/vnecom.json`
- `docs/realms/ceo-0/egolive.json`
- `scripts/audit-ceo-entity.mjs`

The final SHA-256 checksums are stored beside the manifests in `docs/realms/ceo-0/SHA256SUMS`.
