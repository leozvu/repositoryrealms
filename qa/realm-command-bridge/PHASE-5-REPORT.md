# Phase 5 — Realm command bridge

Phase 5 đóng vòng Realm → ERP cho hai thao tác hẹp: chuyển trạng thái Quest trong War Room và chuyển stage Lead trong Royal Embassy. Database ERP vẫn là nguồn sự thật duy nhất.

## Kết quả

- Command/security contracts: **14/14**
- Deterministic transition scenarios: **5/5**
- Additive database migration: **1**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| receipt-schema | database | prisma/schema.prisma | verified |
| additive-receipt-migration | database | prisma/migrations/20260718210000_add_realm_action_receipts/migration.sql | verified |
| explicit-transition-allowlist | contract | lib/realm-action-contract.js | verified |
| erp-rbac-row-scope | server | lib/realm-action-admin.js | verified |
| optimistic-concurrency | server | lib/realm-action-admin.js | verified |
| idempotent-command-receipt | server | lib/realm-action-admin.js | verified |
| atomic-audit-receipt | server | lib/realm-action-admin.js | verified |
| event-bus-feedback-loop | api | app/api/realm-demo/actions/route.js | verified |
| surface-and-session-gate | api | app/api/realm-demo/actions/route.js | verified |
| safe-response-shape | api | app/api/realm-demo/actions/route.js | verified |
| explicit-user-confirmation | client | components/realm/RealmActionDialog.jsx | verified |
| war-room-command-ui | client | components/realm/WarRoom.jsx | verified |
| embassy-command-ui | client | components/realm/RoyalEmbassy.jsx | verified |
| schema-readiness-current | health | lib/realm-health.js | verified |

## Safety model

- Realm không có generic write: chỉ hai action type và transition graph được allowlist.
- Session ERP, module policy, role, row scope và dependency validation được kiểm tra lại phía server.
- expectedState + updateMany compare-and-swap chặn lost update; idempotency receipt chặn double-submit/retry.
- Update, receipt và AuditLog nằm cùng transaction; event bus chỉ chạy một lần sau commit để hai giao diện hội tụ.
- Response chỉ trả metadata action, không trả email, phone, note hoặc record payload.

## Regression gate

Chạy `npm run audit:realm:commands:check`. Gate thất bại nếu migration, scope/RBAC, concurrency, audit/event loop hoặc confirmation UI mất evidence.

