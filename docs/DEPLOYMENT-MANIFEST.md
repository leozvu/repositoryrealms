# Deployment Manifest — Leoz Group ERP/CRM + CEO Terminal

Cập nhật: 2026-07-24 · Baseline canonical: `main @ bf5270b` (PR #3, CI xanh: migration-chain + verify) · Người lập: Claude (theo chỉ thị founder 24/7)

## Bảng entity

| Entity | Vercel project | Domain | Commit | Postgres schema | Migration level | Modules bật | Backup gần nhất | Rollback target |
|---|---|---|---|---|---|---|---|---|
| Egoric Agency | `erp-egoric` | erp-egoric.vercel.app | `bf5270b` | `egoric` | ✅ diff-sạch với schema.prisma (ledger đủ 22 migration) | ALL (agency mặc định) | `backups/20260723-054122/egoric.json` | deployment Ready liền trước trên Vercel + backup JSON |
| AIm Agency | `agency-erp` | agency-erp-mu.vercel.app | `bf5270b` | `public` | ✅ diff-sạch | ALL (agency mặc định) | `backups/20260723-054122/public.json` | như trên |
| Vnecom LLC | `erp-vnecom` | erp-vnecom.vercel.app | `bf5270b` | `vnecom` | ✅ diff-sạch | ALL (agency mặc định) | `backups/20260723-054122/vnecom.json` | như trên |
| Egolive | `erp-egolive` | erp-egolive.vercel.app | `bf5270b` | `egolive` | ✅ diff-sạch | tasks, commissions, freelancers, reviews, livestream | `backups/20260723-054122/egolive.json` | như trên |
| Sandbox test | `erp-crm-test` | erp-crm-test.vercel.app | `bf5270b` | `crmtest` | ✅ diff-sạch | ALL | (dữ liệu demo — không cần) | redeploy bất kỳ |
| CEO Terminal | `ceo-terminal-leoz` | ceo-terminal-leoz.vercel.app | `bf5270b` | `ceoportal` | ✅ diff-sạch | ALL (chỉ dùng trang CEO) | `backups/20260723-054122/` (registry/receipts nằm trong schema riêng) | như trên |

Ngoài phạm vi: **Fretas** (`erp-fretas`) — thuộc đơn vị khác, chạy cùng codebase `bf5270b` nhưng KHÔNG nối terminal (key đã thu hồi, registry disabled). **Master Dashboard cũ** (`erp-master-leoz`) — repo riêng, không thuộc manifest này.

## Định nghĩa "Migration level"

Các schema entity đồng bộ bằng `prisma db push` (không có bảng `_prisma_migrations`). Mức chuẩn = `prisma migrate diff --from-url <schema> --to-schema-datamodel prisma/schema.prisma` **không lệch** — đã xác minh cho cả 6 schema ngày 23–24/7. Migration ledger trong repo (22 file, mới nhất `20260723120000_add_v339_service_lines_company_docs_avatar`) được CI `migration-chain` xác nhận tương đương datamodel ("No difference detected").

## Quy trình rollback

1. Vercel: `vercel rollback` về deployment Ready liền trước của project tương ứng (mỗi project giữ nguyên lịch sử deployment).
2. Dữ liệu (chỉ khi sự cố dữ liệu, không tự động): `npm run restore` từ `backups/<timestamp>/<schema>.json` — quyết định bởi founder.
3. CEO Terminal: hạ ring qua trang CEO · Rollout (fail-closed, không mất dữ liệu số liệu cũ).

## Cách tái lập manifest

- Deploy chuẩn: từ `main`, `vercel link --project <tên> && vercel deploy --prod` (hoặc chờ auto-deploy khi đã bật Git integration).
- Kiểm schema: `npx prisma migrate diff --from-url "<DIRECT_URL>?schema=<s>" --to-schema-datamodel prisma/schema.prisma --exit-code`.
- Backup: `npm run backup` (giữ 14 bản gần nhất trong `backups/`).
