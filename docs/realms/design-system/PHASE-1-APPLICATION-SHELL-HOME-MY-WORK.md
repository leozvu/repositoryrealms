# Phase 1 — Application Shell, Realm Home and My Work

Status: **Implementation and local QA complete; not committed, pushed or deployed.**

## Outcome

Phase 1 turns Realm Home and My Work from redirect-only aliases into authenticated product surfaces. They use a dedicated Realm application shell while the original ERP application shell, routes, terminology and workflows remain intact.

The implementation keeps the product invariant established in Phase 0: Realm is another way to view and act on the same business system. It is not a second database, task store, approval engine or notification stream.

## Scope delivered

- Direct authenticated routes at `/realm-v2/home` and `/realm-v2/my-work`.
- Adaptive Realm shell with desktop rail, compact rail and exactly five mobile destinations: Home, My Work, Actions, Inbox and More.
- Existing ERP/CRM shell no longer receives the Realm v2 visual theme globally.
- One-click surface switching between ERP and Realm without changing the user's underlying records.
- Vietnamese default and English opt-in through the existing locale mechanism.
- Existing global search, notifications, session provider, toasts and collaboration bridge reused in the Realm shell.
- Priority-first Home composition: next task, attention items, approvals and recent notifications.
- My Work filters and canonical task cards with direct ERP links.
- Explicit loading, partial-data warning, retry, empty and action-feedback states.
- Keyboard skip link, route focus hand-off and reduced-motion-compatible transitions.

## Canonical data and action boundary

The product screens read from existing endpoints:

- `GET /api/execution/my-work`
- `GET /api/approvals`
- `GET /api/notifications`

Task state changes use the existing RepositoryRealms command path:

- `POST /api/execution/actions`
- `action: task.transition`
- current task state supplied as `expectedState` for compare-and-set protection
- a unique `Idempotency-Key` on every command
- existing authorization, business rules, receipt and audit behavior remain authoritative

No preview fixture is imported by either authenticated product surface. The visual design-system route remains the only deterministic non-canonical fixture surface.

## ERP / Realm separation

ERP remains the conventional interface for non-gamer users. Its routes and workflows were not renamed, replaced or medievalized by this phase. Realm Home and My Work are alternative compositions over the same records; remaining Realm v2 areas continue to redirect to their canonical workflows until implemented in later phases.

## Verification evidence

- 15/15 focused Node tests passed for design-system contracts, Phase 1 boundaries and Phase 0 evidence.
- Four Playwright captures passed at desktop and mobile sizes for Home and My Work.
- All four captures returned HTTP 200, had zero page-level horizontal overflow, zero browser console errors and zero failed responses.
- Mobile captures expose exactly five primary destinations.
- Browser action probe confirmed a Start action emitted `task.transition`, entity `task-1`, `expectedState: todo`, `nextState: in_progress` and an idempotency key.
- `next build` completed successfully after compilation, type checking and static generation.

Evidence lives in `qa/realm-v2-phase-1/`. The local `/realm-v2/phase-1-qa` harness renders the real product shell and screen components, intercepts only canonical-shaped API responses, is localhost-only in the capture script and returns 404 under production `NODE_ENV`.

## Preview environment finding

Read-only Vercel runtime logs explain the Phase 0 preview P1 failures: the linked preview database schema is behind the deployed Prisma client. Prisma `P2022` errors report missing columns including `Lead.campaign`, `Client.serviceLine` and an `ApiKey` field. This is an environment migration/schema-drift issue and was intentionally not hidden with fallback data or mutated during Phase 1.

Before any later preview release, the approved deployment workflow must back up and migrate the correct preview database, then rerun the full visual baseline. No database migration or deployment is part of this phase.

## Next phase

Phase 2 should implement Work Management and Action Center as Realm compositions over the same RepositoryRealms authorization, business rules and receipts. The Phase 1 shell becomes the shared frame; ERP remains independently usable throughout.
