// GPL-3.0-only. Source-level invariants, not a replacement for Windows E2E.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const host = fs.readFileSync('src/native/TizenTubeHost.cs', 'utf8');
const updater = fs.readFileSync('src/native/PortableUpdater.cs', 'utf8');
const toolbar = fs.readFileSync('src/native/NavigationToolbar.cs', 'utf8');
const project = fs.readFileSync('src/native/TizenTubeWindows.csproj', 'utf8');
const ci = fs.readFileSync('.github/workflows/windows-native-validation.yml', 'utf8');
const loader = fs.readFileSync('src/mods/mod_loader.js', 'utf8');
const preview = '0.1.0-preview.14';

assert.ok(project.includes('<Version>' + preview + '</Version>'));
assert.ok(ci.includes('TizenTube-Windows-x64-v' + preview + '.zip'));
assert.ok(updater.includes('api.github.com/repos/Angel52781/tizentube-windows/releases'));
assert.ok(updater.includes('SHA256SUMS.txt') && updater.includes('FileSha256(archive) != sha'));
assert.ok(updater.includes('MessageBoxButtons.YesNo'));
assert.ok(updater.includes('File.Copy(Application.ExecutablePath, helper'));
assert.ok(updater.includes('Directory.Move(backup, install)'));
assert.ok(updater.includes('LEEME_INSTALACION.md'));
assert.ok(toolbar.includes('openProtections?.Invoke()') && toolbar.includes('checkUpdates?.Invoke()'));
assert.ok(host.includes('ShowProtectionsAsync') && host.includes('__TIZENTUBE_LOADER__'));
assert.ok(loader.includes('this._fallbackVideoHandler') && loader.includes('this.sponsorblock.setVideo(id)'));
assert.ok(host.includes('WmNcCalcSize') && host.includes('m.Result = IntPtr.Zero'));
assert.ok(host.includes('maximizedClientFillsWorkArea'));
console.log('All 13/13 native updater and protection source contract checks PASSED.');
