# Production observation evidence

Mỗi lượt `npm run observe:production` tạo một JSON trong `runs/`. Thư mục `runs/` được gitignore vì đây là evidence theo thời gian, không phải source artifact.

Artifact chỉ chứa hostname công khai, route, HTTP status, latency và mã kiểm tra. Script không gửi credential/cookie/body, không đọc response body và không thực hiện mutation.

Trong GitHub Actions, evidence được upload với retention 30 ngày. Một lượt PASS chỉ chứng minh public availability và auth boundary tại thời điểm đo; nó không thay thế authenticated UAT, database backup hay restore rehearsal.

Sau khi tải các artifact cần review về cùng một thư mục, chạy `npm run observe:production:report`. Rollup kiểm format/topology, loại evidence cũ hoặc trùng timestamp, phát hiện ngày thiếu, tính contract pass rate và latency p50/p95. Kể cả đủ 30 ngày sạch, kết quả cao nhất chỉ là `READY_FOR_HUMAN_REVIEW`; script không phát hành quyết định GO.
