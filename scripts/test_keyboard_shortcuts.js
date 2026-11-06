#!/usr/bin/env node
/**
 * Regression suite for playback keyboard ownership in the WebView2 injection.
 * Run on GitHub Actions Windows and locally in npm test.
 * Simulates event phases (capture -> target -> bubble), native browser default actions,
 * focus targets (player buttons, HUD controls, text fields, sliders, modals), modifiers,
 * repeat keys, reinjection defense, and attach/dispose lifecycle.
 */
import assert from 'node:assert/strict';
import { PlaybackEngine } from '../src/runtime/playback_engine.js';

class FakeWindow {
  constructor() {
    this.listeners = [];
  }
  addEventListener(type, fn, options = false) {
    this.listeners.push({ type, fn, capture: options === true || Boolean(options?.capture) });
  }
  removeEventListener(type, fn, options = false) {
    const capture = options === true || Boolean(options?.capture);
    this.listeners = this.listeners.filter(x => !(x.type === type && x.fn === fn && x.capture === capture));
  }
  send(key, target = { tagName: 'DIV' }, options = {}) {
    const event = {
      type: 'keydown',
      key,
      code: key === ' ' ? 'Space' : options.code || (key.length === 1 ? `Key${key.toUpperCase()}` : key),
      target,
      repeat: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      defaultPrevented: false,
      stopped: false,
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

let liveDomVideo = null;
globalThis.document = {
  body: { nodeType: 1 },
  querySelector(sel) {
    if (sel.includes('video')) return liveDomVideo;
    return null;
  },
  addEventListener() {},
  removeEventListener() {}
};

let engine;
try {
  let youtubeKeyEvents = 0;
  let watchedTimeUpdates = [];
  let assignments = [];
  let timestamp = 100;
  let volumeLevel = 1;

  const createVideo = (id = 'video-1') => {
    let t = 100;
    return {
      id,
      isConnected: true,
      get currentTime() { return t; },
      set currentTime(value) { t = value; timestamp = value; assignments.push(value); },
      duration: 300,
      paused: false,
      playbackRate: 1,
      get volume() { return volumeLevel; },
      set volume(v) { volumeLevel = Math.max(0, Math.min(1, v)); },
      muted: false,
      play() { this.paused = false; },
      pause() { this.paused = true; },
      addEventListener(name, listener) {
        if (name === 'timeupdate') watchedTimeUpdates.push(listener);
      },
      removeEventListener() {}
    };
  };

  const video = createVideo('video-main');
  liveDomVideo = video;

  // YouTube listener registered at bubble phase (e.g. on window/document)
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

  // --------------------------------------------------------------------------
  // Test 1: Arrow keys perform single seeks, claimed at capture phase
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Test 2: Space toggles play/pause; held Space does not oscillate
  // --------------------------------------------------------------------------
  const pause = fakeWindow.send(' ');
  assert.equal(video.paused, true, 'Space must pause video');
  assert.ok(pause.defaultPrevented && pause.stopped);

  fakeWindow.send(' ', { tagName: 'DIV' }, { repeat: true });
  assert.equal(video.paused, true, 'Held Space must not oscillate between play/pause');

  fakeWindow.send('Unidentified', { tagName: 'DIV' }, { code: 'Space' });
  assert.equal(video.paused, false, 'Keyboard layout with code=Space must resume');
  assert.equal(youtubeKeyEvents, 0, 'Video shortcuts must not also trigger YouTube handler');

  // --------------------------------------------------------------------------
  // Test 3: K toggles play/pause reliably
  // --------------------------------------------------------------------------
  const pauseK = fakeWindow.send('k');
  assert.equal(video.paused, true, 'K must pause video');
  assert.ok(pauseK.defaultPrevented && pauseK.stopped);
  const resumeK = fakeWindow.send('K');
  assert.equal(video.paused, false, 'K must resume video');

  // --------------------------------------------------------------------------
  // Test 4: J/L 10-second jumps
  // --------------------------------------------------------------------------
  fakeWindow.send('l');
  assert.equal(video.currentTime, 110, 'L must seek forward 10 seconds');
  fakeWindow.send('j');
  assert.equal(video.currentTime, 100, 'J must seek backward 10 seconds');

  // --------------------------------------------------------------------------
  // Test 5: Numbers, Home, End, Volume, Fullscreen, Speed
  // --------------------------------------------------------------------------
  fakeWindow.send('5');
  assert.equal(video.currentTime, 150, '5 must seek to 50% of duration (150s)');
  fakeWindow.send('0');
  assert.equal(video.currentTime, 0, '0 must seek to beginning');
  fakeWindow.send('End');
  assert.equal(video.currentTime, 300, 'End must seek to duration');
  fakeWindow.send('Home');
  assert.equal(video.currentTime, 0, 'Home must seek to 0s');

  fakeWindow.send('m');
  assert.equal(video.muted, true, 'M must toggle mute');
  fakeWindow.send('M');
  assert.equal(video.muted, false, 'M must unmute');

  let fsToggled = false;
  engine.toggleFullscreen = () => { fsToggled = true; };
  fakeWindow.send('f');
  assert.ok(fsToggled, 'F must toggle fullscreen');

  fakeWindow.send('>', { tagName: 'DIV' }, { shiftKey: true });
  assert.equal(video.playbackRate, 1.25, '> must increase speed by 0.25x');
  fakeWindow.send('<', { tagName: 'DIV' }, { shiftKey: true });
  assert.equal(video.playbackRate, 1.0, '< must decrease speed by 0.25x');

  // --------------------------------------------------------------------------
  // Test 6: Player control buttons & HUD (The Core Bug & Regression Fix)
  // When focus is on a player control button, Space must claim and preventDefault.
  // In Chromium, if preventDefault is NOT called on Space, the browser synthesizes
  // a click on keyup, causing a double play/pause toggle.
  // --------------------------------------------------------------------------
  const playerButtons = [
    {
      tagName: 'BUTTON',
      className: 'ytp-play-button ytp-button',
      classList: { contains: c => c === 'ytp-play-button' || c === 'ytp-button' },
      closest: sel => sel.includes('ytp-button') || sel.includes('html5-video-player') ? {} : null
    },
    {
      tagName: 'BUTTON',
      className: 'tt-btn tt-play-btn',
      classList: { contains: c => c === 'tt-btn' || c === 'tt-play-btn' },
      closest: sel => sel.includes('tt-btn') || sel.includes('tt-player-controls') ? {} : null
    },
    {
      tagName: 'BUTTON',
      className: 'ytp-mute-button ytp-button',
      classList: { contains: c => c === 'ytp-mute-button' || c === 'ytp-button' },
      closest: sel => sel.includes('ytp-button') ? {} : null
    }
  ];

  for (const button of playerButtons) {
    video.paused = false;
    let buttonClicks = 0;
    const simulateBrowserDefaultAction = (evt) => {
      // Browsers fire 'click' on keyup for focused buttons ONLY when defaultPrevented is false
      if (!evt.defaultPrevented) {
        buttonClicks++;
        video.paused ? video.play() : video.pause();
      }
    };

    // Space press on focused player button
    const spaceEvt = fakeWindow.send(' ', button);
    assert.ok(spaceEvt.defaultPrevented, 'Space on player button must call preventDefault to stop duplicate click');
    assert.ok(spaceEvt.stopped, 'Space on player button must stop propagation to YouTube');
    assert.equal(video.paused, true, 'Space on player button must pause video exactly once');

    // Browser keyup simulation
    simulateBrowserDefaultAction(spaceEvt);
    assert.equal(buttonClicks, 0, 'No synthetic click should occur when defaultPrevented is true');
    assert.equal(video.paused, true, 'Video must remain paused (no double-toggle back to playing)');

    // Space resume on focused player button
    const resumeEvt = fakeWindow.send(' ', button);
    assert.ok(resumeEvt.defaultPrevented);
    assert.equal(video.paused, false, 'Second Space press on player button must resume video');
    simulateBrowserDefaultAction(resumeEvt);
    assert.equal(video.paused, false, 'Video remains playing (no oscillation)');

    // Space held on focused player button
    fakeWindow.send(' ', button, { repeat: true });
    assert.equal(video.paused, false, 'Held Space on player button must not oscillate');

    // K on focused player button
    const kEvt = fakeWindow.send('k', button);
    assert.ok(kEvt.defaultPrevented, 'K on player button must be claimed');
    assert.equal(video.paused, true, 'K on player button must toggle playback');
    fakeWindow.send('k', button);
    assert.equal(video.paused, false);

    // ArrowRight on player button seeks
    const beforeT = video.currentTime;
    const seekEvt = fakeWindow.send('ArrowRight', button);
    assert.ok(seekEvt.defaultPrevented, 'ArrowRight on player button must claim and seek');
    assert.equal(video.currentTime, beforeT + 5, 'ArrowRight on player button advances seek');
  }

  // --------------------------------------------------------------------------
  // Test 7: Sliders (Volume & Progress bar)
  // --------------------------------------------------------------------------
  const volumeSlider = {
    tagName: 'DIV',
    className: 'ytp-volume-slider',
    classList: { contains: c => c === 'ytp-volume-slider' },
    closest: sel => sel.includes('ytp-volume-slider') ? {} : null
  };
  const initialVol = engine.state.volume;
  fakeWindow.send('ArrowDown', volumeSlider);
  assert.equal(engine.state.volume, Math.max(0, initialVol - 5), 'ArrowDown on volume slider decreases volume');
  fakeWindow.send('ArrowUp', volumeSlider);
  assert.equal(engine.state.volume, initialVol, 'ArrowUp on volume slider increases volume');

  // Space on volume slider still toggles playback cleanly
  video.paused = false;
  fakeWindow.send(' ', volumeSlider);
  assert.equal(video.paused, true, 'Space on volume slider toggles playback');
  video.paused = false;

  // --------------------------------------------------------------------------
  // Test 8: Text entry fields and modal dialogs are NEVER intercepted
  // --------------------------------------------------------------------------
  for (const target of [
    { tagName: 'INPUT' },
    { tagName: 'TEXTAREA' },
    { tagName: 'SELECT' },
    { tagName: 'DIV', isContentEditable: true },
    { tagName: 'SPAN', closest: sel => sel.includes('[contenteditable]') ? {} : null },
    { tagName: 'DIV', closest: sel => sel.includes('[role="textbox"]') ? {} : null },
    { tagName: 'BUTTON', closest: sel => sel.includes('.tt-modal') ? {} : null }
  ]) {
    const before = video.currentTime;
    const arrowEvt = fakeWindow.send('ArrowRight', target);
    assert.ok(!arrowEvt.defaultPrevented, 'Text fields and modals must not prevent default navigation');
    assert.ok(!arrowEvt.stopped, 'Text fields and modals must not stop propagation');

    const spaceEvt = fakeWindow.send(' ', target);
    assert.ok(!spaceEvt.defaultPrevented, 'Space inside text inputs must type a space, not trigger video playback');
  }

  // --------------------------------------------------------------------------
  // Test 8b: Player popup menus and menuitems (gear icon, quality, audio)
  // ArrowUp/Down/Left/Right and Space must NOT be intercepted on menu elements
  // --------------------------------------------------------------------------
  const menuTargets = [
    {
      tagName: 'DIV',
      className: 'ytp-menuitem',
      closest: sel => sel.includes('html5-video-player') || sel.includes('menuitem') ? {} : null
    },
    {
      tagName: 'DIV',
      className: 'ytp-menuitem-label',
      closest: sel => sel.includes('role="menuitem"') || sel.includes('ytp-menuitem') ? {} : null
    },
    {
      tagName: 'DIV',
      closest: sel => sel.includes('role="menuitemcheckbox"') ? {} : null
    },
    {
      tagName: 'DIV',
      closest: sel => sel.includes('role="menuitemradio"') ? {} : null
    },
    {
      tagName: 'DIV',
      className: 'ytp-panel-menu',
      closest: sel => sel.includes('role="menu"') || sel.includes('ytp-panel-menu') ? {} : null
    }
  ];

  for (const menuTarget of menuTargets) {
    const initialVol = engine.state.volume;
    const initialEvents = youtubeKeyEvents;

    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', ' ']) {
      const evt = fakeWindow.send(key, menuTarget);
      assert.ok(!evt.defaultPrevented, `Key ${key} on menuitem must NOT be claimed with preventDefault by PlaybackEngine`);
      assert.ok(!evt.stopped, `Key ${key} on menuitem must NOT stopPropagation, letting YouTube menu handle it`);
    }

    assert.equal(engine.state.volume, initialVol, 'Arrow keys on menu must not adjust volume in PlaybackEngine');
    assert.ok(youtubeKeyEvents > initialEvents, 'Unintercepted menu keys must reach native handlers');
  }

  // --------------------------------------------------------------------------
  // Test 9: External non-player buttons leave arrow navigation to native UI
  // --------------------------------------------------------------------------
  const externalButton = {
    tagName: 'BUTTON',
    className: 'ytd-subscribe-button-renderer',
    closest: () => null
  };
  const beforeExternal = video.currentTime;
  const extArrow = fakeWindow.send('ArrowRight', externalButton);
  assert.ok(!extArrow.defaultPrevented, 'Arrow on external button must not be intercepted');
  assert.equal(video.currentTime, beforeExternal + 5, 'Unclaimed arrow reaches native YouTube simulator');
  video.currentTime = beforeExternal;

  // Space on external button while watching video triggers playback and prevents button click
  video.paused = false;
  const extSpace = fakeWindow.send(' ', externalButton);
  assert.ok(extSpace.defaultPrevented, 'Space on external button while video active controls playback');
  assert.equal(video.paused, true, 'Video paused');
  video.paused = false;

  // --------------------------------------------------------------------------
  // Test 10: System modifiers and native YouTube keys (C, T, I)
  // --------------------------------------------------------------------------
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    const event = fakeWindow.send(' ', { tagName: 'DIV' }, { [modifier]: true });
    assert.ok(!event.defaultPrevented, `${modifier} must not be intercepted`);
  }

  for (const nativeKey of ['c', 't', 'i', 'T']) {
    const event = fakeWindow.send(nativeKey);
    assert.ok(!event.defaultPrevented && !event.stopped,
      `${nativeKey} must reach native YouTube and theater listener`);
  }

  // --------------------------------------------------------------------------
  // Test 11: Reinjection defense & Single-listener invariant
  // --------------------------------------------------------------------------
  const engine2 = new PlaybackEngine({ rememberPreferences: false });
  engine2.bindVideoElement(video);
  const captureListeners = fakeWindow.listeners.filter(x => x.type === 'keydown' && x.capture);
  assert.equal(captureListeners.length, 1, 'Reinjection must replace previous keydown handler, not accumulate');
  video.paused = false;
  fakeWindow.send(' ');
  assert.equal(video.paused, true, 'Re-injected engine must pause exactly once without double-action');
  engine2.dispose();

  // --------------------------------------------------------------------------
  // Test 12: SPA Navigation & Live video element reconnection
  // --------------------------------------------------------------------------
  const engine3 = new PlaybackEngine({ rememberPreferences: false });
  const oldVideo = createVideo('video-old');
  engine3.bindVideoElement(oldVideo);

  // Simulate YouTube SPA detaching old video and creating new video
  oldVideo.isConnected = false;
  const newVideo = createVideo('video-new');
  newVideo.paused = false;
  liveDomVideo = newVideo;

  // Action on detached video triggers auto-rebind to live DOM video
  fakeWindow.send(' ');
  assert.equal(newVideo.paused, true, 'PlaybackEngine must auto-rebind to live connected video on SPA navigation');
  engine3.dispose();

  // --------------------------------------------------------------------------
  // Test 13: Clean Teardown / Dispose
  // --------------------------------------------------------------------------
  engine.dispose();
  assert.ok(!fakeWindow.listeners.some(x => x.type === 'keydown' && x.capture),
    'Dispose must remove capture listener with matching capture option');
  assert.equal(fakeWindow.__tt_playback_keydown__, undefined,
    'Dispose must clean up global listener reference');

  console.log('PASS keyboard playback suite: single +/-5s, stable clock, Space/K on player controls, focus, modifiers, repeat, reinjection & dispose');
} finally {
  engine?.dispose();
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
}
