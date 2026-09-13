# ERP/CRM — kế hoạch tối ưu sản phẩm và trải nghiệm làm việc

Trạng thái: **IN_PROGRESS — đang triển khai ERP/CRM theo yêu cầu tiếp theo của người dùng**.

Đợt đầu đã triển khai nền tải/lưu, giữ form khi lỗi, lọc dữ liệu hồ sơ khách hàng tại server và xử lý xung đột My Work. [Báo cáo kiểm chứng](../qa/erp-crm/reliability/REPORT.md) phân biệt kiểm thử component, domain/database thử và phần đăng nhập/production chưa nghiệm thu. Không coi các thay đổi này là hoàn tất toàn bộ ERP/CRM.

Yêu cầu tạm dừng Realm trước đây đã được thay bằng quyết định mới nhất: làm song song ERP/CRM, Realm 3D/AAA và LeozOps (= Jarvis). Xem [kế hoạch tích hợp](PARALLEL-PRODUCT-DEVELOPMENT.md). Mục tiêu vẫn là sản phẩm dùng tốt mỗi ngày; chưa ưu tiên bán hàng hay định giá. “ERM CRP” được hiểu theo bối cảnh là ERP/CRM.

Nguồn triển khai hiện tại: worktree `CRMegoric-Realm-3D`, branch `codex/realm-3d-office`. Tên branch là lịch sử công việc, không quyết định ưu tiên mới. Các thay đổi chưa commit phải được bảo toàn. [Realm đã lưu checkpoint riêng](realms/REALM-AAA-RESUME-PLAN.md).

## 1. Kết quả sản phẩm cần đạt

Một nhân viên mở app biết việc cần làm, tìm được ngữ cảnh, xử lý và thấy kết quả. Một quản lý biết việc nào cần quyết định và vì sao bị chậm. Sales theo được khách hàng từ lead tới bàn giao. Kế toán đối chiếu được chứng từ, thanh toán và số liệu báo cáo.

Nguyên tắc: **đúng dữ liệu → không mất công sức → rõ việc tiếp theo → ít bước → nhanh → thống nhất hình thức**. Không thay backend nghiệp vụ bằng dữ liệu giả hoặc dùng UI che lỗi truy vấn.

Các hành trình chủ đạo:

1. Mở ngày làm việc → chọn việc ưu tiên → xem tài liệu/bối cảnh → cập nhật → gửi review → nhận kết quả.
2. Quản lý mở hàng chờ → xem bằng chứng → duyệt/từ chối với lý do → người phụ trách nhận thông báo → mở đúng bản ghi.
3. Nhận lead → follow-up → báo giá → chốt → chuyển khách hàng → bàn giao dự án → xuất hóa đơn → theo dõi thanh toán.
4. PM xem dự án → nhận diện việc chặn/phụ thuộc → giao việc → theo dõi tiến độ thực → nghiệm thu.
5. Kế toán xem khoản đến hạn → mở chứng từ → ghi nhận thanh toán → đối chiếu → giải thích được tổng số.

## 2. Cơ sở đã đối chiếu với code

Đây là rà soát mã nguồn phục vụ lập kế hoạch, chưa phải audit đầy đủ UI đang đăng nhập hay khảo sát người dùng. Các số trong audit tháng 8 là lịch sử; không dùng như baseline mới.

| Phần | Hiện có | Khoảng trống cần xử lý/kiểm chứng |
|---|---|---|
| Shell và tìm kiếm | `components/Shell.jsx`, `lib/workspace-navigation.js`: nhóm điều hướng, tìm kiếm `/api/search`, debounce và hủy request cũ | Đo đường đi theo vai trò; giữ ngữ cảnh khi chuyển trang; cấu trúc mobile hiện có nhóm Realm/Hộp thư cần rà lại ý nghĩa |
| UI dùng chung | `components/system/`: PageHeader, DataTable, ActionQueue, ReceiptBar, StatePanel; Modal dùng Radix | Migrate có chọn lọc; không xây một bộ UI thứ ba. DataTable hiện sort/filter/page ở client; mobile lấy toàn bộ filteredRows |
| Tải dữ liệu | `lib/collection-query.js`: server scope/filter/cursor, tối đa 200 dòng/trang | `useResource` chưa có vòng đời phân trang/error/cancel đầy đủ; caller cũ vẫn đọc toàn danh sách |
| Trang chủ | `/dashboard` khai báo 10 resource chính và 4 resource có điều kiện; thêm insights/approvals | Đo request và payload thực tế; chuyển sang dữ liệu tổng hợp/hàng chờ theo quyền, tránh tải tất cả bản ghi chỉ để tính số |
| Khách hàng | `/clients/[id]` gọi 9 resource, sau đó chọn dữ liệu liên quan | Query theo client và tải theo tab; timeline xuyên lead–dự án–chứng từ có link nguồn |
| Công việc | `/myday`: queue, sắp xếp, thao tác task có version; `lib/task-presentation.js` có hành động kế tiếp | Kiểm chứng xuyên nhiều người, giữ filter/scroll/focus, xử lý conflict và review rõ ràng |
| Chứng từ | `/quotes/[id]`, `/invoices/[id]`, DocEditor có trang riêng và cờ dirty | Không lập lại việc “chuyển hết khỏi modal”; kiểm tra bảo vệ bản nháp qua Back/reload/đổi route, lỗi lưu và sửa đồng thời |
| CRM/Finance | Có command chuyển lead, thanh toán chống trùng, receipt/audit và outbox | Rà caller/UI, dữ liệu lịch sử, đối soát, retry không tạo giao dịch lần hai; không tự sửa công thức kế toán/thuế |
| QA | Có auth E2E với guard database dùng thử; báo cáo nền tảng và các test domain | Kết quả demo Realm không chứng minh ERP đăng nhập; auth E2E/CI hiện tại phải chạy và có evidence mới |

Tham khảo lịch sử: [báo cáo nền tảng F01–F16](REALM-3D-IMPLEMENTATION.md), [UX audit cũ](ux/UX-AUDIT.md). Các mô tả cũ như “chưa có Radix/TanStack”, “search tải tất cả”, “chứng từ chỉ có modal” đã không còn đúng với code đang đọc.

## 3. Kiến trúc trải nghiệm đề xuất

- **Trang chủ/Hôm nay:** hàng việc cần chú ý theo vai trò, một hành động kế tiếp rõ ràng; biểu đồ ở phần tổng quan/báo cáo khi cần phân tích.
- **Công việc:** việc cá nhân, việc đội nhóm, dự án và lịch cùng một Task nguồn. Giữ các góc nhìn khác nhau khi phục vụ nhu cầu khác nhau, thống nhất trạng thái và hành động.
- **CRM:** lead/pipeline, khách hàng, follow-up và chứng từ gắn vào một hồ sơ liên tục.
- **Tài chính:** khoản phải thu/phải trả, chứng từ, giao dịch, ngân sách và báo cáo; phân biệt số dự kiến, đã xuất, đã thu, chi thực tế.
- **Nhân sự/Vận hành:** những việc chuyên môn theo quyền; thu gọn menu không có nghĩa bỏ chức năng.
- **Hộp việc cần xử lý:** một nơi tổng hợp assignment, review, approval và thông báo cần hành động. Đây là danh sách tham chiếu tới nguồn, không phải một cơ sở dữ liệu task/approval mới.
- **Tìm và mở nhanh:** dùng tìm kiếm server hiện có, thêm đường dẫn theo ngữ cảnh; không cho AI tự thực thi lệnh nghiệp vụ nhạy cảm.

Mỗi màn hình chuẩn hóa: tiêu đề + ngữ cảnh → hành động chính → bộ lọc → nội dung → phản hồi. Mỗi bản ghi có người phụ trách, trạng thái, hạn, hoạt động gần nhất và liên kết liên quan khi nghiệp vụ có các trường đó.

Form dài dùng trang riêng; xem nhanh/sửa ít trường dùng drawer; dialog dành cho quyết định ngắn. Giữ đường dẫn trực tiếp và Back hoạt động đúng. Trạng thái tải/lỗi/hết quyền/rỗng/không tìm thấy phải khác nhau. Ngôn ngữ ERP dùng từ nghiệp vụ quen thuộc, Realm không bắt buộc để làm việc.

## 4. Lộ trình thực hiện và điều kiện nghiệm thu

| Chặng | Phạm vi | Đầu ra/điều kiện hoàn thành |
|---|---|---|
| E0 — Baseline và bản đồ hành trình | Inventory mới; 5 hành trình trên; vai trò Staff/PM/Sales/Accountant/Director; xác minh fixture và môi trường | Một bảng lỗi có nguồn/độ nặng; số bước/thời gian/request/payload; danh sách component đang dùng. Không ghi số đo chưa chạy |
| E1 — Độ tin cậy và nền tương tác | Vòng đời query, lỗi/retry/cancel, chống request cũ; giữ trạng thái URL; bảng server-page; hợp đồng kết quả mutation; form không mất công | Mẫu triển khai trên danh sách Lead và một luồng My Work; bài test race/403/500/offline; lỗi lưu không hiện thành công; tổng số không bị cắt theo trang |
| E2 — Trải nghiệm làm việc hằng ngày | Hôm nay theo vai trò; Task detail; review/approval; notification mở đúng nơi; project context | Hai tài khoản hoàn tất giao → làm → review → sửa/duyệt; không mất filter/scroll; trạng thái đồng bộ và xử lý stale version rõ ràng |
| E3 — CRM xuyên suốt | Lead list/pipeline, follow-up, client workspace, quote/contract links và bàn giao project | Một khách từ intake đến bàn giao không nhập lại dữ liệu đã có; nguồn/campaign/owner giữ đúng; chặn trùng có đối chiếu, không đoán ghép lịch sử |
| E4 — Tài chính rõ ràng | Quote/invoice editor, phải thu/phải trả, ghi nhận thu/chi, đối soát và báo cáo | Tổng khớp dữ liệu nguồn theo currency/rate; thao tác lặp/retry không nhân đôi; partial payment/conflict/error có đường xử lý; không gọi số ước tính là đã thu |
| E5 — Nhân sự, vận hành và hoàn thiện toàn app | Áp chuẩn sang attendance/payroll/vendor/assets và các module đang bật; docs/messages; truy cập/bàn phím/mobile | Quyền đúng theo vai trò; form/chứng từ/tables nhất quán; các luồng quan trọng được kiểm thử trên phạm vi đã chốt |
| E6 — Pilot và phát hành | Usability với người dùng thật, hiệu năng theo dữ liệu lớn, auth E2E, CI, restore/rollback và rollout có kiểm soát | Không còn P0/P1 trong phạm vi; KPI đạt trên baseline đã khóa; bằng chứng đúng build; release note và cách quay lại rõ ràng |

E0 trước E1. E1 chỉ xây nền đủ cho các luồng ưu tiên; không dành một đợt lớn để thay toàn bộ component. E2 là ưu tiên sản phẩm trước E3. Chỉ mở rộng mẫu khi luồng đã chạy thật. Nếu phát hiện lỗi dữ liệu/quyền/thanh toán, xử lý trước thay đổi hình thức ở mọi chặng.

## 5. Backlog thực thi ban đầu

Tất cả hạng mục bên dưới là **TODO của kế hoạch mới**, không có nghĩa toàn bộ nền tảng tương ứng chưa tồn tại.

| ID | Ưu tiên | Hạng mục cụ thể | Nghiệm thu chính |
|---|---|---|---|
| W01 | P0 | Làm mới inventory và baseline 5 hành trình | Có route, role, input, expected outcome, evidence và số đo; tách vấn đề xác nhận khỏi giả thuyết |
| W02 | P0 | Sửa vòng đời đọc dữ liệu dùng chung | Hủy/loại response cũ; lỗi mạng/server có retry; quyền thay đổi không để lộ dữ liệu cũ; loading không treo |
| W03 | P0 | Chuẩn hóa kết quả thao tác | Chỉ đóng form/toast thành công khi server xác nhận; pending/retry/conflict có trạng thái; không che thất bại bằng refresh |
| W04 | P0 | Kiểm chứng auth, scope và command hiện có | Tài khoản/tenant/record ngoài quyền bị từ chối; stale version/duplicate payment không làm sai dữ liệu |
| W05 | P1 | Lead list dùng server filter/cursor | Search/sort/filter nhất quán qua trang; stats từ query aggregate cùng scope; export ghi rõ trang hiện tại hoặc toàn bộ kết quả |
| W06 | P1 | Chuẩn bảng và giữ ngữ cảnh | Dùng DataTable hiện có; pagination mobile có giới hạn; URL lưu filter/sort; back khôi phục focus/scroll; preference theo user/company |
| W07 | P1 | Hoàn thiện My Work → task → review | Việc cần làm/hạn/blocker/next action rõ; status dùng chung; reviewer mở đúng bằng chứng và phiên bản |
| W08 | P1 | Hàng chờ xử lý và thông báo | Mỗi mục có lý do, người phụ trách, link nguồn và hành động đúng quyền; dedupe; phân biệt đã đọc với đã xử lý |
| W09 | P1 | Dashboard theo vai trò, query có giới hạn | Staff xem việc, PM xem blocker/review, Sales xem follow-up, Accountant xem đến hạn; không tải toàn bảng để tính KPI |
| W10 | P1 | Client workspace theo tab và liên kết nguồn | Chỉ tải dữ liệu thuộc khách hàng và tab cần xem; deep link nguồn; hoạt động thống nhất không nhân bản bản ghi |
| W11 | P1 | Lead → client → project handoff | Giữ source/owner và receipt; xem lại liên kết trước khi chuyển; retry không tạo client/project trùng |
| W12 | P1 | Bản nháp chứng từ và xung đột chỉnh sửa | Bảo vệ qua đóng/Back/reload/đổi route; ghi rõ đã lưu/chưa lưu; không tự lưu thanh toán hoặc phát hành chứng từ |
| W13 | P1 | Tài chính và báo cáo có thể đối chiếu | Tổng và dòng nguồn cùng bộ lọc/múi giờ/currency; hiển thị thiếu dữ liệu/tỷ giá, không mặc định 0 |
| W14 | P1 | Keyboard/mobile/accessibility | Tab/Enter/Escape, focus, label, lỗi form và trạng thái không chỉ dựa màu; không kéo ngang toàn trang ở 390px |
| W15 | P2 | Migrate module chuyên môn | Attendance/payroll/vendors/assets/settings theo mẫu đã kiểm chứng; không thay công thức hay quyền do redesign |
| W16 | P1 | Regression và pilot trước release | Auth E2E, query benchmark, worker/outbox visibility, backup/restore thử; người dùng thực hoàn thành hành trình |

## 6. Đợt triển khai đầu tiên

Phạm vi: **E0 + W02/W03/W05/W07**, làm nền trên hai khu vực dùng thường xuyên là Lead và My Work. W04 phải chạy cho phần bị thay đổi. Không thay tất cả màn hình cùng lúc.

Thứ tự công việc:

1. Chạy baseline bằng fixture riêng; lập bảng dữ liệu/contract của My Work, Lead, task detail và review. Xác minh caller nào đã được tối ưu.
2. Bổ sung hợp đồng query cho error/retry/cancel/pagination; giữ tương thích caller chưa migrate, không âm thầm áp pageSize cho toàn app.
3. Chuyển Lead list sang server paging; tách campaign/pipeline aggregates và export khỏi số hàng đang tải; dùng allowlist filter/sort ở server.
4. Hoàn thiện một vòng My Work → task detail → gửi review → reviewer quyết định; giữ context khi quay về danh sách, trình bày 409 version conflict có hướng xử lý.
5. Kiểm thử chức năng, build, auth browser hai tài khoản, bàn phím và viewport mobile; chụp trước/sau cùng dữ liệu và ghi kết quả.

Đầu ra review: một demo làm việc liên tục, bảng số bước/thời gian trước–sau, các test đã chạy, ảnh thực tế, backlog còn lại và rollback cho thay đổi đã làm. Sau khi mẫu đạt mới migrate dashboard, khách hàng và tài chính.

## 7. Mục tiêu đo lường đề xuất

Các ngưỡng sau là **mục tiêu**, chưa có số đo hiện tại. E0 khóa thiết bị, mạng, dataset, vai trò và cách tính trước khi đánh giá. Không thay ngưỡng sau test chỉ để ghi đạt.

| Nhóm | Mục tiêu |
|---|---|
| Dễ làm việc | Ít nhất 90% người tham gia hoàn thành hành trình ưu tiên không cần hướng dẫn; tối thiểu 2 người/vai trò trong 5 vai trò khi pilot đủ nhân sự; ghi cả số mẫu nhỏ |
| Số bước/thời gian | Thời gian trung vị của hành trình thường ngày giảm ít nhất 30% so với baseline, không bỏ bước duyệt/quyền cần thiết |
| Phản hồi thao tác | Có pending/validation trong 100 ms ở thiết bị đã khóa; phản hồi tức thời không được giả báo thành công |
| Tải trang | Mục tiêu p75 LCP ≤2,5 s, INP ≤200 ms, CLS ≤0,1 trên profile đã ghi; cold/warm đo riêng |
| Dữ liệu | List page size mặc định 25–50, trần theo API hiện có; benchmark riêng với dataset thử 10.000 task, 5.000 lead, 2.000 invoice, phân bố nhiều scope; điều chỉnh kích thước ở E0 theo tải thực tế |
| API | Mục tiêu p95 query danh sách ≤500 ms ở warm staging với 20 phiên hoạt động trên workload đã định; báo riêng aggregate, export và cold start |
| Đúng nghiệp vụ | Không leak scope; không nhân đôi command khi retry; không mất bản nháp trong các đường thoát đã kiểm thử; totals khớp nguồn |
| Phát hành | Không còn P0/P1; full required CI + auth E2E đạt trên build ứng viên; không lấy số test Realm demo làm bằng chứng thay thế |

## 8. Quy tắc kỹ thuật và rollout

- Dùng lại Next.js/Prisma, canonical APIs, execution commands, RBAC, audit, receipts, outbox, Radix và TanStack hiện có; chỉ thêm dependency sau khi xác định khoảng trống cụ thể.
- Cache và saved preferences phải có identity/company/scope phù hợp, được xóa/vô hiệu khi đổi tài khoản/quyền. Query cũ không được ghi đè context mới.
- Count/KPI/export phải có contract rõ: toàn bộ bộ lọc hay trang hiện tại. Không đưa client pagination vào báo cáo rồi gọi tổng đó là toàn công ty.
- Hàng chờ làm việc tổng hợp read model có tham chiếu nguồn, freshness và dedupe; mutation vẫn đi đúng command gốc.
- Bản nháp nhạy cảm ưu tiên lưu theo user/tenant ở server khi cần độ bền. Nếu lưu cục bộ, phải có scope, expiry và xử lý logout; không tự chọn localStorage cho mọi chứng từ.
- Tự động lưu bản nháp không đồng nghĩa tự duyệt, gửi email, phát hành hóa đơn hay thanh toán. Những hành động đó giữ semantics và thao tác chủ động hiện có.
- Thay đổi schema dùng migration kiểm thử; backfill có đối soát. Không suy đoán liên kết lịch sử bằng tên và không thay công thức thuế/kế toán trong một đợt UX.
- Migrate từng route/role bằng cơ chế rollout sẵn có hoặc flag nhỏ khi cần; giữ route cũ có thể quay lại. Đo lỗi trước/sau, kiểm thử rollback và tương thích schema.
- Demo, staging, production và bằng chứng của từng môi trường được phân biệt rõ. Dùng database thử riêng cho auth E2E; không sử dụng production để tạo fixture.

## 9. Ngoài ưu tiên hiện tại và cách cập nhật

Tạm gác: Realm 3D/AAA, engine Unreal, nhân vật/asset mới, gamification mới, kế hoạch định giá/bán sản phẩm và mở rộng AI tự hành. Tích hợp LeozOps chỉ xử lý khi ảnh hưởng trực tiếp luồng review/approval đang tối ưu; chưa mở một roadmap AI riêng.

Mỗi đợt cập nhật Wxx thành TODO / IN_PROGRESS / VERIFIED / BLOCKED, ghi file, build, test, evidence và giới hạn. VERIFIED chỉ áp dụng vào phạm vi đã kiểm chứng. Ước lượng lịch giao được lập sau E0 dựa trên độ phức tạp thực và nhân sự; kế hoạch này không hứa lịch dựa vào số màn hình.

Người dùng đã yêu cầu triển khai sau khi kế hoạch được lưu. Phạm vi được phép hiện tại bao gồm sửa và kiểm thử ERP/CRM; Realm world vẫn tạm dừng. Chưa triển khai production.

## 10. Tiến độ đợt nền đầu tiên

| Hạng mục | Trạng thái | Đã làm / phần còn lại |
|---|---|---|
| W01 | IN_PROGRESS | Inventory tĩnh mới không có parse error; chưa đo 5 hành trình với tài khoản/người dùng thật |
| W02 | VERIFIED trong phạm vi client dùng chung | Latest request, cancel/dispose, clear theo resource/filter/session, lỗi/retry; browser React StrictMode và các tình huống lỗi đã kiểm chứng. Các màn hình chưa dùng UI lỗi mới vẫn cần migrate |
| W03 | IN_PROGRESS | Đã mở rộng sang quote/invoice/ticket: lỗi/null không đóng form hoặc báo thành công; pending khóa thao tác; caller các module còn lại cần rà tiếp |
| W04 | IN_PROGRESS | Regression domain/permission và database thử; chưa thay bằng auth browser E2E hoặc nghiệm thu tenant thật |
| W05 | IN_PROGRESS — chức năng đã kiểm chứng | Kanban 25 Lead/cột, cursor scope-bound; aggregate toàn scope và trang đọc trong RepeatableRead; deep link ngoài trang; CSV đầy đủ khi yêu cầu. PostgreSQL và component browser đã kiểm chứng. Còn benchmark dữ liệu lớn, giảm số query, campaign aggregate cardinality và streaming export |
| W06 | IN_PROGRESS | DataTable mobile chỉ render trang hiện tại, export giữ toàn bộ tập lọc đã tải; saved views/URL và server-table mode còn lại |
| W07 | IN_PROGRESS | My Work khóa thao tác đồng thời, hiển thị pending riêng, xử lý 409 bằng tải bản mới không replay; chưa nghiệm thu vòng reviewer hai tài khoản |
| W08–W09 | TODO | Hộp việc cần xử lý và dashboard theo vai trò chưa triển khai trong đợt này |
| W10 | IN_PROGRESS | Cả chín resource trong hồ sơ client lọc đúng client ở server; KPI thiếu dữ liệu không hiện 0. Chưa làm lazy tabs/timeline thống nhất |
| W11 | TODO | Giữ command chuyển Lead đã có; chưa mở rộng bàn giao project trong kế hoạch mới |
| W12 | IN_PROGRESS | FormModal giữ dữ liệu khi lỗi, xác nhận bỏ thay đổi, cảnh báo reload và khóa nhập khi đang gửi; chưa có bản nháp bền vững hay chặn mọi route transition |
| W13 | TODO | Chưa đổi báo cáo/công thức tài chính; kiểm thử regression không thay thế đối soát nghiệp vụ |
| W14 | IN_PROGRESS | Label/id của FormModal, retry và điều khiển phân trang có ngữ nghĩa; lookup chậm không làm mất owner/region/serviceLine đang lưu. Chưa nghiệm thu accessibility toàn app |
| W15 | TODO | Chưa migrate các module chuyên môn còn lại |
| W16 | IN_PROGRESS | Build/unit/component browser và database thử được ghi trong báo cáo; pilot, auth E2E và production rollout còn lại |

Bước tiếp theo: đo W05 trên dataset lớn và tối ưu aggregate/export; hoàn tất W07 với tài khoản thử và dữ liệu canonical. Tiếp tục kiểm chứng read/write từng route theo [kế hoạch song song](PARALLEL-PRODUCT-DEVELOPMENT.md). Các bằng chứng cũ chỉ áp dụng build/phạm vi đã ghi; đợt mới có báo cáo riêng.
