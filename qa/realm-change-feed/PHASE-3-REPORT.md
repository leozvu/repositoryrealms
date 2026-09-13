# Phase 3 — Durable ERP → Realm change feed

Phase 3 thêm kênh invalidation gần thời gian thực dùng chung database staging. ERP vẫn là nguồn sự thật; feed không sao chép business payload.

## Kết quả

- Change-feed contracts: **12/12**
- Deterministic scenarios: **6/6**
- Additive database migration: **1**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| append-only-model | database | prisma/schema.prisma | verified |
| additive-migration | database | prisma/migrations/20260718170000_add_realm_change_feed/migration.sql | verified |
| erp-event-publisher | server | lib/events.js | verified |
| awaited-resource-events | api | app/api/data/[resource]/route.js | verified |
| atomic-resource-event-intent | server | lib/record-mutation.js | verified |
| durable-event-publisher | server | lib/events.js | verified |
| authenticated-cursor-api | api | app/api/realm-demo/changes/route.js | verified |
| payload-free-response | server | lib/realm-change-feed.js | verified |
| fail-soft-publisher | server | lib/realm-change-feed.js | verified |
| resilient-client-poll | client | components/realm/useRealmChangeFeed.js | verified |
| targeted-panel-invalidation | client | components/realm/RealmOffice.jsx | verified |
| schema-readiness | health | lib/realm-health.js | verified |

## Cơ chế đã khóa

- CRUD ERP ghi record + audit + outbox trong cùng transaction; worker phát metadata append-only và thử lại khi lỗi feed.
- Cursor có thứ tự theo thời gian và ID, giữ được backlog qua nhiều instance serverless.
- Response chỉ trả domain tổng hợp và số event, không trả entity ID, actor ID hay nội dung nghiệp vụ.
- Client dừng polling khi tab ẩn, tự nối lại khi focus/online và chỉ refresh panel liên quan.
- Health gate yêu cầu bảng RealmChangeEvent và migration receipt mới nhất.

## Regression gate

Chạy `npm run audit:realm:changes:check`. Gate thất bại nếu schema, publisher, cursor API, privacy boundary hoặc client invalidation mất evidence.

