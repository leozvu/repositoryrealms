# Phase 3 — Browser verification & interaction hardening

Phase 3 xác minh các candidate của Phase 2 trên clone staging; không thay production và không thay business data.

## Kết quả

- Candidate elements ban đầu: **60**
- Loading candidates ban đầu: **56**
- Destructive confirmation candidates ban đầu: **6**
- Success feedback candidates ban đầu: **5**
- Candidate elements còn lại: **0**
- Candidate flags còn lại: **0**
- Stateful actions có guard: **85** (46 AsyncButton, 36 disabled/busy binding, 3 local pending state)
- Destructive flows có xác nhận: **6/6**

## Thay đổi nền tảng

- `AsyncButton` tự khóa double-submit, gắn `aria-busy` và hiển thị trạng thái chờ.
- `FormModal` và `ConfirmDialog` chờ promise hoàn tất; lỗi không đóng modal và không làm mất dữ liệu nhập.
- `useResource` chặn mutation trùng, expose `mutating` và trả toast khi lỗi mạng.
- Login có label/input association, autocomplete đúng mục đích và live error alert.

## Destructive flows

| Flow | Source | Status | Evidence |
| --- | --- | --- | --- |
| Xóa ngày lễ | app/(app)/attendance/page.jsx | verified | setDeleting(h) + <ConfirmDialog |
| Gỡ freelancer khỏi dự án | app/(app)/freelancers/page.jsx | verified | mode: 'unassign' + <ConfirmDialog |
| Xóa webhook | app/(app)/settings/page.jsx | verified | setDeleteWebhook(h) + <ConfirmDialog |
| Xóa bình luận công việc | app/(app)/tasks/page.jsx | verified | setCommentToDelete(c) + <ConfirmDialog |
| Xóa hoạt động CRM | components/Activities.jsx | verified | setActivityToDelete(a) + <ConfirmDialog |
| Gỡ liên kết tài liệu | components/DocLinks.jsx | verified | setLinkToDelete(l) + <ConfirmDialog |

## Browser scenarios

| Scenario | Route | Evidence |
| --- | --- | --- |
| realm-erp-bridge | /realm-demo | Realm và ERP shell dùng chung hồ sơ nhân vật, Quest, Gold journal và Tavern. |
| erp-auth-boundary | /tasks | Anonymous request chuyển tới /login; ERP gốc không bị mở công khai. |
| login-accessibility | /login | Email, mật khẩu và OTP có label liên kết; lỗi dùng live alert. |
| mobile-overflow | /realm-demo | Viewport 375px không có horizontal overflow. |

## Regression gate

Chạy `npm run audit:ui:interactions:check`. Gate thất bại nếu action map xuất hiện UX candidate mới, destructive flow mất ConfirmDialog, hoặc artifact Phase 3 bị stale.

