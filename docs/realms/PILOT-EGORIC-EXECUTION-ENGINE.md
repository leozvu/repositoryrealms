# Pilot Execution Engine — Egoric (cohort có tên, thu evidence 2 tuần)

Trạng thái: chờ founder điền tên cohort · Cập nhật: 2026-07-24

## Bối cảnh & phạm vi

Execution Engine (Việc của tôi + Quản lý công việc, v3.39) đã **live cho toàn bộ người dùng 4 công ty** từ đợt deploy 23/7. Pilot này vì vậy KHÔNG phải bật/tắt tính năng, mà là **thu bằng chứng có cấu trúc trên một cohort có tên** để quyết định bước tiếp theo (mở ring commands cho các công ty còn lại, tinh chỉnh UX, hay dừng đầu tư thêm).

- **Entity pilot:** Egoric (14 tài khoản thật, ring `commands`, nhân sự đang tương tác qua 3 đợt feedback).
- **Cohort:** 1 quản lý + 3–7 nhân viên — *founder điền tên tại đây trước khi bắt đầu:*
  - Quản lý: `__________` (gợi ý: Trần Khánh Linh — Account Manager, người có nhiều lead WIP nhất theo CRM snapshot)
  - Thành viên: `__________` (3–7 người)
- **Cửa sổ:** 14 ngày kể từ ngày founder xác nhận cohort.
- **Không tính năng lớn mới trong cửa sổ pilot** (đúng chỉ thị #8) — chỉ sửa lỗi chặn (hotfix) nếu phát sinh.

## Nguồn evidence (đều đã có sẵn trong hệ thống — không cần code mới)

| Bằng chứng | Nguồn | Trả lời câu hỏi |
|---|---|---|
| Số lần tự sắp thứ tự (kéo thả/▲▼) | `RealmActionReceipt` action `task.reprioritize` + `WorkQueueState.version` | Nhân viên có thật sự dùng bảng tự sắp không? |
| Chuyển trạng thái việc qua cockpit | `WorkItemEvent` (transition) | Luồng Bắt đầu→Review→Hoàn tất có được dùng thay kanban cũ? |
| Điều phối của quản lý | Receipts `task.assign/block/escalate/split/merge` | Quản lý có điều phối qua Quản lý công việc không? |
| Việc trễ hạn trước/sau | So sánh `Task.dueDate` vs `completedAt` tuần −2 với tuần +2 | Có dịch chuyển kết quả thật không? |
| Phản hồi định tính | Nút "Phản hồi pilot" (RealmFeedbackLauncher) + phỏng vấn 15' cuối kỳ với quản lý | Đau ở đâu, giữ hay bỏ gì |

**Ranh giới đạo đức (theo policy sẵn có trong code):** dữ liệu chỉ đánh giá TÍNH NĂNG, không xếp hạng/chấm điểm cá nhân; TimeLog là tự khai báo, không dùng làm thước năng suất; không đo thời gian online.

## Tiêu chí quyết định sau 14 ngày

- **Tiếp tục mở rộng** nếu: ≥60% cohort có ≥1 lần tự sắp thứ tự/tuần VÀ quản lý dùng điều phối ≥3 lần/tuần VÀ không có bug chặn mới.
- **Tinh chỉnh rồi đo lại** nếu: dùng lác đác nhưng phản hồi định tính tích cực.
- **Dừng đầu tư thêm** nếu: cohort quay lại nhắn Zalo/kanban cũ và phản hồi cho thấy bảng không thay được thói quen.

## Việc vận hành trong kỳ

1. Ngày 0: founder điền cohort → thông báo cho cohort (mẫu tin ở dưới) → chốt số liệu baseline (việc trễ 2 tuần trước).
2. Ngày 7: đọc receipts giữa kỳ (script read-only) — nếu 0 hoạt động, hỏi cohort ngay thay vì đợi hết kỳ.
3. Ngày 14: tổng hợp bảng evidence + phỏng vấn quản lý → báo cáo quyết định cho founder.

Mẫu tin gửi cohort: *"Trong 2 tuần tới, nhóm mình dùng 'Việc của tôi' để tự sắp thứ tự việc (kéo thả) và quản lý dùng 'Quản lý công việc' để giao/điều phối. Hệ thống chỉ ghi nhận thao tác trên tính năng để đánh giá tính năng — không chấm điểm cá nhân. Gặp gì vướng bấm nút Phản hồi pilot ở góc phải."*
