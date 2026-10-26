# Isolated native WinForms titlebar acceptance, independent of YouTube video.
param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$EvidenceDirectory='windows-titlebar-evidence'
)
$ErrorActionPreference='Stop'
$exe=(Resolve-Path $Executable).Path
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$dir=(Resolve-Path $EvidenceDirectory).Path
$argsForHost=@('--smoke-test','15','--titlebar-probe','--url','https://www.youtube.com/',
  '--telemetry-file',(Join-Path $dir 'titlebar-telemetry.json'))
$process=Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList $argsForHost -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "TITLEBAR_HOST_EXIT_$($process.ExitCode)" }
$proof=Join-Path $dir 'titlebar-acceptance.json'
if (!(Test-Path $proof)) { throw 'TITLEBAR_PROOF_MISSING' }
$result=Get-Content $proof -Raw -Encoding utf8 | ConvertFrom-Json
if (!$result.oneBar -or !$result.webviewBelowBar -or !$result.nativeTaskbarMinimize -or
    !$result.maximizedClientFillsWorkArea -or
    !$result.maximized -or !$result.restored -or !$result.minimized -or
    $result.border -ne 'None' -or $result.height -ne 38) {
  throw "TITLEBAR_WINDOW_ACTIONS_FAILED:$($result | ConvertTo-Json -Compress)"
}
$png=Join-Path $dir 'titlebar-integrated.png'
if (!(Test-Path $png)) { throw 'TITLEBAR_SCREENSHOT_MISSING' }
Add-Type -AssemblyName System.Drawing
$bitmap=[System.Drawing.Bitmap]::FromFile($png)
try {
  if ($bitmap.Width -lt 800 -or $bitmap.Height -ne 38) { throw 'TITLEBAR_BAD_DIMENSIONS' }
  $background=$bitmap.GetPixel(111,2)
  if ($background.R -gt 80 -or $background.G -gt 80 -or $background.B -gt 80) {
    throw 'TITLEBAR_NOT_DARK'
  }
  # Caption buttons occupy distinct accessible hit targets in rightmost 138px.
  if ($bitmap.GetPixel(($bitmap.Width-23),19).A -eq 0) { throw 'TITLEBAR_CLOSE_BUTTON_MISSING' }
} finally { $bitmap.Dispose() }
Write-Host '[PASS] Integrated titlebar: WebView below chrome, system minimize styles, dark + minimize/maximize/restore'
