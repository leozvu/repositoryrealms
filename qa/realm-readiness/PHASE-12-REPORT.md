# Phase 12 — Pilot Launch Readiness

Phase 12 đóng gói Realm thành một pilot có thể phát hành và rollback an toàn trên cùng ERP/CRM. Không có bảng nghiệp vụ hoặc migration mới; feature flags và policy version nằm trong Setting hiện hữu.

## Kết quả

- Release/security contracts: **19/19**
- Deterministic launch scenarios: **5/5**
- Additive migration: **0**
- Parallel business table: **0**
- Aggregate-only telemetry: **true**
- Performance tracking: **false**
- Duration tracking: **false**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| setting-policy-feature-flags | server | lib/realm-pilot.js | verified |
| policy-optimistic-concurrency | server | lib/realm-pilot.js | verified |
| office-kill-switch-fallback | server | lib/realm-pilot.js | verified |
| aggregate-release-evaluation | server | lib/realm-readiness.js | verified |
| rollback-without-data-reversal | server | lib/realm-readiness.js | verified |
| director-readiness-api | api | app/api/realm-demo/readiness/route.js | verified |
| shared-schema-inspection | health | lib/realm-health.js | verified |
| device-local-onboarding | client | components/realm/RealmPilotOnboarding.jsx | verified |
| onboarding-reopen-and-reset | client | components/realm/RealmPilotOnboarding.jsx | verified |
| onboarding-privacy-copy | client | components/realm/RealmPilotOnboarding.jsx | verified |
| accessible-responsive-onboarding | style | components/realm/realm-pilot-onboarding.module.css | verified |
| release-control-surface | client | components/realm/RealmPilotControl.jsx | verified |
| guild-support-server-flag | api | app/api/realm-demo/feedback/route.js | verified |
| tavern-server-flag | api | app/api/realm-demo/treasury/route.js | verified |
| tavern-client-flag | client | components/realm/RealmOffice.jsx | verified |
| shell-feature-enforcement | client | components/Shell.jsx | verified |
| product-route-passes-feature-contract | server | app/(app)/realm/page.jsx | verified |
| release-rollback-runbook | operations | docs/realms/PHASE-12-PILOT-RUNBOOK.md | verified |
| authenticated-onboarding-uat | test | tests/e2e/realm-smoke.spec.mjs | verified |

## Nguyên tắc phát hành

- Cohort nhỏ theo nhân sự hoặc vai trò, ERP là giao diện mặc định và /dashboard là đường fallback.
- Office, Tavern và Guild Support có feature flag độc lập; server vẫn enforce dù client ẩn nút.
- Onboarding được lưu trên thiết bị, có thể bỏ qua/mở lại/reset và không gửi tiến độ lên server.
- Readiness chỉ trả số đếm tổng hợp; không trả user ID, tên, hiệu suất hoặc thời lượng.
- Rollback pilot chỉ tắt policy; không đảo migration và không restore dữ liệu ERP.

## Regression gate

Chạy `npm run audit:realm:readiness:check`.
