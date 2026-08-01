# CEO-11 — Deployment separation and CEO Terminal v2

Date: 2026-08-01
Branch: `codex/realm-design-system-v2-implementation`

## Outcome

CEO Terminal is now an explicit RepositoryRealms deployment kind, not a public navigation flag. The control plane and the four entity ERPs continue to share the same codebase and contracts, while exposing different product surfaces.

## Deployment contract

- `REPOSITORYREALMS_DEPLOYMENT_KIND=ceo-portal` enables the CEO control plane.
- `REPOSITORYREALMS_DEPLOYMENT_KIND=entity` is the explicit entity ERP mode.
- Unknown production deployments fail closed to `entity`.
- The existing `ceo-terminal-leoz.vercel.app` project hostname remains a compatibility signal during rollout.
- `NEXT_PUBLIC_CEO_GROUP_WORKFORCE` is not used as a production authorization boundary.

## Surface separation

Entity deployments return `404` for CEO UI routes, CEO Realm-v2 executive compositions, and control-plane APIs. They retain the target-side endpoints required for:

- entity capabilities, health and snapshot;
- RepositoryRealms command delivery and receipts;
- federation presence;
- directory profile and messaging delivery/feed;
- entity-side SSO callback.

Directors in an entity ERP receive one safe link to the configured CEO Terminal origin. Entity ERP navigation, roles, records and workflows are otherwise unchanged.

## CEO Terminal experience

- Dedicated Leoz Group login branding and four-entity scope.
- CEO recovery controls appear only on the CEO deployment.
- Successful login enters `/ceo-overview` directly.
- The Shell shows only executive, cross-company workforce, registry, security and rollout routes.
- Realm v2 visual tokens are always enabled for CEO Terminal; no business route or write path was replaced.

## Data safety

CEO-11 adds no migration, seed, production-data mutation or new cross-entity business write. Every existing action continues through RepositoryRealms authorization, business rules, receipt and audit boundaries.
