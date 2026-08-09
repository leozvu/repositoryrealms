# Phase 5 — Project Realm and Chronicle

Date: 2026-07-30  
Branch: `codex/realm-design-system-v2-implementation`  
Reference: Board 10 — `10-project-realm-chronicle-v1.png`

## Delivered product surfaces

- `/realm-v2/projects` is an authenticated Project Realm cockpit over canonical `Project`, `Task`, `TimeLog`, `Phase`, `WorkQueueState`, `VendorBill`, and `Invoice` data.
- `/realm-v2/chronicle` is an authenticated organization Chronicle. The organization Chronicle is a Director-only read surface over canonical ERP `AuditLog` records.
- Both routes remain behind `REALM_V2_PREVIEW=true` in production and the existing Realm pilot decision.
- Vietnamese remains the default language. English is opt-in through the existing application language switch; business record names and user-entered details remain untranslated.

## Canonical boundaries

Project Realm reads:

- `GET /api/data/projects` for authorized Project records;
- `GET /api/projects/stats` for the Project list health summary;
- `GET /api/projects/:id/execution-health` for the selected Project cockpit.

Project Realm performs no Project mutation. Existing ERP routes remain the authority for CRUD and operational work:

- `/projects/:id` for full Project management;
- `/tasks` for Task workflow;
- `/realm-v2/chronicle?project=:id` for a user-verifiable audit search.

The Project list and execution-health snapshot use independent `Promise.allSettled` boundaries. One source may remain usable while the other fails; no product fixture replaces missing data.

## Project health policy

- Delivery health is advisory and uses `project-execution-health-v1`.
- TimeLog is declared time, not observed truth.
- Capacity and WIP support coordination only. Members are not ranked, scored, rewarded with Gold, or used for payroll decisions.
- Financial values are planning proxies and are visible only when the canonical API grants money access. They are not accounting profit.
- Missing Project owner, milestone details, decision links, conversation links, and structured Project audit relations are identified as unavailable rather than fabricated.

## Chronicle policy

- `GET /api/audit` is the only organization Chronicle source in this phase and keeps the existing Director authorization.
- Chronicle distinguishes human, system-like, and imported events when the existing action/actor text supports that classification.
- The screen is read-only and does not issue `POST`, `PUT`, `PATCH`, or `DELETE` requests.
- It does not invent before/after values, event sources, signed exports, correction links, or RepositoryRealms receipts.
- A future correction must create a linked new event through an approved backend contract; destructive editing of history is not offered.
- Users without Director access receive an explicit permission state and may open the separate personal Realm Ledger. The product does not silently relabel personal history as the organization Chronicle.

## Responsive and accessibility contract

- Five locked QA viewports: 1440×1000, 1024×900, 768×1024, 390×844, and 375×812.
- Product controls retain at least 44px touch targets.
- Project panels collapse from cockpit to a priority-first single column.
- Chronicle filters collapse without page overflow; event details remain readable as key/value rows on phones.
- The five-item mobile navigation remains stable.
- Focus-visible behavior and reduced-motion behavior are inherited from the Realm v2 shell.

## Verification

- Static contract: `tests/realm-v2-phase-5.test.mjs`
- Browser capture: `scripts/capture-realm-v2-phase-5.mjs`
- Visual evidence: `qa/realm-v2-phase-5/`
- Browser gate covers 10 screen/viewport combinations, zero horizontal overflow, five mobile destinations, no console errors, no failed responses, and zero canonical Project/Audit mutation requests.

## Change control

No database mutation, commit, push, merge, or deployment was performed for Phase 5. `origin/main`, `feat/leozops-s1a`, `lib/leozops`, `tests/leozops-*`, and the lead-snapshot v1 contract remain untouched.
