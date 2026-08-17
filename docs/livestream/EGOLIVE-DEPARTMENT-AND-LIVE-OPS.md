# Egolive trong Egoric: nghiên cứu sản phẩm và kiến trúc triển khai

Ngày nghiên cứu: 2026-08-16

## Quyết định sản phẩm

Egolive không còn là một công ty/tenant độc lập trong topology mới. Egolive là **Phòng Livestream Egolive** thuộc **Egoric Agency**. Phòng ban dùng nguyên CRM, dự án, task, HR, tài chính và authorization của Egoric; phân hệ livestream chỉ bổ sung workflow chuyên ngành.

`LiveSession` tiếp tục là một nguồn dữ liệu duy nhất xuyên suốt:

`draft schedule → confirmed schedule → live → done → reconciled → settled`

Không tạo bảng lịch rời rồi sao chép sang ca live, vì điều đó sinh hai nguồn sự thật và làm mất receipt/audit.

Legacy entity `egolive` được coi là nguồn migration. Không xóa schema/deployment cũ trước khi hoàn thành backup, copy, reconciliation và sign-off.

## Những gì một ứng dụng quản lý livestream cần có

### 1. Planning và lịch nguồn lực

- Lịch ngày/tuần/tháng; draft và confirmed.
- Host/mẫu live, co-host, operator, moderator, studio, call time, timezone.
- Campaign, nhãn hàng/shop, mục tiêu GMV, link event.
- Cảnh báo trùng host/ekip/studio; hỗ trợ hủy và đổi lịch có audit.
- Rehearsal/practice mode và checklist readiness trước live.

### 2. Product và nội dung

- Product set, thứ tự sản phẩm, tồn kho, giá/voucher/flash sale/giveaway.
- Brief, script, rundown, key selling points và compliance claims.
- Cover/trailer/billboard và link tài sản chiến dịch.
- Phiên bản nội dung, người duyệt và receipt phê duyệt.

### 3. Vận hành trong live

- Trạng thái stream/health; owner xử lý sự cố.
- Pin sản phẩm, moderation chat, cảnh báo vi phạm, đơn/GMV/viewer real-time.
- Run-of-show và marker cho từng segment/sản phẩm.
- Incident log: mạng, âm thanh, ánh sáng, encoder, tài khoản, tồn kho.

### 4. Post-live, finance và performance

- GMV trên sóng tách khỏi net GMV và tiền thực nhận.
- Đơn, hủy/hoàn, phí sàn, thuế, commission/công host và settlement.
- Viewer, peak concurrent, watch time, CTR/CTOR, chat/engagement, conversion theo sản phẩm.
- Replay, scorecard, bài học và action cho ca tiếp theo.
- Vi phạm, appeal deadline và account health.

### 5. People, security và governance

- Roster host/mẫu live, kỹ năng, availability, rate, hợp đồng và hiệu suất.
- RBAC không chia sẻ mật khẩu nền tảng; quyền host/operator/moderator/finance tách biệt.
- Audit log, maker-checker cho payout/settlement, export và retention.
- Notification/reminder cho call time, rehearsal, thiếu checklist, conflict và đối soát.

## Cơ sở nghiên cứu chính thức

- [TikTok Shop LIVE Manager](https://seller-us.tiktok.com/university/essay?default_language=en&knowledge_id=1195537245292331): scheduling, event duration, product preparation, practice mode, assistants/moderators, analytics và overlapping-event warning.
- [TikTok Shop livestream team structure](https://seller-us.tiktok.com/university/essay?knowledge_id=2799697140090667&lang=en): host, assistant, moderator và operations.
- [TikTok Shop campaign preparation](https://seller-us.tiktok.com/university/essay?knowledge_id=7857340972009259): host/operator/moderator, product/inventory planning, real-time metrics và post-live scorecard.
- [TikTok Shop LIVE Dashboard](https://seller-us.tiktok.com/university/essay?knowledge_id=657016495343406&lang=en): traffic, conversion, products, violations và giveaways trong một dashboard.
- [TikTok Shop LIVE Content Warnings](https://seller-us.tiktok.com/university/essay?default_language=en&knowledge_id=5130820791011118): warning levels, linked-product removal, violation tracking và appeal workflow.
- [YouTube live scheduling/settings](https://support.google.com/youtube/answer/9854503?hl=en): scheduled stream metadata, audience notification, trailer, stream key và latency.
- [YouTube live metrics](https://support.google.com/youtube/answer/2853833?hl=en): stream health, concurrent viewers, duration, chat rate, views, average view duration và post-stream analytics.
- [Facebook scheduled live video](https://www.facebook.com/help/518336858836703/): event name, start/end, privacy, description và announcement/event publishing.
- [Shopee Live Terms](https://help.shopee.vn/portal/4/article/197649): real-time product Q&A, purchase, gifts và livestream-exclusive promotions.

## Phạm vi đã triển khai trong bước này

- Topology canonical: `egolive → egoric`, Egolive xuất hiện như department.
- Preset Egoric giữ toàn bộ Agency ERP và bật thêm `livestream`.
- Lịch tuần cho mẫu live/host và ekip trên chính `LiveSession`.
- Draft/confirmed, timezone, call time, studio, campaign, operator, moderator, product count, target GMV, brief, rehearsal và stream URL.
- Server-side validation và chống trùng lịch nhân sự/studio.
- Readiness score trước live.
- Giữ nguyên vận hành/đối soát/settlement/công host/vi phạm hiện có.
- Script kích hoạt phòng ban Egolive trên database Egoric có dry-run mặc định.

## Trình tự migration production bắt buộc

1. Backup và restore-test cả schema `egoric` và legacy `egolive`.
2. Deploy migration thêm field lịch vào cả hai schema tương thích.
3. Chạy `npm run egolive:department:plan` với `EGORIC_DATABASE_URL`.
4. Lập mapping user/client theo email hoặc business key; báo cáo record conflict.
5. Copy dữ liệu livestream theo batch có receipt và checksum; tuyệt đối không xóa nguồn.
6. Reconcile counts và totals: sessions, violations, GMV, net received, payouts, transactions.
7. Chạy `npm run egolive:department:apply` để bật module/team trên Egoric.
8. Canary user Egolive trên Egoric; xác minh RBAC, lịch, đối soát và sổ quỹ.
9. Chỉ khi sign-off mới chuyển legacy Egolive sang read-only, rồi disable khỏi CEO registry.
10. Giữ rollback window tối thiểu 30 ngày trước khi xem xét archive deployment cũ.

## Backlog tiếp theo

- Product sets và rundown theo thứ tự pin.
- Availability/leave-aware scheduling cho host.
- Notification và calendar feed (ICS/Google/Outlook).
- Live control room + incident timeline.
- Platform connector cho TikTok/Shopee analytics và settlement import.
- Per-product analytics, replay markers và scorecard template.
- Migration copy có checksum cho dữ liệu production legacy Egolive.
