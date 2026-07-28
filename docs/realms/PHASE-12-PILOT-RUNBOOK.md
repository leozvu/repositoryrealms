# Phase 12 — Realm Pilot Launch & Rollback Runbook

Runbook này chỉ dành cho staging clone `crmegoric-realms-demo`. ERP/CRM hiện hữu là source of truth; Realm là một surface bổ sung, không phải hệ thống nghiệp vụ thứ hai.

## 1. Điều kiện trước pilot

- Xác minh Git đang ở `codex/realms-demo`; không chạy từ `main` hoặc `feat/leozops-s1a`.
- Xác minh Vercel project là `crmegoric-realms-demo`; không deploy vào `erp-egoric.vercel.app`.
- Chạy `npm run qa` và `npm run test:e2e` với cấu hình staging.
- Chạy `npm run staging:migrations:plan` và `npm run staging:migrations:verify` ở chế độ read-only với đúng approval token của staging. Phase 12 không có migration mới.
- Trong Settings → Realm Pilot Control, chọn `Pilot theo vai trò`, để giao diện mặc định là ERP và bắt đầu với cohort 5–10 người.
- Release readiness không được có blocking gate. Tavern có thể tắt để pilot Office trước.
- Chụp snapshot/backup bằng cơ chế của nhà cung cấp staging trước buổi pilot. Không dùng `restore-db.js --commit` như một bước rollout thông thường.

## 2. Smoke test cohort

1. Thành viên cohort đăng nhập vào ERP tại `/login` và hoàn tất hoặc bỏ qua onboarding.
2. Xác minh `/dashboard` vẫn tải đầy đủ dữ liệu ERP, quyền và module hiện hữu.
3. Mở Realm, kiểm tra presence và liên hệ chéo surface với một người chỉ dùng ERP.
4. Mở một Task/Lead/Project từ Realm và xác minh record đích vẫn là route ERP.
5. Gửi một phản hồi Guild Support, xác minh Ticket ERP, notification và audit.
6. Nếu Tavern bật, chạy một yêu cầu đổi thưởng thử với maker–checker; không chỉnh Gold trực tiếp.
7. Kiểm tra desktop và viewport 375px: không tràn ngang, target tương tác tối thiểu 44px, keyboard focus nhìn thấy được.

## 3. Telemetry được phép

- Chỉ dùng số tài khoản đủ điều kiện, lựa chọn surface và số người online đã deduplicate.
- Chỉ dùng số lượng Ticket Guild Support theo trạng thái/impact.
- Không lưu thời lượng ở Realm, keystroke, lịch sử duyệt, nội dung record, điểm hiệu suất hoặc bảng xếp hạng cá nhân.
- Tiến độ onboarding nằm trong localStorage của thiết bị và không gửi lên server.

## 4. Kill switch và rollback

Khi có lỗi blocker hoặc nghi ngờ sai dữ liệu:

1. Director vào ERP Settings và đặt policy `mode = off`.
2. Xác minh người dùng mới vào `/dashboard`; menu Realm bị ẩn và API Realm từ chối thao tác mới.
3. Giữ nguyên database, ledger, Ticket, AuditLog và record ERP để điều tra có bằng chứng.
4. Ghi request ID, thời điểm, route, cohort bị ảnh hưởng và Ticket Guild Support; không thu nội dung riêng tư ngoài phạm vi đã khai báo.
5. Chỉ mở lại cohort sau khi fix đã qua QA và release readiness không còn blocker.

Không đảo migration trong rollback pilot. Không restore dữ liệu chỉ vì tắt Realm. Restore là quy trình disaster recovery riêng, có phê duyệt và rehearsal trên một clone cô lập trước khi dùng `restore-db.js --commit`.

## 5. Phân loại sự cố

- SEV-1: nguy cơ sai/mất dữ liệu ERP, vượt quyền, lộ dữ liệu. Tắt Realm ngay, giữ bằng chứng, dừng pilot.
- SEV-2: workflow chính bị chặn nhưng ERP fallback còn hoạt động. Tắt feature Office/Tavern/Guild Support liên quan hoặc toàn Realm.
- SEV-3: lỗi giao diện/copy không chặn công việc. Ghi Ticket, giữ cohort nhỏ và xử lý theo SLA.

## 6. Exit criteria

- Không còn Ticket impact `blocked` đang mở.
- Không có regression trong ERP gốc, RBAC, notification, Task/Lead/Project và Gold ledger.
- Cohort xác nhận có thể đổi surface và cộng tác với người chỉ dùng ERP.
- Director đã rehearsal kill switch về `/dashboard` trên staging.
- QA, audit artifacts và authenticated desktop/mobile UAT đều pass.
