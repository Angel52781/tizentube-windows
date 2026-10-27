#!/usr/bin/env node
// GPL-3.0-only. uBOL stays sole content blocker; optional helper clicks only
// YouTube's actual, enabled Skip Ad control while an ad is being shown.
import assert from 'node:assert/strict';
import { AdBlockBase } from '../src/mods/adblock_base.js';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalObserver = globalThis.MutationObserver;
const originalParse = JSON.parse;
const callbacks = [];
let clicked = 0;
let adPlaying = false;
let skipEnabled = true;
let skipVisible = true;
const skip = {
  click() { clicked++; },
  get disabled() { return !skipEnabled; },
  getAttribute() { return null; },
  getClientRects() { return skipVisible ? [{ x: 0 }] : []; }
};
class MockObserver {
  constructor(callback) { callbacks.push(callback); }
  observe() {}
  disconnect() {}
}
let blocker;
try {
  globalThis.window = { __TT_EXTERNAL_ADBLOCK__: 'uBlock Origin Lite' };
  globalThis.MutationObserver = MockObserver;
  globalThis.document = {
    body: {},
    getElementById() { return null; },
    querySelector(selector) {
      if (selector.includes('ad-showing')) return adPlaying ? {} : null;
      if (selector.includes('skip')) return skip;
      return null;
    }
  };
  blocker = new AdBlockBase();
  blocker.install();
  assert.equal(blocker.isHooked, false);
  assert.equal(JSON.parse, originalParse);
  assert.equal(blocker.skipObserver !== null, true);
  assert.equal(blocker.getStats().externalAdSkipOnly, true);
  assert.equal(clicked, 0, 'normal video must not activate skip');

  adPlaying = true;
  skipEnabled = false;
  callbacks[0]();
  await new Promise(resolve => setTimeout(resolve, 85));
  assert.equal(clicked, 0, 'disabled skip is not clicked');

  skipEnabled = true;
  skipVisible = false;
  callbacks[0]();
  await new Promise(resolve => setTimeout(resolve, 85));
  assert.equal(clicked, 0, 'hidden skip is not clicked');

  skipVisible = true;
  callbacks[0]();
  await new Promise(resolve => setTimeout(resolve, 85));
  assert.equal(clicked, 1, 'enabled skip on active ad is clicked');
  assert.equal(blocker.getStats().adSkipAttempts, 1);
  assert.equal(blocker.getStats().blockedCount, 0,
    'an attempted click must not be reported as a blocked ad');
  callbacks[0]();
  await new Promise(resolve => setTimeout(resolve, 85));
  assert.equal(clicked, 1, 'rapid mutations do not spam Skip button');

  blocker.options.autoSkipVideoAds = false;
  blocker._lastAdSkipAttemptAt = 0;
  callbacks[0]();
  await new Promise(resolve => setTimeout(resolve, 85));
  assert.equal(clicked, 1, 'user preference can disable auto-skip');
  blocker.dispose();
  assert.equal(blocker._adSkipPoll, null);
  assert.equal(blocker.skipObserver, null);
  console.log('External ad skip: detection, visibility, enabled state, throttling, stats and cleanup PASS');
} finally {
  blocker?.dispose();
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.MutationObserver = originalObserver;
}
