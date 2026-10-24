#!/usr/bin/env node
/** Regressions for restore, theater and native video PiP. GPL-3.0-only. */
import assert from 'node:assert/strict';
import { ViewingExperience } from '../src/runtime/viewing_experience.js';

const originals = Object.fromEntries(['window','document','location','localStorage','sessionStorage','MutationObserver']
  .map(name => [name, globalThis[name]]));
const local = new Map();
const session = new Map();
const events = new Map();
const videoId = 'a1b2C3d4E5f';
let redirected = null;
let theaterClicks = 0;
let nativePipRequests = 0;
const player = { currentTime: 123, duration: 1800, requestPictureInPicture() {
  nativePipRequests++;
  return Promise.resolve();
}};
const flexy = { theater: false, hasAttribute(k) { return k === 'theater' && this.theater; } };
const theaterButton = { click() { flexy.theater = !flexy.theater; theaterClicks++; } };
const rightControls = { children: [], insertBefore(child) { this.children.push(child); },
  querySelector() { return { id: 'settings' }; } };
const domElements = new Map();
const video = { currentTime: 123, duration: 1800, addEventListener() {}, requestPictureInPicture: player.requestPictureInPicture };
const playback = { videoElement: video, listeners: new Map(), on(e, f) { this.listeners.set(e,f); },
  off(e,f) { if(this.listeners.get(e) === f) this.listeners.delete(e); } };
const mockStorage = data => ({getItem: k => data.get(k) ?? null,
  setItem: (k,v) => data.set(k,String(v)), removeItem: k => data.delete(k)});

let checks = 0;
const check = (actual, expected, note) => { assert.deepEqual(actual,expected,note); checks++; };

try {
  globalThis.localStorage = mockStorage(local);
  globalThis.sessionStorage = mockStorage(session);
  globalThis.location = {
    href: 'https://www.youtube.com/watch?v=' + videoId, hostname: 'www.youtube.com',
    pathname: '/watch', replace: url => { redirected = url; }
  };
  globalThis.window = {
    addEventListener: (k,f) => events.set(k,f),
    removeEventListener: k => events.delete(k)
  };
  globalThis.MutationObserver = class {
    constructor(fn) { this.fn = fn; }
    observe() {}
    disconnect() {}
  };
  globalThis.document = {
    pictureInPictureEnabled: true,
    pictureInPictureElement: null,
    querySelector(sel) {
      if (sel === 'ytd-watch-flexy') return flexy;
      if (sel === '.ytp-size-button') return theaterButton;
      if (sel === '.ytp-right-controls') return rightControls;
      if (sel === '.ad-showing') return null;
      if (sel === 'video.html5-main-video') return video;
      return null;
    },
    createElement() {
      const handlers = new Map();
      return {
        setAttribute() {}, addEventListener: (k,f) => handlers.set(k,f), handlers,
        remove() {}, id: '', className: '', innerHTML: '', type: ''
      };
    },
    getElementById(id) { return domElements.get(id) || null; },
    addEventListener() {}, removeEventListener() {}
  };

  const ui = new ViewingExperience(playback);
  check(ui.getVideoId(), videoId, 'Video IDs scoped to YouTube watch URLs');
  check(ui.getVideoId('https://evil.example/watch?v='+videoId), null, 'External URLs never stored');
  ui.persistProgress(true);
  check(JSON.parse(local.get(ui.lastKey)).position, 123, 'Progress is persisted locally');
  check(JSON.parse(local.get(ui.lastKey)).duration, 1800, 'Duration saved to detect completed videos');
  video.currentTime = 156;
  ui.persistProgress(true);
  check(JSON.parse(local.get(ui.lastKey)).position, 156, 'Progress updated on force flush');
  check(JSON.parse(local.get(ui.lastKey)).id, videoId, 'Only video ID, not title or account, stored');

  ui.setTheaterPreference(true);
  ui.syncTheaterMode();
  check(flexy.theater, true, 'Theater mode restored via YouTube native control');
  check(theaterClicks, 1, 'Theater control clicked only when saved mode differs');
  ui.syncTheaterMode();
  check(theaterClicks, 1, 'Idempotent restored mode');
  check(ui.mountPipControl(), true, 'PiP added alongside YouTube native controls');
  check(rightControls.children.length, 1, 'No duplicate PiP button');
  const button = rightControls.children[0];
  const click = button.handlers.get('click');
  click({ stopPropagation() {} });
  check(nativePipRequests, 1, 'Click invokes HTMLVideoElement.requestPictureInPicture');
  check(button.title, 'Imagen en imagen (ventana nativa)', 'PiP is not another WebView');
  check(ui.mountPipControl(), true, 'Existing PiP control reused');

  ui.mount();
  check(events.has('pagehide'), true, 'Crash/close resume checkpoint on pagehide');
  check(playback.listeners.has('timeupdate'), true, 'Progress listener connected');
  ui.dispose();
  check(events.has('pagehide'), false, 'Window listeners detached on dispose');
  check(playback.listeners.has('timeupdate'), false, 'Playback listener detached on dispose');

  // New launch on home (no automatic redirect on normal SPA home visits).
  globalThis.location.pathname = '/';
  globalThis.location.href = 'https://www.youtube.com/';
  const next = new ViewingExperience(null);
  check(next.restoreLastVideoOnLaunch(), true, 'Last watched video restored on a fresh launch');
  check(redirected, 'https://www.youtube.com/watch?v='+videoId+'&t=156s', 'Resume URL contains saved time');
  check(next.restoreLastVideoOnLaunch(), false, 'At most one restoration per session');
  check(session.get('tizentube.launchRestoreAttempted'), '1', 'Resume guard set');
  next.dispose();
  local.set(ui.lastKey, JSON.stringify({id:videoId,position:180, duration:1800,updatedAt:Date.now()-100*86400000}));
  check(next.readLastVideo()?.position, 180, 'Progress remains permanently on device until completed or overwritten');
  local.set(ui.lastKey, JSON.stringify({id:videoId,position:1790, duration:1800,updatedAt:Date.now()}));
  check(next.readLastVideo(), null, 'Completed videos not resumed');
  console.log(`All ${checks}/${checks} native PiP, theater, progress and restart regressions PASSED.`);
} finally {
  for (const [k,v] of Object.entries(originals)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
}
