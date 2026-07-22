# Phase 2 — Resource Intelligence

## Product invariant

Estimate không phải Actual. Actual không phải Historical. Phase 2 luôn hiển thị riêng nguồn, confidence và giải thích; không gộp ba dữ liệu thành một performance score.

Task, TimeLog và authorization ERP hiện hữu tiếp tục là source of truth. Resource Intelligence chỉ là read model và canonical estimate action trên cùng Task, không tạo task/time store song song.

## Ba nguồn dữ liệu

1. **Estimate**: `Task.estHours`. Revision mới được ghi append-only vào `WorkEstimateRevision`.
2. **Actual**: tổng `TimeLog.hours` gắn với Task. TimeLog hiện là dữ liệu người dùng tự khai báo, vì vậy UI ghi rõ `declared_timelog` và `isObservedTruth = false`.
3. **Historical**: median và average của Task đã hoàn tất cùng `workType`; chỉ ưu tiên cùng `complexity` khi có ít nhất 3 mẫu.

Không phân loại Task bằng suy đoán từ title. Khi thiếu taxonomy hoặc mẫu, hệ thống hiển thị `Chưa đủ dữ liệu` thay vì tạo baseline giả.

## Confidence ceiling

- 0 mẫu: `unrated`.
- 1–2 mẫu: `low`.
- Từ 3 mẫu: `medium`.

Phase 2 cố ý đặt confidence ceiling ở `medium` vì TimeLog chưa phải observed/validated evidence. Chỉ một phase governance sau, với employee notice và validation workflow được phê duyệt, mới có thể xem xét confidence cao hơn.

## Canonical action

`task.estimate` đi qua RepositoryRealms:

- Assignee được gửi `declared` estimate cho Task của chính mình.
- PM/Lead/Director được gửi `manager_adjustment` trong scope và bắt buộc có reason code + explanation.
- Task terminal bị khóa.
- `workVersion` CAS chống ghi đè đồng thời.
- Receipt, `WorkEstimateRevision`, `WorkItemEvent` và `AuditLog` được ghi trong cùng transaction.
- Replay cùng idempotency key không tạo revision thứ hai.

Generic ERP Task CRUD vẫn được giữ để không phá workflow gốc. Estimate legacy chưa có revision được gắn nguồn `legacy_declared`; UI mới dùng canonical action làm đường nâng cấp dần.

## Advisory signals

Phase 2 có thể báo:

- Thiếu estimate.
- Estimate đã được TimeLog sử dụng hết trong khi Task chưa xong.
- Estimate lệch tối thiểu 75% so với historical median khi có ít nhất 3 mẫu.
- Final TimeLog lệch tối thiểu 50% so với estimate.

Mọi cảnh báo đều có explanation và chỉ hỗ trợ manager review. Không tự động bác estimate, chuyển trạng thái, giao việc, thưởng Gold, trừ lương, kỷ luật hoặc xếp hạng nhân sự.

## UX

- My Work cho nhân viên xem và cập nhật estimate có receipt.
- Team Work cho manager xem estimate/TimeLog/historical trên từng Task và hiệu chỉnh có lý do.
- Mọi trạng thái có text label, không chỉ dùng màu.
- Input và button tối thiểu 44px; layout reflow ở 720/980px; reduced motion được giữ.
- Dashboard có text alternative thay cho chart trang trí, giúp screen reader đọc đầy đủ số liệu.

## Data model và rollout

Migration `20260720230000_add_resource_intelligence` chỉ thêm `WorkEstimateRevision`, index và FK cascade tới Task. Không có `DROP`, `DELETE` hoặc thay đổi dữ liệu Task/TimeLog hiện tại.

Audit không tự động áp migration. Ngày 2026-07-20, sau khi full QA/build pass, migration đã được áp bằng staging migration gate vào database cô lập của `crmegoric-realms-demo`: 11 migration records, 72 Prisma tables và zero schema drift. Không có application deployment và không chạm `erp-egoric.vercel.app`.

## Verification

```text
npm run audit:intelligence
npm run audit:intelligence:check
node --test tests/resource-intelligence*.test.mjs
npm run staging:smoke:execution
```

Staging smoke tạo một user + Task tạm, xác minh login, `task.estimate`, receipt, idempotent replay, enriched My Work/Team Work read model và UI desktop/mobile. Cuối lượt chạy, Task, receipt, revision, event, audit và user tạm đều được dọn sạch.

Definition of Done:

- Estimate/Actual/Historical tách nguồn và có provenance label.
- Taxonomy, baseline, confidence và variance deterministic.
- Canonical action có scope, CAS, receipt, revision và audit.
- Không có employee ranking hoặc presence-as-productivity.
- Desktop/mobile/reduced-motion và keyboard form controls được kiểm tra.
- Không chạm Lead Snapshot v1, `lib/leozops` hoặc `tests/leozops-*`.
