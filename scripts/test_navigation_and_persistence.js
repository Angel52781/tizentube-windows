#!/usr/bin/env node
/** Regression for real masthead Back and native-authoritative restart prefs. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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

  let backCount = 0;
  const nodes = new Map();
  function node(id) {
    const handlers = {};
    const obj = {
      id, handlers, isConnected: true, parentElement: null, firstChild: null,
      nextSibling: null, setAttribute() {}, appendChild(child) { child.parentElement = this; },
      addEventListener(name, cb) { handlers[name] = cb; },
      querySelector(name) { return name === '#guide-button' ? guide : null; },
      insertBefore(child) { child.parentElement = this; nodes.set(child.id, child); },
      remove() { nodes.delete(this.id); }
    };
    return obj;
  }
  const masthead = node('start');
  const guide = node('guide-button');
  const listeners = new Map();
  const document = {
    body: {}, querySelector: s => s === 'ytd-masthead #start' ? masthead : null,
    getElementById: id => nodes.get(id) ?? null,
    createElement: id => node(id), createElementNS: (ns,id) => node(id)
  };
  const history = { length: 2, back() { backCount++; } };
  const window = { history, addEventListener: (e, fn) => listeners.set(e, fn),
    removeEventListener: e => listeners.delete(e) };
  const context = { window, document, setInterval: () => 12, clearInterval() {},
    setTimeout: fn => { fn(); return 1; }, MutationObserver: class {
      observe() {} disconnect() {}
    } };
  vm.runInNewContext(readFileSync(new URL('../src/native/navigation_controls.js', import.meta.url), 'utf8'), context);
  const back = document.getElementById('tizentube-masthead-back');
  assert.ok(back, 'Back control appears in the real YouTube masthead');
  assert.equal(back.parentElement, masthead);
  assert.equal(typeof back.handlers.click, 'function');
  back.handlers.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(backCount, 1, 'button navigates browser SPA history (not YouTube Home)');
  window.__ttNavigationControls.stop();
  assert.equal(document.getElementById('tizentube-masthead-back'), null,
    'control can be removed cleanly on document unload');
  console.log('All 9/9 native preferences and YouTube masthead Back tests PASSED.');
} finally {
  if (originalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalStorage;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}
