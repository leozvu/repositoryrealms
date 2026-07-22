# Realm Phase 12 — staging migration runbook

Runbook này dành cho **database staging cô lập**. Nó không phải hướng dẫn chạy trực tiếp trên production.

## Phạm vi migration

Migration `20260717190000_add_realm_reward_governance` chỉ tạo bốn bảng mới:

- `RealmProfile`
- `RealmQuestConfig`
- `RealmRewardBudget`
- `RealmGoldEntry`

Migration chỉ tham chiếu khóa ngoại tới `User` và `Task`; không `ALTER`, backfill, khóa hoặc ghi lại dữ liệu hai bảng hiện hữu. Forward SQL và rollback SQL được khóa checksum trong `prisma/realm-phase12-manifest.json`.

Rollback xóa toàn bộ bốn bảng Realm và dữ liệu chứa trong đó. Vì vậy rollback chỉ dùng trong rehearsal hoặc sau khi đã có snapshot được xác nhận phục hồi được.

## Guardrail bắt buộc

CLI dùng riêng `REALM_STAGING_DATABASE_URL` và không bao giờ fallback sang `DATABASE_URL`/`DIRECT_URL` của ứng dụng.

- `REALM_DEPLOY_ENV` chỉ nhận `development`, `staging` hoặc `test`.
- URL, database hoặc schema có marker production sẽ bị từ chối.
- Schema `public` bị chặn mặc định.
- Schema trong URL phải trùng tuyệt đối `REALM_STAGING_SCHEMA`.
- Mọi thao tác ghi cần `--commit` và approval token khớp chính xác target đã resolve.
- Rollback cần thêm token data-loss riêng.

## 1. Plan cục bộ, không kết nối database

```powershell
npm run realm:staging:plan
```

Lệnh này chỉ xác minh manifest/checksum và in phạm vi migration.

## 2. Khai báo target staging cô lập

Ví dụ bên dưới chỉ là placeholder. Không copy credential vào source hoặc log chia sẻ:

```powershell
$env:REALM_DEPLOY_ENV='staging'
$env:REALM_STAGING_DATABASE_URL='postgresql://user:password@db-stage:5432/erp_stage?schema=realm_stage'
$env:REALM_STAGING_SCHEMA='realm_stage'

npm run realm:staging:plan
```

Plan sẽ in approval token dựa trên host, database và schema nhưng không in username/password. Copy đúng token đó vào biến môi trường của phiên terminal:

```powershell
$env:REALM_STAGING_APPROVAL='realm-phase12:db-stage:5432:erp_stage:realm_stage'
```

Trước khi tiếp tục, DBA phải xác nhận `realm_stage` là schema rehearsal, `User`/`Task` đã có cấu trúc tương thích và đã tạo restore point ở tầng provider hoặc `pg_dump`.

## 3. Dry-run apply

```powershell
npm run realm:staging:apply
```

Không có `--commit`, CLI chỉ in target và dừng trước Prisma. Đây là bước bắt buộc trong checklist review.

## 4. Apply và xác minh cấu trúc

```powershell
npm run realm:staging:apply -- --commit
npm run realm:staging:verify
```

Sau khi `migrate deploy` thành công, gate kiểm tra đủ bốn bảng, 13 index, bảy foreign key và 11 check constraint. `verify` là read-only nhưng vẫn yêu cầu approval token để tránh kiểm tra nhầm database.

## 5. Smoke test ứng dụng staging

Chỉ trên build staging, bật đồng thời:

```powershell
$env:REALM_ERP_SYNC_ENABLED='1'
$env:NEXT_PUBLIC_REALM_ERP_SYNC='1'
```

Acceptance checklist:

1. STAFF chỉ đọc/claim Quest của chính mình và không mở được Hội đồng Gold.
2. PM/Lead tạo draft đúng phạm vi; Lead không cấu hình Task ngoài team.
3. HR/Director duyệt được draft của người khác nhưng không tự duyệt.
4. Approve cập nhật commitment; claim tạo đúng một `RealmGoldEntry` khi retry cùng idempotency key.
5. Mỗi action tạo `TaskEvent` và `AuditLog`.
6. Vượt company cap, per-user cap hoặc reward cap phải bị từ chối.
7. Tắt hai feature flag đưa UI về local fallback và API trả `503 realm_erp_sync_disabled`.
8. Hai Director khác nhau chạy được budget `draft → pending → approved`; self-approval và cap thấp hơn nghĩa vụ hiện hữu phải bị chặn.
9. Tavern benefit chạy `hold → approval → ready → fulfilled`; chỉ HR/Director phù hợp được xác nhận trao, requester không thể tự xác nhận và retry chỉ có một receipt `redemption_fulfillment` amount `0`.
10. Mua cosmetic rồi trang bị tạo đúng một event `loadout_equip` amount `0` cho mỗi idempotency key; item chưa sở hữu bị chặn, loadout hiện giống nhau ở Tavern, Character Dossier và Realm presence.
11. Guild Hall chỉ trả member/Task/Project trong `teamId` của session; user không có team chỉ thấy chính mình, freelancer bị chặn, presence không ghi DB và roster không hiển thị Gold theo cá nhân.
12. Từ Guild Hall mở một campaign vào War Room: Phase/Milestone/Task phải đúng Project và scope member của session; project ngoài scope trả cùng `404 campaign_not_found`, dependency blocker/quá hạn hiển thị đúng, màn hình không ghi DB và không hiển thị Gold hay ranking cá nhân.
13. Từ Guild Hall mở Royal Embassy: Director thấy company pipeline, AM chỉ thấy Lead của mình hoặc chưa gán, vai trò khác và freelancer bị chặn; response không có email/điện thoại/ghi chú, Client chỉ hiện nhịp Project, không ghi DB và không xếp hạng Account theo doanh số.

Không dùng dữ liệu nhân sự thật cho rehearsal. Dùng user/task fixture riêng trong schema staging.

## 6. Rollback rehearsal

Tắt hai feature flag và dừng worker/job có thể ghi Gold trước. Sau đó:

```powershell
npm run realm:staging:rollback

$env:REALM_STAGING_ROLLBACK_CONFIRM='DROP_REALM_PHASE12_STAGING_DATA'
npm run realm:staging:rollback -- --commit
```

Lệnh đầu là dry-run. Lệnh thứ hai xóa bốn bảng Realm, xóa receipt migration tương ứng và tự xác minh không còn bảng Phase 12. Không dùng rollback này trên environment đã có Realm data cần giữ.

## 7. Re-apply để chứng minh migration có thể phục hồi

```powershell
Remove-Item Env:REALM_STAGING_ROLLBACK_CONFIRM -ErrorAction SilentlyContinue
npm run realm:staging:apply -- --commit
npm run realm:staging:verify
```

Rehearsal chỉ đạt khi chuỗi `apply → verify → rollback → verify absent → re-apply → verify` hoàn tất và restore point được ghi vào biên bản triển khai.

## Exit criteria trước production review

- DBA duyệt forward SQL, rollback SQL và checksum manifest.
- CI chạy toàn bộ unit/integration tests và production build.
- Staging smoke test maker/checker, RBAC, budget, idempotency và audit đều đạt.
- Có snapshot, thời gian apply/rollback thực đo và người chịu trách nhiệm go/no-go.
- Feature flags production vẫn tắt cho tới khi migration production được duyệt riêng.
