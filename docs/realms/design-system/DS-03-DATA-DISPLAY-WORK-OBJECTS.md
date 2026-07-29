# DS-03 — Data Display and Work Objects

Status: visual direction v1 locked  
Depends on: DS-01 foundations and DS-02 shell

## Purpose

Work objects are authorized projections of canonical ERP/CRM records. They make operational facts readable and actionable without becoming a parallel database, policy engine or audit source.

## Shared object contract

Every work object must be able to expose:

- object type and stable record reference;
- authorized title or a safe redacted label;
- owning entity and source system;
- state and state label;
- last-updated or as-of timestamp;
- freshness: live, stale, offline or limited;
- available actions after permission and policy evaluation;
- pending command state when an action has been proposed;
- canonical receipt link after a confirmed action.

Decoration, glow and border treatment never replace these fields.

## Semantic tokens

| Group | Values |
| --- | --- |
| Execution | Not Started, In Progress, Blocked, Waiting, Completed |
| Priority | Critical, High, Normal, Informational |
| Data quality | Live, Stale, Offline, Limited |
| Governance | Approval Required, Permission Limited, Receipt Confirmed |

Each token requires icon, text and semantic color. Compact table-cell variants retain a readable label or accessible name.

## Task object

### Required anatomy

- title;
- project or parent context;
- due date and time;
- execution state;
- priority;
- queue position when applicable;
- estimate and recorded actual time;
- dependency state;
- blocker reason;
- last update;
- receipt state;
- one visually primary next action.

### Variants

- compact list row;
- comfortable card;
- mobile card;
- selected;
- blocked;
- completed;
- loading and permission-limited.

A completed task links to its receipt when available. It does not use a reward animation or decorative celebration as proof of completion.

## Project object

Required information:

- project and client;
- health with textual label;
- progress;
- budget and currency;
- next milestone and date;
- blocked-work count;
- pending-approval count;
- source and as-of timestamp.

Compact variants may omit secondary metrics but must retain project, health, progress and next milestone. Financial labels must distinguish budget, spend, revenue, cash, forecast and estimated value.

## Person and workload object

Allowed information:

- avatar, name, title and team;
- optional presence and collaboration status;
- current authorized work;
- availability;
- WIP;
- estimated and recorded hours;
- blocked-work count;
- last collaboration.

Forbidden presentation:

- productivity score;
- honesty or trust score;
- rank, leaderboard or comparison trophy;
- inferred employee performance judgment;
- surveillance language or presence-as-performance measurement.

Workload indicators support planning decisions; they do not evaluate a person's worth or performance.

## Approval object

Required information:

- request title and requestor;
- amount or operational impact;
- entity;
- governing policy;
- risk label;
- expiration;
- evidence count and safe attachment access;
- maker-checker stage;
- permitted actions;
- final receipt when confirmed.

Approve, reject and request-changes controls appear only after permission, policy and step-up-authentication checks. Optimistic feedback may show that a request was submitted, never that approval succeeded.

## Action Center item

Required information:

- source;
- entity;
- impact;
- urgency;
- evidence;
- required decision;
- expiration;
- available action;
- post-action receipt.

Criticality sorting must remain inspectable and policy-based. It must not be derived from an opaque employee score.

## Collaboration objects

Message previews contain participant, optional presence, safe project or record context, attachment ownership, timestamp, unread state, message receipt and jump-to-record action.

Notification types:

- mention;
- system;
- approval;
- incident.

Authorization is evaluated before rendering titles, snippets, attachment names, participant context or destination URLs. When the record may be disclosed but its content may not, render `Restricted record` with an optional request-access action.

## Data-display patterns

### Metric card

- metric label;
- value with tabular figures;
- unit and reporting period;
- change and comparison basis;
- source;
- as-of timestamp;
- limitation or stale label;
- text alternative for graphical treatment.

### Data table

- semantic caption;
- keyboard-reachable sorting;
- `aria-sort` on the active column;
- sticky headers only when they do not hide focus;
- stable column widths during loading;
- row actions reachable without hover;
- pagination or virtualization for large collections;
- mobile replacement with prioritized rows/cards instead of horizontal compression.

### Queue, timeline and progress

- queue exposes ordering and a keyboard alternative to drag-and-drop;
- timeline exposes actor, action, record, source and timestamp;
- progress includes a textual value and never relies on the bar color alone.

## Resilience states

| State | Contract |
| --- | --- |
| Loading | Skeleton preserves final bounds; use after approximately 300ms |
| Empty | Explain what is absent and provide a relevant next action |
| Error | State cause when safe and provide retry or recovery |
| Stale | Show last successful synchronization and refresh action |
| Offline | Explain unavailable actions and queued behavior |
| Permission denied | Reveal no protected content; offer a safe access path when policy allows |
| Redacted | Preserve object position and safe metadata without leaking title or snippet |

## Responsive content priority

Desktop may show the full object contract. Tablet stacks secondary metadata. Mobile prioritizes:

1. title;
2. state and priority;
3. due date or expiration;
4. next permitted action;
5. critical blocker or risk;
6. remaining metadata through progressive disclosure.

Mobile objects use at least 44px touch targets and do not rely on swipe-only actions.

## Accessibility and interaction

- Normal text meets WCAG AA contrast.
- Focus uses the DS-01 2px visible ring.
- State is announced by text and semantics, not color alone.
- Cards with multiple actions are containers, not one invalid nested button.
- Entire-card navigation has an accessible name and separate actions remain independently reachable.
- Live updates do not steal focus; important changes use an appropriate polite live region.
- Loading, error and receipt announcements avoid repeated screen-reader noise.

## Acceptance checklist

- Canonical source and freshness are visible where decisions depend on them.
- Financial metrics have unambiguous meaning and units.
- No employee score, ranking or surveillance inference exists.
- Permission and redaction states leak no protected content.
- Loading states preserve layout.
- Every actionable state has keyboard, touch and recovery behavior.
- Confirmed outcomes link to canonical receipts.
- Decorative layers can be disabled without semantic or layout loss.

