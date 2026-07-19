# Full ERP/CRM + Realms staging runbook

Mục tiêu là dựng một bản staging đầy đủ nhưng **không thay thế, liên kết hay ghi vào hệ thống đang vận hành**. Staging dùng Vercel project, PostgreSQL database, auth secret và URL riêng. Dữ liệu mặc định là fixture demo; không copy dữ liệu nhân sự/khách hàng thật.

## Vùng production được bảo vệ

- Không link hoặc deploy nhánh Realms vào các Vercel project ERP hiện tại.
- Không gắn production domain vào staging.
- Không dùng `DATABASE_URL`/`DIRECT_URL` production cho provisioning.
- Không chạy migration, `db push`, seed hoặc reset trên production.
- Chỉ xem xét cutover sau khi staging qua regression, RBAC, security và UAT; cutover cần quyết định riêng.

## Tài nguyên staging bắt buộc

1. Vercel project riêng: `crmegoric-realms-demo` (đây là staging; Vercel target `production` chỉ là alias ổn định của project staging, không phải ERP production).
2. PostgreSQL database riêng có tên/host/schema mang marker `stage`, `staging`, `dev`, `test` hoặc `preview`.
3. `NEXTAUTH_SECRET` staging độc lập, tối thiểu 32 ký tự.
4. `NEXTAUTH_URL` là URL staging, không phải domain production.
5. Mật khẩu demo riêng, tối thiểu 12 ký tự và lưu trong password manager.

## Provision database

Khai báo biến trong một terminal an toàn; không commit credential:

```powershell
$env:REALMS_DEPLOY_ENV='staging'
$env:REALMS_STAGING_DATABASE_URL='postgresql://user:password@db-stage:5432/erp_stage?schema=public'
npm run staging:plan
```

Plan chỉ in URL đã redacted và approval token. Sau khi DBA xác nhận đây là database staging có thể xóa toàn bộ:

```powershell
$env:REALMS_STAGING_APPROVAL='<token từ plan>'
$env:REALMS_STAGING_RESET_CONFIRM='RESET_REALMS_FULL_STAGING_WITH_DEMO_DATA'
$env:REALMS_STAGING_DEMO_PASSWORD='<secret tối thiểu 12 ký tự>'

npm run staging:provision
npm run staging:provision -- --commit
npm run staging:verify
```

`staging:provision` không có `--commit` luôn là dry-run. Khi commit, gate chạy chuỗi `prisma migrate reset`, seed fixture demo và xác minh toàn bộ Prisma models, migration history cùng các bảng ERP/CRM/Realm thiết yếu. Không còn dùng `db push` để provision staging. Vì đây là thao tác xóa toàn bộ target, mọi lần chạy lại đều cần approval và reset token.

## Baseline một staging đã tồn tại

Nếu staging cũ được dựng bằng `db push`, tuyệt đối không chạy `migrate deploy` ngay. Gate mới chỉ cho ghi baseline khi database khớp hoàn toàn với `prisma/schema.prisma`:

```powershell
npm run staging:migrations:plan

$env:REALMS_STAGING_APPROVAL='<token từ plan>'
$env:REALMS_STAGING_MIGRATION_CONFIRM='BASELINE_EXISTING_REALMS_STAGING_SCHEMA'
npm run staging:migrations:baseline -- --commit

$env:REALMS_STAGING_MIGRATION_CONFIRM='DEPLOY_REALMS_STAGING_MIGRATIONS'
npm run staging:migrations:deploy -- --commit
npm run staging:migrations:verify
```

`baseline` chỉ ghi receipt vào `_prisma_migrations`; không sửa bảng nghiệp vụ. `deploy` áp các migration còn thiếu và luôn verify lại schema drift sau đó.

Nếu provider cấp tên database ngẫu nhiên không có marker staging, chỉ bật `REALMS_STAGING_ALLOW_UNMARKED_TARGET=1` sau khi kiểm tra thủ công resource ID và project owner. Approval token chính xác vẫn bắt buộc.

## Vercel environment

Chỉ thêm vào project `crmegoric-realms-staging`:

- `DATABASE_URL`: staging pooled/runtime URL.
- `DIRECT_URL`: staging direct URL.
- `NEXTAUTH_SECRET`: secret staging độc lập.
- `NEXTAUTH_URL`: URL canonical của staging.
  - các Realm feature flags cần test.

Không thêm `REALMS_STAGING_RESET_CONFIRM` hoặc mật khẩu demo vào runtime app. Hai giá trị này chỉ dùng trong phiên provisioning có kiểm soát.

## Quality gates trước UAT

1. `npm test`, `npm run build`, `npm run test:e2e` đều đạt.
2. Anonymous `/dashboard` và `/realm` chuyển về `/login`; `/realm-demo` vẫn là sandbox công khai nếu chủ đích giữ.
3. Đăng nhập từng role và smoke test dashboard, task, project, CRM, finance, HR, approval, Realm, Tavern.
4. Xác minh RBAC server-side, maker/checker, audit log và idempotency Gold.
5. Mở hai tài khoản: một ở Realm và một ở ERP thuần; xác minh presence, “Gõ cửa ERP”, banner nhận lời mời, accept/decline, deep-link Lantern Mail và Notification cùng dùng dữ liệu Chat gốc.
6. Kiểm tra DND, timeout hiện diện, hết hạn lời mời và nhiều tab không làm tăng số người online.
7. Kiểm tra log staging không có credential, dữ liệu thật hoặc request tới production database/domain.
8. Ghi nhận UAT sign-off; production vẫn giữ nguyên sau khi staging được duyệt.

## CI/CD và rollback

- Pull request chạy fresh-database migration chain trên PostgreSQL 16 trước các quality gate khác.
- Workflow `Realms staging release` là manual, gắn GitHub Environment `realms-staging` và không cho hai release chạy đồng thời.
- Deploy cần typed confirmation `DEPLOY_REALMS_STAGING_MIGRATIONS`, exact target approval và toàn bộ QA pass trước khi migration/app được phát hành.
- Database migration dùng nguyên tắc roll-forward. Không tự động chạy down migration khi rollback application.
- Legacy `realm:staging:rollback` tự từ chối database đã ghi full baseline để không làm migration history sai lệch.
- Trước migration có dữ liệu thật, tạo Neon branch/snapshot. Nếu cần phục hồi, rollback Vercel deployment trước, sau đó DBA quyết định restore branch hoặc chạy forward-fix đã review.
