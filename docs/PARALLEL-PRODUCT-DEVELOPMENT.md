# Kế hoạch phát triển song song — ERP/CRM, Realm, LeozOps/Jarvis

Quyết định người dùng ngày 13/09/2026 UTC (12/09 tại máy): **làm song song mọi phần; LeozOps chính là Jarvis**. Không tạo hai sản phẩm AI riêng. Yêu cầu này thay quyết định tạm dừng Realm trước đó. Mục tiêu là chất lượng sản phẩm và trải nghiệm làm việc, chưa phải hoạt động bán hàng hay định giá.

## Phân công và kết quả từng nhánh

| Nhánh | Đợt đang triển khai | Điều kiện kiểm chứng | Bước sau |
|---|---|---|---|
| ERP/CRM | Lead Kanban phân trang tại server; tổng/forecast/campaign độc lập với trang; CSV toàn scope khi yêu cầu; trạng thái tải/lưu cho báo giá, hóa đơn, ticket | Scope/quyền/cursor/aggregate tests, component browser, regression, build | Bộ lọc/saved views; export dung lượng lớn; reviewer hai tài khoản; dashboard theo vai trò; đối soát tài chính |
| LeozOps/Jarvis | Cách ly request, hội thoại, bằng chứng và voice theo phiên; chống câu hỏi trùng và response cũ sau disconnect | Chạy client thật với deferred requests; typecheck, tests, build riêng | Tích hợp issuer SSO, provenance/historical facts, qualification cho provider/voice bằng bằng chứng đúng môi trường |
| Realm 3D | Kệ/sách Thư viện theo cấu tạo medieval và mét, gộp geometry/material | Tests hình học/va chạm, build, ảnh runtime High/balanced, mở Thư viện và quay lại | Nhân vật production/rig; ngồi và hand IK; ánh sáng; đo thiết bị; G1 trước khi mở rộng |

ERP là nơi lưu nghiệp vụ chính. LeozOps/Jarvis đọc, giải thích và hỗ trợ quyết định theo authority hiện có. Realm là không gian làm việc truy cập cùng nghiệp vụ và quyền. Không nhân đôi dữ liệu thành ba hệ thống tự quyết độc lập.

## Cách tích hợp mỗi đợt

1. Giao phạm vi file riêng; giữ toàn bộ thay đổi chưa commit.
2. Chạy kiểm tra tập trung trên thay đổi của từng nhánh.
3. Ghép thay đổi và chạy regression. Dừng đúng preview do workspace quản lý trước khi ghi `.next`; build xong mới khởi động lại.
4. Ghi build ID, log, ảnh và những giới hạn chưa kiểm chứng. Không dùng component fixture thay xác thực thật, không dùng ảnh concept thay ảnh runtime.
5. Cập nhật kế hoạch dài hạn của từng nhánh và đợt kế tiếp.

## Tiêu chuẩn hoàn thành

- ERP: thao tác trả đúng kết quả; dữ liệu theo quyền; lỗi không biến thành 0/thành công; không mất form; hành trình có thể hoàn thành và kiểm chứng.
- LeozOps/Jarvis: không lẫn phiên/tenant; giữ provenance và authority; G5–G7/J1–J8 chỉ đạt khi đúng bằng chứng, không suy từ unit tests.
- Realm: hướng hình ảnh medieval đã chốt, engine chưa quyết định; 36 rule nội bộ và G1–G3 vẫn là cổng nghiệm thu. Sửa asset không tự chứng thực AAA.

Kế hoạch chi tiết: [ERP/CRM](ERP-CRM-WORK-EXPERIENCE-PLAN.md), [Realm tới AAA](realms/REALM-AAA-RESUME-PLAN.md), LeozOps `leozcrm-product/docs/JARVIS_COMPLETION_PLAN.md` và `docs/RELEASE_GATES.md` trong worktree tương ứng.

## Kết quả đợt đầu chạy song song

[Báo cáo tích hợp](../qa/parallel-development/2026-09-13/REPORT.md): ERP/Realm 1.273 tests và 26 component browser PASS; LeozOps/Jarvis 402 tests và 7 browser smoke PASS; hai build thành công. ERP/Realm preview đã cập nhật. Jarvis chưa có server local chạy.

Realm geometry đã kiểm chứng, nhưng browser 3D tiêu chuẩn và diagnostic 960×600 đều timeout trên SwiftShader. Ảnh balanced đã ghi nhận; High và nghiệm thu thiết bị chưa có. Đây là vấn đề còn mở, không đổi AAA tracker thành PASS. Đợt kế tiếp của nhánh Realm cần đo render/control trên thiết bị đúng và xử lý bottleneck trước khi tăng số asset.
