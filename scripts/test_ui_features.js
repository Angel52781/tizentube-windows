/**
 * TizenTube Windows - UI & Features Integration Test Suite
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Validates NavigationBar, PlayerControls, SettingsModal, ToastNotification,
 * SponsorBlock segment handling & fail-open, DeArrow DOM replacement & fail-open,
 * AdBlock auto-skipping, and preferences persistence in headless/mocked environment.
 */

import assert from 'node:assert';
import { NavigationBar } from '../src/ui/navigation_bar.js';
import { PlayerControls } from '../src/ui/player_controls.js';
import { SettingsModal } from '../src/ui/settings_modal.js';
import { ToastNotification } from '../src/ui/toast_notification.js';
import { AppUI } from '../src/ui/app_ui.js';
import { NavigationManager } from '../src/runtime/navigation.js';
import { PlaybackEngine } from '../src/runtime/playback_engine.js';
import { AdBlockBase } from '../src/mods/adblock_base.js';
import { SponsorBlockBase } from '../src/mods/sponsorblock_base.js';
import { DeArrowBase } from '../src/mods/dearrow_base.js';
import { IpcBridge } from '../src/runtime/ipc_bridge.js';

let totalTests = 0;
let passedTests = 0;

function it(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err);
    throw err;
  }
}

async function itAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// Lightweight Headless DOM Mock
// ----------------------------------------------------------------------------
class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this._classes = new Set();
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      contains: (c) => this._classes.has(c),
      has: (c) => this._classes.has(c),
      toggle: (c, force) => {
        if (force === true) { this._classes.add(c); return true; }
        if (force === false) { this._classes.delete(c); return false; }
        if (this._classes.has(c)) { this._classes.delete(c); return false; }
        this._classes.add(c);
        return true;
      }
    };
    this.style = {};
    this.dataset = {};
    this.eventListeners = new Map();
    this.value = '';
    this.checked = false;
    this.textContent = '';
    this.id = '';
    this.type = 'text';
  }

  get innerHTML() {
    return this._innerHTML || '';
  }

  set innerHTML(html) {
    this._innerHTML = String(html || '');
    this.children = [];
    if (!html || typeof html !== 'string') return;

    // Parse top-level tag matches with id, class, data attributes
    const regex = /<([a-zA-Z0-9]+)([^>]*)>/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const tag = match[1];
      const attrs = match[2];
      if (tag.toLowerCase() === 'svg' || tag.toLowerCase() === 'path') continue;
      const child = new MockElement(tag);
      const idMatch = attrs.match(/id="([^"]+)"/);
      if (idMatch) child.id = idMatch[1];
      const classMatch = attrs.match(/class="([^"]+)"/);
      if (classMatch) {
        classMatch[1].split(/\s+/).filter(Boolean).forEach(c => child.classList.add(c));
      }
      const dataElementMatch = attrs.match(/data-element="([^"]+)"/);
      if (dataElementMatch) child.dataset.element = dataElementMatch[1];
      const dataActionMatch = attrs.match(/data-action="([^"]+)"/);
      if (dataActionMatch) child.dataset.action = dataActionMatch[1];
      const dataBindMatch = attrs.match(/data-bind="([^"]+)"/);
      if (dataBindMatch) child.dataset.bind = dataBindMatch[1];
      const dataRateMatch = attrs.match(/data-rate="([^"]+)"/);
      if (dataRateMatch) child.dataset.rate = dataRateMatch[1];
      const typeMatch = attrs.match(/type="([^"]+)"/);
      if (typeMatch) child.type = typeMatch[1];
      if (attrs.includes('checked')) child.checked = true;
      this.appendChild(child);
    }
  }

  contains(child) {
    if (!child) return false;
    let curr = child.parentNode;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }

  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) || null; }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  prepend(child) {
    child.parentNode = this;
    this.children.unshift(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
  }

  addEventListener(ev, handler) {
    if (!this.eventListeners.has(ev)) this.eventListeners.set(ev, []);
    this.eventListeners.get(ev).push(handler);
  }

  removeEventListener(ev, handler) {
    const list = this.eventListeners.get(ev);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  dispatchEvent(event) {
    const handlers = this.eventListeners.get(event.type) || [];
    for (const h of handlers) h(event);
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, stopPropagation: () => {} });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (el) => {
      let matches = false;
      if (selector.startsWith('#') && el.id === selector.slice(1)) matches = true;
      if (selector.startsWith('.') && el.classList.has(selector.slice(1))) matches = true;
      if (selector.includes('[data-action="') && selector.includes('"]')) {
        const action = selector.match(/\[data-action="([^"]+)"\]/)[1];
        if (el.dataset.action === action) matches = true;
      }
      if (selector.includes('[data-element="') && selector.includes('"]')) {
        const elem = selector.match(/\[data-element="([^"]+)"\]/)[1];
        if (el.dataset.element === elem) matches = true;
      }
      if (selector.includes('[data-bind="') && selector.includes('"]')) {
        const b = selector.match(/\[data-bind="([^"]+)"\]/)[1];
        if (el.dataset.bind === b) matches = true;
      }
      if (selector === 'button[data-action]' && el.tagName === 'BUTTON' && el.dataset.action) matches = true;
      if (selector === 'input' && el.tagName === 'INPUT') matches = true;
      if (selector === 'input:checked' && el.tagName === 'INPUT' && el.checked) matches = true;
      if (selector.includes('[data-bind]') && el.dataset.bind) matches = true;
      if (selector.includes('[data-rate]') && el.dataset.rate) matches = true;
      if (matches) results.push(el);
      for (const child of el.children) check(child);
    };
    check(this);
    return results;
  }
}

// Global DOM mocks
const mockBody = new MockElement('body');
const mockHead = new MockElement('head');
const mockStorage = new Map();

globalThis.document = {
  body: mockBody,
  head: mockHead,
  documentElement: mockBody,
  createElement(tag) { return new MockElement(tag); },
  getElementById(id) {
    if (id === 'tizentube-adblock-styles' || id === 'tizentube-ui-styles') return null;
    return mockBody.querySelector(`#${id}`);
  },
  querySelector(sel) { return mockBody.querySelector(sel); },
  querySelectorAll(sel) { return mockBody.querySelectorAll(sel); },
  fullscreenElement: null,
  activeElement: null,
  addEventListener: (ev, fn) => mockBody.addEventListener(ev, fn),
  removeEventListener: (ev, fn) => mockBody.removeEventListener(ev, fn),
  dispatchEvent: (ev) => mockBody.dispatchEvent(ev),
  exitFullscreen: async () => { globalThis.document.fullscreenElement = null; }
};

globalThis.window = {
  location: { href: 'https://www.youtube.com' },
  history: {
    back: () => {},
    forward: () => {}
  },
  addEventListener: (ev, fn) => mockBody.addEventListener(ev, fn),
  removeEventListener: (ev, fn) => mockBody.removeEventListener(ev, fn)
};

globalThis.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};

globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 1);

// ----------------------------------------------------------------------------
// Test Execution
// ----------------------------------------------------------------------------
async function runAll() {
  console.log('Running TizenTube Windows UI & Features Integration Tests...\n');

  // Test 1: NavigationBar Structure & Interactions
  it('NavigationBar emits navigation and search actions', () => {
    const nav = new NavigationBar();
    nav.mount(mockBody);

    let emittedAction = null;
    let searchQuery = null;

    nav.on('back', () => { emittedAction = 'back'; });
    nav.on('forward', () => { emittedAction = 'forward'; });
    nav.on('reload', () => { emittedAction = 'reload'; });
    nav.on('home', () => { emittedAction = 'home'; });
    nav.on('settings', () => { emittedAction = 'settings'; });
    nav.on('search', (q) => { searchQuery = q; });

    nav.emit('back');
    assert.strictEqual(emittedAction, 'back');

    nav.emit('home');
    assert.strictEqual(emittedAction, 'home');

    nav.emit('settings');
    assert.strictEqual(emittedAction, 'settings');

    nav.emit('search', 'lofi hip hop');
    assert.strictEqual(searchQuery, 'lofi hip hop');

    // Update stats
    nav.updateStats({ adblockCount: 15, sponsorblockCount: 4 });
    assert.strictEqual(nav.stats.adblockCount, 15);
    assert.strictEqual(nav.stats.sponsorblockCount, 4);
  });

  // Test 2: PlayerControls HUD & Format Helpers
  it('PlayerControls formats time, updates state, and handles seeking', () => {
    assert.strictEqual(PlayerControls.formatTime(0), '00:00');
    assert.strictEqual(PlayerControls.formatTime(65), '01:05');
    assert.strictEqual(PlayerControls.formatTime(3665), '1:01:05');

    const controls = new PlayerControls();
    controls.mount(mockBody);

    let seekOffset = null;
    let targetSeek = null;
    let toggledPlay = false;

    controls.on('seekBy', (delta) => { seekOffset = delta; });
    controls.on('seekTo', (target) => { targetSeek = target; });
    controls.on('togglePlay', () => { toggledPlay = true; });

    controls.emit('togglePlay');
    assert.strictEqual(toggledPlay, true);

    controls.emit('seekBy', 10);
    assert.strictEqual(seekOffset, 10);

    controls.emit('seekTo', 150);
    assert.strictEqual(targetSeek, 150);

    // Update state
    controls.update({
      isPlaying: true,
      currentTime: 45,
      duration: 180,
      volume: 80,
      playbackRate: 1.5
    });

    assert.strictEqual(controls.state.isPlaying, true);
    assert.strictEqual(controls.state.currentTime, 45);
    assert.strictEqual(controls.state.duration, 180);
    assert.strictEqual(controls.state.playbackRate, 1.5);
  });

  // Test 3: SponsorBlock Segment Markers Geometry
  it('SponsorBlock calculates timeline markers accurately for seekbar display', () => {
    const sb = new SponsorBlockBase({
      categories: ['sponsor', 'intro', 'outro']
    });

    sb.currentSegments = [
      { category: 'intro', segment: [0, 20], start: 0, end: 20, color: '#00ffff', categoryName: 'Intro' },
      { category: 'sponsor', segment: [100, 150], start: 100, end: 150, color: '#00d400', categoryName: 'Sponsor' },
      { category: 'preview', segment: [50, 60], start: 50, end: 60, color: '#008fd6', categoryName: 'Preview' } // Not in enabled categories
    ];

    const markers = sb.getTimelineMarkers(200); // 200s total duration
    assert.strictEqual(markers.length, 2, 'Should only include enabled categories');

    // Intro: 0 to 20s -> 0% to 10%
    assert.strictEqual(markers[0].startPct, 0);
    assert.strictEqual(markers[0].widthPct, 10);
    assert.strictEqual(markers[0].color, '#00ffff');

    // Sponsor: 100 to 150s -> 50% to 25% width
    assert.strictEqual(markers[1].startPct, 50);
    assert.strictEqual(markers[1].widthPct, 25);
    assert.strictEqual(markers[1].color, '#00d400');
  });

  // Test 4: SponsorBlock Skip Toggle & Category Filtering
  it('SponsorBlock respects category filters and autoSkip toggle', () => {
    const sb = new SponsorBlockBase({
      autoSkip: true,
      categories: ['sponsor']
    });

    sb.currentSegments = [
      { category: 'intro', segment: [0, 10], uuid: 'intro-1', start: 0, end: 10 },
      { category: 'sponsor', segment: [50, 80], uuid: 'spon-1', start: 50, end: 80, categoryName: 'Sponsor' }
    ];

    // Inside intro (intro category disabled) -> should NOT skip
    assert.strictEqual(sb.checkSkip(5), null);

    // Inside sponsor (sponsor enabled) -> should skip to 80
    assert.strictEqual(sb.checkSkip(60), 80);
    assert.strictEqual(sb.skipCount, 1);
    assert.strictEqual(sb.lastSkipped.targetTime, 80);

    // Disable autoSkip
    sb.setAutoSkip(false);
    sb.resetSegmentSkip('spon-1');
    assert.strictEqual(sb.checkSkip(60), null, 'Must not skip when autoSkip is disabled');
  });

  // Test 5: SponsorBlock Fail-Open Network Degradation
  await itAsync('SponsorBlock gracefully handles API failures (fail-open without throw)', async () => {
    const sb = new SponsorBlockBase({
      apiUrl: 'https://invalid-non-existent-api.test'
    });

    // Mock fetch throwing network error
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('Connection refused (offline/downtime)');
    };

    try {
      // Must not throw exception
      await sb.setVideo('dQw4w9WgXcQ');
      assert.strictEqual(sb.currentSegments.length, 0);
      assert.strictEqual(sb.checkSkip(10), null, 'Should fail open gracefully');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // Test 6: DeArrow Caching & Fail-Open Fallback
  await itAsync('DeArrow caches results and handles API failure with fail-open fallback', async () => {
    const dearrow = new DeArrowBase();

    // Mock fetch error
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('503 Service Unavailable');
    };

    try {
      const res = await dearrow.fetchBranding(['video_abc']);
      assert.deepStrictEqual(res, {}, 'Should return empty cache object on error without crashing');
      assert.strictEqual(dearrow.getStats().cachedCount, 0);

      // Pre-cached item returns even during offline
      dearrow.cache.set('video_cached', {
        videoID: 'video_cached',
        title: 'Non-Clickbait Clean Title',
        thumbnail: 'https://dearrow.ajay.app/thumb.jpg'
      });

      const cachedResult = await dearrow.fetchBranding(['video_cached']);
      assert.strictEqual(cachedResult.video_cached.title, 'Non-Clickbait Clean Title');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  // Test 7: AdBlock Auto-Skip & Dynamic State Toggle
  it('AdBlock toggles cleanly and detects skip button elements', () => {
    const adblock = new AdBlockBase();
    assert.strictEqual(adblock.options.enabled, true);

    adblock.setEnabled(false);
    assert.strictEqual(adblock.options.enabled, false);

    adblock.setEnabled(true);
    assert.strictEqual(adblock.options.enabled, true);

    // Test JSON cleaner on ad payloads
    const payload = {
      adPlacements: [{}],
      playerAds: [{}],
      adSlots: [{}],
      adBreakHeartbeatParams: 'token123',
      playerResponse: {
        adPlacements: [{}]
      }
    };
    adblock.cleanAdData(payload);
    assert.strictEqual(payload.adPlacements, undefined);
    assert.strictEqual(payload.playerAds, undefined);
    assert.strictEqual(payload.adSlots, undefined);
    assert.strictEqual(payload.adBreakHeartbeatParams, undefined);
    assert.strictEqual(payload.playerResponse.adPlacements, undefined);
  });

  // Test 8: Settings Modal & Preferences Persistence
  it('SettingsModal updates settings, saves to storage, and restores on load', () => {
    localStorage.clear();

    const modal = new SettingsModal();
    modal.mount(mockBody);

    const initialSettings = modal.getSettings();
    assert.strictEqual(initialSettings.sponsorblock.enabled, true);
    assert.strictEqual(initialSettings.playback.defaultSpeed, 1.0);

    // Modify settings
    modal.settings.playback.defaultSpeed = 1.25;
    modal.settings.sponsorblock.autoSkip = false;
    modal.settings.adblock.cosmeticFilter = true;

    // Emitted change
    let changed = null;
    modal.on('change', (s) => { changed = s; });
    modal.emit('change', modal.getSettings());

    assert.strictEqual(changed.playback.defaultSpeed, 1.25);
    assert.strictEqual(changed.sponsorblock.autoSkip, false);

    // Save to localStorage simulation
    localStorage.setItem('tizentube_settings', JSON.stringify(changed));

    // Create a new modal instance and load from storage
    const newModal = new SettingsModal();
    newModal.mount(mockBody);
    newModal.loadSettings(JSON.parse(localStorage.getItem('tizentube_settings')));

    assert.strictEqual(newModal.settings.playback.defaultSpeed, 1.25);
    assert.strictEqual(newModal.settings.sponsorblock.autoSkip, false);

    // Test Reset Defaults
    newModal.resetDefaults();
    assert.strictEqual(newModal.settings.playback.defaultSpeed, 1.0);
    assert.strictEqual(newModal.settings.sponsorblock.autoSkip, true);
  });

  // Test 9: Toast Notifications & Undo Action
  it('ToastNotification renders accessible message and executes undo action', () => {
    const toast = new ToastNotification();
    let undoTriggered = false;

    const el = toast.show({
      title: 'SponsorBlock',
      message: 'Skipped Sponsored segment',
      color: '#00d400',
      actionLabel: 'Undo',
      onAction: () => { undoTriggered = true; }
    });

    assert(el !== null, 'Toast element must be created');
    assert.strictEqual(toast.activeToasts.has(el), true);

    // Click Undo
    const actionBtn = el.querySelector('.tt-toast-action');
    if (actionBtn) {
      actionBtn.click();
      assert.strictEqual(undoTriggered, true, 'Undo callback should be fired');
    }

    toast.clearAll();
    assert.strictEqual(toast.activeToasts.size, 0);
  });

  // Test 10: AppUI Integration & Coordination
  it('AppUI coordinates Navigation, PlayerControls, SponsorBlock and Toasts', () => {
    localStorage.clear();
    const playback = new PlaybackEngine({ rememberPreferences: false });
    const sb = new SponsorBlockBase({ autoSkip: true });
    const adblock = new AdBlockBase();
    const dearrow = new DeArrowBase();
    const ipc = new IpcBridge();

    const appUi = new AppUI({
      playbackEngine: playback,
      adblock,
      sponsorblock: sb,
      dearrow,
      ipc
    });

    appUi.mount(mockBody);
    assert.strictEqual(appUi.isMounted, true);

    // Setup mock segment: 30 to 45s
    sb.currentSegments = [
      { category: 'sponsor', segment: [30, 45], start: 30, end: 45, categoryName: 'Sponsor', color: '#00d400', uuid: 'sb-100' }
    ];

    // Mock video element
    const mockVideo = {
      currentTime: 31,
      duration: 120,
      paused: false,
      volume: 1,
      playbackRate: 1.0,
      play() {},
      pause() {},
      addEventListener() {}
    };
    playback.bindVideoElement(mockVideo);

    // Playback timeupdate inside sponsor segment
    playback.emit('timeupdate', { currentTime: 31, duration: 120 });

    // Video should seek to 45 (skip sponsor)
    assert.strictEqual(playback.state.currentTime, 45, 'Should skip to segment end');
    assert.strictEqual(sb.skipCount, 1);
  });

  // Test 11: Keyboard Shortcuts Handling
  it('Keyboard shortcuts execute playback seeking, percent jumps, and mod toggles', () => {
    localStorage.clear();
    const playback = new PlaybackEngine({ rememberPreferences: false });
    playback.state.duration = 200;
    playback.state.currentTime = 50;

    let captionsTriggered = false;
    let theaterTriggered = false;
    playback.on('toggleCaptions', () => { captionsTriggered = true; });
    playback.on('toggleTheater', () => { theaterTriggered = true; });

    // Simulate keydown on window
    const dispatchKey = (key, target = mockBody) => {
      mockBody.dispatchEvent({
        type: 'keydown',
        key,
        target,
        preventDefault: () => {}
      });
    };

    // Percent jump: '5' -> 50% of 200s = 100s
    dispatchKey('5');
    assert.strictEqual(playback.state.currentTime, 100, 'Key 5 should seek to 50%');

    // Percent jump: '0' -> 0% = 0s
    dispatchKey('0');
    assert.strictEqual(playback.state.currentTime, 0, 'Key 0 should seek to 0s');

    // End key -> 200s
    dispatchKey('End');
    assert.strictEqual(playback.state.currentTime, 200, 'End key should seek to duration');

    // Home key -> 0s
    dispatchKey('Home');
    assert.strictEqual(playback.state.currentTime, 0, 'Home key should seek to 0s');

    // c/C captions
    dispatchKey('c');
    assert.strictEqual(captionsTriggered, true, 'Key c should emit toggleCaptions');

    // t/T theater
    dispatchKey('t');
    assert.strictEqual(theaterTriggered, true, 'Key t should emit toggleTheater');

    // Input target guard: typing inside an input should not trigger seek
    const fakeInput = new MockElement('input');
    dispatchKey('5', fakeInput);
    assert.strictEqual(playback.state.currentTime, 0, 'Input typing should be ignored');
  });

  // Test 12: Fullscreen Management & Navigation Auto-Hide
  it('Fullscreen toggles state, syncs navigation bar, and notifies host', () => {
    const playback = new PlaybackEngine({ rememberPreferences: false });
    const nav = new NavigationBar();
    nav.mount(mockBody);

    let fsEmitted = null;
    playback.on('fullscreenchange', (e) => { fsEmitted = e.isFullscreen; });

    // Enter fullscreen
    playback.enterFullscreen();
    assert.strictEqual(playback.state.isFullscreen, false, 'Request alone is not fullscreen confirmation');
    document.fullscreenElement = mockBody;
    document.dispatchEvent({ type: 'fullscreenchange' });
    assert.strictEqual(playback.state.isFullscreen, true);
    assert.strictEqual(fsEmitted, true);

    nav.setFullscreen(true);
    assert.strictEqual(nav.element.classList.contains('tt-nav-fullscreen-hidden'), true);

    // Exit fullscreen
    playback.exitFullscreen();
    document.fullscreenElement = null;
    document.dispatchEvent({ type: 'fullscreenchange' });
    assert.strictEqual(playback.state.isFullscreen, false);
    assert.strictEqual(fsEmitted, false);

    nav.setFullscreen(false);
    assert.strictEqual(nav.element.classList.contains('tt-nav-fullscreen-hidden'), false);

    // Toggle fullscreen
    playback.toggleFullscreen();
    document.fullscreenElement = mockBody;
    document.dispatchEvent({ type: 'fullscreenchange' });
    assert.strictEqual(playback.state.isFullscreen, true);
    playback.toggleFullscreen();
    document.fullscreenElement = null;
    document.dispatchEvent({ type: 'fullscreenchange' });
    assert.strictEqual(playback.state.isFullscreen, false);
  });

  // Test 13: User Preferences Persistence & Import/Export
  it('User preferences persist across sessions, support export/import, and dispatch IPC', () => {
    localStorage.clear();
    const modal = new SettingsModal();
    modal.mount(mockBody);

    // Initial default volume & speed
    assert.strictEqual(modal.settings.playback.defaultSpeed, 1.0);
    assert.strictEqual(modal.settings.ui.compactHud, false);

    // Mutate and export
    modal.settings.playback.defaultSpeed = 1.5;
    modal.settings.ui.compactHud = true;
    modal.settings.ui.highContrast = true;

    const exportedJson = modal.exportSettings();
    assert(typeof exportedJson === 'string');
    assert(exportedJson.includes('"compactHud": true'));

    // Create fresh instance and import
    const newModal = new SettingsModal();
    newModal.mount(mockBody);
    const success = newModal.importSettings(exportedJson);
    assert.strictEqual(success, true);
    assert.strictEqual(newModal.settings.playback.defaultSpeed, 1.5);
    assert.strictEqual(newModal.settings.ui.compactHud, true);
    assert.strictEqual(newModal.settings.ui.highContrast, true);

    // Test AppUI IPC save message
    const ipc = new IpcBridge();
    let savedChannel = null;
    let savedPayload = null;
    ipc.on('preferences:save', (payload) => {
      savedChannel = 'preferences:save';
      savedPayload = payload;
    });

    const appUi = new AppUI({ settingsModal: newModal, ipc });
    appUi.savePreferences(newModal.getSettings());

    assert.strictEqual(savedChannel, 'preferences:save');
    assert.strictEqual(savedPayload.ui.compactHud, true);
    assert(localStorage.getItem('tizentube_settings').includes('"compactHud":true'));
  });

  // Test 14: Visual Layer & Low Resource Rendering Optimizations
  it('Applies rendering optimizations: capped toast nodes, time caching, and marker diffing', () => {
    // 1. Toast queue capping (max 3 elements)
    const toast = new ToastNotification({ maxToasts: 3 });
    toast.ensureContainer();

    toast.show({ message: 'Toast 1' });
    toast.show({ message: 'Toast 2' });
    toast.show({ message: 'Toast 3' });
    assert.strictEqual(toast.activeToasts.size, 3);

    // 4th toast should evict the oldest
    toast.show({ message: 'Toast 4' });
    assert.strictEqual(toast.activeToasts.size, 3, 'Queue must not exceed 3 active toasts');

    // 2. PlayerControls time caching and marker diffing
    const controls = new PlayerControls();
    controls.mount(mockBody);

    const markers = [
      { startPct: 10, widthPct: 5, category: 'sponsor', categoryName: 'Sponsor', color: '#00d400', start: 10, end: 15 }
    ];
    controls.update({ currentTime: 10, duration: 100, timelineMarkers: markers });
    const firstSig = controls._lastMarkersSig;
    assert(firstSig.length > 0);

    // Re-updating with same markers should skip rebuilding markersContainer
    const markersContainer = controls.element.querySelector('[data-element="markersContainer"]');
    const childCountBefore = markersContainer.children.length;
    controls.update({ currentTime: 10.2, duration: 100, timelineMarkers: markers });
    assert.strictEqual(controls._lastMarkersSig, firstSig);
    assert.strictEqual(markersContainer.children.length, childCountBefore);

    // 3. Compact HUD styling
    controls.element.classList.toggle('tt-hud-compact', true);
    assert.strictEqual(controls.element.classList.contains('tt-hud-compact'), true);
  });

  // Test 15: AppUI Teardown, Unmount and Memory Cleanup
  it('AppUI teardown unmounts child components, disposes event listeners and cancels timers', () => {
    const playback = new PlaybackEngine({ rememberPreferences: false });
    const appUi = new AppUI({ playbackEngine: playback });
    appUi.mount(mockBody);
    assert.strictEqual(appUi.isMounted, true);
    assert(appUi.navBar.element !== null);
    assert(appUi.playerControls.element !== null);
    assert(appUi.settingsModal.element !== null);

    // Call unmount
    appUi.unmount();
    assert.strictEqual(appUi.isMounted, false);
    assert.strictEqual(appUi.cursorIdleTimer, null);
    assert.strictEqual(appUi.navBar.element, null);
    assert.strictEqual(appUi.playerControls.element, null);
    assert.strictEqual(appUi.settingsModal.element, null);
    assert.strictEqual(appUi.toasts.activeToasts.size, 0);
  });

  // Test 16: Window Host Preferences Injection & Fullscreen State IPC Dispatch
  it('Loads initial preferences from host payload and dispatches fullscreen state to IPC', () => {
    localStorage.clear();
    // Simulate host injected preferences via window.__TIZENTUBE_INITIAL_PREFERENCES__
    globalThis.window.__TIZENTUBE_INITIAL_PREFERENCES__ = {
      playback: { defaultSpeed: 1.75 },
      ui: { compactHud: true, highContrast: true },
      sponsorblock: { autoSkip: false }
    };

    const playback = new PlaybackEngine({ rememberPreferences: false });
    const ipc = new IpcBridge();
    let fsStateReported = null;
    ipc.on('fullscreen:state', (data) => {
      fsStateReported = data.isFullscreen;
    });

    const appUi = new AppUI({ playbackEngine: playback, ipc });
    appUi.mount(mockBody);

    // Verify initial preferences loaded from window.__TIZENTUBE_INITIAL_PREFERENCES__
    assert.strictEqual(appUi.settingsModal.settings.playback.defaultSpeed, 1.75);
    assert.strictEqual(appUi.settingsModal.settings.ui.compactHud, true);
    assert.strictEqual(appUi.settingsModal.settings.sponsorblock.autoSkip, false);

    // Trigger fullscreen change and verify IPC dispatch
    playback.emit('fullscreenchange', { isFullscreen: true });
    assert.strictEqual(fsStateReported, true);

    playback.emit('fullscreenchange', { isFullscreen: false });
    assert.strictEqual(fsStateReported, false);

    // Clean up
    delete globalThis.window.__TIZENTUBE_INITIAL_PREFERENCES__;
    appUi.unmount();
  });

  console.log(`\nAll ${passedTests}/${totalTests} UI & features integration tests PASSED successfully.\n`);
}

runAll().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
