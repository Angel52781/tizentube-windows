#!/usr/bin/env node
/** Regression for native browser toolbar and authoritative restart prefs. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AppUI } from '../src/ui/app_ui.js';

const store = new Map();
const originalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;
try {
  globalThis.localStorage = {
    getItem: k => store.get(k) ?? null,
    setItem: (k,v) => store.set(k,v)
  };
  store.set('tizentube_settings', JSON.stringify({ ui: { highContrast: false } }));
  globalThis.window = { __TIZENTUBE_INITIAL_PREFERENCES__: {
    channel: 'preferences:save', payload: { ui: { highContrast: true },
      sponsorblock: { autoSkip: false }, playback: { defaultSpeed: 1.5 } }
  } };
  const applied = [];
  const ui = Object.create(AppUI.prototype);
  ui.settingsModal = { loadSettings: x => applied.push({ restored: x }) };
  ui.applySettings = x => applied.push({ applied: x });
  ui.loadPersistedPreferences();
  assert.equal(applied[0].restored.ui.highContrast, true,
    'Windows disk preference wins over stale YouTube localStorage');
  assert.equal(applied[1].applied.playback.defaultSpeed, 1.5);
  assert.equal(JSON.parse(store.get('tizentube_settings')).sponsorblock.autoSkip, false,
    'reconciled web origin store matches persisted Windows settings');

  delete globalThis.window.__TIZENTUBE_INITIAL_PREFERENCES__;
  applied.length = 0;
  ui.loadPersistedPreferences();
  assert.equal(applied[0].restored.ui.highContrast, true,
    'offline/localStorage-only mode still loads the last valid settings');

  const host = readFileSync(new URL('../src/native/TizenTubeHost.cs', import.meta.url), 'utf8');
  const toolbar = readFileSync(new URL('../src/native/NavigationToolbar.cs', import.meta.url), 'utf8');
  const project = readFileSync(new URL('../src/native/TizenTubeWindows.csproj', import.meta.url), 'utf8');
  assert.ok(host.includes('SetupNavigationToolbar()'), 'Host creates native toolbar');
  assert.ok(host.includes('CoreWebView2.GoBack()'), 'Back invokes native WebView2 history');
  assert.ok(host.includes('CoreWebView2?.Reload()'), 'Reload invokes native WebView2 reload');
  assert.ok(host.includes('CoreWebView2.HistoryChanged'), 'Back enablement responds to SPA navigation');
  assert.ok(host.includes('UpdateNavigationToolbarVisibility()'), 'Fullscreen/PiP preserve unobstructed video');
  assert.ok(toolbar.includes('Atrás (Alt + ←)') && toolbar.includes('Recargar (Ctrl + R)'),
    'Native control tooltips identify browser actions');
  assert.ok(toolbar.includes('SetBackEnabled(false)'), 'Back starts disabled without history');
  assert.ok(!host.includes('ReadEmbeddedRequired("TizenTube.NavigationControls")'),
    'YouTube masthead back overlay is no longer injected');
  assert.ok(!project.includes('TizenTube.NavigationControls'),
    'Native package cannot embed obsolete masthead overlay');
  console.log('PASS persisted preferences and native Back/Reload toolbar wiring (Windows E2E validates actual click).');
} finally {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}
