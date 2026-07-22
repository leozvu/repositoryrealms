# Phase 15 — Four-eyes Launch Approval

Phase 15 buộc mọi thay đổi mở rộng Realm phải qua maker–checker giữa hai Director khác nhau. Workflow tái sử dụng Approval và Setting ERP; không thêm migration hoặc bảng nghiệp vụ song song.

## Kết quả

- Security/operations contracts: **21/21**
- Deterministic approval scenarios: **6/6**
- Approval TTL: **24 giờ**
- Payload encrypted at rest: **true**
- Additive migration: **0**
- Parallel business table: **0**
- Roster included: **false**
- Self-approval allowed: **false**
- Kill switch requires approval: **false**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| reuse-erp-approval-model | data | lib/realm-launch-approval.js | verified |
| encrypted-policy-payload | security | lib/realm-launch-approval.js | verified |
| authenticated-ciphertext-verification | security | lib/realm-launch-approval.js | verified |
| director-only-maker-checker | rbac | lib/realm-launch-approval.js | verified |
| expansion-only-approval | server | lib/realm-launch-approval.js | verified |
| preview-reverified-before-request | server | lib/realm-launch-approval.js | verified |
| duplicate-pending-guard | server | lib/realm-launch-approval.js | verified |
| twenty-four-hour-expiry | safety | lib/realm-launch-approval.js | verified |
| policy-digest-binding | security | lib/realm-launch-approval.js | verified |
| approval-cas-claim | server | lib/realm-launch-approval.js | verified |
| live-readiness-before-claim | server | lib/realm-launch-approval.js | verified |
| atomic-approval-policy-audit | transaction | lib/realm-launch-approval.js | verified |
| aggregate-only-list-contract | privacy | lib/realm-launch-approval.js | verified |
| direct-expansion-bypass-blocked | api | app/api/realm-demo/pilot/route.js | verified |
| private-approval-api | api | app/api/realm-demo/launch/approvals/route.js | verified |
| cross-surface-notification | integration | app/api/realm-demo/launch/approvals/route.js | verified |
| erp-approval-inbox-delegation | integration | app/api/approvals/[id]/decide/route.js | verified |
| progressive-four-eyes-ui | client | components/realm/RealmPilotControl.jsx | verified |
| accessible-responsive-approval-ui | style | components/realm/realm-pilot-control.module.css | verified |
| phase15-test-suite | test | tests/realm-launch-approval.test.mjs | verified |
| operations-runbook | operations | docs/realms/PHASE-15-FOUR-EYES-LAUNCH-APPROVAL.md | verified |

## Nguyên tắc vận hành

- Maker chạy dry-run rồi gửi yêu cầu; policy thật chưa thay đổi.
- Checker phải là Director khác. Server kiểm tra lại version, digest, TTL và live readiness trước khi claim.
- Claim approval, ghi Setting và audit nằm trong cùng transaction Serializable.
- Restriction và kill switch vẫn đi đường nhanh để giảm blast radius.
- API/UI chỉ trả số liệu tổng hợp; policy chờ duyệt được mã hóa AES-256-GCM.

## Regression gate

Chạy `npm run audit:realm:launch-approval:check`.
