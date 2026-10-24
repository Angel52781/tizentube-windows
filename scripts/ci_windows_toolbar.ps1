# Focused native chrome test; independent of full YouTube video playback.
param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$EvidenceDirectory='windows-toolbar-evidence'
)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $Executable).Path
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$dir = (Resolve-Path $EvidenceDirectory).Path
$argsForHost = @('--smoke-test','30','--url','https://www.youtube.com/',
  '--navigation-back-probe','--telemetry-file',(Join-Path $dir 'native-toolbar-telemetry.json'))
$process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList $argsForHost -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "NATIVE_TOOLBAR_HOST_EXIT:$($process.ExitCode)" }
$proof = Join-Path $dir 'navigation-back.json'
if (!(Test-Path $proof)) { throw 'NATIVE_TOOLBAR_BACK_PROOF_MISSING' }
$nav = Get-Content $proof -Raw -Encoding utf8 | ConvertFrom-Json
if (!$nav.toolbarPresent -or !$nav.toolbarEnabled -or !$nav.toolbarClicked -or
    $nav.request.pushed -ne '/results' -or
    $nav.nativeSource -ne $nav.request.original) {
    throw "NATIVE_TOOLBAR_BACK_FAILED original=$($nav.request.original) actual=$($nav.nativeSource) enabled=$($nav.toolbarEnabled) clicked=$($nav.toolbarClicked)"
}
$png = Join-Path $dir 'navigation-toolbar.png'
if (!(Test-Path $png)) { throw 'NATIVE_TOOLBAR_SCREENSHOT_MISSING' }
Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::FromFile($png)
try {
  if ($bitmap.Width -lt 120 -or $bitmap.Height -lt 36) { throw 'NATIVE_TOOLBAR_BAD_GEOMETRY' }
  $bg = $bitmap.GetPixel(92,2)
  if ($bg.R -gt 85 -or $bg.G -gt 85 -or $bg.B -gt 85) {
    throw 'NATIVE_TOOLBAR_WHITE_SQUARE_REGRESSION'
  }
} finally { $bitmap.Dispose() }
Write-Host '[PASS] Native browser Back, dark compact toolbar and visual evidence'
