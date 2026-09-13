# Phát triển song song — 13/09/2026 UTC

LeozOps và Jarvis là cùng một sản phẩm. Đợt này triển khai đồng thời ERP/CRM, LeozOps/Jarvis và Realm theo yêu cầu mới nhất. Build ERP/Realm: `yyey-xTXFRNmrxTgh6bcx`. Chưa commit hay triển khai production.

## ERP/CRM

- Lead Kanban lấy 25 bản ghi mỗi giai đoạn, dùng cursor gắn với scope/role/user. Tổng pipeline, forecast ba tháng và top campaign được tính tại server trên toàn scope, độc lập với thẻ đang xem. Các truy vấn cùng transaction RepeatableRead.
- Trang trước/tiếp; cursor hết hiệu lực cho phép trở lại trang đầu. Mutation xác nhận thành công đưa về trang đầu để tránh giữ trang có anchor vừa chuyển stage hoặc bị xóa.
- CSV yêu cầu collection đầy đủ khi bấm xuất, không xuất nhầm 25 thẻ; xử lý dấu phẩy/xuống dòng/công thức spreadsheet. Bản xuất phản ánh dữ liệu tại thời điểm xuất, có thể khác snapshot bảng trước đó.
- Deep link mở Lead ngoài trang hiện tại và theo dõi thay đổi `focus` khi điều hướng trong app. Response mở bản ghi cũ không ghi đè form mới. Đổi session che ngay modal/tổng/thẻ cũ; response chuyển Lead không điều hướng ở session mới.
- Lookup owner/region/serviceLine chưa tải vẫn giữ giá trị đã lưu. Báo giá, hóa đơn, ticket giữ form/confirm khi lỗi, không báo thành công trên kết quả null, có retry đọc và khóa thao tác pending. Preview giờ công hủy truy vấn project cũ; thống kê ticket tháng không tính lẫn năm.

Kiểm chứng:

| Gate | Kết quả |
|---|---|
| Regression ERP/Realm | **1.273/1.273 PASS, 0 skipped** — `full-tests.log` |
| Component Chromium desktop/mobile | **26/26 PASS** — `component-browser.log` |
| Prisma/PostgreSQL Lead | **1/1 PASS**, nằm trong 1.273 — `postgres-lead-board.log` |
| Build Prisma + Next | **PASS**, 91 static pages — `build.log` |

PostgreSQL fixture chỉ ở loopback `5439/codex_payment_test`, dùng ID ngẫu nhiên và dọn trong finally; đã dừng server thử sau kiểm tra. Test giữ snapshot thật: kết nối thứ hai commit thêm Lead sau SELECT đầu nhưng trước aggregate, transaction đầu vẫn trả tổng trước insert. Không sửa setting 1 hoặc dữ liệu production.

Lần full suite đầu có một audit tĩnh tìm chuỗi `setModal` cũ. Audit được cập nhật để kiểm cả đọc focus, gọi helper, endpoint lọc ID và mở record kết quả; browser test xác minh hành vi thực. Log ban đầu được giữ trong `initial-full-tests.log`, không hạ assertion hay cổng.

Giới hạn ERP: chưa có benchmark dataset lớn. Board có 13 query trang đầu và thêm kiểm tra anchor ở trang sau; campaign groupBy còn trả toàn bộ nhóm về Node, export còn tải nguyên collection vào browser. Forecast dùng tháng UTC từ server. Workload riêng còn giới hạn 2.000 Lead/20.000 activity và UI nêu rõ khi chạm giới hạn. Component fixtures không thay auth E2E hay pilot hai tài khoản. Idempotency server của chuyển báo giá/xuất hóa đơn từ giờ công vẫn là việc tiếp theo.

## LeozOps/Jarvis

Đã cách ly request/hội thoại/bằng chứng/voice theo phiên, chống Ask trùng, dọn DOM khi disconnect/401/pagehide, chặn response cũ sau reconnect và bổ sung deadline. **402/402 regression, 35/35 focused, 7/7 Chromium smoke, typecheck/build PASS**; các số focused nằm trong full suite, không cộng hai lần.

[Báo cáo, log và fingerprint riêng](../../../../leozcrm-product/qa/cockpit-session-reliability/REPORT.md). Không bật provider, không thay authority/production registry, không tuyên bố G5–G7 hoặc J1–J8 đạt. Chưa có server Jarvis local đang chạy; build chỉ cập nhật `dist`. Live SSO/audio và xử lý bền vững write chưa rõ kết quả vẫn còn.

## Realm 3D

- Thay kệ và sách đơn khối bằng ba tủ ghép/chốt, thớ gỗ theo thanh, 216 quyển có bìa 6 mm, khối trang lõm, gáy cong, gân đóng; 36 quyển xếp nằm.
- Hình học tự tạo, tái sử dụng map gỗ CC0 đã có. Không tải asset hoặc đổi engine. Giữ footprint/collider, đường đi và business IDs.
- Geometry toàn hall: 98.007 → 132.423 tam giác; mesh hiển thị sau gộp: 63 → 64. Đây là số liệu cấu trúc, không phải số GPU draw calls hay chứng minh FPS.
- Bộ test archive/scene/camera/ceiling/materials: **16/16 PASS**, nằm trong regression đầy đủ.

**Browser tiêu chuẩn hiện FAILED:** desktop timeout 90 giây; teardown cũng timeout; mobile bị dừng để giải phóng máy. Trace cho thấy ready khoảng 26 giây, mở menu đồ họa mất 26 giây, chọn balanced mất 21 giây; đã hết gần ngân sách trước bước đi tới điểm Thư viện. Log/trace ban đầu giữ nguyên. Không tuyên bố đạt profile desktop/mobile hoặc hiệu năng AAA từ lần này.

Điểm tên “Thư viện” hiện ánh xạ legacy tới `briefing`, nhãn panel “Đại sảnh”. Hình học mới không đổi ánh xạ này; không gọi nó là một nghiệp vụ Archive mới đã hoàn thiện. Cần làm rõ tên/khả năng ở đợt trải nghiệm không gian tiếp theo.

**Diagnostic 960×600 DPR1 cũng FAILED:** đi tới điểm Thư viện (53,8 giây), mở briefing, đóng và quay lại world (59,3 giây), chụp first-person balanced (77,1 giây), sau đó timeout trước khi hoàn tất overview/High. Không tăng timeout của bài tiêu chuẩn hoặc biến các bước đã chạy thành một bài PASS.

Renderer xác nhận là **ANGLE Vulkan SwiftShader Device (Subzero)**. Auto scale đã xuống 0,45, buffer 432×270; rAF p95 ghi khoảng 567 ms lúc đầu và 367 ms tại điểm Thư viện. Đây là chẩn đoán môi trường render bằng phần mềm, không suy ra tốc độ GPU thật và cũng không chứng minh artifact mới vô can. Cần benchmark cùng thiết bị/build baseline để xác định hồi quy.

Ảnh [balanced runtime](runtime/diagnostic/realm-office-diagnostic-di-6e7f3-wo-actual-material-captures/archive-balanced-960.png) có tủ và các cụm sách mới, nhưng rất mờ ở buffer hiện tại. Không đủ pixel để nghiệm thu chi tiết gáy/bìa. Chưa có ảnh High được xác nhận. Log/JSON/ảnh và lỗi nằm trong `runtime/diagnostic`; trace lỗi đầu nằm trong `runtime/standard`. In-app browser riêng cũng không attach được webview khi thử mở; không dùng nó để nhận xét hình ảnh.

**G1 vẫn In progress, release gate FAILED và 36 rule chưa nghiệm thu.** Nhân vật production, ngồi/hand IK, ánh sáng, chất liệu chi tiết, accessibility và thiết bị thực vẫn còn. Ưu tiên R3 chẩn đoán render, đường tải đầu, phản hồi điều khiển và giới hạn vật liệu/shadow trước khi thêm asset.

## Kế hoạch tiếp tục

[Kế hoạch tích hợp](../../../docs/PARALLEL-PRODUCT-DEVELOPMENT.md) điều phối ba nhánh song song. Các kế hoạch chi tiết ERP và AAA giữ phần đã chứng minh và việc còn lại. Source fingerprints và artifact manifest đi cùng báo cáo; HEAD Git không phải snapshot đầy đủ vì workspace có thay đổi chưa commit.
