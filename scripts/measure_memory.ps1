# ==============================================================================
# TizenTube Windows - Process Tree Memory & Performance Telemetry Script
# Copyright (C) 2026 TizenTube Windows Contributors
# Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
#
# Accurately measures Working Set (physical RAM) and Private Memory (committed pages)
# per PID across the native host and all WebView2 child processes.
# ==============================================================================

param(
    [Parameter(Mandatory = $false)]
    [string]$ExePath = "",

    [Parameter(Mandatory = $false)]
    [int]$HostPid = 0,

    [Parameter(Mandatory = $false)]
    [int]$DurationSeconds = 20,

    [Parameter(Mandatory = $false)]
    [int]$SamplingIntervalMs = 1000,

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "windows-out/telemetry",

    [Parameter(Mandatory = $false)]
    [string]$Scenario = "ci-smoke-test",

    [Parameter(Mandatory = $false)]
    [switch]$LaunchWithoutArgs,

    [Parameter(Mandatory = $false)]
    [switch]$Headless,

    [Parameter(Mandatory = $false)]
    [string]$ExtraArgs = ""
)

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  TizenTube Windows - Process Telemetry Monitor" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Ensure Output Directory Exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$resolvedOutputDir = (Resolve-Path $OutputDir).Path
$internalHostJsonPath = Join-Path $resolvedOutputDir "host-internal-telemetry.json"
$telemetryJsonPath = Join-Path $resolvedOutputDir "memory-telemetry.json"
$summaryTxtPath = Join-Path $resolvedOutputDir "memory-summary.txt"

# 2. Resolve or Launch Target Process
$targetProcess = $null

if ($HostPid -gt 0) {
    try {
        $targetProcess = Get-Process -Id $HostPid -ErrorAction Stop
        Write-Host "[OK] Attached to existing host PID: $HostPid ($($targetProcess.ProcessName))" -ForegroundColor Green
    } catch {
        Write-Error "Failed to attach to process with PID $HostPid : $_"
        exit 1
    }
} elseif (-not [string]::IsNullOrEmpty($ExePath)) {
    if (-not (Test-Path $ExePath)) {
        Write-Error "Executable not found at path: $ExePath"
        exit 1
    }

    $fullExePath = (Resolve-Path $ExePath).Path
    $workDir = Split-Path -Parent $fullExePath

    $argList = ""
    if (-not $LaunchWithoutArgs) {
        $smokeDuration = [Math]::Max(5, $DurationSeconds - 2)
        $argList = "--smoke-test $smokeDuration --telemetry-file `"$internalHostJsonPath`""
        if ($Headless) {
            $argList += " --headless"
        }
        if (-not [string]::IsNullOrEmpty($ExtraArgs)) {
            $argList += " $ExtraArgs"
        }
    }

    Write-Host "[INFO] Launching: $fullExePath $argList" -ForegroundColor Yellow
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $fullExePath
    $psi.Arguments = $argList
    $psi.WorkingDirectory = $workDir
    $psi.UseShellExecute = $false
    $targetProcess = [System.Diagnostics.Process]::Start($psi)

    if ($null -eq $targetProcess) {
        Write-Error "Failed to launch host executable: $fullExePath"
        exit 1
    }

    $HostPid = $targetProcess.Id
    Write-Host "[OK] Host process launched with PID: $HostPid" -ForegroundColor Green
} else {
    Write-Error "Either -ExePath or -HostPid must be specified."
    exit 1
}

# 3. Sampling Loop for Process Tree Metrics
$samples = [System.Collections.Generic.List[PSObject]]::new()
$startTime = [DateTime]::UtcNow
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$maxRunDurationMs = ($DurationSeconds + 5) * 1000

Write-Host "[INFO] Commencing memory sampling for $DurationSeconds seconds at ${SamplingIntervalMs}ms intervals..." -ForegroundColor Cyan

while ($stopwatch.ElapsedMilliseconds -lt ($DurationSeconds * 1000)) {
    $elapsedSec = [Math]::Round($stopwatch.ElapsedMilliseconds / 1000.0, 2)
    $sampleTime = [DateTime]::UtcNow.ToString("o")

    # Refresh host process
    try {
        $targetProcess.Refresh()
        if ($targetProcess.HasExited) {
            Write-Host "[NOTE] Host process exited after $elapsedSec seconds (ExitCode: $($targetProcess.ExitCode))." -ForegroundColor Yellow
            break
        }
    } catch {
        break
    }

    $hostWs = $targetProcess.WorkingSet64
    $hostPriv = $targetProcess.PrivateMemorySize64
    $hostPeakWs = $targetProcess.PeakWorkingSet64
    $hostCpuMs = 0
    try { $hostCpuMs = [Math]::Round($targetProcess.TotalProcessorTime.TotalMilliseconds, 1) } catch { }

    $childProcs = @()
    # Discover child WebView2 processes
    try {
        $webviewProcs = Get-Process -Name "msedgewebview2" -ErrorAction SilentlyContinue
        if ($null -ne $webviewProcs) {
            foreach ($wp in $webviewProcs) {
                try {
                    $wp.Refresh()
                    $cWs = $wp.WorkingSet64
                    $cPriv = $wp.PrivateMemorySize64
                    $cPeakWs = $wp.PeakWorkingSet64
                    $cCpuMs = 0
                    try { $cCpuMs = [Math]::Round($wp.TotalProcessorTime.TotalMilliseconds, 1) } catch { }

                    $childProcs += [PSCustomObject]@{
                        pid = $wp.Id
                        name = $wp.ProcessName
                        role = "webview2-subsystem"
                        workingSetBytes = $cWs
                        workingSetMb = [Math]::Round($cWs / 1MB, 2)
                        privateMemoryBytes = $cPriv
                        privateMemoryMb = [Math]::Round($cPriv / 1MB, 2)
                        peakWorkingSetBytes = $cPeakWs
                        peakWorkingSetMb = [Math]::Round($cPeakWs / 1MB, 2)
                        cpuTimeMs = $cCpuMs
                    }
                } catch { }
            }
        }
    } catch { }

    $totalWsBytes = $hostWs
    $totalPrivBytes = $hostPriv
    foreach ($cp in $childProcs) {
        $totalWsBytes += $cp.workingSetBytes
        $totalPrivBytes += $cp.privateMemoryBytes
    }

    $sampleObj = [PSCustomObject]@{
        sampleIndex = $samples.Count + 1
        timestamp = $sampleTime
        elapsedSeconds = $elapsedSec
        hostPid = $HostPid
        processCount = 1 + $childProcs.Count
        totalWorkingSetBytes = $totalWsBytes
        totalWorkingSetMb = [Math]::Round($totalWsBytes / 1MB, 2)
        totalPrivateMemoryBytes = $totalPrivBytes
        totalPrivateMemoryMb = [Math]::Round($totalPrivBytes / 1MB, 2)
        host = [PSCustomObject]@{
            pid = $HostPid
            name = $targetProcess.ProcessName
            role = "host"
            workingSetBytes = $hostWs
            workingSetMb = [Math]::Round($hostWs / 1MB, 2)
            privateMemoryBytes = $hostPriv
            privateMemoryMb = [Math]::Round($hostPriv / 1MB, 2)
            peakWorkingSetBytes = $hostPeakWs
            peakWorkingSetMb = [Math]::Round($hostPeakWs / 1MB, 2)
            cpuTimeMs = $hostCpuMs
        }
        children = $childProcs
    }

    $samples.Add($sampleObj)
    Start-Sleep -Milliseconds $SamplingIntervalMs
}

$stopwatch.Stop()

# 4. Graceful Cleanup of Host Process
try {
    $targetProcess.Refresh()
    if (-not $targetProcess.HasExited) {
        Write-Host "[INFO] Waiting for host process to exit gracefully..."
        $exitedInTime = $targetProcess.WaitForExit(5000)
        if (-not $exitedInTime) {
            Write-Host "[WARN] Host process still running after timeout; closing gracefully..." -ForegroundColor Yellow
            $targetProcess.CloseMainWindow() | Out-Null
            Start-Sleep -Milliseconds 1500
            $targetProcess.Refresh()
            if (-not $targetProcess.HasExited) {
                Write-Host "[WARN] Force-terminating host process to complete measurement." -ForegroundColor Yellow
                $targetProcess.Kill()
            }
        }
    }

    $targetProcess.Refresh()
    if ($targetProcess.HasExited -and $targetProcess.ExitCode -ne 0) {
        Write-Host "[WARN] Host process exited with non-zero exit code: $($targetProcess.ExitCode)" -ForegroundColor Yellow
    }
} catch { }

# 5. Aggregate Statistical Computations
if ($samples.Count -eq 0) {
    Write-Error "No telemetry samples were captured."
    exit 1
}

$totalWsList = $samples | ForEach-Object { $_.totalWorkingSetMb }
$totalPrivList = $samples | ForEach-Object { $_.totalPrivateMemoryMb }
$procCountList = $samples | ForEach-Object { $_.processCount }

$avgWs = [Math]::Round(($totalWsList | Measure-Object -Average).Average, 2)
$minWs = [Math]::Round(($totalWsList | Measure-Object -Minimum).Minimum, 2)
$maxWs = [Math]::Round(($totalWsList | Measure-Object -Maximum).Maximum, 2)

$avgPriv = [Math]::Round(($totalPrivList | Measure-Object -Average).Average, 2)
$minPriv = [Math]::Round(($totalPrivList | Measure-Object -Minimum).Minimum, 2)
$maxPriv = [Math]::Round(($totalPrivList | Measure-Object -Maximum).Maximum, 2)

$maxProcCount = ($procCountList | Measure-Object -Maximum).Maximum
$finalSample = $samples[$samples.Count - 1]

# Per-process summary mapping
$uniquePids = [System.Collections.Generic.Dictionary[int, PSObject]]::new()
foreach ($s in $samples) {
    if (-not $uniquePids.ContainsKey($s.host.pid)) {
        $uniquePids[$s.host.pid] = [PSCustomObject]@{
            pid = $s.host.pid
            name = $s.host.name
            role = "host"
            maxWorkingSetMb = $s.host.workingSetMb
            maxPrivateMemoryMb = $s.host.privateMemoryMb
            latestWorkingSetMb = $s.host.workingSetMb
            latestPrivateMemoryMb = $s.host.privateMemoryMb
        }
    } else {
        $hObj = $uniquePids[$s.host.pid]
        if ($s.host.workingSetMb -gt $hObj.maxWorkingSetMb) { $hObj.maxWorkingSetMb = $s.host.workingSetMb }
        if ($s.host.privateMemoryMb -gt $hObj.maxPrivateMemoryMb) { $hObj.maxPrivateMemoryMb = $s.host.privateMemoryMb }
        $hObj.latestWorkingSetMb = $s.host.workingSetMb
        $hObj.latestPrivateMemoryMb = $s.host.privateMemoryMb
    }

    foreach ($c in $s.children) {
        if (-not $uniquePids.ContainsKey($c.pid)) {
            $uniquePids[$c.pid] = [PSCustomObject]@{
                pid = $c.pid
                name = $c.name
                role = $c.role
                maxWorkingSetMb = $c.workingSetMb
                maxPrivateMemoryMb = $c.privateMemoryMb
                latestWorkingSetMb = $c.workingSetMb
                latestPrivateMemoryMb = $c.privateMemoryMb
            }
        } else {
            $cObj = $uniquePids[$c.pid]
            if ($c.workingSetMb -gt $cObj.maxWorkingSetMb) { $cObj.maxWorkingSetMb = $c.workingSetMb }
            if ($c.privateMemoryMb -gt $cObj.maxPrivateMemoryMb) { $cObj.maxPrivateMemoryMb = $c.privateMemoryMb }
            $cObj.latestWorkingSetMb = $c.workingSetMb
            $cObj.latestPrivateMemoryMb = $c.privateMemoryMb
        }
    }
}

$processSummaries = [System.Collections.Generic.List[PSObject]]::new()
# PowerShell treats IDictionary as one scalar during foreach rather than
# enumerating KeyValuePair entries. Without GetEnumerator(), $kv.Value is
# $null and the JSON `processes` array becomes [null] even when samples
# contain valid individual PIDs.
foreach ($kv in $uniquePids.GetEnumerator()) {
    $processSummaries.Add($kv.Value)
}

# 6. Build Final JSON Artifact
$hostExitCode = 0
try {
    if ($targetProcess.HasExited) { $hostExitCode = $targetProcess.ExitCode }
} catch { }

$telemetryPayload = [PSCustomObject]@{
    schemaVersion = 1
    scenario = $Scenario
    timestamp = $startTime.ToString("o")
    durationSeconds = [Math]::Round($stopwatch.ElapsedMilliseconds / 1000.0, 2)
    hostPid = $HostPid
    hostExitCode = $hostExitCode
    summary = [PSCustomObject]@{
        avgTotalWorkingSetMb = $avgWs
        minTotalWorkingSetMb = $minWs
        maxTotalWorkingSetMb = $maxWs
        avgTotalPrivateMemoryMb = $avgPriv
        minTotalPrivateMemoryMb = $minPriv
        maxTotalPrivateMemoryMb = $maxPriv
        finalWorkingSetMb = $finalSample.totalWorkingSetMb
        finalPrivateMemoryMb = $finalSample.totalPrivateMemoryMb
        sampleCount = $samples.Count
        peakProcessCount = $maxProcCount
        note = "Working set reflects physical resident RAM (can be trimmed via Win32 EmptyWorkingSet). Private memory reflects committed unshared pages and represents genuine application heap/memory burden."
    }
    processes = $processSummaries
    samples = $samples
}

$telemetryJson = $telemetryPayload | ConvertTo-Json -Depth 6
$telemetryJson | Out-File -FilePath $telemetryJsonPath -Encoding utf8

# 7. Build Human-Readable Text Summary
$summaryText = @"
================================================================================
TizenTube Windows - Performance & Memory Telemetry Audit
================================================================================
Timestamp (UTC): $($startTime.ToString("o"))
Scenario:        $Scenario
Duration:        $([Math]::Round($stopwatch.ElapsedMilliseconds / 1000.0, 2)) seconds ($($samples.Count) samples)
Host Process:    PID $HostPid ($($targetProcess.ProcessName))
Max Process Count: $maxProcCount processes (Host + WebView2 subsystems)

--------------------------------------------------------------------------------
COMBINED PROCESS TREE MEMORY METRICS
--------------------------------------------------------------------------------
Metric                  Average (MB)   Minimum (MB)   Maximum (MB)   Final (MB)
--------------------------------------------------------------------------------
Total Working Set (RAM) $("{0,12}" -f $avgWs)   $("{0,12}" -f $minWs)   $("{0,12}" -f $maxWs)   $("{0,10}" -f $finalSample.totalWorkingSetMb)
Total Private Memory    $("{0,12}" -f $avgPriv)   $("{0,12}" -f $minPriv)   $("{0,12}" -f $maxPriv)   $("{0,10}" -f $finalSample.totalPrivateMemoryMb)

--------------------------------------------------------------------------------
PER-PROCESS BREAKDOWN (BY PID)
--------------------------------------------------------------------------------
PID       Role               Name             Peak WS (MB)  Peak Private (MB)
--------------------------------------------------------------------------------
"@

foreach ($p in $processSummaries) {
    $summaryText += "$("{0,-8}" -f $p.pid)  $("{0,-17}" -f $p.role)  $("{0,-15}" -f $p.name)  $("{0,11}" -f $p.maxWorkingSetMb)  $("{0,17}" -f $p.maxPrivateMemoryMb)`r`n"
}

$summaryText += @"
--------------------------------------------------------------------------------
DIAGNOSTIC ARCHITECTURE NOTES:
1. Working Set vs Private Memory:
   EmptyWorkingSet unmaps physical pages to pagefile, lowering Working Set
   temporarily during idle or minimize. Private Memory (Committed Bytes) is NOT
   paged out artificially and reflects true application heap footprint.
2. Single Renderer Constraint:
   --renderer-process-limit=1 restricts Chromium to a single web content process.
3. Network-Level AdBlock:
   Blocks ad queries at WebResourceRequested before renderer DOM processing.
================================================================================
"@

$summaryText | Out-File -FilePath $summaryTxtPath -Encoding utf8

Write-Host "`n$summaryText" -ForegroundColor Green
Write-Host "[OK] Full JSON telemetry saved to: $telemetryJsonPath" -ForegroundColor Green
Write-Host "[OK] Summary report saved to:      $summaryTxtPath" -ForegroundColor Green
