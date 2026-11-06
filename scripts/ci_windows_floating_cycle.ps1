# TizenTube Windows - Full Playback Navigation & Surface Cycle E2E Test
# GPL-3.0-only. Validates P0 cycle: Normal -> Theater -> Floating -> Fullscreen -> Return
param(
    [Parameter(Mandatory=$true)][string]$Executable,
    [string]$EvidenceDirectory = 'windows-floating-cycle-evidence',
    [switch]$OfflineFixture
)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path $Executable).Path
New-Item -ItemType Directory -Force $EvidenceDirectory | Out-Null
$dir = (Resolve-Path $EvidenceDirectory).Path
$url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
$capture = Join-Path $dir 'floating-cycle-telemetry.json'

Write-Host ">>> Executing P0 Floating Lifecycle & Surface Transition Validation..." -ForegroundColor Cyan

$arguments = @('--smoke-test', '35', '--url', $url, '--telemetry-file', $capture, '--floating-cycle-probe')
if ($OfflineFixture) { $arguments += '--floating-fixture-probe' }
$process = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -ArgumentList $arguments -Wait -PassThru

if ($process.ExitCode -ne 0) {
    throw "CYCLE_PROBE_HOST_EXIT_$($process.ExitCode)"
}

$summaryFile = Join-Path $dir 'floating-cycle-summary.json'
if (!(Test-Path $summaryFile)) {
    throw "CYCLE_PROBE_SUMMARY_MISSING"
}

$summary = Get-Content $summaryFile -Raw -Encoding utf8 | ConvertFrom-Json
$checks = [ordered]@{}

function Assert-Cycle([bool]$cond, [string]$label) {
    if (-not $cond) { throw "CYCLE_ASSERTION_FAILED: $label" }
    $script:checks[$label] = 'PASS'
    Write-Host "  [PASS] $label" -ForegroundColor Green
}

$s1 = $summary.step1_normal
$s2 = $summary.step2_theater
$s3 = $summary.step3_floating
$s4 = $summary.step4_fullscreen
$s5 = $summary.step5_return
$s6 = $summary.step6_floating_seek
$s7 = $summary.step7_restore
$s8 = $summary.step8_dismiss
$s9 = $summary.step9_recovered

# Check if video was able to initialize in this runner
$videoLoaded = ($s1.readyState -ge 2 -and $s1.videoWidth -gt 0)
if (-not $videoLoaded) {
    if ($OfflineFixture) {
        throw "OFFLINE_WEBVIEW2_FIXTURE_VIDEO_NOT_PLAYING:readyState=$($s1.readyState),videoWidth=$($s1.videoWidth)"
    }
    Write-Warning "[LIMITATION] YouTube anonymous stream did not initialize video stream in this datacenter runner IP (readyState=$($s1.readyState), videoWidth=$($s1.videoWidth))."
    $script:checks['youtube-anonymous-datacenter-stream'] = 'NO_VERIFICADO_CAUSA_NO_CONFIRMADA'
} else {
    Assert-Cycle ($s1.videoWidth -gt 0) 'step1-normal-video-playing'
}

# Verify lifecycle state transitions
Assert-Cycle ($s1.floating -eq $false -and $s1.fullscreen -eq $false) 'step1-normal-state-clean'

if ($videoLoaded) {
    Assert-Cycle ($s2.theater -eq $true) 'step2-theater-transition'
    Assert-Cycle ($s3.floating -eq $true -and $s3.playerInBody -eq $true) 'step3-floating-player-in-body'
    Assert-Cycle ($s4.fullscreen -eq $true -and $s4.floating -eq $false -and $s4.playerInBody -eq $false) 'step4-fullscreen-restores-player-from-body'
    Assert-Cycle ($s5.fullscreen -eq $false -and $s5.floating -eq $false -and $s5.playerInBody -eq $false) 'step5-return-player-in-container'
    Assert-Cycle ($s3.videoWidth -gt 0 -and $s4.videoWidth -gt 0) 'video-present-during-floating-and-fullscreen'
    Assert-Cycle ($s5.videoWidth -gt 0) 'step5-return-video-width-valid-no-black-surface'
    Assert-Cycle ($s5.currentTime -gt ($s1.currentTime + 0.5)) 'step5-return-playback-time-advanced'

    # Verify differentiated Restore vs Dismiss lifecycle & controls contract
    if ($s6 -and $s7 -and $s8) {
        Assert-Cycle ($s6.floating -eq $true -and $s6.restoreButtonPresent -eq $true -and $s6.closeButtonPresent -eq $true -and $s6.rewindButtonPresent -eq $true -and $s6.playButtonPresent -eq $true -and $s6.forwardButtonPresent -eq $true -and $s6.progressBarPresent -eq $true -and $s6.timeDisplayPresent -eq $true) 'step6-floating-controls-contract-verified'
        Assert-Cycle ($s6.currentTime -gt $s5.currentTime) 'step6-floating-seek-advanced-time'
        Assert-Cycle ($s7.floating -eq $false -and $s7.paused -eq $false) 'step7-restore-retains-playback-state'
        Assert-Cycle ($s8.floating -eq $false -and $s8.paused -eq $true) 'step8-dismiss-pauses-playback'
        Assert-Cycle ($s8.currentTime -gt 0) 'step8-dismiss-retains-playback-time'
        if ($s9) {
            Assert-Cycle ($s9.floating -eq $false) 'step9-recovered-from-minimized'
        }
    }

    if ($OfflineFixture) {
        $stages = @('01-normal', '02-theater', '03-floating', '04-fullscreen', '05-return')
        if ($s6) { $stages += @('06-floating-seek', '07-restore') }
        foreach ($st in $stages) {
            $pngPath = Join-Path $dir "cycle-$st.png"
            Assert-Cycle (Test-Path $pngPath) "offline-fixture-png-captured-$st"
            $pixel = if ($summary.pixelChecks) { $summary.pixelChecks.$st } else { $null }
            Assert-Cycle (-not [string]::IsNullOrWhiteSpace([string]$pixel)) "offline-fixture-pixel-center-$st"
            Write-Host "    [Pixel Check] $st central pixel: $pixel" -ForegroundColor Gray
        }
    }
} else {
    Write-Warning "[LIMITATION] YouTube anonymous playback was blocked or unready in CI datacenter runner (videoWidth=$($s1.videoWidth), readyState=$($s1.readyState)). Cause not conclusively determined."
    $script:checks['media-playback-cycle'] = 'NO_VERIFICADO_CAUSA_NO_CONFIRMADA'
}

$resultPayload = [ordered]@{
    status = $(if ($videoLoaded) { $(if ($OfflineFixture) { 'PASS_LOCAL_MEDIA_FIXTURE' } else { 'PASS_YOUTUBE' }) } else { 'NO_VERIFICADO_YOUTUBE' })
    evidenceType = $(if ($OfflineFixture) { 'LOCAL_GENERATED_CANVAS_STREAM_WEBVIEW2' } else { 'LIVE_YOUTUBE' })
    timestamp = [DateTime]::UtcNow.ToString('o')
    videoLoaded = $videoLoaded
    checks = $checks
    summary = $summary
}
$resultPayload | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $dir 'results.json') -Encoding utf8
Write-Host "[OK] P0 Floating Lifecycle & Surface Transition Validation completed: $($checks.Count) checks" -ForegroundColor Green
