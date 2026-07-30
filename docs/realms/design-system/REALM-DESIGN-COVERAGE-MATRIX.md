# Realm Design Coverage Matrix

Status: complete for product design v1; Realm v2 implementation preview complete on `codex/realm-design-system-v2-implementation`

| # | Product area | Visual board | Contract section | Design | Preview route |
| --- | --- | --- | --- | --- | --- |
| 1 | Realm Home | `06-realm-home-my-work-v1.png` | Realm Home | Complete | `/realm-v2/home` |
| 2 | My Work | `06-realm-home-my-work-v1.png` | My Work | Complete | `/realm-v2/my-work` |
| 3 | Work Management | `07-work-management-action-center-v1.png` | Work Management | Complete | `/realm-v2/work-management` |
| 4 | Action Center | `07-work-management-action-center-v1.png` | Action Center | Complete | `/realm-v2/action-center` |
| 5 | Command Center | `08-command-center-approvals-v1.png` | Command Center | Complete | `/realm-v2/command-center` |
| 6 | Unified Inbox | `09-unified-inbox-collaboration-v1.png` | Unified Inbox | Complete | `/realm-v2/inbox` |
| 7 | Project Realm | `10-project-realm-chronicle-v1.png` | Project Realm | Complete | `/realm-v2/projects` |
| 8 | Chronicle | `10-project-realm-chronicle-v1.png` | Chronicle | Complete | `/realm-v2/chronicle` |
| 9 | Collaboration / Presence | `09-unified-inbox-collaboration-v1.png` | Collaboration and Presence | Complete | `/realm-v2/collaboration` |
| 10 | World Map | `11-world-map-ceo-terminal-v1.png` | World Map | Complete | `/realm-v2/world-map` |
| 11 | CEO Terminal | `11-world-map-ceo-terminal-v1.png` | CEO Terminal | Complete | `/realm-v2/ceo-terminal` |
| 12 | Employee Profile | `12-employee-profile-recognition-v1.png` | Employee Profile | Complete | `/realm-v2/employee-profile` |
| 13 | Recognition / Gold Ledger | `12-employee-profile-recognition-v1.png` | Recognition / Gold Ledger | Complete | `/realm-v2/recognition` |
| 14 | Approvals | `08-command-center-approvals-v1.png` | Approvals | Complete | `/realm-v2/approvals` |
| 15 | Notifications | `13-settings-search-notifications-v1.png` | Notifications | Complete | `/realm-v2/notifications` |
| 16 | Search / Command Palette | `13-settings-search-notifications-v1.png` | Search and Command Palette | Complete | `/realm-v2/search` |
| 17 | Settings | `13-settings-search-notifications-v1.png` | Settings | Complete | `/realm-v2/settings` |
| 18 | Mobile Realm | `14-mobile-realm-v1.png` | Mobile Realm | Complete | `/realm-v2/mobile` |

## Foundation coverage

| Layer | Visual board | Written contract |
| --- | --- | --- |
| Foundations and primitives | `01-foundations-primitives-v1.png` | Inventory token contract |
| Shell and navigation | `02-application-shell-navigation-v1.png` | `DS-02-APPLICATION-SHELL-NAVIGATION.md` |
| Data and work objects | `03-data-display-work-objects-v1.png` | `DS-03-DATA-DISPLAY-WORK-OBJECTS.md` |
| Overlays and command safety | `04-overlays-feedback-command-safety-v1.png` | `DS-04-OVERLAYS-FEEDBACK-COMMAND-SAFETY.md` |
| Operational templates | `05-operational-patterns-templates-v1.png` | `DS-05-OPERATIONAL-PATTERNS-TEMPLATES.md` |

## Coverage definition

`Complete` in the Design column means the area has a high-fidelity desktop or mobile board, responsive treatment, resilience/access examples, product intent, required data, action boundary and safety/receipt contract.

The preview routes are production-buildable React compositions behind `REALM_V2_PREVIEW=true`. They use deterministic, explicitly non-canonical fixtures and do not claim production service integration. Canonical adapter rollout remains a separately reviewed integration step.
