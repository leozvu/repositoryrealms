# Phase 1 — Unified Execution Engine

## Product invariant

Task ERP là source of truth. My Work, Team Work và Realm chỉ là các trải nghiệm khác nhau đọc và thực thi trên cùng bản ghi Task; Phase 1 không tạo task store song song.

## Hai cockpit riêng biệt

- **My Work** (`/myday`): chỉ tải Task được giao cho người đang đăng nhập, gom thành Inbox, Tiếp theo, Đang làm, Đang chờ, Bị chặn và Đã xong.
- **Team Work** (`/teamwork`): chỉ PM/Lead/Director truy cập, hiển thị WIP, blocker, overdue và thứ tự hàng đợi trong scope được phép.
- Capacity là cảnh báo WIP. Không xếp hạng nhân sự, không dùng presence/online time làm proxy năng suất.

## Canonical manager actions

Sáu action `task.reprioritize`, `task.block`, `task.unblock`, `task.escalate`, `task.split`, `task.merge` đi qua RepositoryRealms. `task.assign` hiện có tiếp tục là action ủy quyền chuẩn. Mọi action kiểm tra authorization/scope, business rule, compare-and-swap, idempotency receipt và AuditLog. Các thay đổi cấu trúc còn ghi `WorkItemEvent` để truy vết lineage.

## Data model additive

- Task có `workVersion`, `queuePosition`, trạng thái blocker/waiting/escalation và lineage split/merge.
- `WorkQueueState` khóa version của hàng đợi theo nhân sự.
- `WorkItemEvent` liên kết một canonical receipt với biến đổi có cấu trúc.
- Migration `20260720190000_add_execution_engine` chỉ thêm field/model/index; không xóa hoặc đổi dữ liệu ERP cũ.

Audit và test không tự chạy migration. Migration chỉ được áp dụng lên staging của dự án Vercel `crmegoric-realms-demo` sau checkpoint riêng; không deploy vào `erp-egoric.vercel.app`.

## Verification

```text
npm run audit:execution
npm run audit:execution:check
node --test tests/execution-engine*.test.mjs
```
