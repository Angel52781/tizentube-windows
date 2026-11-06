#!/usr/bin/env node
/** Layout and same-video identity regressions for floating playback. GPL-3.0-only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }

function createElement(id, tagName = '') {
  const attributes = new Map();
  const classes = new Set();
  const listeners = new Map();
  const tag = (tagName || id || '').toUpperCase();
  const node = {
    id, tagName: tag, parentNode: null, parentElement: null, children: [], nextSibling: null,
    isConnected: true, textContent: '', title: '', value: '',
    get className() { return Array.from(classes).join(' '); },
    set className(val) {
      classes.clear();
      if (typeof val === 'string') {
        val.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      }
    },
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value)
    },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    hasAttribute: name => attributes.has(name),
    removeAttribute: name => attributes.delete(name),
    addEventListener: (evt, fn) => {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (!listeners.has(evt)) return;
      listeners.set(evt, listeners.get(evt).filter(f => f !== fn));
    },
    dispatchEvent(evt) {
      const type = typeof evt === 'string' ? evt : evt?.type;
      const fns = listeners.get(type) || [];
      const eventObj = typeof evt === 'string' ? { type: evt, target: node, preventDefault() {}, stopPropagation() {} }
        : { target: node, preventDefault() {}, stopPropagation() {}, ...evt };
      for (const fn of fns) fn(eventObj);
    },
    click() {
      const fns = listeners.get('click') || [];
      for (const fn of fns) fn({ stopPropagation() {}, preventDefault() {}, target: node });
    },
    appendChild(child) { return this.insertBefore(child, null); },
    insertBefore(child, ref) {
      const previous = child.parentNode;
      if (previous) previous.children.splice(previous.children.indexOf(child), 1);
      const index = ref ? this.children.indexOf(ref) : -1;
      this.children.splice(index >= 0 ? index : this.children.length, 0, child);
      child.parentNode = this; child.parentElement = this;
      return child;
    },
    moveBefore(child, ref) { return this.insertBefore(child, ref); },
    remove() {
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentElement = null; this.parentNode = null;
    }
  };
  return node;
}

const videoListeners = new Map();
const video = {
  isConnected: true, readyState: 4, videoWidth: 1280,
  videoHeight: 720, currentTime: 74, duration: 300, paused: false,
  muted: false, volume: 1.0,
  pause() {
    this.paused = true;
    this.dispatchEvent('pause');
  },
  play() {
    this.paused = false;
    this.dispatchEvent('play');
    return Promise.resolve();
  },
  getBoundingClientRect: () => ({ x: 0, y: 0, width: 500, height: 280 }),
  addEventListener(evt, fn) {
    if (!videoListeners.has(evt)) videoListeners.set(evt, []);
    videoListeners.get(evt).push(fn);
  },
  removeEventListener(evt, fn) {
    if (!videoListeners.has(evt)) return;
    videoListeners.set(evt, videoListeners.get(evt).filter(f => f !== fn));
  },
  dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : evt?.type;
    const fns = videoListeners.get(type) || [];
    const eventObj = typeof evt === 'string' ? { type: evt, target: this } : { target: this, ...evt };
    for (const fn of fns) fn(eventObj);
  }
};

const watchParent = createElement('watch-parent');
const player = createElement('movie_player');
player.querySelector = selector => selector === 'video.html5-main-video' ? video : null;
player.setAttribute('style', 'position:relative');
watchParent.appendChild(player);
const body = createElement('body');
const head = createElement('head');
const pipButton = createElement('tizentube-native-pip');
const documentElement = createElement('html');

function findById(root, targetId) {
  if (!root) return null;
  if (root.id === targetId) return root;
  for (const child of root.children || []) {
    const found = findById(child, targetId);
    if (found) return found;
  }
  return null;
}

let activeElementMock = null;
const document = {
  body, head, documentElement,
  get activeElement() { return activeElementMock; },
  createElement: name => createElement(name),
  getElementById: id => (id === 'movie_player' ? player :
    id === 'tizentube-native-pip' ? pipButton :
    findById(body, id) || findById(head, id) || null),
  querySelector: selector => selector === '#movie_player' ? player :
    selector === 'video.html5-main-video' ? video : null
};

const postedMessages = [];
const windowListeners = new Map();
const window = {
  innerWidth: 500,
  innerHeight: 320,
  addEventListener(evt, fn) {
    if (!windowListeners.has(evt)) windowListeners.set(evt, []);
    windowListeners.get(evt).push(fn);
  },
  removeEventListener(evt, fn) {
    if (!windowListeners.has(evt)) return;
    windowListeners.set(evt, windowListeners.get(evt).filter(f => f !== fn));
  },
  dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : evt?.type;
    const fns = windowListeners.get(type) || [];
    const eventObj = typeof evt === 'string' ? { type: evt } : evt;
    for (const fn of fns) fn(eventObj);
  },
  chrome: {
    webview: {
      postMessage: msg => {
        postedMessages.push(msg);
        if (msg.channel === 'window:restore-floating') {
          float.stop();
        } else if (msg.channel === 'window:close-floating') {
          float.stop(true);
        }
      }
    }
  }
};
const location = { pathname: '/watch' };
const sandbox = { window, document, location, console, setTimeout, clearTimeout };
vm.runInNewContext(readFileSync(new URL('../src/native/floating_player.js', import.meta.url), 'utf8'), sandbox);
const float = window.__ttFloating;

check(typeof float.start === 'function' && typeof float.stop === 'function', 'Embedded controller is available');
check(float.start(), 'Ready video can enter floating mode');
check(player.parentNode === body, 'Same player moved outside clipped YouTube ancestors');
check(player.querySelector('video.html5-main-video') === video && video.currentTime === 74,
  'Same video node and playback time retained');
check(documentElement.classList.contains('tt-floating-mode'), 'Floating layout flag activated');
check(pipButton.getAttribute('aria-pressed') === 'true', 'Player button indicates active state');
check(float.diagnostics().videoWidth === 1280 && float.diagnostics().playerInBody,
  'Diagnostics reports real media and body layout');
check(float.stop(), 'Player can exit floating mode');
check(player.parentNode === watchParent && player.getAttribute('style') === 'position:relative',
  'Player and original styles restored to source location');
check(pipButton.getAttribute('aria-pressed') === 'false', 'Player button reset on restore');
video.readyState = 0;
check(float.start() === false && player.parentNode === watchParent,
  'Unready media never opens a black floating window');
location.pathname = '/'; video.readyState = 4;
check(float.start() === false, 'Home feed cannot activate floating window');

// Regression P0 (F01/F02): Cycle Normal -> Theater -> Floating -> Fullscreen -> Return
location.pathname = '/watch'; video.readyState = 4; video.paused = false; video.currentTime = 100;
let resizeDispatched = 0;
window.addEventListener('resize', () => { resizeDispatched++; });
check(float.start(), 'Enters floating from normal/theater playback');
check(player.parentNode === body && float.diagnostics().playerInBody, 'Player attached to body in floating mode');
check(pipButton.getAttribute('aria-pressed') === 'true', 'Pip button aria-pressed true in floating mode');

// Entering fullscreen while floating invokes stop() to return #movie_player to container
check(float.stop(), 'Host invokes stop() when transitioning to fullscreen');
check(player.parentNode === watchParent, 'Player returned to original container before fullscreen');
check(!documentElement.classList.contains('tt-floating-mode'), 'Floating mode class removed');
check(pipButton.getAttribute('aria-pressed') === 'false', 'Pip button aria-pressed reset on fullscreen transition');
check(video.videoWidth === 1280 && video.readyState === 4, 'Video readiness and dimensions preserved');
check(video.currentTime >= 100, 'Video playback position preserved across fullscreen transition');

// Fullscreen gating: starting floating while in DOM fullscreen must be rejected
document.fullscreenElement = player;
check(float.start() === false, 'Cannot start floating mode while already in fullscreen');
document.fullscreenElement = null;

// Return transition: exiting fullscreen allows re-entering floating smoothly
video.currentTime = 120;
check(float.start(), 'Can re-enter floating mode after returning from fullscreen');
check(player.parentNode === body && float.diagnostics().playerInBody, 'Player re-attached to body on second floating entry');
check(float.stop(), 'Returns cleanly to normal/theater watch container');
check(player.parentNode === watchParent, 'Player returned to watch container upon exit');

// Regression F03/F04: Recovery from orphaned body state
body.appendChild(player); // simulate corrupted or disconnected parent state
watchParent.isConnected = true;
document.querySelector = selector => selector === '#movie_player' ? player :
  selector === 'video.html5-main-video' ? video :
  (selector.includes('watch-flexy') || selector.includes('#player')) ? watchParent : null;
video.paused = true;
video.play = () => { video.paused = false; video.dispatchEvent('play'); return Promise.resolve(); };
const recovered = float.recover();
check(player.parentNode === watchParent, 'Watchdog recovery restores player to watch container');
check(!documentElement.classList.contains('tt-floating-mode'), 'Stale floating classes cleared on recovery');
check(video.paused === false, 'Watchdog recovery re-triggers playback if paused');

// Idempotent stop()
check(float.stop() === true, 'Stop is safe and idempotent when called repeatedly');

// ============================================================================
// Differentiated Restore vs Close Lifecycle & Controls Tests
// ============================================================================
// 1. Enter floating mode and verify distinct header buttons & diagnostics
location.pathname = '/watch';
video.readyState = 4;
video.paused = false;
video.currentTime = 50;
video.duration = 240;
postedMessages.length = 0;

check(float.start(), 'Enter floating mode for lifecycle and controls verification');
const diag = float.diagnostics();
check(diag.active === true, 'Diagnostics reports active floating state');
check(diag.restoreButtonPresent === true, 'Restore button is present in header overlay');
check(diag.closeButtonPresent === true, 'Close button is present in header overlay');
check(diag.rewindButtonPresent === true, 'Rewind button is present in center overlay');
check(diag.playButtonPresent === true, 'Play/pause button is present in center overlay');
check(diag.forwardButtonPresent === true, 'Forward button is present in center overlay');
check(diag.progressBarPresent === true, 'Progress bar is present in footer overlay');
check(diag.timeDisplayPresent === true, 'Time display is present in footer overlay');
check(diag.volumeButtonPresent === true, 'Volume button is present in footer overlay');
check(diag.volumeSliderPresent === true, 'Volume slider is present in footer overlay');
check(diag.overlayPresent === true, 'Complete overlay container is present');
check(diag.duration === 240, 'Diagnostics reports media duration');

const restoreBtn = document.getElementById('tt-floating-restore-btn');
const closeBtn = document.getElementById('tt-floating-close-btn');
check(restoreBtn !== null, 'Restore button element resolved by ID');
check(closeBtn !== null, 'Close button element resolved by ID');
check(restoreBtn.textContent === '⤢', 'Restore button has correct expand symbol');
check(closeBtn.textContent === '✕', 'Close button has correct close symbol');
check(restoreBtn.getAttribute('aria-label') === 'Volver a ventana', 'Restore button has accessible aria-label');
check(closeBtn.getAttribute('aria-label') === 'Cerrar', 'Close button has accessible aria-label');
check(restoreBtn.classList.contains('tt-float-btn-restore'), 'Restore button has styling class');
check(closeBtn.classList.contains('tt-float-btn-close'), 'Close button has styling class');

// 2. Center controls verification (-10, Play/Pause, +10)
const rewindBtn = document.getElementById('tt-floating-rewind-btn');
const playBtn = document.getElementById('tt-floating-play-btn');
const forwardBtn = document.getElementById('tt-floating-forward-btn');
check(rewindBtn !== null, 'Rewind button element resolved by ID');
check(playBtn !== null, 'Play button element resolved by ID');
check(forwardBtn !== null, 'Forward button element resolved by ID');
check(rewindBtn.textContent === '-10', 'Rewind button displays -10');
check(forwardBtn.textContent === '+10', 'Forward button displays +10');
check(rewindBtn.getAttribute('aria-label') === 'Retroceder 10 segundos', 'Rewind button has accessible aria-label');
check(forwardBtn.getAttribute('aria-label') === 'Avanzar 10 segundos', 'Forward button has accessible aria-label');
check(playBtn.textContent === '❚❚', 'Play button displays pause symbol when video is playing');

// Click center rewind / forward buttons
video.currentTime = 50;
rewindBtn.click();
check(video.currentTime === 40, 'Rewind button click subtracts 10s from video position');
forwardBtn.click();
check(video.currentTime === 50, 'Forward button click adds 10s to video position');

// Click center play/pause button
playBtn.click();
check(video.paused === true, 'Play button click pauses active video');
check(playBtn.textContent === '▶', 'Play button displays play symbol when video is paused');
check(playBtn.getAttribute('aria-label') === 'Reproducir', 'Play button updates aria-label when paused');
playBtn.click();
check(video.paused === false, 'Play button click resumes playback');
check(playBtn.textContent === '❚❚', 'Play button displays pause symbol when resumed');

// 3. Progress bar & time display verification
const progressBar = document.getElementById('tt-floating-progress-bar');
const timeDisplay = document.getElementById('tt-floating-time-display');
check(progressBar !== null, 'Progress bar input element resolved by ID');
check(timeDisplay !== null, 'Time display element resolved by ID');
check(progressBar.getAttribute('role') === 'slider', 'Progress bar declares role="slider"');
check(progressBar.getAttribute('aria-label') === 'Progreso de reproducción', 'Progress bar has accessible aria-label');
check(timeDisplay.textContent.includes('0:50') && timeDisplay.textContent.includes('4:00'),
  'Time display reflects current position and total duration (0:50 / 4:00)');

// Progress bar scrubbing simulation
progressBar.dispatchEvent({ type: 'input', target: { value: '50' } });
progressBar.dispatchEvent({ type: 'change', target: { value: '50' } });
check(video.currentTime === 120, 'Progress bar change sets currentTime to 50% of duration (120s)');
check(timeDisplay.textContent.includes('2:00') && timeDisplay.textContent.includes('4:00'),
  'Time display updates after scrub to 2:00 / 4:00');

// 4. Volume controls verification
const volumeBtn = document.getElementById('tt-floating-volume-btn');
const volumeSlider = document.getElementById('tt-floating-volume-slider');
check(volumeBtn !== null, 'Volume button element resolved by ID');
check(volumeSlider !== null, 'Volume slider element resolved by ID');
check(volumeBtn.textContent === '🔊', 'Volume button indicates high volume');
volumeBtn.click();
check(video.muted === true, 'Volume button click mutes playback');
check(volumeBtn.textContent === '🔇', 'Volume button displays muted icon');
volumeBtn.click();
check(video.muted === false, 'Volume button click un-mutes playback');

// Volume slider adjust
volumeSlider.dispatchEvent({ type: 'input', target: { value: '0.4' } });
check(video.volume === 0.4, 'Volume slider input updates video.volume to 0.4');

// 5. Relative seek contract
check(float.seek(10) === 130 && video.currentTime === 130, 'float.seek(+10) advances time by 10s');
check(float.seek(-20) === 110 && video.currentTime === 110, 'float.seek(-20) rewinds time by 20s');
check(float.seek(-200) === 0 && video.currentTime === 0, 'float.seek(-200) clamps to lower bound 0');
check(float.seek(500) === 240 && video.currentTime === 240, 'float.seek(500) clamps to upper bound duration 240');
video.currentTime = 65;

// 6. Keyboard navigation & Focus Authority inside floating player
// Space / K: toggle play/pause
window.dispatchEvent({ type: 'keydown', key: ' ' });
check(video.paused === true, 'Space on global floating window pauses playback');
window.dispatchEvent({ type: 'keydown', key: 'k' });
check(video.paused === false, 'K on global floating window resumes playback');

// J / L: +/-10s seek
window.dispatchEvent({ type: 'keydown', key: 'j' });
check(video.currentTime === 55, 'J seeks backward 10s');
window.dispatchEvent({ type: 'keydown', key: 'l' });
check(video.currentTime === 65, 'L seeks forward 10s');

// Left / Right Arrow: +/-5s seek
window.dispatchEvent({ type: 'keydown', key: 'ArrowLeft' });
check(video.currentTime === 60, 'Left arrow seeks backward 5s');
window.dispatchEvent({ type: 'keydown', key: 'ArrowRight' });
check(video.currentTime === 65, 'Right arrow seeks forward 5s');

// Up / Down Arrow: volume +/- 5%
video.volume = 0.5;
window.dispatchEvent({ type: 'keydown', key: 'ArrowUp' });
check(video.volume === 0.55, 'ArrowUp increases volume by 5%');
window.dispatchEvent({ type: 'keydown', key: 'ArrowDown' });
check(video.volume === 0.5, 'ArrowDown decreases volume by 5%');

// M key: toggle mute
video.muted = false;
window.dispatchEvent({ type: 'keydown', key: 'm' });
check(video.muted === true, 'M key toggles mute on');
window.dispatchEvent({ type: 'keydown', key: 'm' });
check(video.muted === false, 'M key toggles mute off');

// Focus authority: focused button receives Space without global interception
let restoreClicked = 0;
restoreBtn.addEventListener('click', () => { restoreClicked++; });
activeElementMock = restoreBtn;
window.dispatchEvent({ type: 'keydown', key: ' ' });
// Focus authority: because activeElementMock is a button, onKeyDown lets button handle activation
check(video.paused === false, 'Focused button preserves focus authority (no double playback toggle)');
activeElementMock = null;

// 7. RESTORE command: preserves same video, same instance, and playing state
postedMessages.length = 0;
video.currentTime = 88;
video.paused = false;
restoreBtn.click();
check(postedMessages.some(m => m.channel === 'window:restore-floating'),
  'Restore button click posts window:restore-floating IPC message');
check(video.paused === false, 'Restore DOES NOT pause playback; video continues running seamlessly');
check(video.currentTime === 88, 'Restore preserves exact playback position');
check(player.querySelector('video.html5-main-video') === video, 'Same video instance preserved on restore');
check(player.parentNode === watchParent, 'Player returned to watch layout on restore');
check(!documentElement.classList.contains('tt-floating-mode'), 'Floating layout class removed on restore');

// 8. Direct float.restore() invocation while paused
check(float.start(), 'Re-enter floating mode');
video.paused = true;
video.currentTime = 92;
postedMessages.length = 0;
float.restore();
check(postedMessages.some(m => m.channel === 'window:restore-floating'),
  'float.restore() posts window:restore-floating message');
check(video.paused === true, 'Paused state preserved on restore without unpausing unexpectedly');
check(video.currentTime === 92, 'Playback time preserved on restore');

// 9. CLOSE / DISMISS command: pauses playback, cleans up DOM, sends window:close-floating
check(float.start(), 'Re-enter floating mode for close test');
video.paused = false;
video.currentTime = 110;
postedMessages.length = 0;
const closeBtn2 = document.getElementById('tt-floating-close-btn');
closeBtn2.click();
check(postedMessages.some(m => m.channel === 'window:close-floating'),
  'Close button click posts window:close-floating IPC message');
check(video.paused === true, 'Close pauses video playback immediately to silence audio');
check(video.currentTime === 110, 'Playback time preserved at pause point for session recoverability');
check(player.parentNode === watchParent, 'Player returned to watch container upon dismissal');
check(!documentElement.classList.contains('tt-floating-mode'), 'Floating layout class removed upon dismissal');

// 10. Direct float.close() invocation
check(float.start(), 'Re-enter floating mode for direct float.close()');
video.paused = false;
video.currentTime = 145;
postedMessages.length = 0;
float.close();
check(postedMessages.some(m => m.channel === 'window:close-floating'),
  'float.close() posts window:close-floating message');
check(video.paused === true, 'Direct close pauses playback');
check(video.currentTime === 145, 'Time preserved on direct close');

// 11. Escape and F9 restore shortcuts
check(float.start(), 'Re-enter floating mode for Escape shortcut test');
postedMessages.length = 0;
window.dispatchEvent({ type: 'keydown', key: 'Escape' });
check(postedMessages.some(m => m.channel === 'window:restore-floating'),
  'Escape key posts window:restore-floating');

check(float.start(), 'Re-enter floating mode for F9 shortcut test');
postedMessages.length = 0;
window.dispatchEvent({ type: 'keydown', key: 'F9' });
check(postedMessages.some(m => m.channel === 'window:restore-floating'),
  'F9 key posts window:restore-floating');

console.log(`All ${checks}/${checks} actual-player move/restore regressions PASSED.`);
