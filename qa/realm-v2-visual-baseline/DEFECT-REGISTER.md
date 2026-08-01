# Realm v2 Phase 0 Defect Register

Baseline status: open. This register compares the authenticated canonical product with the locked Realm v2 visual boards. It does not redefine ERP business behavior.

## Severity policy

- **P0:** security, data integrity, authorization or receipt failure; cannot continue safely.
- **P1:** a primary product area or responsive workflow materially misses the approved composition.
- **P2:** fidelity, consistency, accessibility or polish defect that does not block the canonical workflow.

## P0

No open P0 was found during the Phase 0 architecture review. Canonical ERP routes, authorization and receipts remain authoritative. Any future “success” state without a canonical receipt becomes P0 immediately.

## P1

| ID | Area | Defect | Evidence | Acceptance condition |
| --- | --- | --- | --- | --- |
| R2-P1-001 | All 18 areas | `/realm-v2/*` aliases redirect to canonical pages with a token skin; the approved board compositions are not implemented in the authenticated product. | Route contract plus 90-screen baseline | Each area renders its approved composition over canonical records and actions, without fixture data. |
| R2-P1-002 | Mobile Realm | Mobile is a stacked responsive ERP view, not the priority-first Realm composition with five persistent destinations. | 375px and 390px baselines | Home, My Work, Actions, Inbox and More are present; primary work appears before secondary metrics. |
| R2-P1-003 | Notifications | `/realm-v2/notifications` lands on Dashboard but does not open the canonical notification experience. | Alias/final-path evidence | Deep link opens the authorized notification center and preserves back navigation. |
| R2-P1-004 | Search / Command Palette | `/realm-v2/search` lands on Dashboard but does not open the canonical command palette. | Alias/final-path evidence | Deep link opens the authorized palette with source-aware results and keyboard focus. |
| R2-P1-005 | Chronicle / Recognition | Chronicle and recognition share the existing Realm route but do not expose the two approved information architectures. | Area scorecard and baselines | Both views are distinguishable, canonical and match their board contracts. |
| R2-P1-006 | Preview data surfaces | 50/90 baseline samples contain actionable runtime failures. Repeated endpoints include `/api/data/clients`, `/api/insights`, `/api/data/leads`, CEO identity/registry/dashboard and API-key reads. | Raw runtime evidence in `baseline-manifest.json` | Authenticated read surfaces return their intended 2xx/4xx authorization result with no unexpected 5xx/503 response. |
| R2-P1-007 | CEO Terminal responsive | CEO Terminal overflows horizontally by 143px at 768px and 156px at 1024px. | Tablet/laptop screenshots and overflow metric | Zero horizontal overflow at every locked width. |

## P2

| ID | Area | Defect | Evidence | Acceptance condition |
| --- | --- | --- | --- | --- |
| R2-P2-001 | Shell | Navigation, command bar, page orientation and responsive shell proportions differ materially from board 02. | Five-breakpoint baselines | Shell geometry, state and hierarchy are within the visual tolerance. |
| R2-P2-002 | Work objects | Legacy ERP cards/tables do not consistently use the approved task, project, approval, source and freshness anatomy. | Boards 03, 05–13 | Shared primitives replace one-off visual structures while workflows remain unchanged. |
| R2-P2-003 | Responsive | Tablet and mobile mostly collapse/stack desktop content instead of reprioritizing it. | 375/390/768 baselines | No horizontal overflow; secondary regions collapse intentionally; touch targets are at least 44px. |
| R2-P2-004 | Accessibility | Phase 0 has not yet proven contrast, focus order, enlarged text, reduced motion and overlay focus management across all 18 areas. | Baseline metadata and pending automated checks | WCAG AA checks pass with no P0/P1 accessibility defect. |
| R2-P2-005 | Localization | Vietnamese is preserved, but VI/EN clipping and text expansion are not yet verified for every target composition. | Current VI baseline only | VI and EN pass at all five breakpoints without clipping or hidden actions. |
| R2-P2-006 | Visual regression | Composite reference boards cannot yet be compared screen-for-screen without crop/mask definitions. | Reference lock | Each area has a stable reference crop and dynamic-data mask; diff is at most 5%. |

## Triage rule

Scores document the current gap; they do not waive a defect. A screen reaches the release gate only when its weighted score is at least 90, the aggregate is at least 95, and no P0/P1 accessibility or responsive issue remains.
