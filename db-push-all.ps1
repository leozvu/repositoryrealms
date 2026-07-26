# Đồng bộ schema Prisma lên CẢ 4 schema Postgres (khi sửa prisma/schema.prisma).
#   .\db-push-all.ps1                → push cả 4
#   .\db-push-all.ps1 -Only egoric   → chỉ 1 schema (aim | egoric | vnecom | egolive)
# ⚠ Dừng dev server trước khi chạy (prisma generate cần ghi DLL — dev server giữ file này).
#
# v3.13: mật khẩu Postgres KHÔNG còn nằm trong file này nữa (file này được git theo dõi).
# Chuỗi kết nối đọc từ .env — .env đã nằm trong .gitignore.
param([string]$Only = '')
$ErrorActionPreference = 'Stop'

# --- Lấy máy chủ + thông tin đăng nhập từ .env, không hardcode ---
$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envFile)) { throw "Không thấy .env — cần DATABASE_URL trong đó để biết máy chủ Postgres." }
$line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw "Không thấy DATABASE_URL trong .env" }
$url = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
# postgresql://user:mật_khẩu@host  (cắt bỏ :port/db?query)
if ($url -notmatch '^(postgresql://[^@]+@[^:/?]+)') { throw "DATABASE_URL trong .env sai định dạng — cần dạng postgresql://user:pass@host:port/db" }
$BASE = $Matches[1]

$schemas = @(
  @{ key = 'aim';     schema = 'public' },
  @{ key = 'egoric';  schema = 'egoric' },
  @{ key = 'vnecom';  schema = 'vnecom' },
  # fretas ĐÃ GỠ (v3.42): thuộc một đơn vị khác, không nằm trong nhóm 4 công ty của Leoz Group.
  # Để lại trong danh sách là mỗi lần đổi schema lại vô tình ghi vào cơ sở dữ liệu của họ.
  @{ key = 'egolive'; schema = 'egolive' }
)
foreach ($s in $schemas) {
  if ($Only -and $s.key -ne $Only.ToLower()) { continue }
  Write-Host "`n=== 🗄 schema [$($s.schema)] ===" -ForegroundColor Cyan
  $env:DATABASE_URL = "${BASE}:6543/postgres?pgbouncer=true&connection_limit=10&pool_timeout=30&schema=$($s.schema)"
  $env:DIRECT_URL = "${BASE}:5432/postgres?schema=$($s.schema)"
  npx prisma db push --skip-generate 2>&1 | Select-Object -Last 1
}
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL -ErrorAction SilentlyContinue
npx prisma generate 2>&1 | Select-Object -Last 1
Write-Host "`n✔ Xong — nhớ chạy .\deploy-all.ps1 để code mới lên cả 4." -ForegroundColor Green
