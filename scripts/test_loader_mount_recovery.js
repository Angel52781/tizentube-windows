#!/usr/bin/env node
/** Regression: DOMContentLoaded can be missed in WebView2's YouTube SPA. */
import assert from 'node:assert/strict';
import { ModLoader } from '../src/mods/mod_loader.js';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const events = new Map();
let viewingMounts = 0;
let uiMounts = 0;
let ipcMounts = 0;
try {
  globalThis.document = { body: null };
  globalThis.window = {
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: name => events.delete(name)
  };
  const loader = Object.create(ModLoader.prototype);
  loader.initialized = false;
  loader._mountRetryTimer = null;
  loader._mountAttempts = 0;
  loader._mountEventHandler = null;
  loader._viewingMountReported = false;
  loader.adblock = { install() {} };
  loader.playback = { on() {} };
  loader.viewing = { mounted: false, mount() { viewingMounts++; this.mounted = true; } };
  loader.ui = { isMounted: false, mount() {
    uiMounts++;
    if (uiMounts === 1) throw new Error('Temporary custom interface error');
    this.isMounted = true;
  } };
  loader.ipc = { on() {}, send(channel) {
    if (channel === 'viewing:mounted') ipcMounts++;
  } };
  loader.getStatus = () => ({});
  loader.bootstrap();
  assert.equal(loader.viewing.mounted, false, 'No mount before document.body exists');
  assert.ok(events.has('DOMContentLoaded'));
  // Simulate a missed DOMContentLoaded event. The bounded retry must still
  // mount ViewingExperience independently, even if optional AppUI fails.
  globalThis.document.body = {};
  await new Promise(resolve => setTimeout(resolve, 1020));
  assert.equal(viewingMounts, 1, 'Native playback experience mounted once');
  assert.equal(loader.viewing.mounted, true);
  assert.equal(uiMounts, 2, 'An independent retry recovered the optional UI');
  assert.equal(loader.ui.isMounted, true);
  assert.equal(ipcMounts, 1, 'Mount success reported once');
  assert.equal(loader._mountRetryTimer, null, 'Retry stops after successful initialization');
  console.log('All 7/7 missed DOMContentLoaded and independent UI recovery checks PASSED.');
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}
