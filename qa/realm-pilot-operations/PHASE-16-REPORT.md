# Phase 16 — Pilot Operations

Phase 16 thêm lớp điều phối rollout wave trên Setting, Notification, AuditLog và kill switch ERP hiện hữu; không tạo database hay hệ thống nghiệp vụ song song.

## Kết quả

- Security/operations contracts: **22/22**
- Deterministic rollout scenarios: **6/6**
- Observation window: **7–14 ngày**
- Additive migration: **0**
- Parallel business table: **0**
- Roster included: **false**
- Self approval allowed: **false**
- Pause preserves ERP/Realm data: **true**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| reuse-erp-setting | data | lib/realm-pilot-operations.js | verified |
| bounded-wave-lifecycle | domain | lib/realm-pilot-operations.js | verified |
| director-only-operations | rbac | lib/realm-pilot-operations.js | verified |
| operations-cas-version | concurrency | lib/realm-pilot-operations.js | verified |
| single-open-wave | safety | lib/realm-pilot-operations.js | verified |
| policy-version-binding | safety | lib/realm-pilot-operations.js | verified |
| submit-live-readiness | safety | lib/realm-pilot-operations.js | verified |
| maker-checker-activation | rbac | lib/realm-pilot-operations.js | verified |
| activation-rechecks-readiness | safety | lib/realm-pilot-operations.js | verified |
| post-approval-invitations | integration | lib/realm-pilot-operations.js | verified |
| pause-uses-existing-kill-switch | rollback | lib/realm-pilot-operations.js | verified |
| complete-persists-aggregate-report | operations | lib/realm-pilot-operations.js | verified |
| seven-fourteen-day-gate | decision | lib/realm-pilot-operations.js | verified |
| aggregate-only-privacy | privacy | lib/realm-pilot-operations.js | verified |
| authenticated-traced-api | api | app/api/realm-demo/pilot/operations/route.js | verified |
| cross-surface-change-signal | integration | app/api/realm-demo/pilot/operations/route.js | verified |
| stale-settings-write-protection | data | app/api/settings/route.js | verified |
| operations-dashboard-ui | client | components/realm/RealmPilotOperations.jsx | verified |
| accessible-responsive-ui | style | components/realm/realm-pilot-operations.module.css | verified |
| mobile-erp-toolbar-containment | style | app/globals.css | verified |
| phase16-test-suite | test | tests/realm-pilot-operations.test.mjs | verified |
| phase16-runbook | operations | docs/realms/PHASE-16-PILOT-OPERATIONS.md | verified |

## Nguyên tắc vận hành

- Controlled Launch tiếp tục quản lý quyền vào cohort; Pilot Operations không bypass Phase 15.
- Wave chỉ kích hoạt sau khi một Director khác duyệt và server chạy lại live readiness.
- Invitation đi qua Notification ERP; người không dùng Realm vẫn thấy trạng thái liên quan.
- Pause/complete từ wave active dùng mode=off, giữ nguyên record, Gold ledger và migration.
- Go/No-go chỉ dùng số tổng hợp, không chấm điểm hay đo thời lượng cá nhân.

## Regression gate

Chạy `npm run audit:realm:pilot-operations:check`.
