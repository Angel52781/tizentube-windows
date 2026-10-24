/**
 * TizenTube Windows - Core Runtime Test Suite
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Validates process management, resource monitor, navigation, playback engine,
 * ad blocking hooks, SponsorBlock evaluation, DeArrow, and IPC bridge in a headless environment.
 */

import assert from 'node:assert';
import { ProcessManager } from '../src/core/process_manager.js';
import { ResourceMonitor } from '../src/core/resource_monitor.js';
import { NavigationManager } from '../src/runtime/navigation.js';
import { PlaybackEngine } from '../src/runtime/playback_engine.js';
import { IpcBridge } from '../src/runtime/ipc_bridge.js';
import { AdBlockBase } from '../src/mods/adblock_base.js';
import { SponsorBlockBase } from '../src/mods/sponsorblock_base.js';
import { DeArrowBase } from '../src/mods/dearrow_base.js';
import { ModLoader } from '../src/mods/mod_loader.js';

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

async function runTests() {
  console.log('Running TizenTube Windows Core Runtime Tests...\n');

  // 1. ProcessManager Tests
  test('ProcessManager constructs optimized Chromium CLI arguments', () => {
    const pm = new ProcessManager({
      runtime: {
        rendererProcessLimit: 1,
        chromiumFlags: ['--disable-features=Translate', '--disk-cache-size=104857600']
      }
    });
    const args = pm.getChromiumArguments();
    assert(args.includes('--renderer-process-limit=1'), 'Must include renderer limit flag');
    assert(args.includes('--disk-cache-size=104857600'), 'Must include disk cache limit');
    assert.strictEqual(pm.rendererProcessLimit, 1);
  });

  test('ProcessManager tracks processes and simulates memory compaction', () => {
    const pm = new ProcessManager();
    pm.registerProcess(1234, 'host');
    pm.registerProcess(5678, 'renderer');
    assert.strictEqual(pm.activeProcesses.size, 2);

    const report = pm.trimWorkingSet();
    assert.strictEqual(report.success, true);
    assert.strictEqual(report.managedProcessesCount, 2);

    pm.deregisterProcess(5678);
    assert.strictEqual(pm.activeProcesses.size, 1);
  });

  // 2. ResourceMonitor Tests
  test('ResourceMonitor aggregates multi-process working set metrics', () => {
    const rm = new ResourceMonitor();
    rm.recordSample({ hostWorkingSetMb: 45.5, renderersWorkingSetMb: 60.2, gpuWorkingSetMb: 35.1, cpuPercent: 3.2 }, 'idle');
    rm.recordSample({ hostWorkingSetMb: 46.0, renderersWorkingSetMb: 85.0, gpuWorkingSetMb: 50.0, cpuPercent: 8.5 }, 'playback-1080p');

    const idleStats = rm.getScenarioStats('idle');
    assert.strictEqual(idleStats.count, 1);
    assert.strictEqual(idleStats.avgTotalWorkingSetMb, 140.8);

    const playStats = rm.getScenarioStats('playback-1080p');
    assert.strictEqual(playStats.count, 1);
    assert.strictEqual(playStats.avgTotalWorkingSetMb, 181.0);
  });

  // 3. NavigationManager Tests
  test('NavigationManager sanitizes URLs and builds search queries', () => {
    const nav = new NavigationManager();
    const safeUrl = nav.sanitizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.strictEqual(safeUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const unsafeUrl = nav.sanitizeUrl('https://malicious-site.example/exploit');
    assert.strictEqual(unsafeUrl, null, 'Must reject external domains');

    const searchUrl = nav.buildSearchUrl('classical music 4k');
    assert.strictEqual(searchUrl, 'https://www.youtube.com/results?search_query=classical%20music%204k');
    assert.strictEqual(nav.isExternalUrl('https://google.com'), true);
    assert.strictEqual(nav.isExternalUrl('https://www.youtube.com'), false);
  });

  // 4. PlaybackEngine State Machine Tests
  test('PlaybackEngine handles volume, playback rate, seek calculations', () => {
    const pe = new PlaybackEngine({ rememberPreferences: false });
    assert.strictEqual(pe.state.volume, 100);
    assert.strictEqual(pe.state.playbackRate, 1.0);

    pe.setVolume(75);
    assert.strictEqual(pe.state.volume, 75);

    pe.adjustVolume(10);
    assert.strictEqual(pe.state.volume, 85);

    pe.setPlaybackRate(1.75);
    assert.strictEqual(pe.state.playbackRate, 1.75);

    // Mock video element binding
    let seekTarget = 0;
    const mockVideo = {
      currentTime: 15,
      duration: 300,
      paused: true,
      volume: 0.85,
      playbackRate: 1.75,
      play() { this.paused = false; },
      pause() { this.paused = true; },
      addEventListener() {}
    };

    pe.bindVideoElement(mockVideo);
    assert.strictEqual(pe.togglePlay(), true, 'Toggle play should set playing to true');
    assert.strictEqual(mockVideo.paused, false);

    pe.seekBy(10);
    assert.strictEqual(pe.state.currentTime, 25);

    pe.seekTo(120);
    assert.strictEqual(pe.state.currentTime, 120);
  });

  // 5. AdBlockBase Tests
  test('AdBlockBase strips adPlacements, playerAds, and adSlots from JSON payloads', () => {
    const adblock = new AdBlockBase();
    const mockResponse = {
      responseContext: { visitorData: 'test1234' },
      contents: { videoId: 'abc123xyz' },
      adPlacements: [{ adId: 'ad1' }],
      playerAds: [{ adId: 'ad2' }],
      adSlots: [{ slotId: 'slot1' }],
      playerResponse: {
        playabilityStatus: { status: 'OK' },
        adPlacements: [{ adId: 'nestedAd' }]
      }
    };

    adblock.cleanAdData(mockResponse);

    assert.strictEqual(mockResponse.adPlacements, undefined, 'adPlacements must be deleted');
    assert.strictEqual(mockResponse.playerAds, undefined, 'playerAds must be deleted');
    assert.strictEqual(mockResponse.adSlots, undefined, 'adSlots must be deleted');
    assert.ok(Array.isArray(mockResponse.playerResponse.adPlacements), 'desktop player ad fields are preserved to protect playback');
    assert.strictEqual(mockResponse.contents.videoId, 'abc123xyz', 'Legitimate content must be preserved');
    assert(adblock.blockedCount >= 4, 'Must count blocked elements');
  });

  // 6. SponsorBlockBase Tests
  test('SponsorBlockBase correctly identifies skip segment target', () => {
    const sb = new SponsorBlockBase({ autoSkip: true });
    sb.currentSegments = [
      { category: 'sponsor', segment: [120.5, 145.0], uuid: 'uuid-1' },
      { category: 'intro', segment: [0.0, 15.0], uuid: 'uuid-2' }
    ];

    // Inside segment 2: [0.0, 15.0]
    const skip1 = sb.checkSkip(5.2);
    assert.strictEqual(skip1, 15.0, 'Must return segment end time for skip');

    // Outside segments: 60.0
    const skip2 = sb.checkSkip(60.0);
    assert.strictEqual(skip2, null, 'Must return null when outside segments');

    // Inside segment 1: [120.5, 145.0]
    const skip3 = sb.checkSkip(125.0);
    assert.strictEqual(skip3, 145.0, 'Must return end time of segment 1');
  });

  // 7. DeArrowBase Tests
  test('DeArrowBase manages thumbnail/title caching', async () => {
    const dearrow = new DeArrowBase();
    dearrow.cache.set('video1', {
      videoID: 'video1',
      title: 'Original Clickbait -> Factual Title',
      thumbnail: 'https://dearrow-thumb.ajay.app/thumb1.jpg'
    });

    const cached = dearrow.getCached(['video1']);
    assert(cached.video1, 'Cached item must be returned');
    assert.strictEqual(cached.video1.title, 'Original Clickbait -> Factual Title');
  });

  // 8. IpcBridge Tests
  test('IpcBridge dispatches and receives messages correctly', () => {
    const ipc = new IpcBridge();
    let receivedPayload = null;

    ipc.on('test:channel', (payload) => {
      receivedPayload = payload;
    });

    ipc.send('test:channel', { foo: 'bar', number: 42 });
    assert.deepStrictEqual(receivedPayload, { foo: 'bar', number: 42 });
  });

  // 9. ModLoader Coordination Tests
  test('ModLoader coordinates modules and wires timeline skip events', () => {
    const ml = new ModLoader({
      features: {
        adblock: { enabled: true },
        sponsorblock: { enabled: true, autoSkip: true },
        playback: { defaultSpeed: 1.25 }
      }
    });

    ml.sponsorblock.currentSegments = [
      { category: 'sponsor', segment: [30.0, 45.0], uuid: 'sb-1' }
    ];

    let skippedEvent = null;
    ml.ipc.on('sponsorblock:skipped', (payload) => {
      skippedEvent = payload;
    });

    ml.bootstrap();

    // Emit timeline update inside sponsor segment (35.0s)
    ml.playback.emit('timeupdate', { currentTime: 35.0 });

    assert(skippedEvent !== null, 'SponsorBlock skip event must be emitted over IPC');
    assert.strictEqual(skippedEvent.skipTarget, 45.0);
    assert.strictEqual(ml.playback.state.currentTime, 45.0);

    const status = ml.getStatus();
    assert.strictEqual(status.playback.playbackRate, 1.25);
  });

  console.log(`\nAll ${passed}/${total} runtime tests PASSED successfully.\n`);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
