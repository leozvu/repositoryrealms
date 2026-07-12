# Agency ERP v3.2 — Đa người dùng, phân quyền theo cấp bậc

Next.js 14 + Prisma + NextAuth. Dev chạy SQLite ngay trên máy, deploy đổi sang Postgres.

## Chạy trên máy (dev)

```bash
cd agency-erp
npm install          # lần đầu
npm run db:push      # tạo database (lần đầu)
npm run db:seed      # 8 tài khoản + dữ liệu demo phủ mọi module (⚠ chạy lại = reset toàn bộ dữ liệu)
npm run dev          # → http://localhost:3300
```

## Tài khoản mẫu (7 vai trò, một người giữ được nhiều vai trò)

| Vai trò | Email | Mật khẩu | Phạm vi chính |
|---|---|---|---|
| **Giám đốc** | giamdoc@agency.vn | admin123 | Toàn quyền + duyệt mọi bước + Cài đặt + Nhật ký hệ thống |
| **Kế toán** | ketoan@agency.vn | ketoan123 | Hóa đơn, thu chi, NCC, hợp đồng, báo cáo, lương (số liệu), duyệt khoản chi |
| **Account/Sales** | am@agency.vn | am123456 | Leads (của mình), khách hàng, báo giá, bảng giá — báo giá lớn phải chờ GĐ duyệt |
| **Quản lý dự án** | pm@agency.vn | pm123456 | Dự án, công việc, Gantt + mốc dự án, NCC/PO, báo cáo vận hành |
| **HR** | hr@agency.vn | hr123456 | Hồ sơ nhân sự, lương, nhóm, duyệt nghỉ phép, tài sản, tuyển dụng |
| **Trưởng nhóm** | truongnhom@agency.vn | lead1234 | Việc/giờ công/nghỉ phép của nhóm mình, duyệt bước 1 nghỉ phép |
| **Nhân viên** | nhanvien@agency.vn | nhanvien123 | Việc + giờ công của mình, xin nghỉ phép |
| Quản lý cũ (đa vai trò) | quanly@agency.vn | quanly123 | PM + AM + Kế toán (minh họa cộng quyền) |
| Nhân viên phụ | content@agency.vn · media@agency.vn | demo1234 | Content Writer / Media Buyer |

⚠ Đổi mật khẩu khi dùng thật. Bật **đăng nhập 2 lớp (2FA)** bằng nút 🛡 cạnh tên mình ở sidebar.

## Chuỗi phê duyệt
- **Báo giá ≥ 50tr** (chỉnh trong Cài đặt): AM bấm "Đã gửi" → giữ Nháp + gửi Giám đốc duyệt → duyệt xong tự chuyển "Đã gửi"
- **Khoản chi ≥ 10tr**: chưa ghi sổ → Kế toán duyệt (≥ 50tr thêm Giám đốc) → duyệt xong tự ghi vào sổ quỹ
- **Thanh toán NCC ≥ 10tr**: đi qua chuỗi tương tự trước khi trả
- **Nghỉ phép**: Trưởng nhóm của người xin → HR (nếu > 3 ngày); không có nhóm thì thẳng HR
- Người yêu cầu giữ vai trò của bước nào thì bước đó **tự duyệt**; Giám đốc duyệt được mọi bước
- Tất cả xử lý trong menu **Phê duyệt** (badge đỏ = số việc chờ bạn); mọi hành động vào **Nhật ký hệ thống**

## Phân quyền (RBAC)
- Khai báo tập trung tại [lib/registry.js](lib/registry.js) — mỗi resource: ai đọc / ghi / xóa, phạm vi dữ liệu (nhân viên chỉ thấy giờ công + nghỉ phép của mình), trường bị che (lương, liên hệ khách).
- Chặn ở **cả API lẫn giao diện**. Mọi thao tác ghi vào bảng `AuditLog`.
- 7 vai trò: DIRECTOR · PM · AM · ACCOUNTANT · HR · LEAD · STAFF (cộng quyền khi giữ nhiều vai trò).

## Trạng thái tính năng theo phiên bản

**v2.0 — lõi ERP (17 module)**: Dashboard theo vai trò · Lịch làm việc · CRM (leads kanban + AI lead score, khách hàng, báo giá in PDF, bảng giá) · Dự án + công việc kanban + chấm công giờ · Hóa đơn (thu từng phần, retainer) · Thu/Chi · Mua hàng/NCC · Hợp đồng (nhắc hết hạn) · Nhân sự + nghỉ phép · Tài sản · Báo cáo · Cài đặt + import v1

**v2.1** — 7 vai trò đa nhiệm + máy phê duyệt đa bước

**v2.2 — HRM đầy đủ**: chấm công ngày · bảng lương chuẩn VN (BHXH 10.5%, BH công ty 21.5%, giảm trừ 11tr, thuế TNCN lũy tiến 7 bậc, mỗi người chỉ xem phiếu lương của mình) · tuyển dụng kanban 6 vòng

**v2.3 — Tài chính nâng cao**: aging phải thu/phải trả · ngân sách theo danh mục (cảnh báo 80%/100%) · dự báo dòng tiền 3 tháng · VAT đầu ra theo quý

**v2.4 — Customer Success**: ticket hỗ trợ + SLA tự tính theo ưu tiên + cảnh báo vỡ SLA

**v2.5 — Analytics & mục tiêu**: MRR/ARR, LTV, CAC, khách mới vs quay lại · KPI/OKR theo quý · khảo sát NPS

**v3.0 — AI + nền tảng**: AI Summary lọc theo vai trò (churn, quá hạn, deal ứ đọng, SLA, burn rate…) · AI Copilot chat với dữ liệu (Claude API — cần API key trong Cài đặt) · PWA (cài như app) · CEO dashboard đầy đủ KPI

**v3.1 — Nhắn tin nội bộ**: DM, nhóm chat, kênh chung, đếm chưa đọc, badge menu

**v3.2 — Hoa hồng + Gantt nâng cao + 2FA + seed demo**:
- **Hoa hồng sales**: theo dõi hoa hồng theo hóa đơn/AM, tỷ lệ mặc định trong Cài đặt
- **Gantt milestone + phụ thuộc**: mốc dự án (PM thêm/sửa trên Gantt), việc phụ thuộc việc — mũi tên nét đứt trên Gantt, icon ⛓ trên kanban, **chặn hoàn thành khi việc trước chưa xong** (chặn cả ở API)
- **Đăng nhập 2 lớp (TOTP)**: tự bật bằng nút 🛡, tương thích Google Authenticator, không cần thư viện ngoài; Giám đốc reset được khi nhân sự mất điện thoại
- **Seed demo hoàn chỉnh**: 10 tài khoản + ~250 bản ghi phủ 30 module, ngày tương đối nên AI Summary/aging/dự báo luôn sống động

## Import dữ liệu từ bản offline v1
1. Mở bản v1 (`agency-crm/index.html`) → Cài đặt → **Xuất dữ liệu (JSON)**
2. Đăng nhập ERP bằng Giám đốc → **Cài đặt → Import từ bản offline** → chọn file

## Deploy lên cloud (phương án A đã chọn)
1. Tạo project Postgres miễn phí tại [supabase.com](https://supabase.com) hoặc [neon.tech](https://neon.tech) → copy connection string
2. Sửa `prisma/schema.prisma`: `provider = "postgresql"`
3. Push code lên GitHub → import vào [vercel.com](https://vercel.com)
4. Khai báo biến môi trường trên Vercel: `DATABASE_URL`, `NEXTAUTH_SECRET` (chuỗi ngẫu nhiên dài), `NEXTAUTH_URL` (https://ten-mien.vercel.app)
5. Chạy `npx prisma db push && npm run db:seed` với DATABASE_URL trỏ tới Postgres (⚠ seed sẽ tạo dữ liệu demo — bỏ qua bước seed nếu muốn bắt đầu sạch, tạo tài khoản Giám đốc bằng script riêng)

**Kế tiếp**: Deploy Vercel + Supabase (cần tạo tài khoản) · v3.3 đề xuất: API key + webhook mở · đồng bộ Google Calendar · rule builder IF/THEN · CSAT — xem DOI-CHIEU-YEU-CAU.md
