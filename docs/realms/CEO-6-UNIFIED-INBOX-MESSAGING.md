# CEO-6 — Unified Inbox and Messaging

Status: code complete on `codex/realms-demo`. Database migration, four-entity credentials, encryption secret and deployment remain on HOLD behind CEO-0 and CEO-9.

## Outcome

CEO Portal provides one inbox for AIm Agency, Egoric Agency, Vnecom LLC and Egolive while each company keeps its own ERP database and existing messaging experience. A Portal message is delivered into the target entity's canonical `Conversation` and `Message` models. Staff who do not use Realm receive it in ERP Messages; Realm users receive the same message invalidation and notification path.

## Trust boundaries

- A directory profile exists only after the employee explicitly enables `sharedWithCeoPortal`.
- Shared fields are limited to local user ID, email, display name, title and optional presence consent. Salary, phone, attendance, performance, task and Gold data are excluded.
- The Portal stores a time-bounded directory cache and an AES-256-GCM encrypted inbox copy. `CEO_MESSAGING_ENCRYPTION_SECRET` is server-only and must be at least 32 characters.
- The target entity validates Director API authentication, entity audience, scope, opt-in recipient, message bounds and idempotency.
- The target commits local Conversation/Message, `CeoEntityMessageReceipt` and payload-free `AuditLog` atomically through RepositoryRealms.
- Entity channels include only employees currently shared with the CEO directory. They are not equivalent to the company's unrestricted general channel.
- Portal timeouts become `pending_confirmation`. Reconciliation performs a receipt lookup and never repeats message delivery.

## Contracts and endpoints

Target entity:

- `GET /api/ceo/v1/directory`
- `GET|PUT /api/ceo/v1/directory/profile`
- `POST /api/ceo/v1/messaging/deliver`
- `GET /api/ceo/v1/messaging/receipts`
- `GET /api/ceo/v1/messaging/feed`

Portal:

- `GET|POST /api/ceo/v1/messaging/directory`
- `GET|POST /api/ceo/v1/messaging/conversations`
- `GET|PATCH /api/ceo/v1/messaging/conversations/:id`
- `POST /api/ceo/v1/messaging/conversations/:id/messages`
- `POST /api/ceo/v1/messaging/conversations/:id/refresh`
- `POST /api/ceo/v1/messaging/messages/:id/reconcile`
- `GET /api/ceo/v1/messaging/export`

All Portal mutations are same-origin. Sending, reconciliation and export require a recent CEO TOTP step-up. Scopes are `directory.read`, `message.read`, `message.send` and `message.export`.

## Offline, receipt and mention behavior

- Local ERP delivery creates an in-app notification and a recipient-scoped Realm change event.
- An offline employee sees the conversation and notification on their next ERP/Realm sync.
- Existing `ConvMember.lastReadAt` is the source for outbound read receipts.
- `@email` mentions are normalized and bounded to 20 entries. Mentions do not grant access and cannot add an unshared participant.
- Replies written in the local ERP conversation are imported only through its `CeoEntityConversationLink`; unrelated local conversations are never exported.
- A slow or unavailable entity degrades independently. Other entity conversations remain usable.

## Retention, deletion, export and incident policy

Policy version: `1.0.0`.

- Shared directory cache: seven days and removed on the next sync after consent is revoked.
- Encrypted Portal message copy: 365 days by default.
- Deletion request grace: 30 days. The conversation policy endpoint schedules Portal redaction; target-entity deletion remains a separate accountable operation, so neither side may claim global deletion without the other side's receipt.
- Expired Portal messages are cryptographically redacted on inbox read/export; conversations under `incident_hold` are excluded from automated redaction.
- Legal/incident hold sets the conversation to `incident_hold`, blocks automated deletion and requires a named incident ticket.
- CEO export is JSON, capped at 5,000 messages per request, step-up protected and audited.
- Export contains only the requesting CEO identity's conversations.
- Audit records never include plaintext message bodies or raw idempotency keys.
- A suspected key leak requires: disable messaging scopes, rotate `CEO_MESSAGING_ENCRYPTION_SECRET`, rotate affected entity API credentials, preserve audit/receipt metadata, assess encrypted records, and re-enable one entity at a time through CEO-9 rollout rings.

## Operational prerequisites

1. Apply `20260722020000_add_ceo_unified_messaging` independently to Portal and each target entity database after backup verification.
2. Set a unique `CEO_MESSAGING_ENCRYPTION_SECRET` on the Portal only.
3. Set `CEO_LOCAL_DIRECTOR_EMAIL` on each target so federated messages map to the intended local Director account, then confirm the entity API credential and HTTPS origin allowlist.
4. Deploy target endpoints before enabling Portal messaging for that entity.
5. Have test employees opt in from ERP Messages.
6. Run directory sync, DM delivery, entity-channel delivery, offline receipt, local reply import, export and revocation rehearsals.
7. Verify a target outage produces `pending_confirmation` and reconciliation sends no second POST.

## Exit gate

All four entities must pass the same directory/message contract tests. One offline entity must not block the other three. A message is considered delivered only after a target-owned RepositoryRealms receipt, and the Portal must never persist plaintext message content.
