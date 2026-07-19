# Phase 14 — Controlled Pilot Launch

Phase 14 biến thay đổi Realm policy thành quy trình dry-run có chữ ký trước khi apply. ERP/CRM vẫn là source of truth; không có migration hoặc bảng launch song song.

## Kết quả

- Security/operations contracts: **19/19**
- Deterministic launch scenarios: **6/6**
- Preview TTL: **10 phút**
- Additive migration: **0**
- Parallel business table: **0**
- Aggregate-only impact: **true**
- Roster included in preview: **false**
- Performance tracking: **false**
- Duration tracking: **false**
- Kill switch requires preview: **false**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| hmac-signed-short-lived-preview | security | lib/realm-launch-token.js | verified |
| actor-version-draft-binding | security | lib/realm-launch-token.js | verified |
| risk-classification | server | lib/realm-launch-token.js | verified |
| expansion-readiness-gate | server | lib/realm-launch-token.js | verified |
| director-only-preview | server | lib/realm-launch.js | verified |
| read-only-live-dry-run | server | lib/realm-launch.js | verified |
| aggregate-impact-no-roster | privacy | lib/realm-launch.js | verified |
| active-member-revalidation | server | lib/realm-launch.js | verified |
| preview-api-private-response | api | app/api/realm-demo/launch/route.js | verified |
| transactional-preview-verification | server | lib/realm-pilot.js | verified |
| apply-time-readiness-recheck | server | lib/realm-launch.js | verified |
| api-enforces-preview | api | app/api/realm-demo/pilot/route.js | verified |
| kill-switch-unconditional | safety | lib/realm-pilot.js | verified |
| aggregate-audit-evidence | audit | lib/realm-pilot.js | verified |
| progressive-dry-run-ui | client | components/realm/RealmPilotControl.jsx | verified |
| draft-change-invalidates-preview | client | components/realm/RealmPilotControl.jsx | verified |
| accessible-responsive-launch-control | style | components/realm/realm-pilot-control.module.css | verified |
| operations-runbook | operations | docs/realms/PHASE-14-CONTROLLED-LAUNCH-RUNBOOK.md | verified |
| authenticated-launch-uat | test | tests/e2e/realm-smoke.spec.mjs | verified |

## Nguyên tắc vận hành

- Mọi thay đổi policy đang mở Realm phải preview trên dữ liệu hiện tại trước khi apply.
- Preview bị khóa theo Director, policy version, digest bản nháp và thời hạn 10 phút.
- Expansion chỉ apply khi preflight không còn blocking gate; restriction vẫn khả dụng để giảm blast radius.
- Kill switch luôn apply trực tiếp và chỉ chuyển người dùng về ERP; không đảo migration.
- Preview và audit chỉ giữ số đếm tổng hợp, không sao chép roster hay dữ liệu hiệu suất.

## Regression gate

Chạy `npm run audit:realm:launch:check`.
