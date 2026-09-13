# Realm 3D và nền tảng sản phẩm — cập nhật 12/09/2026

Ưu tiên hiện tại: **Realm/AAA đã tiếp tục theo yêu cầu mới nhất của người dùng**, song song ERP/CRM và LeozOps (= Jarvis). [Kế hoạch tích hợp](PARALLEL-PRODUCT-DEVELOPMENT.md) điều phối công việc; [checkpoint AAA](realms/REALM-AAA-RESUME-PLAN.md) giữ các cổng chưa đạt. Các kết quả kỹ thuật bên dưới là lịch sử, không phải chứng nhận AAA.

## Tiếp tục — đến đúng bàn, camera và độ nét

Chọn địa điểm giờ đợi nhân vật đến trong 18 cm quanh điểm làm việc rồi mới mở bảng, đồng thời quay về phía mặt bàn. Camera theo nhân vật được chặn trước vùng bao của các vật cản lớn như tường, cột và kệ sách, kể cả trong lúc chuyển động nội suy. Tám bảng nghiệp vụ vẫn dùng hành động và kiểm tra quyền hiện có.

Menu Đồ họa thêm “Ưu tiên độ nét”, lưu qua tải lại trang. Độ phân giải có thể phục hồi sau khi khung hình ổn định; mức sàn 75% áp dụng so với giới hạn của chế độ đang chọn, không phải cam kết 75% độ phân giải màn hình hay đạt D60. Nền 5 FPS khi mở bảng làm việc không còn làm sai mẫu chẩn đoán khung hình đang hoạt động.

44 kiểm thử logic và 8 ca trình duyệt desktop/mobile giả lập đạt; production build thành công. [Báo cáo bản dựng, kiểm tra trình duyệt và ảnh thực tế](../qa/realm-3d/navigation-clarity/REPORT.md) ghi rõ phạm vi và giới hạn. Model sách, kệ, nhân vật, hoạt cảnh ngồi và ánh sáng kiến trúc vẫn chưa đạt thiết kế; G1 tiếp tục In progress.

## Medieval G1 — triển khai sau khi chốt thiết kế và rule

Góc Thư viện có bộ bàn ghế và dụng cụ viết dựng riêng theo mét, mộng/chốt gỗ, mặt bàn ghép ván, khoảng đầu gối và hướng UV theo từng chi tiết. Bàn cao 75 cm tính từ mặt sàn đá thực tế, không bị hệ số Y của cảnh cũ làm sai. Cửa sổ phía bắc đã khoét xuyên tường, dùng kính trong và có sân/kiến trúc ngoài cửa sổ tạo chiều sâu. Mọi lối tới tám bảng nghiệp vụ vẫn được kiểm tra trên collider thật.

Đây là bước dựng hình của G1, chưa hoàn thành model nhân vật, ngồi làm việc hoặc chất lượng AAA. Xem [bằng chứng và giới hạn của batch](../qa/realm-3d/medieval-g1/REPORT.md). Engine vẫn là Three.js; chưa có quyết định chuyển Unreal.

## Tiếp tục ngày 12/09/2026 — sàn, tài nguyên đồ họa và QA mobile

Sàn gỗ/đá được gộp thành hai lượt vẽ với UV theo mét, giữ màu từng tấm và độ lệch vân; sửa lỗi UV hình vuông bị kéo giãn trên tấm gỗ dài/ngắn. Preset high vẫn giữ PBR/bóng đổ nhưng có thể giảm framebuffer khi thiết bị chậm, phản ứng sớm với hai stall liên tiếp. Mức giảm được giữ qua đổi preset và chuyển Chronicle trong cùng document; WebGL context cũ được giải phóng ngay khi rời Realm. Trong lúc tải texture, nền dựng 10 FPS để nhường tài nguyên tải ảnh. Preview có deadline khởi động nguội 45 giây và vẫn xác minh build thực.

Lỗi mobile của lần chạy 09/09 đã được tái hiện; chưa được dùng như một gate đã qua. Test tập trung mới 37/37 đạt. Browser QA giữ viewport/DPR/timeout, dùng ảnh CSS thay screencast liên tục để giảm tải quan sát. Xem [kết quả và các lần đối chứng ngày 12/09](../qa/realm-3d/2026-09-12/REPORT.md). Chưa nâng trạng thái phát hành AAA hoặc nghiệm thu thiết bị thật.

## Tiếp tục ngày 09/09/2026 — chất liệu, tỷ lệ và thao tác làm việc

Phản hồi sản phẩm: môi trường còn nhựa. Lượt này thay vật liệu màu phẳng bằng 11 texture PBR gốc, tổng 6,12 MiB, lưu tại `public/realms/assets/materials/pbr-v1/`. Gỗ sồi, đá xây, bề mặt khoáng và vải có normal/roughness riêng; sàn và đồ gỗ áp dụng lớp hoàn thiện mờ. UV của cảnh tĩnh được tính theo mét trước khi gộp geometry. Cạnh bàn/nẹp được bo ở mức milimét; có bóng tiếp xúc tĩnh dưới nội thất, ánh sáng chính có hướng và ánh sáng bù lạnh nhẹ. Trần và dầm hiện trong góc nhìn đi bộ, ẩn trong toàn cảnh. Bàn ghế được hạ theo tỷ lệ người trưởng thành; tọa độ va chạm và tám lối tới bảng công việc được giữ theo mét.

Texture là tác phẩm CC0 của Poly Haven, tải nguyên bản và kiểm checksum. [Giấy phép](https://polyhaven.com/license); nguồn/tác giả/URL/hash từng file ở `public/realms/assets/materials/pbr-v1/manifest.json` (Powered by Poly Haven). App chỉ đọc file cùng origin. Khi texture chưa tải hoặc lỗi, vật liệu nền vẫn hiện; đổi preset trong lúc tải giữ đúng texture. QA trực quan phát hiện bộ nhớ texture 2px không tự lớn lên 1K trong WebGL; đã giải phóng allocation cũ trước khi thay ảnh, giữ tham chiếu dùng chung và chặn callback sau dispose.

Nhân vật được sửa tỷ lệ người trưởng thành, hình khối mặt/tóc và giày, thêm vân vải; chuyển động chân hai khớp giữ bàn chân ngang và không xuyên sàn trong kiểm thử. Mỗi avatar hiện 29 mesh và 9.952 tam giác; đây vẫn là nhân vật dựng bằng mã, chưa có bộ mesh/rig/animation do họa sĩ tạo và LOD cho phòng đông người.

HUD bỏ tiêu đề quảng bá lớn, tập trung vị trí/góc nhìn. Minimap nằm trong danh sách địa điểm; chữ ở menu lớn hơn, nút di chuyển mobile 48px. Các menu loại trừ nhau, Escape trả focus về nút mở, mở bảng làm việc đóng menu phụ. Tám bảng nghiệp vụ và camera được giữ nguyên chức năng.

F09: hai API collection dùng chung whitelist filter và scope ở database; thêm `pageSize`/`cursor` tối đa 200 dòng mỗi trang, thứ tự có `id`, kiểm scope của anchor, `private, no-store`. Response vẫn là array, cursor kế tiếp ở `X-Collection-Next-Cursor`. Caller cũ chưa dùng phân trang vẫn nhận danh sách đầy đủ: cần tiếp tục chuyển từng màn hình có aggregate đúng, không tự cắt dữ liệu của dashboard. Chưa có benchmark truy vấn trên dữ liệu lớn hay snapshot bất biến khi thứ tự bị sửa đồng thời.

Kiểm chứng trong lượt này: full coverage **1.214/1.214**, không fail/skip, line **94,52%**, branch **81,18%**, function **92,11%**; F09 có kiểm thử Prisma/PostgreSQL thật trên database dùng thử. Lần full này thay thế kết quả cũ 1.188/1.189 ở dưới. Sau khi chỉnh trần/vật liệu cuối, chạy lại targeted Realm, production build và browser QA; xem [báo cáo kiểm chứng 09/09/2026](../qa/realm-3d/2026-09-09/REPORT.md) để biết phạm vi và kết quả cuối.

Rà soát cảnh thật phát hiện trần ẩn vẫn chặn raycast ở toàn cảnh. Overhead hiện không tham gia picking; test dùng geometry thật kiểm cả đường tia bị trần cắt và kết quả chọn đúng bàn dự án. Camera khởi tạo và chuyển từ toàn cảnh về đi bộ đặt ngay dưới dầm trước khi render trần, còn zoom đi bộ giới hạn cao 4,5m.

Các khoảng trống AAA vẫn còn: asset môi trường/nhân vật được tạo chuyên biệt, light baking đúng kiến trúc, phòng riêng thực, LOD/animation đủ trạng thái, benchmark GPU/thiết bị thật và nghiệm thu nhiều người. Không dùng ảnh đẹp hơn hoặc kết quả demo để đánh dấu các mục đó hoàn thành.

Mục tiêu của lượt triển khai này là tạo văn phòng 3D có tương tác thật với hệ thống công việc hiện có. Chất lượng AAA là mục tiêu nghiệm thu dài hạn; mã hiện tại là một bản triển khai để kiểm thử, chưa phải sản phẩm AAA hoàn tất.

## Nơi chứa thay đổi

- ERP/Realm: worktree `CRMegoric-Realm-3D`, nhánh `codex/realm-3d-office`, xuất phát từ `fd5daeb`.
- LeozOps: worktree `leozcrm-product`, nhánh `codex/product-foundation`, xuất phát từ `c8b0ffe`.
- Chưa commit, push hoặc triển khai production. Các worktree gốc và ảnh người dùng đã chỉnh được giữ nguyên.
- Không sao chép `.env` hoặc kết nối database production. Các kiểm thử PostgreSQL chạy trên database dùng thử tại loopback.

## Realm hiện làm được gì

Đại sảnh được dựng bằng Three.js, có chiều sâu, vật liệu, ánh sáng, avatar có chuyển động, va chạm với đồ đạc và tìm đường A*. Người dùng có thể đi bằng WASD/phím mũi tên, nhấp sàn, chọn địa điểm, xoay camera, chuyển góc nhìn thứ nhất hoặc nhìn toàn cảnh. Điện thoại có cụm điều khiển cảm ứng. Âm thanh không gian và tiếng bước chân chỉ bật sau thao tác của người dùng.

Tám địa điểm mở các bảng nghiệp vụ của Realm hiện có:

| Địa điểm | Bảng công việc dùng lại |
|---|---|
| Bàn công việc | Nhận việc, tiến độ, gửi review |
| Bàn dự án | Dự án, chiến dịch và phối hợp |
| Kho bạc | Tài chính theo quyền |
| Thư viện | Thông tin và briefing |
| Phòng đội nhóm | Thành viên và đội nhóm |
| Phòng điều hành | Điều hành và hành động quản lý |
| Góc cá nhân | Hồ sơ và Chronicle |
| Phòng họp | Party và cộng tác |

`/realm` dùng thế giới 3D theo mặc định khi người dùng đã đăng nhập. `/realm-demo?world=3d` là bản xem thử có dữ liệu mẫu. Đường dẫn `?world=v3` vẫn mở chế độ tương thích. Chế độ demo được ghi nhãn; nhân vật mẫu không được chèn vào văn phòng làm việc thật.

Mạng hiện diện tách bản đồ `guildhall-3d` khỏi `castle`, tránh trộn tọa độ 3D và 2.5D. Danh tính dựa trên userId, xử lý người trùng tên và reconnect. Hồ sơ đồng đội mở từ avatar; lệnh đi tới chờ đóng bảng và renderer sẵn sàng. Vị trí 3D được khôi phục theo đúng bản đồ.

Mic, camera và chia sẻ màn hình tiếp tục có điều khiển tắt khi mở bảng nghiệp vụ. Âm thanh nhận được giữ độc lập với việc mở/đóng bảng. Đây là thay đổi về vòng đời giao diện; chưa nghiệm thu cuộc gọi bằng thiết bị thật.

Browser QA phát hiện phòng họp chưa có phiên cộng tác truyền `null` vào bộ chuẩn hóa, làm lỗi toàn trang. Đã sửa để phòng họp trống có tiến độ bằng 0 và dữ liệu phiên không hợp lệ bị từ chối; 10/10 kiểm thử cộng tác đạt sau sửa.

Chế độ đồ họa cao dùng PBR. Chế độ nhẹ dùng vật liệu chiếu sáng theo đỉnh, giới hạn số pixel dựng, tắt shadow map và tự hạ độ phân giải khi nhiều khung hình liên tiếp bị chậm. Cảnh tĩnh được gộp theo vật liệu; các đích raycast riêng giữ tương tác đồ nội thất. Khi mở bảng làm việc, nền 3D giảm tần suất dựng. Đây là cơ chế tối ưu, chưa phải bằng chứng đạt 60 FPS.

## Nền nghiệp vụ đã thay đổi

| Mục trong kế hoạch | Kết quả hiện tại | Phần còn lại |
|---|---|---|
| F01 — Quyền theo bản ghi/trường | Khóa quyền sửa/xóa nghỉ phép, review, các bản ghi tài chính; session API và v1 dùng chung transaction | Tiếp tục kiểm thử hành trình từng vai trò trên trình duyệt |
| F02 — Không sửa tiền tùy tiện | Bảo vệ giao dịch đã liên kết receipt, hóa đơn đã thu và vendor bill; điều kiện ghi chống race | Tiền vẫn theo schema số nguyên hiện có; chưa thay schema kế toán toàn hệ thống |
| F03 — Thanh toán đồng thời | Command idempotent, request hash, receipt, Serializable transaction, kiểm tra số dư và rollback | Hoàn tiền, phần lẻ đơn vị tiền tệ, đối soát ngân hàng chưa nằm trong command này |
| F04 — Đơn vị tiền/tỷ giá | Quy đổi trước khi cộng báo cáo; giữ số tiền nguyên tệ, tỷ giá snapshot, báo thiếu tỷ giá rõ ràng | Dữ liệu lịch sử thiếu tỷ giá và inventory chưa đủ tỷ giá cần đối soát; chưa tự suy đoán |
| F05 — Payroll | Công thức theo kỳ 2025/2026, giảm trừ/người phụ thuộc, chặn finalize bản nháp dùng công thức cũ | Trần bảo hiểm, ngoại lệ phụ cấp/OT và ngày thực trả cần nghiệp vụ chi tiết |
| F06 — Lead thành Client | Command chống tạo trùng, giữ nguồn/campaign và liên kết hai chiều, audit/outbox nguyên tử | Chưa backfill liên kết lịch sử bằng suy đoán tên |
| F07 — Vòng đời task | Đồng nhất làm → review → hoàn tất; version task tăng qua cả session/v1 và vô hiệu snapshot cũ | Nghiệm thu review/approval thật giữa nhiều người |
| F08 — Sự kiện bền vững | Outbox cùng transaction với mutation/audit; lease, retry, dead-letter, worker watch | Một số emitEvent cũ chưa chuyển; webhook ngoài vẫn at-least-once và cần receiver dedupe |
| F09 — Truy vấn | Tìm kiếm Shell/Realm lọc và giới hạn tại server; session/v1 collection dùng chung filter/scope và hỗ trợ cursor có ràng buộc, tối đa 200 dòng/trang | Caller cũ còn đọc danh sách đầy đủ; cần chuyển UI sang phân trang, aggregate riêng và đo query plan trên dữ liệu lớn |
| F10 — QA/CI | Database fixture riêng, migration và coverage thực, thêm auth E2E bắt buộc có fixture | Auth E2E mới chưa được chạy cục bộ; CI cần chạy trên runner thật |
| F11 — Bằng chứng ảnh | Sửa Git attributes cho ảnh nhị phân; kiểm tra chữ ký/chunk CRC PNG | 174 ảnh QA lịch sử bị hỏng vẫn cần chụp lại; không coi chúng là bằng chứng đạt |
| F12 — Điều hướng | Menu, tìm kiếm, drawer và route guard theo quyền/phân hệ | Tiếp tục kiểm tra UX với người dùng thật |
| F13 — LeozOps lịch sử tài chính | Chưa triển khai nguồn lịch sử hoàn chỉnh | Cần fact/ledger có provenance và cơ chế nạp lại; snapshot hiện tại không đủ để suy ra lịch sử |
| F14 — LeozOps human session | Receiver SSO Ed25519, one-use challenge/JTI, opaque cookie, scope/tenant, CSRF, expiry/revoke | Chưa có issuer ERP/IdP thực và nghiệm thu HTTPS xuyên origin; thiếu config thì tắt |
| F15 — AI/voice live | Giữ nguyên các release gate G/J; không tạo bằng chứng live giả | Cần provider/issuer và dữ liệu môi trường thật được cấu hình |
| F16 — Realm 3D | Thế giới, avatar, camera, vật lý/tìm đường, tám khu vực, giao diện cảm ứng và tích hợp bảng hiện có | Asset nhân vật/môi trường cấp AAA, âm thanh thực, phòng họp riêng, LOD/baked lighting và benchmark nhiều máy |

## Bằng chứng kiểm thử

- Coverage ERP lần đầu: **1.171/1.171** test đạt, không skip; line **94,44%**, branch **80,61%**, function **91,94%**.
- Coverage sau các bổ sung cuối: **1.189** test, **1.188 đạt**, một source audit chưa hiểu callback điều kiện. Coverage line **94,48%**, branch **80,81%**, function **91,94%** đều đạt ngưỡng. Audit đã được sửa để truy vết cả ba handler mic/camera/share, không whitelist; targeted **7/7** đạt. Không ghi lần chạy full này thành 1.189/1.189 đạt và không cộng targeted vào full suite.
- Task bookkeeping cuối: **54/54** targeted test, gồm 8 test mới gọi session/v1 handler thực qua boundary, xác nhận stale snapshot 409 và rollback.
- Lifecycle hồ sơ/di chuyển/audio: **25/25** targeted test.
- Đồ họa, đường đi, collision, tương tác, lifecycle và chất lượng: **20/20** targeted test sau các sửa cuối; retry WebGL cũng tạo canvas mới qua key remount.
- Production build sau toàn bộ thay đổi đạt. Browser QA production demo: **8/8** test đạt trên Chromium desktop/mobile, gồm cả tám khu vực và lựa chọn đồ họa bền qua remount. Ảnh đã kiểm tra cấu trúc và CRC nằm ở [manifest ảnh Realm 3D](../qa/realm-3d/2026-09-08/manifest.json).
- Các suite thanh toán, lead, tìm kiếm và outbox có kiểm thử PostgreSQL thực. 31 migration áp dụng thành công trên database dùng thử; kiểm tra Prisma không có schema drift. Máy cục bộ dùng PostgreSQL 18.4; CI khai báo PostgreSQL 16.
- LeozOps: **389/389** test; **18/18** focused; typecheck và build đạt. Migration human session mới chỉ được kiểm tra với SQLite.
- `npm audit --omit=dev --audit-level=high`: không phát hiện lỗ hổng tại lần chạy này.
- Bản production build đầu tiên đạt; kết quả build và browser QA sau thay đổi cuối được ghi ở phần cập nhật bên dưới.

Log thô dùng thử ở `.codex-runtime/`; thư mục này không phải chứng cứ production và không đưa vào commit. Không cộng số targeted test vào full suite để tạo một tổng số dễ gây hiểu nhầm.

## Cách chạy worker khi triển khai môi trường kiểm thử

Các mutation đã chuyển sang outbox cần một worker để gửi notification/change feed. `npm run dev` hiện giữ hành vi cũ; có thể dùng `npm run dev:workspace` với cấu hình `EVENT_OUTBOX_WORKER_ENABLED=1` để Next và worker cùng vòng đời, hoặc vận hành worker riêng bằng `npm run events:worker -- watch --poll-ms 1000 --limit 100`.

Worker đọc cùng database với app, chỉ xử lý job có lease hợp lệ và không cài lịch hệ điều hành. Xem `event-outbox.md` cho trạng thái, retry và dead-letter. Chạy worker ở môi trường thật cần cấu hình vận hành tương ứng; lượt này chưa triển khai worker production.

## Những điều kiện còn thiếu trước khi gọi là văn phòng AAA hoàn chỉnh

1. Chốt bộ asset 3D thống nhất: nhân vật có rig/animation chất lượng, chuyển động đi–dừng–ngồi–tương tác, PBR texture có nguồn gốc/license, LOD và baked lighting. Cảnh procedural hiện tại là cơ sở để xác minh lối đi và thao tác.
2. Đo trên máy thực: khung hình/frame time, thời gian vào phòng, VRAM/RAM, nhiệt và pin trong phiên làm việc dài; ít nhất một máy GPU tích hợp, một desktop có GPU rời và điện thoại. Chọn preset dựa trên kết quả đo.
3. Nghiệm thu nhiều người: reconnect, tài khoản trùng tên, 10–30 người cùng phòng, mất mạng, đổi tab, mic/camera/screen share, âm thanh theo khoảng cách, quyền truy cập và riêng tư phòng họp.
4. Kiểm tra làm việc xuyên suốt: nhận task → làm → gửi review → người khác duyệt → kết quả đồng bộ ERP/Realm, đầy đủ pending/error/retry. Chỉ đánh dấu đạt sau auth browser E2E và thử với nhóm thật.
5. Hoàn tất các khoảng trống dữ liệu và vận hành trong bảng F01–F16; chạy staging migrations, backup/restore, quan sát worker và rollout theo vai trò.

Không có kiểm thử bằng phần mềm nào trong lượt này thay thế được nghiệm thu GPU, thiết bị âm thanh, người dùng nhiều máy hoặc dữ liệu production.

## Cập nhật kiểm chứng cuối

Browser QA và build production demo đã hoàn tất. Không dùng kết quả demo này làm bằng chứng cho auth/sync ERP hay hiệu năng phần cứng.

Lệnh bật bản xem thử cục bộ có đồng bộ ERP đã bị bộ duyệt tự động từ chối với lý do duy nhất “blocked by policy”. Không chạy lại lệnh đó qua đường khác. Browser QA hiện dùng demo không kết nối database; phần auth/sync E2E được giữ là chưa kiểm chứng.
