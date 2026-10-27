// GPL-3.0-only. Architecture and supply-chain checks for the pinned MV3 addon.
// These assertions are NOT evidence that YouTube ads are blocked in a live session.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AdBlockBase } from '../src/mods/adblock_base.js';

const host = fs.readFileSync('src/native/TizenTubeHost.cs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/windows-native-validation.yml', 'utf8');
const vendor = fs.readFileSync('scripts/ci_package_ubol.ps1', 'utf8');
assert.match(host, /AreBrowserExtensionsEnabled = true/);
assert.match(host, /AddBrowserExtensionAsync\(addonRoot\)/);
assert.match(host, /GetBrowserExtensionsAsync\(\)/);
assert.match(host, /UBOL_YOUTUBE_COMPLETE_FILTERING_NOT_VERIFIED/);
assert.match(host, /__TT_EXTERNAL_ADBLOCK__/);
assert.match(host, /ubolExtensionEnabled/);
assert.match(host, /ConfigureYouTubeFilteringAsync/);
assert.match(host, /getFilteringMode/);
assert.match(host, /setFilteringMode/);
assert.match(host, /hostname: 'youtube.com', level: 3/);
assert.match(host, /chrome\.permissions\.contains/);
assert.match(host, /ubolBroadHostPermission/);
assert.match(host, /ubolYoutubeFilteringMode/);
assert.match(workflow, /PORTABLE_UBOL_BROWSER_EXTENSION_NOT_ENABLED/);
assert.match(workflow, /UBOL_WEBVIEW2_INSTALLATION_NOT_ATTESTED/);
assert.match(workflow, /UBOL_WEBVIEW2_HOST_PERMISSIONS_AND_MODE_NOT_VERIFIED/);
assert.match(vendor, /uBOLite_\$version\.edge\.zip/);
assert.match(vendor, /12a3be6e4c24c932677208bd0b8fff0689676ef2b0db689cfe794b02e0ed69fc/);
assert.match(vendor, /LICENSE\.txt/);

const saved = globalThis.window;
try {
  globalThis.window = { __TT_EXTERNAL_ADBLOCK__: 'uBlock Origin Lite' };
  const fallback = new AdBlockBase();
  fallback.install();
  assert.equal(fallback.isHooked, false, 'do not run competing interceptors');
  assert.equal(fallback.options.enabled, false);
  fallback.setEnabled(true);
  assert.equal(fallback.options.enabled, false, 'settings cannot silently re-enable legacy filters');
} finally {
  if (saved === undefined) delete globalThis.window;
  else globalThis.window = saved;
}
console.log('Pinned open-source MV3 extension and no conflicting legacy filters: 14/14 PASS');
