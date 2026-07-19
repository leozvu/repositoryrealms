# Phase 6 — Realm ↔ ERP sync integrity & recovery

Phase 6 giữ nguyên ERP làm nguồn sự thật, thêm validator cho snapshot và làm rõ trạng thái freshness ở client mà không cần đổi schema dữ liệu.

## Kết quả

- Sync/recovery contracts: **12/12**
- Deterministic scenarios: **6/6**
- Database migration: **0**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| snapshot-envelope | server | lib/realm-erp-adapter.js | verified |
| conditional-get | api | app/api/realm-demo/operations/route.js | verified |
| private-validator | api | lib/realm-sync.js | verified |
| post-revision | api | app/api/realm-demo/operations/route.js | verified |
| profile-version-api | api | app/api/realm-demo/operations/route.js | verified |
| profile-version-transaction | server | lib/realm-erp-adapter.js | verified |
| claim-idempotency | server | lib/realm-erp-adapter.js | verified |
| client-etag | client | components/realm/RealmOffice.jsx | verified |
| background-revalidation | client | components/realm/RealmOffice.jsx | verified |
| offline-preservation | client | components/realm/RealmOffice.jsx | verified |
| stale-retry-ui | client | components/realm/RealmOffice.jsx | verified |
| no-false-write-success | client | components/realm/RealmOffice.jsx | verified |

## Scenario matrix

| Scenario | Expected | Actual | Status |
| --- | --- | --- | --- |
| stable-revision | true | true | verified |
| changed-data-new-revision | true | true | verified |
| exact-etag-match | true | true | verified |
| weak-etag-match | true | true | verified |
| stale-etag-miss | false | false | verified |
| profile-version-roundtrip | 2026-07-18T09:00:00.000Z | 2026-07-18T09:00:00.000Z | verified |

## Cơ chế đã khóa

- Snapshot có revision SHA-256 ổn định, ETag riêng theo session và conditional GET 304.
- Client kiểm tra lại mỗi 60 giây, khi quay lại tab, focus cửa sổ và khi mạng online trở lại.
- Offline/lỗi không thay snapshot ERP bằng dữ liệu demo; UI ghi rõ dữ liệu có thể cũ và có nút retry.
- Write chỉ báo thành công sau HTTP success và snapshot mới; timeout ghi rõ chưa có thay đổi nào được xác nhận.
- Profile update mang version và chạy Serializable để chặn tab cũ ghi đè phiên mới. Claim Gold tiếp tục dùng idempotency key.

## Regression gate

Chạy `npm run audit:realm:sync:check`. Gate thất bại nếu ETag, recovery lifecycle, optimistic profile version hoặc trạng thái UI mất evidence.

