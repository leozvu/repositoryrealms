# Phase 8 — Dual-surface ERP/Realm collaboration bridge

Phase 8 cho phép nhân sự dùng ERP thuần và Realm song song trên cùng dữ liệu gốc. Realm không sở hữu bản sao CRM/ERP; mọi cuộc liên hệ đều đi vào Conversation, Message và Notification hiện hữu.

## Kết quả

- Collaboration API routes: **2/2**
- Identity/data/UX contracts: **15/15**
- Deterministic scenarios: **10/10**
- Additive Prisma models: **2**
- Database mutations executed by this audit: **0**

## Route coverage

| Route | Source | Status |
| --- | --- | --- |
| presence | app/api/collaboration/presence/route.js | verified |
| contact | app/api/collaboration/contact/route.js | verified |

## Contract matrix

| Contract | Evidence | Status |
| --- | --- | --- |
| additive-collaboration-schema | prisma/schema.prisma | verified |
| canonical-erp-chat-notification | lib/collaboration-admin.js | verified |
| authenticated-actor-boundary | lib/collaboration-admin.js | verified |
| presence-session-ownership | lib/collaboration-admin.js | verified |
| multi-session-user-merge | lib/collaboration.js | verified |
| contact-idempotency | lib/collaboration-admin.js | verified |
| dnd-and-rate-guard | lib/collaboration-admin.js | verified |
| contact-lifecycle-expiry | lib/collaboration-admin.js | verified |
| erp-global-bridge | components/Shell.jsx | verified |
| realm-to-erp-contact | components/realm/RealmOffice.jsx | verified |
| server-signed-realm-identity | scripts/realm-signal-server.mjs | verified |
| message-deep-link | app/(app)/messages/page.jsx | verified |
| policy-aware-surface-login | app/login/page.jsx | verified |
| fail-soft-directory | components/collaboration/useCollaborationDirectory.js | verified |
| private-no-store-response | lib/collaboration-response.js | verified |

## Kiến trúc dữ liệu

- ERP và Realm là hai giao diện cho cùng User và cùng dữ liệu CRM/ERP; không có cơ chế merge hai database.
- Presence lưu từng tab/thiết bị rồi hợp nhất theo userId. TTL đưa phiên mất kết nối về offline mà không cần thao tác tay.
- Contact request chỉ giữ lifecycle/idempotency. Nội dung bền vững được ghi vào Chat và Notification chuẩn nên người không mở Realm vẫn nhận được.
- Realm gateway gắn userId từ token đã ký; client không tự khai danh tính ERP.
- DND, chống double-submit, reuse cửa sổ 30 giây, rate limit và expiry 5 phút ngăn spam.

## Triển khai staging

Hai model additive phải được áp dụng vào **database staging cô lập** bằng quy trình provision/DBA review hiện có trước khi test đăng nhập. Audit này không chạy migration, không reset database và không chạm production.

## Regression gate

Chạy `npm run audit:collaboration:check`. Gate thất bại nếu mất auth boundary, canonical ERP persistence, identity binding, cross-surface UX hoặc artifact bị stale.

