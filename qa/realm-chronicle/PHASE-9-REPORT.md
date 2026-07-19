# Phase 9 — Adventurer Chronicle

Phase 9 biến Sổ nhân vật thành hồ sơ trạng thái cá nhân tự phục vụ trên dữ liệu ERP gốc. Chronicle chỉ đọc dữ liệu của current user, không tạo leaderboard và không lưu bản sao nghiệp vụ.

## Kết quả

- Chronicle contracts: **15/15**
- Deterministic privacy scenarios: **8/8**
- Database migration: **0**
- Parallel business table: **0**
- Chronicle write endpoint: **0**

## Contract matrix

| Contract | Layer | Evidence | Status |
| --- | --- | --- | --- |
| erp-records-remain-source-of-truth | database | prisma/schema.prisma | verified |
| personal-surface-for-internal-users | access | lib/realm-access.js | verified |
| authenticated-feature-gated-read-api | api | app/api/realm-demo/chronicle/route.js | verified |
| self-scoped-business-queries | server | lib/realm-chronicle-admin.js | verified |
| sensitive-fields-never-selected | server | lib/realm-chronicle-admin.js | verified |
| privacy-and-no-ranking-contract | contract | lib/realm-chronicle.js | verified |
| allowlisted-personal-timeline | contract | lib/realm-chronicle.js | verified |
| exact-erp-deep-links | contract | lib/realm-chronicle.js | verified |
| realtime-personal-domains | sync | lib/realm-change-feed.js | verified |
| accessible-chronicle-ui | client | components/realm/AdventurerChronicle.jsx | verified |
| resilient-chronicle-ui | client | components/realm/AdventurerChronicle.jsx | verified |
| responsive-accessible-style | style | components/realm/adventurer-chronicle.module.css | verified |
| chronicle-integrated-without-replacement | client | components/realm/RealmOffice.jsx | verified |
| classic-personal-erp-routes-preserved | client | lib/realm-business-bridge.js | verified |
| no-chronicle-write-endpoint | api | app/api/realm-demo/chronicle/route.js | verified |

## Privacy và data model

- User, Task, Project, TimeLog, Leave, Attendance, Approval và RealmGoldEntry hiện hữu là nguồn sự thật duy nhất.
- Mọi query nghiệp vụ khóa theo current user; timeline chỉ trả allowlist trình bày.
- Không select salary, hourlyRate, review score, manager note, private note hoặc Approval payload.
- Giờ tự ghi và lịch cá nhân không dùng để xếp hạng; Chronicle không có API ghi.
- Mọi hành động mở đúng route ERP cổ điển; change-feed chỉ phát metadata invalidation.
- Không đổi schema, không chạm production và không thay thế các màn ERP nguyên bản.

## Regression gate

Chạy `npm run audit:realm:chronicle:check`.
