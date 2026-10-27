// GPL-3.0-only. Source-level invariants, not a replacement for Windows E2E.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const host = fs.readFileSync('src/native/TizenTubeHost.cs', 'utf8');
const updater = fs.readFileSync('src/native/PortableUpdater.cs', 'utf8');
const toolbar = fs.readFileSync('src/native/NavigationToolbar.cs', 'utf8');
const project = fs.readFileSync('src/native/TizenTubeWindows.csproj', 'utf8');
const ci = fs.readFileSync('.github/workflows/windows-native-validation.yml', 'utf8');
const loader = fs.readFileSync('src/mods/mod_loader.js', 'utf8');
const preview = '0.1.0-preview.20';

assert.ok(project.includes('<Version>' + preview + '</Version>'));
assert.ok(ci.includes('TizenTube-Windows-x64-v' + preview + '.zip'));
assert.ok(updater.includes('api.github.com/repos/Angel52781/tizentube-windows/releases'));
assert.ok(updater.includes('SHA256SUMS.txt') && updater.includes('FileSha256(archive) != sha'));
assert.ok(updater.includes('MessageBoxButtons.YesNo'));
assert.ok(updater.includes('StageUpdaterHost(installed, helperDirectory)'));
assert.ok(updater.includes('File.Copy(source, target, false)'));
assert.ok(updater.includes('TizenTubeHost.runtimeconfig.json'));
assert.ok(updater.includes('VerifyDetachedUpdaterHost'));
assert.ok(updater.includes('VerifyInPlaceUpdate') && host.includes('--verify-in-place-updater'),
  'Windows tests exercise replacement in a renamed folder');
assert.ok(updater.includes('IsPortableInstallation(installed)') &&
  !updater.includes('Process.Start(new ProcessStartInfo(zipUrl)'),
  'Never redirect users to ZIP downloads because of a renamed install folder');
assert.ok(updater.includes('ProgressBar') && updater.includes('Descargando...'),
  'Download progress stays in the app');
assert.ok(host.includes('--verify-detached-updater-host'));
assert.ok(updater.includes('Directory.Move(backup, install)'));
assert.ok(updater.includes('LEEME_INSTALACION.md'));
assert.ok(toolbar.includes('openProtections?.Invoke()') && toolbar.includes('checkUpdates?.Invoke()'));
assert.ok(host.includes('ShowProtectionsAsync') && host.includes('__TIZENTUBE_LOADER__'));
assert.ok(loader.includes('this._fallbackVideoHandler') && loader.includes('this.sponsorblock.setVideo(id)'));
assert.ok(!host.includes('m.Msg == WmNcCalcSize') &&
  !host.includes('cp.Style |= WsSysMenu | WsMinimizeBox | WsMaximizeBox | WsThickFrame'));
assert.ok(host.includes('maximizedClientFillsWorkArea'));
console.log('All 17/17 native updater and protection source contract checks PASSED.');
