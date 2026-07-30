# Realm Design System v2 — implementation inventory

## Safety boundary

- Implementation branch: `codex/realm-design-system-v2-implementation`
- Design base: `codex/realm-design-system-v2-spec` at `e161d7519a254aa7ebcffad671711e4b7c3c097c`
- Preview namespace: `/realm-v2/*`
- Runtime gate: available outside production; production requires `REALM_V2_PREVIEW=true`
- Data: deterministic preview fixtures marked `Non-canonical`
- Existing ERP, `/realm`, authentication, services and APIs are unchanged
- No production command, approval, receipt, database or integration is invoked

## Component inventory

| Layer | Files | Responsibility |
| --- | --- | --- |
| Contracts | `lib/realm-v2-contracts.js` | 18-area registry, route gate, resilience priority, command transitions and receipt gating |
| Tokens and layout | `components/realm-v2/realm-v2.module.css` | Semantic tokens, desktop/tablet/mobile shell, 8px rhythm, 44px targets, focus and reduced motion |
| Icon system | `components/realm-v2/Icon.jsx` | Consistent inline line-SVG language; no emoji structural icons |
| Primitives | `components/realm-v2/Primitives.jsx` | Buttons, badges, status, fields, toggles, segmented control, skeleton and resilience states |
| Work objects | `components/realm-v2/WorkObjects.jsx` | Metrics, tasks, approvals, messages, registry, workload, timeline, provenance and receipts |
| Safety overlays | `components/realm-v2/Overlays.jsx` | Focus-trapped modal, drawer, palette, toast, approval review and command lifecycle |
| Templates and areas | `components/realm-v2/Templates.jsx` | Nine operational templates and all 18 product area compositions |
| Shell | `components/realm-v2/RealmV2Shell.jsx` | Rail, top bar, workspace switcher, search, context drawer, mobile navigation and route focus |
| Visual QA | `components/realm-v2/DesignSystemGallery.jsx` | Inspectable primitives, state matrix, work objects, overlays and command safety |

## Operational templates

1. Focus Workspace
2. Registry / List
3. Board / Queue
4. Command Cockpit
5. Timeline / Chronicle
6. Map / Spatial with semantic registry alternative
7. Executive Brief
8. Settings / Form
9. Mobile Priority

## Interaction contracts

- Desktop rail supports expanded and 72px collapsed states.
- At tablet width the compact rail preserves icon labels through accessible names and titles.
- At 900px and below the fixed mobile navigation exposes exactly Home, My Work, Actions, Inbox and More.
- `Ctrl/Cmd+K` opens the permission-oriented search and command palette.
- Route changes move programmatic focus to the page heading and restore per-route scroll position.
- Modal focus is trapped, Escape closes, the background is inert by modality, and focus returns to the trigger.
- Tables have captions, semantic headers, keyboard sorting and mobile record-card alternatives.
- Map nodes have an equivalent accessible entity table.
- Loading, empty, stale, offline, error, permission-denied and redacted states are explicit.
- Command state is Draft → Proposed → Pending Approval → Approved → Executing → Confirmed/Failed.
- `Confirmed` cannot be produced by the contract without a canonical receipt ID.

## Validation commands

```powershell
node --test tests/realm-v2-design-system.test.mjs
$env:REALM_V2_PREVIEW='true'; npm run build
$env:REALM_V2_PREVIEW='true'; npx playwright test tests/e2e/realm-v2.spec.mjs
```

The full repository test suite should also be executed before review. The focused e2e test uses only local deterministic preview data.

## Deliberate limitations before canonical integration

- The preview shows typed fixtures instead of wiring to production RepositoryRealms adapters.
- Buttons that demonstrate navigation or presentation state do not mutate business records.
- Command lifecycle simulation proves UI/state invariants; canonical command gateway integration requires a separately reviewed adapter and authorization test plan.
- Translation coverage for the new v2 preview is English-first; existing Vietnamese ERP and Realm localization remain unchanged.
