# Đối chiếu yêu cầu ERP đầy đủ ↔ hệ thống hiện tại
> Cập nhật 12/07/2026 — sau v2.4. Ký hiệu: ✅ đã có · 🟡 có một phần · 🔨 nên xây tiếp · 🔌 nên tích hợp dịch vụ ngoài (không tự xây) · ⛔ không phù hợp agency 10–25 người

| # | Nhóm yêu cầu | Trạng thái | Ghi chú |
|---|---|---|---|
| I | **CEO Dashboard + AI Summary** | ✅ | Doanh thu, lợi nhuận, AR/AP, pipeline + conversion, khách active, utilization, burn rate, project health, ticket/SLA, việc hôm nay + **AI Summary** (churn, quá hạn, deal ứ đọng, hợp đồng hết hạn…) lọc theo vai trò |
| II | **CRM** (lead, contact, company, pipeline, activity) | ✅ | Pipeline kanban + **AI Lead Score**, khách hàng + nhật ký hoạt động, nguồn lead. 🔨 v tiếp: company nhiều contact, timeline gộp email/call |
| III | **Sales** (quote→contract→invoice→recurring) | ✅ | Báo giá→hóa đơn→thu từng phần→retainer + hợp đồng + duyệt theo ngưỡng. 🔨: hoa hồng sales, forecast theo pipeline. 🔌 E-sign: DocuSign/SignNow |
| IV | **Marketing** (email, automation, ads, funnel) | 🔌 | Nên dùng Mailchimp/Brevo (email), còn **Facebook Ads + ClickUp bạn đã kết nối trong Claude** — tôi có thể kéo số liệu ads về báo cáo. 🔨 nhỏ: UTM/coupon tracking |
| V | **Customer Success** (ticket, SLA, NPS, churn) | 🟡→✅ | **Ticket + SLA tự tính theo ưu tiên + cảnh báo vỡ SLA đã xong**; churn prediction dạng rule đã chạy trong AI Summary. 🔨: NPS/CSAT khảo sát. 🔌 Live chat: Tawk.to (miễn phí) |
| VI | **Project Management** | ✅ | Kanban, deadline, tiến độ, giờ công, lợi nhuận dự án. 🔨: Gantt + dependencies + milestone (v2.5 đề xuất) |
| VII | **HR** | ✅ | Hồ sơ, chấm công ngày, nghỉ phép + duyệt, **bảng lương BHXH/TNCN**, tuyển dụng kanban, nhóm/org. 🔨: KPI/OKR quý, đào tạo |
| VIII | **Finance** | ✅ | Thu chi, hóa đơn, AR/AP aging, ngân sách, dự báo dòng tiền, **P&L 3 tháng**, VAT quý, audit log. 🔨: đối soát ngân hàng (cần API bank). ⛔ Balance sheet chuẩn kép — dùng phần mềm kế toán thuế (MISA) song song |
| IX | **Procurement** | ✅ | NCC + rating, hóa đơn đầu vào, duyệt chi, thanh toán tự ghi sổ. 🔨: RFQ so giá |
| X | **Inventory** | ⛔ | Agency dịch vụ không có kho hàng — bỏ qua trừ khi bán merch |
| XI | **Manufacturing** | ⛔ | Không thuộc mô hình agency |
| XII | **Asset Management** | ✅ | Thiết bị/license, ai giữ, gia hạn, khấu trừ giá trị với nhân viên |
| XIII | **Legal** | 🟡 | Hợp đồng + nhắc hết hạn + duyệt đã có. 🔌 chữ ký số: VNPT-CA/Viettel-CA |
| XIV | **Document** | 🔌 | Google Drive miễn phí tốt hơn tự xây; 🔨 nhỏ: gắn link tài liệu vào dự án/khách |
| XV | **Communication** | 🔌 | Zalo OA/Slack/Meet — tích hợp webhook được ở v3, không tự xây chat |
| XVI | **Calendar** | ✅ | Lịch gộp 6 loại sự kiện. 🔌 đồng bộ Google Calendar ở v3 |
| XVII | **Workflow Automation** | 🟡 | Máy phê duyệt đa bước + hóa đơn định kỳ tự sinh = automation lõi. 🔨 v3: rule builder IF/THEN. 🔌 n8n/Zapier khi có API |
| XVIII | **AI** | 🟡 | **AI Summary + Lead Score + churn detection đã chạy** (rule-based, tức thời, miễn phí). 🔨 bước lớn tiếp: **AI Copilot chat với dữ liệu** bằng Claude API — cần API key (~vài trăm k/tháng), tôi xây được khi bạn sẵn sàng |
| XIX | **Permission** | ✅ | 7 vai trò đa nhiệm, scope own/team/all, duyệt, audit. 🔨 v3: 2FA. ⛔ SSO: chưa cần ở quy mô này |
| XX | **Reporting** | ✅ | Dòng tiền, P&L, cơ cấu chi, phễu, lợi nhuận dự án, top khách, VAT, utilization. 🔨: custom dashboard builder (v3) |
| XXI | **API** | 🟡 | REST nội bộ đã chuẩn hóa; mở API key + webhook ở v3 sau khi deploy |
| XXII | **Mobile** | 🟡 | Web responsive dùng tốt trên điện thoại; PWA (cài như app + push notification) ở v3. ⛔ app native offline/GPS: chưa đáng đầu tư |
| XXIII | **Security** | 🟡 | Mật khẩu băm bcrypt, phân quyền 2 tầng, audit log; deploy Supabase có backup tự động + mã hóa. ⛔ SOC2/ISO27001 là chứng nhận tổ chức, không phải tính năng phần mềm |
| XXIV | **Analytics** (LTV, CAC, MRR, cohort) | 🔨 | Có nền dữ liệu đủ để tính LTV/MRR/retention — đề xuất làm trong v2.5 cùng Gantt |

## Đề xuất thứ tự tiếp theo
1. **Deploy cloud** (Vercel + Supabase) — đưa team vào dùng thật, mọi thứ sau đó mới có dữ liệu thật để AI phân tích
2. **v2.5**: Gantt + milestone · Analytics (MRR/LTV/CAC, retention) · KPI-OKR quý · NPS khảo sát
3. **v3.0**: AI Copilot (Claude API — chat với dữ liệu, viết email/proposal/report) · tích hợp Facebook Ads + ClickUp + Google Calendar · PWA mobile · API mở + webhook + 2FA
