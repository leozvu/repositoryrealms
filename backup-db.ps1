# Phase 0 — Wrapper để Windows Task Scheduler gọi sao lưu DB hằng ngày.
#   Chạy tay:  .\backup-db.ps1
# Lập lịch tự động (chạy mỗi ngày 2:00 sáng) — mở PowerShell với quyền Admin và dán:
#
#   $act = New-ScheduledTaskAction -Execute 'powershell.exe' `
#     -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Users\Asus\Desktop\agency-erp\backup-db.ps1"'
#   $trg = New-ScheduledTaskTrigger -Daily -At 2:00AM
#   Register-ScheduledTask -TaskName 'AgencyERP-Backup' -Action $act -Trigger $trg -Description 'Sao lưu DB 5 công ty'
#
# Máy phải BẬT lúc 2:00 mới chạy. Nên copy thư mục backups\ ra ổ cloud (OneDrive/Google Drive)
# định kỳ để phòng hỏng ổ cứng.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot 'backups\_backup.log'
"[{0}] bắt đầu sao lưu" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Tee-Object -FilePath $log -Append
node scripts/backup-db.js 2>&1 | Tee-Object -FilePath $log -Append
if ($LASTEXITCODE -ne 0) { "[{0}] ⚠ SAO LƯU LỖI (exit $LASTEXITCODE)" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Tee-Object -FilePath $log -Append }
