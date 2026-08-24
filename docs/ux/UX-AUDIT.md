# RepositoryRealms UX audit

Status: architecture proposal only  
Audit date: 2026-08-09  
Source revision: `6c7a71e` on `codex/realm-design-system-v2-implementation`  
Approval gate: no production UI code may be changed until the founder approves this architecture

## Design read

Reading this as a full redesign of a multi-company business operating system for employees, managers, specialists and executives. The target language is a believable digital workplace: calm, precise, action-led and visibly trustworthy. It is not a preservation redesign.

The tasteskill redesign protocol was used for audit discipline and anti-slop review. Its own scope excludes dense dashboards, data tables and realtime collaboration, so its landing-page patterns are not being applied to the ERP. The product system needs enterprise interaction patterns instead.

### Dial reading

| Surface | Current variance | Current motion | Current density | Proposed variance | Proposed motion | Proposed density |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ERP | 3 | 2 | 8 | 4 | 2 | 8 |
| Realm legacy | 7 | 5 | 8 | retire | retire | retire |
| Realm v2 | 3 | 2 | 7 | 6 | 4 | 5 |
| CEO Terminal | 3 | 2 | 8 | 4 | 2 | 7 |
| Mobile | 2 | 2 | 9 | 3 | 2 | 6 |

The proposed dials keep ERP dense and predictable, let Realm carry more atmosphere without becoming a game, and reduce mobile from a long card conveyor into a priority-first action surface.

## Executive conclusion

RepositoryRealms has strong business coverage and unusually careful canonical boundaries. Its main UX problem is not missing features. It is that the product exposes implementation modules, parallel surface concepts and design experiments more strongly than it exposes the user's next decision.

The redesign should not begin by restyling the current pages. It should begin by replacing the shell, page templates, status language, table system and overlay policy. Home, My Work, Work Management, Projects, CRM, Finance and Approvals should then migrate onto those foundations. Realm should be rebuilt as an optional contextual layer over the same records, not as a second set of dark dashboards and not as a medieval world.

The business model, APIs, RBAC, receipts and routes are valuable and should remain authoritative. The current component structure and information hierarchy should not.

## Audit evidence

The audit inspected every current frontend route and shared component, plus the existing Realm v2 visual QA captures at 1440, 1024, 768, 390 and 375 pixels.

| Evidence | Current result |
| --- | ---: |
| Page route files | 79 |
| Authenticated ERP page files | 66 |
| API route files | 134 |
| Primary navigation definitions | 62 |
| Interactive element definitions | 1,237 |
| UI files with interactions | 114 |
| Action definitions | 670 |
| Form control definitions | 381 |
| Navigation definitions | 166 |
| Hand-authored ERP table instances | 56 |
| Modal, form-modal and confirmation usages in ERP pages | 118 |
| Inline style blocks in ERP pages | 921 |
| CSS files under `app` and `components` | 45 |
| CSS lines | 10,440 |
| Literal hex color occurrences in CSS | 1,851 |
| Accessibility candidates: unlabeled buttons | 65 |
| Accessibility candidates: clickable non-semantic controls | 86 |
| Accessibility candidates: keyboard path unverified | 86 |
| Form bindings requiring manual verification | 326 |

The generated inventory under `qa/ui-inventory` is stale against the current tree. A fresh in-memory run of `scripts/lib/ui-inventory.mjs` produced the counts above with zero parse errors. Existing phase completion reports remain useful historical evidence, but they are not a current UX acceptance result.

## A. Current UX architecture map

```text
Public
├─ /login
├─ /realm-demo
└─ / -> authenticated redirect

Authenticated product shell
├─ ERP shell: components/Shell.jsx
│  ├─ fixed sidebar driven by lib/erp-navigation.js
│  ├─ compact top bar
│  ├─ global search modal
│  ├─ notification modal
│  └─ page workspace
├─ ERP product routes: app/(app)/*
│  ├─ overview and personal tools
│  ├─ CRM and sales
│  ├─ project and execution
│  ├─ finance
│  ├─ people
│  ├─ export and livestream modules
│  ├─ company administration
│  └─ eleven CEO routes
├─ Realm legacy: /realm
│  └─ components/realm/RealmOffice.jsx plus fantasy sub-products
└─ Realm v2 preview: /realm-v2/<area>
   ├─ separate product shell
   ├─ eighteen virtual screen areas
   └─ canonical links back to ERP routes
```

### Current data and action flow

```text
Page component
  -> useResource or direct fetch
  -> canonical RepositoryRealms API
  -> RBAC and module guard
  -> business mutation
  -> toast or page refresh

Realm screen
  -> Realm presentation or bridge
  -> canonical ERP route/API
  -> same business mutation
  -> receipt where the contract exposes one
```

This boundary is correct and must be preserved. The redesign is a presentation and interaction migration, not a backend rewrite.

### Current shell and navigation load

The sidebar can expose 51 items to a Director, 41 to a PM, 42 to an Accountant, 35 to an AM, 31 to a Lead, 27 to HR and 23 to Staff before module-specific reduction. CEO Portal has another 11 destinations. This forces users to understand product modules before they can express an intent.

The current top bar exposes search, creation, company identity, language, notification and profile controls, but breadcrumbs and a consistent context panel are absent. The search implementation is a modal that fetches every configured resource when opened, requires a two-character query and only returns records. It is not yet the first-class search and command system in the brief.

### Current component architecture

`components/ui.jsx` centralizes useful behavior such as data fetching, async submit locking, toast, modal, dynamic form, CSV export, empty state and permission state. It is also a single monolithic file with hand-authored SVG paths, one generic modal, one generic form renderer and one global empty-state policy.

`app/globals.css` contains the ERP foundation, medieval presentation layer, responsive table transformation, modal behavior, print rules, dark theme and multiple historical overrides. Realm v2 adds a second token and component system in `components/realm-v2`, while legacy Realm carries a third large styling system. The product therefore has shared data but not one shared interaction language.

## Current strengths to preserve

- Routes, APIs and canonical domain objects are already broad and operational.
- RBAC and per-company module configuration are present in both navigation and API guards.
- Realm v2 explicitly links back to canonical ERP records instead of copying them.
- Async submit locks prevent common double mutations.
- Reduced motion, visible focus and touch target work have been considered.
- Financial data distinguishes several concepts and CEO aggregation documents source freshness.
- My Work and Work Management already use execution endpoints rather than duplicating Task storage.
- Project execution health, CRM workload, finance intelligence and HR evidence components contain valuable domain logic.

These are business and behavioral assets. They are not a reason to preserve the current visual composition.

## G. 10 worst current UX problems

### 1. Navigation is a module inventory, not an intent model

The product presents up to 51 primary links in nine sections for a Director. Help, install, calendar, docs, messages, approvals, AI, operational records and specialist configuration compete at the same level. CEO functionality is split across eleven separate top-level destinations.

Impact: high discovery cost, weak muscle memory and no clear answer to "where do I go next?"

Decision: replace the sidebar with seven intent groups and section hubs. Keep old routes and permissions, but stop exposing every route as primary navigation.

### 2. Home is still a generic dashboard composition

`/dashboard` loads up to fourteen resources and composes KPI cards, several tables and module-specific blocks. It changes content by availability but does not provide truly different Employee, Manager, Sales, Finance and Director decision models.

Impact: the page answers "what data exists?" better than "what should this person do?"

Decision: make role-aware attention queues and one primary next action the core of Home. Analytics becomes supporting evidence.

### 3. The frontend has three competing design systems

Legacy ERP uses warm paper, green, gold, Noto Serif and medieval art. Realm legacy uses medieval concepts and a 3,288-line stylesheet. Realm v2 uses a graphite dark system with its own primitives and a second shell. The root metadata still says `Medieval Realms`.

Impact: the same record feels like it belongs to different products depending on the route.

Decision: one semantic token system, one icon family, one overlay stack and one set of work objects. ERP and Realm may differ in density and material, not vocabulary or behavior.

### 4. Shared components do not cover the product's real complexity

There are 56 hand-written ERP tables, 118 overlay usages and 921 inline style blocks. No table behavior library or accessible overlay primitive exists in current dependencies. Saved views, column sizing, sticky columns, keyboard row navigation and consistent bulk actions therefore cannot be guaranteed across pages.

Impact: every screen can solve the same problem differently, and improvements require broad manual edits.

Decision: build system-level DataTable, RecordHeader, PageHeader, FilterBar, Drawer, Dialog, FormSection, Status and Receipt components before page migration.

### 5. Complex work is trapped in modal flows

Quotes and invoices use `DocEditor` inside a large modal. Tasks, vendors, attendance, inventory and other modules rely on long modal forms. The global Modal handles Escape and backdrop click but does not implement a complete focus trap, focus return, dirty-state protection or nested context strategy.

Impact: long forms lose orientation, small screens become bottom sheets with deeply scrolling content, and users cannot safely compare the source record while editing.

Decision: full pages for quote, invoice, project, client, employee and settings; drawers for record preview and quick edit; dialogs only for focused decisions and confirmation.

### 6. Card quantity substitutes for hierarchy

Realm v2 Home and My Work begin with four equally weighted metric cards. Work Management puts metrics, tabs, a four-lane board and provenance furniture into another large panel. CEO Terminal becomes a long sequence of cards, metrics, comparison cards and system disclaimers.

Impact: users must scan containers instead of following a clear priority order. Important work and explanatory provenance often have similar weight.

Decision: lead with an attention queue or next action, use sections and dividers for grouping, and reserve cards for true containment or elevation.

### 7. Realm v2 is a dark dashboard, while legacy Realm is still a game

The current v2 screenshots show a conventional sidebar, KPI cards, panels and tables. They do not provide meaningful spatial context, rooms or presence-led collaboration. Legacy files still contain Guild, Quest, Royal, Raven, Gold, Adventurer and kingdom terminology in operational surfaces.

Impact: the product oscillates between "generic dark admin" and "game-like workplace" without landing on a believable digital workplace.

Decision: retire the medieval identity. Realm becomes a lightweight spatial scene with a persistent 2D action layer. Users never walk to a feature, and operational terms remain Task, Project, Invoice, Lead and Approval.

### 8. State handling is uneven and overly global

The shared ERP layer offers a generic EmptyState, Forbidden and a global loading counter. It does not distinguish first use, no result, filtered empty, permission empty, offline and recoverable error at screen level. Only three frontend files currently contain explicit skeleton references, while Realm v2 has a richer StateView that ERP does not use.

Impact: users can be told there is no data when the real condition is filtering, connectivity, permission or partial failure.

Decision: require a six-state contract per major screen and per critical region. Financial and approval mutations wait for canonical confirmation.

### 9. Accessibility and mobile behavior are patched globally instead of designed per workflow

The current static inventory identifies 65 unlabeled button candidates, 86 clickable non-semantic controls and 86 keyboard paths that need verification. Mobile tables are transformed into stacked cards by a global MutationObserver that copies column headings into cells. This avoids horizontal scroll but turns finance and CEO comparisons into very long documents.

Impact: accessibility risk remains page-specific, and mobile priority is determined by DOM order rather than task importance.

Decision: use accessible primitives for dialogs, menus, tabs and comboboxes; create explicit mobile list variants for each data family; keep table semantics where comparison matters.

### 10. Terminology and status language are inconsistent

The product mixes Vietnamese, English and fantasy labels: `Declared estimate`, `CRM Workload Intelligence`, `Guild flow`, `Executive brief`, `Raven Inbox`, `Sở chỉ huy DA`, `Gold Ledger` and `Bản đồ 4 vương quốc`. Status definitions are duplicated across `lib/format.js`, page constants and Realm components. Current Badge always adds a colored dot but does not add a semantic icon.

Impact: users learn multiple names for the same concept and cannot rely on consistent state meaning.

Decision: create a product glossary and shared status registry. Use icon, text and color together. Preserve established business nouns and remove fantasy translation from operations.

## Additional findings

### Information density

- ERP density is appropriate in principle but is poorly tiered. Tables, KPI cards and explanatory content frequently compete on the same screen.
- Realm v2 density is too high for a contextual surface. It repeats full dashboards instead of showing the current objective, people and next decision.
- Mobile screenshots show substantial vertical travel before users reach the primary action, especially on CEO Terminal and My Work.

### Missing or weak interactions

- Global search does not expose create commands, recent items or keyboard traversal between grouped results.
- Notifications are shown in a modal rather than a resolvable unified inbox with Action required, Mentions, Updates and System.
- Tables lack one consistent contract for visibility, sizing, saved views, sticky columns, pagination, export and keyboard navigation.
- Forms lack one consistent dirty-state and unsaved-change contract.
- Routine mutations usually end in a toast, not a reusable receipt surface with actor, record, timestamp and activity link.

### Realm and ERP inconsistencies

- Realm v2 has its own navigation taxonomy and page introductions, while ERP exposes module groups.
- `/realm`, `/realm-demo` and `/realm-v2` represent three different concept generations.
- Realm v2 often provides an "Open ERP" escape action, which reinforces the impression that Realm is a wrapper rather than an integrated surface.
- Legacy Realm uses fantasy nouns while v2 uses a mix of English product terminology and Vietnamese business terms.
- Realm v2 has richer resilience primitives than ERP, but ERP remains the canonical place for actual manipulation.

## H. Screens that should be redesigned first

| Priority | Screen | Why first | Target outcome |
| ---: | --- | --- | --- |
| 1 | Application shell and global search | Every route inherits its hierarchy and navigation debt | Intent navigation, command bar, context panel and five-item mobile nav |
| 2 | Home | Current dashboard sets the wrong product thesis | Role-aware attention and a clear next action |
| 3 | My Work | Highest-frequency individual workflow | Now, Next, Blocked/Waiting, Later with keyboard actions |
| 4 | Work Management | Highest-frequency manager intervention workflow | People view and Load view without employee ranking |
| 5 | Projects list and detail | Connects delivery, people, finance and decisions | Execution-health list and one structured project workspace |
| 6 | Leads and lead detail | Revenue workflow currently splits intelligence and Kanban | Table, Pipeline, Forecast and next-action-led detail |
| 7 | Finance Home, invoices and payables | Highest trust and state-risk surface | Explicit money states, timelines and reconciliation clarity |
| 8 | Approval Center | Cross-cutting control point for money and policy | Unified evidence review with maker/checker chain |
| 9 | Quote builder | Current long modal is structurally wrong | Full-page document builder with commercial summary and preview |
| 10 | Realm Home and Project Room | Establishes the new non-game spatial model | Context in 3D, precise actions in 2D, direct navigation always available |

## I. Screens that can remain mostly intact

"Mostly intact" means preserve workflows and domain behavior while migrating shell, tokens and shared components. It does not mean freeze the current CSS.

| Screen group | Preserve now | Required migration |
| --- | --- | --- |
| Login and 2FA | Authentication, recovery and deployment scoping | Remove medieval art and rename product metadata |
| Calendar | Event aggregation, week/month behavior, ICS export | New shell, consistent filters and mobile agenda fallback |
| Messages | Conversation, polling, sending and privacy controls | Move into Unified Inbox composition |
| Audit | Query and evidence semantics | New table and human-readable Chronicle link |
| Install and guide | PWA and help content | Move under Help/More instead of primary navigation |
| Import/export | Data behavior and warnings | Move to System/Data tools with a full-page wizard if needed |
| Export, inventory and livestream specialist modules | Domain fields and mutations | Adopt common table, status, form and route templates |
| CEO security, registry and rollout | Safety contracts and evidence flows | Consolidate under CEO Terminal/System sub-navigation |
| Automation | Rule semantics and safe execution | Migrate to a guided full-page builder later |

## J. Implementation roadmap

No phase should replace a page without updating the functionality matrix in `SCREEN-MATRIX.md`.

### UX-0: foundations

- Freeze the product glossary and status registry.
- Introduce semantic tokens, icon system, type scale, spacing, radius, motion and layer tokens.
- Build accessible primitives, receipt, resilience states, DataTable and form foundations.
- Add contract tests for RBAC, routes, analytics hooks and canonical mutations.

### UX-1: application shell

- Replace primary navigation with the proposed intent model.
- Add breadcrumbs, company and surface switch, command palette, global create, notifications and context panel.
- Preserve all old route paths.
- Add mobile bottom navigation and safe-area behavior.

### UX-2: Home and My Work

- Ship role-aware Home variants.
- Recompose My Work into Now, Next, Blocked/Waiting and Later.
- Preserve execution endpoints and receipts.

### UX-3: Work Management and Projects

- Ship People and Load views.
- Migrate project list and project detail to health-led structures.
- Retire duplicate project dashboards after parity tests.

### UX-4: CRM

- Build Lead Table, Pipeline and Forecast on one record model.
- Add lead detail and Client 360 full pages.
- Preserve conversion, quote and activity behavior.

### UX-5: Finance

- Create Finance Home and shared financial timeline.
- Migrate invoices, transactions, expenses, AR, AP, cash forecast, budgets and reports.
- Add explicit confirmation and reconciliation states.

### UX-6: People and approvals

- Create People directory and employee profile.
- Separate attendance declared, recorded and validated states.
- Consolidate all approvals into one evidence-led center.

### UX-7: Realm shell and rooms

- Retire fantasy navigation and medieval art.
- Build the subtle spatial shell, project room and direct 2D overlays.
- Lazy load all spatial assets only after Realm entry.

### UX-8: communication and collaboration

- Unify inbox, notifications, approvals discussion and business context.
- Add voice, screen share, whiteboard and shared table only where contracts exist.
- Make consent and privacy visible at every capture or transcription boundary.

### UX-9: CEO Terminal

- Consolidate the eleven current CEO routes into one command environment with sub-navigation.
- Prioritize decisions, exposure and incidents over aggregate cards.
- Keep cash, revenue, AR, AP, forecast, pipeline and GMV visibly distinct.

### UX-10: mobile, accessibility and performance

- Replace global table-to-card fallback with domain-specific mobile views.
- Complete keyboard, screen-reader, zoom and text-scaling verification.
- Virtualize large tables and lazy load charts and Realm assets.
- Re-run route, action, interaction, visual and performance gates.

## K. Risk of breaking existing functionality

| Risk | Severity | Why it can break | Control |
| --- | --- | --- | --- |
| Route and bookmark drift | Critical | 62 primary routes and many deep links already exist | Keep route paths, add adapters and aliases, test every entry path |
| RBAC regression | Critical | Navigation, page and API checks differ by role/module | Generate role x route x action tests from current contracts |
| Financial mutation ambiguity | Critical | Invoice, payment, vendor and forecast flows have different confirmation needs | Preserve endpoints, add explicit pending/confirmed/failed states, require receipt |
| Approval chain regression | Critical | Quote, expense, leave and command approvals carry maker/checker rules | Golden-flow tests per approval type and sensitive confirmation |
| Realm duplicate truth | Critical | New contextual UI could accidentally add parallel state | UI adapters only, canonical IDs everywhere, no Realm record schema |
| Analytics and automation breakage | High | Labels and controls may be tracked downstream | Inventory event contracts before renaming or moving actions |
| Bulk table behavior loss | High | Hand-built pages have one-off exports and row actions | Per-route capability matrix before DataTable migration |
| Form field loss or reorder | High | Generic FormModal hides page-specific fields and defaults | Snapshot field schema, defaults, permission and validation before replacement |
| Mobile task regression | High | Existing global fallback at least exposes all fields | Mobile priority tests plus an explicit "view all fields" path |
| Print and PDF regression | High | Quote and invoice printing use current DOM/CSS contracts | Golden visual print fixtures and locale/currency checks |
| Cross-company metric mixing | High | CEO surfaces aggregate different business models | Metric dictionary, unit/source/as-of metadata and no implicit conversion |
| Performance regression | Medium | New primitives, tables and 3D can increase client bundle size | Route-level budgets, lazy imports, virtualization and ERP session without Realm engine |

### Migration stop conditions

Stop a screen replacement if any of these are unknown:

- the current route and all deep-link variants;
- the role and module access matrix;
- the complete field and action inventory;
- the canonical API and receipt behavior;
- the loading, failure and conflict behavior;
- the mobile fallback;
- the print/export requirement;
- the analytics or automation dependency.

## L. Proposed before/after UX flows

### My Work

Current:

`Dashboard or My Work -> scan metrics -> filter queue -> open ERP Task -> act in another context`

Proposed:

`Home attention -> My Work opens with Now selected -> Start work / Complete / Block inline -> receipt appears -> Next item advances`

The full task remains one click away in a context drawer or full page. Reordering has a keyboard path.

### Lead progression

Current:

`Leads -> campaign metrics -> workload intelligence -> forecast card -> Kanban -> modal detail`

Proposed:

`Leads -> saved Table/Pipeline/Forecast view -> open lead full page -> see next action and inactivity -> log contact or create quote -> activity and receipt update`

AI lead score stays supporting evidence.

### Quote creation

Current:

`Quotes table -> large modal -> line-item spreadsheet -> save -> return to table -> separate print/email actions`

Proposed:

`Quotes -> New quote full page -> structure left, editable lines center, commercial summary right -> validate margin/approval -> preview -> Send quote -> confirmation receipt`

Mobile uses a stepwise full page, not a compressed three-column editor.

### Approval

Current:

`Approval list -> read compact card -> Approve or Reject -> toast`

Proposed:

`Action Center or notification -> Approval review -> What/Who/Why/Impact/Policy/Evidence -> maker/checker chain -> Approve, Reject or Request changes -> sensitive confirmation -> canonical receipt`

### CEO decision

Current:

`CEO overview -> scan many metrics/cards -> open one of ten sibling CEO pages -> inspect source -> decide elsewhere`

Proposed:

`CEO Terminal -> executive brief -> What needs attention -> decision item -> evidence and exposure context -> open canonical action or approval -> receipt and Chronicle entry`

### Realm project collaboration

Current:

`Realm v2 project dashboard -> cards/table -> Open ERP -> operate`

Proposed:

`Enter Project Room -> spatial context shows phase, people and active conversation -> select task wall/table -> precise 2D panel opens -> canonical action -> receipt remains visible in room and ERP activity`

No walking, avatar movement or game inventory is required to reach any function.

## Founder decisions required before implementation

1. Approve the proposed intent-based navigation and consolidation of CEO routes in primary navigation.
2. Approve retirement of the medieval visual identity and fantasy operational terminology.
3. Approve the rule that quote, invoice, project, client, employee and settings are full-page workflows.
4. Approve one custom visual system built on accessible behavior primitives and a dedicated headless table engine.
5. Approve Phase UX-0 and UX-1 before any page-specific redesign begins.
