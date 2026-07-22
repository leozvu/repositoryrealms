# Phase 18 — Canary Activation Guard

Phase 18 mở rộng Pilot Operations hiện hữu bằng checkpoint canary 90 phút; không tạo bảng, không tự mở rộng cohort và không thay thế ERP fallback.

## Kết quả

- Safety/operations contracts: **19/19**
- Deterministic activation scenarios: **6/6**
- Canary window: **90 phút**
- Additive migration: **0**
- Parallel business table: **0**
- Aggregate only: **true**
- Automatic cohort expansion: **false**
- Rollback always available: **true**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| reuse-pilot-wave-setting | data | lib/realm-pilot-operations.js | verified |
| ninety-minute-canary-window | domain | lib/realm-pilot-operations.js | verified |
| activation-starts-after-checker | rbac | lib/realm-pilot-operations.js | verified |
| aggregate-baseline-only | privacy | lib/realm-pilot-operations.js | verified |
| canary-policy-binding | safety | lib/realm-pilot-operations.js | verified |
| canary-live-readiness | safety | lib/realm-pilot-operations.js | verified |
| checkpoint-fails-closed | safety | lib/realm-pilot-operations.js | verified |
| clear-rechecks-live-state | concurrency | lib/realm-pilot-operations.js | verified |
| clear-does-not-expand-cohort | safety | lib/realm-pilot-operations.js | verified |
| rollback-reuses-kill-switch | rollback | lib/realm-pilot-operations.js | verified |
| canary-operational-alerts | operations | lib/realm-pilot-operations.js | verified |
| director-notifications | integration | lib/realm-pilot-operations.js | verified |
| serializable-cas | concurrency | lib/realm-pilot-operations.js | verified |
| existing-traced-api | api | app/api/realm-demo/pilot/operations/route.js | verified |
| activation-guard-ui | client | components/realm/RealmPilotOperations.jsx | verified |
| semantic-state-with-icon-text | accessibility | components/realm/RealmPilotOperations.jsx | verified |
| responsive-touch-safe-ui | style | components/realm/realm-pilot-operations.module.css | verified |
| phase18-unit-tests | test | tests/realm-pilot-operations.test.mjs | verified |
| phase18-runbook | operations | docs/realms/PHASE-18-CANARY-ACTIVATION.md | verified |

## Nguyên tắc vận hành

- Checker activation mở cửa sổ canary nhưng không tự xác nhận checkpoint.
- Policy drift, readiness blocker, blocked feedback hoặc mất ERP fallback đều fail-closed.
- Clear checkpoint giữ nguyên cohort hiện tại; mở rộng vẫn phải qua Controlled Launch mới.
- Rollback dùng kill switch mode=off và giữ nguyên record, ledger, Ticket cùng migration.
- Evidence chỉ là số tổng hợp, không đo hoạt động hay thời lượng cá nhân.

## Regression gate

Chạy `npm run audit:realm:pilot-activation:check`.
