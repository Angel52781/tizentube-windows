#!/usr/bin/env node
// GPL-3.0-only. Proves that a changed YouTube SPA URL triggers a segment
// request and the active HTML5 video is sought even without timeupdate.
import assert from 'node:assert/strict';
import { ModLoader } from '../src/mods/mod_loader.js';
import { SponsorBlockBase } from '../src/mods/sponsorblock_base.js';

const previousWindow = globalThis.window;
const previousDocument = globalThis.document;
const previousFetch = globalThis.fetch;
const listeners = new Map();
const video = { currentTime: 1, readyState: 4 };
let calls = 0, skipNotices = 0;
let loader;
try {
  globalThis.window = {
    location: { href: 'https://www.youtube.com/' },
    addEventListener: (event, handler) => listeners.set(event, handler),
    removeEventListener: event => listeners.delete(event)
  };
  globalThis.document = {
    body: null, querySelector: selector =>
      selector === 'video.html5-main-video' ? video : null
  };
  globalThis.fetch = async url => {
    calls++;
    assert.ok(url.includes('videoID=ifI_fwg55k8'));
    return {
      ok: true,
      json: async () => [{
        UUID: 'sponsor-test-uuid',
        category: 'intro', actionType: 'skip',
        segment: [0, 2.811777]
      }]
    };
  };
  loader = Object.create(ModLoader.prototype);
  loader.initialized = false;
  loader._mountRetryTimer = null;
  loader._mountAttempts = 0;
  loader._mountEventHandler = null;
  loader._viewingMountReported = false;
  loader.adblock = { install() {} };
  loader.playback = {
    videoElement: video, on() {},
    seekTo(time) { video.currentTime = time; }
  };
  loader.viewing = { mounted: false, mount() {} };
  loader.sponsorblock = new SponsorBlockBase();
  loader.dearrow = {};
  loader.ipc = { on() {}, send() {} };
  loader.getStatus = () => ({});
  loader.ui = {
    isMounted: true,
    currentVideoId: null,
    _checkUrl() {
      const id = globalThis.window.location.href.match(/[?&]v=([\w-]{11})/)?.[1];
      if (id && id !== this.currentVideoId) {
        this.currentVideoId = id;
        void loader.sponsorblock.setVideo(id);
      }
    },
    handleSponsorBlockSkip(info) {
      skipNotices++;
      loader.playback.seekTo(info.targetTime);
    }
  };
  loader.bootstrap();
  assert.equal(calls, 0, 'Home page must not query SponsorBlock');

  // Emulate a YouTube history.pushState without yt-navigate-finish.
  globalThis.window.location.href = 'https://www.youtube.com/watch?v=ifI_fwg55k8';
  loader._fallbackVideoHandler();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(loader.sponsorblock.getStats().lastFetchStatus, 'segments_found');
  assert.equal(loader.sponsorblock.currentSegments.length, 1);
  loader._fallbackVideoHandler();
  assert.equal(video.currentTime, 2.811777, 'The active playing video must seek');
  assert.equal(loader.sponsorblock.skipCount, 1);
  assert.equal(skipNotices, 1);
  loader._fallbackVideoHandler();
  assert.equal(skipNotices, 1, 'Repeated timer must not skip same UUID twice');
  assert.equal(calls, 1, 'No duplicate fetch on unchanged video');
  console.log('SponsorBlock SPA navigation, API, seek and deduplication: 6/6 PASS');
} finally {
  if (loader?._fallbackVideoTimer) clearInterval(loader._fallbackVideoTimer);
  if (loader?._mountRetryTimer) clearTimeout(loader._mountRetryTimer);
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  globalThis.fetch = previousFetch;
}
