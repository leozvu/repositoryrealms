# CEO-7 — Realm Federation

Status: code complete on `codex/realms-demo`. Scope migration, entity credentials, policy enablement and deployment remain on HOLD behind CEO-0 and CEO-9.

## Outcome

The CEO Portal presents AIm Agency, Egoric Agency, Vnecom LLC and Egolive as four separate kingdoms on one world map. A gateway does not mount another entity inside the Portal and does not copy its records. It issues the existing CEO-3 single-use SSO code and enters the target entity at `/realm`, where the target creates its own local session and applies its own Realm access policy.

## Contracts and endpoints

Portal:

- `GET /api/ceo/v1/federation/world`
- `GET /api/ceo/v1/federation/world?entity=<id>` for isolated retry
- `POST /api/ceo/v1/sso/authorize` remains the only gateway mutation

Target entity:

- `GET /api/ceo/v1/federation/presence` with Director API authentication, exact entity audience, actor subject and `realm.federation.read` scope headers
- `GET|PUT /api/ceo/v1/federation/policy` for a logged-in local Director on the same origin

Contracts are `repositoryrealms.ceo.realm-federation` and `repositoryrealms.ceo.realm-presence`, version 1. Capability discovery advertises the target presence endpoint and the federation privacy rules.

## Presence privacy

Presence is visible only when both controls are true:

1. the local Director enables `Setting.ceoFederation.presenceEnabled` through the dedicated optimistic-lock policy endpoint;
2. the employee has shared their CEO directory profile and separately opted into `sharePresence` from ERP Messages.

The target returns only currently active opt-in users within the existing 70-second collaboration TTL. Shared fields are local user ID, display name, title, availability and active surface. It does not return email, raw heartbeat timestamp, duration, task, lead, HR, payroll, finance, Gold, Realm coordinate or performance data. Offline people are not enumerated.

Policy defaults to disabled. Disabling it takes effect on the next read without deleting or disabling local ERP/Realm presence. Every policy and consent change is audited without business payload.

## Gateway and chat boundaries

- A gateway requires an active CEO Portal session and recent TOTP step-up.
- CEO-3 authorization codes remain audience-bound, single-use and valid for 45 seconds.
- The callback maps the global CEO subject to an active local Director and creates a target-owned session.
- Cross-company chat opens CEO-6 Unified Inbox. Its delivery still passes through the target entity's canonical Conversation/Message adapter and RepositoryRealms receipt.
- Neither the world map nor chat membership grants access to local tasks, leads, finance, HR, payroll, Gold or attachments. Those require an independent target authorization after SSO.

## Graceful degradation

- Presence is fetched independently for every kingdom with a 2.5-second timeout.
- One timeout marks only that kingdom `degraded`; the other gateways remain usable.
- Policy-disabled, degraded, disabled and available are distinct text/icon states and never color-only.
- Per-kingdom retry calls only the selected target.
- Entity circuit-breaker and HTTPS origin allowlist are reused; redirects are rejected.
- The map has a responsive card layout at tablet/mobile widths, keyboard focus, 44-pixel controls and reduced-motion handling.

## Operational prerequisites

1. Apply `20260722030000_add_ceo_realm_federation_scope` only after the CEO-6 migration and backup verification.
2. Deploy target capability and presence endpoints before publishing the Portal map.
3. Configure each target API credential and exact `CEO_ENTITY_<ID>_ALLOWED_ORIGINS`.
4. Verify CEO-3 SSO for `/realm` on each entity before enabling its gateway in the registry.
5. Have a local Director explicitly enable the federation presence policy where approved.
6. Test with one opted-in employee and one non-opted-in employee; only the active opted-in employee may appear.
7. Rehearse entity offline, policy off, expired presence, revoked consent and SSO code replay.

## Exit gate

All four kingdoms render from registry memberships, gateway SSO lands in the owning entity, one unavailable presence source does not block the other three, and contract tests prove that the federation response cannot contain local records or employee activity duration.
