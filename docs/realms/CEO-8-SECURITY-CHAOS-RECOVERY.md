# CEO-8 — Security, Chaos and Recovery

Status: code complete on `codex/realms-demo`. Database migration, secret provisioning, deployment and production enablement remain on HOLD behind CEO-0 and CEO-9.

## Outcome

CEO-8 removes the previous assumption that an entity integration key is an unrestricted virtual Director. Portal traffic now has four independent boundaries:

1. an allowlisted service scope for the exact endpoint;
2. an entity audience carried in `X-CEO-Entity-ID`;
3. an expiry date and revocation state;
4. a durable, per-entity, per-scope fixed-window rate limit.

A scoped CEO service key is rejected by generic `/api/v1/*` ERP routes. Existing unscoped ERP integration keys remain backward compatible, but they cannot call the CEO target endpoints.

## Credential separation and rotation

`CeoEntityRegistry.credentialRef` remains the SSO trust-secret reference used to sign and verify short-lived CEO assertions. `serviceCredentialRef` is a different environment-variable reference containing a scoped API key used for Portal-to-entity HTTP calls.

Required examples:

| Entity | SSO trust secret | Scoped service key |
|---|---|---|
| AIm | `CEO_ENTITY_AIM_API_KEY` | `CEO_ENTITY_AIM_SERVICE_KEY` |
| Egoric | `CEO_ENTITY_EGORIC_API_KEY` | `CEO_ENTITY_EGORIC_SERVICE_KEY` |
| Vnecom | `CEO_ENTITY_VNECOM_API_KEY` | `CEO_ENTITY_VNECOM_SERVICE_KEY` |
| Egolive | `CEO_ENTITY_EGOLIVE_API_KEY` | `CEO_ENTITY_EGOLIVE_SERVICE_KEY` |

The raw service key is returned once by `POST /api/ceo/v1/security/service-credential`. Rotation requires a local Director, same-origin request, active CEO Portal session and recent TOTP step-up. Rotation atomically revokes the previous service key for that entity. Audit evidence contains only audience, prefix, TTL and scope count.

Safe rotation order:

1. On the target entity, create a new scoped service credential from CEO Security.
2. Put the raw value in the CEO Portal deployment secret manager under a new `*_SERVICE_KEY` reference.
3. Deploy only the Portal configuration change after CEO-0 target verification.
4. Change the registry reference through `POST /api/ceo/v1/registry/:id/service-credential`.
5. Verify snapshot, command receipt, messaging and federation calls.
6. Confirm the old target credential is inactive. Never copy the raw value into the database, source, issue, chat or audit log.

Do not reuse an SSO trust secret as a service key.

## Target endpoint scopes

| Endpoint | Required scope |
|---|---|
| capabilities | `ceo.capabilities.read` |
| health | `ceo.health.read` |
| snapshot | `ceo.snapshot.read` |
| commands | `ceo.command.dispatch` |
| command receipt | `ceo.command.receipts.read` |
| directory | `ceo.directory.read` |
| message delivery | `ceo.message.deliver` |
| message receipt | `ceo.message.receipts.read` |
| message feed | `ceo.message.feed.read` |
| federation presence | `realm.federation.read` |

Limits are counted in PostgreSQL, not process memory, so parallel serverless instances share the same boundary. A rejected request returns `429`, `Retry-After`, limit and remaining headers.

## Kill switch

The CEO Security console requires the exact phrase `SUSPEND CEO PORTAL`, a reason and recent TOTP step-up. One serializable transaction:

- sets only `CeoGlobalIdentity.status` to `suspended`;
- revokes every active `CeoPortalSession`;
- invalidates every unconsumed CEO SSO authorization code;
- records a payload-free AuditLog entry.

It does not change `User.status`, local ERP roles, entity Registry data, Task, Lead, Invoice, payroll, Gold or any entity business database. Normal local ERP logins continue.

## Break-glass recovery

Recovery requires all of the following:

- active local Director account and local ERP password;
- unused current-version recovery code;
- exact phrase `RESTORE CEO PORTAL`;
- a new recovery-assurance Portal session;
- fresh TOTP step-up before SSO, messaging or commands resume.

The recovery code is consumed atomically. All previous Portal sessions stay revoked. A restored recovery session has `stepUp=false` by design.

## Chaos rehearsal

`POST /api/ceo/v1/security/rehearsal` is deterministic dry-run only. It performs no external call and no business mutation.

| Scenario | Required graceful behavior |
|---|---|
| Entity offline | Open only that entity circuit; other entities continue. |
| Stale snapshot | Label source time and stale state; never imply freshness. |
| API timeout | Abort within budget; no blind mutation retry. |
| Duplicate command | One business effect; replay canonical receipt. |
| Lost receipt | Mark pending confirmation and reconcile by correlation ID. |
| Partial rollout | Gate unsupported capability per entity; mixed versions continue. |
| Identity provider outage | New CEO SSO fails closed; local ERP login remains available. |

## Restore boundary

The CEO Portal control plane is backed up and restored independently from entity business databases.

- Target RPO: 24 hours.
- Target RTO: 4 hours.
- Restore set: Registry, global identity, memberships, Portal sessions/revocation evidence, aggregate cache, delivery metadata and encrypted unified messaging metadata.
- Explicit exclusion: operational entity tables and databases.

Restoring the Portal never authorizes restoring AIm, Egoric, Vnecom or Egolive business data. After restore, revoke Portal sessions, rotate service credentials, validate Registry versions and run the seven-scenario rehearsal before reopening SSO.

## Operational hold

This phase does not apply `20260722040000_add_ceo_security_controls`, provision secrets, alter production databases, enable an entity or deploy Vercel. Those remain explicit CEO-9 rollout actions after the CEO-0 manifests and backups are approved.
