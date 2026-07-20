# Phase 18 — Canary Activation Guard

Runbook này chỉ áp dụng cho staging clone `crmegoric-realms-demo` trên branch `codex/realms-demo`. Phase 18 không tự đổi policy, không tự mời cohort, không merge `main`, không chạm `feat/leozops-s1a` và không deploy `erp-egoric.vercel.app`.

## 1. Mục tiêu

- Bổ sung một checkpoint quan sát 90 phút ngay sau khi checker kích hoạt pilot wave.
- Fail-closed khi policy drift, live readiness có blocker, feedback mức `blocked` hoặc ERP fallback không còn sẵn sàng.
- Giữ rollback về ERP luôn khả dụng trong suốt activation.
- Không tự mở rộng cohort sau khi canary đạt; mọi expansion mới vẫn đi qua Controlled Launch và four-eyes approval.
- Tái sử dụng `realmPilotOperations` trong `Setting`, `Notification` và `AuditLog`; không có migration hoặc bảng nghiệp vụ song song.

## 2. Bắt đầu canary

1. Policy đã ở `mode = pilot`, mặc định ERP và cohort đã được phê duyệt.
2. Launch rehearsal cùng policy version còn seal hợp lệ.
3. Director A gửi pilot wave; Director B khác maker duyệt kích hoạt.
4. Trong transaction kích hoạt, server chạy lại readiness rồi tạo canary window 90 phút.
5. Baseline chỉ lưu số tổng hợp: eligible, fallback, blocker và feedback; không lưu roster hoặc hành vi cá nhân.

Không có CTA riêng để bypass maker–checker. Canary chỉ bắt đầu sau action `approve` hiện hữu của Pilot Operations.

## 3. Guardrails trong 90 phút

Canary Activation Guard kiểm tra năm điều kiện:

1. Pilot wave vẫn ở trạng thái `active`.
2. Policy vẫn là `pilot` và đúng version đã khóa với wave.
3. Live readiness không có blocking gate.
4. Không có Guild Support feedback mức `blocked` đang mở.
5. ERP vẫn là fallback an toàn.

Checkpoint chưa đủ 90 phút hoặc bất kỳ điều kiện nào không đạt đều không thể được xác nhận. Thời gian 90 phút là cửa sổ vận hành của hệ thống, không phải dữ liệu thời lượng làm việc của nhân sự.

## 4. Xác nhận canary

1. Director mở `Cài đặt → Pilot Operations → Canary Activation Guard`.
2. Đối chiếu baseline và trạng thái live aggregate.
3. Khi trạng thái là `Sẵn sàng xác nhận`, bấm `Xác nhận qua canary gate`.
4. Server recheck CAS version, policy binding và live readiness trong transaction `Serializable`.
5. Wave vẫn chỉ áp dụng cho cohort hiện tại; Notification nhắc rõ hệ thống chưa mở rộng tự động.

Canary cleared không phải phê duyệt cho wave kế tiếp và không thay thế cửa sổ Go/No-go 7–14 ngày.

## 5. Rollback về ERP

Nếu guardrail bị chặn hoặc operator cần dừng:

1. Bấm `Rollback về ERP`.
2. Xác nhận dialog nêu rõ dữ liệu được giữ nguyên.
3. Pilot Operations dùng kill switch hiện hữu để đặt `mode = off` và chuyển wave sang `paused`.
4. Cohort nhận Notification về `/dashboard`; ERP/CRM tiếp tục vận hành.
5. Không restore database, rollback migration, xóa Gold ledger, Ticket, evidence hoặc record nghiệp vụ.

## 6. Privacy và audit

- Dashboard/API chỉ trả số tổng hợp; không trả named cohort roster.
- Baseline không có lịch sử duyệt, nội dung record, phím bấm, thời lượng hoặc điểm hiệu suất.
- Audit ghi wave ID, trạng thái canary, policy version và số eligible/fallback; không sao chép member ID.
- Generic Settings form tiếp tục không được ghi đè `realmPilotOperations` từ snapshot cũ.

## 7. Verification gate

```powershell
npm run audit:realm:pilot-activation:check
npm run qa
npm run test:e2e
```

UAT bắt buộc:

- Không có active wave: không hiển thị CTA activation giả.
- Wave vừa active: trạng thái `Đang quan sát`, nút clear bị disabled và rollback luôn dùng được.
- Sau 90 phút, mọi gate đạt: clear thành công nhưng cohort không đổi.
- Policy drift hoặc blocker: clear fail-closed và UI hướng operator xử lý hoặc rollback.
- Desktop, 375px và landscape không tràn ngang; status dùng icon + text, control tối thiểu 44px và reduced-motion được tôn trọng.
