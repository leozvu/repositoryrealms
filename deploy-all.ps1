# Deploy MỘT codebase lên cả 4 công ty (hoặc 1 cái với -Only).
#   .\deploy-all.ps1                    → deploy cả 4
#   .\deploy-all.ps1 -Only egoric       → chỉ 1 (aim | egoric | vnecom | egolive)
#   .\deploy-all.ps1 -SkipTest          → bỏ qua bước chạy test (KHÔNG khuyến khích)
# Auth: chạy `npx vercel login` một lần (trong terminal của bạn), hoặc đặt $env:VERCEL_TOKEN.
param(
  [string]$Only = '',
  [string]$Token = $env:VERCEL_TOKEN,
  [switch]$SkipTest
)
$ErrorActionPreference = 'Stop'
$env:VERCEL_ORG_ID = 'team_8Ll3jhqYrRxE3FH7SMvgRXNj'

# --- Phase 0: CHỐT CHẶN — chạy test trước khi deploy. Test fail = hủy deploy. ---
# 4 công ty thật đang chạy; một lỗi lọt lên prod ảnh hưởng người dùng ngay.
if (-not $SkipTest) {
  Write-Host "`n=== 🧪 Chạy test trước khi deploy ===" -ForegroundColor Cyan
  npm test
  if ($LASTEXITCODE -ne 0) { throw "❌ Test FAIL — HỦY deploy. Sửa test cho xanh rồi chạy lại (hoặc -SkipTest nếu chắc chắn)." }
  Write-Host "✔ Test xanh — tiếp tục deploy." -ForegroundColor Green
}

$targets = @(
  @{ key = 'aim';     name = 'AIm Agency';     id = 'prj_gOCkd1N5rIovGeHZBtL8dJFepbGC'; url = 'https://agency-erp-mu.vercel.app' },
  @{ key = 'egoric';  name = 'Egoric Agency';  id = 'prj_Hh4aZEj9q3hvULaUfC4GwFvxYii9'; url = 'https://erp-egoric.vercel.app' },
  @{ key = 'vnecom';  name = 'Vnecom LLC';     id = 'prj_Vaz8Su75zNPtjnX6M7ouR7aQ5Vrc'; url = 'https://erp-vnecom.vercel.app' },
  # fretas ĐÃ GỠ (v3.42): thuộc một đơn vị khác, không nằm trong nhóm 4 công ty của Leoz Group.
  @{ key = 'egolive'; name = 'Egolive (live)'; id = 'prj_ztSxMfO1MWDBQ758HgsMMPw4Ue4f'; url = 'https://erp-egolive.vercel.app' }
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
