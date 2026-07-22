# Phase 3 — Project Execution Health

## Product invariant

Project không phải Task list. Project là lớp ra quyết định trả lời: delivery có đang đi đúng nhịp, dependency nào đang chặn, capacity hiện tại có đủ và target margin còn khả thi hay không.

Phase 3 không tạo một kho Project/Task/TimeLog mới. Mọi read model đều được tổng hợp từ canonical ERP records: `Project`, `Task`, `TimeLog`, `Phase`, `Milestone`, `WorkQueueState`, `VendorBill` và `Invoice`.

## Decision surface

Dashboard hiển thị trước phần CRUD hiện hữu:

- Delivery risk theo deadline, progress gap, task/milestone trễ.
- Blocked, waiting, unassigned và unresolved dependency.
- Dependency cycle cần can thiệp thủ công.
- Capacity theo WIP toàn hệ thống và giới hạn hàng đợi.
- Estimate coverage, declared TimeLog burn và remaining estimate.
- Phase health để drill xuống luồng thực thi.
- Planning cost/margin/cash contribution proxy cho role được phép xem tiền.

Task/Phase editor cũ vẫn tồn tại trong `Execution drill-down`, đóng mặc định. Vì vậy ERP workflow không mất đi, nhưng task list không còn chiếm vị trí của Project health.

## Evidence và confidence

`TimeLog` hiện là dữ liệu tự khai báo (`declared_timelog`), không phải observed truth. Số giờ này không được dùng để suy luận năng suất, xếp hạng, lương, Gold hoặc kỷ luật.

Confidence ceiling giữ ở `medium` cho tới khi một phase governance sau có validated evidence, employee notice và quy trình dispute phù hợp. Thiếu estimate hoặc dữ liệu thì hệ thống hiển thị confidence thấp/chưa đủ dữ liệu thay vì tạo certainty giả.

## Finance bridge

Phase 3 chỉ cung cấp planning proxy:

- Revenue target = `Project.budget`.
- Labor accrued proxy = declared TimeLog × đơn giá server-side.
- Vendor committed = tổng VendorBill của Project.
- Planning margin proxy = budget − labor proxy − vendor commitment.
- Cash contribution proxy = collected invoices − labor proxy − paid vendor bills.

Các số này không phải accounting profit. Salary/hourly rate không rời server; người không có money authorization không query VendorBill/Invoice và không nhận financial snapshot. Phase 5 mới nối accounting cost thật, invoice recognition và profitability.

## UX và anti-ranking

- Project list và Portfolio dùng text label kèm màu cho health.
- Action controls có touch target tối thiểu 44px.
- Detail reflow trên màn hình 700px và hỗ trợ reduced motion.
- Capacity members sắp theo alphabet; không sort theo giờ, score hoặc output.
- Portfolio ghi rõ resource context không phải performance score/bảng xếp hạng.
- Các signal luôn có source và explanation.

## Data model và rollout

Phase 3 chỉ thêm read model/API/UI và không cần schema migration. Nó dùng migration Phase 0–2 đã có trên database staging cô lập của `crmegoric-realms-demo`.

Không có deploy trong phase này nếu chưa qua full QA, staging smoke và safety gate. Tuyệt đối không deploy sang `erp-egoric.vercel.app`.

## Verification

```text
npm run audit:project
npm run audit:project:check
node --test tests/project-execution-health*.test.mjs tests/project-stats.test.mjs
npm run build
npm run staging:smoke:execution
```

Staging smoke tạo một Project, Phase, Milestone, hai Task (gồm blocker/dependency), declared TimeLog và Director account tạm. Nó xác minh authorization, Project Health API, anti-ranking policy, finance proxy, Project UI desktop/mobile và `Execution drill-down` đóng mặc định; mọi fixture/receipt/event/audit sau đó được dọn trong `finally`.

Definition of Done:

- Một canonical Project store; không có shadow task/project database.
- Domain rule phát hiện deadline risk, blocker, dependency cycle và WIP constraint.
- TimeLog có provenance, không được gọi là observed truth.
- Finance bị authorization-gate và chỉ được gọi là planning proxy.
- Detail, list và Portfolio cùng dùng `project-execution-health-v1`.
- Task CRUD hiện hữu được giữ trong progressive drill-down.
- Không employee ranking, presence-as-productivity, payroll, Gold hoặc accounting-profit claim.
- Không chạm Lead Snapshot v1, `lib/leozops` hoặc `tests/leozops-*`.
