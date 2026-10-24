#!/usr/bin/env node
// Prevent the bug that ended real video playback when an ad CSS class lingered.
import assert from 'node:assert/strict';
import { AdBlockBase } from '../src/mods/adblock_base.js';

const originals = {
  document: globalThis.document,
  MutationObserver: globalThis.MutationObserver,
  requestAnimationFrame: globalThis.requestAnimationFrame
};
let observer;
let skipClicks = 0;
const video = { currentTime: 31, duration: 300, muted: false, playbackRate: 1 };
try {
  globalThis.document = {
    body: {},
    querySelector(selector) {
      if (selector === 'video.html5-main-video' || selector === 'video') return video;
      if (selector === '#movie_player') return {
        classList: { contains: className => className === 'ad-showing' }
      };
      return null;
    }
  };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = callback => callback();

  const blocker = new AdBlockBase({ enabled: true, autoSkipVideoAds: true });
  blocker.startAutoSkipObserver();
  assert.ok(observer, 'Player ad observer is installed');
  observer.callback();
  assert.equal(video.currentTime, 31, 'Real video must not seek to its end on ad CSS alone');
  assert.equal(video.playbackRate, 1, 'Real video speed must not be changed');
  assert.equal(video.muted, false, 'Real video must not be muted');

  const oldQuery = globalThis.document.querySelector;
  globalThis.document.querySelector = selector =>
    selector === '.ytp-ad-skip-button'
      ? { click() { skipClicks++; } }
      : oldQuery(selector);
  observer.callback();
  assert.equal(skipClicks, 1, 'A real visible Skip Ad button can be clicked once');
  assert.equal(video.currentTime, 31, 'Clicking Skip Ad must not jump the real video to the end');
  blocker.stopAutoSkipObserver();
  console.log('PASS ad CSS never destroys legitimate video; genuine Skip Ad remains usable');
} finally {
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
}
