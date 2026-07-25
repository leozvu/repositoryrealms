# Chương 4 — Ranh giới LÕI vs ĐẶC THÙ (chuẩn bị bán ra)

Cập nhật 2026-07-24 · Quyết định founder: **nội bộ trước, bán ra sau**

Mục đích: khi nào quyết định bán ra, biết chính xác phần nào bán được nguyên trạng, phần nào là riêng của Leoz Group phải gỡ. Viết SỚM để không phải khảo cổ code sau này.

## Tin tốt: kiến trúc đã sẵn sàng phần khó nhất

Hệ đã chạy **1 codebase → nhiều công ty** suốt 2 năm: mỗi công ty một Postgres schema, cách ly hoàn toàn dữ liệu/người dùng/cài đặt, bật/tắt phân hệ theo công ty (`Setting.modules`, `lib/modules.js`). Đây là phần đắt nhất của một sản phẩm SaaS đa khách hàng — đã có sẵn và đã kiểm chứng bằng 5 deployment thật.

## Ba tầng

### Tầng 1 — LÕI (bán được nguyên trạng)
ERP/CRM phổ quát mọi doanh nghiệp dịch vụ đều cần:

- CRM: khách tiềm năng, khách hàng, báo giá, bảng giá, ticket
- Vận hành: dự án, công việc, Gantt, mẫu dự án, nguồn lực, chấm công giờ
- Tài chính: hóa đơn, thu chi, công nợ, mua hàng/NCC, hợp đồng, báo cáo tài chính
- Nhân sự: hồ sơ, lương chuẩn VN (BHXH/thuế lũy tiến), nghỉ phép, tuyển dụng, đánh giá
- Nền tảng: RBAC 8 vai trò, máy phê duyệt đa bước, audit log, API mở + webhook + automation, import/export, PWA
- Execution Engine (Việc của tôi kéo thả, Quản lý công việc)

### Tầng 2 — TÙY CHỌN (bán kèm, bật/tắt theo khách)
Có giá trị với một số khách, không phải tất cả:

| Cụm | Ai cần |
|---|---|
| **Xuất nhập khẩu** (vùng trồng, lô hàng, chứng từ, đa tiền tệ) | DN xuất khẩu nông sản — **điểm khác biệt lớn nhất**, các ERP phổ thông làm rất yếu |
| **Livestream** (ca live, đối soát sàn, công host, vi phạm) | DN bán hàng livestream — cũng là mảng ít đối thủ |
| **Realm/Gold** (điểm ghi nhận, huy hiệu, quy đổi thưởng) | DN muốn gamify động lực |
| **Freelancer** (cổng riêng, thanh toán theo job) | Agency dùng cộng tác viên |

Hai cụm dọc XNK + Livestream là **thứ khó copy nhất** — nếu bán ra, đây là lý do khách chọn mình thay vì MISA/Base.

### Tầng 3 — ĐẶC THÙ LEOZ GROUP (phải gỡ trước khi bán)
Những thứ chỉ đúng với group này:

| Thành phần | Vì sao đặc thù | Việc phải làm khi bán |
|---|---|---|
| **CEO Terminal** (`app/(app)/ceo-*`, `lib/ceo-*`, `app/api/ceo/*`) | Danh sách 4 công ty, registry, rollout rings, khóa chéo | Tổng quát hóa thành "multi-entity add-on", bỏ hardcode entity id |
| Danh sách entity trong `lib/ceo-entity-registry.js`, `scripts/provision-ceo-terminal.mjs` | Tên aim/egoric/vnecom/egolive | Đọc từ cấu hình thay vì hằng số |
| Bản đồ vương quốc (`CEO_FEDERATION_KINGDOMS`) | Gán tên/vị trí cho đúng 4 công ty | Sinh động theo số entity |
| Nội dung Realm tiếng Việt + mỹ thuật medieval | Bản sắc riêng | Tách thành theme thay được |
| `docs/realms/*` (25 phase, runbook nội bộ) | Lịch sử dự án | Không phát hành |

## Nếu quyết định bán ra — thứ tự việc

1. **Đóng gói khách hàng mới**: hiện tạo công ty mới vẫn cần chạy script + tạo Vercel project tay. Cần luồng tự phục vụ (đăng ký → tạo schema → bootstrap → xong).
2. **Gỡ hardcode entity** (bảng Tầng 3 ở trên).
3. **Tài liệu người dùng cuối** — hiện tài liệu viết cho nội bộ (`SO-TAY-SU-DUNG.md`, `GIOI-THIEU-TINH-NANG.md`) là nền tốt, cần biên tập lại.
4. **Chịu tải**: hiện mỗi công ty một schema — tốt cho cách ly nhưng cần đánh giá lại khi số khách lớn (Supabase free tier có giới hạn).
5. **Hỗ trợ khách**: chưa có gì — cần kênh báo lỗi, SLA, môi trường staging riêng.

**Chưa làm bước nào trong 5 bước trên** — đúng chủ trương "nội bộ trước". Tài liệu này để khi cần thì biết bắt đầu từ đâu, không phải khảo sát lại.

## Nguyên tắc giữ trong lúc làm nội bộ

Mỗi khi thêm tính năng, hỏi: *"cái này thuộc Tầng 1, 2 hay 3?"* — nếu là Tầng 3, đặt nó sau một cấu hình hoặc một module bật/tắt thay vì viết thẳng vào lõi. Làm được vậy thì việc tách sau này gần như không tốn công.
