# Phase 10 — Realm Pilot & Adoption Control

Phase 10 đưa Realm vào rollout có kiểm soát mà không thay thế ERP/CRM nguyên bản. Một cột preference nhẹ được gắn vào User hiện hữu; policy nằm trong Setting hiện hữu; không có database nghiệp vụ thứ hai.

## Kết quả

- Pilot/security contracts: **17/17**
- Deterministic rollout scenarios: **7/7**
- Additive migration: **1**
- Parallel business table: **0**
- Performance tracking: **false**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| additive-user-preference | database | prisma/schema.prisma | verified |
| preference-only-migration | database | prisma/migrations/20260719110000_add_realm_pilot_preference/migration.sql | verified |
| single-setting-policy | server | lib/realm-pilot.js | verified |
| generic-settings-preserve-policy | server | app/api/settings/route.js | verified |
| kill-switch-and-cohort | contract | lib/realm-pilot.js | verified |
| explicit-user-opt-out | contract | lib/realm-pilot.js | verified |
| server-route-enforcement | server | app/(app)/realm/page.jsx | verified |
| authenticated-policy-api | api | app/api/realm-demo/pilot/route.js | verified |
| director-policy-write | server | lib/realm-pilot.js | verified |
| aggregate-private-metrics | server | lib/realm-pilot.js | verified |
| policy-aware-login | client | app/login/LoginForm.jsx | verified |
| cross-surface-preference | client | lib/collaboration.js | verified |
| both-surfaces-persist-choice | client | components/realm/RealmOffice.jsx | verified |
| pilot-admin-control | client | components/realm/RealmPilotControl.jsx | verified |
| accessible-responsive-control | style | components/realm/realm-pilot-control.module.css | verified |
| classic-erp-always-reachable | client | components/collaboration/CollaborationBridge.jsx | verified |
| schema-readiness-v8 | health | lib/realm-health.js | verified |

## Rollout và quyền riêng tư

- Giám đốc có kill switch, cohort theo nhân sự hoặc vai trò và chế độ mở cho toàn bộ nhân sự nội bộ.
- Mỗi nhân sự có lựa chọn auto/ERP/Realm; ERP luôn là fallback và luôn có thể quay lại.
- /realm được enforce phía server; giấu menu không phải là lớp bảo mật duy nhất.
- Adoption chỉ đếm preference và presence hết hạn sau 90 giây ở mức tổng hợp. Không ghi thời lượng hoặc hiệu suất cá nhân.
- Tất cả module, phân quyền và record nghiệp vụ tiếp tục dùng database ERP duy nhất.

## Regression gate

Chạy `npm run audit:realm:pilot:check`.
