# Mở Realm 3D trên máy local

Chạy từ thư mục dự án đã build xong:

```powershell
npm run realm:preview
```

Mở [Realm 3D](http://127.0.0.1:3410/realm-demo?world=3d). Script in ra URL, PID và `buildId` mà server thực sự trả về. Server chạy dưới tiến trình Node riêng, ẩn cửa sổ trên Windows và không phụ thuộc vào terminal đã gọi lệnh. Đóng terminal hoặc kết thúc lượt Codex không chủ động dừng server. Tắt máy, tiến trình bị hệ điều hành kết thúc hoặc ứng dụng bị lỗi vẫn có thể làm server dừng; chạy lại lệnh để mở lại.

Kiểm tra mà không khởi động hoặc thay đổi tiến trình:

```powershell
npm run realm:preview:status
```

Script chỉ chạy `next start` với build production hiện có và cố định tại `127.0.0.1:3410`. Script không tự build, không sửa `.env`, không tạo thông tin đăng nhập và không thêm tác vụ khởi động cùng Windows. Đây là trang xem thử Realm; việc mở được demo không chứng minh ERP đã có cấu hình đăng nhập hoặc đồng bộ dữ liệu.

Các file cục bộ được lưu trong thư mục đã được Git bỏ qua:

- `.codex-runtime/realm-preview.pid.json`: PID do launcher tạo, thư mục dự án, build ID và thời điểm chạy.
- `.codex-runtime/realm-preview.log`: stdout/stderr của Next để chẩn đoán lỗi.
- `.codex-runtime/realm-preview.start.lock`: khóa tạm ngăn hai lần khởi động cùng lúc.

Chạy lại lệnh sẽ dùng lại server đang phục vụ đúng build. Nếu cổng bị ứng dụng khác hoặc bản build khác chiếm, script báo lỗi và không dừng tiến trình đó. PID lưu trong file là thông tin chẩn đoán, không phải bằng chứng sở hữu tiến trình sau khi hệ điều hành đã tái sử dụng PID. Xác minh command line và thư mục ứng dụng trước khi dừng server bằng công cụ quản lý tiến trình.

Để cập nhật bản xem thử, dừng đúng server của dự án, chạy `npm run build`, rồi chạy launcher. Không chạy `next dev` hoặc `npm run build` trong cùng thư mục `.next` trong lúc production preview đang phục vụ: chúng thay đổi các file mà server đang dùng. Khi thiếu build hoàn chỉnh, launcher chỉ báo hướng dẫn và không tự build. Nếu chờ quá 45 giây mà server chưa sẵn sàng, launcher báo timeout; dùng `--status` và log để kiểm tra tiến trình trước khi thử tiếp.

