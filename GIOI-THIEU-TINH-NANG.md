# 📘 Agency ERP — Giới thiệu toàn bộ tính năng (v3.9)

> Danh mục đầy đủ **36 module** theo 8 nhóm. Bản web đẹp có mục lục: xem artifact "Agency ERP — Toàn bộ tính năng" (link do CEO giữ).
> Sổ tay thao tác theo vị trí: `SO-TAY-SU-DUNG.md` hoặc menu **Cẩm nang sử dụng** trong app.

**Hệ thống**: 3 doanh nghiệp độc lập (Egoric · AIm · Vnecom) + Master Dashboard cho CEO · 7 nhóm quyền cộng dồn được · mọi che chắn thực thi từ tầng API.

---

## 1 · Cá nhân & cộng tác (mọi người)
| Tính năng | Nội dung chính |
|---|---|
| **Bảng điều khiển** | KPI theo vai trò + **AI Summary** mỗi sáng (nợ quá hạn, deal ứ đọng, việc trễ, SLA, dự báo…) kèm link nhảy thẳng nơi xử lý |
| **Việc của tôi** | Việc quá hạn / hôm nay / 7 ngày, chờ tôi duyệt, lịch hẹn, giờ tuần — bấm ✔ xong ngay tại dòng |
| **Lịch + ICS** | 6 loại sự kiện một lịch; Link ICS subscribe vào Google/Apple Calendar |
| **Tin nhắn nội bộ** | Kênh chung, nhóm, 1-1, đếm chưa đọc; rule tự động bắn được tin vào kênh |
| **Thông báo 🔔** | Được gán việc/ticket, được duyệt, có bình luận, việc định kỳ tạo kỳ mới |
| **Tìm kiếm Ctrl+K** | Tìm mọi thứ từ mọi trang, tôn trọng phân quyền |
| **Cẩm nang trong app** | Hướng dẫn tự đổi theo vai trò người đăng nhập, in được |
| **PWA** | Cài lên màn hình chính điện thoại, chạy như app |

## 2 · CRM & Bán hàng
| Tính năng | Nội dung chính |
|---|---|
| **Pipeline khách tiềm năng** | Kanban 6 giai đoạn · **AI Lead Score 0-100** · tự chia lead cho AM ít deal nhất · cảnh báo lead nguội 48h · AM chỉ thấy deal mình |
| **Dự báo doanh thu** | Xác suất chốt theo giai đoạn × giá trị × ngày dự kiến chốt → biểu đồ 3 tháng so mục tiêu |
| **Khách hàng 360°** | KPI từng khách (doanh thu, công nợ, NPS/CSAT) + **danh bạ nhiều người liên hệ** + **timeline gộp** mọi tương tác; nhân viên thường bị che thông tin thương mại |
| **Hoạt động CRM** | Gọi/họp/email/ghi chú theo khách hoặc deal; lịch hẹn lên Lịch + Việc của tôi |
| **Báo giá + bảng giá** | Chọn từ bảng giá chuẩn, VAT tự tính, **📧 gửi email khách** / in PDF, ≥50tr tự xin CEO duyệt, 1 nút thành hóa đơn/dự án |
| **Hoa hồng sales** | Theo hóa đơn, tỷ lệ mặc định công ty, kế toán duyệt chi |
| **Ticket + SLA** | SLA theo ưu tiên đếm ngược, cảnh báo vỡ, CSAT 1-5⭐ sau xử lý |
| **NPS + CSAT** | Khảo sát sau dự án/ticket; điểm vào Analytics + hồ sơ khách; khách im ắng 45 ngày bị đánh dấu churn |

## 3 · Vận hành dự án
| Tính năng | Nội dung chính |
|---|---|
| **Dự án** | Ngân sách, tiến độ, deadline (trễ bị AI réo), **lợi nhuận từng dự án**, gắn link tài liệu |
| **Công việc (kanban)** | 4 cột kéo thả · **checklist bước con** · **bình luận** (chuông người phụ trách) · **⏱ ghi giờ trong thẻ** · **phụ thuộc ⛓** (chặn cả ở API) · **định kỳ 🔁** tự tạo kỳ sau |
| **Gantt + mốc** | Toàn cảnh + vạch Hôm nay, mốc kickoff/golive/nghiệm thu, mũi tên chuỗi phụ thuộc |
| **Chấm công giờ** | Log theo dự án, billable, CSV; đầu vào cho utilization + chi phí dự án; thấy theo phạm vi mình/nhóm/hết |
| **Nguồn lực** | Ma trận giờ theo tuần (đỏ = quá tải >40h), việc mở/quá hạn từng người, **+ Gán việc** tại chỗ |

## 4 · Tài chính (nhân viên thường bị chặn hoàn toàn)
| Tính năng | Nội dung chính |
|---|---|
| **Hóa đơn** | Thu **từng phần** (đủ thì tự "Đã thu" + ghi sổ), **retainer định kỳ tự sinh**, 📧 email / in PDF, quá hạn vào aging + AI nhắc |
| **Thu/Chi** | Danh mục chuẩn agency, CSV; **chi ≥10tr qua Kế toán duyệt** (≥50tr thêm CEO) |
| **Công nợ & Dự báo** | Aging AR/AP theo tuổi nợ, **ngân sách tháng** (cam 80%/đỏ 100%), dự báo dòng tiền 3 tháng |
| **Mua hàng/NCC** | NCC rating, hóa đơn đầu vào theo dự án, thanh toán qua duyệt tự ghi sổ, **RFQ so giá** |
| **Hợp đồng** | Khách/NCC/lao động, nhắc hết hạn 30 ngày, in PDF |
| **Bảng lương VN** | BHXH 10.5% + 21.5%, giảm trừ, **thuế TNCN lũy tiến 7 bậc**; nháp → chỉnh → chốt khóa sổ; ai xem phiếu nấy |
| **Analytics** | **MRR/ARR · LTV · CAC · LTV/CAC · cohort retention** theo tháng |
| **Báo cáo** | Dòng tiền 12T, cơ cấu chi, phễu deal, lợi nhuận dự án, top khách, VAT quý, **in báo cáo tháng** |

## 5 · Nhân sự
| Tính năng | Nội dung chính |
|---|---|
| **Hồ sơ & nhóm** | Vai trò **cộng dồn** (kiêm nhiệm tick thêm ô), chức danh tùy biến theo công ty, nhóm + trưởng nhóm |
| **Hồ sơ 360°** | Việc mở, giờ công, **phép còn lại**, chấm công, tài sản giữ, OKR, điểm đánh giá, sinh nhật |
| **Chấm công ngày** | Đi làm/Remote/Nghỉ, tổng công tháng, HR quản trị |
| **Nghỉ phép + quota** | Quota năm tự trừ, cảnh báo vượt; chuỗi duyệt Trưởng nhóm → HR (>3 ngày) |
| **Tuyển dụng** | Kanban ứng viên 6 vòng |
| **Onboarding tự động** | "Nhận việc" → tự tạo checklist ngày đầu + nhắc HR |
| **Đánh giá quý** | Tự chấm 5 tiêu chí ⭐ → quản lý chấm + chốt → điểm vào hồ sơ |
| **OKR + Tài sản** | Mục tiêu quý công ty/cá nhân; tài sản gắn người giữ, nhắc gia hạn license, giá ẩn với nhân viên |

## 6 · Quản trị & bảo mật
| Tính năng | Nội dung chính |
|---|---|
| **Máy phê duyệt đa bước** | Báo giá lớn → CEO · chi lớn → KT(+CEO) · NCC · nghỉ phép; trùng vai trò tự duyệt; badge đỏ việc chờ |
| **Phân quyền 7 nhóm** | 3 lớp: menu theo vai trò → phạm vi dữ liệu (mình/nhóm/hết) → che từng trường (lương, liên hệ, giá tài sản) — chặn từ API |
| **2FA TOTP** | Tự bật nút 🛡, Google Authenticator; CEO reset khi mất máy |
| **Tự động hóa KHI-THÌ** | Điều kiện trên dữ liệu → nhắn kênh / tạo việc / gọi webhook, template {trường} |
| **Nhật ký audit** | Mọi thao tác của mọi người, kể cả qua API và email đã gửi |
| **Cài đặt công ty** | Ngưỡng duyệt, xác suất forecast, quota phép, hoa hồng, chức danh, SMTP, Claude key |

## 7 · AI
| Tính năng | Nội dung chính |
|---|---|
| **AI Summary** | 13 loại insight đọc từ dữ liệu thật, lọc theo vai trò người xem |
| **AI Lead Score** | Chấm 0-100 từng deal theo giá trị/nguồn/đầy đủ/tiến độ, phạt deal để lâu |
| **AI Copilot (Claude)** | Chat tiếng Việt với dữ liệu công ty, soạn email/proposal; ngữ cảnh lọc theo quyền; cần API key trong Cài đặt |

## 8 · Nền tảng & tích hợp
| Tính năng | Nội dung chính |
|---|---|
| **Đa doanh nghiệp + Master** | 3 công ty tách tuyệt đối; Master Dashboard tổng hợp KPI + insight cả 3 (mật khẩu riêng CEO) |
| **API mở** | REST `/api/v1/*` với API key mang vai trò — qua đúng RBAC + phê duyệt; nối n8n/Zapier |
| **Webhook** | Bắn POST khi dữ liệu đổi, lọc sự kiện, ký HMAC-SHA256 |
| **Email SMTP** | Hộp thư riêng từng công ty, gửi báo giá/hóa đơn đúng brand |
| **Import/Export** | Import trọn bộ từ bản v1; CSV (BOM UTF-8) cho khách/pipeline/hóa đơn/thu chi/giờ công |
| **Hạ tầng** | Vercel Singapore + Supabase Postgres, deploy 3 công ty một lệnh, backup 7 ngày |

**⏳ Chờ tài khoản ngoài**: Google Calendar 2 chiều (OAuth) · đối soát ngân hàng · e-sign. *(ERP → Calendar một chiều đã chạy qua ICS.)*
