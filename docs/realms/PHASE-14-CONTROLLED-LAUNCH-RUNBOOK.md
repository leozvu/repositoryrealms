# Phase 14 — Controlled Pilot Launch Runbook

Runbook này chỉ áp dụng cho staging clone `crmegoric-realms-demo`. Phase 14 không tự bật pilot, không deploy production và không thay ERP/CRM đang vận hành.

## 1. Chuẩn bị bản nháp

- Director mở `Cài đặt → Realm Pilot Control`.
- Giữ `ERP · CRM` làm giao diện mặc định và ưu tiên cohort `Nhân sự cụ thể` gồm 3–8 người.
- Office và Guild Support phải bật. Tavern có thể bật sau khi Office pilot ổn định.
- Bản nháp không được dùng để thu thời lượng, tiến độ hoặc điểm hiệu suất cá nhân.

## 2. Chạy dry-run

1. Bấm `Chạy dry-run phát hành`.
2. Đọc bốn chỉ số tổng hợp: được mở Realm, fallback ERP, thay đổi cohort và blocking gate.
3. Xác minh risk là `Thu hẹp an toàn`, `Vận hành` hoặc `Mở rộng cohort` đúng với thay đổi dự kiến.
4. Preview được ký bằng HMAC, gắn với Director, policy version và digest bản nháp; hết hạn sau **10 phút**.
5. Sửa bất kỳ trường nào sẽ làm preview cũ mất hiệu lực. Chạy lại dry-run trước khi apply.

Preview không chứa roster, tên nhân sự, lịch sử duyệt, thời lượng hoặc dữ liệu hiệu suất. Token chỉ chứa digest và số đếm tổng hợp.

## 3. Go / no-go

- Expansion chỉ được apply khi mọi blocking gate đạt.
- Ngay trong transaction apply, server chạy lại live readiness cho expansion; blocker mới xuất hiện sau preview vẫn chặn thay đổi.
- Restriction được phép apply để giảm blast radius kể cả khi trạng thái hiện tại có blocker.
- Nếu policy version vừa thay đổi ở tab khác, tải lại và chạy dry-run mới.
- Chỉ Director đã review impact mới bấm `Lưu chính sách pilot`.
- Phase 14 không tự bật pilot trên staging hoặc production.

## 4. Kill switch

Trong SEV-1 hoặc cần dừng pilot:

1. Chọn `Tạm đóng` (`mode = off`).
2. Bấm `Kích hoạt kill switch`; thao tác này không yêu cầu preview.
3. Xác minh `/realm` fallback về `/dashboard` và ERP/CRM tiếp tục hoạt động.
4. Giữ nguyên database, Gold ledger, Ticket, AuditLog và migration để điều tra.

Không restore database và không rollback migration chỉ để tắt Realm.

## 5. Bằng chứng audit

Audit policy chỉ ghi preview ID, risk, số người đủ điều kiện và số người fallback. Không ghi member ID hoặc roster. Chạy:

```powershell
npm run audit:realm:launch:check
npm run qa
npm run test:e2e
```

## 6. Exit criteria

- Token sai actor, version, draft, chữ ký hoặc hết hạn đều bị server từ chối.
- Expansion có blocker không thể apply; restriction và kill switch vẫn dùng được.
- Người ngoài cohort luôn fallback ERP và dữ liệu nghiệp vụ vẫn dùng chung một nguồn.
- Không có migration mới hoặc bảng launch song song.
- Desktop, viewport 375 px, keyboard focus và reduced-motion đều qua QA.
