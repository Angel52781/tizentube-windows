param(
    [Parameter(Mandatory=$true)][string]$Executable
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path 'assets/TizenTube.ico').Path
$target = (Resolve-Path $Executable).Path
$sidecar = Join-Path (Split-Path $target -Parent) 'TizenTube.ico'
if (!(Test-Path $sidecar)) { throw 'OFFICIAL_ICON_SIDECAR_MISSING' }
if ((Get-FileHash $source -Algorithm SHA256).Hash -ne
    (Get-FileHash $sidecar -Algorithm SHA256).Hash) {
    throw 'OFFICIAL_ICON_SIDECAR_MISMATCH'
}

Add-Type -AssemblyName System.Drawing
$size = [System.Drawing.Size]::new(32, 32)
$expectedIcon = [System.Drawing.Icon]::new($source, $size)
$actualIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($target)
if ($null -eq $actualIcon) { throw 'OFFICIAL_EXE_ICON_MISSING' }
$expected = $expectedIcon.ToBitmap()
$actual = $actualIcon.ToBitmap()
try {
    if ($expected.Width -ne $actual.Width -or $expected.Height -ne $actual.Height) {
        throw 'OFFICIAL_EXE_ICON_SIZE_MISMATCH'
    }
    $coral = 0
    for ($y = 0; $y -lt $expected.Height; $y++) {
        for ($x = 0; $x -lt $expected.Width; $x++) {
            $a = $expected.GetPixel($x, $y)
            $b = $actual.GetPixel($x, $y)
            if ($a.ToArgb() -ne $b.ToArgb()) {
                throw "OFFICIAL_EXE_ICON_PIXEL_MISMATCH at $x,$y"
            }
            if ($b.R -gt 160 -and $b.G -lt 160 -and $b.R -gt ($b.B + 45)) {
                $coral++
            }
        }
    }
    if ($coral -lt 3) { throw 'OFFICIAL_EXE_ICON_CORAL_SEGMENT_MISSING' }
    Write-Host "[PASS] Official TizenTube ICO matches executable PE icon and sidecar ($coral coral pixels at 32px)"
}
finally {
    $expected.Dispose()
    $actual.Dispose()
    $expectedIcon.Dispose()
    $actualIcon.Dispose()
}
