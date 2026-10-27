# GPL-3.0-only. Vendor only the publicly released, SHA256-pinned open source
# Edge MV3 archive; never execute its release tooling on CI or the user's PC.
param(
  [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
$version = '2026.1026.1812'
$sha256 = '12a3be6e4c24c932677208bd0b8fff0689676ef2b0db689cfe794b02e0ed69fc'
$filename = "uBOLite_$version.edge.zip"
$url = "https://github.com/uBlockOrigin/uBOL-home/releases/download/$version/$filename"
$archive = Join-Path $env:RUNNER_TEMP $filename
if (Test-Path $Destination) { throw 'UBOL_DESTINATION_ALREADY_EXISTS' }
Invoke-WebRequest -Uri $url -OutFile $archive -MaximumRedirection 5
$actual = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $sha256) { throw "UBOL_UPSTREAM_HASH_MISMATCH:$actual" }
New-Item -Path $Destination -ItemType Directory -Force | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $Destination
$manifest = Join-Path $Destination 'manifest.json'
$license = Join-Path $Destination 'LICENSE.txt'
if (!(Test-Path $manifest) -or !(Test-Path $license)) { throw 'UBOL_MANIFEST_OR_LICENSE_MISSING' }
$meta = Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
if ($meta.manifest_version -ne 3 -or $meta.version -ne $version -or
    !$meta.declarative_net_request.rule_resources) { throw 'UBOL_UNEXPECTED_MANIFEST' }
if (!(Test-Path (Join-Path $Destination 'easylist.json'))) {
    throw 'UBOL_EASYLIST_RULESET_MISSING'
}
Write-Host "UBOL_PACKAGE_VERIFIED version=$version sha256=$sha256"
