# CEO-12 — Group Operations Cockpit

Date: 2026-08-01
Branch: `codex/realm-design-system-v2-implementation`

## Outcome

`/ceo-overview` is now the single operating desk for Leoz Group. It places the items most likely to require CEO attention ahead of the existing financial and operating snapshots, then routes the CEO into the canonical workflow that owns each action.

CEO-12 does not replace CEO-4, CEO-5, CEO-6, CEO-9 or CEO-10. It composes their sanitized read models:

- CEO-4 entity snapshot freshness and provenance;
- CEO-5 command delivery state and target receipts;
- CEO-6 conversation delivery state and recent entity replies;
- CEO-9 rollout ring and control-plane readiness;
- CEO-10 active multi-company workforce links.

## Priority rules

The queue is deterministic and severity ordered:

1. expired, invalid or missing entity sources;
2. failed/rejected command or message delivery;
3. incomplete rollout migration;
4. pending command/message receipts;
5. stale snapshots;
6. held/paused rollout rings and adapter degradation.

When the CEO Portal session has not completed TOTP step-up, protected sources are labeled `locked`; they are not represented as an empty result.

## Business-action boundary

The cockpit performs GET requests only. Its quick actions navigate to the existing protected surfaces:

- `/ceo-commands` for RepositoryRealms command authorization and target receipts;
- `/ceo-inbox` for encrypted Portal messaging and target-owned chat receipts;
- `/ceo-workforce` for bounded cross-company workforce requests;
- `/ceo-world` for audience-bound SSO into the owning entity.

No direct entity database write, business-record copy, cross-entity cookie or new mutation route was added.

## Accounting and data semantics

- The cockpit never combines GMV, recognized revenue, cash receipts or accounting profit.
- Entity snapshot availability is displayed as source health, not as a business-performance score.
- Portal command and message counts are delivery metadata, not target business records.
- Workforce counts come from explicit active links only and contain no payroll or private HR data.

## UX contract

- Vietnamese and English copy are both explicit.
- One primary screen action remains the existing snapshot refresh.
- All quick-action links and controls provide at least a 44px target.
- The layout reflows at 1120px, 760px and 520px with no fixed-width content dependency.
- Status never relies on color alone; text, icon and state labels remain present.
- Reduced-motion preferences disable cockpit transitions.

## Deployment and data safety

CEO-12 adds no Prisma model, migration, seed, secret or production-data mutation. It remains exposed only by the CEO deployment boundary introduced in CEO-11; entity ERP deployments continue returning `404` for `/ceo-overview`.
