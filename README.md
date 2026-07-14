# Agency ERP v3.12 — Đa người dùng, phân quyền theo cấp bậc

Next.js 14 + Prisma + NextAuth + **Supabase Postgres**.

## 🌐 Production — hệ 3 doanh nghiệp + Master (v3.6)

| Entity | URL | Postgres schema |
|---|---|---|
| **AIm Agency** | https://agency-erp-mu.vercel.app | `public` (có dữ liệu demo) |
| **Egoric Agency** | https://erp-egoric.vercel.app | `egoric` (sạch) |
| **Vnecom LLC** | https://erp-vnecom.vercel.app | `vnecom` (sạch) |
| **Master Dashboard** | https://erp-master-leoz.vercel.app | — (repo riêng `../erp-master`) |

- Một codebase → 3 Vercel project (`agency-erp`, `erp-egoric`, `erp-vnecom`), khác nhau chỉ ở env; DB chung Supabase `sueqktvmwgonaflogobe` (Singapore) tách bằng **3 Postgres schema** qua `?schema=` — dữ liệu, người dùng, vai trò, cài đặt cách ly hoàn toàn
- Mỗi công ty tự đặt **tên chức danh** trong Cài đặt (roleLabels) + tự gán vai trò/quyền cho người của mình
- Master gọi `/api/v1/summary` của từng instance bằng API key vai trò Giám đốc (key tên `master-dashboard` trong Cài đặt mỗi instance — xóa key là master mất quyền đọc instance đó)
- **Redeploy một instance**: `npx vercel link --yes --project <tên-project> --scope leozs-projects-64a5f0c8` rồi `npx vercel deploy --prod` (nhớ relink về `agency-erp` sau khi xong)
- Env mỗi project trên Vercel: `DATABASE_URL` (pooler 6543 + pgbouncer + schema), `DIRECT_URL` (5432 + schema), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`

## Chạy trên máy (dev)

Dev dùng **chung database Supabase** với production (cấu hình trong `.env` — không commit).

```bash
cd agency-erp
npm install          # lần đầu
npm run db:push      # đồng bộ schema (khi đổi schema.prisma)
npm run db:seed      # ⚠ RESET toàn bộ dữ liệu về bộ demo — đừng chạy khi team đã nhập liệu thật!
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

**v3.3 — Nền tảng tích hợp + tự động hóa**:
- **API mở**: tạo API key trong Cài đặt (key mang vai trò như một người dùng, đi qua đúng RBAC + phê duyệt) → gọi `GET/POST/PUT/DELETE /api/v1/<resource>` với `Authorization: Bearer <key>` — nối n8n/Zapier/hệ thống khác
- **Webhook**: bắn POST khi dữ liệu thay đổi (lọc sự kiện kiểu `leads.*`, `invoices.update`, `*`), ký HMAC-SHA256 header `X-Signature` khi đặt secret
- **Tự động hóa IF/THEN** (menu mới, Giám đốc): "KHI lead cập nhật VÀ stage = won THÌ nhắn Kênh chung + tạo việc cho AM" — điều kiện `= != > < contains changed`, hành động nhắn kênh chung / tạo việc / gọi webhook, template `{trường}` chèn dữ liệu
- **Xuất lịch ICS**: nút "📅 Link ICS" trên trang Lịch — subscribe vào Google/Apple Calendar là việc, deadline, mốc, nghỉ phép, hạn thu tự đổ về (không cần OAuth)
- **CSAT + cohort**: chấm 1-5★ sau mỗi ticket xử lý xong; Analytics thêm KPI CSAT + bảng cohort retention theo tháng

**v3.4 — CRM Pro**:
- **Hồ sơ khách 360°**: click tên khách → trang riêng với KPI (doanh thu lũy kế, công nợ, NPS/CSAT của khách), **danh bạ nhiều người liên hệ** (chức vụ, người chính) và **dòng thời gian gộp** mọi tương tác: hoạt động CRM, báo giá, hóa đơn, dự án, ticket, khảo sát
- **Sales forecast**: lead có "ngày dự kiến chốt" + xác suất theo giai đoạn (chỉnh trong Cài đặt) → biểu đồ dự báo doanh thu 3 tháng so mục tiêu, insight trong AI Summary
- **Chăm lead tự động**: cảnh báo đỏ lead mới quá 48h chưa liên hệ; tự chia lead chưa gán cho AM ít lead nhất (bật trong Cài đặt)
- **Tìm kiếm toàn cục Ctrl+K**: khách, lead, dự án, việc, hóa đơn, ticket, NCC, hợp đồng, nhân sự — tôn trọng phân quyền
- **Xuất CSV**: khách hàng, pipeline, hóa đơn, giờ công (BOM UTF-8, Excel đọc tiếng Việt chuẩn)

**v3.5 — ERP vận hành**:
- **Chuông thông báo 🔔**: gán việc, giao ticket, yêu cầu chờ duyệt, kết quả duyệt — gom một chỗ trên topbar, click nhảy thẳng trang, đánh dấu đọc
- **Nguồn lực**: ma trận giờ công người × 4 tuần (màu theo tải, chuẩn 40h/tuần) + việc mở/trễ hạn/đến hạn 7 ngày — PM/HR nhìn 1 màn hình biết ai quá tải, ai trống
- **Gắn tài liệu 📎**: dán link Drive/Notion/Figma vào dự án, khách hàng, hợp đồng
- **In phiếu hợp đồng** (lưu PDF qua hộp thoại in) + **RFQ so giá NCC**: một hạng mục nhiều báo giá, tick chọn NCC thắng kèm lý do
- **Onboarding nhân sự**: ứng viên "Nhận việc" → checklist 6 bước tự tạo + báo HR

**v3.6 — Đa doanh nghiệp**: 3 instance (AIm/Egoric/Vnecom) + Master Dashboard, `/api/v1/summary`, bootstrap công ty mới, tên chức danh theo công ty (roleLabels)

**v3.7 — Nhân sự & Quản lý công việc chuyên sâu**:
- **Việc của tôi**: trang cá nhân — việc quá hạn/hôm nay/tuần này với nút ✔ tại chỗ, chờ tôi duyệt, lịch hẹn, giờ log tuần
- **Task nâng cao**: checklist bước con (☑ n/m trên thẻ), bình luận trao đổi (chuông cho người phụ trách), ghi giờ công ⏱ ngay trong việc
- **Việc định kỳ 🔁**: lặp tuần/tháng — hoàn thành tự tạo kỳ sau, checklist reset
- **Hồ sơ nhân sự 360°**: click tên nhân sự → việc mở, giờ công, phép còn lại, chấm công, tài sản đang giữ, OKR cá nhân
- **Quota nghỉ phép**: n ngày phép năm (Cài đặt), hiện "còn n/12", cảnh báo khi xin vượt

**v3.8 — Đánh giá & hoàn thiện**:
- **Đánh giá hiệu suất theo quý**: HR mở đợt 1 nút → nhân viên tự chấm 5 tiêu chí (1-5⭐) + tự nhận xét → quản lý chấm + chốt; điểm chốt hiện trong hồ sơ 360°
- **Gán việc nhanh**: trang Nguồn lực có nút "+ Gán việc" từng người — thấy ai trống là phân việc chưa gán ngay tại chỗ
- **In báo cáo tháng**: 1 nút trên trang Báo cáo — doanh thu/chi/lợi nhuận, % mục tiêu, AR, chi theo danh mục, top khách, insight AI (lưu PDF)
- **Sinh nhật nhân sự 🎂**: ngày sinh trong hồ sơ, AI Summary nhắc sinh nhật trong tuần

**v3.9 — Gửi email cho khách**:
- Cấu hình SMTP theo từng công ty (Cài đặt → Email công ty, có nút gửi thử)
- Nút 📧 trên Báo giá & Hóa đơn: email brand công ty kèm bảng chi tiết + thông tin thanh toán, lời nhắn tùy chỉnh; server dựng nội dung từ chứng từ, mọi lần gửi vào Nhật ký hệ thống
- Bảo mật: các trường bí mật trong Cài đặt (SMTP, Claude API key) chỉ Giám đốc đọc được qua API

**v3.10 — Vận hành dự án chuyên sâu (Project Ops)**:
- **Tiến độ tự động**: % dự án tính từ công việc (trọng số theo giờ ước lượng), tự cập nhật khi task đổi
- **Ước lượng giờ vs thực tế**: task có giờ ước lượng, dự án có ngân sách giờ → % đốt ngân sách, cảnh báo vượt
- **Sức khỏe dự án 🔴🟡🟢**: tự tính từ trễ deadline + vượt giờ + vượt ngân sách + việc trễ
- **Chi phí & biên lợi nhuận**: chi phí thực = giờ log × đơn giá lương + hóa đơn NCC; biên = ngân sách − chi phí (chỉ CEO/Kế toán/PM/Lead thấy tiền)
- **Giai đoạn dự án (phases)**: nhóm việc theo phase với tiến độ riêng; **nhãn công việc** + lọc theo người/nhãn; **lịch sử thay đổi** từng việc
- **Mẫu dự án**: 1 nút sinh cả bộ giai đoạn + việc + mốc chuẩn (branding, chiến dịch…)
- **Sở chỉ huy dự án (`/portfolio`)**: mọi dự án theo mức rủi ro + giờ đốt + biên LN + việc trễ + ma trận tải nhân sự

**v3.11 — Chấm công chuyên sâu + Freelancer**:
- **Chấm công giờ vào/ra thật**: bấm Vào ca / Tan ca ghi timestamp, tự tính giờ làm; ca chuẩn + hệ số OT trong Cài đặt; **phát hiện đi muộn**; **ngày lễ công ty** (không tính vắng); **ghi OT**; bảng công tháng (đi muộn/giờ làm/OT) nối vào bảng lương
- **Quản lý Freelancer** (`/freelancers`, HR/PM/Lead): tạo tài khoản freelancer với đơn giá giờ + kỹ năng; gắn vào dự án → **hạn truy cập tự đặt theo deadline dự án**; giờ freelancer log tính vào chi phí/biên dự án theo đơn giá freelancer
- **Cổng Freelancer** (`/freelancer`): freelancer đăng nhập vào view **khóa chặt** — chỉ dự án được gán + việc của mình (đổi trạng thái, checklist, ghi giờ) + hạn hợp đồng còn lại. **Chặn ở tầng API** (403 mọi dữ liệu nội bộ), **tài khoản hết hạn theo dự án tự chặn đăng nhập**

**v3.12 — Vận hành công việc trơn tru + thanh toán freelancer**:
- **Thanh toán freelancer** (`/freelancers`, `/finplan`): chốt công nợ phải trả theo job — theo **giờ đã log × đơn giá** hoặc **phí job cố định**; chốt trả tự sinh phiếu chi vào sổ quỹ; freelancer thấy "Chờ thanh toán" trong cổng riêng
- **Xem nguồn lực hằng ngày** (`/resources` → *Team hôm nay*): mỗi người 🟢 rảnh / 🟡 bận / 🔴 quá tải / 🌴 nghỉ theo giờ cam kết vs 8h/ngày; người rảnh có nút **+ Giao việc**; gồm cả freelancer
- **Quản lý công việc sâu hơn** (`/tasks`): bám giờ theo từng việc (**ước lượng vs thực tế**); **nhóm board theo người / giai đoạn** (swimlane); **chọn nhiều việc** đổi người/hạn/trạng thái hàng loạt; **@nhắc tên** trong bình luận (bỏ dấu tiếng Việt khi khớp) + **badge tuổi việc** cảnh báo việc ứ đọng

## Import dữ liệu từ bản offline v1
1. Mở bản v1 (`agency-crm/index.html`) → Cài đặt → **Xuất dữ liệu (JSON)**
2. Đăng nhập ERP bằng Giám đốc → **Cài đặt → Import từ bản offline** → chọn file

## Ghi chú vận hành production
- ⚠ **Trước khi đưa team vào dùng thật**: đổi toàn bộ mật khẩu demo (Hồ sơ & nhóm → sửa từng người), bật 2FA cho Giám đốc/Kế toán, và **không chạy `db:seed` nữa** (seed xóa sạch dữ liệu)
- Deploy dùng Vercel CLI trực tiếp từ máy (`.vercel/` đã link) — muốn auto-deploy theo git thì push repo lên GitHub rồi import vào Vercel sau
- Supabase free tier: tự backup 7 ngày; nâng Pro khi dữ liệu quan trọng

**Kế tiếp**: đồng bộ Google Calendar 2 chiều (OAuth — cần Google Cloud project) · gửi email báo giá/hóa đơn (SMTP/Resend) · custom dashboard — xem DOI-CHIEU-YEU-CAU.md
