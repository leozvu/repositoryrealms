# Phase 17 — Launch Rehearsal & Sealed Evidence

Phase 17 thêm rehearsal bắt buộc trước Pilot Operations, tái sử dụng Setting, Notification và AuditLog của ERP; không tạo data store nghiệp vụ song song.

## Kết quả

- Security/operations contracts: **23/23**
- Deterministic rehearsal scenarios: **6/6**
- Sealed evidence TTL: **24 giờ**
- Additive migration: **0**
- Parallel business table: **0**
- Roster included: **false**
- Self approval allowed: **false**
- Wave requires sealed rehearsal: **true**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| reuse-erp-setting | data | lib/realm-pilot-rehearsal.js | verified |
| no-parallel-business-store | data | lib/realm-pilot-rehearsal.js | verified |
| director-only-rehearsal | rbac | lib/realm-pilot-rehearsal.js | verified |
| serializable-cas | concurrency | lib/realm-pilot-rehearsal.js | verified |
| fixed-operational-scenarios | domain | lib/realm-pilot-rehearsal.js | verified |
| bounded-evidence | privacy | lib/realm-pilot-rehearsal.js | verified |
| policy-version-binding | safety | lib/realm-pilot-rehearsal.js | verified |
| submit-live-readiness | safety | lib/realm-pilot-rehearsal.js | verified |
| independent-checker-required | rbac | lib/realm-pilot-rehearsal.js | verified |
| approval-rechecks-live-controls | safety | lib/realm-pilot-rehearsal.js | verified |
| twenty-four-hour-seal | safety | lib/realm-pilot-rehearsal.js | verified |
| wave-submit-needs-seal | integration | lib/realm-pilot-operations.js | verified |
| wave-activation-rechecks-seal | integration | lib/realm-pilot-operations.js | verified |
| erp-notification-handoff | integration | lib/realm-pilot-rehearsal.js | verified |
| actionable-remediation | operations | lib/realm-pilot-rehearsal.js | verified |
| aggregate-privacy-contract | privacy | lib/realm-pilot-rehearsal.js | verified |
| authenticated-traced-api | api | app/api/realm-demo/pilot/rehearsal/route.js | verified |
| cross-surface-change-signal | api | app/api/realm-demo/pilot/rehearsal/route.js | verified |
| stale-settings-write-protection | data | app/api/settings/route.js | verified |
| accessible-rehearsal-ui | client | components/realm/RealmPilotRehearsal.jsx | verified |
| responsive-reduced-motion-ui | style | components/realm/realm-pilot-rehearsal.module.css | verified |
| phase17-test-suite | test | tests/realm-pilot-rehearsal.test.mjs | verified |
| phase17-runbook | operations | docs/realms/PHASE-17-LAUNCH-REHEARSAL.md | verified |

## Nguyên tắc vận hành

- Controlled Launch phải đưa policy về pilot; remediation chỉ hướng dẫn, không tự đổi policy.
- Maker ghi evidence vận hành; Director khác recheck live readiness và niêm phong 24 giờ.
- Pilot wave chỉ submit/activate khi cùng sealed rehearsal còn hiệu lực.
- Evidence không chứa roster, nội dung record, thời lượng hay điểm hiệu suất cá nhân.
- ERP vẫn là fallback và kill switch không xóa record, ledger, Ticket hoặc migration.

## Regression gate

Chạy `npm run audit:realm:pilot-rehearsal:check`.
