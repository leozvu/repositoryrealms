# DS-05 — Operational Patterns and Templates

Status: visual direction v1 locked  
Depends on: DS-01 foundations, DS-02 shell, DS-03 work objects and DS-04 command safety

## Purpose

DS-05 defines the repeatable page structures and lifecycles used to compose Realm product screens. A template chooses hierarchy and interaction rhythm; it does not introduce new visual tokens or bypass the component contracts in DS-01 through DS-04.

## Template taxonomy

| Template | Use when | Primary region | Typical secondary region |
| --- | --- | --- | --- |
| Focus Workspace | One person must advance one body of work | Current/next work | Context drawer |
| Registry / List | Users browse, filter or manage many records | Table or structured list | Filters and record detail |
| Board / Queue | Flow, triage, WIP and prioritization matter | Lanes or ordered queue | Policy/workload panel |
| Command Cockpit | Intent must become governed execution | Composer and proposal | Validation, approval and receipt |
| Timeline / Chronicle | Sequence, provenance or audit history matters | Immutable event stream | Event evidence |
| Map / Spatial | Location or federation relationships aid orientation | Optional spatial index | Canonical list/detail |
| Executive Brief | Leaders need summary and decisions | Metric/decision brief | Source health and drill-down |
| Settings / Form | Users configure policy or preferences | Labeled form | Help, preview and audit |
| Mobile Priority | A field user needs one next action | Priority card or detail | Bottom sheet/full-screen drill-down |

Spatial and decorative regions are never the sole representation of business state. Every state on a map is repeated in a semantic list, table or detail panel.

## Standard page anatomy

1. **Shell** — persistent organization context, navigation and global actions.
2. **Page header** — title, purpose, scope, filters and primary action.
3. **Attention summary** — exceptions and state that can change the user's next action.
4. **Primary work region** — the main list, board, cockpit, timeline, map or form.
5. **Contextual side region** — optional detail, evidence or policy; drawer on narrower viewports.
6. **Receipt/status region** — outcome, source, freshness and audit links.

Desktop defaults are a 240px rail, 56px top bar, 72px page header and optional 400px drawer. These are defaults, not reasons to squeeze content below its usable width.

## Operational lifecycles

### Task

`Now → Next → In Progress → Blocked / Waiting → Completed`

- `Blocked` requires a blocker reason and accountable next step.
- `Waiting` requires a dependency and expected response date when known.
- `Completed` requires persisted canonical state; actions with external effects also require a receipt.

### Command

`Draft → Proposed → Pending Approval → Approved → Executing → Confirmed / Failed`

- Natural-language input creates a proposal, never a success state.
- Permission and business-rule checks happen before submission.
- Retry preserves idempotency.
- `Confirmed` requires a canonical receipt.

### Approval

`Maker → Checker → Approver → System → Receipt`

- Roles may collapse only when policy explicitly permits it.
- The decision includes evidence, policy result, reason and actor.
- A successful decision is distinct from successful downstream execution.

### Incident

`Detected → Assessed → Assigned → Mitigating → Resolved → Reviewed`

- Severity uses text and icon in addition to color.
- Resolution records mitigation, owner, timestamp and evidence.
- Review creates a linked Chronicle event.

### Collaboration

`Mention → Context → Response → Decision → Receipt / Chronicle`

- Conversation stays linked to the affected work object.
- Decisions are promoted from chat into a canonical decision record.
- Presence is optional coordination context, never employee surveillance.

## Responsive composition

### Desktop — 1440 and above

- Persistent navigation rail for deep workflows.
- Context drawer may coexist with the primary region when usable width remains.
- Multi-pane layouts are allowed when reading order is unambiguous.

### Tablet — 768 to 1279

- Navigation collapses into the top bar.
- Contextual detail overlays content as a drawer when needed.
- Preserve primary action and attention summary; defer secondary analytics.

### Mobile — 375 to 767

- Maximum five persistent bottom-navigation destinations.
- One primary action per screen.
- Tables become prioritized records or drill-down lists, not horizontally scrolling mini tables.
- Search becomes full-screen; contextual work uses bottom sheets or separate routes.
- Respect safe areas, the software keyboard and dynamic type.

## Resilience state contract

| State | Required content | Recovery |
| --- | --- | --- |
| Loading | Stable skeleton matching final layout | No action unless unusually long |
| Empty | What is empty and why that matters | Relevant create/change-filter action |
| Stale | Source and last successful refresh | Refresh or inspect source |
| Offline | What remains available and what is queued | Retry when online |
| Error | Human-readable scope and safe diagnostic ID | Retry, alternate path or support |
| Permission denied | Missing access and disclosure-safe context | Request access when policy permits |
| Redacted | Explicit restricted placeholder | Policy/help path, never leaked content |

Loading preserves layout. Offline mutations remain visibly queued and never appear confirmed. Permission checks happen before sensitive titles or snippets render.

## Composition rules

- Use the DS-01 8-point grid.
- Interactive targets are at least 44 by 44px.
- Keyboard focus is always visible.
- Color contrast meets WCAG 2.1 AA.
- Prefer native semantic controls and accessible names.
- Avoid horizontal page scrolling at supported breakpoints.
- Every drag, drop, swipe or gesture has a visible keyboard/button alternative.
- Decoration is optional, non-interactive and carries no business meaning.
- Canonical source and freshness remain visible where decisions depend on data.
- A canonical receipt closes every command or externally consequential action.

## Template completion checklist

A composed screen is ready for implementation only when it defines:

- user question and primary outcome;
- required data and canonical source;
- primary and destructive actions;
- permissions and policy boundaries;
- loading, empty, stale, offline, error, denied and redacted behavior;
- responsive content priority;
- keyboard, touch and focus behavior;
- optimistic/pending versus confirmed state;
- receipt and Chronicle behavior;
- analytics events that measure workflow health without measuring employee worth.

Templates compose components. Lifecycles expose truth. Receipts close the loop.
