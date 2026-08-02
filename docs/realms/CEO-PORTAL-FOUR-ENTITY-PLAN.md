# CEO Portal — Four-entity architecture and delivery plan

Status: proposed; no production deployment authorized

Owner: Vũ Lương Sơn

Working branch: `codex/realms-demo`

Last updated: 2026-07-21

## 1. Codebase audit

The repository contains four business entities plus a separate Master Dashboard:

| Business entity | Vercel project / URL | Postgres schema | Product profile |
|---|---|---|---|
| AIm Agency | `agency-erp` / `https://agency-erp-mu.vercel.app` | `public` | Agency ERP/CRM |
| Egoric Agency | `erp-egoric` / `https://erp-egoric.vercel.app` | `egoric` | Agency ERP/CRM |
| Vnecom LLC | `erp-vnecom` / `https://erp-vnecom.vercel.app` | `vnecom` | ERP/CRM instance |
| Egolive | `erp-egolive` / `https://erp-egolive.vercel.app` | `egolive` | Livestream operations |
| CEO/Master surface | `erp-master-leoz` / `https://erp-master-leoz.vercel.app` | none in this repository | Existing read-oriented master dashboard in another repository |

All five URLs returned HTTP 200 on 2026-07-21. The four entity deployments redirect unauthenticated users to `/login`.

### Existing multi-entity foundations

- One ERP codebase is deployed to multiple Vercel projects.
- Each entity is isolated by a Postgres schema selected through `DATABASE_URL` / `DIRECT_URL`.
- `Setting.json` contains company branding, module selection and role labels.
- `/api/v1/summary` already exposes a Director-only aggregate for a Master Dashboard.
- API keys are stored hashed, can carry Director role and can be revoked per entity.
- `prisma/bootstrap.js` can initialize a new entity without deleting existing records.
- `scripts/backup-db.js` knows `public`, `egoric`, `vnecom`, `fretas` and `egolive` schemas.
- RepositoryRealms already supplies shared authorization, business rules, receipts, audit and ERP/Realm projections inside an entity.

### Egolive capabilities found

- Dedicated `LiveSession` and `Violation` models.
- TikTok/Shopee sessions, shops, clients, hosts and assistants.
- Scheduled/live/done/reconciled lifecycle.
- GMV, net GMV, orders, viewers, CTR and CTOR.
- Platform fee, tax withheld and net received.
- Host base pay, percentage pay, advance, settlement and withholding.
- Reconciliation creates a host payout.
- Settlement records money received into the financial ledger.
- Rolling 180-day platform violation points.
- Dedicated navigation, resource guards and livestream module preset.
- Vertical business-rule tests for reconciliation, host pay, withholding and module isolation.

### Current gaps

1. The Prisma schema is still single-tenant inside each deployment; there is no central `Organization`, `Membership` or `GlobalIdentity` model.
2. Each entity has an independent Credentials/NextAuth login.
3. The existing Master Dashboard repository is not present in this workspace.
4. `/api/v1/summary` is a coarse read endpoint, not a versioned CEO Portal contract.
5. There is no cross-entity command, receipt or message contract.
6. There is no entity registry with health, schema version, capabilities and key-rotation state.
7. Users and records have local IDs, so the same person cannot yet be resolved safely across entities.
8. A Director API key is broader than the least-privilege scopes a mature portal should use.
9. Cross-domain SSO cannot safely rely on a shared browser cookie across independent `vercel.app` hostnames.
10. Realm presence and collaboration are currently scoped to one entity.

## 2. Target product

The CEO Portal is a separate control plane, not a fifth copy of ERP business data.

```text
                         CEO Identity
                              │
                       CEO Portal / BFF
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    Entity Registry     Aggregate Read Model   Message Router
          │                   │                   │
          └────────────── Command Gateway ───────┘
                              │
             ┌────────────────┼────────────────┐
             │                │                │
          AIm ERP        Egoric ERP       Vnecom ERP       Egolive ERP
          public          egoric            vnecom           egolive
```

### Non-negotiable invariant

The CEO Portal must never write directly into an entity database. A CEO action is sent to the target entity, where that entity executes:

1. identity and membership validation;
2. local authorization;
3. local business rules;
4. idempotent canonical write;
5. RepositoryRealms receipt;
6. local audit entry;
7. domain event back to the portal.

## 3. CEO experience

### One private login

- One global CEO identity for Vũ Lương Sơn.
- Mandatory passkey or password + TOTP.
- Recovery codes and emergency account-recovery procedure.
- Device/session list and remote revocation.
- Short idle timeout for sensitive screens.
- Step-up authentication for finance, payroll, user administration and large approvals.

### Company switcher

- `All companies` overview.
- AIm Agency.
- Egoric Agency.
- Vnecom LLC.
- Egolive.
- Remember the last company without weakening authorization.
- Visual company identity and environment marker to prevent acting in the wrong entity.

### CEO overview

- Cash, revenue, expense, AR/AP and targets per entity.
- CRM pipeline and win rate.
- Project/task execution health.
- Approval backlog and SLA risk.
- Headcount and capacity in authorized aggregate form.
- Egolive GMV, net received, pending reconciliation, pending platform settlement and host payout exposure.
- Entity health, last sync, stale-data indicator and incidents.
- No employee ranking based on presence, Realm time or Gold.

### Enter an entity without logging in again

Because the entities use separate domains, use an OIDC-style redirect exchange instead of a shared cookie:

1. CEO clicks `Open Egolive`.
2. Portal issues a one-time, signed, short-lived authorization code with entity and scopes.
3. Target entity validates issuer, audience, expiry, nonce and code replay status.
4. Target entity maps the global CEO subject to a local Director membership.
5. Target entity creates its own secure session and redirects to the requested record.

The code must expire in 30–60 seconds, be single-use and never contain business payloads.

### Assign work across entities

- Select target entity first.
- Search only target-entity assignees returned by the target authorization scope.
- Create the task through a versioned target command.
- Show the returned receipt and local task link.
- Retry with the same idempotency key.
- If delivery is uncertain, show `Pending confirmation`; never claim success optimistically.

### Cross-entity messaging

- Central conversation metadata and routing can live in the portal.
- Each participant needs a global identity mapping and explicit entity membership.
- Sensitive attachments remain in the owning entity; portal messages carry authorized links.
- Offline inbox, delivery/read receipts, notification preference and email fallback.
- Realm users and ERP-only users receive the same conversation event through their active surface.
- A cross-entity chat must not grant access to records in another entity.

## 4. Data boundaries

### Remain inside each entity

- Leads, clients, quotes, invoices and transactions.
- Projects, tasks, time logs and approvals.
- HR, payroll, salary and employee evidence.
- Egolive sessions, payouts and violations.
- Gold ledger, Tavern inventory and Realm business projections.

### Portal control-plane data

- Global identity subject.
- Entity registry and health.
- CEO membership/scopes per entity.
- Sanitized aggregate snapshots.
- Cross-entity message envelopes.
- Command delivery status and receipt references.
- Portal audit log.

### Aggregate policy

- Read models are snapshots with `entityId`, `asOf`, `schemaVersion`, `contractVersion` and confidence/staleness state.
- Portal never silently sums incompatible metrics.
- GMV is not revenue; project cost proxies are not accounting profit.
- Currency and timezone are explicit.
- HR/payroll aggregates require additional scopes and step-up authentication.

## 5. Delivery phases

### CEO-0 — Inventory and deployment safety

- Confirm all four Vercel project IDs, domains, database hosts/schemas and production owners.
- Read-only backup and restore-readiness check for each schema.
- Compare migration history and Prisma tables across all entities.
- Export current settings/modules and active account counts without exposing secrets.
- Confirm Egolive uses `MODULE_PRESETS.livestream`.
- Build a branch/deployment matrix separating RepositoryRealms from `feat/leozops-s1a`.
- Do not deploy until each target and rollback path is approved.

Exit gate: four signed entity manifests and zero ambiguous production target.

### CEO-1 — Versioned entity contract

- Replace the implicit `/api/v1/summary` dependency with `/api/ceo/v1/snapshot`.
- Add capability discovery and health contracts.
- Add contract version, entity ID, timestamp, currency and schema version.
- Return only scoped aggregates.
- Contract tests run against Agency and Egolive fixtures.

Exit gate: all four entity adapters pass the same contract suite.

### CEO-2 — Entity Registry

Implementation status: code-complete on `codex/realms-demo`; migration and deployment remain blocked by the CEO-0 production safety gate. See `CEO-2-ENTITY-REGISTRY.md`.

- Registry record: stable entity ID, display name, URL, type, capabilities, environment and status.
- Store credential references in server secrets, never raw keys in the database or frontend.
- Key rotation, last successful sync, error count and circuit-breaker state.
- Admin UI for enable/disable without deleting an entity.

### CEO-3 — Central CEO Identity and SSO

Implementation status: code complete on `codex/realms-demo` with password + TOTP, versioned recovery codes, revocable CEO sessions, 45-second single-use authorization codes and local Director mapping. Migration/deployment and the four-entity operational exit gate remain on HOLD behind CEO-0. See `CEO-3-CENTRAL-IDENTITY-SSO.md`.

- Global identity, entity membership and scoped role model.
- Passkey/TOTP, recovery and session revocation.
- One-time authorization-code exchange for each entity.
- Local Director mapping and independent entity session.
- CSRF, nonce, audience, replay and open-redirect tests.

Exit gate: one CEO login opens all four entities without credential re-entry and cannot open an unregistered entity.

### CEO-4 — Unified read dashboard

Implementation status: code complete on `codex/realms-demo` with a durable aggregate cache, validated CEO v1 snapshots, per-entity circuit-breaker refresh, stale-if-error fallback, currency-safe comparison and signed SSO drill-downs. Migration/deployment and the four-entity operational exit gate remain on HOLD behind CEO-0. See `CEO-4-UNIFIED-READ-DASHBOARD.md`.

- Entity cards and `All companies` comparison.
- Finance, CRM, delivery, people/operations and Egolive vertical KPIs.
- Staleness and source provenance on every card.
- Drill-down uses a signed deep link to the owning entity.
- Cached snapshots with background refresh and graceful degradation.

Exit gate: all four registered entities populate the dashboard from their own CEO v1 endpoint; one unavailable entity is visibly stale/degraded without hiding or corrupting the other three.

### CEO-5 — Cross-entity command gateway

Implementation status: code complete on `codex/realms-demo` with the four-action allowlist, step-up protected Portal dispatcher, target-owned RepositoryRealms receipts, payload-free delivery ledger and correlation-only reconciliation. Migration, entity credentials, deployment and write enablement remain on HOLD behind CEO-0 and the CEO-9 rollout rings. See `CEO-5-CROSS-ENTITY-COMMAND-GATEWAY.md`.

- Initial allowlist: create task, request status, send announcement and submit approval request.
- Every request carries target entity, actor subject, scope, idempotency key and correlation ID.
- Target entity produces canonical RepositoryRealms receipt and audit.
- Portal stores only delivery status and receipt reference.
- No direct finance/payroll write in the first release.

### CEO-6 — Unified inbox and messaging

Implementation status: code complete on `codex/realms-demo` with an explicitly shared directory, AES-256-GCM Portal inbox, target-owned ERP Conversation/Message adapters, Realm notification delivery, read receipts, reply import, export and incident/retention policy. Migration, secrets, deployment and the four-entity operational exit gate remain on HOLD behind CEO-0 and CEO-9. See `CEO-6-UNIFIED-INBOX-MESSAGING.md`.

- Global directory composed from explicitly shared directory profiles.
- One-to-one and entity channel conversations.
- ERP and Realm delivery adapters.
- Offline inbox, read receipts, mention and notification fallback.
- Retention, deletion, export and incident policy.

### CEO-7 — Realm federation

Implementation status: code complete on `codex/realms-demo` with a four-kingdom world map, CEO-3 SSO gateways, double-consent ephemeral presence, per-entity degradation and explicit record-access boundaries. Scope migration, credentials, policy enablement and deployment remain on HOLD behind CEO-0 and CEO-9. See `CEO-7-REALM-FEDERATION.md`.

- Each company remains a separate Realm/kingdom.
- CEO portal can show a world map with four gateways.
- Entering a gateway performs SSO into that entity.
- Presence is shared only when users opt in and policy permits it.
- Cross-entity chat does not expose local tasks or records automatically.

### CEO-8 — Security, chaos and recovery

Implementation status: code complete on `codex/realms-demo` with endpoint-specific scopes, entity audiences, expiry, durable rate limits, SSO/service secret separation, one-time credential rotation, a Portal-only kill switch, break-glass recovery and seven deterministic dry-run chaos scenarios. Migration, secret provisioning and deployment remain on HOLD behind CEO-0 and CEO-9. See `CEO-8-SECURITY-CHAOS-RECOVERY.md`.

- Least-privilege portal scopes instead of unrestricted Director API keys.
- Secret rotation and secret scanning.
- Entity circuit breakers and per-entity rate limits.
- Chaos: one entity offline, stale snapshot, timeout, duplicate command, lost receipt, partial rollout and identity provider outage.
- Restore portal control plane without restoring entity business databases.
- Revoke the CEO portal without disabling normal local ERP login.

### CEO-9 — Pilot and rollout

Implementation status: code complete on `codex/realms-demo` as an evidence-backed, fail-closed rollout control plane with five ordered rings, per-entity CAS state, immutable receipts, production change-window approval, independent maker/checker and server-side enforcement across every outbound Portal adapter. The migration, evidence population, CEO-0 GO decision, production credentials and deployment remain on HOLD. See `CEO-9-PILOT-ROLLOUT.md`.

- Local/staging adapters first; no production write access.
- Read-only pilot across all four entities.
- Enable SSO for CEO only.
- Enable messaging next.
- Enable allowlisted commands last, one entity at a time.
- Egolive first gets read dashboard and deep links; payout/settlement remains local until an independent finance review.
- Every ring has backup, canary, reconciliation and rollback evidence.

### CEO-12 — Group operations cockpit

Implementation status: code complete on `codex/realm-design-system-v2-implementation`. The cockpit composes sanitized dashboard, rollout, command receipt, messaging and workforce read models. It degrades per source and never writes an entity business record.

- One operational pulse across the four companies.
- Priority queue for source outages, stale data, failed/pending receipts and rollout holds.
- Quick links enter canonical Portal or entity workflows.
- No GMV/revenue/cash mixing and no automatic resend.

### CEO-13 — Unified decision queue

Implementation status: code complete on `codex/realm-design-system-v2-implementation`. Production activation is intentionally gated by coordinated entity deployment and service-credential rotation.

- Each entity exposes a separate `repositoryrealms.ceo.decision-feed` v1 projection under `ceo.decisions.read`.
- The feed excludes payload, reference IDs, requester IDs, reviewer IDs and decision history.
- Portal access requires Director authentication, an active CEO session and recent TOTP step-up.
- SLA ranking is deterministic and amounts remain grouped by currency.
- Portal provides only a signed SSO deep link; approve/reject stays in the owning ERP workflow with its authorization, maker-checker, receipt and audit.
- One unavailable entity is shown as degraded and does not block the other companies.

Activation gate: deploy the target endpoint to each approved entity, rotate its Portal service credential to include `ceo.decisions.read`, verify the `read_only` rollout evidence, then canary one entity before enabling all four. Never broaden the existing snapshot v1 contract to carry approval data.

### CEO-14 — Executive daily briefing

Implementation status: code complete on `codex/realm-design-system-v2-implementation`.

- One deterministic briefing split into `Act now`, `Close today` and `Keep watching`.
- Composes CEO-12 operational attention with CEO-13 decision SLA state and whitelisted dashboard aggregates.
- Shows source availability and preserves partial results during adapter failure.
- Vietnamese/English, responsive at 375/768/1024/1440 and keyboard-friendly 44px controls.
- No generative decision making, invented facts, direct entity writes or silent financial aggregation.

Exit gate: all four companies return a validated decision feed, a forced timeout proves graceful degradation, and every briefing link resolves to a canonical Portal or signed entity workflow.

### CEO-15 — Universal company navigator

Implementation status: code complete on `codex/realm-design-system-v2-implementation`. See `CEO-15-UNIVERSAL-COMPANY-NAVIGATOR.md`.

- `Ctrl+K` in CEO Terminal opens one bilingual, keyboard-first workflow finder.
- Portal workspaces remain locally available even when Entity Registry is degraded.
- Entity workflows are generated from the entity capability profile, never by indexing business records.
- Every entity launch uses the existing signed SSO authorization-code boundary and a relative allowlisted path.
- The Portal never searches generic ERP `/api/data/*`, exposes registry secrets or executes a business action from the Navigator.
- Mobile, tablet and desktop layouts preserve visible focus, 44px controls and reduced-motion behavior.

Exit gate: the four entities expose the correct capability-aware workflow set, TOTP-locked sessions cannot launch entity SSO, Registry failure preserves Portal navigation, and entity deployments return 404 for `/ceo-navigator`.

## 6. Proposed deployment topology

| Component | Suggested project | Database |
|---|---|---|
| CEO Portal | Existing `erp-master-leoz` after audit, or a new isolated `repositoryrealms-ceo-portal` | Separate control-plane database |
| AIm | `agency-erp` | `public` |
| Egoric | `erp-egoric` | `egoric` |
| Vnecom | `erp-vnecom` | `vnecom` |
| Egolive | `erp-egolive` | `egolive` |
| Realm staging | `crmegoric-realms-demo` / `crmegoric-realms-staging` | Staging-only database/schema |

The Portal database must not become a shared operational ERP database.

## 7. Testing matrix

- Contract tests for all entity adapters.
- SSO positive, negative, replay and expiry tests.
- RBAC by entity and scope.
- Deep links across four domains.
- Read-model reconciliation and stale-cache tests.
- Idempotent command/receipt tests.
- Cross-entity messaging delivery and authorization tests.
- Egolive financial reconciliation regression tests.
- Desktop/mobile and Vietnamese/English tests.
- Performance with one slow/offline entity.
- Audit completeness and emergency portal revocation.

## 8. Go/No-Go criteria

- All four entity manifests verified.
- Independent backups and restore-readiness pass.
- Zero P0/P1 in SSO and authorization.
- Portal can be disabled without disrupting local ERP logins.
- No direct database writes from Portal to an entity.
- 100% portal commands have target receipt and audit.
- Stale/offline entity is labeled, isolated and does not block the other three.
- CEO has one login, step-up security and session revocation.
- Maker/checker approval before production write scopes are enabled.

## 9. Immediate next action

Run CEO-0 as a read-only audit. Produce a manifest for AIm, Egoric, Vnecom and Egolive, including Vercel project ID, approved domain, database fingerprint, schema, migration level, enabled modules, account count, backup status and rollback deployment. Do not relink or deploy any project until the current deployment safety directive is explicitly amended with these four exact targets.
