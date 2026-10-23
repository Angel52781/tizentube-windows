#!/usr/bin/env node
/**
 * Regression: Spanish YouTube sponsored homepage cards must not survive
 * document-start injection or SPA feed refreshes. GPL-3.0-only.
 */
import assert from 'node:assert/strict';
import { AdBlockBase } from '../src/mods/adblock_base.js';

let passed = 0;
const check = (actual, expected, name) => {
  assert.deepEqual(actual, expected, name);
  console.log(`  [PASS] ${name}`);
  passed++;
};

const block = new AdBlockBase({ autoSkipVideoAds: false });
const oldDocument = globalThis.document;
const oldMutationObserver = globalThis.MutationObserver;
const oldRaf = globalThis.requestAnimationFrame;
const nativeResponseJson = Response.prototype.json;
const nativeJsonParse = JSON.parse;
const events = new Map();
const observers = [];
let css = null;
let markers = [];
let feedCards = [];
const card = {
  attributes: {},
  getAttribute(name) { return this.attributes[name] ?? null; },
  setAttribute(name, value) { this.attributes[name] = value; }
};
const marker = { closest() { return card; } };
const document = {
  body: null,
  head: null,
  documentElement: null,
  getElementById(id) { return css?.id === id ? css : null; },
  createElement(tag) { return { tag, id: '', textContent: '', parentNode: null }; },
  addEventListener(name, fn) { events.set(name, fn); },
  removeEventListener(name) { events.delete(name); },
  querySelectorAll(selector) {
    return selector.startsWith('ytd-rich-item-renderer, ytd-rich-section-renderer') ? feedCards : markers;
  }
};
globalThis.document = document;
globalThis.MutationObserver = class {
  constructor(callback) { this.callback = callback; observers.push(this); }
  observe(element, options) { this.element = element; this.options = options; }
  disconnect() { this.disconnected = true; }
};
globalThis.requestAnimationFrame = fn => fn();

try {
  block.install();
  check(block.isHooked, true, 'Early injection installs response hooks');
  check(events.has('DOMContentLoaded'), true, 'Document-start injection defers cosmetic rules');
  check(css, null, 'No style before documentElement exists');

  document.body = { nodeType: 1 };
  document.head = {
    appendChild(element) { element.parentNode = this; css = element; },
    removeChild(element) { if (css === element) css = null; }
  };
  document.documentElement = document.head;
  events.get('DOMContentLoaded')();
  check(css?.id, 'tizentube-adblock-styles', 'Cosmetic rules installed after DOM ready');
  check(css.textContent.includes('ytd-video-masthead-ad-v3-renderer'), true, 'Large homepage masthead ad covered');
  check(css.textContent.includes('ytd-rich-item-renderer:has(ytd-ad-slot-renderer)'), true, 'Sponsored feed wrapper covered');
  check(observers.length, 1, 'SPA observer starts even without the video-ad skip observer');

  markers = [marker];
  observers[0].callback([{ addedNodes: [marker] }]);
  check(card.getAttribute('data-tizentube-sponsored'), 'true', 'Dynamically injected ad card is marked for hiding');
  check(block.blockedCount, 1, 'Ad card suppression is counted once');
  observers[0].callback([{ addedNodes: [marker] }]);
  check(block.blockedCount, 1, 'Repeated SPA observer events do not double count');

  // Some logged-in YouTube home feeds render ads in the same rich-item
  // wrapper as ordinary videos. Ad badges (e.g. "Patrocinado") and click
  // redirects must be recognized, but not merely videos mentioning ads.
  const fakeCard = ({ badge = null, adLink = false } = {}) => ({
    attributes: {},
    getAttribute(key) { return this.attributes[key] ?? null; },
    setAttribute(key, val) { this.attributes[key] = val; },
    querySelector() { return adLink ? { href: 'https://www.googleadservices.com/pagead/aclk' } : null; },
    querySelectorAll() { return badge === null ? [] : [{ textContent: badge, getAttribute() { return null; } }]; }
  });
  const labeledAd = fakeCard({ badge: 'Patrocinado' });
  const englishAd = fakeCard({ badge: 'Sponsored' });
  const redirectAd = fakeCard({ adLink: true });
  const ordinaryVideo = fakeCard({ badge: 'Nuevo' });
  const titleMentioningAds = fakeCard();
  titleMentioningAds.textContent = 'Cómo funcionan los anuncios patrocinados';
  feedCards = [labeledAd, englishAd, redirectAd, ordinaryVideo, titleMentioningAds];
  markers = [];
  block.scanSponsoredCards();
  check(labeledAd.getAttribute('data-tizentube-sponsored'), 'true', 'Sponsored Spanish badge hides a normal-looking feed card');
  check(englishAd.getAttribute('data-tizentube-sponsored'), 'true', 'Sponsored English badge hides a feed card');
  check(redirectAd.getAttribute('data-tizentube-sponsored'), 'true', 'Ad-click redirect hides promoted video');
  check(ordinaryVideo.getAttribute('data-tizentube-sponsored'), null, 'Ordinary badge does not hide recommended video');
  check(titleMentioningAds.getAttribute('data-tizentube-sponsored'), null, 'Video title mentioning ads is not blocked');
  const afterFirstScan = block.blockedCount;
  block.scanSponsoredCards();
  check(block.blockedCount, afterFirstScan, 'Repeated feed scans do not recount marked cards');

  const feed = {
    contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
      content: { richGridRenderer: { contents: [
        { richItemRenderer: { content: { videoRenderer: { videoId: 'normal' } } } },
        { richItemRenderer: { content: { adSlotRenderer: { adId: 'UPN' } } } },
        { richSectionRenderer: { content: { videoMastheadAdV3Renderer: { adId: 'masthead' } } } }
      ] } }
    } }] } }
  };
  const browse = new Response(JSON.stringify(feed));
  Object.defineProperty(browse, 'url', { value: 'https://www.youtube.com/youtubei/v1/browse' });
  const clean = await browse.json();
  const items = clean.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents;
  check(items.length, 1, 'YouTube browse response removes both ad-slot and large masthead ad');
  check(items[0].richItemRenderer.content.videoRenderer.videoId, 'normal', 'Ordinary recommended video remains');

  const google = new Response(JSON.stringify({ contents: {}, adPlacements: [1] }));
  Object.defineProperty(google, 'url', { value: 'https://accounts.google.com/api/foo' });
  check((await google.json()).adPlacements.length, 1, 'Google account API remains unchanged');

  block.setEnabled(false);
  check(css, null, 'Disabling AdBlock removes cosmetic stylesheet');
  check(observers[0].disconnected, true, 'Disabling AdBlock disconnects feed observer');
  block.setEnabled(true);
  check(css?.id, 'tizentube-adblock-styles', 'Re-enable restores cosmetic rules');
} finally {
  block.dispose();
  if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  if (oldMutationObserver === undefined) delete globalThis.MutationObserver; else globalThis.MutationObserver = oldMutationObserver;
  if (oldRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = oldRaf;
}
check(Response.prototype.json, nativeResponseJson, 'Response.json restored on disposal');
check(JSON.parse, nativeJsonParse, 'JSON.parse restored on disposal');
console.log(`All ${passed}/${passed} sponsored feed regression checks PASSED.`);
