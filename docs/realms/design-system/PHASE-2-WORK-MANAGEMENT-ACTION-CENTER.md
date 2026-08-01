# Phase 2 — Work Management and Action Center

Status: **Implementation and local QA complete; not committed, pushed or deployed.**

## Outcome

Phase 2 turns Work Management and Action Center from redirect-only aliases into authenticated Realm product surfaces. They reuse the Phase 1 application shell and remain alternative operational views over the same ERP records, authorization, business rules, receipts and audit trail.

The conventional ERP/CRM routes and terminology remain independently usable. This phase does not introduce a parallel task store, approval engine, employee score or synthetic operational history.

## Work Management

`/realm-v2/work-management` reads the existing `GET /api/execution/team-work` projection and provides four operational views:

- Board by planned, doing, waiting and blocked state.
- Queue for review and intervention order.
- Updates as a latest-update projection; it is not represented as Chronicle or immutable audit history.
- Workload as capacity planning only, with employee ranking and presence-as-productivity explicitly disabled.

Task intervention uses the existing RepositoryRealms command gateway at `POST /api/execution/actions`. Only registered task intents are exposed: `task.transition`, `task.block`, `task.unblock` and `task.escalate`. Every mutation supplies the current version/state where required, sends a unique `Idempotency-Key`, and refuses to claim success unless a RepositoryRealms receipt is returned.

## Action Center

`/realm-v2/action-center` composes authorized exceptions from the existing Team Work, Approvals and Notifications sources. It exposes approval, blocker, overdue-risk and unread-notification filters with source, urgency, impact and evidence context.

Approval decisions intentionally fail closed. `approval.decide` is not registered in the RepositoryRealms allowlist, so Realm does not copy the existing approval handler or invent a new intent. The detail panel shows the maker-checker path and deep-links to the canonical ERP approval workflow. Task blockers and risks may use the registered task intervention commands described above.

## Responsive and accessibility behavior

- Verified at 1440, 1024, 768, 390 and 375 pixel widths.
- Four-lane work board collapses to two columns and then one column without page-level horizontal scrolling.
- Filters become a complete two-column grid on narrow phones instead of clipping off-frame.
- Action Center detail moves below the exception list on tablet and mobile.
- The 1024-pixel application shell collapses search to its icon to prevent wrapped or overlapping controls.
- Mobile retains exactly five primary destinations and 44-pixel minimum interactive targets.
- Existing modal focus management, labels, live feedback, skip link and reduced-motion behavior are reused.

## Verification evidence

- 31/31 focused Node contract and regression tests passed before visual refinement.
- 10/10 Playwright captures passed across two product screens and five breakpoints.
- All captures returned HTTP 200 with zero page-level horizontal overflow, zero browser console errors and zero failed responses.
- Browser command probe confirmed `task.block`, task `task-1`, expected version `2`, reason code `dependency`, a non-empty reason and an idempotency key.
- Browser safety probe confirmed the ERP approval deep-link is present, no direct `Duyệt` button is exposed, and the unregistered intent message is visible.
- Optimized `next build` completed compilation, type checking, page-data collection and generation of all 88 static pages.

Evidence lives in `qa/realm-v2-phase-2/`. The local `/realm-v2/phase-2-qa` harness renders the real shell and real Phase 2 product components, intercepts only canonical-shaped API responses, is restricted to localhost by the capture script and returns 404 in production.

## Release boundary

No database migration, commit, push or Vercel deployment is part of Phase 2. Preview database schema drift identified in Phase 1 remains a separate deployment-readiness concern and is not hidden with fixture or fallback data.

## Next phase

Phase 3 should implement Command Center and Approvals using the same contract-first rule. Approval mutation must remain in ERP until a separately reviewed RepositoryRealms approval intent defines authorization, maker-checker business rules, idempotency, receipts and atomic audit behavior.
