# CEO-4 — Unified read dashboard

Status: code complete on `codex/realms-demo`; migration, entity credentials and deployment remain on HOLD behind CEO-0.

Owner: Vũ Lương Sơn

Last updated: 2026-07-21

## Outcome

CEO-4 adds one Director-only read surface at `/ceo-overview` for AIm Agency, Egoric Agency, Vnecom LLC and Egolive. It does not merge the four business databases. The Portal fetches the existing versioned `/api/ceo/v1/snapshot` contract from each enabled registry entity and stores one sanitized aggregate snapshot per entity.

The dashboard provides:

- `All companies` and single-company views;
- finance, CRM, delivery, support, people and Egolive vertical aggregates;
- source timestamp, fetch timestamp, cache age and freshness on every entity card;
- an accessible comparison table with a mobile card layout;
- one-time CEO-3 SSO deep links into the owning entity;
- background refresh after the cached view renders;
- per-entity failure isolation and stale-if-error fallback.

## Read path

```text
Browser CEO session
  -> GET /api/ceo/v1/dashboard
  -> Portal aggregate cache
  -> immediate cached dashboard

Browser background refresh
  -> POST /api/ceo/v1/dashboard/refresh
  -> Entity Registry + circuit breaker
  -> GET {entity}/api/ceo/v1/snapshot with entity server credential
  -> contract/audience/schema/domain validation
  -> sanitized aggregate cache + registry sync status + AuditLog
  -> updated dashboard
```

The Portal never connects to an entity database and never writes entity business records.

## Cache policy

- Fresh: 5 minutes after the Portal fetch.
- Stale but usable: up to 24 hours after the Portal fetch.
- Expired: retained only for provenance and incident diagnosis; excluded from every portfolio total.
- Invalid: withheld completely if JSON, contract, audience, schema, timestamp, domain or semantic validation fails.
- One latest cache row per registered entity.

An entity timeout does not blank the entire dashboard. Its latest usable snapshot remains labeled `stale`, its registry sync state becomes degraded, and the other entities continue normally. Repeated failures use the CEO-2 circuit breaker.

## Aggregate safety

Only a fixed field allowlist is persisted for each domain. Unknown fields are rejected, which prevents accidental storage of lead names, client records, payroll details or other business payloads.

Semantic invariants:

- currency totals are grouped by ISO currency and never silently converted;
- cash-ledger operating net is not presented as accounting profit;
- Livestream GMV is never merged into finance revenue;
- people aggregates contain active headcount only, not salary/payroll;
- presence, Realm time and Gold do not become employee rankings;
- snapshot entity ID, contract version and schema version must match the Registry row.

## APIs

### `GET /api/ceo/v1/dashboard?entity=all|<entityId>`

- Requires the local authenticated `DIRECTOR` role.
- Reads only the Portal aggregate cache.
- Returns `private, no-cache, no-store`.
- Unknown entity IDs fail closed.

### `POST /api/ceo/v1/dashboard/refresh`

Body:

```json
{ "entityId": "all" }
```

- Requires the local authenticated `DIRECTOR` role and same-origin request.
- Refreshes enabled entities only.
- Background refresh skips snapshots that are still fresh; an explicit user refresh can force a new fetch.
- Uses server-side credential references from CEO-2; raw keys never enter the browser, cache or audit detail.
- Sends a credential only to that entity's canonical production origin. Extra staging origins require an exact `CEO_ENTITY_<ID>_ALLOWED_ORIGINS` allowlist entry, preventing credential exfiltration through a modified Registry URL.
- Enforces a 5-second timeout, refuses redirects and caps the response at 256 KiB.
- Returns per-entity refresh status without leaking upstream response bodies.

## Signed drill-down

Dashboard drill-down buttons do not create direct trusted URLs. They call CEO-3 `/api/ceo/v1/sso/authorize` with the selected entity and a fixed internal path such as `/finance`, `/leads`, `/portfolio`, `/staff` or `/live`. CEO-3 then issues a 45-second single-use code and the target entity creates its own local Director session.

The button remains disabled until the CEO Portal session is active and recently stepped up with TOTP.

## UI decisions

- Cached data renders before background refresh to avoid a blocking multi-entity waterfall.
- Freshness is communicated by text and status marker, never color alone.
- Monetary values use locale-aware formatting and currency labels.
- The comparison has semantic table markup; below 760 px each row becomes a labeled vertical card without page-level horizontal overflow.
- All actionable controls are at least 44 px tall and keep visible keyboard focus.
- Reduced-motion preferences disable transitions and animation.
- No decorative chart is used where an exact comparison table is clearer.

## Rollout checklist

1. Complete CEO-0 target verification and backups for all four entities.
2. Apply CEO-2, CEO-3 and CEO-4 migrations to the Portal control-plane database in order.
3. Provision the four `CEO_ENTITY_*_API_KEY` secrets in the Portal project.
4. Provision matching active Director API keys in each entity.
5. Enable each Registry entity individually and confirm its CEO v1 contract/schema versions.
6. Run a manual refresh and verify source timestamps, currency and enabled domain set.
7. Exercise the Egolive GMV/revenue separation check.
8. Take one staging entity offline and confirm the remaining entities stay fresh while the failed entity is visibly stale/degraded.
9. Verify signed deep links create an independent local Director session.
10. Approve the read-only pilot before any production deployment.

## Operational exit gate

Code-level contract, outage, security and UI tests are complete. CEO-4 becomes operationally complete only when all four staging entities return validated snapshots, signed drill-down succeeds for each entity, and a forced single-entity outage demonstrates graceful degradation without cross-entity data loss.
