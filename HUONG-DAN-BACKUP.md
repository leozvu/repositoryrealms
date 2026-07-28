# Phase 0 — Gia cố nền (sao lưu, chốt deploy, bắt lỗi)

Mục tiêu: bảo vệ dữ liệu bốn entity AIm, Egoric, Vnecom và Egolive, đồng thời tránh sự cố lọt lên người dùng thật. Fretas nằm ngoài phạm vi RepositoryRealms và không được script v2 đọc.

## 1. Sao lưu dữ liệu (Supabase free tier KHÔNG tự backup)

Script không tự đọc `.env`, `DATABASE_URL` hoặc `DIRECT_URL` của app. Credential backup phải được cấp riêng qua `BACKUP_DATABASE_URL`.

```powershell
$env:BACKUP_DATABASE_URL='<direct PostgreSQL URL qua kênh secret>'
$env:BACKUP_SOURCE='production'
$env:BACKUP_SCHEMAS='public,egoric,vnecom,egolive'

npm run backup:plan
$env:BACKUP_APPROVAL='<token đúng từ plan sau khi kiểm tra host/database đã che mật khẩu>'
$env:BACKUP_OUTPUT_ROOT='<thư mục backup ngoài Git, được mã hóa hoặc đồng bộ off-site>'

npm run backup
npm run backup:verify -- '<thư mục timestamp vừa tạo>'
```

- Backup chạy trong một transaction `REPEATABLE READ` và `READ ONLY` chung cho cả bốn schema.
- Mỗi file có SHA-256, table count và row count; thư mục chỉ có manifest hoàn tất khi toàn bộ schema thành công.
- Script không tự xóa backup cũ. Retention phải do storage policy quản lý để tránh xóa nhầm bản phục hồi cuối cùng.
- **`backups\` đã gitignore** — chứa dữ liệu thật, không commit. Lưu ngoài Git và ưu tiên storage có mã hóa, versioning và retention.

### Lập lịch chạy hằng ngày (Windows)
Mở PowerShell **quyền Admin**, dán (chạy 2:00 sáng mỗi ngày — máy phải bật):

```powershell
$repoPath = '<đường dẫn tuyệt đối tới CRMegoric-Realms-Demo>'
$act = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$repoPath\backup-db.ps1`""
$trg = New-ScheduledTaskTrigger -Daily -At 2:00AM
Register-ScheduledTask -TaskName 'RepositoryRealms-Backup' -Action $act -Trigger $trg -Description 'Sao lưu DB 4 entity RepositoryRealms'
```

Tạo `.env.backup.local` trong repo (đã được `.gitignore`) gồm đúng năm biến của ví dụ trên: URL, source, schemas, approval và output root. Wrapper chỉ nạp allowlist này vào process, không ghi giá trị secret ra log. Khi host/database hoặc danh sách schema đổi, chạy lại `backup:plan` và cập nhật approval.

### Khôi phục khi khẩn cấp

Không dùng `scripts/restore-db.js` cho backup v2. Trước mọi restore, chạy `backup:verify`, sau đó rehearsal vào **schema staging cô lập** bằng `staging:backup:rehearse:legacy`. Rehearsal tạo schema có prefix `restore_test_`, đối chiếu checksum/count/identity và luôn xóa schema tạm. Không restore đè production.

```powershell
$env:BACKUP_INPUT_DIR='<thư mục backup v2>'
npm run backup:verify

$env:REALMS_STAGING_CONFIRMATION='CREATE_AND_DROP_ISOLATED_RESTORE_TEST_SCHEMA'
$env:REALMS_STAGING_LEGACY_BACKUP_DIR=$env:BACKUP_INPUT_DIR
npm run staging:backup:rehearse:legacy
```

> Nâng cấp vàng: khi dữ liệu thật tăng, lên **Supabase Pro** để có backup tự động hằng ngày + Point-in-Time Recovery. Script này là lớp bảo vệ tối thiểu khi còn dùng free tier.

## 2. Chốt chặn deploy (test phải xanh)

`deploy-all.ps1` giờ **chạy `npm test` trước**, test fail = **HỦY deploy**. Muốn bỏ qua (không khuyến khích): `.\deploy-all.ps1 -SkipTest`.
Pipeline RepositoryRealms chỉ vận hành bốn entity được duyệt: `public` (AIm), `egoric`, `vnecom` và `egolive`. Mọi thay đổi schema hoặc deploy production vẫn phải qua release gate riêng; backup thành công không tự cấp quyền deploy.

## 3. Tự bắt lỗi trang trắng

Nếu một trang crash render (trang trắng), hệ thống tự:
1. Ghi lỗi vào **Nhật ký hệ thống** (action `client_error`) — Giám đốc thấy ngay, không đợi người dùng báo.
2. Hiện thông báo thân thiện + nút "Thử lại" / "Về Bảng điều khiển" thay vì màn hình trắng.

Xem lỗi client: vào trang **Nhật ký hệ thống**, lọc mục `client_error`.

## Việc còn nên làm (Phase 0 mở rộng)
- Copy `backups\` ra ổ cloud tự động (thêm 1 dòng vào `backup-db.ps1`).
- Môi trường **staging** (schema riêng để thử trước khi lên prod).
- Xoay mật khẩu Postgres (mật khẩu cũ còn trong lịch sử git) — xem CREDENTIALS-NOI-BO.txt.
