# Phase 16 — Pilot Operations & Rollout Waves

Runbook này chỉ áp dụng cho staging clone `crmegoric-realms-demo` trên branch `codex/realms-demo`. Phase 16 không thay ERP/CRM đang vận hành, không merge `main`, không chạm `feat/leozops-s1a` và không deploy `erp-egoric.vercel.app`.

## 1. Phạm vi

- Controlled Launch và four-eyes approval của Phase 14–15 tiếp tục quyết định ai được vào Realm.
- Pilot Operations chỉ bổ sung vòng đời vận hành: `draft → awaiting_approval → active → paused/completed`.
- Wave, notification và audit tái sử dụng `Setting`, `Notification` và `AuditLog` của ERP; không có migration hoặc bảng nghiệp vụ song song.
- Mọi KPI là số tổng hợp. Không lưu roster trong wave, không đo thời lượng, không chấm điểm hiệu suất và không tạo bảng xếp hạng cá nhân.

## 2. Chuẩn bị wave

1. Director hoàn tất controlled launch để policy ở `mode = pilot`, mặc định ERP và có cohort hợp lệ.
2. Mọi blocking gate trong Release Readiness phải đạt; Guild Support phải có đường báo lỗi.
3. Trong `Cài đặt → Pilot Operations`, tạo wave 7–14 ngày. Mỗi thời điểm chỉ có một wave chưa hoàn tất.
4. Wave khóa theo policy version và chỉ lưu số người đủ điều kiện/fallback tại thời điểm kiểm tra.

Nếu policy đổi sau khi wave được tạo, wave cũ không được kích hoạt. Đóng wave cũ và tạo wave mới để tránh dùng snapshot stale.

## 3. Maker–checker và invitation

1. Director A gửi wave nháp sang `awaiting_approval`.
2. Server chạy lại live readiness ngay lúc submit.
3. Director B, khác maker, duyệt kích hoạt. Server kiểm tra lại policy version và live readiness ngay trước transaction.
4. Sau khi duyệt thành công, wave chuyển `active` và cohort nhận invitation qua Notification ERP.
5. Người được mời vẫn có thể dùng ERP · CRM; người ngoài cohort tiếp tục fallback ERP.

Không gửi invitation trước approval. Director tạo/gửi wave không thể tự duyệt.

## 4. Theo dõi wave

- Dashboard hiển thị tổng số eligible, Realm/ERP preference, ERP fallback, feedback mở, blocker và launch approval đang chờ.
- Presence chỉ dùng trạng thái hết hạn ngắn để đếm số online; không chuyển thành thời lượng làm việc.
- Alert xuất hiện khi readiness blocked, có feedback `blocked`, policy drift hoặc wave quá ngày kết thúc dự kiến.
- Feedback chi tiết vẫn xử lý tại Guild Support/Ticket ERP, không sao chép sang wave.

## 5. Pause, hoàn tất và rollback

Khi wave active bị pause hoặc completed:

1. Trong cùng transaction, policy được chuyển sang `mode = off` bằng kill switch hiện hữu.
2. Cohort được thông báo quay về `/dashboard` để tiếp tục ERP · CRM.
3. Wave, AuditLog, Ticket, Gold ledger, record ERP và dữ liệu Realm được giữ nguyên.
4. Không rollback migration, không restore database và không xóa evidence chỉ để dừng pilot.

Muốn mở lại sau pause, hoàn tất wave cũ rồi chạy lại Controlled Launch/four-eyes trước khi tạo wave mới.

## 6. Go / No-go sau 7–14 ngày

- `HOLD`: chưa đủ 7 ngày và chưa có blocker nghiêm trọng.
- `GO`: đủ tối thiểu 7 ngày, release readiness đạt, ERP là fallback và không còn feedback `blocked`.
- `NO-GO`: readiness có blocking gate hoặc feedback mức `blocked`; không cần chờ đủ 7 ngày để dừng mở rộng.
- Sau 14 ngày, dashboard cảnh báo quá cửa sổ để Director đưa ra quyết định và đóng wave.

Báo cáo là snapshot tổng hợp tại thời điểm xem/hoàn tất. Nó không phải căn cứ tự động cho lương, thưởng, kỷ luật hay đánh giá cá nhân.

## 7. Verification gate

```powershell
npm run audit:realm:pilot-operations:check
npm run qa
npm run test:e2e
```

UAT bắt buộc:

- ERP shell không tràn ngang ở 375px; menu, switch surface, search và notification vẫn có target tối thiểu 44px.
- Dashboard Pilot Operations không tràn ngang ở 375px và landscape; focus keyboard nhìn thấy được.
- Maker không thấy khả năng tự duyệt; checker kích hoạt mới tạo invitation.
- Pause đưa cohort về ERP trong khi dữ liệu và migration giữ nguyên.
- Settings form thông thường không ghi đè `realmPilot` hoặc `realmPilotOperations` từ snapshot cũ.
