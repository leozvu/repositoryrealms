# CEO-1 — Versioned entity contract

Status: implemented on `codex/realms-demo`; not deployed to production entities

Contract version: `1.0.0`

Schema version: `1`

## Goal

Provide a stable, read-only adapter between each ERP entity and the future CEO Portal. This contract is additive: the legacy `/api/v1/summary` remains unchanged while the Portal migrates to the versioned endpoints.

## Endpoints

| Endpoint | Contract | Purpose |
|---|---|---|
| `GET /api/ceo/v1/capabilities` | `repositoryrealms.ceo.capabilities` | Discover entity identity, enabled domains and endpoint versions |
| `GET /api/ceo/v1/snapshot` | `repositoryrealms.ceo.snapshot` | Fetch scoped aggregate data from canonical records |
| `GET /api/ceo/v1/health` | `repositoryrealms.ceo.health` | Check database/settings readiness and latency |

All endpoints require an active Bearer API key whose roles include `DIRECTOR`. Responses are `private, no-store`, vary on `Authorization` and expose `X-CEO-Contract-Version: 1.0.0`.

## Entity identity

Identity resolution order:

1. `CEO_ENTITY_ID` environment variable;
2. `Setting.entityId`;
3. approved production hostname mapping;
4. non-public Postgres schema mapping;
5. slug of `Setting.company`;
6. fail-safe `unconfigured-entity`.

Production should explicitly set `CEO_ENTITY_ID` to `aim`, `egoric`, `vnecom` or `egolive` before rollout. Host/schema inference is backward compatibility, not the long-term control plane.

## Snapshot envelope

```json
{
  "contract": "repositoryrealms.ceo.snapshot",
  "contractVersion": "1.0.0",
  "schemaVersion": 1,
  "entityId": "egolive",
  "asOf": "2026-07-21T15:30:00.000Z",
  "entity": {
    "id": "egolive",
    "displayName": "Egolive",
    "businessProfile": "livestream"
  },
  "period": "2026-07",
  "currency": "VND",
  "timezone": "Asia/Ho_Chi_Minh",
  "scope": {
    "requestedDomains": ["finance", "livestream"],
    "grantedDomains": ["finance", "livestream"],
    "deniedDomains": []
  },
  "domains": {},
  "provenance": {}
}
```

Clients can request a subset with `?domains=finance,crm`. Disabled, unknown or unauthorized domains are omitted and reported in `scope.deniedDomains`.

## Domain semantics

### Finance

- `revenueCash`, `expenseCash` and `operatingCashNet` come from canonical cash-ledger transactions.
- `operatingCashNet` is not accounting profit.
- AR is calculated from non-draft invoices less recorded payments.
- AP is calculated from unpaid vendor bills.

### Livestream

- `gmvOnStream` is GMV booked during live sessions.
- `netReceivedReconciled` is the reconciled amount after refund/platform/tax effects already stored on the session.
- `pendingPlatformSettlement` is reconciled money not yet marked received.
- GMV is never added to finance revenue.

### People

- Only active headcount is exposed in v1.
- Salary, payroll details, employee ranking, presence duration, Realm time and Gold are excluded.

## Capability behavior

Capabilities are derived from `Setting.modules` through the canonical module rules. Legacy agency settings continue to expose agency domains but not opt-in verticals. Egolive exposes `livestream` only when its module is enabled.

CEO-1 originally published no write command. CEO-5 now extends `capabilities.commands` additively with four scoped actions while `snapshotReadOnly` and `directDatabaseWrites: false` remain invariant. Every cross-entity command must return a RepositoryRealms receipt from the target entity; the snapshot contract itself is unchanged.

## Tests

`tests/ceo-entity-contract.test.mjs` verifies:

- four production identities;
- Agency and Egolive capability differences;
- requested/granted/denied domain behavior;
- cash-basis finance semantics;
- GMV/revenue separation;
- fail-closed health state;
- Director auth and no-store route contracts;
- absence of write methods.

## Rollout gate

CEO-1 is code-complete only on the isolated branch. Before any four-entity deployment:

1. clear CEO-0 production backup blocker;
2. set and verify `CEO_ENTITY_ID` per project;
3. create least-privilege Portal API keys and rotate legacy broad keys;
4. run the same contract tests against isolated clones of all four schemas;
5. amend the deployment safety directive with the exact preview targets.
