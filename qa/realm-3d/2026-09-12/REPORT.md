# Realm — tiếp tục khắc phục chất lượng và mobile, 12/09/2026

## Vấn đề đã xác nhận

Bản ngày 09/09 chưa vượt hết browser QA: 9 test đạt, 1 timeout khi dùng đồ họa cao trên mobile, 2 test không có kết quả cuối. Chạy lại riêng test mobile trên build cũ `nBm7b36gPzzZSIgppUr2G` ngày 12/09 vẫn timeout 90 giây tại thao tác mở Gold/Chronicle sau khi chọn đồ họa cao. Log: `.codex-runtime/mobile-repro-0912.log`.

Code cũng cho thấy hai điểm cần sửa: lựa chọn high thủ công vô hiệu cả cơ chế giảm độ phân giải, và sàn instanced bị bỏ qua ở bước tạo UV theo mét. Vì vậy tấm gỗ dài/ngắn đều nhận cùng một UV hình vuông bị kéo giãn.

## Thay đổi

- Gộp riêng sàn gỗ và sàn đá thành hai lượt vẽ với UV theo kích thước thật, màu và độ lệch vân riêng từng tấm. Không tăng số lượt vẽ của hai bề mặt; không đổi tọa độ đi lại. Regression test xác nhận tỷ lệ vân ở tấm đầy đủ/tấm nửa, màu, chiều cao và geometry dùng chung không bị sửa.
- Đồ họa high do người dùng chọn vẫn giữ PBR và bóng đổ. Khi nhiều khung hình liên tiếp chậm, framebuffer có thể giảm tới scale 0,55; lựa chọn lưu trong localStorage không bị đổi. Hai khung hình liên tiếp trên 250ms kích hoạt giảm sớm, một spike đơn lẻ vẫn bị bỏ qua. Mức pixel đã học được giữ qua đổi preset và remount Chronicle trong cùng document; tải lại trang sẽ đo lại. Chế độ tự động vẫn có thể chuyển sang balanced. `data-render-scale` ghi độ phân giải tương đối để kiểm tra.
- Trong lúc chờ texture, nền được giới hạn 10 FPS để nhường tài nguyên cho tải/giải mã ảnh. Khoảng thời gian chủ động giới hạn này không được dùng để đánh giá thiết bị chậm.
- Khi rời Realm, dispose tài nguyên và chủ động mất WebGL context cũ để trả tài nguyên trước lần mở lại.
- Launcher preview chờ tối đa 45 giây, mỗi request tối đa 5 giây, vẫn đối chiếu build ID từ server và không dừng tiến trình chưa xác minh. Điều này tránh nhầm server khởi động nguội chậm là một dịch vụ khác.

## Kết quả

- Unit/contract Realm và preview: **37/37 đạt**, không fail/skip/cancel (`.codex-runtime/realm-unit-20260912.log`). Sau điều chỉnh deadline launcher, chạy lại **6/6** test launcher đạt.
- Build cuối **`XqK9DNvOKcAAPpTndPTy7`** đạt (`.codex-runtime/build-20260912-final.log`); 91 trang tĩnh được tạo thành công. Build trung gian `7NYe3I_4zAlSdbqJX_oWR` được giữ trong log đối chứng.
- Launcher trả `ready`, served build ID trùng build trên đĩa tại `http://127.0.0.1:3410/realm-demo?world=3d`.
- Browser QA cuối **chưa đạt**: test camera desktop timeout 90 giây lúc bấm trở về từ toàn cảnh; 11 test còn lại không chạy do `--max-failures=1`. Log `.codex-runtime/realm-e2e-20260912-final.log`. Hai ảnh trước thời điểm thất bại đã được kiểm tra PNG/CRC và giữ trong [manifest quan sát](observations.json), không phải bộ tám ảnh nghiệm thu thành công.
- Các lần đối chứng trên build trung gian gặp timeout tại tải texture, chuyển màn hình hoặc screenshot. Tắt trace cho phép một lần đi qua toàn bộ thao tác nhưng timeout ở screenshot cuối. Máy tại thời điểm kiểm tra còn dưới 1 GiB RAM trống; chưa thể quy toàn bộ lỗi cho app hay trace. Chưa xác nhận lỗi mobile đã được khắc phục end-to-end.
- Harness Realm giữ viewport/DPR/timeout và mọi assertion, bỏ screencast liên tục của trace, giữ DOM/network/source trace, chụp PNG ở kích thước CSS. Đây là giảm chi phí quan sát, không phải benchmark thiết bị thật.
- Preview cuối được kiểm tra lại sau QA: tiến trình độc lập vẫn trả HTTP 200 và đúng build `XqK9DNvOKcAAPpTndPTy7`. Mở tab qua Codex trả trạng thái `queued`; CUA không attach được webview khi task chưa hiển thị, nên không tuyên bố đã hoàn tất thao tác thủ công trên IAB.

## Giới hạn còn mở

Ảnh và test demo không chứng minh hiệu năng GPU/điện thoại thật, chất lượng AAA hoặc cuộc họp nhiều người. Cần tiếp tục asset môi trường/nhân vật được thiết kế riêng, ánh sáng theo kiến trúc, LOD và nghiệm thu công việc có đăng nhập. F09 còn cần chuyển client sang phân trang và aggregate đúng; nguồn lịch sử LeozOps và live gates giữ nguyên trạng thái trong kế hoạch tổng.

Các sửa đổi hiện ở worktree `CRMegoric-Realm-3D`, chưa commit/push hoặc triển khai production. Báo cáo này không thay thế full ERP regression bằng các test đồ họa tập trung.
