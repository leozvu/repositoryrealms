# Deployment Manifest — Leoz Group ERP/CRM + CEO Terminal

Cập nhật: 2026-07-26 · Baseline canonical: `main @ 64ef8c7` (PR #5 — v3.42 cổng nhận lead, CI xanh: migration-chain + verify) · Người lập: Claude

> **Đính chính kiểm chứng 2026-07-28:** bốn deployment production và các rollback target bên dưới vẫn `READY`, nhưng thư mục `backups/20260726-180503/` được ghi trong manifest không có trong workspace hiện tại. Vì chưa thể kiểm checksum hoặc restore cô lập, cột “Backup gần nhất” bên dưới chỉ là lịch sử được ghi nhận ngày 26/7, **không phải bằng chứng backup đã được xác minh**. Không thực hiện release có thay đổi schema cho tới khi tạo backup mới và restore-test thành công. Hồ sơ kiểm chứng: `docs/MILESTONE-1-STABILITY-2026-07-28.md`.

## Bảng entity

| Entity | Vercel project | Domain | Commit | Postgres schema | Migration level | Modules bật | Backup gần nhất | Rollback target |
|---|---|---|---|---|---|---|---|---|
| Egoric Agency | `erp-egoric` | erp-egoric.vercel.app | `64ef8c7` | `egoric` | ✅ diff-sạch với schema.prisma (ledger đủ 23 migration) | ALL (agency mặc định) | `backups/20260726-180503/egoric.json` | deployment Ready liền trước trên Vercel + backup JSON |
| AIm Agency | `agency-erp` | agency-erp-mu.vercel.app | `64ef8c7` | `public` | ✅ diff-sạch | ALL (agency mặc định) | `backups/20260726-180503/public.json` | như trên |
| Vnecom LLC | `erp-vnecom` | erp-vnecom.vercel.app | `64ef8c7` | `vnecom` | ✅ diff-sạch | ALL (agency mặc định) | `backups/20260726-180503/vnecom.json` | như trên |
| Egolive | `erp-egolive` | erp-egolive.vercel.app | `64ef8c7` | `egolive` | ✅ diff-sạch | tasks, commissions, freelancers, reviews, livestream | `backups/20260726-180503/egolive.json` | như trên |
| Sandbox test | `erp-crm-test` | erp-crm-test.vercel.app | `64ef8c7` | `crmtest` | ✅ diff-sạch | ALL | (dữ liệu demo — không cần) | redeploy bất kỳ |
| CEO Terminal | `ceo-terminal-leoz` | ceo-terminal-leoz.vercel.app | `bf5270b` | `ceoportal` | ✅ diff-sạch | ALL (chỉ dùng trang CEO) | `backups/20260726-180503/` (registry/receipts nằm trong schema riêng) | như trên |

Ngoài phạm vi: **Fretas** (`erp-fretas`) — thuộc đơn vị khác, KHÔNG nối terminal (key đã thu hồi, registry disabled) và **đã gỡ khỏi deploy, schema push và backup RepositoryRealms**. Việc sao lưu Fretas phải do chủ sở hữu của hệ thống đó vận hành độc lập. **Master Dashboard cũ** (`erp-master-leoz`) — repo riêng, không thuộc manifest này.

## Đợt phát hành v3.42 — 26/7/2026

Migration `20260726090000_add_v342_lead_intake` (cộng thêm thuần: 5 cột nullable + 3 chỉ mục) áp tuần tự lên 4 schema, có đối chứng số dòng 15 bảng + dấu vân tay email tài khoản **trước và sau**:

| Công ty | Tài khoản trước → sau | Lead trước → sau | Cột mới | Kết |
|---|---|---|---|---|
| AIm | 1 → 1 | 0 → 0 | 5/5 | ✅ |
| Egoric | 14 → 14 | 0 → 0 | 5/5 | ✅ |
| Vnecom LLC | 2 → 2 | 0 → 0 | 5/5 | ✅ |
| Egolive | 1 → 1 | 0 → 0 | 5/5 | ✅ |

**0 ô lệch** trên toàn bộ User / Lead / Client / Project / Task / Quote / Invoice / Transaction / Activity / Contract / Notification / Attendance / Payroll / Setting / AuditLog của cả 4 công ty. Smoke sau deploy: `/login` = 200 và `/api/lead-intake` = **404** trên cả 4 — cổng nhận lead mặc định ĐÓNG, chưa công ty nào bị lộ endpoint.

## Định nghĩa "Migration level"

Các schema entity đồng bộ bằng `prisma db push` (không có bảng `_prisma_migrations`). Mức chuẩn = `prisma migrate diff --from-url <schema> --to-schema-datamodel prisma/schema.prisma` **không lệch** — đã xác minh cho cả 6 schema ngày 23–24/7. Migration ledger trong repo (22 file, mới nhất `20260723120000_add_v339_service_lines_company_docs_avatar`) được CI `migration-chain` xác nhận tương đương datamodel ("No difference detected").

## Quy trình rollback

1. Vercel: `vercel rollback` về deployment Ready liền trước của project tương ứng (mỗi project giữ nguyên lịch sử deployment).
2. Dữ liệu (chỉ khi sự cố dữ liệu, không tự động): xác minh backup v2 và rehearsal trên schema staging cô lập theo `HUONG-DAN-BACKUP.md`; direct restore từ app credential đã bị khóa.
3. CEO Terminal: hạ ring qua trang CEO · Rollout (fail-closed, không mất dữ liệu số liệu cũ).

## Cách tái lập manifest

- Deploy chuẩn: từ `main`, `vercel link --project <tên> && vercel deploy --prod` (hoặc chờ auto-deploy khi đã bật Git integration).
- Kiểm schema: `npx prisma migrate diff --from-url "<DIRECT_URL>?schema=<s>" --to-schema-datamodel prisma/schema.prisma --exit-code`.
- Backup: `npm run backup:plan` → kiểm target → `npm run backup` → `npm run backup:verify`. Script không tự xóa bản cũ; retention do storage policy quản lý.
