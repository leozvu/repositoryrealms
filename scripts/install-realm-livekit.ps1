param(
  [string]$Version = '1.13.3',
  [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'CRMegoric\RealmRuntime\LiveKit')
)

$ErrorActionPreference = 'Stop'
$architecture = switch ($env:PROCESSOR_ARCHITECTURE.ToUpperInvariant()) {
  'AMD64' { 'amd64' }
  'ARM64' { 'arm64' }
  default { throw "Unsupported Windows architecture: $env:PROCESSOR_ARCHITECTURE" }
}

$targetDirectory = Join-Path $InstallRoot "v$Version"
$executable = Join-Path $targetDirectory 'livekit-server.exe'
if (Test-Path -LiteralPath $executable) {
  & $executable --version
  Write-Output $executable
  exit 0
}

$assetName = "livekit_${Version}_windows_${architecture}.zip"
$releaseBase = "https://github.com/livekit/livekit/releases/download/v$Version"
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$downloadDirectory = [IO.Path]::GetFullPath((Join-Path $tempRoot "crmegoric-livekit-$([guid]::NewGuid())"))
if (-not $downloadDirectory.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to create a download directory outside the system temp directory.'
}

New-Item -ItemType Directory -Path $downloadDirectory | Out-Null
try {
  $archivePath = Join-Path $downloadDirectory $assetName
  $checksumPath = Join-Path $downloadDirectory 'checksums.txt'
  Invoke-WebRequest -Uri "$releaseBase/checksums.txt" -OutFile $checksumPath
  Invoke-WebRequest -Uri "$releaseBase/$assetName" -OutFile $archivePath

  $checksumLine = Get-Content -LiteralPath $checksumPath | Where-Object { $_ -match "\s$([regex]::Escape($assetName))$" } | Select-Object -First 1
  if (-not $checksumLine) { throw "No SHA-256 entry found for $assetName" }
  $expectedHash = ($checksumLine -split '\s+')[0].ToLowerInvariant()
  $sha256 = [Security.Cryptography.SHA256]::Create()
  $archiveStream = [IO.File]::OpenRead($archivePath)
  try {
    $actualHash = ([BitConverter]::ToString($sha256.ComputeHash($archiveStream))).Replace('-', '').ToLowerInvariant()
  } finally {
    $archiveStream.Dispose()
    $sha256.Dispose()
  }
  if ($actualHash -ne $expectedHash) {
    throw "LiveKit checksum mismatch: expected $expectedHash, got $actualHash"
  }

  New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
  Expand-Archive -LiteralPath $archivePath -DestinationPath $targetDirectory -Force
  if (-not (Test-Path -LiteralPath $executable)) { throw 'LiveKit archive did not contain livekit-server.exe' }
  & $executable --version
  Write-Output "SHA256 verified: $actualHash"
  Write-Output $executable
} finally {
  if (Test-Path -LiteralPath $downloadDirectory) {
    Remove-Item -LiteralPath $downloadDirectory -Recurse -Force
  }
}
