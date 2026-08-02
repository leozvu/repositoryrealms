# Realm Design System v2

Status: active decomposition  
Product boundary: Realm is an optional operating interface over canonical ERP/CRM data.  
Visual balance: enterprise clarity first, medieval-civic atmosphere second.

## Non-negotiable rules

1. Business state, authorization, focus, validation, loading and receipts are rendered by semantic HTML/CSS/SVG, never by raster decoration.
2. Decorative layers are optional, non-interactive, `pointer-events: none`, and safe to disable.
3. A command is never shown as successful until a canonical receipt exists.
4. Color is never the only status signal.
5. Medieval character comes from material, proportion, civic architecture and illuminated-cartography rhythm; never RPG objects or fantasy mechanics.

## System layers

### DS-01 — Foundations and primitives

Status: visual sheet v1 complete.

- Color roles: canvas, surfaces, text, border, emerald operation, gold recognition, blue information, amber warning, red critical.
- Typography: operational humanist sans; optional serif only for the Realm brand display.
- Geometry: 8-point grid, 8–16 px radii, 1 px borders, 2 px focus ring.
- Elevation: canvas, inset, card, elevated, drawer and modal.
- Density: compact and comfortable.
- Controls: buttons, inputs, search, select, checkbox, radio, toggle, segmented control, tabs and dividers.
- Indicators: presence, unread, warning, stale data and receipt.
- Iconography: 18, 20 and 24 px monoline functional icons.

### DS-02 — Application shell and navigation

Status: visual sheet v1 and behavioral contract complete.

- Realm mark and company identity.
- Desktop navigation rail and collapsed rail.
- Top command bar.
- Workspace/company switcher.
- Breadcrumb and page header.
- Global search trigger and command-palette trigger.
- Notification, collaborator and profile controls.
- Context drawer shell.
- Mobile top bar and bottom navigation.
- Responsive breakpoints and shell behavior.

Specification: `DS-02-APPLICATION-SHELL-NAVIGATION.md`.

### DS-03 — Data display and work objects

Status: visual sheet v1 and component contract complete.

- Metric, KPI and pulse cards.
- Task, project, employee, approval, message and notification cards.
- Tables, lists, queues, lanes and timeline rows.
- Avatar, presence and collaborator cluster.
- Status, priority, receipt, permission and source-provenance badges.
- Progress, budget, capacity and risk indicators.
- Empty, skeleton, stale, offline, permission-denied and error variants.

Specification: `DS-03-DATA-DISPLAY-WORK-OBJECTS.md`.

### DS-04 — Overlays, feedback and command safety

Status: visual sheet v1 and command-safety contract complete.

- Modal, drawer, popover, tooltip and dropdown.
- Toast and inline feedback.
- Command palette.
- Structured command preview.
- Permission and business-rule validation panel.
- Maker-checker approval panel.
- Pending-confirmation state.
- Execution state and failure recovery.
- Canonical receipt and audit deep link.

Specification: `DS-04-OVERLAYS-FEEDBACK-COMMAND-SAFETY.md`.

### DS-05 — Operational patterns and templates

Status: visual sheet v1 and template contract complete.

- Page templates: focus workspace, registry/list, board/queue, command cockpit, timeline/Chronicle, map/spatial, executive brief, settings/form and mobile priority.
- Task lifecycle: Now → Next → In Progress → Blocked/Waiting → Completed.
- Command lifecycle: Draft → Proposed → Pending Approval → Approved → Executing → Confirmed/Failed.
- Approval lifecycle: Maker → Checker → Approver → System → Receipt.
- Incident and collaboration lifecycles.
- Responsive desktop/tablet/mobile composition.
- Loading, empty, stale, offline, error, denied and redacted behavior.
- Accessibility, touch, keyboard and reduced-motion behavior.

Specification: `DS-05-OPERATIONAL-PATTERNS-TEMPLATES.md`.

## Application screen boards

Status: product design v1 complete for all 18 defined areas.

- Board 06: Realm Home and My Work.
- Board 07: Work Management and Action Center.
- Board 08: Command Center and Approvals.
- Board 09: Unified Inbox and Collaboration/Presence.
- Board 10: Project Realm and Chronicle.
- Board 11: World Map and CEO Terminal.
- Board 12: Employee Profile and Recognition/Gold Ledger.
- Board 13: Settings, Search/Command Palette and Notifications.
- Board 14: Mobile Realm.

Screen contracts: `REALM-SCREEN-TEMPLATE-CONTRACTS.md`.  
Coverage audit: `REALM-DESIGN-COVERAGE-MATRIX.md`.

## Core token contract

| Role | Value |
| --- | --- |
| Canvas | `#0B1015` |
| Surface 1 | `#111923` |
| Surface 2 | `#17212B` |
| Surface 3 | `#1D2934` |
| Emerald | `#4FA47A` |
| Emerald dark | `#2F7255` |
| Recognition gold | `#C8A96B` |
| Information blue | `#6398C8` |
| Warning amber | `#D69A4C` |
| Critical red | `#CF5A5A` |
| Text primary | `#F3F5F7` |
| Text secondary | `#AAB4BE` |
| Text muted | `#73808B` |
| Border | `rgba(255,255,255,0.08)` |

## Component completion contract

Each component is complete only when it has:

- anatomy and slot names;
- size and density variants;
- default, hover, focus, selected, disabled and loading states where applicable;
- success, warning, error, stale, offline and permission states where applicable;
- keyboard and touch interaction;
- accessible name, role and focus order;
- responsive behavior;
- data provenance and receipt behavior when the component performs an action;
- no dependency on decorative raster layers.

## Delivery order for a solo builder

1. Lock foundations and primitives.
2. Implement the shell and navigation.
3. Implement work objects used by Realm Home and My Work.
4. Implement command safety, approvals and receipts.
5. Compose operational templates.
6. Add medieval-civic decoration only after functional and accessibility checks pass.
