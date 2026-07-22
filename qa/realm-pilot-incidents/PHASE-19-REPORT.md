# Phase 19 — Pilot Telemetry & Incident Timeline

Phase 19 thêm Incident Command vào Pilot Operations hiện hữu. State được giới hạn 40 incident, dùng taxonomy cố định và không tạo bảng nghiệp vụ song song.

## Kết quả

- Safety/operations contracts: **23/23**
- Deterministic incident scenarios: **7/7**
- Additive migration: **0**
- Parallel business table: **0**
- Aggregate only: **true**
- Automatic reactivation: **false**
- Critical rollback atomic: **true**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| reuse-pilot-operations-setting | data | lib/realm-pilot-operations.js | verified |
| bounded-incident-history | data | lib/realm-pilot-operations.js | verified |
| fixed-incident-taxonomy | privacy | lib/realm-pilot-operations.js | verified |
| critical-category-cannot-downgrade | safety | lib/realm-pilot-operations.js | verified |
| director-only-incident-command | rbac | lib/realm-pilot-operations.js | verified |
| critical-atomic-kill-switch | rollback | lib/realm-pilot-operations.js | verified |
| warning-holds-go-no-go | decision | lib/realm-pilot-operations.js | verified |
| critical-forces-no-go | decision | lib/realm-pilot-operations.js | verified |
| incident-lifecycle | domain | lib/realm-pilot-operations.js | verified |
| duplicate-incident-blocked | safety | lib/realm-pilot-operations.js | verified |
| resolution-rechecks-safe-state | safety | lib/realm-pilot-operations.js | verified |
| completion-blocked-by-incident | safety | lib/realm-pilot-operations.js | verified |
| serializable-cas | concurrency | lib/realm-pilot-operations.js | verified |
| aggregate-incident-snapshot | privacy | lib/realm-pilot-operations.js | verified |
| timeline-excludes-actor-history | privacy | lib/realm-pilot-operations.js | verified |
| director-and-cohort-notifications | integration | lib/realm-pilot-operations.js | verified |
| incident-alerts | operations | lib/realm-pilot-operations.js | verified |
| existing-traced-api | api | app/api/realm-demo/pilot/operations/route.js | verified |
| incident-command-ui | client | components/realm/RealmPilotOperations.jsx | verified |
| semantic-status-icon-text | accessibility | components/realm/RealmPilotOperations.jsx | verified |
| responsive-touch-safe-ui | style | components/realm/realm-pilot-operations.module.css | verified |
| phase19-unit-tests | test | tests/realm-pilot-operations.test.mjs | verified |
| phase19-runbook | operations | docs/realms/PHASE-19-INCIDENT-COMMAND.md | verified |

## Nguyên tắc vận hành

- Warning giữ wave active nhưng Go/No-go ở HOLD cho tới khi incident được khống chế.
- Critical ghi incident và bật kill switch mode=off trong cùng transaction.
- Incident phải qua open → monitoring → resolved; resolved không tự mở lại Realm.
- Timeline chỉ chứa mốc và số liệu tổng hợp, không actor history, roster hay thời lượng cá nhân.

## Regression gate

Chạy `npm run audit:realm:pilot-incidents:check`.
