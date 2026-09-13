# ERP/CRM — reliability implementation batch

Scope: production source changes to shared resource loading and forms, Lead/Project/Client handlers, client-related queries and My Work. Realm world development remains paused. No production deployment or schema migration in this batch.

## Implemented behavior

- `lib/resource-client.js` owns latest-request cancellation, stale-response rejection, inflight accounting, explicit read errors and recovery. `useResource` clears old rows when the resource/filter/enabled state/session identity changes; optional scopeKey can cover caller-specific boundaries.
- Identical overlapping mutations share one request. Distinct concurrent mutations are refused instead of receiving the wrong record's success result. HTTP failure, malformed success and approval interception do not return a confirmed record. An uncertain write is never automatically retried.
- A confirmed mutation remains successful if its follow-up list refresh fails. The user receives an explicit refresh warning; the saved form must not invite another create merely because GET failed.
- Lead create/edit/delete/drag and Project create/edit/delete plus client-contact handlers check the result before success feedback or form closure. A created project whose template application fails remains created, with a link to inspect it before applying again.
- FormModal keeps input after a rejected save, labels inputs with stable IDs, disables input while sending, asks before discarding changed fields and warns on browser unload. This does not implement durable drafts or intercept every Next.js route change.
- Client detail requests all nine resources with server-side client/reference filters. Read rules and sanitization remain authoritative. Finance/project/feedback metrics show unknown values when their inputs are unavailable instead of claiming zero.
- Mobile DataTable renders the current page; CSV behavior remains the filtered set already loaded, not an unimplemented full-server export.
- My Work cancels superseded reads, serializes writes and deadline sorting, marks only the active task pending, reloads on a 409 without replaying the command, and distinguishes missing task/approval data from an empty queue. Freshness is a fetched timestamp, not a live-sync claim.

## Evidence and boundaries

Candidate build: `V02rgqPxlXEajFErBxGQh`; production build passed (91 static pages). Preview process serves the same build ID. This confirms compilation and preview identity, not authenticated ERP availability.

Component browser suite: **14 passed**, desktop Chromium and Pixel 5 emulation. It executes the actual hook, FormModal, Lead create handler and My Work source with React DOM in an isolated test harness. Network responses, session and layout wrappers are fixtures. It verifies error/retry, identity changes, failed-form preservation, pending locks and stale-task behavior. It does **not** verify Radix focus management, production CSS, full-page visual acceptance, login, database authorization or multi-user synchronization. Command: `npx playwright test --config playwright.erp-components.config.mjs`.

Static inventory: [source-baseline.json](source-baseline.json), 81 UI routes, 148 API routes and 1,368 interactive elements across the tree including Realm; zero parse errors. Risk candidates are heuristic candidates, not confirmed defects. No real-user workflow timing or performance improvement percentage has been claimed.

The first full unit run recorded 1,215 passes, two failures and five skipped database tests. The failures were an obsolete mutationRef source assertion after lifecycle extraction and an action-map contract missing the previous Realm resolution preference API. The assertion now exercises duplicate-request behavior, and the bounded runtime contract is updated. The initial My Work browser case also exposed ambiguous pending labels on inactive tasks; only the active task now changes its label. Initial failure logs are retained; final results are recorded below.

Final full result: **1,240 tests passed, 0 failed, 0 skipped**, 62.6 seconds, using `npm test` with `PAYMENT_TEST_DATABASE_URL` pointing to the isolated loopback test database. The runner reports 1,222 top-level entries and 1,240 total tests including nested database cases. This is one full run, not a sum of targeted reruns. The database cases cover payment concurrency/rollback, search, collection pagination, lead conversion and outbox behavior. The newly added client-related filter test also checks the actual registry/readCollection contract at the in-memory query boundary; it is not presented as a new PostgreSQL load benchmark.

Evidence: [full test log](full-tests.log), [component browser log](browser.log), [build log](build.log), [initial unit failures](initial-full-tests.log), [initial browser failures](initial-browser.log), [manifest](manifest.json). No coverage percentage was measured in this batch.

## Remaining work

Lead server pagination with matching aggregates/export, complete request-state migration to other screens, durable drafts, URL/saved views, true two-account review, role-based dashboard, consolidated action inbox and full finance/workflow acceptance remain in the [active plan](../../../docs/ERP-CRM-WORK-EXPERIENCE-PLAN.md). Generic FormModal callers outside the repaired pages still need result-contract review. Client data is filtered but not lazy-loaded by tab. No pricing/sales work or AAA pass is part of this batch.

Database-backed domain tests use the isolated loopback `codex_payment_test` database with generated test records and cleanup, not production data. Authenticated full-page E2E and staging/pilot remain separate outstanding gates. Existing historical approval restrictions are not bypassed by the component harness.
