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
const hostMessages = [];
const player = { currentTime: 123, duration: 1800, requestPictureInPicture() {
  nativePipRequests++;
  return Promise.resolve();
}};
const flexy = { theater: false, hasAttribute(k) { return k === 'theater' && this.theater; } };
const theaterHandlers = new Map();
const theaterButton = {
  addEventListener(k,fn) { theaterHandlers.set(k,fn); },
  removeEventListener(k,fn) { if (theaterHandlers.get(k) === fn) theaterHandlers.delete(k); },
  click() { flexy.theater = !flexy.theater; theaterClicks++; theaterHandlers.get('click')?.(); }
};
const settingsButton = { id: 'settings' };
const captionsButton = { id: 'captions' };
const rightControls = { children: [captionsButton, settingsButton], insertBefore(child, next) {
  this.children = this.children.filter(item => item !== child);
  const index = this.children.indexOf(next);
  this.children.splice(index >= 0 ? index : this.children.length, 0, child);
  child.parentNode = this;
  this.children.forEach((item,i) => { item.nextSibling = this.children[i+1] || null; });
  domElements.set(child.id, child);
}, querySelector(selector) {
  if (selector === '.ytp-settings-button') return settingsButton;
  if (selector === '.ytp-subtitles-button') return captionsButton;
  return null;
} };
settingsButton.parentElement = rightControls;
captionsButton.parentElement = rightControls;
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
        appendChild() {},
        remove() {}, id: '', className: '', innerHTML: '', type: ''
      };
    },
    createElementNS() { return { setAttribute() {}, appendChild() {} }; },
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
  check(rightControls.children.length, 3, 'PiP adds exactly one button');
  check(rightControls.children[0] === captionsButton &&
    rightControls.children[1].id === 'tizentube-native-pip' &&
    rightControls.children[2] === settingsButton, true,
    'Requested exact placement is captions → floating → settings');
  const button = rightControls.children[1];
  const click = button.handlers.get('click');
  click({ stopPropagation() {} });
  check(nativePipRequests, 1, 'Click invokes HTMLVideoElement.requestPictureInPicture');
  check(button.title, 'Reproductor flotante (F9)', 'User can identify the shortcut');
  check(ui.mountPipControl(), true, 'Existing PiP control reused');
  check(rightControls.children.length, 3, 'Repeated mounting does not duplicate floating buttons');

  // WebView2 disables document.pictureInPictureEnabled on some builds. The
  // floating button MUST remain visible and use the native host fallback.
  globalThis.document.pictureInPictureEnabled = false;
  globalThis.window.chrome = { webview: { postMessage: msg => hostMessages.push(msg) } };
  check(ui.mountPipControl(), true, 'Button remains accessible with Chromium PiP unavailable');
  check(ui.togglePictureInPicture(), true, 'WebView2 uses same-window native floating mode');
  check(hostMessages.at(-1).channel, 'window:toggle-floating', 'Only explicit native PiP IPC is sent');
  check(nativePipRequests, 1, 'WebView2 path does not duplicate video playback with browser PiP');
  click({ stopPropagation() {} });
  check(hostMessages.length, 2, 'Button click toggles floating mode even with browser PiP disabled');

  ui.mount();
  check(events.has('pagehide'), true, 'Crash/close resume checkpoint on pagehide');
  check(events.has('keydown'), false, 'Browser-level print accelerator is not intercepted in page JS');
  check(playback.listeners.has('timeupdate'), true, 'Progress listener connected');

  // Regression: first ever selection of theater mode must persist even when
  // yt-navigate-start previously set isNavigating=true. Old code returned
  // before clearing the flag and ignored every user theater change.
  local.delete(ui.theaterKey);
  delete globalThis.window.__TT_THEATER_PREF;
  flexy.theater = false;
  ui.isNavigating = true;
  check(ui.syncTheaterMode(), true, 'Theater observer attaches without existing saved preference');
  check(ui.isNavigating, false, 'First-time preference clears navigation suppression');
  await Promise.resolve(); // finish microtask used to suppress our own restoration click
  theaterButton.click();
  theaterHandlers.get('click')?.({ isTrusted: true });
  await new Promise(resolve => setTimeout(resolve, 230));
  check(local.get(ui.theaterKey), 'true', 'First user theater click saved after actual DOM update');
  theaterButton.click();
  theaterHandlers.get('click')?.({ isTrusted: true });
  await new Promise(resolve => setTimeout(resolve, 230));
  check(local.get(ui.theaterKey), 'false', 'User switching back persists default player view');
  check(theaterHandlers.has('click'), true, 'Theater listener remains connected while mounted');
  ui.dispose();
  check(events.has('pagehide'), false, 'Window listeners detached on dispose');
  check(theaterHandlers.has('click'), false, 'Theater listener cleaned up on dispose');
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
