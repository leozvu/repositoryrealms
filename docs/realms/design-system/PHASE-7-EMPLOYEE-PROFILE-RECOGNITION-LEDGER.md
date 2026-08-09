# Phase 7 — Employee Profile and Recognition / Gold Ledger

Status: implemented locally on `codex/realm-design-system-v2-implementation`.

## Outcome

Phase 7 turns the following redirect-only aliases into authenticated Realm product compositions:

- `/realm-v2/employee-profile`
- `/realm-v2/recognition`

Both screens are alternative read models over canonical RepositoryRealms data. They do not introduce a second people profile, task store, recognition ledger or reward policy engine.

## Canonical source and scope

The private, no-store endpoint `/api/realm-v2/profile-recognition` composes User, Task, Project, CollaborationPresenceSession, RealmGoldEntry and RealmRewardBudget records. It requires the current ERP session, denies freelancers, applies the existing personal Realm surface decision and scopes the profile, presence and ledger to `currentUser.id`.

The endpoint deliberately excludes salary, hourly rate, review scores, manager notes, private notes, authentication secrets and employee ranking. Skills remain self-declared labels until a canonical evidence link exists; the UI does not invent proficiency levels or RPG statistics. A missing timezone, approver or Task source is displayed as missing rather than inferred.

## Employee Profile contract

- Identity includes preferred name, role, team, company, user-set availability, contact details and access context.
- The screen provides Overview, Work, Skills, Projects, Recognition, Chronicle and Preferences tabs.
- Current and next work, active projects and recent contributions deep-link to the canonical ERP record.
- Profile visibility is explicit: contact is self-only, work follows ERP authorization and sensitive fields are excluded.
- Presence is voluntary coordination context and never a productivity or mood signal.
- Capacity is not fabricated because the current personal contract does not expose an authorized capacity value.

## Recognition ledger contract

- Gold is a recognition accounting unit. Gold does not change payroll, statutory leave, rank or employee score.
- The ledger exposes date, from/to, reason, contribution/project, source, approver when available, policy, amount, canonical receipt and textual status.
- The ledger is append-only. Corrections remain visible as compensating entries; no existing entry is edited or deleted.
- Client-side filters and CSV export operate only on the already authorized self-scoped response.
- The new surface does not create, approve, correct or delete a Gold entry. Users with existing reward-management permission are linked to the current Hội đồng Gold workflow, where maker/checker, budget, idempotency, receipts and audit remain authoritative.
- No leaderboard, streak, scarcity badge, competitive rank or reward shop appears on this screen.

## Resilience, responsive behavior and accessibility

- Loading reserves layout; authorization failure and source failure are distinct states with a safe retry.
- Profile and ledger use semantic headings, labels, status text and visible focus indicators. State is never communicated by color alone.
- Desktop table columns become labeled cards at 640 pixels and below. The details pane loses sticky positioning below tablet width.
- Primary touch targets remain at least 44 pixels; the seven-tab profile control wraps into a two-column mobile grid.
- The development-only `/realm-v2/phase-7-qa` route supplies deterministic fixtures and returns 404 in production.
- Browser evidence covers 1440, 1024, 768, 390 and 375 pixel widths for both screens and checks five mobile destinations, horizontal overflow, console/network failures and mutation requests against the Phase 7 API.

## Verification boundary

No database mutation, commit, push, merge, or deployment was performed as part of Phase 7 implementation.
