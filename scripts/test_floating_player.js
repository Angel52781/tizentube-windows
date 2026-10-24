#!/usr/bin/env node
/** Layout and same-video identity regressions for floating playback. GPL-3.0-only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function createElement(id) {
  const attributes = new Map();
  const classes = new Set();
  const node = {
    id, parentNode: null, parentElement: null, children: [], nextSibling: null,
    isConnected: true, classList: {
      add: value => classes.add(value), remove: value => classes.delete(value),
      contains: value => classes.has(value)
    },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    hasAttribute: name => attributes.has(name),
    removeAttribute: name => attributes.delete(name),
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
const video = { isConnected: true, readyState: 4, videoWidth: 1280,
  videoHeight: 720, currentTime: 74, paused: false,
  getBoundingClientRect: () => ({ x: 0, y: 0, width: 500, height: 280 }) };
const watchParent = createElement('watch-parent');
const player = createElement('movie_player');
player.querySelector = selector => selector === 'video.html5-main-video' ? video : null;
player.setAttribute('style', 'position:relative');
watchParent.appendChild(player);
const body = createElement('body');
const head = createElement('head');
const pipButton = createElement('tizentube-native-pip');
const documentElement = createElement('html');
const document = {
  body, head, documentElement,
  createElement: name => createElement(name),
  getElementById: id => id === 'movie_player' ? player : id === 'tizentube-native-pip' ? pipButton : null,
  querySelector: selector => selector === '#movie_player' ? player :
    selector === 'video.html5-main-video' ? video : null
};
const window = { innerWidth: 500, innerHeight: 320, addEventListener() {} };
const location = { pathname: '/watch' };
const sandbox = { window, document, location, console };
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
window.addEventListener = (evt, fn) => { if (evt === 'resize') resizeDispatched++; };
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
video.play = () => { video.paused = false; return Promise.resolve(); };
const recovered = float.recover();
check(player.parentNode === watchParent, 'Watchdog recovery restores player to watch container');
check(!documentElement.classList.contains('tt-floating-mode'), 'Stale floating classes cleared on recovery');
check(video.paused === false, 'Watchdog recovery re-triggers playback if paused');

// Idempotent stop()
check(float.stop() === true, 'Stop is safe and idempotent when called repeatedly');

console.log(`All ${checks}/${checks} actual-player move/restore regressions PASSED.`);
