# RepositoryRealms screen and capability matrix

Status: current inventory plus proposed destination  
Inventory baseline: 79 Next.js page files, 134 API route files and 18 Realm v2 virtual areas at revision `6c7a71e`

## How to read this matrix

- **Audience** names the main user family. Existing server-side role, module, company and record-level checks remain authoritative.
- **Target owner** is the destination in the proposed information architecture.
- **Pattern** is the dominant page pattern, not a requirement to make every screen identical.
- **Support** states whether the business capability must survive. `Internal` means it remains a test or administration surface and is removed from product navigation.
- **Build tested** is `No` for every row because this is an audit. Static inventory and existing visual evidence are not acceptance tests for the redesign.

## D. Complete screen inventory

### Current route inventory

| ID | Current route | Audience | Current job | Target owner | Dominant pattern | Support | Build tested |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/` | Public or authenticated | enter product and resolve session | Entry | redirect or landing | Preserve | No |
| 2 | `/analytics` | Manager, director | analyze business performance | Management / Analytics | analysis workspace | Preserve | No |
| 3 | `/approvals` | Approver | review and decide requests | Operations / Approvals | decision queue | Preserve | No |
| 4 | `/assets` | Operations, finance | manage company assets | Operations / Assets | record index | Preserve | No |
| 5 | `/attendance` | Employee, manager, HR | record and inspect attendance | People / Time | record index | Preserve | No |
| 6 | `/audit` | Admin, auditor | inspect durable system events | System / Audit | audit log | Preserve | No |
| 7 | `/automation` | Admin, operations | configure and inspect automations | Operations / Automations | control center | Preserve | No |
| 8 | `/calendar` | Authenticated user | inspect deadlines and commitments | Work / Calendar | calendar | Preserve | No |
| 9 | `/ceo-briefing` | Director, CEO | review executive briefing | Management / CEO Terminal / Briefing | role home | Preserve via local view | No |
| 10 | `/ceo-commands` | Director, CEO | issue and track directives | Management / CEO Terminal / Commitments | decision workspace | Preserve via local view | No |
| 11 | `/ceo-decisions` | Director, CEO | make material decisions | Management / CEO Terminal / Decisions | decision queue | Preserve via local view | No |
| 12 | `/ceo-inbox` | Director, CEO | review executive messages and alerts | Inbox / Executive view | conversation queue | Preserve via filtered view | No |
| 13 | `/ceo-navigator` | Director, CEO | navigate executive information | Management / CEO Terminal | local navigation | Preserve intent | No |
| 14 | `/ceo-overview` | Director, CEO | inspect executive overview | Management / CEO Terminal | role home | Preserve via local view | No |
| 15 | `/ceo-registry` | Director, CEO | inspect governed company records | Management / CEO Terminal / Registry | record index | Preserve via local view | No |
| 16 | `/ceo-rollout` | Director, CEO | monitor strategic rollout | Management / CEO Terminal / Commitments | control center | Preserve via local view | No |
| 17 | `/ceo-security` | Director, CEO | inspect security exceptions | Management / CEO Terminal / Security | exception queue | Preserve via local view | No |
| 18 | `/ceo-workforce` | Director, CEO | inspect workforce health | Management / CEO Terminal / Workforce | analysis workspace | Preserve via local view | No |
| 19 | `/ceo-world` | Director, CEO | inspect company landscape | Realm or CEO Terminal | spatial or portfolio view | Preserve intent | No |
| 20 | `/clients` | Sales, account, manager | find and manage clients | Sales / Clients | record index | Preserve | No |
| 21 | `/clients/[id]` | Sales, account, manager | operate a client relationship | Sales / Client record | record detail | Preserve and expand | No |
| 22 | `/commissions` | Sales, finance, HR | inspect commission records | People / Pay | record index | Preserve | No |
| 23 | `/contracts` | Sales, finance, manager | manage commercial contracts | Sales / Quotes and contracts | record index and editor | Preserve | No |
| 24 | `/copilot` | Authenticated user | ask for supported product assistance | Global assistant | conversation workspace | Preserve with permission review | No |
| 25 | `/dashboard` | Authenticated user | orient at start of day | Home | role home with action queue | Replace composition | No |
| 26 | `/docs` | Authenticated user | find product or company documents | System / Help or Files | document index | Preserve | No |
| 27 | `/finance` | Finance, director | operate daily finance work | Finance / Finance Home | section home | Preserve and restructure | No |
| 28 | `/financials` | Finance, director | inspect financial statements | Finance / Reports and controls | analysis workspace | Preserve | No |
| 29 | `/finplan` | Finance, director | plan budgets and cash | Finance / Planning | planning workspace | Preserve | No |
| 30 | `/freelancer` | Freelancer | access personal contract work | Work / My Work | role home | Preserve | No |
| 31 | `/freelancers` | HR, manager, finance | manage external workers | People / Directory | record index | Preserve | No |
| 32 | `/fxreval` | Finance | perform foreign exchange revaluation | Finance / Reports and controls | control workflow | Preserve | No |
| 33 | `/gantt` | Project user, manager | plan work over time | Work / Time and planning | timeline workspace | Preserve | No |
| 34 | `/growing` | Admin or company owner | inspect growth or product readiness | System or Management | guided workspace | Preserve intent, clarify label | No |
| 35 | `/guide` | Authenticated user | learn product workflows | System / Help | guide | Preserve | No |
| 36 | `/import` | Admin, operations | import business records | Operations / Imports | staged workflow | Preserve | No |
| 37 | `/install` | System owner | initialize deployment or company | Entry / Setup | setup workflow | Preserve and restrict | No |
| 38 | `/inventory` | Operations, finance | manage stock and inventory | Operations / Inventory | record index | Preserve when enabled | No |
| 39 | `/invoices` | Finance, sales | create and manage invoices | Finance / Receivables | record index and full editor | Preserve | No |
| 40 | `/leads` | Sales, manager | qualify and advance leads | Sales / Leads | index, board and record detail | Preserve and expand | No |
| 41 | `/live` | Authenticated collaborator | join live collaboration | Realm / Rooms | live workspace | Preserve | No |
| 42 | `/login` | Public | authenticate | Entry | authentication | Preserve | No |
| 43 | `/markets` | Enabled module user | operate market-specific records | Operations / Enabled modules | domain workspace | Preserve when enabled | No |
| 44 | `/messages` | Authenticated user | communicate with colleagues | Inbox | conversation workspace | Preserve | No |
| 45 | `/myday` | Authenticated user | execute personal work | Work / My Work | action queue | Preserve and restructure | No |
| 46 | `/okr` | Manager, director | set and track objectives | Management / Objectives | planning workspace | Preserve | No |
| 47 | `/payroll` | HR, finance | operate payroll records | People / Pay | control workflow | Preserve | No |
| 48 | `/portfolio` | Manager, director | inspect project portfolio | Management / Portfolio | analysis and exception workspace | Preserve | No |
| 49 | `/projects` | Project user, manager | find and manage projects | Work / Projects | record index | Preserve | No |
| 50 | `/projects/[id]` | Project user, manager | execute a project | Work / Project record | record detail and control center | Preserve | No |
| 51 | `/quotes` | Sales, finance | create and manage quotes | Sales / Quotes and contracts | record index and full editor | Preserve | No |
| 52 | `/realm` | Authenticated user | enter legacy spatial experience | Realm | retired compatibility entry | Replace, preserve linked jobs | No |
| 53 | `/realm-demo` | Internal or demo user | demonstrate legacy Realm | Internal showcase | demo harness | Internal | No |
| 54 | `/realm-v2/[[...area]]` | Authenticated user | operate Realm v2 areas | Realm | spatial shell plus work panels | Replace composition | No |
| 55 | `/realm-v2/design-system` | Internal design and engineering | inspect Realm v2 primitives | Internal design system | component harness | Internal | No |
| 56 | `/realm-v2/phase-1-qa` | Internal QA | inspect phase 1 output | Internal QA | test harness | Internal | No |
| 57 | `/realm-v2/phase-2-qa` | Internal QA | inspect phase 2 output | Internal QA | test harness | Internal | No |
| 58 | `/realm-v2/phase-3-qa` | Internal QA | inspect phase 3 output | Internal QA | test harness | Internal | No |
| 59 | `/realm-v2/phase-4-qa` | Internal QA | inspect phase 4 output | Internal QA | test harness | Internal | No |
| 60 | `/realm-v2/phase-5-qa` | Internal QA | inspect phase 5 output | Internal QA | test harness | Internal | No |
| 61 | `/realm-v2/phase-6-qa` | Internal QA | inspect phase 6 output | Internal QA | test harness | Internal | No |
| 62 | `/realm-v2/phase-7-qa` | Internal QA | inspect phase 7 output | Internal QA | test harness | Internal | No |
| 63 | `/realm-v2/phase-8-qa` | Internal QA | inspect phase 8 output | Internal QA | test harness | Internal | No |
| 64 | `/recruitment` | HR, hiring manager | operate candidate pipeline | People / Hiring | workflow board and record detail | Preserve | No |
| 65 | `/reports` | Manager, specialist | run and export reports | Relevant functional hub / Reports | report workspace | Preserve | No |
| 66 | `/resources` | Manager, project user | allocate people and capacity | Work / Time and planning | planning workspace | Preserve | No |
| 67 | `/reviews` | Employee, manager, HR | conduct performance reviews | People / Development | staged workflow | Preserve | No |
| 68 | `/services` | Sales, operations | manage service catalog | Sales / Services | record index | Preserve | No |
| 69 | `/settings` | Admin, company owner | configure company and product | System / Settings | settings workspace | Preserve | No |
| 70 | `/shipments` | Enabled module user | manage shipment records | Operations / Enabled modules | record index and detail | Preserve when enabled | No |
| 71 | `/staff` | Employee, manager, HR | find people and operate HR work | People / Directory | section home and record index | Preserve and split | No |
| 72 | `/staff/[id]` | Employee, manager, HR | inspect an employee record | People / Employee record | record detail | Preserve | No |
| 73 | `/tasks` | Authenticated user | find and manage task records | Work / Tasks | record index | Preserve | No |
| 74 | `/teamwork` | Manager, team lead | allocate work and resolve blockers | Work / Team Work | control center | Preserve and restructure | No |
| 75 | `/templates` | Admin, operations | manage reusable templates | Operations / Templates | record index and editor | Preserve | No |
| 76 | `/tickets` | Support, sales, manager | resolve customer issues | Sales / Support | queue and record detail | Preserve | No |
| 77 | `/timesheet` | Employee, manager | record and approve time | People / Time or Work / Planning | time-entry workflow | Preserve | No |
| 78 | `/vendors` | Finance, operations | manage vendor records | Finance / Payables | record index and detail | Preserve | No |
| 79 | `/violations` | Admin, auditor, manager | investigate policy violations | System / Audit and policy | exception and decision queue | Preserve | No |

### Realm v2 virtual area expansion

The catch-all Realm route currently renders eighteen named areas. They are listed separately because a page-file count alone hides their interaction scope.

| Current area | Current intent | Target destination | Target treatment | Support | Build tested |
| --- | --- | --- | --- | --- | --- |
| `home` | Realm overview | Realm Home | replace card dashboard with spatial workplace and zone list | Preserve intent | No |
| `my-work` | personal work | Work / My Work and My Desk | shared action queue | Preserve | No |
| `work-management` | manager orchestration | Work / Team Work and Team Room | exception control center | Preserve | No |
| `action-center` | urgent actions | Global Actions | role-aware action queue | Preserve | No |
| `command-center` | operating command view | Management or Team Work | exception and commitment view | Preserve intent | No |
| `inbox` | messages and alerts | Inbox | unified conversation and notification queue | Preserve | No |
| `projects` | project access | Work / Projects and Project Rooms | shared project records | Preserve | No |
| `chronicle` | activity history | Realm / Chronicle | durable activity and decision timeline | Preserve | No |
| `collaboration` | team collaboration | Realm / Team Room | room workspace | Preserve | No |
| `world-map` | spatial navigation | Realm Home | optional spatial company map plus accessible list | Preserve intent | No |
| `ceo-terminal` | executive operation | Management / CEO Terminal | consolidated executive workspace | Preserve | No |
| `employee-profile` | employee context | People / Employee record | canonical employee record | Preserve | No |
| `recognition` | employee recognition | People / Development | recognition workflow | Preserve | No |
| `approvals` | approval action | Operations / Approvals | shared decision queue | Preserve | No |
| `notifications` | alerts | Inbox / Notifications | unified notification view | Preserve | No |
| `search` | search records | Global command palette | grouped search and commands | Preserve | No |
| `settings` | Realm preferences | System / Settings / Realm | settings view | Preserve | No |
| `mobile` | mobile preview or entry | Responsive shell | remove as product destination, preserve QA coverage | Internal intent | No |

## 3. Capability preservation matrix

This matrix is the migration contract. A cleaner visual design is not allowed to remove these behaviors silently.

| Capability | Current evidence | Proposed location | Target component or pattern | Support | Acceptance test required |
| --- | --- | --- | --- | --- | --- |
| Authentication and session resolution | login, root and app shell | Entry and global shell | authentication page, session boundary | Preserve | valid, invalid, expired and redirected sessions |
| Company context switching | shell and scoped resources | global shell | company switcher and cache boundary | Preserve | no data or presence leaks across companies |
| Role-based navigation | `ERP_NAV` filtering | global shell | intent groups plus local navigation | Preserve behavior | role snapshots and direct-link tests |
| Module and plan gates | route and API checks | all hubs | `ModuleGate` and route boundary | Preserve | enabled, disabled and upgraded states |
| Record-level permission | API and page behavior | record pages | permission boundary and redaction | Preserve | allowed, forbidden and partially redacted |
| Global search | shell modal | command bar | command palette | Preserve and expand | recent, grouped result, command, no result, error |
| Global create | page actions and shell actions | command bar | permission-aware create menu | Preserve | valid options by role and module |
| Notifications | shell and Realm areas | Inbox | notification queue | Preserve | unread, read, link target and failure |
| Messaging | `/messages`, Realm inbox | Inbox and Rooms | conversation workspace | Preserve | send, receive, retry, unread and permission |
| Live collaboration | `/live`, Realm collaboration | Realm Rooms | presence and live workspace | Preserve | join, leave, reconnect and inaccessible room |
| Personal execution | `/myday`, tasks | Home and My Work | action queue | Preserve | now, next, blocked, later and completion receipt |
| Manager work allocation | `/teamwork`, resources | Team Work | control center | Preserve | WIP, reassignment, blocker and capacity |
| Project index | `/projects` | Work / Projects | data table and saved views | Preserve | search, filter, sort, paging, permission |
| Project execution | `/projects/[id]` | Project record | record workspace | Preserve | status, task, member, health and activity |
| Tasks | `/tasks` | Work / Tasks | data table and task record | Preserve | create, assign, change state, bulk and receipt |
| Calendar and deadlines | `/calendar` | Work / Calendar | calendar | Preserve | time zone, role visibility and record links |
| Gantt and capacity | `/gantt`, `/resources` | Work / Planning | timeline and allocation | Preserve | date changes, dependencies and conflicts |
| Time entry | `/timesheet` | People / Time | time-entry workflow | Preserve | draft, submit, approve, reject and lock |
| Lead pipeline | `/leads` | Sales / Leads | list, board and record detail | Preserve | stage, owner, activity, forecast and permission |
| Client index and 360 | `/clients`, `/clients/[id]` | Sales / Clients | data table and client record | Preserve and expand | contact, work, commercial, files and activity |
| Quote lifecycle | `/quotes`, `DocEditor` | Sales / Quotes | index and full-page editor | Preserve | draft, line items, totals, issue, approval, export |
| Contract lifecycle | `/contracts` | Sales / Contracts | index and editor | Preserve | draft, status, dates, attachments and audit |
| Service catalog | `/services` | Sales / Services | record index | Preserve | create, edit, archive and linked use |
| Customer support | `/tickets` | Sales / Support | queue and ticket record | Preserve | priority, assignment, response, resolution and SLA |
| Finance daily operation | `/finance` | Finance Home | action and exception workspace | Preserve | collections, approval, reconciliation and close tasks |
| Invoice lifecycle | `/invoices` | Finance / Receivables | index and full-page editor | Preserve | draft, line items, issue, payment, void and receipt |
| Vendor and payable work | `/vendors` | Finance / Payables | record index and detail | Preserve | vendor lifecycle, permission and linked transactions |
| Transactions and expenses | finance pages | Finance / Transactions | data table and record detail | Preserve | create, reconcile, categorize, approve and export |
| Financial statements | `/financials` | Finance / Reports | report workspace | Preserve | period, currency, drilldown and export |
| Financial planning | `/finplan` | Finance / Planning | planning workspace | Preserve | version, scenario, approval and audit |
| FX revaluation | `/fxreval` | Finance / Controls | control workflow | Preserve | rate, preview, post and receipt |
| Payroll | `/payroll` | People / Pay | control workflow | Preserve | period, permission, approval and audit |
| Commissions | `/commissions` | People / Pay | record index | Preserve | calculation, status, correction and export |
| Employee directory | `/staff` | People / Directory | data table and people list | Preserve | search, filter, contact, role and privacy |
| Employee record | `/staff/[id]` | People / Employee | record detail | Preserve | tabs, permissions, documents and audit |
| Attendance | `/attendance` | People / Time | record index | Preserve | check state, correction, approval and report |
| Leave | current staff workflows and APIs | People / Leave | request and approval workflow | Preserve | request, balance, approve, reject and conflict |
| Recruitment | `/recruitment` | People / Hiring | pipeline and candidate record | Preserve | stage, interview, decision and privacy |
| Reviews | `/reviews` | People / Development | staged workflow | Preserve | draft, participants, submit, acknowledge and privacy |
| Freelancers | `/freelancer`, `/freelancers` | Work and People | role home, directory and record | Preserve | assignment, access, contract and payment context |
| Approvals | `/approvals` | Operations / Approvals | decision queue | Preserve and strengthen | evidence, threshold, decision, comment and immutable receipt |
| Assets | `/assets` | Operations / Assets | record index | Preserve | assignment, condition, transfer and audit |
| Inventory | `/inventory` | Operations / Inventory | data table and record detail | Preserve when enabled | stock, movement, threshold and module gate |
| Shipments | `/shipments` | Operations / Enabled modules | domain workspace | Preserve when enabled | lifecycle, linked records and permission |
| Markets | `/markets` | Operations / Enabled modules | domain workspace | Preserve when enabled | domain actions, module gate and audit |
| Automation | `/automation` | Operations / Automations | control center | Preserve | enable, disable, run, failure, log and permission |
| Import | `/import` | Operations / Imports | staged workflow | Preserve | map, validate, preview, commit, error file and receipt |
| Templates | `/templates` | Operations / Templates | index and editor | Preserve | create, version, archive and usage |
| Analytics | `/analytics` | Management / Analytics | analysis workspace | Preserve | filter, drilldown, data freshness and export |
| Objectives | `/okr` | Management / Objectives | planning workspace | Preserve | ownership, progress, check-in and history |
| Portfolio | `/portfolio` | Management / Portfolio | exception workspace | Preserve | health, dependency, allocation and drilldown |
| CEO decisions and commands | `/ceo-*` | CEO Terminal | decision and commitment workspaces | Preserve and consolidate | all old intents, route redirects and receipts |
| Audit log | `/audit` | System / Audit | audit log | Preserve | actor, target, field change, time and export control |
| Violations | `/violations` | System / Policy | exception and decision queue | Preserve | evidence, disposition, appeal and audit |
| Settings | `/settings` | System / Settings | full-page settings workspace | Preserve | section permissions, dirty state, save and receipt |
| Product and company guides | `/guide`, `/docs` | System / Help | guide and document index | Preserve | search, permissions and link durability |
| Install and setup | `/install`, `/growing` | Entry and System | staged setup workflow | Preserve, clarify | authorization, resume, completion and rollback guidance |
| CSV export | shared UI helper and pages | data tables and reports | permission-aware export | Preserve | fields, filter, encoding, large result and denied export |
| Loading and refresh | page-local fetch states | every data pattern | skeleton and freshness indicator | Strengthen | initial, background and slow response |
| Empty and filtered empty | page-local `EmptyState` | every list and table | `StatePanel` | Strengthen | true empty, filtered empty and no search result |
| Error and offline | inconsistent page-local handling | every data pattern | inline state and draft protection | Strengthen | retry, partial, offline and recovery |
| Status labeling | central and duplicated mappings | shared work objects | status registry | Preserve semantics | every enum, unknown fallback and accessible meaning |
| Confirmation and destructive actions | modal and page-local behavior | contextual action layer | Alert Dialog and receipt | Preserve and strengthen | consequence, identity, cancel, confirm and result |
| Audit receipts | toasts and audit APIs | all consequential actions | `Receipt` | Strengthen | actor, time, target, outcome and reversal path |
| Responsive access | global table transformation and local CSS | every surface | domain mobile layouts | Preserve capability | 320px, zoom, touch, keyboard and no covered content |
| Realm shared records | Realm v2 canonical routes | Realm and functional hubs | shared record adapters | Preserve | same ID, permissions, updates and receipts across surfaces |

## 4. Critical workflow before and after matrix

| Workflow | Current path | Proposed path | Capability contract |
| --- | --- | --- | --- |
| Start the day | Dashboard cards, then user hunts for work | Home opens with role-aware Now queue, exceptions and changes | all current data sources remain reachable, fewer steps to first action |
| Complete personal work | My Day metrics and mixed panels | My Work groups Now, Next, Blocked and Later | task action API and canonical action receipts remain intact |
| Resolve a team blocker | Team Work panels, tables and cards | Team Work exception queue opens a contextual inspector | manager controls, WIP and ownership stay intact |
| Qualify a lead | Lead list, board and modal detail | Lead index opens a stable lead record page | campaign, owner, stage, forecast and activity semantics stay intact |
| Produce a quote | Quotes list opens a large editor modal | Quote index opens a full-page document editor | line items, totals, issue and export behavior stay intact |
| Issue and collect an invoice | Invoice list plus modal creation and editing | Receivables index opens an invoice workspace with payment history | invoice states and finance records stay intact |
| Approve a request | Compact approval row with immediate actions | Decision workspace presents evidence, consequence and receipt | approve and reject APIs remain intact, evidence becomes clearer |
| Inspect a client | Client 360 KPI cards and selected panels | Client record uses Overview, Activity, Contacts, Work, Commercial and Files | existing client data remains, related records become easier to find |
| Inspect an employee | Long card page | Employee record uses permission-aware local tabs | HR, time, leave and document semantics remain intact |
| Act as CEO | Eleven competing routes and long card dashboards | One CEO Terminal opens decisions and material exceptions first | every executive capability maps to a local view or shared surface |
| Enter Realm | medieval legacy or dark dashboard shell | spatial workplace with My Desk, Team Room, Project Rooms, Inbox and Chronicle | all records remain canonical and accessible without spatial navigation |

## 5. Migration test ledger

During implementation, each route and capability row receives one of these states:

- `Not started`
- `Adapter built`
- `Visual parity reviewed`
- `Behavior parity tested`
- `Role and module tested`
- `Responsive and accessibility tested`
- `Founder accepted`
- `Legacy path retired`

A legacy screen may be retired only when every preserved capability it owns has reached `Founder accepted`, old route behavior is handled, and no unresolved high-risk workflow remains.
