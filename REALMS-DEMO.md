# CRMegoric Realms — isolated demo entity

Đây là vertical slice độc lập cho ý tưởng **văn phòng ảo medieval tự xây**, đặt trên codebase CRMegoric hiện tại. Demo không tích hợp Gather, không dùng asset/code của Gather và không kết nối database production.

## Chạy demo

```powershell
npm ci
npm run build

# Terminal 1 — Next.js demo/token issuer
$env:REALM_SIGNAL_SECRET='replace-with-at-least-24-random-characters'
$env:REALM_DEMO_ALLOW_GUESTS='1'
npm start

# Terminal 2 — self-hosted signaling gateway
$env:REALM_SIGNAL_SECRET='replace-with-the-same-secret-as-terminal-1'
npm run realm:signal
```

Mở `http://localhost:3300` hoặc `http://localhost:3300/realm-demo`.

## Có gì trong vertical slice

- Canvas map 2D với camera, collision, WASD/phím mũi tên, click-to-move và D-pad cảm ứng.
- Sáu phòng nghiệp vụ: Guild Hall, War Room, Royal Treasury, Tavern, Great Hall và Arcane Forge.
- Object trên map mở thẳng Quest, dự án, nhân sự, Gold ledger, chat và shop.
- Spatial presence theo bán kính 5 ô; private zone kết nối toàn bộ người trong cùng phòng.
- Player identity tùy chỉnh (tên, class, màu huy hiệu) được lưu local và phát cùng presence.
- Presence/chat/signaling dùng protocol v2 và hook transport riêng; ưu tiên WebSocket gateway đa máy, tự fallback về `BroadcastChannel` khi gateway chưa cấu hình.
- Quick emote dùng allowlist (`HI`, `GG`, `TY`, `?`) và được vẽ trực tiếp trên avatar trong 2,6 giây.
- Tile/roster đồng đội mở thẻ tương tác: xem phòng, khoảng cách, tự đi tới vị trí hiện tại và vẫy chào có định tuyến.
- Whisper là message riêng có `targetId`; chỉ socket đích trong cùng Realm/map nhận được, hai phía đều có nhãn riêng trong Lantern Chat.
- Party Room tối đa 6 người có luồng mời/chấp nhận/từ chối/thu hồi, roster đồng bộ, quyền host, kick, rời room và xác nhận trước khi kết thúc.
- Gateway là nguồn sự thật cho room/member/invite; client không thể tự nhận vai host hoặc tự sửa roster. Host mất kết nối quá grace period sẽ được chuyển cho thành viên vào sớm nhất.
- Thành viên Party giữ WebRTC mesh khi đi ra ngoài bán kính spatial 5 ô; đồng đội không thuộc Party vẫn tuân theo spatial/private-zone như cũ.
- Party Room hỗ trợ LiveKit SFU tùy chọn: gateway cấp và tự xoay vòng JWT ngắn hạn, khóa đúng room và identity cho từng thành viên. Nếu SFU không được cấu hình hoặc mất kết nối, client tự dùng P2P mesh và thử nối lại sau 15 giây.
- Camera, microphone và screen share dùng media API thật của trình duyệt.
- WebRTC peer-to-peer tự bắt tay khi hai player thật đi vào bán kính 5 ô hoặc cùng private zone; rời vùng sẽ đóng peer.
- Gateway chia phòng theo `realmId:mapId`, xác thực token HMAC 5 phút, giới hạn payload/rate/room và heartbeat để loại kết nối chết.
- ICE server được cấp cùng token; hỗ trợ cấu hình STUN/TURN bằng environment mà không lộ credential trong client bundle.
- Quest/Gold/Shop mặc định tương tác bằng state demo; Gold ledger thể hiện luồng append-only. Adapter ERP thật chỉ hoạt động khi bật đồng thời hai feature flag.
- Hai lớp UX dùng chung một domain state: Realm nhập vai và ERP · CRM dễ đọc/kiểm toán. Cập nhật tiến độ hoặc nhận Gold ở một phía được phản ánh ngay ở phía còn lại.
- Hồ sơ ERP hiển thị cùng player profile, class, level, Renown, Gold, trạng thái hiện diện, số Quest hoàn tất và chuỗi hoạt động.
- ERP · CRM dùng theme medieval editorial không pixel: parchment, xanh rừng, đồng cổ và serif ở tiêu đề; bảng, form, số liệu vẫn theo chuẩn dashboard nghiệp vụ.
- Responsive từ desktop đến mobile, touch target tối thiểu 44px và hỗ trợ reduced motion.

## Kết nối dữ liệu ERP/CRM ↔ Realm

Demo dùng `realm-operations` làm nguồn dữ liệu chung cho cả hai presentation:

| ERP / CRM | Realm | Quy tắc demo |
| --- | --- | --- |
| Task, Lead, Project milestone | Quest | Cùng ID nghiệp vụ, tiến độ, deadline và người duyệt |
| Reward journal | Gold ledger | Chỉ cộng Gold khi Quest đủ điều kiện và được ghi nhận |
| Performance points | Renown / Level | Nhận Quest reward làm tăng Renown và có thể tăng Level |
| Employee availability | Player status | Sẵn sàng, bận, tập trung và không làm phiền dùng chung state |
| Staff profile | Character dossier | Tên, class, màu huy hiệu và thành tích là cùng một identity |

Mặc định state được persist trong browser demo để test reload và chưa ghi vào database CRMegoric. Phase 10 đã có adapter tùy chọn để đọc Task/hồ sơ nhân sự và ghi reward journal qua API đã xác thực; khi adapter không được bật hoặc không kết nối được, client hiện rõ `Local fallback · không ghi DB`.

### Adapter ERP thật (khóa mặc định)

Hai cờ sau phải được bật **đồng thời** và app phải được build lại vì cờ `NEXT_PUBLIC_*` được đóng vào client bundle:

```dotenv
# Server: cho phép route Realm truy cập Prisma sau khi session/RBAC hợp lệ
REALM_ERP_SYNC_ENABLED=1

# Client: yêu cầu dùng ERP snapshot thay cho localStorage demo
NEXT_PUBLIC_REALM_ERP_SYNC=1
```

Không bật các cờ này trước khi schema additive bên dưới đã được review và triển khai trên development/staging. Route `/api/realm-demo/operations` trả `503 realm_erp_sync_disabled` trước khi chạm Prisma nếu server flag đang tắt.

Luồng an toàn hiện tại:

1. API yêu cầu session ERP hiện hữu và chặn tài khoản freelancer.
2. Người chơi chỉ đọc/claim Task được giao cho chính mình.
3. Task phải ở trạng thái `done`; reward phải active, có Gold dương và đã được quản lý duyệt.
4. Claim chạy trong transaction `Serializable`, có idempotency key và unique constraint theo nguồn Task để không mint Gold hai lần.
5. Mỗi claim tạo đồng thời Gold journal, `TaskEvent` và `AuditLog`; số dư được cộng từ journal append-only, không có cột balance để sửa trực tiếp.
6. Profile chỉ cho đổi Realm class trong allowlist và màu huy hiệu; tên vẫn lấy từ hồ sơ nhân sự ERP.
7. Tavern là đường đổi thưởng ERP duy nhất: cosmetic trừ Gold một lần; quyền lợi thật giữ Gold và tạo approval maker/checker trước khi kết chuyển. Royal Treasury chỉ là ví và sổ Gold.

### Phase 11 — Reward Control Center

Trong `ERP · CRM → Hội đồng Gold`, quản lý có một approval queue riêng theo mô hình maker/checker:

| Vai trò | Xem | Cấu hình draft | Phê duyệt / trả lại | Quản lý budget |
| --- | --- | --- | --- | --- |
| Director | Có | Có | Có, nhưng không tự duyệt draft của mình | Có |
| PM | Có | Có | Không | Không |
| Lead | Có | Chỉ Task của team mình | Không | Không |
| HR | Có | Không | Có | Không |
| Staff / Freelancer | Không | Không | Không | Không |

Workflow là `draft → pending → approved` hoặc `pending → rejected → draft`. Mỗi lần thay đổi tăng `version` để phát hiện ghi đè đồng thời, đồng thời tạo `TaskEvent` và `AuditLog`. Reward đã phát hành vào Gold journal sẽ bị khóa cấu hình.

Policy mặc định trước khi có budget tháng được duyệt:

- 140 Gold cho toàn công ty mỗi tháng.
- 45 Gold tối đa cho một nhân sự mỗi tháng.
- 20 Gold và 500 Renown tối đa cho một Quest.
- Pending chỉ để dự báo; chỉ Gold đã phát hành và approved commitment chiếm budget.
- Budget được kiểm tra lại bên trong transaction `Serializable` khi approve, không tin số hiển thị từ client.

Ở local demo, Control Center chạy governance sandbox trong browser và phản ánh reward đã duyệt về Quest cùng session. Khi ERP sync thật được bật, component chuyển sang `/api/realm-demo/rewards`; STAFF/freelancer bị chặn ở server trước khi query dữ liệu.

Schema Realm thêm bốn model và quan hệ, không sửa semantics của bảng hiện hữu:

| Model | Vai trò |
| --- | --- |
| `RealmProfile` | Class, màu huy hiệu và streak gắn 1:1 với `User` |
| `RealmQuestConfig` | Reward Gold/Renown, maker/checker, status và version gắn 1:1 với `Task` |
| `RealmRewardBudget` | Trần Gold tháng, per-user cap, note/version và maker/checker |
| `RealmGoldEntry` | Journal append-only, idempotent, dùng để tính wallet/Renown |

Phase 12 đã tạo migration additive, rollback rehearsal và staging gate có checksum/target guard. Migration đã được baseline, deploy và verify trên Neon staging cô lập; ERP production vẫn chưa nhận migration nào. Staging mới dùng full Prisma baseline + migration chain, tuyệt đối không dùng `prisma db push` trực tiếp lên production.

### Phase 12 — Staging migration gate

Deployment package gồm:

- Forward migration chỉ tạo `RealmProfile`, `RealmQuestConfig`, `RealmRewardBudget`, `RealmGoldEntry`; không sửa `User`, `Task` hay dữ liệu ERP hiện hữu.
- Rollback SQL chỉ gỡ bốn bảng Realm và receipt migration tương ứng; đây là thao tác data-loss nên có confirmation token riêng.
- Manifest SHA-256 khóa forward/rollback SQL để review artifact chính xác.
- CLI mặc định dry-run, dùng `REALM_STAGING_DATABASE_URL` riêng và không fallback sang database URL của app.
- Target guard từ chối production marker, schema `public`, schema mismatch và thao tác ghi thiếu approval token.
- Verification đọc catalog PostgreSQL để kiểm tra đủ bảng, index, foreign key và check constraint sau apply.

Các lệnh an toàn:

```powershell
npm run realm:staging:plan
npm run realm:staging:apply             # dry-run, không kết nối ghi
npm run realm:staging:apply -- --commit # chỉ sau khi target + approval đã được set
npm run realm:staging:verify
npm run realm:staging:rollback          # dry-run
```

Quy trình đầy đủ, biến môi trường và exit criteria nằm trong `REALM-STAGING-RUNBOOK.md`.

### Phase 13 — Monthly Budget Council

`ERP · CRM → Hội đồng Gold → Sắc lệnh ngân khố` quản lý lifecycle budget theo kỳ hiện tại:

- Director tạo/chỉnh draft, ghi rõ trần toàn công ty, trần mỗi nhân sự và lý do.
- Draft đi qua `draft → pending → approved` hoặc `pending → rejected → draft`.
- Chỉ một Director khác maker mới được phê duyệt hoặc trả lại; self-approval bị chặn ở server.
- Mỗi transition tăng `version` và ghi `AuditLog`; request stale nhận conflict thay vì ghi đè.
- Draft/pending/rejected chưa thay đổi policy đang hiệu lực. Khi được duyệt, cap mới mới thay policy mặc định.
- Checker không thể duyệt cap thấp hơn Gold đã phát hành + approved commitment, cả ở mức công ty và từng nhân sự.
- Budget đã duyệt được khóa cho kỳ đó như một chứng từ quản trị; muốn đổi policy phải mở kỳ tiếp theo thay vì sửa lịch sử.

Local demo có sẵn một budget pending để thử checker flow mà không ghi database. ERP API dùng cùng route `/api/realm-demo/rewards` và vẫn bị khóa bởi hai feature flag.

### Phase 14 — Gold Economy Observatory

`ERP · CRM → Đài quan sát Gold` bổ sung lớp quan sát kinh tế trên cùng Gold journal append-only và Reward Control Center, không tạo một nguồn dữ liệu song song:

- Bốn chỉ số tách biệt Gold đã phát hành, Gold đã tiêu, burn-rate/ngày và forecast cuối kỳ; approved commitment chiếm budget còn pending chỉ hiện như dự báo.
- Forecast dùng nhịp phát hành theo số ngày UTC đã trôi qua trong tháng và luôn hiển thị công thức đầu vào. Đây là tín hiệu planning, không phải cam kết tài chính.
- Biểu đồ theo ngày có legend, nhãn đơn vị và bảng dữ liệu thay thế cho screen reader.
- Ledger explorer lọc theo tên/mã nguồn, loại bút toán và chiều Gold; kết quả đang xem có thể xuất CSV để đối chiếu.
- Phân bổ theo thành viên và team hiển thị issued/committed/concentration nhưng không biến Gold thành bảng chấm công hoặc leaderboard đánh giá con người.
- Anomaly rules hiện gồm forecast vượt cap, nghĩa vụ cá nhân vượt policy, tập trung Gold cao, cụm phát hành dày trong 24 giờ và adjustment thủ công lớn. Mỗi tín hiệu có evidence + review recommendation và `advisoryOnly=true`; không có action tự động trừ Gold, kỷ luật hay xếp hạng hiệu suất.

Phạm vi đọc được chặn ở server trước khi query:

| Vai trò | Phạm vi Observatory |
| --- | --- |
| Director / HR / PM | Toàn công ty |
| Lead | Chỉ journal và commitment của `teamId` của mình |
| Staff / Freelancer | Không được truy cập |

API đọc riêng là `GET /api/realm-demo/economy`. Route kiểm tra `REALM_ERP_SYNC_ENABLED=1` trước khi auth/Prisma và chỉ trả dữ liệu sau khi session + RBAC hợp lệ. Phase 14 không thêm model, không có migration và không ghi database; local mode dùng fixture xác định để demo đầy đủ chart, filter và cảnh báo.

### Phase 15 — Royal Treasury Exchange (nền tảng kỹ thuật)

`ERP · CRM → Tavern` dùng chung wallet và Gold journal với nhân vật trong Realm. Arcane Forge chỉ còn là cửa sổ khám phá catalog; mọi quyền lợi thật được chuyển về Tavern thay vì trừ Gold trực tiếp trong game. Tên module/API nội bộ vẫn là `treasury` để giữ tương thích, còn tên sản phẩm người dùng thấy là **Tavern**.

Catalog có hai fulfillment path:

| Loại | Khi gửi | Khi duyệt | Khi trao | Khi từ chối |
| --- | --- | --- | --- | --- |
| Cosmetic | Append `shop_spend`, mở khóa một lần | Không cần checker | Tự động trong Realm | Không áp dụng |
| Quyền lợi thật | Append `redemption_hold`, tạo `Approval` hiện hữu | Append `redemption_release` + `shop_spend` | Tavern Keeper append `redemption_fulfillment` amount `0` | Append `redemption_release` để hoàn Gold |

Các nguyên tắc kiểm soát:

- Wallet luôn được tính từ toàn bộ journal bằng aggregate; lịch sử hiển thị không làm sai số dư.
- Request chạy trong transaction `Serializable`, dùng idempotency key và kiểm tra lại số dư ở server.
- Yêu cầu quyền lợi dùng approval inbox sẵn có, HR/Director làm checker; maker bị chặn tự duyệt.
- Hold/release không bị Observatory tính nhầm thành Gold phát hành hoặc Gold tiêu. `reserved` được hiển thị riêng.
- Settlement và refund có idempotency key xác định theo approval, nên retry không tạo bút toán kép.
- Gold không đổi thành lương, tiền mặt hoặc ngày phép luật định; catalog quyền lợi chỉ là đề nghị fulfillment theo policy công ty.

API là `GET/POST /api/realm-demo/treasury`. Route trả `503` trước auth/Prisma khi `REALM_ERP_SYNC_ENABLED` đang tắt, yêu cầu session nội bộ và chặn freelancer. Phase 15 tái sử dụng model `Approval` và `RealmGoldEntry` của codebase hiện tại, không thêm schema/migration và chưa ghi database nào.

### Phase 16 — Tavern fulfillment

Hệ thống đổi thưởng được đặt tên sản phẩm là **Tavern**. Khu chat xã hội được gọi là **Lantern Chat**, còn **Royal Treasury** tiếp tục là màn hình ví và sổ Gold để ba khái niệm không lẫn nhau.

Hành trình quyền lợi thật là `awaiting_approval → ready → fulfilled`; nhánh từ chối thành `refunded`. Sau khi checker duyệt, HR phụ trách quyền lợi hoặc Director nhìn thấy đơn ở **Bàn Tavern Keeper**. Chỉ người có vai trò Keeper phù hợp và không phải requester mới xác nhận đã trao. Hành động này:

- Không cộng/trừ Gold lần nữa; receipt `redemption_fulfillment` có amount `0`.
- Gắn receipt vào `Approval` bằng `sourceType=approval` và `sourceId=approval.id`.
- Dùng idempotency key xác định `realm-redemption:fulfillment:<approvalId>` để retry không tạo receipt kép.
- Tạo `AuditLog` action `realm_tavern_delivery` và gửi notification cho requester khi trao lần đầu.
- Giữ lifecycle phê duyệt và lifecycle fulfillment tách biệt: `approved` không đồng nghĩa vật phẩm ngoài đời đã được trao.

Local sandbox có trọn luồng đổi → duyệt → xác nhận đã trao để demo mà không ghi database. Phase 16 tiếp tục tái sử dụng `Approval` và `RealmGoldEntry`, không thêm schema/migration và không bật feature flag mặc định.

### Phase 17 — Adventurer Inventory & Loadout

Cosmetic mở khóa tại Tavern nay đi vào **Tủ đồ Adventurer** thay vì dừng ở trạng thái “đã sở hữu”. Ba slot đầu tiên là `title`, `seal` và `banner`. Người chơi trang bị trong Tavern; cùng loadout xuất hiện trong Character Dossier của ERP, nameplate trong Realm và profile presence của người chơi khác.

Loadout không tạo cột profile mới. Mỗi lần trang bị append một `RealmGoldEntry` loại `loadout_equip`, amount và renown đều bằng `0`, `sourceType=loadout`, còn `sourceId` chứa slot + item + nonce an toàn. API chỉ chấp nhận cosmetic đã có bút toán `shop_spend/sourceType=shop` của chính user. Mỗi request có idempotency key, chạy transaction `Serializable` và tạo `AuditLog` action `realm_loadout_equip`. Trạng thái hiện tại luôn được suy ra từ event hợp lệ mới nhất của từng slot; event giả mạo hoặc vật phẩm chưa sở hữu bị bỏ qua.

Local sandbox lưu ownership trong Gold journal cục bộ và lưu loadout đã chuẩn hóa cùng profile; tải lại vẫn dựng được Tủ đồ và Character Dossier. ERP live lấy inventory, loadout, wallet và journal từ cùng snapshot. Phase 17 không thêm schema/migration, không bật feature flag mặc định và không đụng database production.

### Phase 18 — Guild Hall: Team & Campaign Bridge

**Guild Hall** thay roster mô phỏng đơn giản bằng một dashboard đội nhóm dùng chung cho Realm và góc nhìn ERP. Sổ bộ kết nối `Team → User → Task → Project` hiện hữu để hiển thị thành viên trong phạm vi Guild, số Quest đang mở, Quest đủ điều kiện nhận thưởng, campaign pulse và tiến độ tiêu chí. Trong Realm, trạng thái presence realtime chỉ phủ tạm lên snapshot để hỗ trợ phối hợp; nó không được ghi vào ERP và không được dùng để suy diễn năng suất.

Endpoint đọc riêng là `GET /api/realm-demo/guild`. API kiểm tra feature flag trước auth/Prisma, chặn freelancer và áp dụng scope tối thiểu: user có `teamId` chỉ đọc team của mình, user không có team chỉ đọc chính mình thay vì tự mở rộng ra toàn công ty. Project được suy ra từ Task đã gán cho member trong scope; bút toán `quest_reward` chỉ dùng để phân biệt Quest đã nhận thưởng, không đưa Gold cá nhân vào roster.

Cả bản Realm compact và tab `ERP · CRM → Guild Hall` dùng cùng component, có loading/error/retry, progressbar semantic, touch target tối thiểu 44px và layout mobile không cuộn ngang. Dashboard cố ý read-only, không có leaderboard, không xếp hạng Gold, không ghi database và không thêm schema/migration. Feature flag mặc định vẫn tắt.

### Phase 19 — War Room: Campaign Operations Bridge

Mỗi campaign trong Guild Hall nay mở được một **War Room** dùng chung giữa Realm và góc nhìn `ERP · CRM`. Màn hình ghép `Project → Phase → Milestone → Task` thành bản đồ vận hành: tiến độ chiến dịch, Quest theo phase, dependency blocker, việc quá hạn, milestone và cổng trạng thái thưởng. Cổng thưởng chỉ cho biết Task đã duyệt/chờ ghi nhận/đã ghi nhận; không hiển thị số Gold cá nhân và không tạo bảng xếp hạng.

Endpoint chỉ đọc là `GET /api/realm-demo/war-room?projectId=<id>`. API kiểm tra feature flag trước auth/Prisma, chặn freelancer, xác thực định dạng ID và chỉ tìm Task có `projectId` được yêu cầu **đồng thời** thuộc member trong scope Guild của session. Project không tồn tại và Project không có Task trong scope cùng trả `404 campaign_not_found`, tránh làm lộ ID chiến dịch ngoài quyền. User có team chỉ thấy team của mình; user không có team chỉ thấy Task của chính họ.

Realm dùng đường đi `Guild → Campaign → War Room`; ERP dùng `ERP · CRM → Guild Hall → Campaign → War Room` mà không thêm tab điều hành cấp cao mới. Cả hai dùng cùng component responsive, có loading/error/retry, progressbar semantic, trạng thái viết bằng chữ bên cạnh màu, focus ring và touch target tối thiểu 44px. Phase 19 chỉ đọc dữ liệu hiện hữu, không ghi DB, không thêm schema/migration và giữ feature flag mặc định tắt.

### Phase 20 — Royal Embassy: CRM Pipeline Bridge

**Royal Embassy** đưa phần CRM thật vào Realm bằng một nhánh cấp hai từ Guild Hall, thay vì nhồi thêm tab cấp cao vào `ERP · CRM`. Embassy biến sáu stage Lead hiện hữu thành hành trình medieval có đối chiếu nghiệp vụ rõ ràng: `new/Tân thư`, `contacted/Đã tiếp kiến`, `proposal/Gửi chiếu thư`, `negotiation/Nghị sự`, `won/Kết minh ước`, `lost/Khép hồ sơ`. Mỗi thẻ vẫn giữ công ty, người liên hệ, nguồn, giá trị, owner và ngày dự kiến chốt; forecast trọng số dùng xác suất stage chuẩn và được ghi rõ là forecast, không phải doanh thu thật.

Endpoint chỉ đọc là `GET /api/realm-demo/embassy`. API kiểm tra feature flag trước auth/Prisma, chặn freelancer và bám đúng quyền CRM hiện hữu: Director có company scope; AM chỉ đọc Lead của chính mình hoặc Lead chưa gán; STAFF/PM/Lead không có vai trò AM bị chặn trước database query. Sổ đối tác chỉ trả tên Client, ngành và nhịp Project; response cố ý không lấy email, điện thoại, địa chỉ hoặc ghi chú.

Cả `Realm → Guild → Royal Embassy` và `ERP · CRM → Guild Hall → Royal Embassy` dùng chung component có loading/error/retry, back path, progressbar semantic, trạng thái quá ngày bằng icon + chữ, touch target tối thiểu 44px, reduced-motion và layout 375px không cuộn ngang. Dashboard read-only, không xếp hạng Account theo giá trị pipeline, không ghi DB, không thêm schema/migration và giữ feature flag mặc định tắt.

## Ranh giới của demo

### Release track Phase 15 — Four-eyes Launch Approval

Sau Controlled Launch dry-run, mọi policy được phân loại là **expansion** phải qua hai Director khác nhau: maker gửi proposal và checker duyệt. Proposal tái sử dụng model `Approval`, được mã hóa AES-256-GCM, khóa theo policy version + digest và hết hạn sau 24 giờ. Khi duyệt, server tái kiểm tra live readiness rồi claim approval, cập nhật `Setting.realmPilot` và ghi audit trong cùng transaction `Serializable`.

Restriction và kill switch vẫn đi đường nhanh để giảm blast radius. UI/API chỉ trả số liệu tác động tổng hợp; không trả roster hoặc dữ liệu hiệu suất. Phase này không thêm schema/migration, không tự bật pilot và không thay ERP/CRM đang vận hành. Runbook nằm tại `docs/realms/PHASE-15-FOUR-EYES-LAUNCH-APPROVAL.md`.

- Khi hai cờ ERP sync không bật, dữ liệu Quest, Gold, nhân sự và dự án vẫn là mock/local state và không gọi API CRMegoric.
- Gateway hiện là single-node/in-memory; production nhiều instance cần Redis pub/sub hoặc sticky routing để đồng bộ room.
- Không cấu hình LiveKit thì Party dùng mesh P2P; không cấu hình STUN/TURN thì mesh chỉ đáng tin cậy trong cùng máy/LAN.
- Guest token chỉ được bật khi `REALM_DEMO_ALLOW_GUESTS=1`; production bỏ biến này để token issuer yêu cầu session CRM hiện hữu.
- Không có persistent avatar position, map editor, moderation hoặc recording.
- Emote, chat và whisper đang là realtime ephemeral; tải lại trang sẽ không có lịch sử hội thoại.
- Party state hiện nằm trong memory của một gateway node; restart gateway sẽ mất room. Nhiều gateway cần Redis/shared room store và pub/sub.
- Demo local có script cài/chạy LiveKit chính thức ngoài repo; recording, moderation, egress và autoscaling SFU vẫn ngoài scope phase này.

## Cấu hình gateway/ICE

```dotenv
REALM_SIGNAL_SECRET=<random-secret-at-least-24-characters>
REALM_SIGNAL_HOST=0.0.0.0
REALM_SIGNAL_PORT=3301
REALM_ID=egoric-company
REALM_MAP_IDS=castle
REALM_ALLOWED_ORIGINS=https://erp.example.com
REALM_MAX_ROOM_SIZE=50
REALM_MAX_PARTY_SIZE=6
REALM_PARTY_RECONNECT_GRACE_MS=12000
NEXT_PUBLIC_REALM_SIGNAL_URL=wss://realm.example.com/realm

# Tùy chọn — bật LiveKit SFU cho Party Room; chỉ gateway được thấy API secret
REALM_SFU_PROVIDER=livekit
REALM_SFU_URL=wss://media.example.com
REALM_SFU_API_KEY=<livekit-api-key>
REALM_SFU_API_SECRET=<livekit-api-secret>
REALM_SFU_TOKEN_TTL_SECONDS=300
# Tùy chọn khi health endpoint không nằm ở root URL suy ra từ REALM_SFU_URL
REALM_SFU_HEALTH_URL=https://media.example.com/

# Tùy chọn; credential chỉ được trả bởi token endpoint sau xác thực
REALM_STUN_URLS=stun:stun.example.com:3478
REALM_TURN_URL=turns:turn.example.com:5349
REALM_TURN_USERNAME=<short-lived-or-rotated-user>
REALM_TURN_CREDENTIAL=<secret>
```

Ở localhost, client tự thử `ws://localhost:3301/realm`; nếu gateway/token issuer không sẵn sàng, UI chuyển sang `Local fallback` và demo vẫn dùng được.

### Chạy LiveKit local để test SFU

LiveKit server không nằm trong repo. Trên Windows, script sau tải binary chính thức `v1.13.3`, đối chiếu SHA-256 từ GitHub Releases rồi cài vào `%LOCALAPPDATA%\CRMegoric\RealmRuntime\LiveKit` để không làm bẩn source tree:

```powershell
# Terminal 1 — cài một lần, sau đó chạy media server local ở foreground
npm run realm:media:install
npm run realm:media:start
```

Mở terminal thứ hai và chạy gateway với cùng cấu hình development mặc định của LiveKit:

```powershell
$env:REALM_SIGNAL_SECRET='replace-with-the-same-secret-as-next-app'
$env:REALM_SFU_PROVIDER='livekit'
$env:REALM_SFU_URL='ws://127.0.0.1:7880'
$env:REALM_SFU_API_KEY='devkey'
$env:REALM_SFU_API_SECRET='secret'
npm run realm:signal

# Có thể chạy ở terminal khác để kiểm tra đồng thời LiveKit và gateway
npm run realm:media:doctor
```

Gateway công khai trạng thái rút gọn tại `http://127.0.0.1:3301/health`: `mediaTopology` cho biết đang dùng SFU hay mesh, còn `mediaServer.status` là `up`, `down` hoặc `disabled`. Endpoint này không trả URL, API key hoặc secret.

LiveKit trên Windows có thể ghi cảnh báo không hỗ trợ CPU monitoring/capacity management; điều này không chặn demo local nhưng là một lý do không dùng Windows development binary làm production node. `devkey/secret` cũng chỉ dành cho máy local. Production phải dùng Linux/VM hoặc deployment được LiveKit hỗ trợ, domain TLS (`wss://`), secret riêng, UDP/TURN/firewall phù hợp và tuyệt đối không đặt API secret trong biến `NEXT_PUBLIC_*`.

Tài liệu chính thức: [chạy LiveKit local](https://docs.livekit.io/transport/self-hosting/local/), [triển khai production](https://docs.livekit.io/transport/self-hosting/deployment/) và [GitHub Releases](https://github.com/livekit/livekit/releases).

## Đường nâng cấp production

1. Gắn avatar với `User` và map room với company/schema hiện hữu.
2. Đưa gateway lên hạ tầng riêng, thêm Redis adapter, metrics và rolling deploy.
3. Đưa LiveKit lên hạ tầng riêng, thêm TURN/TLS, webhook/metrics, autoscaling và chính sách recording/moderation; giữ mesh làm degraded mode.
4. DBA review package Phase 12; chạy `apply → verify → rollback → verify absent → re-apply → verify` trên staging cô lập trước khi bật adapter.
5. Đồng bộ object Quest/War Room/Guild/Treasury với `Task`, `Project`, `User`, `Finance` hiện hữu.
6. Thêm map editor, private-area policy, guest lobby, moderation, audit và metrics tải hệ thống.

## An toàn triển khai

- Demo route là static và build được khi không có `.env`.
- Không chạy `db:push` hoặc `db:seed` cho demo này.
- Không trộn branch demo vào deployment production trước khi tách module flag và hoàn thiện RBAC/realtime security.
