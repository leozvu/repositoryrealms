# Agency ERP v2.0 — Đa người dùng, phân quyền theo cấp bậc

Next.js 14 + Prisma + NextAuth. Dev chạy SQLite ngay trên máy, deploy đổi sang Postgres.

## Chạy trên máy (dev)

```bash
cd agency-erp
npm install          # lần đầu
npm run db:push      # tạo database (lần đầu)
npm run db:seed      # tạo 3 tài khoản mẫu (lần đầu)
npm run dev          # → http://localhost:3300
```

## Tài khoản mẫu (v2.1 — 7 vai trò, một người giữ được nhiều vai trò)

| Vai trò | Email | Mật khẩu | Phạm vi chính |
|---|---|---|---|
| **Giám đốc** | giamdoc@agency.vn | admin123 | Toàn quyền + duyệt mọi bước + Cài đặt + Nhật ký hệ thống |
| **Kế toán** | ketoan@agency.vn | ketoan123 | Hóa đơn, thu chi, NCC, hợp đồng, báo cáo, lương (số liệu), duyệt khoản chi |
| **Account/Sales** | am@agency.vn | am123456 | Leads (của mình), khách hàng, báo giá, bảng giá — báo giá lớn phải chờ GĐ duyệt |
| **Quản lý dự án** | pm@agency.vn | pm123456 | Dự án, công việc, NCC/PO, báo cáo vận hành |
| **HR** | hr@agency.vn | hr123456 | Hồ sơ nhân sự, lương, nhóm, duyệt nghỉ phép, tài sản |
| **Trưởng nhóm** | truongnhom@agency.vn | lead1234 | Việc/giờ công/nghỉ phép của nhóm mình, duyệt bước 1 nghỉ phép |
| **Nhân viên** | nhanvien@agency.vn | nhanvien123 | Việc + giờ công của mình, xin nghỉ phép |
| Quản lý cũ (đa vai trò) | quanly@agency.vn | quanly123 | PM + AM + Kế toán (minh họa cộng quyền) |

⚠️ Đổi mật khẩu khi dùng thật. Tài khoản import từ v1 có mật khẩu tạm: `doimatkhau`.

## Chuỗi phê duyệt (v2.1)
- **Báo giá ≥ 50tr** (chỉnh trong Cài đặt): AM bấm "Đã gửi" → giữ Nháp + gửi Giám đốc duyệt → duyệt xong tự chuyển "Đã gửi"
- **Khoản chi ≥ 10tr**: chưa ghi sổ → Kế toán duyệt (≥ 50tr thêm Giám đốc) → duyệt xong tự ghi vào sổ quỹ
- **Thanh toán NCC ≥ 10tr**: đi qua chuỗi tương tự trước khi trả
- **Nghỉ phép**: Trưởng nhóm của người xin → HR (nếu > 3 ngày); không có nhóm thì thẳng HR
- Người yêu cầu giữ vai trò của bước nào thì bước đó **tự duyệt**; Giám đốc duyệt được mọi bước
- Tất cả xử lý trong menu **Phê duyệt** (badge đỏ = số việc chờ bạn); mọi hành động vào **Nhật ký hệ thống**

## Import dữ liệu từ bản offline v1
1. Mở bản v1 (`agency-crm/index.html`) → Cài đặt → **Xuất dữ liệu (JSON)**
2. Đăng nhập ERP bằng Giám đốc → **Cài đặt → Import từ bản offline** → chọn file

## Phân quyền v2.0 (RBAC)
- Khai báo tập trung tại [lib/registry.js](lib/registry.js) — mỗi resource: ai đọc / ghi / xóa, phạm vi dữ liệu (nhân viên chỉ thấy giờ công + nghỉ phép của mình), trường bị che (lương, liên hệ khách).
- Chặn ở **cả API lẫn giao diện**. Mọi thao tác ghi vào bảng `AuditLog`.
- v2.1 sẽ mở rộng lên 7 vai trò (AM, PM, Kế toán, HR…) theo [kế hoạch](../agency-crm/KE-HOACH-ERP-V2.md).

## Deploy lên cloud (phương án A đã chọn)
1. Tạo project Postgres miễn phí tại [supabase.com](https://supabase.com) hoặc [neon.tech](https://neon.tech) → copy connection string
2. Sửa `prisma/schema.prisma`: `provider = "postgresql"`
3. Push code lên GitHub → import vào [vercel.com](https://vercel.com)
4. Khai báo biến môi trường trên Vercel: `DATABASE_URL`, `NEXTAUTH_SECRET` (chuỗi ngẫu nhiên dài), `NEXTAUTH_URL` (https://ten-mien.vercel.app)
5. Chạy `npx prisma db push && npm run db:seed` với DATABASE_URL trỏ tới Postgres

## Trạng thái module — v2.0 HOÀN CHỈNH (17 module)

**Tổng quan**: Bảng điều khiển theo vai trò · Lịch làm việc (6 loại sự kiện)
**CRM**: Khách tiềm năng kanban + nhật ký hẹn · Khách hàng + hoạt động CRM · Báo giá (in PDF, chuyển hóa đơn/dự án 1 nút) · Bảng giá dịch vụ (chọn nhanh vào chứng từ)
**Vận hành**: Dự án · Công việc kanban · Chấm công giờ
**Tài chính**: Hóa đơn (thu từng phần, retainer, in PDF) · Thu/Chi + CSV · **Mua hàng/NCC** (công nợ phải trả, thanh toán tự ghi sổ) · **Hợp đồng** (nhắc hết hạn 30 ngày)
**Công ty**: Nhân sự (tài khoản, lương, nghỉ phép + duyệt) · **Tài sản** (ai giữ gì, gia hạn license, giá trị ẩn với nhân viên) · Báo cáo (dòng tiền 12T, cơ cấu chi phí, phễu deal, lợi nhuận dự án, top khách) · Cài đặt + import v1

## v2.2 — HRM đầy đủ (ĐÃ XONG)
- **Chấm công ngày**: mỗi người tự điểm danh (Đi làm / Remote / Nghỉ), tổng hợp công theo tháng, HR quản trị
- **Bảng lương chuẩn VN**: BHXH/YT/TN người lao động 10.5%, BH công ty 21.5%, giảm trừ bản thân 11tr, **thuế TNCN lũy tiến 7 bậc** — HR/Kế toán tạo nháp → chỉnh phụ cấp/thưởng từng người → chốt là khóa + tự ghi tổng chi phí vào sổ quỹ. **Mỗi nhân viên chỉ xem được phiếu lương của chính mình.**
- **Tuyển dụng**: kanban 6 vòng (Ứng tuyển → PV1 → PV2 → Offer → Nhận việc / Loại), chỉ HR + Giám đốc

## v2.3 — Tài chính nâng cao (ĐÃ XONG)
- **Công nợ & Dự báo** (menu mới, Kế toán/GĐ):
  - Aging phải thu + phải trả theo nhóm: trong hạn / 1–30 / 31–60 / 61–90 / 90+ ngày
  - **Ngân sách theo danh mục** từng tháng, thanh % chuyển cam khi vượt 80%, đỏ khi vượt 100%
  - **Dự báo dòng tiền 3 tháng**: dự thu (hóa đơn theo hạn) − dự chi (NCC + quỹ lương gồm BH + chi phí cố định trung bình)
- **Báo cáo VAT đầu ra theo quý** trong trang Báo cáo

**Kế tiếp**: deploy Vercel + Supabase (cloud — đã chọn) · v2.4: resource planning/utilization, KPI quý, VAT đầu vào — xem KE-HOACH-ERP-V2.md.
