# CEO-5 — Cross-entity command gateway

Status: code complete on `codex/realms-demo`; migration, credentials, deployment and production write access remain on HOLD behind CEO-0 and CEO-9.

Owner: Vũ Lương Sơn

Last updated: 2026-07-22

## Outcome

CEO-5 adds a Director-only Command Center at `/ceo-commands`. It can dispatch exactly four business intents to AIm Agency, Egoric Agency, Vnecom LLC or Egolive:

1. `task.create`;
2. `status.request`;
3. `announcement.send`;
4. `approval.request`.

The Portal is not a fifth ERP database. It cannot write Task, Notification or Approval rows directly. Each command is delivered to the owning entity, where RepositoryRealms applies local authorization and business rules, commits the local record with a canonical receipt and AuditLog, then returns receipt evidence to the Portal.

Finance and Payroll writes are not registered actions. A CEO approval request is a generic `ceo_request` with amount `0` and has no financial side effect.

## Trust boundary

```text
CEO browser
  -> local NextAuth Director session
  -> active CEO-3 Portal session + recent TOTP step-up
  -> active entity membership + action-specific scope
  -> POST /api/ceo/v1/command-gateway
  -> Portal delivery metadata row (no business payload)
  -> HTTPS target origin from CEO-2 Registry
  -> POST {entity}/api/ceo/v1/commands with server credential
  -> target API Director authorization + audience/scope/header validation
  -> target business rule + business record + CeoEntityCommandReceipt + AuditLog
  -> validated RepositoryRealms receipt reference in Portal ledger
```

The browser never receives an entity API key. The Portal sends a credential only to the canonical Registry origin or an exact server-side origin allowlist entry. Redirects are refused.

## Command envelope

Every server-to-server request carries:

- contract and version;
- target entity ID;
- opaque global CEO subject;
- action and its exact required scope;
- idempotency key;
- correlation ID;
- allowlisted, normalized business payload.

The idempotency key, correlation ID, actor subject and scope are repeated in request headers. The target rejects any header/body mismatch. Unknown actions, unknown payload fields, altered scopes and wrong target audiences fail closed.

Payload limits:

- request body: 16 KiB;
- task title: 160 characters;
- announcement title/message: 70/240 characters so the existing Notification record is never silently truncated;
- notes and approval context: 1,000 characters;
- no arbitrary URL, amount, salary, payroll or finance fields.

## Business invariants by action

### `task.create`

- Requires `command.task.create` and the target `delivery` capability.
- Reuses `RESOURCES.tasks.beforeCreate`, the Task validator and Director write authorization.
- Optional assignee must be an active employee in the target entity.
- Optional project must exist in the target entity.
- The Task, receipt and audit are committed together; existing Task event/notification automation runs after the canonical commit just as it does for ERP CRUD.

### `status.request`

- Requires `command.status.request` and the target `delivery` capability.
- Creates a normal target-owned Task assigned to the requested active employee.
- It does not create a separate cross-company task store or measure employee performance.

### `announcement.send`

- Requires `command.announcement.send` and the target `people` capability.
- Audience is either all active employees or one allowlisted local role.
- Notifications and recipient-scoped Realm invalidation events are committed with the receipt and audit.

### `approval.request`

- Requires `command.approval.request` and the target `people` capability.
- Creates a pending local `ceo_request` Approval for an allowlisted role.
- No automatic Director self-approval and no Finance/Payroll execution payload exists.

## Receipt and storage policy

The target entity stores `CeoEntityCommandReceipt`:

- raw idempotency key;
- correlation ID;
- actor subject, target, action and scope;
- SHA-256 payload hash, never a duplicate payload;
- local resource/record reference and result count;
- commit timestamp.

The Portal stores `CeoCommandDelivery` only:

- HMAC hash of the idempotency key;
- correlation ID, target, action, scope and payload hash;
- delivery status, attempt timestamps and safe error code;
- target receipt/resource/record reference after confirmation.

Task titles, announcement bodies, approval notes and employee emails are not retained by the Portal ledger or Portal AuditLog.

## Delivery lifecycle

| State | Meaning | Safe operator action |
| --- | --- | --- |
| `dispatching` | Portal has created delivery metadata and is attempting the target call | Wait; reconcile if it remains stuck |
| `delivered` | Receipt passed audience, correlation and invariant validation | Open the target record through CEO-3 SSO |
| `pending_confirmation` | Request may have reached the target, but no valid receipt returned | Reconcile by correlation ID; never resend automatically |
| `rejected` | Target returned an authoritative 4xx business/authorization rejection | Correct the input and submit a new command |
| `failed` | Portal could not start the target request, for example circuit/secret/origin failure | Repair connectivity, then submit a new command |

Reconciliation calls only `GET {entity}/api/ceo/v1/commands/receipts?correlationId=...`. It never replays the business POST. This prevents a lost HTTP response from creating duplicate work.

## APIs

### Portal

- `GET /api/ceo/v1/command-gateway` lists delivery metadata for the active global CEO identity.
- `POST /api/ceo/v1/command-gateway` validates same origin, Director role, active CEO session, recent TOTP, membership scope, entity capability and command payload before dispatch.
- `POST /api/ceo/v1/command-gateway/:id/reconcile` performs receipt-only reconciliation.

### Target entity

- `POST /api/ceo/v1/commands` requires an active Director API key and exact command headers.
- `GET /api/ceo/v1/commands/receipts` requires an active Director API key and returns one safe receipt envelope.

All responses are private/no-store, bounded and versioned. Upstream response bodies are never copied into Portal errors or audit details.

## Graceful degradation and chaos behavior

- DNS/network failure or timeout after dispatch begins becomes `pending_confirmation`.
- A missing secret, blocked origin or open circuit becomes `failed`; the Portal does not pretend the entity received it.
- A target 5xx is uncertain and becomes `pending_confirmation`.
- A target 4xx is authoritative and becomes `rejected`.
- An invalid, mismatched or evidence-free receipt becomes `pending_confirmation` and cannot be marked delivered.
- Duplicate browser submit with the same idempotency/correlation/payload returns the existing delivery.
- Reuse of either key with different semantics returns `409`.
- One entity failure does not mutate another entity or erase any prior delivery evidence.

## UI decisions

- The page uses ordinary ERP language rather than Realm-only vocabulary, so non-gamers can operate it.
- Every form input has a visible label and inline browser validation.
- Dispatch requires an explicit target confirmation checkbox.
- Controls are at least 44 px high, preserve keyboard focus and have pending/disabled states.
- Delivery status includes text plus a marker; color is never the only signal.
- The desktop table becomes labeled cards below 760 px without horizontal page overflow.
- Reduced-motion preferences disable transitions and animation.

## Rollout checklist

1. Complete CEO-0 provenance, backups and exact target verification.
2. Apply CEO-2, CEO-3, CEO-4 and CEO-5 migrations to the Portal control-plane database in order.
3. Apply the CEO-5 receipt migration to each target entity database.
4. Provision the matching Director API key secret for each target.
5. Verify `/api/ceo/v1/capabilities` advertises only the four allowlisted commands supported by that entity.
6. Start with one staging entity and `task.create` to an unassigned test task.
7. Prove same-key replay creates one record and one receipt.
8. Cut the network after target commit; prove the Portal shows `pending_confirmation`, then reconciliation finds the receipt without a second POST.
9. Test wrong audience, wrong scope, stale membership, missing recipient, missing project, invalid receipt and open circuit.
10. Enable one command at a time, one entity at a time, under CEO-9 canary and rollback approval.

## Operational exit gate

Code-level contract, target transaction, payload-retention, idempotency, timeout and reconciliation tests are complete. CEO-5 is not operationally complete until all four staging entities have the migration and credentials, each returns a validated target-owned receipt, and the lost-response chaos drill proves that reconciliation never duplicates a business action.
