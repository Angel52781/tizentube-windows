#!/usr/bin/env node
/**
 * TizenTube Windows - DOM-created startup and SponsorBlock navigation regression.
 * Copyright (C) 2026 TizenTube Windows Contributors
 * GPL-3.0-only
 */
import assert from 'node:assert/strict';
import { PlaybackEngine } from '../src/runtime/playback_engine.js';
import { SponsorBlockBase } from '../src/mods/sponsorblock_base.js';
import { AdBlockBase } from '../src/mods/adblock_base.js';

let assertions = 0;
const check = (value, message) => { assert.ok(value, message); assertions++; };

// The native WebView2 host injects JavaScript at document creation, before
// <body> exists. Once YouTube loads, the player may be created via SPA.
const savedDoc = globalThis.document;
const savedWindow = globalThis.window;
const savedObserver = globalThis.MutationObserver;
const savedRaf = globalThis.requestAnimationFrame;
const listeners = new Map();
let observer;
let currentVideo = null;
class FakeMutationObserver {
  constructor(callback) { this.callback = callback; observer = this; }
  observe(target, opts) { this.target = target; this.options = opts; }
  disconnect() { this.disconnected = true; }
}
const videoListeners = new Map();
const video = {
  duration: 120, currentTime: 30, playbackRate: 1, volume: 1, muted: false,
  addEventListener(name, cb) { videoListeners.set(name, cb); },
  removeEventListener(name) { videoListeners.delete(name); }
};
try {
  globalThis.document = {
    body: null,
    querySelector(selector) { return selector.startsWith('video') ? currentVideo : null; },
    addEventListener() {}, removeEventListener() {}
  };
  globalThis.window = {
    addEventListener(name, cb) { listeners.set(name, cb); },
    removeEventListener(name, cb) { if (listeners.get(name) === cb) listeners.delete(name); }
  };
  globalThis.MutationObserver = FakeMutationObserver;
  globalThis.requestAnimationFrame = cb => cb();

  const playback = new PlaybackEngine();
  check(playback.videoObserver === null, 'Observer cannot attach before document.body');
  check(listeners.has('DOMContentLoaded'), 'Must schedule a deferred DOM attachment');
  globalThis.document.body = { nodeType: 1 };
  listeners.get('DOMContentLoaded')();
  check(observer?.target === globalThis.document.body, 'Must observe the persistent body');
  currentVideo = video;
  observer.callback([]);
  check(playback.videoElement === video, 'Must bind a player created after DOMContentLoaded');
  let seen = null;
  playback.on('timeupdate', evt => { seen = evt.currentTime; });
  videoListeners.get('timeupdate')();
  check(seen === 30, 'Late-created player must propagate playback time for SponsorBlock');
  playback.dispose();
  check(observer.disconnected, 'Dispose must release the observer');
} finally {
  if (savedDoc === undefined) delete globalThis.document; else globalThis.document = savedDoc;
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
  if (savedObserver === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = savedObserver;
  if (savedRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = savedRaf;
}

// A previous video's slower SponsorBlock API reply must never provide skip
// segments to a different YouTube video after SPA navigation.
const sb = new SponsorBlockBase();
const pending = new Map();
sb.fetchSegments = videoId => new Promise(resolve => pending.set(videoId, resolve));
const first = sb.setVideo('AAAAAAAAAAA');
const second = sb.setVideo('BBBBBBBBBBB');
pending.get('BBBBBBBBBBB')([{ segment: [20, 40], category: 'sponsor', uuid: 'B' }]);
await second;
pending.get('AAAAAAAAAAA')([{ segment: [20, 40], category: 'sponsor', uuid: 'A' }]);
await first;
check(sb.currentSegments[0]?.uuid === 'B', 'Stale API response must not replace current sponsor segments');
sb.setEnabled(false);
check(sb.currentSegments.length === 0, 'Disabling SponsorBlock clears active skips');

// Response.json() is implemented by the browser and does not necessarily
// call the page's JSON.parse replacement. Modern desktop YouTube uses this
// path for player ad metadata.
const blocker = new AdBlockBase({ cosmeticFilter: false, autoSkipVideoAds: false });
const nativeResponseJson = Response.prototype.json;
blocker.install();
try {
  const player = new Response(JSON.stringify({ adPlacements: [{ ad: true }], videoDetails: { title: 'sample' } }));
  Object.defineProperty(player, 'url', { value: 'https://www.youtube.com/youtubei/v1/player?key=test' });
  const filtered = await player.json();
  check(!('adPlacements' in filtered), 'YouTube desktop player Response.json must filter ad metadata');
  check(filtered.videoDetails.title === 'sample', 'Player metadata must survive ad filtering');

  const account = new Response(JSON.stringify({ adPlacements: [1], account: 'do not touch' }));
  Object.defineProperty(account, 'url', { value: 'https://accounts.google.com/api/sessions' });
  const untouched = await account.json();
  check(Array.isArray(untouched.adPlacements), 'Account API responses must not be modified');

  blocker.setEnabled(false);
  const disabled = new Response(JSON.stringify({ adPlacements: [1] }));
  Object.defineProperty(disabled, 'url', { value: 'https://www.youtube.com/youtubei/v1/player' });
  check(Array.isArray((await disabled.json()).adPlacements), 'Disabling AdBlock must stop filtering');
} finally {
  blocker.dispose();
}
check(Response.prototype.json === nativeResponseJson, 'Disposing AdBlock restores native Response.json');

console.log(`All ${assertions}/${assertions} WebView2 startup and SponsorBlock lifecycle regression checks PASSED.`);
