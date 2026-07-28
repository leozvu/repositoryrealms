# Roadmap — RepositoryRealms ERP/CRM

Cập nhật 2026-07-28 · Chốt bởi founder (Vũ Lương Sơn) · Nhánh làm việc `codex/realms-demo`

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

### Cụm Lead — nhận lead tự động ✅ (v3.42)
Đối chiếu với một sản phẩm cùng thị trường (Sandbox ERP Cloud) cho thấy bên mình đã có pipeline,
lưu vết chăm sóc, nhắc follow-up và forecast — chỉ hụt đúng khâu đầu: **lead vẫn phải nhập tay**,
và cơ chế chia duy nhất là "AM ít lead nhất". Đúng thứ nhân sự AIm đã báo trước ("khi đẩy mạnh
bán hàng sẽ cần tính năng nhập lead").

- `POST /api/lead-intake` — cổng công khai của từng công ty, fail-closed: chưa sinh mã thì trả 404.
  Nhận được tên trường của Facebook / TikTok / form Việt, chuẩn hóa SĐT VN, chống trùng theo
  liên hệ + chiến dịch, tự chia + báo sale ngay. `GET` trả `hub.challenge` để Meta xác minh webhook.
- 5 cách chia: ít tải nhất (mặc định, giữ hành vi cũ), luân phiên, khu vực, mảng dịch vụ, chiến dịch.
  Không khớp ai thì vẫn chia cho người ít tải nhất — **không bao giờ bỏ rơi lead**.
- Lead nhập tay và lead tự động đi chung một bộ chia (`lib/lead-intake.js`), tránh hai luật khác nhau.
- Bảng **Hiệu quả theo chiến dịch** ở trang Lead: mỗi chiến dịch mang về bao nhiêu lead, chốt bao
  nhiêu, ra bao nhiêu tiền.
- Hướng dẫn nối nền tảng: `docs/HUONG-DAN-NHAN-LEAD-TU-DONG.md`.

**Nghiệm thu trên `erp-crm-test`** (26/7/2026): sai mã → 404 · Meta verify → trả đúng challenge ·
lead Facebook (`full_name`/`phone_number`/`+84…`) → tạo + chia + thông báo · bắn lại → báo trùng,
không tạo lead thứ hai · lead không có liên hệ → 400 · lead TikTok không tên → tự đặt "Khách 4321".
Tiếng Việt có dấu round-trip nguyên vẹn. Số lead trước/sau migration: 7 → 7 (không mất dòng nào).

## Nhịp làm việc đã chứng minh đúng — giữ nguyên

Vòng lặp **feedback thật → sửa → deploy → bot nghiệm thu → giữ nguyên dữ liệu** đã chạy qua 3 đợt AIm + 2 đợt Egoric. Đây là tài sản lớn nhất của dự án, hơn cả số lượng tính năng: nhân sự tin rằng phản hồi của họ được sửa thật. **Không đánh đổi nhịp này lấy tốc độ ra tính năng.**

Lộ trình theo nhịp nhân sự (chờ feedback rồi mới xây): **Dự án → Lead → cụm Tài chính**.

## Mốc gần

- **28/7–27/8/2026** — observation 30 ngày: monitor công khai read-only chạy hằng ngày trên 4 entity + CEO Terminal; evidence giữ 30 ngày. Monitor không mở khóa HOLD backup/restore.
- **07/8/2026** — báo cáo evidence 2 tuần từ dữ liệu thật 4 công ty (receipts, events, lệnh liên công ty). Quyết định: đầu tư tiếp / tinh chỉnh / dừng.
- **20/10/2026** — hạn service key CEO Terminal. Xoay bằng `node scripts/rotate-ceo-keys.mjs` (cron đã nhắc trước 14 ngày).
