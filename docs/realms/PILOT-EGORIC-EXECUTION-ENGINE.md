# Evidence vận hành Execution Engine — đo thụ động trên người dùng THẬT (không cohort)

Cập nhật: 2026-07-24 · Quyết định founder: mọi entity đã vận hành thật với tài khoản thật — KHÔNG lập cohort riêng, không nghi thức pilot. Evidence thu thụ động từ dữ liệu hệ thống đã ghi sẵn.

## Cách đo (0 công vận hành, 0 code mới)

Hệ thống đã tự ghi mọi thứ cần thiết. Sau **2 tuần** (từ 24/7 → 07/8/2026), chạy script read-only tổng hợp trên cả 4 schema công ty:

| Chỉ số | Nguồn có sẵn |
|---|---|
| Số lần nhân sự tự sắp thứ tự (kéo thả/▲▼/Xếp theo deadline) | `RealmActionReceipt` action `task.reprioritize` |
| Chuyển trạng thái việc qua cockpit | `WorkItemEvent` |
| Điều phối của quản lý (giao/block/escalate/split/merge) | Receipts tương ứng |
| Việc trễ hạn trước/sau | `Task.dueDate` vs `completedAt`, so tuần −2 với tuần +2 |
| Lệnh liên công ty từ CEO Terminal | `CeoCommandDelivery` + receipts 2 đầu |
| Phản hồi định tính | Nút "Phản hồi pilot" (đã có ở góc màn hình) — ai vướng gì bấm thẳng |

**Ranh giới giữ nguyên theo policy trong code:** số liệu đánh giá TÍNH NĂNG, không xếp hạng/chấm điểm cá nhân; không đo thời gian online; TimeLog là tự khai báo.

## Ngưỡng quyết định sau 2 tuần (07/8)

- **Đầu tư tiếp** (mở ring commands cho AIm/Vnecom/Egolive, làm Đợt 1 tối ưu terminal sâu hơn): có sử dụng thật đều đặn ở ≥2 công ty và không bug chặn mới.
- **Tinh chỉnh**: dùng lác đác + phản hồi chỉ ra ma sát cụ thể.
- **Dừng đầu tư thêm phần này**: nhân sự quay về thói quen cũ (Zalo/kanban) — dữ liệu receipts ≈ 0.

Trong cửa sổ này: **không thêm tính năng lớn mới** (đúng chỉ thị); hotfix lỗi chặn vẫn làm bình thường.
