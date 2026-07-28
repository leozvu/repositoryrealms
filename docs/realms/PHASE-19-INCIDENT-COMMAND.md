# Phase 19 — Pilot Telemetry & Incident Timeline

## 1. Mục tiêu

Phase 19 thêm một Incident Command ngay trong `Cài đặt → Pilot Operations` để Director nhìn thấy mốc rollout, ghi nhận sự cố và ra quyết định Go/No-go bằng dữ liệu tổng hợp.

- Không tạo bảng nghiệp vụ hoặc migration mới.
- Không thay thế ERP/CRM gốc và không đổi lead-snapshot v1.
- Không lưu tên người báo cáo, roster, nội dung record, thời lượng hoặc điểm hiệu suất.
- Chỉ triển khai trên Vercel project `crmegoric-realms-demo`.

## 2. Taxonomy và mức độ

Incident dùng danh mục cố định để tránh đưa dữ liệu cá nhân vào timeline:

- Realm không truy cập được — tối thiểu Critical.
- Nghi ngờ lệch dữ liệu — tối thiểu Critical.
- ERP fallback gặp lỗi — tối thiểu Critical.
- Liên lạc gián đoạn — Warning hoặc Critical.
- Tavern fulfillment bị chậm — Warning hoặc Critical.
- Hiệu năng suy giảm — Warning hoặc Critical.

Không có ô nhập ghi chú tự do. AuditLog lưu action, wave, category và số lượng tổng hợp; chi tiết cá nhân không nằm trong Incident state.

## 3. Workflow

### Warning

1. Director chọn loại sự cố và Warning.
2. Incident chuyển `open`; wave vẫn active.
3. Go/No-go bị giữ ở `HOLD`.
4. Operator chuyển incident sang `monitoring`.
5. Chỉ khi live readiness sạch mới được chuyển `resolved`.

### Critical

1. Director xác nhận dialog `Ghi nhận & rollback ERP`.
2. Trong cùng Serializable transaction, hệ thống ghi incident, đặt `mode = off`, chuyển wave sang `paused` và activation sang `rolled_back`.
3. Cohort nhận Notification quay về `/dashboard`; ERP/CRM tiếp tục làm việc bình thường.
4. Incident chuyển `open → monitoring → resolved` sau khi xác minh ERP fallback.
5. Trạng thái `resolved` không tự tái kích hoạt Realm. Muốn mở lại phải đi qua Controlled Launch, sealed rehearsal và maker–checker hiện hữu.

## 4. Go / No-go

- Có incident Critical chưa khép lại: `NO-GO`.
- Có Warning đang mở hoặc theo dõi: `HOLD`.
- Wave không thể hoàn tất khi còn incident chưa khép lại.
- Incident đã resolved không tự tạo quyết định GO; mọi gate readiness và cửa sổ 7–14 ngày vẫn phải đạt.

## 5. Timeline và privacy

Timeline hợp nhất mốc tạo/gửi duyệt/kích hoạt/canary/rollback/hoàn tất với mốc incident. Tối đa 40 incident được lưu trong `realmPilotOperations`; UI hiển thị 16 mốc gần nhất.

Timeline không có actor history, bảng xếp hạng, thời lượng online, phím bấm hoặc nội dung nghiệp vụ. Audit ERP vẫn là nguồn truy vết hành động có phân quyền.

## 6. Kiểm thử và rollback

Chạy:

```bash
npm run audit:realm:pilot-incidents:check
npm run test:coverage
npm run test:e2e
```

Rollback vận hành dùng kill switch `mode = off`. Không rollback migration, không restore database và không xóa Ticket, Gold ledger, wave evidence hoặc incident timeline chỉ để dừng Realm.
