# Phase 13 — Named Pilot Cohort & Launch Operations

Phase 13 cho phép Director mở Realm cho một danh sách nhân sự cụ thể thay vì buộc mở toàn bộ một vai trò. Policy vẫn nằm trong Setting ERP hiện hữu; không có migration hoặc bảng nghiệp vụ song song.

## Kết quả

- Security/operations contracts: **17/17**
- Deterministic cohort scenarios: **6/6**
- Additive migration: **0**
- Parallel business table: **0**
- Cohort hard limit: **50**
- Roster hidden from non-Directors: **true**
- Aggregate-only telemetry: **true**
- Performance tracking: **false**
- Duration tracking: **false**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| backward-compatible-cohort-policy | server | lib/realm-pilot.js | verified |
| named-member-server-enforcement | server | lib/realm-pilot.js | verified |
| active-internal-member-validation | server | lib/realm-pilot.js | verified |
| bounded-cohort-input | server | lib/realm-pilot.js | verified |
| director-only-minimal-directory | api | app/api/realm-demo/pilot/route.js | verified |
| non-director-member-redaction | api | app/api/realm-demo/pilot/route.js | verified |
| minimal-directory-fields | server | lib/realm-pilot.js | verified |
| serializable-versioned-policy | server | lib/realm-pilot.js | verified |
| audit-count-not-roster | server | lib/realm-pilot.js | verified |
| aggregate-only-adoption | server | lib/realm-pilot.js | verified |
| strategy-aware-readiness | server | lib/realm-readiness.js | verified |
| named-cohort-control | client | components/realm/RealmPilotControl.jsx | verified |
| accessible-responsive-picker | style | components/realm/realm-pilot-control.module.css | verified |
| erp-default-and-kill-switch | client | components/realm/RealmPilotControl.jsx | verified |
| kill-switch-bypasses-stale-roster | server | lib/realm-pilot.js | verified |
| operations-runbook | operations | docs/realms/PHASE-13-NAMED-COHORT-RUNBOOK.md | verified |
| authenticated-cohort-uat | test | tests/e2e/realm-smoke.spec.mjs | verified |

## Nguyên tắc vận hành

- Pilot thật nên dùng danh sách 3–8 nhân sự; cohort theo vai trò chỉ dành cho rollout rộng hơn đã được phê duyệt.
- Người ngoài cohort và freelancer luôn về ERP; người trong cohort vẫn có quyền chọn ERP.
- API chỉ trả roster cho Director và không trả preference, salary hay dữ liệu hiệu suất trong directory.
- Audit chỉ ghi chiến lược và số lượng thành viên, không sao chép roster vào detail.
- Phase này không tự bật policy trên staging hoặc production.

## Regression gate

Chạy `npm run audit:realm:cohort:check`.
