# Realm — checkpoint và lộ trình tiếp tục tới mục tiêu AAA

Trạng thái công việc: **IN_PROGRESS — RESUMED_BY_USER**. Quyết định mới nhất (13/09/2026 UTC) yêu cầu phát triển Realm 3D/AAA song song ERP/CRM và LeozOps (= Jarvis). Trạng thái tạm dừng trước đó đã được thay thế; [kế hoạch tích hợp](../PARALLEL-PRODUCT-DEVELOPMENT.md) điều phối đợt mới. Tiếp tục phát triển không đồng nghĩa qua cổng nghiệm thu AAA.

## 1. Những gì đã giữ lại

- Worktree: `CRMegoric-Realm-3D`, branch `codex/realm-3d-office`; các thay đổi hiện có chưa được commit. Không coi branch HEAD là snapshot đầy đủ của công việc.
- Build được kiểm tra gần nhất: `585c-bVPJ9w1auuscamXU`. URL preview gần nhất: `http://127.0.0.1:3410/realm-demo?world=3d`; khi quay lại phải xác minh lại, không mặc định server/build vẫn còn.
- Three.js, camera/va chạm/tìm đường, tám điểm mở bảng nghiệp vụ hiện hữu, PBR nội bộ, góc Thư viện có bàn ghế theo mét, cửa sổ xuyên tường.
- Đợt cuối: đến điểm làm việc trong 18 cm, hướng nhân vật về bàn, camera chặn vật cản lớn, lựa chọn độ nét và phục hồi độ phân giải.
- [Bằng chứng đợt cuối](../../qa/realm-3d/navigation-clarity/REPORT.md): 44 unit tests và 8 ca browser có phạm vi cụ thể; không phải nghiệm thu AAA hay benchmark GPU.
- Chất lượng: **G1 In progress; release gate failed; 36 rule NOT_TESTED**. Đồ họa còn khoảng cách lớn với concept; chưa có nhân vật production, hoạt cảnh ngồi/hand IK và kiểm chứng đa thiết bị/nhiều người.

## 2. Tài liệu phải đọc khi tiếp tục

1. [Art direction medieval v2](visual-forge/medieval-design-v2/ART-DIRECTION.md) và [bảng concept](visual-forge/medieval-design-v2/index.html).
2. [36 rule nghiệm thu](REALM-AAA-ACCEPTANCE-RULES-V1.md) và [tracker](REALM-AAA-RULES-TRACKER-V1.csv).
3. [Kế hoạch spatial gốc và Decision Log](REALM-AAA-SPATIAL-REBUILD-PLAN.md).
4. [Tình trạng ERP/CRM](../ERP-CRM-WORK-EXPERIENCE-PLAN.md): giữ các thay đổi nghiệp vụ đã hoàn thành trong thời gian Realm tạm dừng.

Hướng đã chốt: medieval có cấu tạo hợp lý, người trưởng thành, chất liệu gỗ/đá/vải đúng tỷ lệ; ưu tiên hình ảnh trước. **Chưa quyết định chuyển Unreal Engine**. Không chuyển engine ngầm và không dùng concept làm bằng chứng runtime.

## 3. Thứ tự thực hiện khi được tiếp tục

| Chặng | Công việc bắt buộc | Điều kiện sang chặng tiếp |
|---|---|---|
| R0 — Khôi phục bối cảnh | Đọc tài liệu; xác minh branch, diff, build, đường dẫn và ảnh; rà lại quyết định G0; khóa phạm vi khu mẫu 6×8 m, góc camera và thiết bị đánh giá | Không mất thay đổi ERP; có phạm vi/thiết bị/baseline và danh sách phần chưa duyệt rõ ràng |
| R1 — Asset khu mẫu | Hoàn thiện sách/kệ/cấu tạo phòng, tường/trần/sàn, đồ nghề; UV/texel density, vật liệu và chi tiết bề mặt có nguồn gốc; thay nhân vật procedural bằng model/rig phù hợp | Asset manifest/license; tỷ lệ và tiếp xúc đúng ở nhiều góc; art review theo rule áp dụng |
| R2 — Làm việc có chuyển động | Đi/dừng/quay/ngồi/đứng, tiếp xúc chân/tay/ghế, tiếp cận bàn và thoát bàn; một tác vụ ERP thật từ nhận việc tới review và trở lại | Không xuyên hình, không khóa điều khiển, không tạo kết quả nghiệp vụ giả; kiểm thử quyền/error/retry và nhận xét trực quan |
| R3 — Ánh sáng và hiệu năng G1 | Ánh sáng theo kiến trúc, shadow/contact, LOD/batching/texture budget, kiểm tra camera mọi hướng; đo frame time, RAM/VRAM, thời gian tải trên thiết bị đã khóa | G1 chỉ đạt khi đủ bằng chứng cho tập rule trong khu mẫu, đúng ngưỡng đã định; không thay tiêu chuẩn bằng chế độ hình quá mờ |
| R4 — Toàn văn phòng G2 | Mở rộng bộ kit thống nhất sang các khu còn lại; định hướng, âm thanh, presence/voice/share, riêng tư/phân quyền, reconnect, bàn phím/mobile | Đủ 36 rule trong phạm vi phát hành; tải 12 người và profile C theo tài liệu; dữ liệu ERP là nguồn chuẩn |
| R5 — Beta và G3 | Soak, nghiên cứu người dùng, lỗi P0/P1, restore/rollback, regression trên build cuối, đánh giá độc lập | Hồ sơ G2/G3 đầy đủ, điểm/rule đạt theo tiêu chuẩn nội bộ; ghi đúng build và thiết bị được chứng minh |

Không mở rộng nhiều phòng hoặc bộ chủng tộc khi khu mẫu chưa qua G1. Không xóa bằng chứng fail hoặc dùng test chức năng thay đánh giá hình ảnh. “AAA” ở đây là mục tiêu chất lượng nội bộ, không phải chứng chỉ ngành.

## 4. Việc đầu tiên khi quay lại

Đối chiếu ảnh High hiện tại với art direction, khóa danh sách asset cho khu Thư viện và nhân vật mẫu. Ưu tiên chất lượng hình khối, cấu tạo và ánh sáng; không tiếp tục chỉ thêm bộ lọc hoặc tăng độ phân giải. Kiểm thử lại đường đi/tác vụ sau thay model/collider. Kết thúc mỗi đợt bằng build, ảnh runtime, số đo, giới hạn và cập nhật tracker.

Quyết định tạm dừng trước đây chỉ thay đổi ưu tiên phát triển; khi tiếp tục vẫn bảo toàn code/asset và lịch sử bằng chứng. G1 và 36 rule chưa được đổi thành đạt.

## 5. Đợt tiếp tục song song

Build mới `yyey-xTXFRNmrxTgh6bcx`: kit kệ/sách đã nâng cấu tạo, giữ footprint/va chạm/điểm nghiệp vụ. Xem [báo cáo tích hợp và ảnh runtime](../../qa/parallel-development/2026-09-13/REPORT.md). Geometry tests PASS nhưng browser tiêu chuẩn và diagnostic 960×600 timeout trên SwiftShader; chỉ có ảnh balanced, chưa High. Ưu tiên tiếp theo là chẩn đoán tải/render/phản hồi điều khiển, benchmark cùng thiết bị và baseline, sau đó tiếp tục nhân vật/ánh sáng. Không mở rộng phòng theo kết quả này.
