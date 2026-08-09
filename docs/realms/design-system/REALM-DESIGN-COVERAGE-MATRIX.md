# Realm Design Coverage Matrix

Status: **Design complete / Phase 1–8 product compositions complete for all 18 registered areas** on `codex/realm-design-system-v2-implementation`. Realm v2 remains a presentation layer over canonical ERP/Realm workflows.

| # | Product area | Visual board | Design | Implementation | Canonical data | Visual score | Responsive score | Preview entry → canonical route |
| --- | --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | Realm Home | `06-realm-home-my-work-v1.png` | Complete | Phase 1 product composition | Yes | 50% | 40% | `/realm-v2/home` (direct) |
| 2 | My Work | `06-realm-home-my-work-v1.png` | Complete | Phase 1 product composition | Yes | 45% | 38% | `/realm-v2/my-work` (direct) |
| 3 | Work Management | `07-work-management-action-center-v1.png` | Complete | Phase 2 product composition | Yes | 40% | 32% | `/realm-v2/work-management` (direct) |
| 4 | Action Center | `07-work-management-action-center-v1.png` | Complete | Phase 2 product composition | Yes | 55% | 45% | `/realm-v2/action-center` (direct) |
| 5 | Command Center | `08-command-center-approvals-v1.png` | Complete | Phase 3 product composition | Yes; CEO gateway | 45% | 35% | `/realm-v2/command-center` (direct) |
| 6 | Unified Inbox | `09-unified-inbox-collaboration-v1.png` | Complete | Phase 4 product composition | Yes; ERP Conversation + Notification | 45% | 38% | `/realm-v2/inbox` (direct) |
| 7 | Project Realm | `10-project-realm-chronicle-v1.png` | Complete | Phase 5 product composition | Yes; Project + Execution Health | 40% | 32% | `/realm-v2/projects` (direct) |
| 8 | Chronicle | `10-project-realm-chronicle-v1.png` | Complete | Phase 5 product composition | Yes; Director ERP AuditLog read | 25% | 20% | `/realm-v2/chronicle` (direct) |
| 9 | Collaboration / Presence | `09-unified-inbox-collaboration-v1.png` | Complete | Phase 4 product composition | Yes; voluntary TTL presence + canonical contacts | 30% | 25% | `/realm-v2/collaboration` (direct) |
| 10 | World Map | `11-world-map-ceo-terminal-v1.png` | Complete | Phase 6 product composition | Yes; federation + validated dashboard cache | 65% | 55% | `/realm-v2/world-map` (direct) |
| 11 | CEO Terminal | `11-world-map-ceo-terminal-v1.png` | Complete | Phase 6 product composition | Yes; CEO dashboard + authorized ledgers | 55% | 40% | `/realm-v2/ceo-terminal` (direct) |
| 12 | Employee Profile | `12-employee-profile-recognition-v1.png` | Complete | Phase 7 product composition | Yes; self-scoped User + work context | 35% | 28% | `/realm-v2/employee-profile` (direct) |
| 13 | Recognition / Gold Ledger | `12-employee-profile-recognition-v1.png` | Complete | Phase 7 product composition | Yes; self-scoped append-only Gold ledger | 55% | 45% | `/realm-v2/recognition` (direct) |
| 14 | Approvals | `08-command-center-approvals-v1.png` | Complete | Phase 3 product composition | Yes; canonical read, ERP decision | 60% | 50% | `/realm-v2/approvals` (direct) |
| 15 | Notifications | `13-settings-search-notifications-v1.png` | Complete | Phase 8 product composition | Yes; self-scoped Notification read state | 45% | 35% | `/realm-v2/notifications` (direct) |
| 16 | Search / Command Palette | `13-settings-search-notifications-v1.png` | Complete | Phase 8 product composition | Yes; authorized ERP data APIs | 45% | 35% | `/realm-v2/search` (direct) |
| 17 | Settings | `13-settings-search-notifications-v1.png` | Complete | Phase 8 product composition | Yes; audited workspace preference + ERP governance gateway | 50% | 45% | `/realm-v2/settings` (direct) |
| 18 | Mobile Realm | `14-mobile-realm-v1.png` | Complete | Phase 8 product composition | Yes; self-scoped User, Task and Notification | 35% | 25% | `/realm-v2/mobile` (direct) |

## Foundation coverage

| Layer | Visual board | Written contract |
| --- | --- | --- |
| Foundations and primitives | `01-foundations-primitives-v1.png` | Inventory token contract |
| Shell and navigation | `02-application-shell-navigation-v1.png` | `DS-02-APPLICATION-SHELL-NAVIGATION.md` |
| Data and work objects | `03-data-display-work-objects-v1.png` | `DS-03-DATA-DISPLAY-WORK-OBJECTS.md` |
| Overlays and command safety | `04-overlays-feedback-command-safety-v1.png` | `DS-04-OVERLAYS-FEEDBACK-COMMAND-SAFETY.md` |
| Operational templates | `05-operational-patterns-templates-v1.png` | `DS-05-OPERATIONAL-PATTERNS-TEMPLATES.md` |

## Coverage definition

`Complete` in the Design column means the area has a high-fidelity desktop or mobile board, responsive treatment, resilience/access examples, product intent, required data, action boundary and safety/receipt contract. It does **not** mean the authenticated application matches that board.

`Partial` in the Implementation column means the canonical ERP/Realm workflow and Realm v2 token skin exist, while the approved screen composition is still incomplete. `Canonical data` confirms that the entry uses the existing authorization, business rules, records and receipts; it is not a visual-fidelity score.

The visual and responsive figures are the historical Phase 0 baseline; they have not been inflated by the Phase 1–8 implementation. The full weighted scorecard, 90-screen evidence and defect severity are maintained in `qa/realm-v2-visual-baseline/`. Phase evidence is maintained separately in `qa/realm-v2-phase-1/` through `qa/realm-v2-phase-8/`.

All 18 `/realm-v2/<area>` entries listed as direct in the matrix are authenticated Realm product compositions behind `REALM_V2_PREVIEW=true`. No entry creates parallel records or bypasses canonical actions. Only `/realm-v2/design-system` and the development QA routes use deterministic, explicitly non-canonical fixtures. `/realm-v2/phase-1-qa` through `/realm-v2/phase-8-qa` return 404 in production. Vietnamese remains the default language and English remains opt-in through the existing language switch.
