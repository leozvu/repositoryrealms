# CEO-2 — Entity Registry

Status: implemented on `codex/realms-demo`; not migrated or deployed to any production entity

Registry version: `1`

Depends on: CEO entity contract `1.0.0` / schema `1`

## Outcome

CEO-2 adds the central control-plane registry for AIm Agency, Egoric Agency, Vnecom LLC and Egolive. It is additive to the four ERP databases and to CEO-1. It does not replace any ERP record, does not issue a cross-entity business command and does not alter the lead-snapshot v1 contract.

The production rollout state remains `HOLD` because CEO-0 backup, restore and live-schema evidence is not complete.

## Persistence

`CeoEntityRegistry` stores:

- stable entity ID, display name and approved HTTPS origin;
- business profile, environment and intended CEO capabilities;
- enabled/status flags and CEO contract/schema versions;
- configuration `recordVersion` for optimistic concurrency;
- credential version and rotation timestamp;
- last sync attempt/success, consecutive error count and sanitized error code;
- circuit state, open timestamp and next retry timestamp.

The migration seeds the four approved production origins in `disabled` + `unverified` state. Migration does not activate connectivity.

## Secret boundary

`credentialRef` contains only a dedicated server environment-variable name such as `CEO_ENTITY_EGORIC_API_KEY`. Its accepted pattern is:

```text
CEO_ENTITY_<ENTITY_OR_ROTATION_SLOT>_API_KEY
```

The raw Bearer key:

- is provisioned in the server/Vercel secret store;
- is resolved only inside `lib/ceo-entity-registry-admin.js` immediately before a server-side sync;
- is never stored in the registry table;
- is never included in AuditLog;
- is never returned by the registry API or rendered by the browser.

The serializer exposes only `credential.configured`, version and rotation time. It does not expose the environment-variable name.

## Director API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ceo/v1/registry` | `GET` | List safe registry projections |
| `/api/ceo/v1/registry/:id` | `PATCH` | Enable/disable or update registry metadata with expected version |
| `/api/ceo/v1/registry/:id/rotate` | `POST` | Atomically switch to a pre-provisioned secret reference |

All endpoints:

- require an authenticated session with the `DIRECTOR` role;
- return `private, no-store` and vary on the session cookie;
- fail closed on missing credentials;
- sanitize unexpected server failures;
- expose no `DELETE` method.

Metadata updates and rotations use `recordVersion` compare-and-swap and write AuditLog in the same serializable transaction.

## Rotation procedure

1. Provision a second Director-scoped entity API key in the target entity.
2. Add the raw value to a new server secret, for example `CEO_ENTITY_EGORIC_V2_API_KEY`.
3. Use the Registry UI to switch the credential reference.
4. Registry increments `credentialVersion`, resets stale circuit errors and marks an enabled entity `unverified`.
5. A later health/snapshot sync must succeed before status becomes `ready`.
6. Revoke the old entity key and remove its old server secret after verification.

The UI cannot create or edit a raw secret.

## Circuit breaker

- Failure 1–2: entity becomes `degraded`; calls may continue.
- Failure 3: entity becomes `unreachable`; circuit opens for five minutes.
- Repeated failures use exponential cooldown capped at 60 minutes.
- When retry time arrives, one call runs in `half_open` probe mode.
- Probe success closes the circuit and resets errors.
- Probe failure opens the circuit again.
- A disabled entity can never be prepared for sync.

This state is control-plane availability evidence, not an employee or entity performance score.

## Admin experience

The Director-only route `/ceo-registry` provides:

- four responsive entity cards and aggregate status counters;
- explicit text plus color for entity and circuit states;
- enabled, credential, contract and capability visibility;
- one-click enable/disable with pending feedback;
- credential-reference rotation with a visible label and validation help;
- Vietnamese and English copy;
- no delete action.

The UI follows the existing ERP visual system and keeps all touch targets at least 44px on management actions.

## Verification

`tests/ceo-entity-registry.test.mjs` covers:

- four stable seed identities;
- HTTPS and capability validation;
- raw-key rejection and safe serialization;
- Director-only access;
- missing-secret fail-closed behavior;
- compare-and-swap conflicts and atomic AuditLog evidence;
- safe credential rotation;
- circuit opening, cooldown probe and recovery;
- non-destructive route/UI contracts;
- migration secret-reference invariants.

## Rollout gate

Do not apply this migration to the four production entities until:

1. the CEO-0 backup/restore and schema evidence blockers are cleared;
2. the architecture decision identifies the single central Portal database that owns this registry;
3. a distinct Director-scoped key is created for every entity;
4. all four secret references are provisioned and rotated independently;
5. the exact Vercel project and database target are approved;
6. preview migration, rollback and circuit-breaker tests pass on isolated database clones.
