#!/usr/bin/env node
/**
 * Regression suite for playback keyboard ownership and focus authority in the WebView2 injection.
 * Run on GitHub Actions Windows and locally in npm test.
 * Simulates event phases (capture -> target -> bubble), native browser default actions,
 * focus targets (player buttons, HUD controls, text fields, sliders, modals), modifiers,
 * repeat keys, frame-stepping, A/D/S/B non-collision, reinjection defense, and attach/dispose lifecycle.
 */
import assert from 'node:assert/strict';
import { PlaybackEngine } from '../src/runtime/playback_engine.js';
import { AppUI } from '../src/ui/app_ui.js';

class FakeWindow {
  constructor() {
    this.listeners = [];
    this.location = { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
    this.history = { back() {}, forward() {} };
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
const originalLocalStorage = globalThis.localStorage;
const originalRAF = globalThis.requestAnimationFrame;
const originalCAF = globalThis.cancelAnimationFrame;

globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

const storage = new Map();
globalThis.localStorage = {
  getItem: k => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: k => storage.delete(k),
  clear: () => storage.clear()
};

const fakeWindow = new FakeWindow();
globalThis.window = fakeWindow;

let liveDomVideo = null;
globalThis.document = {
  head: {
    appendChild() {},
    removeChild() {},
    querySelector: () => null,
    querySelectorAll: () => []
  },
  body: {
    nodeType: 1,
    tagName: 'BODY',
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {},
    prepend() {},
    insertBefore() {},
    removeChild() {},
    querySelector: () => null,
    querySelectorAll: () => []
  },
  documentElement: {
    classList: { add() {}, remove() {}, contains: () => false }
  },
  createElement(tag) {
    const el = {
      tagName: tag.toUpperCase(),
      style: {},
      classList: { add() {}, remove() {}, contains: () => false },
      setAttribute() {},
      getAttribute() { return null; },
      addEventListener() {},
      removeEventListener() {},
      appendChild() {},
      prepend() {},
      insertBefore() {},
      removeChild() {},
      querySelector: () => null,
      querySelectorAll: () => []
    };
    return el;
  },
  createElementNS(_, tag) {
    return this.createElement(tag);
  },
  querySelector(sel) {
    if (sel.includes('video')) return liveDomVideo;
    return null;
  },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  addEventListener() {},
  removeEventListener() {}
};

let engine;
let appUI;
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

  // YouTube listener registered at bubble phase (e.g. on window/document).
  // In native YouTube web, document keyboard handler ignores buttons because the browser
  // activates buttons via 'click' on keyup.
  fakeWindow.addEventListener('keydown', e => {
    youtubeKeyEvents++;
    const isBtn = e.target?.tagName === 'BUTTON' || Boolean(e.target?.closest?.('button, [role="button"]'));
    if (e.key === 'ArrowRight' && !isBtn) video.currentTime += 5;
    if (e.key === 'ArrowLeft' && !isBtn) video.currentTime -= 5;
    if (e.key === ' ' && !isBtn) video.paused ? video.play() : video.pause();
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
  // Test 2: Space toggles play/pause on neutral targets; held Space does not oscillate
  // --------------------------------------------------------------------------
  const pause = fakeWindow.send(' ');
  assert.equal(video.paused, true, 'Space on body/div must pause video');
  assert.ok(pause.defaultPrevented && pause.stopped);

  fakeWindow.send(' ', { tagName: 'DIV' }, { repeat: true });
  assert.equal(video.paused, true, 'Held Space must not oscillate between play/pause');

  fakeWindow.send('Unidentified', { tagName: 'DIV' }, { code: 'Space' });
  assert.equal(video.paused, false, 'Keyboard layout with code=Space must resume');
  assert.equal(youtubeKeyEvents, 0, 'Video shortcuts must not also trigger YouTube handler');

  // Space on progress bar (.ytp-progress-bar) toggles playback cleanly
  const progressBar = {
    tagName: 'DIV',
    className: 'ytp-progress-bar',
    classList: { contains: c => c === 'ytp-progress-bar' },
    closest: sel => sel.includes('ytp-progress-bar') ? {} : null
  };
  const pbSpace = fakeWindow.send(' ', progressBar);
  assert.ok(pbSpace.defaultPrevented && pbSpace.stopped, 'Space on progress bar must claim event');
  assert.equal(video.paused, true, 'Space on progress bar must pause video');
  fakeWindow.send(' ', progressBar);
  assert.equal(video.paused, false, 'Second Space on progress bar resumes video');

  // --------------------------------------------------------------------------
  // Test 3: K toggles play/pause reliably everywhere (except text fields)
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
  // Test 5b: Frame-stepping (, and .) ONLY in pause (YouTube Help Center Parity)
  // --------------------------------------------------------------------------
  video.currentTime = 50;
  video.paused = false;

  // While video is playing: bare . and , must NOT step frames and must NOT alter speed
  fakeWindow.send('.');
  assert.equal(video.currentTime, 50, 'Period while playing must NOT step frame');
  assert.equal(video.playbackRate, 1.0, 'Period without Shift must NOT modify playbackRate');

  fakeWindow.send(',');
  assert.equal(video.currentTime, 50, 'Comma while playing must NOT step frame');
  assert.equal(video.playbackRate, 1.0, 'Comma without Shift must NOT modify playbackRate');

  // When video is paused: . advances 1 frame (~1/30s), , rewinds 1 frame (~1/30s)
  video.paused = true;
  fakeWindow.send('.');
  assert.ok(Math.abs(video.currentTime - (50 + 1 / 30)) < 0.0001,
    'Period while paused must advance exactly 1 frame (+1/30s)');
  assert.equal(video.playbackRate, 1.0, 'Frame-step must never alter playback rate');

  fakeWindow.send(',');
  assert.ok(Math.abs(video.currentTime - 50) < 0.0001,
    'Comma while paused must rewind exactly 1 frame (-1/30s)');
  assert.equal(video.playbackRate, 1.0, 'Frame-step must never alter playback rate');

  // --------------------------------------------------------------------------
  // Test 6: Focus Authority Matrix on Buttons (Regression Proof: BEFORE vs AFTER)
  //
  // BEFORE (The bug in 661423e):
  // PlaybackEngine claimed Space and called togglePlay() directly on keydown for all buttons.
  // This had two critical flaws:
  //   1. It called preventDefault, suppressing the browser's native keyup -> 'click' synthesis.
  //      Consequently, pressing Space on a mute button or settings button toggled play/pause
  //      instead of muting or opening settings!
  //   2. On external buttons (e.g. Subscribe), it hijacked Space and prevented the button action.
  //
  // AFTER (YouTube Web Semantics):
  // Interactive buttons (<button>, [role="button"]) are NOT intercepted by PlaybackEngine on Space.
  // The browser natively handles Space and fires 'click' on keyup on THAT focused button:
  //   - Focused Play Button: keyup 'click' toggles playback ONCE (no double toggle).
  //   - Focused Mute Button: keyup 'click' toggles mute (video playback state is untouched).
  //   - Focused Settings Button: keyup 'click' opens settings (video playback untouched).
  //   - K remains universal play/pause without firing button clicks.
  // --------------------------------------------------------------------------
  const playButton = {
    tagName: 'BUTTON',
    className: 'ytp-play-button ytp-button',
    classList: { contains: c => c === 'ytp-play-button' || c === 'ytp-button' },
    closest: sel => sel.includes('ytp-button') || sel.includes('html5-video-player') ? {} : null
  };

  const muteButton = {
    tagName: 'BUTTON',
    className: 'ytp-mute-button ytp-button',
    classList: { contains: c => c === 'ytp-mute-button' || c === 'ytp-button' },
    closest: sel => sel.includes('ytp-button') || sel.includes('html5-video-player') ? {} : null
  };

  const ttPlayButton = {
    tagName: 'BUTTON',
    className: 'tt-btn tt-play-btn',
    classList: { contains: c => c === 'tt-btn' || c === 'tt-play-btn' },
    closest: sel => sel.includes('tt-btn') || sel.includes('tt-player-controls') ? {} : null
  };

  // Case A: Focused Play Button
  video.paused = false;
  let playButtonClicks = 0;
  const playClick = () => { playButtonClicks++; video.paused = !video.paused; };

  const playSpace = fakeWindow.send(' ', playButton);
  assert.equal(playSpace.defaultPrevented, false,
    'Space on play button must NOT be defaultPrevented on keydown, enabling browser native keyup click');
  assert.equal(video.paused, false,
    'Space keydown alone must NOT toggle video playback on button, preventing duplicate keydown+click toggle');

  // Chromium fires 'click' on keyup when defaultPrevented is false
  if (!playSpace.defaultPrevented) playClick();
  assert.equal(playButtonClicks, 1, 'Native click must fire on keyup');
  assert.equal(video.paused, true, 'Video paused once by play button activation');

  // Second press resumes
  const resumeSpace = fakeWindow.send(' ', playButton);
  assert.equal(resumeSpace.defaultPrevented, false);
  if (!resumeSpace.defaultPrevented) playClick();
  assert.equal(playButtonClicks, 2);
  assert.equal(video.paused, false, 'Second Space resumes video via button click');

  // Case B: Focused Mute Button (Proves Fix for 661423e Bug)
  video.muted = false;
  video.paused = false;
  let muteButtonClicks = 0;
  const muteClick = () => { muteButtonClicks++; video.muted = !video.muted; };

  const muteSpace = fakeWindow.send(' ', muteButton);
  assert.equal(muteSpace.defaultPrevented, false,
    'Space on mute button must NOT be intercepted with preventDefault');
  assert.equal(video.paused, false,
    'Space on mute button must NEVER pause or toggle playback! (Fixes 661423e regression)');

  // Keyup default action fires mute click
  if (!muteSpace.defaultPrevented) muteClick();
  assert.equal(muteButtonClicks, 1, 'Mute button receives click on keyup');
  assert.equal(video.muted, true, 'Mute button successfully toggled video.muted');
  assert.equal(video.paused, false, 'Video remains playing uninterrupted while muting');

  // Case C: K on focused player button handles playback universally without clicking button
  const kEvt = fakeWindow.send('k', muteButton);
  assert.ok(kEvt.defaultPrevented && kEvt.stopped, 'K on button must be claimed by PlaybackEngine');
  assert.equal(video.paused, true, 'K must pause video directly');
  assert.equal(muteButtonClicks, 1, 'K must NOT trigger synthetic click on focused mute button');

  const resumeKEvt = fakeWindow.send('k', muteButton);
  assert.equal(video.paused, false, 'Second K resumes video');
  assert.equal(muteButtonClicks, 1, 'Mute button click count remains unchanged');

  // Case D: ArrowRight on player button seeks +5s
  const beforeT = video.currentTime;
  const seekEvt = fakeWindow.send('ArrowRight', playButton);
  assert.ok(seekEvt.defaultPrevented, 'ArrowRight on player button must claim and seek');
  assert.equal(video.currentTime, beforeT + 5, 'ArrowRight on player button advances seek');

  // Case E: TizenTube custom player button (.tt-btn)
  let ttClicks = 0;
  const ttClick = () => { ttClicks++; video.paused = !video.paused; };
  const ttSpace = fakeWindow.send(' ', ttPlayButton);
  assert.equal(ttSpace.defaultPrevented, false, 'Space on TT button allows browser native click');
  if (!ttSpace.defaultPrevented) ttClick();
  assert.equal(ttClicks, 1);

  // --------------------------------------------------------------------------
  // Test 7: Sliders (Volume Slider)
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
  // Test 9: External non-player buttons (Subscribe, Like, Links)
  //
  // Demonstrates correct YouTube authority:
  // Space on external button activates that button on keyup, does NOT hijack playback!
  // Arrows on external button perform native browser navigation, not video seek!
  // --------------------------------------------------------------------------
  let subscribeActivated = false;
  const externalButton = {
    tagName: 'BUTTON',
    className: 'ytd-subscribe-button-renderer',
    closest: () => null
  };
  const onSubscribeClick = () => { subscribeActivated = true; };

  const beforeExternal = video.currentTime;
  const extArrow = fakeWindow.send('ArrowRight', externalButton);
  assert.ok(!extArrow.defaultPrevented, 'Arrow on external button must not be intercepted');
  assert.equal(video.currentTime, beforeExternal, 'Arrow on external button must not seek video (retains native UI navigation)');

  // Space on external button: must NOT be defaultPrevented; activates button on keyup
  video.paused = false;
  const extSpace = fakeWindow.send(' ', externalButton);
  assert.equal(extSpace.defaultPrevented, false,
    'Space on external button must NOT be prevented by PlaybackEngine');
  assert.equal(extSpace.stopped, false,
    'Space on external button must NOT stop propagation');
  assert.equal(video.paused, false,
    'Space on external button must NOT toggle video playback');

  // Simulate browser keyup firing click
  if (!extSpace.defaultPrevented) onSubscribeClick();
  assert.equal(subscribeActivated, true, 'External button successfully activated via native click');
  assert.equal(video.paused, false, 'Video remains playing uninterrupted');

  // External link (<a>)
  const externalLink = {
    tagName: 'A',
    closest: () => null
  };
  const linkSpace = fakeWindow.send(' ', externalLink);
  assert.equal(linkSpace.defaultPrevented, false, 'Space on external link must not toggle video playback');

  // --------------------------------------------------------------------------
  // Test 10: System modifiers, IME, Chapters, and Native YouTube keys (C, T, I)
  // --------------------------------------------------------------------------
  for (const modifier of ['ctrlKey', 'altKey', 'metaKey']) {
    const event = fakeWindow.send(' ', { tagName: 'DIV' }, { [modifier]: true });
    assert.ok(!event.defaultPrevented, `${modifier} must not be intercepted`);
  }

  // Ctrl+ArrowLeft/Right for YouTube native chapter navigation
  const ctrlArrowRight = fakeWindow.send('ArrowRight', { tagName: 'DIV' }, { ctrlKey: true });
  assert.equal(ctrlArrowRight.defaultPrevented, false,
    'Ctrl+ArrowRight must NOT be claimed as 5s seek, preserving YouTube native chapters');
  const ctrlArrowLeft = fakeWindow.send('ArrowLeft', { tagName: 'DIV' }, { ctrlKey: true });
  assert.equal(ctrlArrowLeft.defaultPrevented, false,
    'Ctrl+ArrowLeft must NOT be claimed as 5s seek, preserving YouTube native chapters');

  // Native YouTube keys
  for (const nativeKey of ['c', 't', 'i', 'T']) {
    const event = fakeWindow.send(nativeKey);
    assert.ok(!event.defaultPrevented && !event.stopped,
      `${nativeKey} must reach native YouTube and theater listener`);
  }

  // Escape key handling
  let exitFsCalled = false;
  engine.exitFullscreen = () => { exitFsCalled = true; engine.state.isFullscreen = false; };
  engine.state.isFullscreen = true;
  const escFs = fakeWindow.send('Escape');
  assert.ok(escFs.defaultPrevented, 'Escape in fullscreen claims event and exits fullscreen');
  assert.equal(exitFsCalled, true, 'exitFullscreen was invoked on Escape in fullscreen');
  assert.equal(engine.state.isFullscreen, false, 'Fullscreen exited');

  const escNormal = fakeWindow.send('Escape');
  assert.equal(escNormal.defaultPrevented, false,
    'Escape outside fullscreen does not claim event and never closes window');

  // --------------------------------------------------------------------------
  // Test 11: Removal of A/D/S/B Collisions & Preserving Mod Features via UI
  //
  // Bare letter keys A, D, S, B are NOT intercepted globally by PlaybackEngine
  // or AppUI, resolving collisions with YouTube web (e.g. 360-degree video panning).
  // Mod features (AdBlock, DeArrow, SponsorBlock, Settings) remain fully operative via UI.
  // --------------------------------------------------------------------------
  appUI = new AppUI();
  appUI.mount();
  for (const bareKey of ['a', 'A', 'd', 'D', 's', 'S', 'b', 'B']) {
    const evt = fakeWindow.send(bareKey);
    assert.equal(evt.defaultPrevented, false,
      `Bare key '${bareKey}' must NOT be defaultPrevented globally (no collision with YouTube)`);
    assert.equal(evt.stopped, false,
      `Bare key '${bareKey}' must NOT be stopped (passes to YouTube)`);
  }

  // Search shortcut '/' still focuses search bar
  let searchFocused = false;
  appUI.navBar.focusSearch = () => { searchFocused = true; };
  const slashEvt = fakeWindow.send('/');
  assert.ok(slashEvt.defaultPrevented, "Key '/' must focus search bar");
  assert.equal(searchFocused, true, 'Search bar focused on /');

  // Mod features remain fully controllable via UI / configuration modal
  assert.ok(appUI.settingsModal, 'Settings modal is available in UI');
  appUI.settingsModal.open();
  assert.equal(appUI.settingsModal.isOpen, true, 'Settings modal opens via UI');

  // Escape closes settings modal
  const escModal = fakeWindow.send('Escape');
  assert.ok(escModal.defaultPrevented, 'Escape closes open settings modal');
  assert.equal(appUI.settingsModal.element.classList.contains('tt-modal-open'), false,
    'Settings modal animation class removed immediately on Escape');

  // --------------------------------------------------------------------------
  // Test 12: Reinjection defense & Single-listener invariant
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
  // Test 13: SPA Navigation & Live video element reconnection
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
  // Test 14: Clean Teardown / Dispose
  // --------------------------------------------------------------------------
  engine.dispose();
  assert.ok(!fakeWindow.listeners.some(x => x.type === 'keydown' && x.capture),
    'Dispose must remove capture listener with matching capture option');
  assert.equal(fakeWindow.__tt_playback_keydown__, undefined,
    'Dispose must clean up global listener reference');

  appUI.unmount();

  console.log('PASS keyboard playback suite: single +/-5s, stable clock, Space/K on player controls, focus, modifiers, repeat, reinjection & dispose');
} finally {
  engine?.dispose();
  appUI?.unmount();
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  if (originalLocalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalLocalStorage;
  if (originalRAF === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = originalRAF;
  if (originalCAF === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = originalCAF;
}
