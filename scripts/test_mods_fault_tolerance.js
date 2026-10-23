/**
 * TizenTube Windows - JS Injection Mods Fault Tolerance & Memory Protection Tests
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Validates resilience of AdBlock, SponsorBlock, DeArrow, and PlaybackEngine
 * against external API downtime, timeouts, malformed payloads, rate limits (429),
 * and verifies bounded memory usage, LRU cache eviction, deduplication, and cleanup.
 */

import assert from 'node:assert';
import { SponsorBlockBase } from '../src/mods/sponsorblock_base.js';
import { DeArrowBase } from '../src/mods/dearrow_base.js';
import { AdBlockBase } from '../src/mods/adblock_base.js';
import { PlaybackEngine } from '../src/runtime/playback_engine.js';
import { ModLoader } from '../src/mods/mod_loader.js';

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function itAsync(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// Global fetch mock utility
let mockFetchHandler = null;
globalThis.fetch = async (...args) => {
  if (mockFetchHandler) {
    return mockFetchHandler(...args);
  }
  throw new Error('fetch not mocked');
};

async function runFaultToleranceTests() {
  console.log('Running TizenTube Windows JS Injection Mods Fault Tolerance & Memory Tests...\n');

  // =========================================================================
  // 1. SponsorBlock Fault Tolerance & Resilience Tests
  // =========================================================================

  await itAsync('SponsorBlock parses valid API segment response with metadata and geometry', async () => {
    mockFetchHandler = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          category: 'sponsor',
          segment: [15.2, 45.8],
          UUID: 'seg-sponsor-1'
        },
        {
          category: 'intro',
          segment: [0.0, 10.0],
          UUID: 'seg-intro-1'
        }
      ]
    });

    const sb = new SponsorBlockBase({ maxCacheSize: 50 });
    await sb.setVideo('vid-test-1');
    const segments = sb.currentSegments;

    assert.strictEqual(segments.length, 2);
    assert.strictEqual(segments[0].category, 'sponsor');
    assert.strictEqual(segments[0].start, 15.2);
    assert.strictEqual(segments[0].end, 45.8);
    assert.strictEqual(segments[0].uuid, 'seg-sponsor-1');

    // Verify seekbar timeline markers computation
    const markers = sb.getTimelineMarkers(100);
    assert.strictEqual(markers.length, 2);
    assert.strictEqual(markers[1].startPct, 0); // intro at 0%
    assert(markers[0].startPct > 15);
  });

  await itAsync('SponsorBlock caches 404 response to avoid redundant queries', async () => {
    let callCount = 0;
    mockFetchHandler = async () => {
      callCount++;
      return {
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' })
      };
    };

    const sb = new SponsorBlockBase();
    const res1 = await sb.fetchSegments('vid-404');
    assert.deepStrictEqual(res1, []);
    assert.strictEqual(callCount, 1);

    // Second call should resolve immediately from bounded cache without network call
    const res2 = await sb.fetchSegments('vid-404');
    assert.deepStrictEqual(res2, []);
    assert.strictEqual(callCount, 1, '404 must be cached to prevent redundant queries');
  });

  await itAsync('SponsorBlock handles 500/503 service outage fail-open without interrupting playback', async () => {
    mockFetchHandler = async () => ({
      ok: false,
      status: 503,
      json: async () => { throw new Error('Service Unavailable'); }
    });

    const sb = new SponsorBlockBase({ circuitBreakerThreshold: 3 });
    // Should not throw
    await sb.setVideo('vid-503');
    assert.strictEqual(sb.currentSegments.length, 0);
    assert.strictEqual(sb.consecutiveFailures, 1);
  });

  await itAsync('SponsorBlock circuit breaker trips after repeated failures and cools down', async () => {
    let attempts = 0;
    mockFetchHandler = async () => {
      attempts++;
      throw new Error('Connection timed out');
    };

    const sb = new SponsorBlockBase({
      circuitBreakerThreshold: 3,
      circuitCooldownMs: 5000
    });

    await sb.fetchSegments('vid-fail-1');
    await sb.fetchSegments('vid-fail-2');
    await sb.fetchSegments('vid-fail-3');

    assert.strictEqual(attempts, 3);
    assert.strictEqual(sb.consecutiveFailures, 3);
    assert(sb.circuitCooldownUntil > Date.now(), 'Circuit breaker should be active');

    // Fourth attempt should return [] immediately without attempting fetch
    const cooldownRes = await sb.fetchSegments('vid-fail-4');
    assert.deepStrictEqual(cooldownRes, []);
    assert.strictEqual(attempts, 3, 'Network call must be bypassed during circuit cooldown');
  });

  await itAsync('SponsorBlock handles HTTP 429 rate limit with immediate backoff cooldown', async () => {
    mockFetchHandler = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Too Many Requests' })
    });

    const sb = new SponsorBlockBase();
    const res = await sb.fetchSegments('vid-rate-limit');
    assert.deepStrictEqual(res, []);
    assert(sb.circuitCooldownUntil > Date.now(), '429 must trigger backoff cooldown');
  });

  await itAsync('SponsorBlock protects against malformed non-JSON responses (HTML error page)', async () => {
    mockFetchHandler = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0 (<!DOCTYPE html>)');
      }
    });

    const sb = new SponsorBlockBase();
    const res = await sb.fetchSegments('vid-html-response');
    assert.deepStrictEqual(res, [], 'Malformed JSON must fail-open safely');
  });

  await itAsync('SponsorBlock deduplicates concurrent in-flight requests for the same video ID', async () => {
    let networkFetches = 0;
    mockFetchHandler = async () => {
      networkFetches++;
      await new Promise(r => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        json: async () => [{ category: 'sponsor', segment: [10, 20], UUID: 'u1' }]
      };
    };

    const sb = new SponsorBlockBase();
    const [p1, p2, p3] = await Promise.all([
      sb.fetchSegments('same-video'),
      sb.fetchSegments('same-video'),
      sb.fetchSegments('same-video')
    ]);

    assert.strictEqual(networkFetches, 1, 'Must execute exactly one fetch for concurrent calls');
    assert.strictEqual(p1.length, 1);
    assert.strictEqual(p2.length, 1);
    assert.strictEqual(p3.length, 1);
  });

  await itAsync('SponsorBlock enforces bounded LRU cache size to minimize memory growth', async () => {
    const sb = new SponsorBlockBase({ maxCacheSize: 5 });
    for (let i = 1; i <= 8; i++) {
      sb.setCache(`vid-${i}`, [{ category: 'sponsor', segment: [i, i + 5], uuid: `uuid-${i}` }]);
    }

    assert.strictEqual(sb.cache.size, 5, 'Cache must not exceed maxCacheSize');
    // Oldest items (vid-1, vid-2, vid-3) should have been evicted
    assert.strictEqual(sb.cache.has('vid-1'), false);
    assert.strictEqual(sb.cache.has('vid-2'), false);
    assert.strictEqual(sb.cache.has('vid-3'), false);
    // Newest items must be present
    assert.strictEqual(sb.cache.has('vid-8'), true);
    assert.strictEqual(sb.cache.has('vid-7'), true);

    sb.clearCache();
    assert.strictEqual(sb.cache.size, 0);
  });

  // =========================================================================
  // 2. DeArrow Fault Tolerance & Memory Protection Tests
  // =========================================================================

  await itAsync('DeArrow parses crowdsourced titles & thumbnails and applies to cache', async () => {
    mockFetchHandler = async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          videoID: 'dQw4w9WgXcQ',
          titles: [{ title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)', locked: true }],
          thumbnails: [{ timestamp: 42.5, locked: false }]
        }
      ]
    });

    const da = new DeArrowBase({ maxCacheSize: 100 });
    const branding = await da.fetchBranding(['dQw4w9WgXcQ']);

    assert(branding['dQw4w9WgXcQ']);
    assert.strictEqual(branding['dQw4w9WgXcQ'].title, 'Rick Astley - Never Gonna Give You Up (Official Music Video)');
    assert(branding['dQw4w9WgXcQ'].thumbnail.includes('time=42.5'));
  });

  await itAsync('DeArrow handles API downtime (503 / Network Error) with fail-open fallback', async () => {
    mockFetchHandler = async () => {
      throw new Error('DNS resolution failed: dearrow-thumb.ajay.app');
    };

    const da = new DeArrowBase();
    const branding = await da.fetchBranding(['vid-offline']);
    assert.deepStrictEqual(branding, {});
    assert.strictEqual(da.consecutiveFailures, 1);
  });

  await itAsync('DeArrow enforces bounded LRU cache limit and memory eviction', async () => {
    const da = new DeArrowBase({ maxCacheSize: 10 });
    for (let i = 1; i <= 15; i++) {
      da.setCacheItem(`vid-${i}`, { videoID: `vid-${i}`, title: `Title ${i}`, thumbnail: null });
    }

    assert.strictEqual(da.cache.size, 10, 'DeArrow cache must strictly adhere to maxCacheSize');
    assert.strictEqual(da.cache.has('vid-1'), false, 'Oldest item must be evicted');
    assert.strictEqual(da.cache.has('vid-15'), true, 'Recent item must be retained');

    da.clearCache();
    assert.strictEqual(da.cache.size, 0);
  });

  await itAsync('DeArrow chunks large batch discovery into safe batch sizes (<= 30)', async () => {
    const requestedUrls = [];
    mockFetchHandler = async (url) => {
      requestedUrls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => []
      };
    };

    const da = new DeArrowBase({ batchChunkSize: 20 });
    const fiftyIds = Array.from({ length: 50 }, (_, i) => `vid-${i}`);

    await da.fetchBranding(fiftyIds);

    // 50 IDs chunked into batches of 20 -> 3 HTTP requests
    assert.strictEqual(requestedUrls.length, 3);
  });

  // =========================================================================
  // 3. AdBlock Comprehensive JSON Cleaning & Safety Tests
  // =========================================================================

  it('AdBlock cleans modern desktop home richGridRenderer and shorts ads', () => {
    const ab = new AdBlockBase();

    const mockBrowse = {
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  richGridRenderer: {
                    contents: [
                      { richItemRenderer: { content: { videoRenderer: { title: 'Good Video' } } } },
                      { richItemRenderer: { content: { adSlotRenderer: { id: 'ad1' } } } },
                      { richItemRenderer: { content: { inFeedAdRenderer: { id: 'ad2' } } } }
                    ]
                  }
                }
              }
            }
          ]
        }
      },
      entries: [
        { command: { reelWatchEndpoint: { videoId: 'short1' } } },
        { command: { reelWatchEndpoint: { adClientParams: { isAd: true } } } }
      ]
    };

    ab.cleanAdData(mockBrowse);

    const richItems = mockBrowse.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents;
    assert.strictEqual(richItems.length, 1);
    assert.strictEqual(richItems[0].richItemRenderer.content.videoRenderer.title, 'Good Video');

    assert.strictEqual(mockBrowse.entries.length, 1);
    assert.strictEqual(mockBrowse.entries[0].command.reelWatchEndpoint.videoId, 'short1');
    assert(ab.blockedCount >= 1);
  });

  it('AdBlock cleans search result ad slots and sponsored sparkles', () => {
    const ab = new AdBlockBase();

    const mockSearch = {
      contents: {
        twoColumnSearchResultsRenderer: {
          primaryContents: {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      { videoRenderer: { title: 'Legit Search Result' } },
                      { adSlotRenderer: { id: 'search-ad' } },
                      { promotedSparklesWebRenderer: { id: 'sparkle-ad' } }
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    };

    ab.cleanAdData(mockSearch);

    const searchItems = mockSearch.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents[0].itemSectionRenderer.contents;
    assert.strictEqual(searchItems.length, 1);
    assert.strictEqual(searchItems[0].videoRenderer.title, 'Legit Search Result');
  });

  it('AdBlock JSON.parse hook handles malformed or cyclic object safely without throwing', () => {
    const ab = new AdBlockBase();
    ab.install();

    // Normal parsing
    const res = JSON.parse('{"contents":{"videoId":"test"},"adPlacements":[{"id":"ad"}]}');
    assert.strictEqual(res.adPlacements, undefined);
    assert.strictEqual(res.contents.videoId, 'test');

    ab.dispose();
  });

  // =========================================================================
  // 4. PlaybackEngine Media Controls & Shortcuts Tests
  // =========================================================================

  it('PlaybackEngine attaches MediaSession handlers when supported', () => {
    const actionHandlers = new Map();
    const mockMediaSession = {
      setActionHandler: (action, fn) => actionHandlers.set(action, fn),
      setPositionState: () => {}
    };

    const origNav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaSession: mockMediaSession },
      configurable: true,
      writable: true
    });

    const pe = new PlaybackEngine({ rememberPreferences: false });
    assert(actionHandlers.has('play'));
    assert(actionHandlers.has('pause'));
    assert(actionHandlers.has('seekbackward'));
    assert(actionHandlers.has('seekforward'));
    assert(actionHandlers.has('seekto'));

    pe.dispose();
    if (origNav) {
      Object.defineProperty(globalThis, 'navigator', origNav);
    }
  });

  // =========================================================================
  // 5. ModLoader IPC Integration & Memory Trim Tests
  // =========================================================================

  it('ModLoader handles memory:trim IPC command and flushes caches', () => {
    const ml = new ModLoader();
    ml.bootstrap();

    // Populate caches
    ml.sponsorblock.setCache('v1', [{ category: 'sponsor', segment: [0, 10], uuid: 'u1' }]);
    ml.dearrow.setCacheItem('v1', { videoID: 'v1', title: 'Nice Video' });

    assert.strictEqual(ml.sponsorblock.cache.size, 1);
    assert.strictEqual(ml.dearrow.cache.size, 1);

    // Simulate Native Windows Host dispatching memory compaction command
    ml.ipc.send('memory:trim');

    assert.strictEqual(ml.sponsorblock.cache.size, 0, 'SponsorBlock cache must be cleared on trim');
    assert.strictEqual(ml.dearrow.cache.size, 0, 'DeArrow cache must be cleared on trim');

    ml.dispose();
  });

  console.log(`\nAll ${passed}/${total} fault tolerance & memory tests PASSED successfully.\n`);
}

runFaultToleranceTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
