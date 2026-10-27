# GPL-3.0-only. Isolated diagnostic candidate, never a production install.
param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
$version = 'v5.5.3.3'
$sha256 = '20d51050319578a425d3df3de8456635083d9cee98954031057abac2ec364dc0'
$url = "https://github.com/AdguardTeam/AdguardBrowserExtension/releases/download/$version/edge-mv3.zip"
$archive = Join-Path $env:RUNNER_TEMP 'adguard-edge-mv3-5.5.3.3.zip'
if (Test-Path $Destination) { throw 'ADGUARD_TRIAL_DESTINATION_EXISTS' }
Invoke-WebRequest -Uri $url -OutFile $archive -MaximumRedirection 5
$actual = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $sha256) { throw "ADGUARD_TRIAL_BAD_ARCHIVE_SHA256:$actual" }
New-Item -ItemType Directory -Path $Destination | Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath $Destination
$manifest = Get-Content (Join-Path $Destination 'manifest.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne '5.5.3.3' -or $manifest.manifest_version -ne 3 -or
    !$manifest.declarative_net_request.rule_resources -or
    !$manifest.host_permissions.Contains('<all_urls>')) {
  throw 'ADGUARD_TRIAL_MANIFEST_UNEXPECTED'
}
# Upstream AdGuard Browser Extension is GPL-3.0: preserve attribution and
# its license even though this upstream binary release omits LICENSE.
Copy-Item LICENSE (Join-Path $Destination 'LICENSE')
@'
AdGuard Browser Extension — official Edge MV3 v5.5.3.3
Source: https://github.com/AdguardTeam/AdguardBrowserExtension
Release: https://github.com/AdguardTeam/AdguardBrowserExtension/releases/tag/v5.5.3.3
License: GPL-3.0, text included as LICENSE
SHA256 original edge-mv3.zip: 20d51050319578a425d3df3de8456635083d9cee98954031057abac2ec364dc0
This is an isolated test addon; do not install alongside uBOL in production.
'@ | Set-Content (Join-Path $Destination 'ORIGIN.txt')
Write-Host 'ADGUARD_MV3_TRIAL_VERIFIED version=5.5.3.3'
