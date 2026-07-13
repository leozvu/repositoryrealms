# Hướng dẫn lấy key tích hợp (dành cho Leoz)

## 1. Claude API key — bật AI Copilot (~5 phút)

Copilot (chat với dữ liệu công ty, viết email/proposal) đã có sẵn trong ERP, chỉ chờ key.

1. Vào **https://console.anthropic.com** → đăng nhập (tạo tài khoản bằng Google nếu chưa có)
2. Menu trái → **API Keys** → **Create Key** → đặt tên (VD `agency-erp`) → copy chuỗi `sk-ant-...` (chỉ hiện 1 lần)
3. Nạp credit: **Settings → Billing** → thêm thẻ, nạp $5–10 là dùng thoải mái vài tháng (Copilot dùng Claude Sonnet, mỗi câu hỏi ~vài chục đồng)
4. Vào ERP từng công ty → **Cài đặt → Claude API key** → dán → Lưu → mở menu **AI Copilot** hỏi thử "tháng này doanh thu bao nhiêu?"

> Mỗi công ty dán cùng 1 key được (chung hóa đơn Anthropic), hoặc tạo 3 key riêng để tách chi phí.

## 2. Google Calendar 2 chiều — OAuth (~15 phút, làm 1 lần)

Hiện tại đã có **ICS một chiều** (nút "📅 Link ICS" trên trang Lịch — subscribe vào Google Calendar là lịch ERP tự đổ về, không cần làm gì thêm). Nếu muốn **2 chiều** (sự kiện tạo trên Google Calendar hiện ngược vào ERP), cần OAuth:

1. Vào **https://console.cloud.google.com** → đăng nhập Google
2. Thanh trên cùng → **Select a project → New Project** → tên `agency-erp` → Create
3. Menu ☰ → **APIs & Services → Library** → tìm **Google Calendar API** → **Enable**
4. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create
   - App name: `Agency ERP`, email hỗ trợ: email của bạn → Save
   - Mục **Test users**: thêm email của bạn + email nhân sự sẽ dùng (chế độ test đủ dùng nội bộ, khỏi cần verify app)
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs — thêm đủ 3 dòng:
     - `https://agency-erp-mu.vercel.app/api/gcal/callback`
     - `https://erp-egoric.vercel.app/api/gcal/callback`
     - `https://erp-vnecom.vercel.app/api/gcal/callback`
   - Create → copy **Client ID** (`....apps.googleusercontent.com`) và **Client Secret**
6. **Gửi Client ID + Client Secret cho Claude** → phần code kết nối 2 chiều sẽ được xây trong đợt kế (route `/api/gcal/*` chưa tồn tại — có key là làm).

## 3. Email SMTP (✅ ĐÃ XONG cho Egoric)

- Egoric: `mail.egoricagency.com:465 SSL` — đã cấu hình + test thành công
- AIm / Vnecom: khi có hộp thư riêng cho từng công ty, vào **Cài đặt → Email công ty** của instance đó, điền host/port/tài khoản/mật khẩu → bấm **"Lưu & gửi email thử"**
- Sau đó nút **📧** trên Báo giá / Hóa đơn sẽ gửi email brand đúng công ty

## Ghi chú bảo mật
- Các key/mật khẩu này chỉ nằm trong Cài đặt của từng instance, chỉ Giám đốc đọc được qua API
- Nên đổi mật khẩu hộp thư `leoz@egoricagency.com` định kỳ; đổi xong nhớ cập nhật lại trong Cài đặt Egoric
