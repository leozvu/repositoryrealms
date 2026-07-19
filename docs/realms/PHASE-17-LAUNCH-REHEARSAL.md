# Phase 17 — Launch Rehearsal & Sealed Evidence

Runbook này chỉ áp dụng cho staging clone `crmegoric-realms-demo` trên branch `codex/realms-demo`. Phase 17 không tự đổi policy, không mời cohort, không merge `main`, không chạm `feat/leozops-s1a` và không deploy `erp-egoric.vercel.app`.

## 1. Mục tiêu

- Chuyển các bước smoke test trước pilot thành rehearsal có evidence vận hành rõ ràng.
- Bắt buộc maker–checker: Director ghi evidence không thể tự niêm phong.
- Niêm phong khóa theo đúng policy version và chỉ có hiệu lực 24 giờ.
- Pilot Operations chỉ cho submit/activate wave khi cùng sealed rehearsal còn hiệu lực.
- Tái sử dụng `Setting`, `Notification` và `AuditLog`; không có migration hoặc bảng nghiệp vụ song song.

## 2. Điều kiện trước rehearsal

1. Controlled Launch đã đưa policy về `mode = pilot`.
2. Giao diện mặc định vẫn là ERP · CRM.
3. Cohort có ít nhất một tài khoản active; Office và Guild Support được bật.
4. Không còn Ticket Guild Support mức `blocked` đang mở.
5. Có tối thiểu hai Director active để tách maker và checker.

Nếu một gate chưa đạt, bảng remediation chỉ deep-link tới control hiện hữu. Nó không tự đổi policy, tự xử lý Ticket hoặc bypass approval.

## 3. Năm kịch bản evidence

1. **Liên hệ chéo ERP ↔ Realm:** người dùng ERP nhận liên hệ từ Realm và phản hồi qua notification/message dùng chung.
2. **Deep link record ERP:** Task, Lead và Project mở đúng record/route ERP; Realm không tạo bản sao.
3. **Guild Support → Ticket ERP:** phản hồi tạo Ticket, notification và audit theo contract hiện có.
4. **Kill switch rehearsal:** xác minh đường về `/dashboard`, giữ nguyên record, ledger, Ticket và migration.
5. **Mobile & accessibility:** 375px và landscape không tràn ngang; keyboard focus và control tối thiểu 44px.

Evidence chỉ ghi kết quả vận hành ngắn. Không ghi tên cohort, nội dung record, dữ liệu khách hàng, lịch sử duyệt, thời lượng hoặc điểm hiệu suất cá nhân.

## 4. Maker–checker seal

1. Director A tạo rehearsal và ghi kết quả cho đủ năm kịch bản.
2. Server yêu cầu mọi kịch bản `passed`, live readiness đạt và có ít nhất hai Director active.
3. Director A gửi rehearsal sang `awaiting_approval`; Notification ERP được gửi cho Director khác.
4. Director B recheck live readiness và policy version ngay trong transaction.
5. Khi hợp lệ, rehearsal chuyển `sealed`, khóa 24 giờ và thông báo lại cho maker.
6. Nếu checker trả về, lý do bắt buộc được lưu trong rehearsal và maker nhận Notification ERP.

## 5. Liên kết Pilot Operations

- Wave nháp vẫn có thể được chuẩn bị, nhưng không thể gửi duyệt nếu chưa có sealed rehearsal còn hiệu lực.
- Khi submit, wave lưu `rehearsalId` và thời điểm hết hạn; không sao chép nội dung evidence.
- Checker của wave phải revalidate đúng `rehearsalId`, live readiness và policy version trước khi mời cohort.
- Rehearsal hết hạn hoặc policy thay đổi làm activation fail-closed; operator phải chạy rehearsal mới.

## 6. Rollback và privacy

- Rehearsal không chỉnh record nghiệp vụ, Gold ledger, Ticket hoặc migration.
- Không tự bật/tắt Realm; kill switch vẫn thuộc Pilot Operations/Controlled Launch hiện hữu.
- Settings form thông thường không được ghi đè `realmPilot`, `realmPilotOperations` hoặc `realmPilotRehearsal` từ snapshot cũ.
- API rehearsal chỉ dành cho Director và không trả roster; audit chỉ lưu số checklist đã đạt, không lưu evidence text.

## 7. Verification gate

```powershell
npm run audit:realm:pilot-rehearsal:check
npm run qa
npm run test:e2e
```

UAT bắt buộc:

- Policy chưa ở pilot: hiển thị remediation `Pilot theo cohort`, không có mutation tự động.
- Maker có thể lưu evidence nhưng không thể tự niêm phong.
- Checker recheck và seal; trạng thái READY hiển thị thời điểm hết hạn.
- Pilot wave không submit/activate khi seal thiếu, stale hoặc expired.
- Card rehearsal không tràn ngang ở 375px/landscape; icon có text, label gắn với input và control đạt tối thiểu 44px.
