# DS-04 — Overlays, Feedback and Command Safety

Status: visual direction v1 locked  
Depends on: DS-01 foundations, DS-02 shell and DS-03 work objects

## Core invariant

Proposal is not approval. Approval is not execution. Execution is not confirmation. Realm may render a successful outcome only after the canonical system returns a valid receipt.

The interface presents and explains command state; it does not manufacture that state.

## Overlay taxonomy

| Surface | Purpose | Typical size |
| --- | --- | --- |
| Tooltip | Short explanation; no essential interactive workflow | Up to 240px |
| Popover | Lightweight contextual controls | Up to 320px |
| Dropdown | Option or action selection | Up to 280px |
| Small modal | Focused blocking decision | Up to 480px |
| Medium modal | Structured confirmation or form | Up to 720px |
| Large modal | Complex review requiring a contained context | Up to 960px |
| Drawer | Contextual work beside the current record | 400px desktop |
| Mobile bottom sheet | Touch-first contextual work | Up to 90dvh |

Overlays never replace primary navigation. Modal and drawer placement must follow the DS-02 z-index contract.

### Overlay behavior

- Use a 40–60% scrim for blocking overlays.
- Initial focus moves to the first meaningful control or heading.
- Focus remains within blocking overlays.
- Escape closes when closure is safe.
- Close and cancellation controls remain visible.
- Closing returns focus to the trigger.
- Unsaved changes require an explicit guard.
- Background content is inert while a blocking overlay is active.
- Reduced motion removes translation and keeps a minimal crossfade.

## Command palette

The command palette supports authorized navigation, records, actions and recent destinations.

Each result exposes:

- icon and human-readable label;
- result type and entity scope;
- keyboard shortcut when available;
- allowed, limited or restricted state;
- safe supporting context.

Authorization is evaluated before titles, snippets or entity context are rendered. Restricted results use a safe generic label when policy permits their existence to be disclosed; otherwise they are omitted. Search history must not preserve labels that the user can no longer access.

## Command composer and structured preview

Natural-language input creates a proposal preview, not an executable command.

Required preview fields:

- normalized command type;
- target record;
- entity;
- financial or operational impact;
- permission result;
- business-rule validation;
- risk;
- approval requirement;
- idempotency key or its pending allocation state;
- evidence;
- reason requirement;
- source and freshness when relevant.

The primary action is `Submit proposal`. Copy and status must use `Proposed`, never `Executed` or `Success`.

## Command lifecycle

| State | Meaning | Permitted UI claim | Receipt expectation |
| --- | --- | --- | --- |
| Draft | Local or server-saved preparation | Saved as draft | None |
| Proposed | Submitted for validation or review | Proposal submitted | None |
| Pending Approval | Waiting for required reviewer | Awaiting approval | None |
| Pending Confirmation | Blocked on explicit user/system confirmation | Confirmation required | None |
| Approved | Authorized but not yet canonically executed | Approved for execution | None |
| Executing | Canonical system is processing | Execution in progress | None |
| Confirmed | Canonical command succeeded | Confirmed | Required |
| Failed | Validation or execution did not complete | Not executed or failed | Failure evidence; no success receipt |

Executing may expose cancel only when the canonical backend explicitly declares cancellation safe. Retry must reuse or deliberately replace the idempotency contract so duplicate effects cannot occur silently.

## Maker-checker approval

Sequence:

1. Maker creates the proposal.
2. Checker reviews scope and evidence.
3. Approver authorizes the action.
4. System performs canonical execution.
5. Receipt records the final outcome.

Required behavior:

- Show current stage and full authorized approval chain.
- Support comment, request changes, approve and reject.
- Collect a reason when policy requires it.
- Invoke step-up authentication for high-risk actions.
- Prevent self-approval when separation of duties is required.
- Revalidate permission, policy and record freshness before execution.
- Show policy changes as a recoverable failure, not a generic error.

## Confirmation patterns

### Standard confirmation

Restates target, entity, effect and reversibility. Use for low-risk actions where an accidental activation has meaningful cost.

### High-risk confirmation

Restates impact and requires a typed phrase or equivalent deliberate verification. Step-up authentication may follow. It must not rely on a vague `Are you sure?` prompt.

### Destructive confirmation

Separates the danger action spatially, states what will be lost, identifies reversibility and collects a reason when required.

### Unsaved changes

Offers Save draft, Discard changes and Continue editing. Default focus favors preserving work.

## Failure and recovery

A failure message contains:

- what did not happen;
- a safe cause or limitation;
- whether any partial effect exists;
- recovery actions;
- incident or audit link when available;
- preserved proposal data for editing or retry.

If execution status is unknown, render `Confirmation pending` or `Outcome unknown`, begin reconciliation and prohibit retry until the idempotency state is safe.

## Feedback semantics

| Feedback | Use |
| --- | --- |
| Field error | Specific validation problem adjacent to its field |
| Inline message | Local state or explanation inside the working context |
| Banner | Page-level limitation, policy or incident |
| Toast | Brief acknowledgement that does not require immediate action |
| Persistent status region | Long-running, critical or unresolved command state |

`Submitted` means accepted for processing only. `Approved` means authorized only. `Receipt received` may announce confirmed success when the receipt validates.

Toasts do not steal focus and use an appropriate polite live region. Critical failures remain persistent. Undo appears only when the action is genuinely reversible and the undo window is contractually defined.

## Canonical receipt

Required receipt fields:

- outcome;
- receipt ID;
- command type;
- entity and record;
- actor;
- approver or approval chain;
- execution timestamp;
- canonical source;
- idempotency key;
- record deep link;
- audit-trail deep link.

Receipt controls may copy the receipt ID, open the affected record or open the audit trail. Decorative seals are optional and never substitute for receipt fields.

## Audit timeline

Every row exposes actor, action, source, timestamp and reason or evidence reference. The timeline is append-only in presentation and must surface redaction, correction or superseding events without visually rewriting history.

## Responsive behavior

- Desktop favors medium modal or 400px drawer.
- Tablet favors overlay drawer.
- Mobile favors bottom sheet with safe-area padding and sticky action region.
- Content order remains scope → evidence → risk → decision → consequence.
- Touch targets are at least 44px and destructive actions are separated from safe actions.

## Accessibility

- Modal title and description are programmatically associated.
- Focus trap, initial focus and return focus are tested.
- Error submission focuses the first invalid field and exposes an error summary.
- Screen-reader copy distinguishes proposed, pending, approved, executing, confirmed and failed.
- Dynamic updates do not repeatedly announce unchanged state.
- Countdown or expiration information is available as text and does not update excessively.
- No essential action depends on hover, gesture or animation.

## Acceptance checklist

- No path shows success before a valid canonical receipt.
- Retry and cancellation respect idempotency and backend safety.
- Search and overlays leak no unauthorized labels or snippets.
- High-risk actions show scope, impact, policy and approval requirement.
- Failure states explain recovery and preserve safe user work.
- Focus always returns after an overlay closes.
- Mobile actions remain reachable above safe areas.
- Decorative layers can be disabled without semantic or interaction loss.

