# Realm — Bộ quy tắc nghiệm thu chất lượng AAA v1

Trạng thái: **PROPOSED_STANDARD / NOT_ASSESSED**  
Phạm vi: medieval 3D workplace, hình ảnh theo Art Direction v2, engine chưa quyết định.  
Mục đích: định nghĩa chất lượng cần chứng minh trước khi công bố đạt chuẩn nội bộ. Không phải chứng chỉ ngành, không phải kết quả đánh giá bản hiện tại.

## 1. AAA nghĩa là gì trong tài liệu này?

AAA là cách phân loại sản xuất gắn với ngân sách, đội ngũ và quy mô lớn; không có một bài test chung mà vượt qua sẽ tự biến sản phẩm thành game AAA. [Screen Australia](https://www.screenaustralia.gov.au/australian-games-industry-glossary-of-terms/?tagid=499) mô tả thuật ngữ theo quy mô game, ngân sách và đội ngũ; [Arm](https://www.arm.com/glossary/aaa-games) cũng giải thích bối cảnh sản xuất của AAA.

Bộ này chứng minh một tuyên bố hẹp và kiểm tra được: **“Bản build X đáp ứng chuẩn chất lượng AAA nội bộ của Realm, trên phạm vi nội dung, thiết bị và tải Y.”** Không dùng “được chứng nhận AAA quốc tế”, “AAA trên mọi thiết bị” hoặc coi Unreal/Nanite/Lumen, số polygon, ảnh AI, ngân sách hay doanh số là bằng chứng chất lượng.

Realm vẫn là sản phẩm làm việc trong thế giới 3D. Không cần thêm chiến đấu, bản đồ open-world hoặc hàng trăm NPC để hợp thức hóa chữ game. Vòng tương tác cần có mục tiêu rõ, lựa chọn có ý nghĩa và phản hồi đáng tin. Hoàn thành công việc, hợp tác và xây dựng không gian là trải nghiệm chính.

**Tất cả ngưỡng số dưới đây là tiêu chuẩn đề xuất riêng cho Realm**, không được trình bày là yêu cầu của Epic, Microsoft hoặc toàn ngành.

## 2. Luật quyết định đạt/rớt

- Mỗi rule có trạng thái PASS / FAIL / NOT_TESTED / BLOCKED. Chưa kiểm tra, thiếu thiết bị hoặc thiếu bằng chứng không được tính là PASS.
- Tất cả 36 rule R01–R36 là bắt buộc tại nghiệm thu phát hành. Điểm cao không bù cho rule rớt.
- Tất cả 12 nhóm chất lượng phải đạt ít nhất 8/10; các nhóm trải nghiệm, hiệu năng, làm việc và accessibility phải ít nhất 8,5/10. Trung bình có trọng số phải ít nhất 8,5/10.
- Không còn lỗi P0/P1 mở. P0: mất/lộ dữ liệu, vượt quyền, thu âm trái trạng thái, sai giao dịch hoặc mất dịch vụ diện rộng. P1: crash tái hiện được trong luồng chính, không vào/không làm/không lưu được việc, camera/input/voice ngăn sử dụng, thiếu asset chủ chốt. Lỗi thẩm mỹ P2 còn lại phải có phạm vi, bằng chứng, người phụ trách và quyết định chấp nhận; không được vi phạm một rule bắt buộc.
- Không tự hạ cấu hình, tải, nội dung hay ngưỡng sau khi test rớt. Muốn thay scope phải tạo phiên bản tiêu chuẩn mới, ghi lý do và được chủ sản phẩm chấp thuận trước lần đánh giá tiếp theo.
- Không bỏ test lỗi rồi công bố “100% pass”. Báo đủ passed, failed, skipped, timeout, blocked và not run.
- Một khu mẫu đạt không đồng nghĩa toàn app đạt. Thay đổi rendering, asset, camera, network hoặc dữ liệu làm mất hiệu lực các bằng chứng liên quan và bắt buộc kiểm tra lại.
- Concept v2 và mockup không thể làm bằng chứng PASS cho bất kỳ rule runtime nào. Bộ này không nâng trạng thái release gate hiện đang thất bại.

## 3. Hồ sơ kiểm thử phải khóa trước

Mỗi đợt có build ID, commit + bản diff nếu working tree chưa sạch, hashes asset, version backend/schema, seed dữ liệu đã làm sạch, OS, trình duyệt/engine, CPU/GPU/RAM/VRAM, driver, viewport, refresh rate, preset, tỷ lệ render trong, mạng và số người đồng thời. Một trường bắt buộc bị trống khiến hồ sơ chưa hợp lệ.

Ma trận đề xuất:

| Profile | Phạm vi nghiệm thu |
| --- | --- |
| D60 — desktop mục tiêu | Output 1920×1080, preset High đã khóa, tỷ lệ render trong không dưới 75% mỗi chiều; mục tiêu 60fps. Ghi rõ upscaling và dynamic resolution. |
| D30 — máy tối thiểu | Output 1280×720, preset Low đã khóa, không thay avatar bằng chấm; tỷ lệ render trong không dưới 75%; mục tiêu 30fps. |
| M — mobile workplace | Thiết bị iOS và Android vật lý đại diện cho danh sách hỗ trợ; tác vụ đầy đủ, chuyển cảnh/fallback rõ ràng. Nếu công bố mobile 3D, phải thêm profile M30 riêng với cấu hình đã khóa. |
| N — hợp tác | C = 12 người cùng văn phòng cho scope đầu tiên; 12 avatar trong tầm nhìn ở kịch bản nặng; tối thiểu 4 máy vật lý, nhiều tài khoản độc lập, các client còn lại có thể mô phỏng và phải ghi rõ. |
| N-normal / N-impaired | Mạng kiểm soát: RTT 50 ms / 150 ms; loss 0% / 1%; băng thông và jitter ghi trong manifest. Kịch bản ngắt mạng 10 giây được chạy riêng. |

Tên model thiết bị phải được điền **trước** kiểm thử; ma trận chưa được điền không phải lời hứa hỗ trợ. Năng lực C cao hơn thì test ở C đã công bố, không chỉ test 12. Mobile tác vụ đạt không chứng minh mobile 3D đạt.

Đường benchmark cố định: vào sảnh → đi quanh vùng có đủ C avatar → nhìn cận nhân vật và bàn → ngồi → mở/lưu việc → vào cuộc họp → mở tài liệu → về sảnh. Mỗi profile chạy ba lượt 10 phút sau warm-up hai phút, dùng cùng seed và đường đi. Test lần đầu chưa có cache thực hiện riêng, không xóa hitch lần đầu khỏi báo cáo bằng cách gọi nó là warm-up.

## 4. Bộ 36 rule bắt buộc

### A. Mỹ thuật medieval và bản sắc — trọng số 10%

<a id="R01"></a>

**R01 — Ngôn ngữ thiết kế thống nhất.** Toàn bộ phòng, nhân vật, đồ dùng và giao diện bám art bible đã khóa; không có asset placeholder trong vùng truy cập được. Mỗi hero asset có bảng tham chiếu, người review và nguồn/license. Bằng chứng: asset inventory, contact sheet từng phòng, review ngoại lệ.

<a id="R02"></a>

**R02 — Medieval có cấu tạo hợp lý.** Công trình có hệ chịu lực, mái, cửa, bậc và vật liệu nối hợp lý; trang phục có đường may, khóa và lớp vải hợp hướng thời kỳ. Đồ hiện đại hoặc fantasy phải là ngoại lệ đã ghi nhận. Bằng chứng: review từng hero asset và kiến trúc với tài liệu tham chiếu; không dùng ảnh AI tự sinh làm chứng cứ lịch sử.

<a id="R03"></a>

**R03 — Chất lượng giữ được ngoài góc đẹp.** Cảnh vẫn hợp lý ở camera đi bộ, nhìn ngược nguồn sáng, sát bàn và khi tắt bloom/DOF/grading. Không có lỗ mesh, mặt sau biến mất, bóng nướng vào tranh gây sai thị sai trong tuyến kiểm thử. Bằng chứng: tám góc cố định + video quay 360° ở từng phòng chủ chốt.

### B. Không gian và khả năng sử dụng — trọng số 10%

<a id="R04"></a>

**R04 — Tỷ lệ và tiếp xúc đúng.** Dùng thước trong scene để kiểm tra người, bàn, ghế, cửa theo art bible. Trong 20 lần ngồi/đứng cho mỗi tổ hợp body/ghế được hỗ trợ: không xuyên bàn, kẹt chân hoặc đứng vào tường. Asset có metadata kích thước, pivot và contact anchor.

<a id="R05"></a>

**R05 — Va chạm và camera tin cậy.** Mọi lối đi nhìn có thể đi phải đi được hoặc thể hiện rõ lý do khóa. Chạy route suite qua tất cả cửa, góc, cầu thang và điểm ngồi: không rơi khỏi map, kẹt không thoát, xuyên trần hoặc camera cắt đầu. Có nav/collision overlay và video tái hiện.

<a id="R06"></a>

**R06 — Định hướng không phụ thuộc nhãn nổi.** Ít nhất 9/10 người mới tìm được bàn cá nhân, dự án và phòng họp trong 90 giây mỗi khu sau hướng dẫn vào cửa. Mẫu thử không có người trong đội xây dựng. Không bật tất cả nhãn hotspot để vượt bài test; người dùng vẫn có directory/đi nhanh theo thiết kế thật.

### C. Nhân vật — trọng số 10%

<a id="R07"></a>

**R07 — Model và vật liệu trưởng thành.** Có front/side/back, topology, UV, rig và LOD; không chỉ một hình đẹp. Review mặt, tay, tóc, vải ở camera gameplay và cận 0,7–1 m: không da sáp, seam lộ nghiêm trọng, mắt rỗng hoặc tóc thành khối nhựa. Lưu ảnh sáng trung tính và sáng trong phòng.

<a id="R08"></a>

**R08 — Tùy biến không phá nhân vật.** Tất cả preset bán giao phải qua outfit/body compatibility matrix; các giá trị cực trị của slider có test bổ sung. Không mất mesh, lộ cơ thể xuyên áo lớn, phụ kiện trôi hoặc socket sai. Quyền và chức vụ không bị suy ra từ trang phục.

<a id="R09"></a>

**R09 — Presence là người dùng thật.** Một user/session chỉ có đúng avatar theo contract; reconnect, đổi phòng và mở thêm tab không sinh bản sao ngoài quy tắc. Roster, world và voice nhất quán theo trạng thái đã định nghĩa. Không thêm đồng nghiệp giả để làm video đông.

### D. Hoạt ảnh và camera — trọng số 10%

<a id="R10"></a>

**R10 — Bước chân có trọng lượng.** Walk/start/stop/turn trên mọi loại nền: marker chân trong đoạn planted không trượt quá 3 cm theo world space ở 95% mẫu đã gắn contact; không có lỗi nhìn thấy lặp lại. Đo ít nhất 20 chu kỳ cho mỗi clip/tốc độ/thân hình đại diện và review video ở tốc độ thật.

<a id="R11"></a>

**R11 — Tay và đồ vật thực sự tương tác.** Ngồi, viết, cầm/đặt sổ, đọc, chào và nói/nghe có chuyển trạng thái đầy đủ. Tại contact đã định nghĩa, lệch tay–anchor không quá 2 cm; không đổi pose bằng teleport qua vật thể. Test 20 lần mỗi tương tác trên ma trận body/prop.

<a id="R12"></a>

**R12 — Camera thoải mái.** Có chỉnh độ nhạy, tắt rung/head bob và reduced motion; camera không tự xoay khi đang nhập liệu. 10 người dùng thử 30 phút: ít nhất 9 người hoàn tất không phải dừng do camera; mọi báo cáo khó chịu vẫn ghi nhận và triage. Đây là kiểm thử UX, không phải chứng minh an toàn y khoa.

### E. Trải nghiệm và vòng tương tác — trọng số 10%

<a id="R13"></a>

**R13 — Luồng đầu tiên rõ ràng.** Ít nhất 9/10 người mới tự vào văn phòng, nhận diện trạng thái của mình, mở một việc và quay lại cảnh trong năm phút, không có người hướng dẫn trực tiếp. Mục tiêu là tác vụ thật, không tour bắt buộc.

<a id="R14"></a>

**R14 — Phản hồi nhanh và trung thực.** Phản hồi UI nhìn thấy sau input có p95 ≤100 ms trên D60 và ≤150 ms trên D30, đo tối thiểu 100 lần. Đây là thời gian tới phản hồi đầu tiên, không phải thời gian server lưu xong. Tác vụ chậm có pending; không báo hoàn tất trước xác nhận.

<a id="R15"></a>

**R15 — Không gây cản trở công việc.** Mỗi thao tác chính có lối trực tiếp và bàn phím. Trong bài thử đối chứng trên cùng năm tác vụ, thời gian hoàn thành bằng chế độ tác vụ của Realm không chậm hơn 20% median so với đường ERP trực tiếp; tách thời gian tự nguyện đi dạo. Không ép chờ hoạt ảnh, đi bộ hoặc nhận thưởng trước khi làm việc.

### F. Hiệu năng — trọng số 12%

<a id="R16"></a>

**R16 — Nhịp khung hình ổn định dưới tải.** Từng lượt benchmark phải đạt D60: mean FPS ≥58, frame time p95 ≤20 ms, p99 ≤33,3 ms; D30: mean FPS ≥29, p95 ≤36 ms, p99 ≤50 ms. Không có frame stall >100 ms trong đoạn đã vào tương tác. Không lấy trung bình các lượt để che lượt rớt. Đo thời gian trình bày khung hình và CPU/GPU khi khả dụng; không chỉ đếm requestAnimationFrame.

<a id="R17"></a>

**R17 — Tải và streaming có giới hạn.** Với hồ sơ mạng tải 50 Mbps, RTT 50 ms đã khóa: 10 cold loads có p95 từ mở trang đến có thể đi và mở tác vụ ≤15 giây; warm load ≤5 giây. Không bắt tải mọi phòng trước khi làm việc; thiếu asset có tiến độ/thử lại, không avatar rơi trong khoảng trống. Nếu phương thức phân phối thay đổi, phải version lại điều kiện đo trước test.

<a id="R18"></a>

**R18 — Tài nguyên không tăng vô hạn.** Sau warm-up, chạy 60 chu kỳ vào/ra 3D, mở/đóng tác vụ và họp; tại điểm đo nghỉ tương đương, memory cuối không vượt baseline quá 10% và 100 MB (phải đạt cả hai), không có xu hướng giữ thêm tài nguyên mỗi chu kỳ. Ghi cache residency, heap/native/GPU theo công cụ khả dụng; đối soát texture/buffer/track còn sống. Không crash, context loss không phục hồi hoặc audio track mồ côi.

Theo [Epic — Performance Profiling](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-performance-profiling-and-configuration-in-unreal-engine), profiling cần quan sát thời gian khung hình và các nguồn chi phí. Các ngưỡng Realm ở trên là quyết định dự án, không phải ngưỡng do Epic cấp.

### G. Độ ổn định và phục hồi — trọng số 10%

<a id="R19"></a>

**R19 — Sử dụng dài hạn.** Một đợt nghiệm thu có ít nhất 100 user-hours sử dụng người thật qua tối thiểu 20 người, gồm ít nhất 10 phiên liên tục hai giờ. Bổ sung ít nhất 500 phiên khởi chạy có đo crash (có thể tự động, phải ghi tách nguồn); crash-free ≥99,5% trên tập này. Crash tái hiện được ở luồng chính vẫn là P1 dù tỷ lệ tổng đạt. Không suy rộng tập thử nhỏ thành độ tin cậy production.

<a id="R20"></a>

**R20 — Mất mạng không mất sự thật.** Test ngắt mạng, refresh, server restart và retry giữa lúc lưu: không mất bản nháp đã cam kết giữ, không lặp giao dịch/Gold và không ghi đè âm thầm cập nhật người khác. Có trạng thái mất kết nối, xung đột và đường khôi phục. Kiểm tra ít nhất 20 chu kỳ mỗi trường hợp.

<a id="R21"></a>

**R21 — Build tái tạo và regression đầy đủ.** Build release thành công từ nguồn/lockfile đã ghi nhận; toàn bộ test bắt buộc của scope chạy hết. Không lỗi console/WebGL chưa phân loại trong đường chính; lỗi đã xử lý chủ đích phải có expectation rõ. Có fresh-install/fresh-profile test và báo cáo rollback.

### H. Hợp tác, voice và quyền riêng tư — trọng số 8%

<a id="R22"></a>

**R22 — Đồng bộ đủ nhanh.** Với C đã khóa: cập nhật có xác nhận đến client còn lại p95 ≤500 ms trên N-normal, ≤1 giây trên N-impaired, đo ít nhất 200 sự kiện. Trong mạng bình thường, không teleport người khác quá 0,3 m nếu không có sự kiện đi nhanh/respawn được chỉ rõ. Log thứ tự, duplicates, packet loss và clock synchronization.

<a id="R23"></a>

**R23 — Voice/screen share hoạt động thật.** Ít nhất bốn người dùng trên bốn thiết bị thử cuộc họp 30 phút với tai nghe, mute/unmute, rời/vào, đổi thiết bị và chia sẻ màn hình; không mất tiếng/ảnh không phục hồi. Voice one-way p95 ≤250 ms trên N-normal nếu đo được bằng phương pháp đồng bộ đã ghi; nếu chưa đo được thì NOT_TESTED. Có volume, thiết bị và trạng thái rõ; không dùng icon sáng làm bằng chứng có audio.

<a id="R24"></a>

**R24 — Mute, quyền vào phòng và reconnect đúng.** Không xin mic/camera ngoài thao tác có chủ đích. Sau tắt/rời, kiểm tra cả track, sender và người nhận không còn media ngoài contract; không chỉ kiểm tra label. Người không có quyền không nhận nội dung phòng qua API hay subscription. 20 chu kỳ reconnect hội tụ roster/voice trong ≤10 giây sau khi mạng phục hồi và server reachable; không nhân đôi user hoặc stream.

### I. Công việc và tính toàn vẹn — trọng số 10%

<a id="R25"></a>

**R25 — Phủ toàn bộ công năng đã có.** Capability matrix nối từng chức năng/role với entry point Realm hoặc lối ERP trực tiếp. 100% chức năng trong scope có đường truy cập, permission check và trạng thái rỗng/loading/lỗi. Không mất tính năng chỉ vì dựng lại 3D; chức năng chưa làm không được hiển thị như hoạt động.

<a id="R26"></a>

**R26 — Receipt và quyền là nguồn sự thật.** Test trái quyền, khác tenant, retry và gửi trùng request phải không đổi dữ liệu ngoài ý định được phép. Số dư, phần thưởng, duyệt và audit đối soát đúng. Bất kỳ mất dữ liệu, ghi trùng tiền/Gold hoặc lộ dữ liệu nào đều FAIL ngay, không dùng tỷ lệ phần trăm để chấp nhận.

<a id="R27"></a>

**R27 — Từ thế giới tới công việc và trở lại.** Kiểm tra đủ các khu đã công bố: tiếp cận → mở tác vụ → chỉnh/lưu → đóng → trở lại đúng phòng và ngữ cảnh. Bản nháp và trạng thái mic không bị mất/đổi bất ngờ. Hai người chỉnh cùng tài liệu có xử lý xung đột minh bạch; nếu chưa hỗ trợ realtime editing, UI phải nói rõ và dùng cơ chế tránh mất cập nhật.

### J. Accessibility và giao diện — trọng số 5%

<a id="R28"></a>

**R28 — Đọc được trên thiết bị hỗ trợ.** Chữ tiếng Việt đầy đủ dấu, không cắt ở mức text scale 200% trong chế độ tác vụ; kiểm tra 393×851, 1280×720 và 1920×1080. Contrast mục tiêu nội bộ ≥4,5:1 cho chữ thường, ≥3:1 cho chữ lớn/đối tượng UI thiết yếu theo cách phân loại đã ghi. Không dùng màu đơn độc để truyền trạng thái. Kiểm tra đọc thật và công cụ, không chỉ screenshot.

<a id="R29"></a>

**R29 — Không phụ thuộc vận động chính xác.** Luồng công việc đầy đủ dùng được bằng bàn phím; focus rõ, thứ tự hợp lý, Escape/Back hoạt động, không keyboard trap. Có remap các nút di chuyển cốt lõi, reduced motion, điều chỉnh camera và đi nhanh. Control tương tác chính trên cảm ứng có vùng chạm tối thiểu 44×44 CSS px. Người không dùng được 3D vẫn làm đủ tác vụ.

<a id="R30"></a>

**R30 — Thông tin âm thanh có đường thay thế.** Voice có chat song song; mọi thông báo hệ thống quan trọng có chữ/biểu tượng; nội dung thoại thu sẵn trong sản phẩm có phụ đề nếu tồn tại. Không tuyên bố live captions nếu chưa triển khai. Kiểm tra chế độ tác vụ với screen reader, ít nhất NVDA/Chrome và VoiceOver/Safari trên các nền tảng đã công bố; thử cùng người có nhu cầu accessibility.

[Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines) là tài liệu tham khảo để xây và kiểm tra các tính năng này. Áp dụng guideline không đồng nghĩa sản phẩm được Xbox chứng nhận.

### K. Âm thanh và chi tiết hoàn thiện — trọng số 3%

<a id="R31"></a>

**R31 — Âm thanh theo nguồn và chất nền.** Bước chân đổi theo gỗ/đá/thảm; giấy, ghế và cửa phát đúng lúc. Không âm thanh lặp gây khó chịu hoặc cùng một nguồn phát hai lần sau remount. Video kèm audio stems hoặc event log xác minh.

<a id="R32"></a>

**R32 — Mix phục vụ làm việc.** Volume riêng cho voice, hiệu ứng và ambience, có mute; speech rõ ở cả khu đông và cạnh lò sưởi. 9/10 người thử nghe được chỉ dẫn không phải tắt toàn bộ âm thanh môi trường. Không music/ambience tự bật lại sau khi người dùng đã tắt.

<a id="R33"></a>

**R33 — Hiệu ứng có nguyên nhân.** Shadow/contact, lửa, khói, vải và phản hồi vật thể khớp nguồn; không dùng bụi/bloom che mesh thô. Animation/UI có feedback pending, success, error tương ứng dữ liệu thật; reduced motion giữ đủ thông tin. Review tất cả điểm tương tác trong day/night preset.

### L. Bàn giao, vận hành và độ trung thực — trọng số 2%

<a id="R34"></a>

**R34 — Bằng chứng khớp sản phẩm được giao.** 100% cảnh/quần áo/tính năng xuất hiện trong demo nghiệm thu phải có trong build và profile đã khai báo. Không dùng offline render, ảnh AI, cắt ghép video hoặc giảm tốc playback làm bằng chứng runtime.

<a id="R35"></a>

**R35 — Phát hành và hỗ trợ có đường lui.** Có build identity nhìn được, hướng dẫn chạy, danh sách thiết bị hỗ trợ, known issues, monitoring lỗi và quy trình rollback đã thử trong staging. Backup/restore dữ liệu có bài kiểm tra phù hợp với phần dữ liệu trong scope; tài liệu không chứa bí mật.

<a id="R36"></a>

**R36 — Review có người chịu trách nhiệm.** Có ký nhận của phụ trách sản phẩm, kỹ thuật/QA và người review art không trực tiếp làm asset đang chấm. Tối thiểu ba người chấm chất lượng độc lập trước khi thảo luận chung; công khai bất đồng. Test tự động và AI hỗ trợ, không tự cấp toàn bộ điểm thẩm mỹ và khả năng sử dụng.

## 5. Chấm điểm chất lượng, không chấm theo cảm giác tùy ý

Mỗi nhóm ở mục 4 nhận 0–10. Điểm nhóm là trung vị của ít nhất ba reviewer, kèm timestamp và issue minh họa. Điểm tổng = Σ(điểm nhóm × trọng số)/100. Với nhóm có số đo, số đo đạt là điều kiện vào chấm chất lượng, không phải tự động được 10.

| Mốc | Diễn giải chung |
| --- | --- |
| 0–3 | Thiếu, hỏng hoặc placeholder; không dùng được như dự định. |
| 4–6 | Prototype hoạt động nhưng chất lượng không đều, lỗi dễ thấy, cần hướng dẫn hoặc né lỗi. |
| 7 | Dùng được ở khu mẫu, còn thiếu nhất quán hoặc độ hoàn thiện để phát hành. |
| 8 | Hoàn thiện trong toàn scope, không có khuyết điểm đáng kể trong tuyến kiểm thử; chi tiết nhỏ có ghi nhận. |
| 9 | Nhất quán cả cảnh nặng/góc xấu/tình huống lỗi; benchmark tương đương sản phẩm tham chiếu đã khóa. |
| 10 | Vượt chuẩn tham chiếu ở nhóm này, có bằng chứng lặp lại và đồng thuận reviewer; rất hiếm. |

Trước đánh giá, chọn ba tham chiếu runtime theo từng thuộc tính: kiến trúc/vật liệu, nhân vật/chuyển động, tương tác/co-op. Ghi tên game/build, máy, preset, góc nhìn và clip có thể kiểm tra hợp lệ; không so trailer với gameplay. Không có benchmark tham chiếu được khóa thì không công bố điểm 9–10. Bản thân việc chọn tham chiếu không thay đổi yêu cầu Realm.

Điểm tối thiểu: A/B/C/D/G/H/K/L ≥8; E/F/I/J ≥8,5; tổng ≥8,5. Mọi rule vẫn phải PASS. Không cho “art 10 bù voice 4”.

## 6. Các cổng nghiệm thu

| Cổng | Phải giao | Có thể tuyên bố |
| --- | --- | --- |
| G0 — Thiết kế | Art bible, concept, zoning, turnaround/asset brief, rule và scope được review | Hướng thiết kế đã được duyệt. Không phải chất lượng runtime đã đạt. |
| G1 — Khu mẫu | Một khu 6×8 m, nhân vật có rig, bàn/ghế, một tác vụ thật; R01–R08/R10–R18/R27–R29 áp dụng vào phạm vi mẫu có đủ bằng chứng | Khu mẫu đạt các rule đã kiểm tra. Các rule phát hành còn lại vẫn NOT_TESTED. |
| G2 — Toàn văn phòng | Đủ khu/nhân vật/tác vụ trong scope, 12 người/tải C, voice, phân quyền, accessibility; toàn bộ 36 rule được chạy | Ứng viên phát hành, chỉ khi rule và điểm đều đạt. |
| G3 — Phát hành | Hồ sơ G2 + soak/beta, build cuối, không P0/P1, rollback, sign-off độc lập | Build cụ thể đạt chuẩn chất lượng nội bộ Realm trên scope đã ghi. |

G0 chỉ xong khi thiết kế được review; việc tạo ba ảnh chưa đồng nghĩa G0 đã qua. Không dùng G1 để thay release gate đang FAIL trong kế hoạch cũ.

## 7. Hồ sơ bằng chứng tối thiểu

Một thư mục evidence cho mỗi build, gồm:

- manifest: build/commit/diff hash, engine/browser/backend, asset hashes, thiết bị, preset, resolution floor, mạng, C, thời điểm, tester.
- rules.csv: đúng 36 ID, trạng thái, phép đo, expected/actual, link bằng chứng, reviewer, issue, ngày kiểm tra.
- raw metrics: frame times từng lượt, loading times, memory snapshots/resource counts, network events và lỗi.
- captures: tám góc cố định, video 10 phút không cắt cho từng profile, ngày/đêm, tắt hậu kỳ, ngồi/làm việc, multiplayer/voice.
- usability: phương pháp tuyển người thử, thiết bị, task, thời gian, completion, nhận xét và sự cố; ẩn dữ liệu cá nhân.
- review: điểm của từng reviewer trước thống nhất, trọng số, kết luận, mọi ngoại lệ và lý do.
- release: test totals, bugs chưa đóng, scope không hỗ trợ, kiểm tra rollback và sign-off.

Video có thể chạy khác lượt profiling nếu capture làm thay đổi hiệu năng; hai lượt phải cùng build/profile/seed và được liên kết. Không dùng video đã làm mượt để chứng minh frame pacing. Dữ liệu bị thiếu/hỏng làm rule trở lại NOT_TESTED.

## 8. Trạng thái Realm hiện tại

**Chưa đủ bằng chứng đạt chuẩn này.** Đã có art direction v2, ba concept và mockup. Chưa có bộ asset 3D hoàn chỉnh tương ứng concept; chưa có đánh giá đủ 36 rule, ma trận thiết bị và sign-off độc lập. Các báo cáo trước ghi nhận browser timeout và release gate chưa qua.

Đây là hiện trạng để tổ chức công việc, không phải chấm lại điểm runtime trong lượt viết tài liệu này. Việc tiếp theo là review G0, khóa thiết bị/phạm vi và dựng G1; chưa được gọi Realm là sản phẩm đã được chứng thực AAA.

## 9. Nguồn tham khảo và ranh giới sử dụng

1. [Screen Australia — Games Industry Glossary](https://www.screenaustralia.gov.au/australian-games-industry-glossary-of-terms/?tagid=499): bối cảnh thuật ngữ AAA.
2. [Arm — AAA Games](https://www.arm.com/glossary/aaa-games): cách phân loại sản xuất.
3. [Epic — Performance Profiling](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-performance-profiling-and-configuration-in-unreal-engine): phương pháp quan sát hiệu năng.
4. [Microsoft — Xbox Accessibility Guidelines](https://learn.microsoft.com/en-us/xbox/accessibility/guidelines): khung tham khảo accessibility.
5. [Realm Art Direction v2](visual-forge/medieval-design-v2/ART-DIRECTION.md): mục tiêu thiết kế riêng của dự án.

Nguồn công khai cung cấp khái niệm và phương pháp. Các số 36 rule, 8,5/10, 12 người, 100 giờ, FPS, latency và sample size là tiêu chuẩn nội bộ đề xuất, không trích từ các nguồn này.
