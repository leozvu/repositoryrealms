# Phase 7 — Unified Raven Inbox & record timelines

Phase 7 hợp nhất thông báo giữa ERP nguyên bản và Realms trên cùng bảng Notification, cùng read/unread state và cùng deep-link bản ghi. War Council và Diplomatic log chỉ là góc nhìn mới trên TaskComment/Activity ERP hiện hữu.

## Kết quả

- Unified inbox contracts: **15/15**
- Deterministic privacy/routing scenarios: **6/6**
- Database migration: **0**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| single-notification-source | database | prisma/schema.prisma | verified |
| private-inbox-query | api | app/api/notifications/route.js | verified |
| scoped-read-state | api | app/api/notifications/route.js | verified |
| safe-route-contract | contract | lib/notification-inbox.js | verified |
| exact-record-notifications | server | lib/events.js | verified |
| exact-approval-notifications | server | lib/approvals.js | verified |
| erp-inbox-shared-sync | client | components/Shell.jsx | verified |
| realm-inbox-shared-sync | client | components/realm/RealmNotificationBell.jsx | verified |
| approval-deep-link-consumer | client | app/(app)/approvals/page.jsx | verified |
| ticket-deep-link-consumer | client | app/(app)/tickets/page.jsx | verified |
| scoped-war-council-history | server | lib/realm-war-room-admin.js | verified |
| war-council-timeline-ui | client | components/realm/WarRoom.jsx | verified |
| scoped-diplomatic-history | server | lib/realm-embassy-admin.js | verified |
| diplomatic-timeline-ui | client | components/realm/RoyalEmbassy.jsx | verified |
| accessible-responsive-inbox | style | components/realm/realm-notification-bell.module.css | verified |

## Data and privacy model

- Không tạo inbox hoặc timeline riêng cho game: ERP vẫn là nguồn sự thật duy nhất.
- GET/PUT Notification luôn khóa theo currentUser; read/unread được phát qua change-feed tới đúng audience.
- Internal route được chuẩn hóa; Task, Lead, Ticket và Approval mở đúng record nếu người dùng còn quyền.
- War Room chỉ đọc comment của Task đã qua Guild scope; Embassy chỉ đọc Activity của Lead đã qua CRM scope.
- Diplomatic log không trả note, contact detail hoặc field ngoài allowlist.
- Không đổi schema, không chạm database production và không tạo dữ liệu nghiệp vụ song song.

## Regression gate

Chạy `npm run audit:realm:inbox:check`.
