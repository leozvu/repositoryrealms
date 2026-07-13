# Đối chiếu yêu cầu ERP đầy đủ ↔ hệ thống hiện tại
> Cập nhật 12/07/2026 — sau v3.5. Ký hiệu: ✅ đã có · 🟡 có một phần · 🔨 nên xây tiếp · 🔌 nên tích hợp dịch vụ ngoài (không tự xây) · ⛔ không phù hợp agency 10–25 người

| # | Nhóm yêu cầu | Trạng thái | Ghi chú |
|---|---|---|---|
| I | **CEO Dashboard + AI Summary** | ✅ | Doanh thu, lợi nhuận, AR/AP, pipeline + conversion, khách active, utilization, burn rate, project health, ticket/SLA, việc hôm nay + **AI Summary** (churn, quá hạn, deal ứ đọng, hợp đồng hết hạn…) lọc theo vai trò |
| II | **CRM** (lead, contact, company, pipeline, activity) | ✅ | Pipeline kanban + AI Lead Score + **hồ sơ khách 360° với nhiều contact + timeline gộp (v3.4)** + chăm lead tự động (cảnh báo 48h, tự chia AM) |
| III | **Sales** (quote→contract→invoice→recurring) | ✅ | Báo giá→hóa đơn→thu từng phần→retainer + hợp đồng + duyệt theo ngưỡng + hoa hồng (v3.2) + **forecast theo pipeline weighted xác suất (v3.4)**. 🔌 E-sign: DocuSign/SignNow |
| IV | **Marketing** (email, automation, ads, funnel) | 🔌 | Nên dùng Mailchimp/Brevo (email), còn **Facebook Ads + ClickUp đã kết nối trong Claude** — kéo được số liệu ads về báo cáo. 🔨 nhỏ: UTM/coupon tracking |
| V | **Customer Success** (ticket, SLA, NPS, churn) | ✅ | Ticket + SLA tự tính + cảnh báo vỡ SLA (v2.4) · NPS (v2.5) · **CSAT 1-5★ theo ticket (v3.3)** · churn prediction trong AI Summary. 🔌 Live chat: Tawk.to (miễn phí) |
| VI | **Project Management** | ✅ | Kanban, deadline, tiến độ, giờ công, lợi nhuận dự án + **Gantt milestone + phụ thuộc công việc, chặn hoàn thành sai thứ tự (v3.2)** |
| VII | **HR** | ✅ | Hồ sơ, chấm công, nghỉ phép + duyệt, bảng lương BHXH/TNCN, tuyển dụng kanban, KPI/OKR + **onboarding checklist tự tạo (v3.5)** + **resource planning người × tuần (v3.5)**. 🔨: đào tạo |
| VIII | **Finance** | ✅ | Thu chi, hóa đơn, AR/AP aging, ngân sách, dự báo dòng tiền, P&L, VAT quý, audit log. 🔨: đối soát ngân hàng (cần API bank). ⛔ Balance sheet chuẩn kép — dùng phần mềm kế toán thuế (MISA) song song |
| IX | **Procurement** | ✅ | NCC + rating, hóa đơn đầu vào, duyệt chi, thanh toán tự ghi sổ + **RFQ so giá chọn NCC (v3.5)** |
| X | **Inventory** | ⛔ | Agency dịch vụ không có kho hàng — bỏ qua trừ khi bán merch |
| XI | **Manufacturing** | ⛔ | Không thuộc mô hình agency |
| XII | **Asset Management** | ✅ | Thiết bị/license, ai giữ, gia hạn, khấu trừ giá trị với nhân viên |
| XIII | **Legal** | 🟡 | Hợp đồng + nhắc hết hạn + duyệt đã có. 🔌 chữ ký số: VNPT-CA/Viettel-CA |
| XIV | **Document** | ✅ | Lưu trữ dùng Google Drive; **gắn link tài liệu vào dự án/khách/hợp đồng ngay trong ERP (v3.5)** + in phiếu hợp đồng |
| XV | **Communication** | ✅ | **Chat nội bộ tự xây (v3.1): DM, nhóm, kênh chung, đếm chưa đọc**. 🔌 với bên ngoài: Zalo OA/Meet |
| XVI | **Calendar** | ✅ | Lịch gộp 6 loại sự kiện + **xuất ICS subscribe Google/Apple Calendar (v3.3)**. 🔨 v3.4: đồng bộ 2 chiều qua Google OAuth (cần Google Cloud project) |
| XVII | **Workflow Automation** | ✅ | Máy phê duyệt đa bước + hóa đơn định kỳ + chặn task phụ thuộc + **rule builder IF/THEN (v3.3): điều kiện + hành động nhắn kênh/tạo việc/gọi webhook**. n8n/Zapier nối qua API mở + webhook |
| XVIII | **AI** | ✅ | **AI Summary + Lead Score + churn detection** (rule-based, tức thời) + **AI Copilot chat với dữ liệu (v3.0, Claude API — cần API key trong Cài đặt)** |
| XIX | **Permission** | ✅ | 7 vai trò đa nhiệm, scope own/team/all, duyệt, audit + **2FA TOTP (v3.2)**. ⛔ SSO: chưa cần ở quy mô này |
| XX | **Reporting** | ✅ | Dòng tiền, P&L, cơ cấu chi, phễu, lợi nhuận dự án, top khách, VAT, utilization. 🔨: custom dashboard builder |
| XXI | **API** | ✅ | **API mở /api/v1 + API key theo vai trò + webhook ký HMAC (v3.3)** — đi qua đúng RBAC + phê duyệt |
| XXII | **Mobile** | ✅ | **PWA (v3.0)**: cài như app trên điện thoại, service worker. ⛔ app native offline/GPS: chưa đáng đầu tư |
| XXIII | **Security** | 🟡 | Mật khẩu băm bcrypt, phân quyền 2 tầng, audit log, **2FA (v3.2)**; deploy Supabase có backup tự động + mã hóa. ⛔ SOC2/ISO27001 là chứng nhận tổ chức, không phải tính năng phần mềm |
| XXIV | **Analytics** (LTV, CAC, MRR, cohort) | ✅ | MRR/ARR, LTV, CAC + LTV/CAC, khách mới vs quay lại, NPS (v2.5) + **CSAT + cohort retention matrix (v3.3)** |

## Đề xuất thứ tự tiếp theo
1. **Deploy cloud** (Vercel + Supabase) — cần tạo tài khoản Supabase/Vercel; đưa team vào dùng thật để AI có dữ liệu thật. **Đây là bước giá trị nhất còn lại** — mọi tính năng nội bộ chính đã xong
2. **Chờ tài khoản ngoài**: Google Calendar 2 chiều (Google Cloud OAuth) · gửi email báo giá/hóa đơn (SMTP/Resend) · đối soát ngân hàng · e-sign
3. **v3.6 tùy chọn**: custom dashboard builder · đào tạo nhân sự · kéo số liệu Facebook Ads/ClickUp về báo cáo (n8n qua API mở v3.3)
