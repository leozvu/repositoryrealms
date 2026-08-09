# Phase 6 — World Map and CEO Terminal

Status: implemented locally on `codex/realm-design-system-v2-implementation`.

## Outcome

Phase 6 replaces the two Realm v2 aliases with authenticated, Director-only product compositions:

- `/realm-v2/world-map`
- `/realm-v2/ceo-terminal`

The screens compose the existing federation world, validated dashboard cache, command delivery ledger and authorized conversation cache. They do not introduce a second CEO data store or redefine any entity contract.

## World Map contract

- Merges entity identity by canonical `entity.id`; map position and opt-in presence come from `/api/ceo/v1/federation/world`.
- Freshness, snapshot domains, provenance and sync state come from `/api/ceo/v1/dashboard`.
- Command status comes from the existing read-only CEO command-delivery ledger.
- Company, Project, Incident, Finance and Command layers change presentation only.
- A deterministic UI attention label is derived from source availability, stale state, sync errors, overdue delivery and pending reconciliation. It is explicitly not a health score or employee-performance signal.
- Every visible map state is duplicated in a conventional responsive table.
- SSO and chat actions are delegated to `/ceo-world` and `/ceo-inbox`; the map never opens a gateway itself.

## CEO Terminal contract

- Keeps cash balance, cash revenue, cash expense, pipeline, AR/AP, delivery, active headcount, livestream GMV and net received semantically separate.
- Currency totals remain grouped; no silent conversion is performed.
- GMV is not called revenue. Cash-ledger values are not called accounting profit.
- Recognized revenue, accounting profit, approval backlog, incident registry and capacity are unavailable in the current CEO snapshot contract, so the UI declares those gaps instead of inventing proxies.
- Every executive comparison includes source freshness or as-of evidence. Expired snapshots remain excluded from aggregate totals by the canonical dashboard.
- The executive brief and urgent decisions are deterministic summaries of available source facts, not AI-generated facts.
- Mobile places the executive brief and urgent decisions before dense comparison data.

## Authorization and action boundary

- The route requires an authenticated pilot user and explicit `DIRECTOR` authorization.
- All four CEO sources keep their existing server-side authorization and CEO portal session requirements.
- Phase 6 does not dispatch commands, open SSO gateways, refresh caches or mutate records.
- Workflow links delegate to the existing CEO Portal, CEO Inbox and RepositoryRealms Command Center, where authorization, business rules, receipts and audit remain authoritative.

## Resilience and accessibility

- The four read sources use `Promise.allSettled`; one failure does not erase successful sources.
- Source errors are named in a degradation banner and no fixture is injected into authenticated product routes.
- The development-only `/realm-v2/phase-6-qa` route supplies deterministic browser fixtures and returns 404 in production.
- The evidence capture covers 1440, 1024, 768, 390 and 375 pixel widths for both screens, checks five mobile destinations, horizontal overflow, console/network failures and CEO API mutation requests.

## Verification boundary

No database mutation, commit, push, merge, or deployment was performed as part of Phase 6 implementation.
