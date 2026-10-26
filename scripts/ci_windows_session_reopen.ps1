# Two-process isolated Windows session test; never uses Google credentials.
param([Parameter(Mandatory=$true)][string]$Executable,
      [string]$EvidenceDirectory='windows-session-evidence')
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $Executable).Path
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$dir = (Resolve-Path $EvidenceDirectory).Path
# Browser profiles contain cookies/cache, even for guest runs. Never put the
# profile beneath EvidenceDirectory (which CI uploads as a public artifact).
$env:TIZENTUBE_TEST_SESSION_DIR = Join-Path ([IO.Path]::GetTempPath()) 'tizentube-guest-session-e2e'
if ($env:TIZENTUBE_TEST_SESSION_DIR.StartsWith($dir,
    [StringComparison]::OrdinalIgnoreCase)) {
  throw 'SESSION_PROFILE_MUST_NOT_BE_IN_PUBLISHED_EVIDENCE'
}
try {
  if (Test-Path $env:TIZENTUBE_TEST_SESSION_DIR) {
    Remove-Item $env:TIZENTUBE_TEST_SESSION_DIR -Recurse -Force
  }
  New-Item -ItemType Directory $env:TIZENTUBE_TEST_SESSION_DIR -Force | Out-Null
  $first = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList @('--smoke-test','18','--session-setup-probe','--telemetry-file',(Join-Path $dir 'session-first-host.json')) -PassThru -Wait
  $savedPath = Join-Path $dir 'session-setup.json'
  if ($first.ExitCode -ne 0 -or !(Test-Path $savedPath)) {
    throw "SESSION_FIRST_PROCESS_FAILED:$($first.ExitCode)"
  }
  $saved = Get-Content $savedPath -Raw | ConvertFrom-Json
  if (!$saved.saved) { throw 'SESSION_PROGRESS_CHECKPOINT_NOT_SAVED' }

  $second = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList @('--smoke-test','22','--session-restore-probe','--telemetry-file',(Join-Path $dir 'session-second-host.json')) -PassThru -Wait
  $reopenedPath = Join-Path $dir 'session-reopen.json'
  if ($second.ExitCode -ne 0 -or !(Test-Path $reopenedPath)) {
    throw "SESSION_SECOND_PROCESS_FAILED:$($second.ExitCode)"
  }
  $reopened = Get-Content $reopenedPath -Raw | ConvertFrom-Json
  if ($reopened.href -notmatch 'watch\?v=aqz-KE-bpKQ' -or
      $reopened.href -notmatch 't=137s' -or $reopened.theater -ne $true) {
    throw "SESSION_RESTORE_WRONG_VIDEO_TIME_OR_THEATER:$($reopened | ConvertTo-Json -Compress)"
  }
  Write-Host '[PASS] Two Windows processes recover video/time and theater preference'
} finally {
  # Runner-only session data must not survive in public artifacts or uploads.
  if (Test-Path $env:TIZENTUBE_TEST_SESSION_DIR) {
    Remove-Item $env:TIZENTUBE_TEST_SESSION_DIR -Recurse -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:TIZENTUBE_TEST_SESSION_DIR -ErrorAction SilentlyContinue
}
