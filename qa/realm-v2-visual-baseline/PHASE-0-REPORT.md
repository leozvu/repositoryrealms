# Realm v2 Phase 0 Baseline Report

Status: **Design complete / implementation partial**  
Source commit: `3be4588b7f6c684122abf73b5945706da550a4b5`  
Captured: 2026-07-30T02:04:42.557Z  
Target: https://crmegoric-realms-demo-leozvu-leozs-projects-64a5f0c8.vercel.app

## Exit evidence

- Locked references: **14/14** boards passed SHA-256 and 1536×1024 checks.
- Product areas: **18/18** configured.
- Baseline screenshots: **90/90** at 375/390/768/1024/1440.
- Initial weighted score: **47.5%**; release target is at least 95%.
- Horizontal-overflow samples: **2/90**.
- Samples with actionable runtime issues: **50/90**.
- Preview-toolbar CSP noise: **90/90** samples; retained in raw evidence but excluded from app defect counts.
- Five-item mobile navigation present: **0/36** phone samples.
- Document language: **vi**.
- Canonical business routes remain authoritative; the capture performs no write action.

## Server error evidence

| Response | Samples |
| --- | ---: |
| `500:/api/data/clients` | 25 |
| `500:/api/data/leads` | 20 |
| `500:/api/insights` | 17 |
| `503:/api/ceo/v1/identity/session` | 9 |
| `503:/api/ceo/v1/registry` | 5 |
| `500:/api/ceo/v1/directory/profile` | 5 |
| `503:/api/ceo/v1/dashboard` | 5 |
| `500:/api/apikeys` | 3 |

## Area scorecard

| # | Product area | Implementation | Canonical data | Visual | Responsive | Weighted |
| --- | --- | --- | --- | ---: | ---: | ---: |
| 1 | Realm Home | Partial — canonical workflow with Realm v2 token skin | Yes — canonical ERP route | 50% | 40% | 51% |
| 2 | My Work | Partial — canonical workflow with Realm v2 token skin | Yes — canonical ERP route | 45% | 38% | 47.4% |
| 3 | Work Management | Partial — canonical workflow with Realm v2 token skin | Yes — canonical ERP route | 40% | 32% | 42.9% |
| 4 | Action Center | Partial — canonical workflow with Realm v2 token skin | Yes — canonical authorization and receipts | 55% | 45% | 55.8% |
| 5 | Command Center | Partial — canonical workflow with Realm v2 token skin | Yes — canonical command gateway | 45% | 35% | 47.9% |
| 6 | Unified Inbox | Partial — canonical workflow with Realm v2 token skin | Yes — canonical messaging route | 45% | 38% | 46.3% |
| 7 | Project Realm | Partial — canonical workflow with Realm v2 token skin | Yes — canonical project route | 40% | 32% | 42.4% |
| 8 | Chronicle | Partial — existing Realm ledger, reference composition absent | Yes — canonical Realm journal | 25% | 20% | 31.8% |
| 9 | Collaboration / Presence | Partial — canonical workflow with Realm v2 token skin | Yes — canonical collaboration route | 30% | 25% | 35.9% |
| 10 | World Map | Partial — canonical federation map with legacy composition | Yes — canonical entity federation | 65% | 55% | 62.9% |
| 11 | CEO Terminal | Partial — canonical workflow with Realm v2 token skin | Yes — canonical CEO aggregation | 55% | 40% | 53.3% |
| 12 | Employee Profile | Partial — canonical workflow with Realm v2 token skin | Yes — canonical staff route | 35% | 28% | 39.3% |
| 13 | Recognition / Gold Ledger | Partial — canonical Realm ledger, reference composition absent | Yes — canonical Gold journal | 55% | 45% | 55.5% |
| 14 | Approvals | Partial — canonical workflow with Realm v2 token skin | Yes — canonical authorization and receipts | 60% | 50% | 60.2% |
| 15 | Notifications | Partial — canonical dashboard opens, notification overlay is not deep-linked | Yes — scenario entry incomplete | 45% | 35% | 45.6% |
| 16 | Search / Command Palette | Partial — canonical dashboard opens, command palette is not deep-linked | Yes — scenario entry incomplete | 45% | 35% | 47.1% |
| 17 | Settings | Partial — canonical workflow with Realm v2 token skin | Yes — canonical settings route | 50% | 45% | 51.8% |
| 18 | Mobile Realm | Partial — responsive ERP dashboard, priority-first Realm shell absent | Yes — canonical dashboard route | 35% | 25% | 38.1% |

## Interpretation

The score is an implementation baseline, not design approval. The approved visual boards are locked, while the authenticated product currently preserves canonical ERP workflows and applies only a partial Realm v2 presentation. The next implementation phases must raise each area to at least 90 and the aggregate to at least 95 without replacing ERP routes, RBAC, business rules or receipts.

See [DEFECT-REGISTER.md](./DEFECT-REGISTER.md) for P0/P1/P2 remediation order.
