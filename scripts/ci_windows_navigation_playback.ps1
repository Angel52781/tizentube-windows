# Windows-hosted real navigation acceptance. No direct watch URL or owner PC.
param(
  [Parameter(Mandatory=$true)][string]$Executable,
  [string]$EvidenceDirectory='windows-experience-evidence'
)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $Executable).Path
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$dir = (Resolve-Path $EvidenceDirectory).Path
$arguments = @('--smoke-test','105','--navigation-playback-probe',
  '--telemetry-file',(Join-Path $dir 'journey-telemetry.json'))
$proc = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList $arguments -Wait -PassThru
if ($proc.ExitCode -ne 0) { throw "NAVIGATION_PROBE_HOST_EXIT:$($proc.ExitCode)" }
function Load([string]$name) {
  $file = Join-Path $dir "journey-$name.json"
  if (!(Test-Path $file)) { throw "NAVIGATION_PROBE_MISSING:$name" }
  $value = Get-Content $file -Raw -Encoding utf8 | ConvertFrom-Json
  if ($null -eq $value) { throw "NAVIGATION_PROBE_NULL:$name" }
  return $value
}
$homeState = Load 'home'
if ($homeState.path -ne '/' -or !$homeState.ytApp) {
  throw "LAUNCH_MUST_OPEN_HOME_NOT_LAST_VIDEO:path=$($homeState.path)"
}
$firstClick = Load 'first-click'
$firstBefore = Load 'first-before'
$firstAfter = Load 'first-after'
$secondClick = Load 'second-click'
$secondBefore = Load 'second-before'
$secondAfter = Load 'second-after'
if (!$firstClick.clicked) {
  throw 'HOME_OR_SEARCH_MUST_ALLOW_OPENING_REAL_VIDEO'
}
if (!$secondClick.clicked) { throw 'RELATED_VIDEO_NAVIGATION_MUST_WORK' }
if (!$firstBefore.watch -or !$secondBefore.watch -or
  $firstBefore.id -ne $firstClick.id -or
  $secondBefore.id -ne $secondClick.id -or
  $firstBefore.id -eq $secondBefore.id) {
  throw "VIDEO_NAVIGATION_INCONSISTENT:first=$($firstBefore.id),second=$($secondBefore.id)"
}
foreach ($name in @('first','second')) {
  $before = if ($name -eq 'first') { $firstBefore } else { $secondBefore }
  $after = if ($name -eq 'first') { $firstAfter } else { $secondAfter }
  $advance = [double]$after.time - [double]$before.time
  if ($before.readyState -lt 2 -or $after.readyState -lt 2 -or
      $after.width -lt 64 -or $before.error -or $after.error -or
      $after.paused -or $advance -lt 1.5) {
    throw "REAL_VIDEO_NOT_PLAYING:$name,ready=$($after.readyState),width=$($after.width),paused=$($after.paused),advance=$advance,error=$($after.error)"
  }
  Write-Host "[PASS] $name video $($after.id), actual playback advanced $([math]::Round($advance,2)) seconds"
}
[ordered]@{
  status='PASS'
  startupPath=$homeState.path
  firstVideoId=$firstAfter.id
  secondVideoId=$secondAfter.id
  firstAdvanceSeconds=[math]::Round(([double]$firstAfter.time-[double]$firstBefore.time),2)
  secondAdvanceSeconds=[math]::Round(([double]$secondAfter.time-[double]$secondBefore.time),2)
  navigationMethod='YouTube home feed and related-video DOM clicks inside real WebView2'
} | ConvertTo-Json | Set-Content (Join-Path $dir 'journey-acceptance.json') -Encoding utf8
Write-Host '[PASS] Home launch, selectable video #1, click another video, two playback sessions'
