#!/usr/bin/env node
/*
 * Source-grounded regressions for reisxd/TizenTube
 * references/TizenTube/mods/features/adblock.js @ f99945a.
 * GPL-3.0-only (2026 TizenTube Windows Contributors).
 */
import assert from 'node:assert/strict';
import { AdBlockBase } from '../src/mods/adblock_base.js';

let checks = 0;
const verify = (condition, message) => { assert.ok(condition, message); checks++; };
const previousLocation = globalThis.location;
const oldStringify = JSON.stringify;
const oldParse = JSON.parse;
try {
  globalThis.location = { pathname: '/tv' };
  const adblock = new AdBlockBase({ cosmeticFilter: false, autoSkipVideoAds: false });
  adblock.install();
  try {
    const tv = {
      adPlacements: [{ id: 'ad-player' }], playerAds: [{ id: 'ad' }],
      adSlots: [{ id: 'ad-home' }],
      contents: { tvBrowseRenderer: { content: { tvSurfaceContentRenderer: {
        content: { sectionListRenderer: { contents: [
          { adSlotRenderer: { id: 'home' } },
          { shelfRenderer: { content: { horizontalListRenderer: { items: [
            { adSlotRenderer: { id: 'inline' } },
            { tileRenderer: { contentId: 'legitimate' } }
          ] } } } }
        ] } }
      } } } }
    };
    adblock.cleanAdData(tv);
    verify(Array.isArray(tv.adPlacements) && tv.adPlacements.length === 0,
      'Original TV adPlacements is replaced with []');
    verify(tv.playerAds === false, 'Original TV playerAds is replaced with false');
    verify(Array.isArray(tv.adSlots) && tv.adSlots.length === 0,
      'Original TV adSlots is replaced with []');
    const shelves = tv.contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents;
    verify(shelves.length === 1, 'Original TV home masthead adSlotRenderer is removed');
    const tiles = shelves[0].shelfRenderer.content.horizontalListRenderer.items;
    verify(tiles.length === 1 && tiles[0].tileRenderer.contentId === 'legitimate',
      'Original TV removes ads nested inside shelves without deleting legitimate tiles');

    const inline = { playbackContext: { contentPlaybackContext: { playbackNonce: 'abc' } } };
    const request = JSON.parse(JSON.stringify(inline));
    verify(request.playbackContext.contentPlaybackContext.isInlinePlaybackNoAd === true,
      'Original TV inline playback request receives isInlinePlaybackNoAd');
    verify(!('isInlinePlaybackNoAd' in inline.playbackContext.contentPlaybackContext),
      'TV request rewrite does not mutate original caller object');

    globalThis.location = { pathname: '/' };
    const desktop = { adPlacements: [1], playerAds: [2], adSlots: [3] };
    adblock.cleanAdData(desktop);
    verify(!('adPlacements' in desktop) && !('playerAds' in desktop) && !('adSlots' in desktop),
      'YouTube desktop retains separate structural filtering rules');
    const desktopInline = JSON.parse(JSON.stringify(inline));
    verify(!('isInlinePlaybackNoAd' in desktopInline.playbackContext.contentPlaybackContext),
      'TV request rewrite never applies to desktop');
  } finally {
    adblock.dispose();
  }
  verify(JSON.stringify === oldStringify && JSON.parse === oldParse,
    'JSON parse/stringify hooks are restored on disposal');
} finally {
  if (previousLocation === undefined) delete globalThis.location;
  else globalThis.location = previousLocation;
}
console.log(`All ${checks}/${checks} source-grounded YouTube TV regressions PASSED.`);
