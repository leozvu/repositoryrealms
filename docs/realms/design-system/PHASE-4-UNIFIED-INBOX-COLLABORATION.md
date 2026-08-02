# Phase 4 — Unified Inbox and Collaboration

Status: **implemented on `codex/realm-design-system-v2-implementation`**. This phase adds two authenticated Realm v2 product compositions while keeping ERP as the system of record.

## Product outcome

- `/realm-v2/inbox` combines authorized ERP `Conversation` and `Notification` records into one reading surface.
- `/realm-v2/collaboration` combines voluntary presence with short-lived contact requests so Realm and non-Realm users can coordinate.
- Both routes use the Phase 0 application shell and remain behind `REALM_V2_PREVIEW=true` and the existing Realm pilot authorization.
- Vietnamese remains the default. English remains opt-in through the existing global language switch.

## Canonical data and actions

| Realm intent | Canonical route | Stored result | Boundary |
| --- | --- | --- | --- |
| Load/create a conversation | `GET/POST /api/chat` | ERP `Conversation` | Current authenticated user and Chat business rules |
| Open/reply to a conversation | `GET/POST /api/chat/[id]` | ERP `Message`; opening may update `lastReadAt` | Conversation membership is revalidated server-side |
| Load/mark a notification read | `GET/PUT /api/notifications` | ERP `Notification` | Only notifications authorized for the current account |
| Load voluntary presence | `GET /api/collaboration/presence` | TTL presence projection | Current session, privacy allowlist, 70-second expiry |
| Request/respond to contact | `GET/POST/PATCH /api/collaboration/contact` | Canonical contact record and, when accepted, ERP Conversation | Idempotency, DND, rate limit, expiry, requester/target authorization |

The local Chat API returns the canonical `Message` record ID after persistence. It does **not** currently issue a separate RepositoryRealms receipt, so Phase 4 does not claim that it does. Cross-entity CEO messaging remains a separate governed workflow and is not mixed into the local entity Inbox.

## Degradation and uncertainty

- Chat and Notification load through independent settled requests. If one source fails, the other remains usable and a warning identifies partial degradation.
- Presence and contact requests also degrade independently.
- Product routes never replace failed sources with deterministic fixtures.
- A contact request carries an explicit idempotency key. If the outcome is uncertain, the UI does not retry automatically and asks the user to synchronize first.
- Offline and DND colleagues cannot receive an ephemeral contact request; the user is offered the persistent ERP Inbox instead.

## Privacy and missing capabilities

- Presence is voluntary, short-lived coordination context. The UI never exposes raw heartbeats, online duration, Tasks, Gold, mood, or performance scores.
- Attachments, per-person read receipts, canonical work-object links, collaboration rooms, shared context, and co-viewing are not currently exposed by a canonical API.
- These capabilities are shown as unavailable where useful; no button, record, room, or state is fabricated.
- Approval notifications deep-link to the ERP workflow. Realm does not make the decision itself.

## Responsive and accessibility contract

- Desktop: three-pane Inbox and directory/focus/context collaboration layouts.
- Laptop/tablet: two-column layouts with context moved below.
- Phone: one task at a time, explicit back navigation, five-item mobile navigation, and no horizontal page overflow.
- Primary controls maintain at least a 44px target. Search, filters, lists, forms, status text, error banners, and keyboard focus remain semantic.
- The deterministic QA route `/realm-v2/phase-4-qa` exists only in development and returns 404 in production.

## Evidence and gates

- Static contract: `tests/realm-v2-phase-4.test.mjs`
- Browser capture: `scripts/capture-realm-v2-phase-4.mjs`
- Visual evidence: `qa/realm-v2-phase-4/`
- Regression coverage includes collaboration, notification Inbox, RepositoryRealms parity, the prior Phase 1–3 routes, production build, and Realm v2 Playwright navigation.

No database mutation, commit, push, merge, or deployment is part of this phase implementation.
