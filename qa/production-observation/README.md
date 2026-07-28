# Production observation evidence

Mỗi lượt `npm run observe:production` tạo một JSON trong `runs/`. Thư mục `runs/` được gitignore vì đây là evidence theo thời gian, không phải source artifact.

Artifact chỉ chứa hostname công khai, route, HTTP status, latency và mã kiểm tra. Script không gửi credential/cookie/body, không đọc response body và không thực hiện mutation.

Trong GitHub Actions, evidence được upload với retention 30 ngày. Một lượt PASS chỉ chứng minh public availability và auth boundary tại thời điểm đo; nó không thay thế authenticated UAT, database backup hay restore rehearsal.
