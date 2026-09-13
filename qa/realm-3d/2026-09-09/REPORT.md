# Kiểm chứng Realm và nền tảng ứng dụng — 09/09/2026

## Thay đổi sản phẩm

- 11 texture gỗ/đá/khoáng/vải nguyên bản, 6,12 MiB, phục vụ cùng origin. Có color/normal/roughness và UV theo mét; gỗ phủ mờ, cạnh nội thất bo nhỏ, bóng tiếp xúc tĩnh. Nguồn CC0 và checksum ở [manifest vật liệu](../../../public/realms/assets/materials/pbr-v1/manifest.json), [giấy phép Poly Haven](https://polyhaven.com/license).
- Trần/dầm hiện trong góc nhìn đi bộ và bỏ khỏi toàn cảnh. Overhead không tham gia raycast; việc chọn bàn qua trần ẩn có regression test dùng geometry thật. Camera vào phòng và quay về từ toàn cảnh nằm dưới dầm trước khi render.
- Tỷ lệ bàn ghế thấp hơn, avatar người trưởng thành có hình khối mặt/tóc, vân vải và chân hai khớp. Nhân vật vẫn được dựng bằng mã: 29 mesh, 9.952 tam giác/người.
- HUD nhỏ gọn, chữ menu dễ đọc hơn; minimap nằm trong danh sách địa điểm. Menu loại trừ nhau, Escape trả focus, mobile có nút di chuyển 48px.
- F09: session/v1 collection dùng chung filter và scope ở database; phân trang cursor opt-in tối đa 200 dòng/trang, thứ tự ổn định có id, kiểm phạm vi anchor và cache private/no-store. API vẫn trả array, không tự cắt danh sách của client cũ.
- Preview chạy bằng tiến trình Node riêng, kiểm build ID thực được server trả về. Lệnh `npm run realm:preview` mở hoặc dùng lại đúng bản; `npm run realm:preview:status` kiểm tra trạng thái.

## Kiểm chứng

| Kiểm tra | Kết quả và phạm vi |
|---|---|
| Full suite với coverage | 1.214/1.214 đạt; không fail/skip/cancel. Line 94,52%, branch 81,18%, function 92,11%. Chạy trước các sửa cuối về trần/camera và trước khi thêm test launcher; không coi đây là full suite sau các sửa cuối. |
| F09 tập trung | 15/15 đạt, gồm PostgreSQL/Prisma thật: scope/filter, nullable/date/boolean/numeric order, cursor sai hoặc anchor bị đổi phạm vi. 90/90 quyền và CRUD regression đạt. |
| Realm và launcher sau sửa cuối | 34/34 đạt, không fail/skip/cancel: asset integrity, texture tải chậm/đổi preset/dispose, avatar, đường đi giữa các bàn, picking qua trần, chất lượng, lifecycle và preview. |
| Production build | `npm run build` đạt, build ID `nBm7b36gPzzZSIgppUr2G`. |
| Preview | HTTP 200, served build ID trùng với build trên đĩa; chạy độc lập sau khi lệnh launcher kết thúc. |
| Browser desktop/mobile | Log ghi nhận 9 test đạt, 1 timeout ở đồ họa cao trên mobile; 2 test còn lại không có kết quả cuối. Không đánh dấu lần chạy này đạt. Lỗi mobile đã tái hiện ngày 12/09 trước đợt sửa tiếp theo. |

Không cộng các suite tập trung vào số full suite. Log cục bộ nằm trong `.codex-runtime/coverage-20260909.log`, `realm-unit-20260909-final.log`, `build-20260909-final.log`, `realm-e2e-20260909-final.log`; đây không phải log production.

## Các bước tiếp theo trong kế hoạch

1. Môi trường/nhân vật do họa sĩ tạo, rig và animation đầy đủ, vật liệu nhất quán và light baking theo kiến trúc. Bóng tiếp xúc hiện tại là lớp tĩnh, chưa phải AO/GI thời gian thực.
2. Phòng riêng thực và các trạng thái ngồi/làm việc/họp; LOD cho nhiều người. Nghiệm thu cuộc gọi/mic/camera/screen share trên thiết bị thật, có đăng nhập.
3. Đo FPS, thời gian tải, bộ nhớ và LOD trên ma trận GPU/điện thoại thật. Browser QA dùng software renderer, không chứng minh đạt 60 FPS hoặc chất lượng AAA.
4. Chuyển từng client sang phân trang cùng aggregate đúng, đo query plan/index trên dữ liệu lớn; xác định hành vi khi dữ liệu đổi thứ tự giữa hai trang.
5. Hoàn tất các gate còn mở trong [kế hoạch triển khai](../../../docs/REALM-3D-IMPLEMENTATION.md), gồm nghiệm thu ERP theo vai trò và tích hợp nhiều người. Demo có dữ liệu mẫu không thay thế các gate này.

Chưa commit, push hoặc triển khai production. Không đánh dấu toàn bộ kế hoạch hay chất lượng AAA đã hoàn thành.
