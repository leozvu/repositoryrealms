# RepositoryRealms information architecture

Status: proposal for founder approval  
Companion documents: `UX-AUDIT.md`, `DESIGN-SYSTEM.md`, `SCREEN-MATRIX.md`

## B. Proposed information architecture

### Architecture goal

RepositoryRealms should feel like one business operating system with multiple work contexts, not a collection of route links and not a fantasy game attached to an ERP.

The architecture preserves:

- company, user, role and permission boundaries;
- modules and plan entitlements;
- canonical records, identifiers and API behavior;
- approval, audit and receipt semantics;
- all operational capabilities listed in the screen matrix;
- old URLs during migration through direct routes or redirects.

The architecture replaces:

- the flat, role-filtered route dump in the sidebar;
- duplicate destinations that compete for the same user intent;
- dashboard-first page composition;
- fantasy terminology for ordinary business work;
- modal-first record editing;
- the separation between a medieval Realm and a generic ERP.

### Product model

The product has four layers. A route may belong to more than one layer, but each visible screen needs one clear owner.

| Layer | User question | Primary content | Examples |
| --- | --- | --- | --- |
| Personal | What needs my attention now? | queue, deadlines, drafts, mentions | Home, My Work, Inbox |
| Functional | How do I perform this business job? | records, workflows, tools | Sales, Finance, People, Operations |
| Management | Where is intervention needed? | exceptions, risk, capacity, decisions | Team Work, Analytics, CEO Terminal |
| Spatial | Where is the team working together? | rooms, presence, shared context | Realm Home, Rooms, Chronicle |

This distinction prevents every page from becoming another dashboard. Personal surfaces prioritize next actions. Functional surfaces prioritize records and workflows. Management surfaces prioritize exceptions and decisions. Spatial surfaces prioritize shared context.

### Proposed product tree

The sidebar exposes destinations by intent. It does not expose every leaf route. Section hubs and local navigation contain the long tail.

```text
RepositoryRealms
├─ Home
├─ Work
│  ├─ My Work
│  ├─ Team Work
│  ├─ Projects
│  ├─ Tasks
│  ├─ Calendar
│  └─ Time and planning
├─ Sales
│  ├─ Leads
│  ├─ Clients
│  ├─ Quotes and contracts
│  ├─ Services
│  └─ Support
├─ Finance
│  ├─ Finance Home
│  ├─ Invoices and receivables
│  ├─ Vendors and payables
│  ├─ Transactions and expenses
│  ├─ Planning and cash forecast
│  └─ Reports and controls
├─ People
│  ├─ Directory
│  ├─ Attendance and timesheets
│  ├─ Leave
│  ├─ Payroll and commissions
│  └─ Hiring and development
├─ Operations
│  ├─ Approvals
│  ├─ Assets and inventory
│  ├─ Automations and integrations
│  ├─ Templates and imports
│  └─ Enabled industry modules
├─ Realm
│  ├─ Realm Home
│  ├─ Inbox
│  ├─ Chronicle
│  └─ Rooms
├─ Management
│  ├─ Analytics
│  ├─ Objectives
│  ├─ Portfolio
│  └─ CEO Terminal
└─ System
   ├─ Audit and policy
   ├─ Company settings
   ├─ Access and modules
   └─ Help and installation
```

Only permitted and enabled groups appear. Empty groups do not appear. A user should normally see five to eight primary destinations, not dozens of equal links.

## C. New navigation model

### Global shell

### 4.1 Desktop

The global shell has three stable zones.

1. Sidebar: company switcher, seven or fewer primary destinations, collapsible group labels, pinned recent records, Help and Settings at the bottom.
2. Command bar: breadcrumb, page title, search or command trigger, Create, Inbox, notifications, presence and user menu.
3. Content frame: optional local tabs, primary work area, optional contextual inspector.

The sidebar communicates location. The command bar communicates action. The content frame communicates the current job. These responsibilities must not be mixed.

### 4.2 Mobile

The mobile shell uses five destinations:

- Home
- Work
- Actions
- Inbox
- More

`Actions` is a role-aware queue of approvals, blocked items and urgent work. `More` contains functional hubs and settings. Detail pages use a top back action and a compact overflow menu. Tables switch to prioritized rows or a list designed for that record type, not a generic stacked card conversion.

### 4.3 Global Create

Create is a command, not a permanent cluster of page-specific buttons. Its contents are permission and module aware. Common options are task, lead, client, quote, invoice, project, employee request and expense. The menu remembers recent choices and supports keyboard selection.

Quick create may open a small dialog only when the record can be validly created with a few fields. Complex records continue on a full page after the initial save.

### 4.4 Search and command palette

Search combines:

- recent records;
- record search grouped by type;
- destinations;
- commands the user may execute;
- saved views;
- people and Realm rooms.

The palette exposes loading, no-result, offline, permission and partial-result states. It supports keyboard navigation, returns to the previous focus target, and never fetches every data domain eagerly on open.

### Navigation behavior

### 5.1 Primary navigation rules

- One label maps to one user intent.
- A leaf route is not promoted just because it exists.
- Section hubs own overview, saved views and local navigation.
- Role changes ordering and defaults, not the meaning of a destination.
- Plan or module filters remove inaccessible destinations and explain direct-link restrictions.
- Breadcrumbs describe the canonical record hierarchy, not browser history.
- Recent records and favorites reduce repeat navigation without creating new permanent menu items.

### 5.2 Default group ordering by role

| Role family | Default order after Home | Default landing emphasis |
| --- | --- | --- |
| Employee | Work, Realm, People, Operations | due work, blocked work, mentions |
| Manager | Work, People, Realm, Operations, Management | team exceptions, approvals, capacity |
| Sales | Sales, Work, Realm, Finance | follow-ups, pipeline risk, quote status |
| Finance | Finance, Operations, Work, Management | collections, exceptions, approvals, cash |
| Director or CEO | Management, Work, Finance, Sales, People | decisions, risks, commitments |

The architecture does not create separate products for each role. It changes the opening emphasis while preserving stable names and locations.

### 5.3 Local navigation

Section hubs use a maximum of six first-level tabs. More specific views live in a view switcher or secondary menu.

Example, Finance:

```text
Finance Home | Receivables | Payables | Transactions | Planning | Reports
```

Example, People:

```text
Directory | Time | Leave | Pay | Hiring | Development
```

Example, a client record:

```text
Overview | Activity | Contacts | Work | Commercial | Files | More
```

The active tab and filter view must be linkable so a reload or shared URL preserves context.

## 6. Home architecture

Home answers three questions in this order:

1. What must I do now?
2. What is blocked or at risk?
3. What changed since I last looked?

Every role receives the same composition logic with different data.

| Role | Primary queue | Exception strip | Context |
| --- | --- | --- | --- |
| Employee | assigned and due work | blockers, overdue items | mentions, recent team changes |
| Manager | decisions and team interventions | overloaded people, stalled work | commitments, team activity |
| Sales | follow-ups and next customer actions | stale leads, expiring quotes | pipeline changes, client signals |
| Finance | collections and control tasks | overdue invoices, reconciliation issues | cash movement, approval receipts |
| Director | decisions and delegated follow-up | material risk and missed commitments | business trend deltas |

Metrics may support a decision but may not lead the page by default. The dominant object is the next-action queue.

## 7. Functional hubs

### 7.1 Work

Work owns execution across functions.

- My Work: Now, Next, Blocked, Later.
- Team Work: exceptions, allocation, dependencies and commitments.
- Projects: portfolio list, project workspaces and health.
- Tasks: all task records and saved views.
- Calendar: commitments and deadlines.
- Time and planning: timesheets, Gantt and resource planning.

The existing `myday`, `teamwork`, `projects`, `tasks`, `calendar`, `gantt`, `timesheet` and `resources` capabilities remain available.

### 7.2 Sales

Sales owns the customer lifecycle.

- Sales Home: follow-ups, pipeline exceptions and forecast changes.
- Leads: list, board and lead record.
- Clients: list and client record.
- Quotes and contracts: index plus full document workspace.
- Services: catalog and delivery context.
- Support: tickets connected to client and work records.

Lead and client details become full pages with persistent identity, activity, ownership and related records. A modal may preview a record, but it is not the canonical workspace.

### 7.3 Finance

Finance Home is an operating surface, not another KPI gallery. It prioritizes collections, approvals, reconciliation exceptions, cash commitments and close tasks.

Invoices, quotes, transactions and planning use dedicated full-page workspaces. Dense lists share one data-table behavior. A transaction or invoice has a stable record page with history, attachments, approvals and receipts.

### 7.4 People

Directory is the entry point. Employee records own profile, employment, time, leave, pay, development, documents and audit information, filtered by permission. Separate lists remain linkable but are not equal primary destinations.

### 7.5 Operations

Operations is the home for cross-functional control work. Approvals are a decision queue with evidence, consequences and a receipt after action. Assets, inventory, imports, templates, automations and enabled industry modules retain their own workspaces inside this hub.

Industry modules such as shipments and markets appear only when enabled. They must use the shared shell and record patterns.

## 8. Realm architecture

Realm is the spatial layer of the same operating system. It is not a second data model and not a reskinned dashboard.

### 8.1 Realm Home

Realm Home uses a subtle two-dimensional workplace scene with meaningful zones:

- My Desk: personal queue and drafts;
- Team Room: presence, commitments and current blockers;
- Project Rooms: shared project context;
- Inbox: messages, mentions and notifications;
- Chronicle: durable activity and decisions;
- Operations Desk: approvals and cross-functional exceptions.

Selecting a zone opens a standard panel or route. No walking mechanic is required. No business action depends on spatial navigation. Keyboard users can access the same zones as an ordered list.

### 8.2 Shared records

A task opened from Realm and a task opened from Work are the same canonical record. The same is true for project, client, quote, invoice, employee and approval records. Realm may add presence or shared-room context, but may not duplicate state.

### 8.3 Terminology

Use clear business language in all operational surfaces.

| Retire from core UI | Use instead |
| --- | --- |
| Guild | Team or workspace |
| Quest | Task or work item |
| Kingdom | Company or organization |
| Royal command | Executive decision or directive |
| Raven | Message or notification |
| Gold ledger | Finance or transactions |
| Adventurer | Employee or team member |
| War room | Incident room or project room |
| Chronicle | Keep only for Realm activity history |

Optional thematic labels may appear as subtle secondary flavor only when the business label remains visible and unambiguous.

## 9. CEO Terminal

The eleven current CEO destinations become one CEO Terminal with local navigation:

```text
Briefing | Decisions | Risks | Commitments | Business | Workforce | Security | Registry
```

The opening screen shows:

1. decisions awaiting the executive;
2. material exceptions with owner, age and impact;
3. delegated commitments that need intervention;
4. a compact business pulse with change and confidence;
5. recent receipts and audit events.

Existing routes remain valid during migration and redirect to the matching local view. The CEO Inbox becomes a filtered Inbox view. Navigator and World become navigation or spatial views, not independent top-level dashboards. Rollout becomes an operational program view.

## 10. Record architecture

Every major record page follows a stable grammar:

```text
Identity and status
Primary action and next step
Critical summary
Local tabs
Main work surface
Contextual inspector
Activity, evidence and audit
```

The grammar is adapted by domain. It does not mean every page has the same card layout.

### Full page by default

- client and lead records;
- project workspaces;
- quote and contract editors;
- invoice records;
- employee records;
- financial planning;
- settings and access management;
- complex approvals.

### Drawer by default

- quick record preview;
- comments and activity context;
- simple property editing;
- linked-record inspection;
- filters and column controls on smaller screens.

### Dialog by default

- confirmation and destructive decisions;
- small selections;
- quick create with a valid minimal payload;
- approval decision when all evidence is already visible;
- session or permission interruptions.

## 11. Route preservation and migration

The redesign changes navigation ownership before it changes route contracts.

| Existing route family | Proposed owner | Migration treatment |
| --- | --- | --- |
| `/dashboard`, `/myday` | Home and Work | `/dashboard` becomes role Home; `/myday` maps to My Work |
| `/teamwork`, `/tasks`, `/projects` | Work | preserve routes and add consistent local navigation |
| `/leads`, `/clients`, `/quotes`, `/contracts` | Sales | preserve routes; move editors and detail into full pages |
| `/finance`, `/financials`, `/invoices`, `/finplan`, `/fxreval` | Finance | preserve routes; Finance Home becomes section root |
| `/staff`, `/attendance`, `/payroll`, `/recruitment`, `/reviews` | People | preserve deep links; Directory becomes section root |
| `/approvals`, `/assets`, `/automation`, `/inventory`, `/import` | Operations | preserve routes; expose only enabled modules |
| `/analytics`, `/okr`, `/portfolio`, `/ceo-*` | Management | consolidate CEO navigation, retain redirects |
| `/realm`, `/realm-demo`, `/realm-v2/*` | Realm | retire legacy surfaces; promote one canonical Realm |
| `/audit`, `/violations`, `/settings` | System | preserve policy and audit semantics |

No old route is deleted until telemetry and support review confirm that bookmarks, integrations and training material have migrated.

## 12. Authorization and disclosure

Navigation is not authorization. Every route and action must continue to enforce server-side permission and module checks.

- Hide actions the user can never take.
- Show disabled actions only when the explanation helps the user resolve access, prerequisite or state.
- A direct link to a forbidden record returns a deliberate restricted state, not an empty page.
- Sensitive fields can be redacted while the record shell remains usable.
- Every consequential action creates a visible receipt with actor, time, result and reversal path when available.
- Company switching clears cached data and spatial presence before rendering the next company.

## 13. Acceptance criteria

The proposed information architecture is ready for build when:

- no role sees more than eight primary sidebar destinations by default;
- every current route in `SCREEN-MATRIX.md` has a target owner and migration treatment;
- Home is defined for employee, manager, sales, finance and director roles;
- CEO capabilities fit inside one terminal with local navigation;
- Realm and ERP resolve to the same canonical records;
- full page, drawer and dialog ownership is decided for every critical workflow;
- mobile navigation and mobile record patterns are specified independently of desktop tables;
- permission, module and company boundaries remain enforceable at the server;
- the founder approves the IA before production implementation starts.
