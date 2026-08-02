# Realm Screen and Template Contracts

Status: application design v1 complete  
Visual boards: `06-realm-home-my-work-v1.png` through `14-mobile-realm-v1.png`

## Product-wide rules

- Realm is an operating interface over canonical ERP, CRM, DMS, finance, identity and collaboration sources.
- Every decision-grade number exposes source, as-of time and freshness; executive metrics also expose confidence.
- Proposal, approval, execution and confirmation are separate states.
- A successful external action requires a canonical receipt and creates a Chronicle event.
- Restricted entities do not leak titles, snippets or relationship context.
- Presence and workload help coordination only; no employee scores, peer rankings or hidden surveillance.
- Mobile is priority-first, not a compressed desktop dashboard.

## Global information architecture

Primary desktop destinations:

`Realm Home / My Work / Projects / Work Management / Action Center / Command Center / Inbox / Chronicle / World Map / CEO Terminal / People / Recognition / Settings`

Mobile persistent destinations:

`Home / My Work / Actions / Inbox / More`

Search, notifications, quick command, approvals, project details and profile are global routes or drill-downs, not extra persistent mobile tabs.

## 1. Realm Home

**Question:** What needs my attention now, and what should I do next?

- Required regions: current objective, Next Task, attention summary, active projects, collaboration requests, operating pulse, Chronicle highlights and upcoming milestones.
- Required attention classes: blocked, overdue, pending approval and unread decision.
- Primary action: open/advance the single Next Task.
- Every summary exposes source and as-of time.
- Optional abstract landscape/map is contextual decoration only.
- Mobile retains objective, Next Task, attention counts and recent changes.

## 2. My Work

**Question:** What work belongs to me and in what order?

- Views: Now, Next, In Progress, Blocked, Waiting, Overdue and Completed.
- Task contract: title, project, due, status, priority, queue position, estimate, recorded time, dependency, blocker, update and receipt.
- Primary actions: open, move, start, complete or resolve blocker according to permission.
- Drag has an explicit `Move` alternative.
- Completion distinguishes pending synchronization from canonical completion.

## 3. Work Management

**Question:** How is work flowing across teams, projects and queues?

- Views: Board, Queue, Timeline and Workload.
- Required measures: WIP, at-risk work, capacity, overdue items, planned/active work and user-set availability.
- Lane policies and WIP limits are visible at the point of movement.
- Concurrent edits show a conflict state and preserve an audit trail.
- Workload never becomes a productivity score or ranking.

## 4. Action Center

**Question:** Which exception needs a decision or intervention?

- Categories: approvals, blockers, client actions, project risk, unread decisions, finance warnings, incidents and collaboration requests.
- Action contract: source, entity, impact, urgency, evidence, requested decision, recommended action, expiration/SLA and receipt state.
- Detail exposes evidence, policy, comments and accountable owner.
- Resolution requires a reason when policy or consequence warrants it.

## 5. Command Center

**Question:** How can intent become a safe, governed system action?

- Composer accepts natural language but always returns a structured proposal.
- Preview: normalized command, records/fields, before/after, dependencies, effects, source, permission, rules, risk, approvers, idempotency, window and rollback note.
- Lifecycle: Draft, Proposed, Pending Approval, Approved, Executing, Confirmed or Failed.
- Simulation/dry run and duplicate detection precede submission where supported.
- `Confirmed` exists only after canonical receipt.

## 6. Unified Inbox

**Question:** Which conversation or notification needs a response in context?

- Sources: direct, team, project, mentions, approval discussions and system notifications.
- Thread contract: unread, sender, authorized visibility, entity/project/task context, time, attachments and decision marker.
- Conversation actions: jump to record, open project, create decision and add to Chronicle.
- Attachments expose owner/source; messages expose delivery/read receipt.
- Restricted or revoked content is redacted without leaking prior labels.

## 7. Project Realm

**Question:** Is this project producing its intended outcome within agreed constraints?

- Required regions: goal, client, owner, budget/burn, timeline, phases, milestones, task flow, blocked work, workload, risk, decisions, conversations, approvals and Chronicle.
- Tabs: Overview, Work, Timeline, Budget, Decisions, Files and Chronicle.
- Spatial phase/dependency navigation is optional; standard panels remain canonical.
- Risks and stale sources include accountable recovery actions.

## 8. Chronicle

**Question:** What changed, who changed it and what proves the result?

- Event contract: actor, action, record, before/after, source, canonical time, reason, receipt and audit status.
- Distinguish human, system and imported events.
- Existing events cannot be destructively edited.
- Annotation or correction creates a linked new event.
- Export is permissioned, signed and covered by retention policy.

## 9. Collaboration and Presence

**Question:** Who is available to coordinate around this work right now?

- Show active collaborators, shared workspace, rooms, invitations, contact requests, shared context and decision summary.
- Availability is explicitly user-set: Available, Focus, Away or Offline.
- Co-viewing requires visible consent and an easy leave control.
- No hidden activity monitoring, mood inference, keystroke capture or productivity analytics.

## 10. World Map

**Question:** Where across the federation is attention needed?

- Required companies: Egoric Agency, AIM Agency, VNECOM LLC and Egolive.
- Node contract: health, live/stale/offline, incidents, unread commands, pending approvals and last sync.
- Layers: Companies, Projects, Incidents, Finance and Commands.
- Selection opens standard company context and deep links.
- Every map state is duplicated in a conventional list or table.

## 11. CEO Terminal

**Question:** What is true across the federation, and which decision matters most?

- Required metric families: cash, recognized revenue, expenses, AR/AP, pipeline, delivery, project risk, approval backlog, capacity, Egolive GMV, settlement and incidents.
- GMV, revenue, cash, forecast and estimated value are never conflated.
- Every metric exposes source, as-of and confidence.
- Required regions: company comparison, urgent decisions, CEO inbox, operational brief, command gateway, system health and source freshness.
- Mobile presents an executive brief and urgent decisions rather than compressed charts.

## 12. Employee Profile

**Question:** Who is this person in the organization, and how can we work together?

- Profile: preferred name, role, team, company, time zone, user-set availability, contact and access context.
- Tabs: Overview, Work, Skills, Projects, Recognition, Chronicle and Preferences.
- Skills require evidence links; they are not RPG statistics.
- Field-level visibility controls are explicit.
- Do not expose rankings, productivity scores, hidden monitoring or inferred mood.

## 13. Recognition / Gold Ledger

**Question:** What contribution was recognized, under which policy, and with what proof?

- Gold is a recognition accounting unit, not speculative currency or game loot.
- Ledger: date, from/to, reason, contribution/project, source, approver, policy, amount, receipt and status.
- Issuance requires evidence, value demonstrated, policy limit and required approval.
- Ledger is append-only; corrections use compensating entries.
- No leaderboard, streak, reward shop, scarcity badge or competitive ranking.

## 14. Approvals

**Question:** What decision am I authorized to make with the available evidence?

- Views: My approvals, Requested by me, Escalated and Completed.
- Request: maker, chain, company/project, impact/amount, risk, SLA, evidence and policy.
- Detail: before/after, evidence, policy tests, comments and conflict-of-interest notice.
- Actions: approve, reject with reason, request changes and delegate when policy permits.
- Step-up authentication is required for configured high-risk decisions.
- Downstream execution and final receipt remain visibly separate.

## 15. Notifications

**Question:** What changed, and does it require action?

- Groups: Needs action, Mentions, Updates and System.
- Notification: type, source/entity, scope, reason, time, read state, severity, deep link and receipt/state.
- Controls: mark read, mute, snooze with reason and preferences.
- Preferences support in-app/email/push, quiet hours, digest and per-project overrides.
- Critical alerts may be constrained by organization policy.

## 16. Search and Command Palette

**Question:** Can I safely find or act on any authorized Realm object?

- Targets: projects, tasks, people, messages, decisions, files, companies and commands.
- Results show type, context, source and updated time only after authorization.
- Supports recent searches, quick actions and complete keyboard navigation.
- Restricted labels are omitted or replaced by policy-safe generic placeholders.
- `Create command…` opens a proposal flow, never executes immediately.

## 17. Settings

**Question:** How is my experience, workspace and governance configured?

- Modules: profile/preferences, notifications, appearance/accessibility, presence/privacy, accounts, companies/workspaces, teams/roles, permissions, approval policies, command policies, integrations/sources, data/retention, security/sessions, audit/exports and billing.
- Forms use persistent labels, help, validation and explicit save/publish states.
- Governance changes show permission boundary, test/preview, unsaved guard and audit preview.
- Published policy changes require a canonical receipt.

## 18. Mobile Realm

**Question:** What is the next safe action I can take from a phone?

- Persistent nav: Home, My Work, Actions, Inbox and More.
- Supported priority routes: approval detail, quick command, project, notifications, search and profile/settings.
- One primary action per screen; minimum 44px targets; safe-area and dynamic-type support.
- Swipe is optional and always has a visible button/menu alternative.
- Offline mutations are queued and labeled; success waits for synchronization and receipt.

## Shared analytics boundary

Measure system and workflow health: time to value, queue age, blocker age, approval latency, command confirmation latency, receipt failures, stale-source duration, error recovery and task cycle time. Do not generate employee worth scores, hidden rankings or surveillance metrics.

## Implementation gate

A route is not design-complete until its data source, authorization policy, resilience states, responsive priorities, keyboard/touch behavior, analytics boundary and receipt/Chronicle outcome are recorded in its implementation ticket.
