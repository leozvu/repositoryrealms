# Roadmap — RepositoryRealms ERP/CRM

Cập nhật 2026-07-24 · Chốt bởi founder (Vũ Lương Sơn) · Nhánh làm việc `fix/crm-erp`

## Ba quyết định định hình sản phẩm

| Câu hỏi | Quyết định | Hệ quả |
|---|---|---|
| Nội bộ hay bán ra? | **Nội bộ trước, bán ra sau** | Tối ưu cho 4 công ty của group; giữ kiến trúc đa công ty sẵn có làm nền cho hướng bán ra sau này |
| Kiểm soát nhân sự theo gì? | **Cả giờ giấc và hiệu suất** | Mở khóa Mẫu dự án; chấm công phải chặt; Execution Engine có lý do tồn tại |
| Realm/Gold? | **Dùng ngay** | Gold trở thành giao diện của hệ thống ghi nhận — không còn là tài sản đóng băng |

Ba quyết định này khóa vào nhau: **giờ giấc → chấm công chặt · hiệu suất → việc xong đúng hạn · cả hai quy về Gold**.

## Trạng thái 4 chương (v3.41)

### Chương 1 — Nền kỷ luật + hiệu suất ✅
- **Chấm công có bằng chứng ngữ cảnh**: mỗi lần bấm ghi IP (che phần cuối) + phân loại office/remote/unknown. Ba mức trong Cài đặt: `off` (mặc định, như cũ) → `warn` → `strict`. Người khai làm từ xa không bị chặn. Không theo dõi GPS, không theo dõi liên tục.
- **Khóa dấu vết**: `checkIn/checkOut/place` không sửa được qua CRUD chung — nếu không khóa thì mọi ràng buộc thành vô nghĩa.
- **Mẫu dự án trọn gói**: áp mẫu chạy trong MỘT giao dịch ở server (trước đây chạy ở trình duyệt, lỗi giữa chừng để lại dự án dở dang). Mang theo `workType`/`complexity` để việc sinh từ mẫu có đối chứng giờ lịch sử; ngân sách giờ của mẫu chảy vào dự án.

### Chương 2 — Gold tầng trải nghiệm ✅
- Gold sinh từ **sự kiện khách quan**: việc xong **đúng hạn** (+10) · ngày công **đủ giờ** (+5).
- **Ranh giới có chủ đích**: Gold KHÔNG lấy từ Resource Intelligence (giờ ước lượng là nhân viên tự khai — lấy làm thước thưởng sẽ khuyến khích khai khống). Điều này tôn trọng chính sách `goldUse:false` sẵn có mà vẫn đạt mục tiêu.
- Bút toán append-only, chống trùng, trần 60 Gold/người/ngày. Lỗi Gold không bao giờ chặn nghiệp vụ.

### Chương 3 — Gold → thưởng lương ✅ (công tắc TẮT mặc định)
- `goldPayoutEnabled` cần cả `goldEnabled` mới hoạt động. Tỷ giá + trần tháng/người chặn lỗi cấu hình thành hóa đơn lương khổng lồ.
- Thưởng vào `bonus` của phiếu lương → chịu thuế TNCN đúng luật. Phiếu lương hiện `goldEarned`/`goldBonus` để nhân sự đối chiếu.
- **Vì sao tắt mặc định**: nhân sự cảnh báo "quản lý theo hiệu suất phải có một quá trình". Bật khi dữ liệu đủ dài để công bằng — quyết định của founder, không tự bật.

### Chương 4 — Chuẩn bị bán ra 🔄
Xem `docs/ARCHITECTURE-CORE-VS-CUSTOM.md`.

## Nhịp làm việc đã chứng minh đúng — giữ nguyên

Vòng lặp **feedback thật → sửa → deploy → bot nghiệm thu → giữ nguyên dữ liệu** đã chạy qua 3 đợt AIm + 2 đợt Egoric. Đây là tài sản lớn nhất của dự án, hơn cả số lượng tính năng: nhân sự tin rằng phản hồi của họ được sửa thật. **Không đánh đổi nhịp này lấy tốc độ ra tính năng.**

Lộ trình theo nhịp nhân sự (chờ feedback rồi mới xây): **Dự án → Lead → cụm Tài chính**.

## Mốc gần

- **07/8/2026** — báo cáo evidence 2 tuần từ dữ liệu thật 4 công ty (receipts, events, lệnh liên công ty). Quyết định: đầu tư tiếp / tinh chỉnh / dừng.
- **20/10/2026** — hạn service key CEO Terminal. Xoay bằng `node scripts/rotate-ceo-keys.mjs` (cron đã nhắc trước 14 ngày).
