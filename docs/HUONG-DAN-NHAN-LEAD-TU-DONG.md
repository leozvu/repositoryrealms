# Hướng dẫn nối lead tự động (Facebook / TikTok / Landing / Website)

> Dành cho người chạy quảng cáo và người dựng landing page. Giám đốc bật cổng, marketing dán địa chỉ.

## 1. Vấn đề đang giải

Trước đây lead nằm rải rác: Facebook một chỗ, landing một chỗ, website một chỗ. Sale phải mở
từng nơi, chép số về Excel rồi chia tay. Đông khách một chút là sót lead — mất khách mà không
ai biết đã mất.

Từ v3.42, mỗi công ty có **một địa chỉ nhận lead riêng**. Nền tảng đẩy vào đó, lead rơi thẳng
vào mục *Khách hàng tiềm năng*, tự chia cho sale và bắn thông báo trong vài giây.

## 2. Bật cổng (Giám đốc làm một lần)

1. Vào **Cài đặt → Cổng nhận lead tự động**.
2. Bấm **Sinh mã mới** → bấm **Lưu**.
3. Chép hai thứ đưa cho bên chạy quảng cáo:
   - Địa chỉ: `https://<tên-miền-công-ty>/api/lead-intake`
   - Mã bí mật (token)
4. Ở khối *Thông tin công ty*, bật **Tự chia lead chưa gán** nếu muốn hệ thống chia luôn.

> ⚠ Ai cầm mã là bơm được lead vào công ty. Chỉ đưa cho người cần. Khi đổi mã, luồng cũ ngừng
> chảy cho tới khi bên nền tảng cập nhật lại — đổi xong nhớ báo họ.
>
> Chưa sinh mã = cổng đóng, địa chỉ trả về 404 như thể không tồn tại.

## 3. Cách gửi lead vào

`POST` một khối JSON, kèm mã ở header `x-intake-token` (hoặc `?token=` trên URL nếu nền tảng
không cho đặt header).

```bash
curl -X POST "https://erp-cong-ty.vercel.app/api/lead-intake" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "x-intake-token: <mã bí mật>" \
  -d '{"name":"Nguyễn Văn A","phone":"0912345678","source":"Facebook","campaign":"4_MKT_Landing_ThaoVietAn","region":"Hà Nội","serviceLine":"Seeding","note":"Xin báo giá gói seeding"}'
```

Trả về `201` kèm `{"ok":true,"leadId":"…","assigned":true}` là lead đã vào và đã có người phụ trách.

### Tên trường chấp nhận được

Mỗi nền tảng gọi một kiểu, hệ thống nhận hết — không cần đổi form đang chạy:

| Ý nghĩa | Tên trường chấp nhận |
|---|---|
| Họ tên | `name`, `full_name`, `ho_ten`, `fullname`, `ten` |
| Điện thoại | `phone`, `phone_number`, `sdt`, `so_dien_thoai`, `mobile` |
| Email | `email`, `email_address`, `mail` |
| Nguồn | `source`, `platform`, `nguon` |
| Chiến dịch | `campaign`, `campaign_name`, `chien_dich`, `utm_campaign`, `form_name` |
| Khu vực | `region`, `khu_vuc`, `province`, `tinh_thanh`, `city` |
| Mảng dịch vụ | `serviceLine`, `service`, `mang_dich_vu`, `san_pham`, `product` |
| Ghi chú | `note`, `message`, `ghi_chu`, `noi_dung` |
| Giá trị dự kiến | `value`, `gia_tri` |

**Bắt buộc**: phải có ít nhất số điện thoại **hoặc** email — không có cách liên hệ thì không
phải là lead. Thiếu tên thì hệ thống tự đặt "Khách 5678" theo 4 số cuối, không bỏ khách.

Số điện thoại được chuẩn hóa về `0912345678` dù gửi kiểu `+84912345678`, `84912345678` hay
`(+84) 912-345-678`.

## 4. Nối từng nền tảng

**Facebook / Instagram Lead Ads** — Meta xác minh webhook bằng một lượt `GET`. Dán địa chỉ
làm Callback URL và điền chính mã bí mật vào ô *Verify Token*; hệ thống trả lại `hub.challenge`
nên Meta sẽ xác minh thành công. Sau đó mỗi lead mới được đẩy về theo mục 3.

**TikTok Lead Generation** — mục *Webhook / Integration*, dán địa chỉ kèm `?token=<mã>` nếu
không đặt được header.

**Landing page / website tự dựng** — gọi thẳng `fetch` ở phía máy chủ của landing.
Đừng để lộ mã trong mã nguồn chạy trên trình duyệt: gọi từ server hoặc qua một hàm trung gian.

**Zapier / Make / n8n** — bước *Webhook → POST*, dán địa chỉ, thêm header `x-intake-token`.
Đây là cách nhanh nhất khi nền tảng quảng cáo chưa có webhook riêng.

## 5. Chia lead cho ai

Chọn ở **Cài đặt → Cổng nhận lead → Cách chia lead cho sale**:

| Cách chia | Dùng khi |
|---|---|
| Ai đang ít lead mở nhất *(mặc định)* | Đội đồng đều, muốn tải cân bằng |
| Luân phiên đều tay | Muốn mỗi người nhận đúng lượt, không tính tải |
| Theo khu vực khách | Sale chia theo vùng Bắc / Trung / Nam |
| Theo mảng dịch vụ | Sale chuyên mảng (Seeding khác Digital Ads) |
| Theo chiến dịch marketing | Mỗi chiến dịch có sale chuyên chăm |

Với ba cách cuối, khai *phân vùng phụ trách* của từng sale ngay dưới ô chọn. Nếu một lead không
khớp ai, hệ thống **vẫn chia** cho người đang ít tải nhất — không bao giờ để lead nằm không.

## 6. Đặt tên chiến dịch

Đặt theo `<số>_<kênh>_<nội dung>`, ví dụ `4_MKT_Landing_ThaoVietAn`, `1_MKT_Fanpage_SongKhoe`.

Nhờ vậy bảng **Hiệu quả theo chiến dịch** ở trang Khách hàng tiềm năng tách được: mỗi chiến
dịch mang về bao nhiêu lead, chốt bao nhiêu, ra bao nhiêu tiền — tức là biết tiền quảng cáo
đổ vào đâu thì ra khách thật. Luật chia theo chiến dịch cũng chỉ cần khớp một từ khóa
("Landing", "Fanpage").

## 7. Bắn trùng thì sao

Một khách gửi form 10 lần trong cùng chiến dịch chỉ tạo **một** lead — hệ thống trả
`{"ok":true,"duplicate":true}` cho các lần sau. Nhưng cùng khách đó ở **chiến dịch khác** vẫn
tạo lead mới, vì đó là một cơ hội thật ở thời điểm khác.

## 8. Khi có sự cố

| Nhận được | Nghĩa là | Xử lý |
|---|---|---|
| `404` | Sai mã, hoặc cổng chưa bật | Kiểm tra mã trong Cài đặt, nhớ bấm Lưu |
| `400` + `lead_intake_no_contact` | Lead không có số lẫn email | Bắt buộc form phải hỏi số điện thoại |
| `400` JSON không hợp lệ | Payload sai định dạng | Kiểm tra `Content-Type` và dấu ngoặc |
| `413` | Payload quá lớn (>16KB) | Bỏ bớt trường thừa |
| `500` | Lỗi phía hệ thống | Báo kỹ thuật; nền tảng thường tự gửi lại |

Mọi lead vào đều ghi **Nhật ký hoạt động** với người thực hiện là "Cổng nhận lead (<nguồn>)",
nên luôn truy được lead nào đến lúc nào, từ đâu, chia cho ai.
