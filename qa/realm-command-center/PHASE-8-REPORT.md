# Phase 8 — Royal Command Center

Phase 8 bổ sung góc nhìn điều phối medieval cho Task ERP mà không tạo hệ thống nhiệm vụ song song. Phân công ghi trực tiếp Task, còn bàn giao đi qua Approval maker–checker hiện hữu.

## Kết quả

- Command Center contracts: **17/17**
- Deterministic governance scenarios: **7/7**
- Database migration: **0**
- Parallel business table: **0**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| erp-task-source-of-truth | database | prisma/schema.prisma | verified |
| command-surface-task-module | access | lib/realm-access.js | verified |
| authenticated-feature-gated-api | api | app/api/realm-demo/command-center/route.js | verified |
| scope-and-privacy-allowlist | server | lib/realm-command-center-admin.js | verified |
| workload-planning-not-ranking | contract | lib/realm-command-center.js | verified |
| assignment-rbac-and-team-scope | server | lib/realm-action-admin.js | verified |
| assignment-optimistic-concurrency | server | lib/realm-action-admin.js | verified |
| assignment-idempotency-and-audit | server | lib/realm-action-admin.js | verified |
| assignment-event-raven-bridge | api | app/api/realm-demo/actions/route.js | verified |
| handoff-owner-team-and-dedup | server | lib/realm-command-center-admin.js | verified |
| handoff-maker-checker | api | app/api/approvals/[id]/decide/route.js | verified |
| handoff-approval-claim-transaction | api | app/api/approvals/[id]/decide/route.js | verified |
| handoff-cas-team-and-event | server | lib/approvals.js | verified |
| realtime-task-and-approval-domains | sync | lib/realm-change-feed.js | verified |
| accessible-command-ui | client | components/realm/RoyalCommandCenter.jsx | verified |
| responsive-command-ui | style | components/realm/royal-command-center.module.css | verified |
| classic-erp-task-surface-preserved | client | app/(app)/tasks/page.jsx | verified |

## Governance và data model

- Task ERP là nguồn sự thật duy nhất; Classic ERP và Realm cùng đọc một bản ghi.
- PM/Guild Lead phân công trong scope; compare-and-swap, idempotency receipt, AuditLog và TaskEvent bảo vệ thao tác ghi.
- Nhân sự chỉ xin bàn giao Task đang phụ trách; người tạo không được tự duyệt.
- Workload là cảnh báo phân bổ 7 ngày từ giờ ước lượng, không phải bảng xếp hạng và không dùng Gold/presence.
- Raven, notification và Realm change-feed phát hiện thay đổi Task/Approval trên cả hai giao diện.
- Không đổi schema, không chạm production và không thay thế màn hình Task ERP nguyên bản.

## Regression gate

Chạy `npm run audit:realm:command-center:check`.
