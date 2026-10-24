#!/usr/bin/env node
/**
 * Regression suite for playback keyboard ownership in the WebView2 injection.
 * Run on GitHub Actions Windows. Simulates the event phases and native YouTube
 * shortcut handler to detect doubled seeks without any account/session data.
 */
import assert from 'node:assert/strict';
import { PlaybackEngine } from '../src/runtime/playback_engine.js';

class FakeWindow {
  constructor() { this.listeners = []; }
  addEventListener(type, fn, options = false) {
    this.listeners.push({ type, fn, capture: options === true || Boolean(options?.capture) });
  }
  removeEventListener(type, fn, options = false) {
    const capture = options === true || Boolean(options?.capture);
    this.listeners = this.listeners.filter(x => !(x.type === type && x.fn === fn && x.capture === capture));
  }
  send(key, target = { tagName: 'DIV' }, options = {}) {
    const event = {
      type: 'keydown', key, code: key === ' ' ? 'Space' : options.code,
      target, repeat: false, ctrlKey: false, altKey: false, metaKey: false,
      shiftKey: false, isComposing: false, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      ...options
    };
    const listeners = this.listeners.filter(x => x.type === event.type);
    for (const capture of [true, false]) {
      for (const x of listeners.filter(x => x.capture === capture)) {
        if (event.stopped) break;
        x.fn(event);
      }
    }
    return event;
  }
}

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const fakeWindow = new FakeWindow();
globalThis.window = fakeWindow;
globalThis.document = { body: null, addEventListener() {}, removeEventListener() {} };

let engine;
try {
  let youtubeKeyEvents = 0;
  let watchedTimeUpdates = [];
  let assignments = [];
  let timestamp = 100;
  const video = {
    get currentTime() { return timestamp; },
    set currentTime(value) { timestamp = value; assignments.push(value); },
    duration: 300, paused: false, playbackRate: 1, volume: 1, muted: false,
    play() { this.paused = false; },
    pause() { this.paused = true; },
    addEventListener(name, listener) {
      if (name === 'timeupdate') watchedTimeUpdates.push(listener);
    },
    removeEventListener() {}
  };

  // YouTube listener registered before our module, but at *bubble* phase.
  fakeWindow.addEventListener('keydown', e => {
    youtubeKeyEvents++;
    if (e.key === 'ArrowRight') video.currentTime += 5;
    if (e.key === 'ArrowLeft') video.currentTime -= 5;
    if (e.key === ' ') video.paused ? video.play() : video.pause();
  });
  engine = new PlaybackEngine({ rememberPreferences: false });
  engine.bindVideoElement(video);
  assert.ok(fakeWindow.listeners.some(x => x.type === 'keydown' && x.capture),
    'Shortcuts must attach in capture phase, before YouTube player handlers');

  const forward = fakeWindow.send('ArrowRight');
  assert.equal(video.currentTime, 105, 'ArrowRight must advance 5 seconds, not 10');
  assert.deepEqual(assignments, [105], 'A single key press must write only one seek target');
  assert.equal(youtubeKeyEvents, 0, 'YouTube must not receive a claimed playback shortcut');
  assert.ok(forward.defaultPrevented && forward.stopped);
  watchedTimeUpdates.forEach(fn => fn());
  assert.equal(engine.state.currentTime, 105, 'Reported player clock must match final seek');

  const backward = fakeWindow.send('ArrowLeft');
  assert.equal(video.currentTime, 100, 'ArrowLeft must rewind exactly 5 seconds');
  assert.deepEqual(assignments, [105, 100], 'Reverse seek must not create intermediate jump');

  const pause = fakeWindow.send(' ');
  assert.equal(video.paused, true, 'Space must pause video');
  assert.ok(pause.defaultPrevented && pause.stopped);
  fakeWindow.send(' ', { tagName: 'DIV' }, { repeat: true });
  assert.equal(video.paused, true, 'Held Space must not oscillate between play/pause');
  fakeWindow.send('Unidentified', { tagName: 'DIV' }, { code: 'Space' });
  assert.equal(video.paused, false, 'Keyboard layout with code=Space must resume');
  assert.equal(youtubeKeyEvents, 0, 'Video shortcuts must not also trigger YouTube handler');

  // Existing YouTube-style commands: J/L use 10 seconds; arrows use 5.
  fakeWindow.send('l');
  assert.equal(video.currentTime, 110);
  fakeWindow.send('j');
  assert.equal(video.currentTime, 100);

  for (const target of [
    { tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'BUTTON' },
    { tagName: 'DIV', isContentEditable: true },
    { tagName: 'SPAN', closest: selector => selector.includes('[contenteditable]') ? {} : null }
  ]) {
    const before = video.currentTime;
    const event = fakeWindow.send('ArrowRight', target);
    assert.ok(!event.defaultPrevented, 'Text and focused UI controls must preserve native keys');
    assert.equal(video.currentTime, before + 5, 'Unclaimed event reaches native YouTube simulator');
    video.currentTime = before;
  }
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    const event = fakeWindow.send(' ', { tagName: 'DIV' }, { [modifier]: true });
    assert.ok(!event.defaultPrevented, modifier + ' must not be intercepted');
  }

  for (const nativeKey of ['c', 't', 'i', 'T']) {
    const event = fakeWindow.send(nativeKey);
    assert.ok(!event.defaultPrevented && !event.stopped,
      nativeKey + ' must reach native YouTube and the trusted theater listener');
  }

  engine.dispose();
  assert.ok(!fakeWindow.listeners.some(x => x.type === 'keydown' && x.capture),
    'Dispose must remove capture listener with matching capture option');
  console.log('PASS keyboard playback: single +/-5s, stable clock, Space, repeats, focus, modifiers and cleanup');
} finally {
  engine?.dispose();
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
}
