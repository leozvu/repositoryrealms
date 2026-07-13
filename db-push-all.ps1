# Đồng bộ schema Prisma lên CẢ 3 schema Postgres (khi sửa prisma/schema.prisma).
#   .\db-push-all.ps1                → push cả 3
#   .\db-push-all.ps1 -Only egoric   → chỉ 1 schema (aim | egoric | vnecom)
# ⚠ Dừng dev server trước khi chạy (prisma generate cần ghi DLL).
param([string]$Only = '')
$ErrorActionPreference = 'Stop'
$BASE = 'postgresql://postgres.sueqktvmwgonaflogobe:DA_XOA_XEM_ENV@aws-0-ap-southeast-1.pooler.supabase.com'

$schemas = @(
  @{ key = 'aim';    schema = 'public' },
  @{ key = 'egoric'; schema = 'egoric' },
  @{ key = 'vnecom'; schema = 'vnecom' }
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
Write-Host "`n✔ Xong — nhớ chạy .\deploy-all.ps1 để code mới lên cả 3." -ForegroundColor Green
