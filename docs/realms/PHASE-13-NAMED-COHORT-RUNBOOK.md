# Phase 13 — Named Pilot Cohort Runbook

Phase này chuẩn bị khả năng mở pilot theo danh sách nhân sự trên đúng project staging `crmegoric-realms-demo`. Việc merge hoặc deploy production không nằm trong runbook này, và code không tự bật pilot.

## 1. Chọn cohort

- Director mở `Cài đặt → Realm Pilot Control`.
- Chọn `Pilot theo cohort → Nhân sự cụ thể`.
- Chọn nhóm nhỏ **3–8 người**, đại diện cho các workflow cần thử nhưng không dùng cohort làm mẫu đánh giá hiệu suất.
- Giữ `ERP · CRM` là giao diện mặc định. Mỗi thành viên vẫn có thể chọn Realm hoặc ERP.
- Office phải bật; Guild Support phải bật; Tavern có thể bật sau.

Danh sách tối đa 50 người. Server chỉ chấp nhận tài khoản nội bộ đang active. Nếu nhân sự vừa nghỉ hoặc bị vô hiệu hóa, request stale bị từ chối và Director phải tải lại directory.

## 2. Preflight trước khi lưu

1. Xác minh branch là `codex/realms-demo` và Vercel project là `crmegoric-realms-demo`.
2. Chạy `npm run qa` và `npm run test:e2e` với tài khoản Director staging tạm thời.
3. Mở Release readiness; mọi gate blocking phải pass.
4. Xác minh `/dashboard` hoạt động với cohort và một tài khoản ngoài cohort.
5. Xác minh Guild Support tạo Ticket ERP và không chứa dữ liệu nhập liệu ngoài phần người dùng chủ động gửi.
6. Chụp backup/snapshot staging theo nhà cung cấp trước buổi pilot.

## 3. Launch có chủ đích

Chỉ Director được phê duyệt mới bấm `Lưu chính sách pilot`. Phase 13 không tự bật pilot trên staging hay production. Sau khi lưu:

- Thành viên đích danh thấy Realm nhưng vẫn đổi về ERP được.
- Người ngoài cohort nhận fallback ERP.
- Freelancer không được vào Realm.
- Metrics chỉ hiện số đếm tổng hợp; directory không trả preference, salary hoặc dữ liệu hiệu suất.

## 4. Rollback vận hành

Khi có SEV-1 hoặc cần dừng thử nghiệm:

1. Chuyển `mode = off` bằng Realm Pilot Control.
2. Xác minh thành viên cũ mở `/realm` được đưa về `/dashboard`.
3. Xác minh ERP/CRM, Ticket, Task, Lead, Gold journal và Approval vẫn nguyên vẹn.
4. Ghi incident qua Guild Support và giữ request ID.

Không rollback migration và không restore dữ liệu chỉ để dừng pilot. Policy nằm trong Setting hiện hữu; kill switch chỉ đổi quyền vào giao diện Realm.

## 5. Tiêu chí hoàn tất

- Named cohort được server enforce và không thể bypass bằng vai trò.
- Policy cũ theo vai trò vẫn tương thích ngược.
- Roster chỉ hiện với Director; API cho người thường không chứa member ID.
- Mọi người vẫn vào ERP được; không có dữ liệu nghiệp vụ thứ hai.
- Không ghi thời lượng, key logging hoặc điểm hiệu suất cá nhân.
