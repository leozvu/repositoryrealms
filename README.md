# RepositoryRealms — ERP/CRM đa doanh nghiệp (v3.36)

Next.js 14 + Prisma + NextAuth + **Supabase Postgres**. Một codebase phục vụ **5 doanh nghiệp** (agency, xuất nhập khẩu, livestream) + Master Dashboard, tách dữ liệu bằng Postgres schema, bật/tắt phân hệ theo từng công ty.

Repo này gồm **2 bề mặt** dùng chung một hệ nghiệp vụ (xem `docs/realms/ERP-REALM-SURFACE-SEPARATION.md`):

- **ERP/CRM** (`/dashboard` + toàn bộ route hiện có) — không gian vận hành mặc định, thuật ngữ nghiệp vụ chuẩn (Lead, Dự án, Hóa đơn, Chấm công…).
- **Realm** (`/realm`, `/realm-demo`) — lớp trải nghiệm gamified tùy chọn (Hall, Quest Board, Guild…), merge từ nhánh `codex/realms-demo` (PR #2). Trạng thái: **đề xuất, chưa duyệt deploy production**. Tài liệu 25 phase + CEO Portal nằm trong `docs/realms/`.

## 🌐 Production — 5 doanh nghiệp + Master

| Entity | URL | Postgres schema | Mô hình |
|---|---|---|---|
| **AIm Agency** | https://agency-erp-mu.vercel.app | `public` (có dữ liệu demo) | Agency |
| **Egoric Agency** | https://erp-egoric.vercel.app | `egoric` | Agency |
| **Vnecom LLC** | https://erp-vnecom.vercel.app | `vnecom` | Agency/dịch vụ |
| **Fretas** | https://erp-fretas.vercel.app | `fretas` | Xuất nhập khẩu nông sản |
| **Egolive** | https://erp-egolive.vercel.app | `egolive` | Livestream bán hàng |
| **Master Dashboard** | https://erp-master-leoz.vercel.app | — (repo riêng `../erp-master`) | Tổng hợp đa công ty |

- 1 codebase → 5 Vercel project, khác nhau chỉ ở env; DB chung Supabase `sueqktvmwgonaflogobe` (Singapore) tách bằng 5 Postgres schema qua `?schema=` — dữ liệu, người dùng, vai trò, cài đặt cách ly hoàn toàn.
- **Phân hệ bật/tắt theo công ty** (v3.17, `lib/modules.js`): mỗi mục menu/resource gắn `mod`; công ty bật đúng phân hệ mình cần trong Cài đặt (Fretas không thấy Gantt/Freelancer, Egoric không thấy Vùng trồng/Chứng từ XNK). Thiếu khóa `Setting.modules` = bật hết (tương thích công ty cũ). Bootstrap nhận preset qua env `MODULES` (v3.21).
- Mỗi công ty tự đặt **tên chức danh** (roleLabels) + tự gán vai trò/quyền cho người của mình.
- Master gọi `/api/v1/summary` của từng instance bằng API key vai trò Giám đốc (key tên `master-dashboard` trong Cài đặt mỗi instance) — v3.34 summary có thêm tồn kho, tiền livestream chờ về, số dư quỹ.
- Env mỗi project trên Vercel: `DATABASE_URL` (pooler 6543 + pgbouncer + schema), `DIRECT_URL` (5432 + schema), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

## Nhánh git

| Nhánh | Vai trò |
|---|---|
| `main` | ERP v3.36 + merge Realms (PR #2) |
| `fix/crm-erp` | Nhánh làm việc hiện tại — sửa lỗi/hoàn thiện CRM-ERP, không đụng main |
| `feat/leozops-s1a` | Sprint 1A tích hợp LeozOps (route `GET /api/integrations/leozops/v1/lead-snapshot`, tắt mặc định — xem `lib/leozops/README.md`). **Đang đóng băng, chưa merge.** |
| `codex/realms-demo` | Nhánh nguồn của lớp Realm/CEO Portal (đã merge vào main) |

## Chạy trên máy (dev)

Dev dùng **chung database Supabase** với production (cấu hình trong `.env` — không commit).

```bash
npm install          # lần đầu
npm run db:push      # đồng bộ schema (khi đổi schema.prisma)
npm run db:seed      # ⚠ RESET toàn bộ dữ liệu về bộ demo — đừng chạy khi team đã nhập liệu thật!
npm run dev          # → http://localhost:3300
```

Sửa `prisma/schema.prisma` xong muốn đẩy lên **cả 5 schema**: `.\db-push-all.ps1` (hoặc `-Only fretas` cho 1 schema; dừng dev server trước). Deploy: `.\deploy-all.ps1`. Sao lưu/khôi phục DB: `npm run backup` / `npm run restore` (xem `HUONG-DAN-BACKUP.md`).

## Test & QA

```bash
npm test             # unit test (node --test) — phân quyền, lương, tiền chứng từ, leozops, verticals…
npm run test:coverage
npm run qa           # chuỗi gate đầy đủ: config check + ~40 audit script + coverage + npm audit + build
npm run test:e2e     # Playwright
```

Các script `audit:*` (trong `scripts/`) là gate bằng chứng cho từng phân hệ (CRM, tài chính, HR, UI, realm…) — chạy `--check` để fail khi lệch chuẩn.

## Tài khoản mẫu (7 vai trò, một người giữ được nhiều vai trò)

> Mật khẩu **không ghi trong mã nguồn** (v3.13): `npm run db:seed` sinh mật khẩu ngẫu nhiên và in ra màn hình khi seed xong. Muốn cố định khi dev: `SEED_PASSWORD=... npm run db:seed`. Mật khẩu đang dùng thật nằm trong `CREDENTIALS-NOI-BO.txt` (không được git theo dõi).

| Vai trò | Email | Phạm vi chính |
|---|---|---|
| **Giám đốc** | giamdoc@agency.vn | Toàn quyền + duyệt mọi bước + Cài đặt + Nhật ký hệ thống |
| **Kế toán** | ketoan@agency.vn | Hóa đơn, thu chi, NCC, hợp đồng, báo cáo, lương, duyệt khoản chi |
| **Account/Sales** | am@agency.vn | Leads (của mình), khách hàng, báo giá, bảng giá |
| **Quản lý dự án** | pm@agency.vn | Dự án, công việc, Gantt + mốc, NCC/PO, báo cáo vận hành |
| **HR** | hr@agency.vn | Hồ sơ nhân sự, lương, nhóm, duyệt nghỉ phép, tài sản, tuyển dụng |
| **Trưởng nhóm** | truongnhom@agency.vn | Việc/giờ công/nghỉ phép của nhóm mình, duyệt bước 1 nghỉ phép |
| **Nhân viên** | nhanvien@agency.vn | Việc + giờ công của mình, xin nghỉ phép |
| Đa vai trò | quanly@agency.vn | PM + AM + Kế toán (minh họa cộng quyền) |
| Freelancer | (tạo trong `/freelancers`) | Cổng riêng `/freelancer`, khóa theo dự án + hạn truy cập |

⚠ Đổi mật khẩu khi dùng thật. Bật **2FA (TOTP)** bằng nút 🛡 cạnh tên mình. Sai mật khẩu 8 lần → khóa 15 phút.

## Phân quyền (RBAC) & phê duyệt

- Khai báo tập trung tại [lib/registry.js](lib/registry.js) — mỗi resource: ai đọc/ghi/xóa, phạm vi dữ liệu, trường bị che (lương, liên hệ khách). Chặn ở **cả API lẫn giao diện**; mọi thao tác ghi vào `AuditLog`.
- 8 vai trò: DIRECTOR · PM · AM · ACCOUNTANT · HR · LEAD · STAFF · FREELANCER (cộng quyền khi giữ nhiều vai trò).
- **Chuỗi phê duyệt** (ngưỡng chỉnh trong Cài đặt): báo giá ≥ 50tr → Giám đốc duyệt · khoản chi ≥ 10tr → Kế toán (≥ 50tr thêm GĐ) · thanh toán NCC tương tự · nghỉ phép → Trưởng nhóm → HR (nếu > 3 ngày). Người giữ vai trò của bước nào thì bước đó tự duyệt; xử lý trong menu **Phê duyệt**, mọi hành động vào **Nhật ký hệ thống**.
- **API mở + Webhook + Tự động hóa IF/THEN** (v3.3): API key mang vai trò như một người dùng (`GET/POST/PUT/DELETE /api/v1/<resource>`, `Authorization: Bearer <key>`); webhook ký HMAC-SHA256; rule "KHI… THÌ…" nhắn kênh/tạo việc/gọi webhook.

## Tính năng theo phiên bản (tóm tắt)

Catalog đầy đủ 36+ module theo nhóm kèm vai trò sử dụng: **`GIOI-THIEU-TINH-NANG.md`** · Sổ tay người dùng: **`SO-TAY-SU-DUNG.md`** · Đối chiếu yêu cầu: **`DOI-CHIEU-YEU-CAU.md`**.

**Lõi ERP (v2.0 → v2.5)** — 17 module: Dashboard theo vai trò · Lịch · CRM (leads kanban + AI lead score, khách hàng, báo giá PDF, bảng giá) · Dự án + kanban + chấm công giờ · Hóa đơn (thu từng phần, retainer) · Thu/Chi · Mua hàng/NCC · Hợp đồng · Nhân sự + nghỉ phép · Tài sản · Báo cáo · 7 vai trò + máy phê duyệt đa bước (v2.1) · HRM đầy đủ: bảng lương chuẩn VN, tuyển dụng kanban (v2.2) · Tài chính nâng cao: aging AR/AP, ngân sách, dự báo dòng tiền, VAT (v2.3) · Ticket + SLA (v2.4) · Analytics MRR/ARR/LTV/CAC + KPI/OKR + NPS (v2.5)

**v3.0 – v3.9**: AI Summary theo vai trò + AI Copilot (Claude API) + PWA (v3.0) · Nhắn tin nội bộ (v3.1) · Hoa hồng sales, Gantt milestone + phụ thuộc, 2FA TOTP (v3.2) · API mở + webhook + automation + ICS + CSAT/cohort (v3.3) · CRM Pro: hồ sơ khách 360°, sales forecast, chăm lead tự động, Ctrl+K, xuất CSV (v3.4) · Chuông thông báo, Nguồn lực, gắn tài liệu, RFQ, onboarding nhân sự (v3.5) · Đa doanh nghiệp + Master Dashboard (v3.6) · Việc của tôi, task nâng cao (checklist, bình luận, định kỳ 🔁), hồ sơ nhân sự 360°, quota phép (v3.7) · Đánh giá hiệu suất quý, in báo cáo tháng (v3.8) · Gửi email báo giá/hóa đơn qua SMTP công ty (v3.9)

**v3.10 – v3.13**: Project Ops — tiến độ tự động, giờ ước lượng vs thực tế, sức khỏe 🔴🟡🟢, chi phí & biên LN, phases, mẫu dự án, `/portfolio` (v3.10) · Chấm công vào/ra thật + OT + ngày lễ; Freelancer: quản lý + cổng riêng khóa chặt theo dự án (v3.11) · Thanh toán freelancer theo job, Team hôm nay, task swimlane/hàng loạt/@nhắc (v3.12) · **Vá bảo mật lớn** (khóa dò mật khẩu, gỡ mật khẩu khỏi source, bịt lộ 2FA, vá 4 lỗ phân quyền) + nối chuỗi tiền (chấm công → lương OT, giờ billable → hóa đơn, retainer → kỳ tới) + 29 index + 47 test đầu tiên (v3.13)

**v3.14 – v3.16**: UX mobile — bảng đọc được trên điện thoại cả 19 trang, icon SVG, header dính, tương phản AA (v3.14) · vá nút giao diện mời mà API từ chối (v3.15) · LEAD chạy được giao hàng + chặn 2 lỗ hỏng tài khoản im lặng (v3.16)

**v3.17 – v3.23 — nền đa mô hình kinh doanh**: bật/tắt phân hệ theo công ty (v3.17) · **đa tiền tệ** + 2 phân hệ dọc: **XNK nông sản (Fretas)** — vùng trồng PUC/PHC, lô hàng, chứng từ XNK; **Livestream (Egolive)** — ca live, đối soát sàn TikTok/Shopee, công host (v3.18–3.20) · nối dây + chốt chặn 2 phân hệ, preset qua env `MODULES` (v3.21) · Fretas thành hệ XNK thực thụ (v3.22) · tách "Bảng công việc" khỏi "Vận hành dự án" (v3.23)

**v3.24 – v3.27 — kế toán sâu (MISA-inspired)**: Kho hàng/Lô + truy xuất nguồn gốc, giá vốn đích danh (v3.24) · kế toán đa ngoại tệ + chênh lệch tỷ giá, công nợ AR/AP đa tiền tệ (v3.25) · báo cáo tài chính KQKD + LCTT (v3.26) · rà soát Egolive (v3.27)

**v3.28 – v3.36 — nhập/xuất liệu & vận hành**: nhập hàng loạt từ Excel/Sheets (dán TSV → map cột → xem trước) (v3.28) · xuất CSV (v3.29, mở rộng v3.35) · cảnh báo chất lượng dữ liệu (v3.30) · onboarding "Bắt đầu nhanh" (v3.31) · chi phí định kỳ (v3.32) · doanh thu livestream vào sổ tài chính (v3.33) · Fretas tra cứu thị trường xuất khẩu + master summary mở rộng (v3.34) · trang hướng dẫn cài PWA lên điện thoại (v3.36)

**Realms/CEO Portal (PR #2, sau v3.36)**: lớp trải nghiệm `/realm` + CEO surfaces (`/ceo-overview`, `/ceo-inbox`, `/ceo-commands`…) + bộ audit gate `audit:realm:*`, `audit:ceo:*` + staging pipeline (`staging:*`, `realm:*`). Toàn bộ tài liệu thiết kế, contract và runbook 25 phase: `docs/realms/`.

## Import dữ liệu từ bản offline v1

1. Mở bản v1 (`../agency-crm/index.html`) → Cài đặt → **Xuất dữ liệu (JSON)**
2. Đăng nhập ERP bằng Giám đốc → **Cài đặt → Import từ bản offline** → chọn file

## Ghi chú vận hành production

- ⚠ **Trước khi đưa team vào dùng thật**: đổi toàn bộ mật khẩu demo, bật 2FA cho Giám đốc/Kế toán, và **không chạy `db:seed` nữa** (seed xóa sạch dữ liệu).
- Deploy dùng Vercel CLI từ máy (`.vercel/` đã link từng project — dùng `deploy-all.ps1` để không phải link tay). Chi tiết: `DEPLOY.md`.
- Supabase free tier: tự backup 7 ngày; có script backup riêng (`HUONG-DAN-BACKUP.md`); nâng Pro khi dữ liệu quan trọng.
- Tích hợp LeozOps (nhánh `feat/leozops-s1a`): route tắt mặc định, chỉ bật bằng env per-deployment — xem `lib/leozops/README.md`.
