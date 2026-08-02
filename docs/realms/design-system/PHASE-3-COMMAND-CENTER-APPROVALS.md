# Realm Design System v2 — Phase 3

## Scope

Phase 3 implements the two authenticated product compositions from visual board `08-command-center-approvals-v1.png`:

- `/realm-v2/command-center`
- `/realm-v2/approvals`

Both routes reuse the Phase 1 application shell, keep Vietnamese as the default language, support the existing English opt-in, and stay behind `REALM_V2_PREVIEW=true`.

## Command Center contract

Command Center is a governed proposal cockpit over the existing CEO Command Gateway. It does not create a second command store or execute business logic in the browser.

1. Natural-language intent is structured locally into one of the existing allowlisted commands: `task.create`, `status.request`, `announcement.send`, or `approval.request`.
2. The user selects a target entity, reviews the normalized fields, and explicitly confirms the scope.
3. Submission requires an active CEO identity with step-up and sends a unique idempotency key and correlation ID to `/api/ceo/v1/command-gateway`.
4. The target entity executes through RepositoryRealms, which revalidates authorization and business rules.
5. Realm shows success only when delivery is `delivered` and a canonical receipt ID exists.
6. An uncertain delivery is reconciled through the existing reconcile route; Realm never resends the business action automatically.

Finance and Payroll are intentionally absent because they are not registered in the current Command Gateway allowlist.

## Approvals contract

Approvals is a canonical review workspace over `/api/approvals`. It displays the authorized inbox, requests created by the current account, completed requests, maker-checker steps, amount, policy boundaries, and conflict-of-interest context.

`approval.decide` is not registered as a RepositoryRealms intent and `/api/approvals/[id]/decide` does not share the RepositoryRealms receipt contract. Phase 3 therefore fails closed:

- no direct Approve or Reject control exists in Realm;
- Realm does not call the ERP decision handler;
- the user follows a focused deep link to the canonical ERP approval workflow;
- no success or downstream receipt is inferred inside Realm.

The Escalated tab is intentionally empty because the current API does not expose a separately authorized escalation queue. Product routes never invent records to fill it.

## Responsive and browser evidence

Development-only route `/realm-v2/phase-3-qa` supplies deterministic canonical-shaped responses for browser testing and returns 404 in production. `scripts/capture-realm-v2-phase-3.mjs` captures both screens at 1440, 1024, 768, 390 and 375 pixels.

Evidence in `qa/realm-v2-phase-3/` records:

- 10/10 successful screen captures;
- zero horizontal overflow across all five breakpoints;
- zero browser console errors and failed responses;
- exactly five mobile navigation destinations;
- one validated `task.create` request with target, title, note, unique idempotency key, correlation ID and visible canonical receipt;
- a focused ERP decision link with zero direct Approve/Reject buttons in Realm;
- visible fail-closed policy copy for the unregistered approval decision intent.

Full-page phone screenshots can repeat the fixed bottom navigation at Playwright stitch boundaries; this is a capture artifact, not additional product navigation.

## Safety status

Phase 3 does not modify the RepositoryRealms intent contract, the lead-snapshot v1 contract, `lib/leozops`, or `tests/leozops-*`. No database mutation, commit, push, merge, or deployment is part of this phase.
