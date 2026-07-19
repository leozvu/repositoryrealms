# Phase 6 — Dual-surface Action Center

Phase 6 nối cộng tác hằng ngày giữa giao diện Realms và ERP nguyên bản bằng hai thao tác additive: War Council note trên Task và Diplomatic follow-up trên Lead.

## Kết quả

- Action Center contracts: **17/17**
- Deterministic privacy/sync scenarios: **5/5**
- Additive database migration: **1**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| receipt-extension | database | prisma/schema.prisma | verified |
| additive-migration | database | prisma/migrations/20260718230000_extend_realm_action_receipts/migration.sql | verified |
| create-action-allowlist | contract | lib/realm-action-admin.js | verified |
| input-boundaries | contract | lib/realm-action-contract.js | verified |
| payload-free-receipt | server | lib/realm-action-admin.js | verified |
| task-comment-scope | server | lib/realm-action-admin.js | verified |
| lead-followup-scope | server | lib/realm-action-admin.js | verified |
| atomic-create-audit | server | lib/realm-action-admin.js | verified |
| safe-action-response | api | app/api/realm-demo/actions/route.js | verified |
| cross-surface-event | server | lib/realm-change-feed.js | verified |
| erp-notification | server | lib/events.js | verified |
| war-room-permission | server | lib/realm-war-room-admin.js | verified |
| embassy-permission | server | lib/realm-embassy-admin.js | verified |
| action-composer | client | components/realm/RealmCreateActionDialog.jsx | verified |
| war-room-entrypoint | client | components/realm/WarRoom.jsx | verified |
| embassy-entrypoint | client | components/realm/RoyalEmbassy.jsx | verified |
| schema-readiness-v6 | health | lib/realm-health.js | verified |

## Safety model

- ERP vẫn là nguồn sự thật: comment là TaskComment thật, follow-up là Activity CRM thật.
- Action allowlist, role/module và row scope được kiểm tra lại phía server; không có generic mutation.
- Receipt chỉ lưu hash SHA-256 và result ID; nội dung comment/title không bị sao chép sang receipt hoặc audit.
- Transaction ghi record + receipt + audit; event bus sau commit kích hoạt notification và change-feed cho cả hai giao diện.
- Assignment được hoãn có chủ ý để ERP tiếp tục quản lý workload và quyền PM/Lead.

## Regression gate

Chạy `npm run audit:realm:action-center:check`.

