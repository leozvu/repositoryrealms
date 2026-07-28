# Phase 15 — Four-eyes Launch Approval Runbook

Runbook này chỉ áp dụng cho staging clone `crmegoric-realms-demo`. Phase 15 không tự bật pilot, không deploy production và không thay ERP/CRM đang vận hành.

## 1. Khi nào cần Director thứ hai

- Mọi thay đổi được dry-run phân loại là `Mở rộng cohort` phải do một Director tạo và một Director khác duyệt.
- Mở từ `off → pilot/open`, thêm người/vai trò, bật feature hoặc đổi giao diện mặc định sang Realm đều là expansion.
- Thu hẹp cohort, tắt feature hoặc đưa mặc định về ERP vẫn có thể áp dụng ngay sau dry-run.
- `mode = off` là kill switch khẩn cấp và luôn áp dụng trực tiếp, không chờ approval.

## 2. Maker gửi yêu cầu

1. Director A chuẩn bị policy, ưu tiên cohort `Nhân sự cụ thể` gồm 3–8 người và giữ ERP làm mặc định.
2. Chạy `Controlled launch dry-run`; mọi blocking gate phải đạt.
3. Khi risk là expansion, CTA chuyển thành `Gửi Director khác duyệt`.
4. Sau khi gửi, policy đang chạy không đổi. Yêu cầu xuất hiện trong `Bàn duyệt phát hành` và Approval Inbox ERP.

Token dry-run 10 phút chỉ dùng để tạo yêu cầu. Proposal sau đó có TTL **24 giờ**, được khóa theo policy version + SHA-256 digest và mã hóa AES-256-GCM. Database không lưu roster chờ duyệt ở dạng plaintext trong `Approval.payload`.

## 3. Checker duyệt

1. Director B mở `Bàn duyệt phát hành` hoặc `Phê duyệt` từ notification ERP.
2. Đối chiếu maker, thời điểm, policy version, số người được mở Realm và số người fallback ERP.
3. Bấm `Duyệt & áp dụng` hoặc `Từ chối`.
4. Server kiểm tra lại TTL, maker khác checker, digest, policy version, active member và live readiness.
5. Claim Approval, ghi `Setting.realmPilot` và AuditLog chạy trong cùng transaction `Serializable`.

Nếu policy nguồn đã đổi hoặc proposal hết hạn, yêu cầu cũ bị đóng và policy không đổi. Nếu blocker mới xuất hiện, approval vẫn chờ để checker thử lại sau khi sự cố được xử lý.

## 4. Privacy và audit

- UI/API approval chỉ trả số lượng tổng hợp, không trả roster, thời lượng hoặc dữ liệu hiệu suất.
- Audit giữ approval ID, maker/checker ID, preview ID, risk và số đếm tổng hợp; không sao chép member ID.
- `Approval` và `Setting` là model ERP hiện hữu; Phase 15 không thêm migration hoặc bảng launch song song.
- Notification và change feed giúp người đang ở ERP biết yêu cầu phát hành dù họ không mở Realms.

## 5. Incident / rollback

Nếu Realm cần dừng ngay:

1. Chọn `Tạm đóng` (`mode = off`).
2. Bấm `Kích hoạt kill switch`.
3. Xác minh `/realm` fallback về `/dashboard` và ERP/CRM tiếp tục hoạt động.
4. Không restore database và không rollback migration chỉ để tắt Realm.

## 6. Verification gate

```powershell
npm run audit:realm:launch-approval:check
npm run qa
npm run test:e2e
```

Exit criteria:

- Maker không thể thấy hoặc thực thi nút duyệt yêu cầu của chính mình.
- Ciphertext bị sửa, secret sai, version/digest stale hoặc approval hết hạn đều không thay đổi policy.
- Blocker mới được phát hiện trước claim; approval và Setting giữ nguyên.
- Restriction và kill switch vẫn khả dụng để giảm blast radius.
- Desktop, viewport 375 px, keyboard focus, disabled/loading state và reduced-motion đều qua QA.
