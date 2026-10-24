# Runs only on GitHub-hosted Windows. Uses a guest YouTube video.
# Proves physical keyboard events reach WebView2 once, not just JS mock events.
param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$EvidenceDirectory = 'windows-experience-evidence'
)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $Executable).Path
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$dir = (Resolve-Path $EvidenceDirectory).Path

function Read-Probe([string]$name) {
  $path = Join-Path $dir "keyboard-$name.json"
  if (!(Test-Path $path)) { throw "KEYBOARD_E2E_MISSING:$name" }
  $value = Get-Content $path -Raw -Encoding utf8 | ConvertFrom-Json
  if ($null -eq $value) { throw "KEYBOARD_E2E_UNAVAILABLE:$name" }
  return $value
}
$exeArgs = @('--smoke-test','38','--url','https://www.youtube.com/watch?v=dQw4w9WgXcQ',
             '--telemetry-file',(Join-Path $dir 'keyboard-host-telemetry.json'),'--keyboard-shortcuts-probe')
$process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList $exeArgs -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "KEYBOARD_HOST_EXIT:$($process.ExitCode)" }
$setup = Read-Probe 'setup'
$before = Read-Probe 'before'
$right = Read-Probe 'after-right'
$left = Read-Probe 'after-left'
$beforeSpace = Read-Probe 'before-space'
$afterSpace = Read-Probe 'after-space'
if (!$setup.ready -or $before.readyState -lt 2) { throw 'KEYBOARD_VIDEO_NOT_READY' }
if (!$before.paused) { throw 'KEYBOARD_SEEK_BASELINE_NOT_PAUSED' }
$forward = [double]$right.time - [double]$before.time
$backward = [double]$left.time - [double]$right.time
if ($forward -lt 3.5 -or $forward -gt 6.5) {
  throw "KEYBOARD_ARROW_RIGHT_EXPECTED_5_ACTUAL:$forward"
}
if ($backward -lt -6.5 -or $backward -gt -3.5) {
  throw "KEYBOARD_ARROW_LEFT_EXPECTED_MINUS_5_ACTUAL:$backward"
}
if (!$beforeSpace.paused -or $afterSpace.paused) {
  throw 'KEYBOARD_SPACE_DID_NOT_RESUME_VIDEO'
}
@{
  environment = 'github-actions-windows-latest'
  method = 'SendKeys into focused native WebView2'
  forwardSeconds = [Math]::Round($forward,2)
  backwardSeconds = [Math]::Round($backward,2)
  spaceResumed = !$afterSpace.paused
  status = 'PASS'
} | ConvertTo-Json | Set-Content (Join-Path $dir 'keyboard-acceptance.json') -Encoding utf8
Write-Host "[PASS] Real Windows/WebView2 ArrowLeft/Right = +/-5 seconds; Space resumes"
