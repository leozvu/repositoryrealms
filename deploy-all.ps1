# Deploy MỘT codebase lên cả 3 doanh nghiệp (hoặc 1 cái với -Only).
#   .\deploy-all.ps1                    → deploy cả 3
#   .\deploy-all.ps1 -Only egoric       → chỉ Egoric (aim | egoric | vnecom)
# Auth: chạy `npx vercel login` một lần (trong terminal của bạn), hoặc đặt $env:VERCEL_TOKEN.
param(
  [string]$Only = '',
  [string]$Token = $env:VERCEL_TOKEN
)
$ErrorActionPreference = 'Stop'
$env:VERCEL_ORG_ID = 'team_8Ll3jhqYrRxE3FH7SMvgRXNj'

$targets = @(
  @{ key = 'aim';    name = 'AIm Agency';    id = 'prj_gOCkd1N5rIovGeHZBtL8dJFepbGC'; url = 'https://agency-erp-mu.vercel.app' },
  @{ key = 'egoric'; name = 'Egoric Agency'; id = 'prj_Hh4aZEj9q3hvULaUfC4GwFvxYii9'; url = 'https://erp-egoric.vercel.app' },
  @{ key = 'vnecom'; name = 'Vnecom LLC';    id = 'prj_Vaz8Su75zNPtjnX6M7ouR7aQ5Vrc'; url = 'https://erp-vnecom.vercel.app' }
)

$tokenArgs = @()
if ($Token) { $tokenArgs = @('--token', $Token) }

foreach ($t in $targets) {
  if ($Only -and $t.key -ne $Only.ToLower()) { continue }
  Write-Host "`n=== 🚀 $($t.name) ===" -ForegroundColor Cyan
  $env:VERCEL_PROJECT_ID = $t.id
  npx vercel deploy --prod --yes @tokenArgs 2>&1 | Select-String -Pattern 'readyState|Error|error' | Select-Object -First 2
  Write-Host "→ $($t.url)" -ForegroundColor Green
}
Remove-Item Env:VERCEL_PROJECT_ID -ErrorAction SilentlyContinue
Write-Host "`n✔ Xong. Master dashboard tự đọc dữ liệu mới, không cần deploy lại." -ForegroundColor Green
