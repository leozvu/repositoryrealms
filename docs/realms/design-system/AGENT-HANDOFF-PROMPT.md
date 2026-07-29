# Copyable agent handoff prompt — Realm design-system implementation

```text
You are the implementation owner for Realm Design System v2 in the CRMegoric-Realms-Demo repository. Work autonomously until the entire design system and all defined application surfaces are implemented, verified and ready for review.

GIT AND SAFETY BOUNDARY — NON-NEGOTIABLE

1. Do not make commits on main. Do not merge, rebase, reset, push or deploy main.
2. The design source is available on branch `codex/realm-design-system-v2-spec`. Fetch it, inspect it, then create and stay on your own implementation branch, preferably `feat/realm-design-system-v2-implementation`, based on `codex/realm-design-system-v2-spec`.
3. Before editing, print `git branch --show-current`, `git status --short`, the base commit and merge-base. Abort if the current branch is main.
4. Preserve pre-existing or unrelated user changes. Never use `git reset --hard`, destructive checkout or broad recursive deletion.
5. Commit cohesive milestones only on the implementation branch. You may push that branch and open a draft PR if authorized, but never merge it. Main remains untouched until the full implementation is reviewed and explicitly accepted.
6. Do not deploy production or alter production secrets, databases or external integrations.

OBJECTIVE

Turn the complete Realm visual and behavioral specification into a production-quality, reusable implementation inside the existing Next.js 15 / React 18 application. Implement the full component system, responsive application shell, operational templates and every one of the 18 defined product areas. Do not stop after a gallery, static mockup or partial theme. The result must be usable application code with documented APIs, semantic states, tests and a visual QA route.

SOURCE OF TRUTH — READ ALL BEFORE EDITING

Written contracts:

- `docs/realms/design-system/REALM-DESIGN-SYSTEM-INVENTORY.md`
- `docs/realms/design-system/DS-02-APPLICATION-SHELL-NAVIGATION.md`
- `docs/realms/design-system/DS-03-DATA-DISPLAY-WORK-OBJECTS.md`
- `docs/realms/design-system/DS-04-OVERLAYS-FEEDBACK-COMMAND-SAFETY.md`
- `docs/realms/design-system/DS-05-OPERATIONAL-PATTERNS-TEMPLATES.md`
- `docs/realms/design-system/REALM-SCREEN-TEMPLATE-CONTRACTS.md`
- `docs/realms/design-system/REALM-DESIGN-COVERAGE-MATRIX.md`
- `public/realms/assets/generated/design-system-v2/ASSET-MANIFEST.md`

Visual specification boards:

- `public/realms/assets/generated/design-system-v2/01-foundations-primitives-v1.png`
- `02-application-shell-navigation-v1.png`
- `03-data-display-work-objects-v1.png`
- `04-overlays-feedback-command-safety-v1.png`
- `05-operational-patterns-templates-v1.png`
- `06-realm-home-my-work-v1.png`
- `07-work-management-action-center-v1.png`
- `08-command-center-approvals-v1.png`
- `09-unified-inbox-collaboration-v1.png`
- `10-project-realm-chronicle-v1.png`
- `11-world-map-ceo-terminal-v1.png`
- `12-employee-profile-recognition-v1.png`
- `13-settings-search-notifications-v1.png`
- `14-mobile-realm-v1.png`

The PNG boards are visual references, not runtime UI and not a source of business state. Implement UI with semantic React, CSS and SVG. Decorative raster layers are optional, non-interactive, `pointer-events: none`, and removable without losing meaning.

DESIGN DIRECTION

- Enterprise clarity first; medieval-civic atmosphere second.
- Deep graphite/midnight navy surfaces, emerald operational accents, restrained aged brass, semantic blue/amber/red and modern humanist sans typography.
- Medieval character comes from civic/guild-hall proportion, archive rhythm, illuminated cartography and restrained materials.
- No castles, crowns, shields, swords, armor, magic, quests, loot, tavern motifs, fantasy fonts, cartoons, cyberpunk neon, purple SaaS gradients, emoji icons, excessive glassmorphism or RPG mechanics.
- No employee scores, rankings, surveillance, inferred mood or hidden productivity tracking.
- Decoration never carries authorization, status, validation, focus, loading, risk or receipt meaning.

TECHNICAL APPROACH

1. Inspect the existing app, components, CSS modules, routes, APIs, test conventions and Realm implementations before choosing file placement.
2. Reuse existing dependencies and conventions. This repository does not currently depend on Tailwind or a component framework; do not introduce a large UI dependency unless it is strictly necessary and documented.
3. Prefer a coherent namespace such as `components/realm-v2/` plus shared CSS token files, but adapt to the repository after inspection. Avoid rewriting unrelated legacy Realm modules.
4. Expose a development-only or permissioned visual QA route where every primitive, state, component and template can be inspected. Do not make that gallery the product implementation.
5. Integrate screens behind an explicit safe route or feature flag until acceptance. Existing production paths and APIs must continue to work.
6. Reuse canonical repository services/adapters when real data exists. When a backend capability is missing, create typed/read-only view models or development fixtures clearly labeled as non-canonical; never fabricate successful commands, approvals or receipts.
7. Keep proposal, approval, execution and confirmation distinct. Show success only after a canonical receipt. Every consequential action must expose source, pending state, failure recovery, receipt ID and Chronicle/audit deep link.

IMPLEMENTATION SCOPE — COMPLETE ALL LAYERS

Layer A — foundations and primitives

- Semantic tokens for color, typography, spacing, radius, border, elevation, motion, z-index, density and breakpoints.
- Dark Realm theme matching the exact token contract; do not scatter raw hex values through components.
- Buttons, icon buttons, links, inputs, textarea, select, checkbox, radio, toggle, segmented control, tabs, dividers, badges, indicators, avatar/presence and skeletons.
- Default, hover, pressed, focus-visible, selected, disabled, read-only, loading, success, warning, error, stale, offline, permission-denied and redacted states where applicable.
- One consistent SVG/line-icon language. No emoji used as structural icons.

Layer B — shell and navigation

- Expanded/collapsed desktop rail, top command bar, company/workspace switcher, breadcrumbs, page header, global search/command trigger, notification/profile controls and 400px context drawer.
- Tablet collapsed navigation and mobile top bar/bottom navigation with at most five labeled destinations.
- Deep links, predictable back behavior, state/scroll restoration, route focus management, keyboard shortcuts and reduced-motion support.

Layer C — data and work objects

- Metric/pulse cards; task, project, employee, approval, action, message and notification objects.
- Tables, lists, queues, lanes, timelines, workload, progress, budget/capacity/risk, source/freshness and receipt displays.
- Loading, empty, stale, offline, error, permission-denied and redacted variants.
- Tables expose semantic headers, keyboard sorting and responsive record alternatives. Charts include a readable table/text alternative.

Layer D — overlays and command safety

- Tooltip, popover, dropdown, modal, drawer, mobile bottom sheet, banner, inline feedback, toast and persistent status.
- Accessible focus trap/return, Escape behavior, inert background, unsaved-change guard and destructive confirmation.
- Authorized command palette, natural-language composer, structured proposal, permission/business-rule/risk checks, maker-checker approval, step-up auth, execution progress, partial failure, retry/idempotency, canonical receipt and audit timeline.

Layer E — templates

- Focus Workspace, Registry/List, Board/Queue, Command Cockpit, Timeline/Chronicle, Map/Spatial, Executive Brief, Settings/Form and Mobile Priority.
- Task, command, approval, incident and collaboration lifecycles exactly as defined in DS-05.
- Desktop 1440, tablet 1024, mobile 390 and small-mobile 375 behavior.

Layer F — all 18 product areas

Implement every area in `REALM-SCREEN-TEMPLATE-CONTRACTS.md` and keep the coverage matrix current:

1. Realm Home
2. My Work
3. Work Management
4. Action Center
5. Command Center
6. Unified Inbox
7. Project Realm
8. Chronicle
9. Collaboration / Presence
10. World Map
11. CEO Terminal
12. Employee Profile
13. Recognition / Gold Ledger
14. Approvals
15. Notifications
16. Search / Command Palette
17. Settings
18. Mobile Realm

Do not implement map art, dashboard charts or recognition decoration at the expense of standard accessible lists, tables, provenance, policies and receipts. The CEO Terminal must distinguish cash, recognized revenue, GMV, settlement, pipeline, forecast and estimated value.

ACCESSIBILITY AND RESPONSIVE ACCEPTANCE

- WCAG 2.1 AA contrast; primary text at least 4.5:1.
- Visible 2–4px focus rings and logical tab/focus order.
- Semantic landmarks, headings, labels, error associations and accessible names.
- Minimum 44×44px interactive targets and at least 8px separation for adjacent touch targets.
- Never rely on color, hover, drag or swipe alone. Provide text/icon states and visible keyboard/button alternatives.
- No horizontal page scroll at 375, 390, 768, 1024 or 1440px.
- Support browser zoom, dynamic text, safe areas, software keyboard and `prefers-reduced-motion`.
- Animation is 150–300ms, transform/opacity based, interruptible and meaningful.
- Reserve async layout space; use skeletons for waits over roughly 300ms.

QUALITY AND TESTING

1. Add focused unit/component tests for token/state contracts, command lifecycle, permissions, receipt gating and responsive navigation behavior.
2. Add or extend Playwright coverage for keyboard navigation, modal focus, mobile navigation and representative journeys across Home → My Work → Action/Approval → receipt.
3. Capture/inspect screenshots at 375, 390, 768, 1024 and 1440px. Check for overflow, clipped text, hidden controls and visual regression.
4. Run the repository's relevant existing audits and tests continuously. Before handoff run at minimum the focused tests, UI audits, `npm test` and `npm run build`; run broader QA when feasible and report any pre-existing unrelated failures precisely.
5. Keep loading/error/permission fixtures deterministic. Do not call production systems from tests.
6. Update implementation documentation, coverage matrix and route/component inventory as work lands.

MILESTONE ORDER

1. Repository audit and implementation plan.
2. Tokens/primitives and visual QA route.
3. Shell/navigation and responsive skeleton.
4. Work objects, resilience and source/receipt components.
5. Overlays, command safety and approval flow.
6. Operational templates.
7. Product boards 06–10 as real routes/compositions.
8. Product boards 11–14 and full mobile suite.
9. Accessibility, responsive and interaction QA.
10. Full test/build pass, documentation and draft PR handoff.

Do not pause merely because one milestone is complete. Continue through all milestones. Ask for user input only if a choice would materially change business behavior, authorization or data ownership and cannot be inferred from the written contracts.

FINAL HANDOFF

Report the implementation branch, base commit, commits created, routes/components added, 18-area coverage, tests/audits/build results, screenshots or visual QA path, known limitations and exact files needing reviewer attention. Explicitly confirm that main was not modified or merged and that no production deployment occurred.
```
