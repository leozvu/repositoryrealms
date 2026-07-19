param(
  [string]$Version = '1.13.3',
  [string]$Bind = '127.0.0.1',
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'CRMegoric\RealmRuntime\LiveKit')
)

$ErrorActionPreference = 'Stop'
$executable = Join-Path (Join-Path $InstallRoot "v$Version") 'livekit-server.exe'
if (-not (Test-Path -LiteralPath $executable)) {
  throw 'LiveKit is not installed. Run npm run realm:media:install first.'
}

Write-Output "Starting LiveKit $Version on $Bind (devkey/secret; local development only)"
& $executable --dev --bind $Bind
