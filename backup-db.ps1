# Phase 0 — Wrapper để Windows Task Scheduler gọi sao lưu DB hằng ngày.
#   Chạy tay:  .\backup-db.ps1
# Lập lịch tự động (chạy mỗi ngày 2:00 sáng) — mở PowerShell với quyền Admin và dán:
#
#   $repoPath = '<đường dẫn tuyệt đối tới CRMegoric-Realms-Demo>'
#   $act = New-ScheduledTaskAction -Execute 'powershell.exe' `
#     -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$repoPath\backup-db.ps1`""
#   $trg = New-ScheduledTaskTrigger -Daily -At 2:00AM
#   Register-ScheduledTask -TaskName 'RepositoryRealms-Backup' -Action $act -Trigger $trg -Description 'Sao lưu DB 4 entity'
#
# Máy phải BẬT lúc 2:00 mới chạy. Nên copy thư mục backups\ ra ổ cloud (OneDrive/Google Drive)
# định kỳ để phòng hỏng ổ cứng.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$secretFile = Join-Path $PSScriptRoot '.env.backup.local'
if (-not (Test-Path -LiteralPath $secretFile)) {
  throw 'Thiếu .env.backup.local. Không fallback sang credential runtime hoặc production project.'
}
$allowed = @(
  'BACKUP_DATABASE_URL',
  'BACKUP_SOURCE',
  'BACKUP_SCHEMAS',
  'BACKUP_APPROVAL',
  'BACKUP_OUTPUT_ROOT'
)
foreach ($line in Get-Content -LiteralPath $secretFile) {
  if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) { continue }
  if ($line -notmatch '^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$') { throw 'Dòng không hợp lệ trong .env.backup.local.' }
  $name = $Matches[1]
  if ($allowed -notcontains $name) { throw "Biến $name không được phép trong .env.backup.local." }
  $value = $Matches[2].Trim().Trim('"').Trim("'")
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
$log = Join-Path $PSScriptRoot 'backups\_backup.log'
New-Item -ItemType Directory -Path (Split-Path -Parent $log) -Force | Out-Null
"[{0}] bắt đầu sao lưu" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Tee-Object -FilePath $log -Append
npm run backup 2>&1 | Tee-Object -FilePath $log -Append
$backupExit = $LASTEXITCODE
if ($backupExit -ne 0) {
  "[{0}] ⚠ SAO LƯU LỖI (exit $backupExit)" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Tee-Object -FilePath $log -Append
  exit $backupExit
}
"[{0}] sao lưu và verify thành công" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Tee-Object -FilePath $log -Append
