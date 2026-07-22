# Phase 11 — Pilot Operations & Feedback Loop

Phase 11 biến phản hồi từ Realm và ERP thành Ticket ERP có SLA, audit, notification và hàng chờ xử lý. Không tạo bảng feedback song song và không biến phản hồi thành chỉ số đánh giá con người.

## Kết quả

- Feedback/security contracts: **18/18**
- Deterministic scenarios: **6/6**
- Additive migration: **1**
- Parallel feedback table: **0**
- Performance tracking: **false**
- Duration tracking: **false**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| erp-ticket-source-of-truth | database | prisma/schema.prisma | verified |
| additive-ticket-migration | database | prisma/migrations/20260719133000_add_realm_pilot_feedback/migration.sql | verified |
| authenticated-internal-api | api | app/api/realm-demo/feedback/route.js | verified |
| idempotent-serializable-create | server | lib/realm-feedback.js | verified |
| staff-own-scope | server | lib/realm-feedback.js | verified |
| manager-rbac | server | lib/realm-feedback.js | verified |
| optimistic-concurrency | server | lib/realm-feedback.js | verified |
| sla-and-status-workflow | server | lib/realm-feedback.js | verified |
| audit-log-append | server | lib/realm-feedback.js | verified |
| change-feed-and-notification | api | app/api/realm-demo/feedback/route.js | verified |
| declared-private-context | server | lib/realm-feedback.js | verified |
| cross-surface-launcher | client | components/realm/RealmFeedbackLauncher.jsx | verified |
| erp-safe-fallback | client | components/realm/RealmFeedbackLauncher.jsx | verified |
| pilot-operations-queue | client | components/realm/RealmFeedbackOperations.jsx | verified |
| accessible-responsive-launcher | style | components/realm/realm-feedback-launcher.module.css | verified |
| accessible-responsive-operations | style | components/realm/realm-feedback-operations.module.css | verified |
| shell-available-on-both-surfaces | client | components/Shell.jsx | verified |
| schema-readiness-v8 | health | lib/realm-health.js | verified |

## Luồng vận hành

- Nhân sự gửi phản hồi từ Realm hoặc ERP qua cùng launcher, biết trước context nào được đính kèm.
- POST idempotent tạo Ticket ERP; mức ảnh hưởng ánh xạ SLA 8/24/72 giờ.
- Nhân sự chỉ đọc phản hồi của mình qua feedback API; Director/HR/PM có queue xử lý.
- Cập nhật dùng optimistic concurrency, tạo AuditLog, phát change event và thông báo lại người gửi.
- Không thu form values, record content, browser history, keystrokes hoặc thời lượng làm việc.

## Regression gate

Chạy `npm run audit:realm:feedback:check`.
