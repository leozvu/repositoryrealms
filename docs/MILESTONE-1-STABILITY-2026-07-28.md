# Milestone 1 — Bốn ERP vận hành ổn định

Ngày kiểm chứng: 2026-07-28

Nhánh thực hiện: `codex/realms-demo`

Canonical Git được đối chiếu: `origin/main @ 1fff8e9baa7f00f86e33c3bee4f34c43a40d9c7e`

Release ứng dụng đang chạy: v3.42, được ghi trong manifest tại `64ef8c7`

Kết luận: **CONDITIONAL GO cho vận hành hiện tại; HOLD mọi release đổi schema cho tới khi backup và restore-test đạt**.

Không có deployment mới hoặc production database mutation trong lần kiểm chứng này. Restore rehearsal chỉ tạo rồi xóa các schema tạm có prefix `restore_test_` trên database staging đã phê duyệt.

## 1. Production và rollback target

| Entity | Domain chuẩn | Deployment hiện tại | Trạng thái | Rollback Ready liền trước |
|---|---|---|---|---|
| AIm Agency | `agency-erp-mu.vercel.app` | `dpl_FznMAPHtpJppfRJenibfUpbBCskR` | READY | `dpl_H9jQS75YtrX8Fxc1Cnju2xeZL3Uq` |
| Egoric Agency | `erp-egoric.vercel.app` | `dpl_GRcNRKiS8boKBbiKSKmfRFBB51Gp` | READY | `dpl_7KPMHuBuRM8tEs23pNUZsqoda7QE` |
| Vnecom LLC | `erp-vnecom.vercel.app` | `dpl_D1ugAv1MqwhQmcTBZBM1SJ5GAUJz` | READY | `dpl_DC16FsX3mXXynnw79vrdHUHJBMnz` |
| Egolive | `erp-egolive.vercel.app` | `dpl_6uAPaKSWEW5Y4KsemvT2Ds2yztM6` | READY | `dpl_5kvnbYokLkzA31ry86e7PYHWpwJV` |
| CEO Terminal | `ceo-terminal-leoz.vercel.app` | `dpl_HfYtYtvgVzLj97jqbX7r9a8mvH1J` | READY | `dpl_2qsWVeg1C25aTZJNVU2wNxf6W1vg` |

Các domain chuẩn đang trỏ đúng deployment READY tương ứng. Truy vấn log production trong 48 giờ gần nhất không ghi nhận HTTP 5xx ở năm project trên.

## 2. Gate code và contract

- `npm ci`: đạt; dependency audit không có vulnerability.
- `npm run qa`: đạt toàn bộ governance, ERP, Realm, CEO, collaboration, build và audit contract.
- Node test suite: **679/679 pass**, không fail, skip hoặc cancel.
- Production build: đạt.
- UI inventory: 66 UI routes, 129 API routes, 961 elements; artifact hiện hành.
- UI action audit: 175 data actions, 0 unresolved.
- ERP/Realm bridge: 59/59 routes và 10/10 business flows đạt.
- Realm Phase 5–24: tất cả gate đạt.
- CEO security: 10/10 scoped routes, 7/7 chaos scenarios, 0 secret findings.
- CEO rollout contract: 5/5 rings, 5/5 evidence kinds, 5/5 adapters, fail-closed.

Artifact `qa/ceo-security/ceo-security-audit.json` được tái sinh sau khi đồng bộ canonical; thay đổi duy nhất là số file được quét từ 703 lên 752, số secret finding vẫn bằng 0.

## 3. Smoke production không đăng nhập

Kết quả giống nhau trên cả AIm, Egoric, Vnecom và Egolive:

| Contract | Kỳ vọng | Kết quả |
|---|---:|---:|
| `GET /login` | 200 | 200 |
| `GET /api/auth/providers` | 200 | 200 |
| `GET /dashboard` | redirect tới auth | 307 |
| `GET /realm` | redirect tới auth | 307 |
| `GET /api/realm-demo/health` không credential | fail closed | 401 |
| `GET /api/ceo/v1/health` không credential | fail closed | 401 |
| `GET /manifest.webmanifest` | 200 | 200 |
| `POST /api/lead-intake` | endpoint đóng | 404 |

Visual browser smoke xác nhận cả bốn trang đăng nhập:

- render cùng title `CRMegoric ERP · CRM — Medieval Realms`;
- có chuyển ngôn ngữ VI/EN;
- có trường email, password và OTP với autocomplete đúng;
- nút đăng nhập được enable sau khi bootstrap hoàn tất;
- không có horizontal overflow;
- không có console error trong lượt kiểm tra.

## 4. Security cleanup

- Gỡ biến tạm `CEO_SERVICE_BOOTSTRAP_SECRET` khỏi `agency-erp`, `erp-egoric` và `erp-vnecom`; `erp-egolive` không có biến này.
- Xóa route/script bootstrap tạm và các file secret tạm khỏi máy làm việc.
- Khôi phục Vercel link cục bộ về đúng project staging `crmegoric-realms-demo`.
- Không chạm `feat/leozops-s1a`, `lib/leozops`, `tests/leozops-*` hoặc lead-snapshot v1.

## 5. Blocker bắt buộc trước release tiếp theo

Manifest ngày 26/7 tham chiếu `backups/20260726-180503/`, nhưng artifact này không tồn tại trong workspace hiện tại. Bốn project production và CEO Terminal chỉ có biến database mã hóa; không có cấu hình `BACKUP`, `BLOB`, `S3` hoặc storage backup có thể kiểm chứng qua Vercel. Giá trị `DIRECT_URL` là sensitive và không thể pull từ CLI.

Vì vậy hiện chưa thể:

1. xác minh checksum backup production mới nhất;
2. restore bốn schema vào môi trường cô lập;
3. đối chiếu row/table count sau restore;
4. tuyên bố disaster-recovery gate đã đạt.

### Restore rehearsal đã thực hiện

Bộ backup production gần nhất còn giữ tại workspace (`20260722-production-pre-realms-release`) đã được xác minh checksum và restore thật vào database staging bằng bốn schema cô lập. Kết quả:

| Schema nguồn | Models trong schema hiện tại | Rows restore | Kết quả cleanup |
|---|---:|---:|---|
| `public` | 95 | 109 | schema tạm đã xóa |
| `egoric` | 95 | 345 | schema tạm đã xóa |
| `vnecom` | 95 | 11 | schema tạm đã xóa |
| `egolive` | 95 | 11 | schema tạm đã xóa |

Mỗi lượt kiểm archive SHA-256, manifest counts, model shape, primary identities và row counts sau restore. Truy vấn cuối xác nhận còn **0** schema `restore_test_%`. Điều này chứng minh cơ chế restore hoạt động, nhưng **không thay thế yêu cầu backup production mới** vì snapshot được tạo ngày 22/7.

Trong quá trình chạy, gate cũng phát hiện source staging hiện tại bị schema drift (`User.avatar` và một số additive tables/columns chưa tồn tại). Script đã dừng fail-closed; không tự ý migrate hoặc reset source staging.

### Điều kiện gỡ HOLD

- Cấp quyền snapshot/backup trên nhà cung cấp Postgres, hoặc cung cấp `DIRECT_URL` production qua secret channel dùng một lần.
- Chạy `npm run backup` cho `public`, `egoric`, `vnecom`, `egolive`.
- Mã hóa/lưu artifact ngoài Git; ghi SHA-256 và retention policy.
- Restore vào database/schema cô lập, tuyệt đối không restore đè production.
- So sánh table count, row count và các business invariants; lưu biên bản pass/fail.
- Chỉ sau đó mới cho phép migration hoặc deployment có thay đổi schema.

## 6. Quyết định vận hành

- **GO:** tiếp tục dùng bốn ERP/Realm hiện tại và CEO Terminal.
- **GO:** rollback ứng dụng bằng các deployment READY đã liệt kê nếu có lỗi runtime.
- **HOLD:** migration, schema push, restore production và release phụ thuộc thay đổi database.
- **HOLD:** bắt đầu Milestone 2 trước khi người chịu trách nhiệm xác nhận phương án backup/restore.
