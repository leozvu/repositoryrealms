# Phase 21 — ERP/Realm Business Invariant Parity

Parity được đo tại RepositoryRealms, không đo bằng số button giống nhau giữa hai giao diện.

- Contracts: **20/20**
- Deterministic scenarios: **7/7**
- Registered business actions: **18**
- Button parity required: **false**
- Business invariant parity required: **true**
- Additive migrations: **0**
- Parallel business tables: **0**

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| parity-is-business-invariants | product | docs/realms/PHASE-21-ERP-REALM-PARITY.md | verified |
| canonical-action-catalog | domain | lib/repository-realms.js | verified |
| presentation-independent-contract | domain | lib/repository-realms.js | verified |
| presentation-metadata-stripped | domain | lib/repository-realms.js | verified |
| repository-route-delegation | api | app/api/realm-demo/actions/route.js | verified |
| surface-is-availability-gate | api | app/api/realm-demo/actions/route.js | verified |
| canonical-task-authorization | authorization | lib/realm-action-admin.js | verified |
| canonical-lead-authorization | authorization | lib/realm-action-admin.js | verified |
| canonical-business-rules | rules | lib/realm-action-admin.js | verified |
| optimistic-concurrency | rules | lib/realm-action-admin.js | verified |
| idempotent-receipts | receipt | lib/realm-action-admin.js | verified |
| atomic-receipt-audit | audit | lib/realm-action-admin.js | verified |
| receipt-evidence-required | safety | lib/repository-realms.js | verified |
| safe-repository-response | api | lib/repository-realms.js | verified |
| suggested-action-ui | client | components/realm/RealmActionDialog.jsx | verified |
| distinct-create-action-ui | client | components/realm/RealmCreateActionDialog.jsx | verified |
| unregistered-intent-fails-closed | safety | lib/repository-realms.js | verified |
| no-parallel-business-store | data | lib/repository-realms.js | verified |
| phase21-domain-tests | test | tests/repository-realms.test.mjs | verified |
| phase21-runbook | operations | docs/realms/PHASE-21-ERP-REALM-PARITY.md | verified |

Regression gate: `npm run audit:realm:parity:check`.
