# Phase 8 — final experience completion

Phase 8 closes the last four partial entries in the Realm Design System v2 matrix. All 18 registered product areas now have authenticated `/realm-v2/<area>` compositions. This is a presentation milestone, not a claim that the historical Phase 0 visual score has been recalculated or has crossed the 95% release gate.

## Product outcomes

- **Notifications** groups canonical self-scoped notifications into action, message, update and system views. The only mutation is the existing read-state contract (`PUT /api/notifications` with one ID or `all: true`). Mute, snooze and channel preferences remain unavailable until RepositoryRealms exposes those contracts.
- **Search & Commands** shares the same resource registry as ERP Ctrl+K, reads authorized `/api/data/<resource>` endpoints and opens canonical record routes. Keyboard navigation is complete. “Propose an action” opens Command Center and never executes a command.
- **Settings** distinguishes browser-only appearance choices from the audited Realm workspace preference. Governance and security remain in canonical ERP Settings; Realm does not duplicate policy forms or secrets.
- **Mobile Realm** is a priority-first composition over the same self-scoped profile, Task and Notification data. It preserves the five-destination mobile navigation and links every deeper action to a canonical Realm or ERP workflow.

## Canonical boundary

The data sources are Notification, authorized ERP data APIs, Realm pilot preference, User, Task and Collaboration Presence. Authorization remains server-side. Business rules, approval, execution, receipts and audit remain RepositoryRealms responsibilities. Local storage contains presentation choices and recent query strings only; no business record is copied into a Realm store.

## Responsive and accessibility boundary

- Visual verification is defined for 1440, 1024, 768, 390 and 375 pixel widths.
- Touch actions retain at least 44px targets and the mobile shell retains exactly five labeled destinations.
- Search supports Arrow Up, Arrow Down, Enter and Escape.
- Focus styles, semantic headings, persistent field labels, safe-area padding and reduced motion are preserved.
- Desktop composition is reorganized rather than horizontally compressed on tablet and phone widths.

## Evidence

- Product route: `app/realm-v2/[[...area]]/page.jsx`
- Product composition: `components/realm-v2/CanonicalRealmExperienceScreens.jsx`
- Shared search contract: `lib/global-search-contract.js`
- Responsive styles: `components/realm-v2/realm-v2.module.css`
- Deterministic QA route: `app/realm-v2/phase-8-qa/page.jsx`
- Capture harness and results: `scripts/capture-realm-v2-phase-8.mjs`, `qa/realm-v2-phase-8/`
- Contract tests: `tests/realm-v2-phase-8.test.mjs`

The matrix percentages remain the historical Phase 0 baseline. They are intentionally not inflated by implementation completion; a new scored visual audit is a separate acceptance activity.

## Final verification

- Repository tests: **825/825 passed**.
- Playwright desktop/mobile suite: **38 passed, 10 conditionally skipped, 0 failed**.
- Phase 8 visual matrix: **20/20 passed** across four screens and five breakpoints; zero horizontal overflow, console errors, failed responses or passive-view Notification/Profile mutations.
- UI inventory/action/interaction gates: **1,218 elements**, **178 data actions**, **0 unresolved actions**, **0 UX candidates**, and **6/6 destructive flows confirmed**.
- Realm ↔ ERP bridge: **59/59 routes**, **10/10 record flows**, and **0 unresolved mappings**.
- Production build: completed successfully with all 88 static pages generated.

No database mutation, commit, push, merge, or deployment was performed as part of Phase 8 implementation and verification.
