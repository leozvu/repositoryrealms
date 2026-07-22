# Phase 4 — Cross-surface Raven Inbox

Phase 4 nối notification, chat và lời mời cộng tác giữa ERP thuần với Realm bằng audience-scoped wake-up event. Notification API và database ERP vẫn là nguồn sự thật duy nhất.

## Kết quả

- Cross-surface contracts: **12/12**
- Deterministic scenarios: **4/4**
- Additive database migration: **1**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| audience-schema | database | prisma/schema.prisma | verified |
| additive-audience-migration | database | prisma/migrations/20260718193000_add_realm_change_audience/migration.sql | verified |
| session-audience-filter | server | lib/realm-change-feed.js | verified |
| payload-free-audience-feed | server | lib/realm-change-feed.js | verified |
| notification-create-wakeup | server | lib/events.js | verified |
| notification-read-wakeup | api | app/api/notifications/route.js | verified |
| collaboration-target-wakeup | server | lib/collaboration-admin.js | verified |
| message-recipient-wakeup | api | app/api/chat/[id]/route.js | verified |
| erp-live-counters | client | components/Shell.jsx | verified |
| realm-raven-inbox | client | components/realm/RealmNotificationBell.jsx | verified |
| single-browser-event | client | components/realm/useRealmChangeFeed.js | verified |
| instant-contact-refresh | client | components/collaboration/CollaborationBridge.jsx | verified |

## Privacy và vận hành

- Event dành riêng chỉ được query khi audienceUserId khớp session; event công ty vẫn dùng audience null.
- Feed chỉ trả domain tổng hợp, không trả audience, actor, notification text hoặc message content.
- ERP refresh badge/counter; Realm refresh Raven Inbox; cả hai đọc cùng /api/notifications.
- Contact banner được đánh thức ngay bởi browser event, còn polling 5/15 giây giữ vai trò fallback.
- Đánh dấu đã đọc phát wake-up targeted để các tab và hai giao diện hội tụ cùng trạng thái.

## Regression gate

Chạy `npm run audit:realm:cross-surface:check`. Gate thất bại nếu audience filter, notification publisher, ERP counters, Raven Inbox hoặc contact refresh mất evidence.

