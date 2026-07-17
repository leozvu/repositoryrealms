# Phase 0 — Gia cố nền (sao lưu, chốt deploy, bắt lỗi)

Mục tiêu: bảo vệ dữ liệu 5 doanh nghiệp và tránh sự cố lọt lên người dùng thật.

## 1. Sao lưu dữ liệu (Supabase free tier KHÔNG tự backup)

```powershell
npm run backup          # dump cả 5 schema ra backups\<timestamp>\<schema>.json
```

- Giữ tự động 14 bản gần nhất, bản cũ tự xóa.
- **`backups\` đã gitignore** — chứa dữ liệu thật, không commit. **Nên copy ra ổ cloud** (OneDrive/Google Drive) định kỳ để phòng hỏng ổ cứng.

### Lập lịch chạy hằng ngày (Windows)
Mở PowerShell **quyền Admin**, dán (chạy 2:00 sáng mỗi ngày — máy phải bật):

```powershell
$act = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\Asus\Desktop\agency-erp\backup-db.ps1"'
$trg = New-ScheduledTaskTrigger -Daily -At 2:00AM
Register-ScheduledTask -TaskName 'AgencyERP-Backup' -Action $act -Trigger $trg -Description 'Sao lưu DB 5 công ty'
```

### Khôi phục khi khẩn cấp
```powershell
npm run restore backups\20260717-020000\fretas.json           # CHẠY THỬ (chỉ in ra)
npm run restore backups\20260717-020000\fretas.json --commit  # GHI THẬT (xóa + ghi đè schema đó)
```
⚠ `--commit` ghi đè dữ liệu hiện có của schema đó. Chỉ dùng khi thật sự cần.

> Nâng cấp vàng: khi dữ liệu thật tăng, lên **Supabase Pro** để có backup tự động hằng ngày + Point-in-Time Recovery. Script này là lớp bảo vệ tối thiểu khi còn dùng free tier.

## 2. Chốt chặn deploy (test phải xanh)

`deploy-all.ps1` giờ **chạy `npm test` trước**, test fail = **HỦY deploy**. Muốn bỏ qua (không khuyến khích): `.\deploy-all.ps1 -SkipTest`.
Cả `deploy-all.ps1` và `db-push-all.ps1` nay gồm **đủ 5 công ty** (aim/egoric/vnecom/fretas/egolive).

## 3. Tự bắt lỗi trang trắng

Nếu một trang crash render (trang trắng), hệ thống tự:
1. Ghi lỗi vào **Nhật ký hệ thống** (action `client_error`) — Giám đốc thấy ngay, không đợi người dùng báo.
2. Hiện thông báo thân thiện + nút "Thử lại" / "Về Bảng điều khiển" thay vì màn hình trắng.

Xem lỗi client: vào trang **Nhật ký hệ thống**, lọc mục `client_error`.

## Việc còn nên làm (Phase 0 mở rộng)
- Copy `backups\` ra ổ cloud tự động (thêm 1 dòng vào `backup-db.ps1`).
- Môi trường **staging** (schema riêng để thử trước khi lên prod).
- Xoay mật khẩu Postgres (mật khẩu cũ còn trong lịch sử git) — xem CREDENTIALS-NOI-BO.txt.
