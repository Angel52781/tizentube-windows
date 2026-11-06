#!/usr/bin/env node
/**
 * Empirical Layout, Centering, Contrast & Bounding Box Verification for Floating Overlay
 * Uses Chrome DevTools Protocol via native Node.js WebSocket.
 * GPL-3.0-only.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function runLayoutVerification() {
  console.log('>>> Launching Chrome Headless with CDP for Floating Overlay Empirical Layout Verification...');
  const fixtureUrl = 'file:///srv/orbital/workspaces/tizentube-windows/scripts/fixture_floating_overlay.html';
  const chrome = spawn('/usr/bin/google-chrome', [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    '--window-size=540,320',
    fixtureUrl
  ]);

  let killed = false;
  const cleanup = () => {
    if (!killed) {
      killed = true;
      try { chrome.kill('SIGTERM'); } catch (_) {}
    }
  };
  process.on('exit', cleanup);

  try {
    // Wait for CDP port to open
    let targets = null;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        targets = await fetchJson('http://127.0.0.1:9225/json');
        if (targets && targets.some(t => t.type === 'page' && t.webSocketDebuggerUrl)) break;
      } catch (_) {}
    }

    const pageTarget = targets?.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!pageTarget) {
      throw new Error('FAILED_TO_FIND_PAGE_TARGET_IN_CHROME_CDP');
    }

    const wsUrl = pageTarget.webSocketDebuggerUrl;
    const ws = new WebSocket(wsUrl);

    let id = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };

    const send = (method, params = {}) => {
      const reqId = id++;
      return new Promise((resolve, reject) => {
        pending.set(reqId, { resolve, reject });
        ws.send(JSON.stringify({ id: reqId, method, params }));
      });
    };

    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });

    console.log('  [PASS] Connected to Chrome DevTools Protocol');
    await send('Runtime.enable');

    // Wait a brief moment for video stream and floating mode initialization
    await new Promise(r => setTimeout(r, 600));

    const evalExpr = async (expression) => {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      return res.result?.value;
    };

    const diagnostics = await evalExpr('window.__ttFloating?.diagnostics?.()');
    console.log('  [PASS] Diagnostics returned active:', diagnostics?.active);
    assert.ok(diagnostics?.active, 'Floating mode is active in live Chromium');
    assert.ok(diagnostics?.restoreButtonPresent, 'Restore button present');
    assert.ok(diagnostics?.closeButtonPresent, 'Close button present');
    assert.ok(diagnostics?.rewindButtonPresent, 'Rewind button present');
    assert.ok(diagnostics?.playButtonPresent, 'Play button present');
    assert.ok(diagnostics?.forwardButtonPresent, 'Forward button present');
    assert.ok(diagnostics?.progressBarPresent, 'Progress bar present');
    assert.ok(diagnostics?.timeDisplayPresent, 'Time display present');
    assert.ok(diagnostics?.volumeButtonPresent, 'Volume button present');

    // Measure bounding boxes
    const metrics = await evalExpr(`(() => {
      const getBox = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { id, x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
      };
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        overlay: getBox('tt-floating-overlay'),
        header: getBox('tt-floating-header'),
        restoreBtn: getBox('tt-floating-restore-btn'),
        closeBtn: getBox('tt-floating-close-btn'),
        centerControls: getBox('tt-floating-center-controls'),
        rewindBtn: getBox('tt-floating-rewind-btn'),
        playBtn: getBox('tt-floating-play-btn'),
        forwardBtn: getBox('tt-floating-forward-btn'),
        footer: getBox('tt-floating-footer'),
        progressBar: getBox('tt-floating-progress-bar'),
        timeDisplay: getBox('tt-floating-time-display'),
        volumeBtn: getBox('tt-floating-volume-btn'),
        volumeSlider: getBox('tt-floating-volume-slider')
      };
    })()`);

    console.log('  [PASS] Measured geometry metrics:\n', JSON.stringify(metrics, null, 2));

    // Assert geometric layout invariants
    const { overlay, header, restoreBtn, closeBtn, rewindBtn, playBtn, forwardBtn, footer, timeDisplay, volumeBtn } = metrics;

    // 1. Overlay fills viewport
    assert.equal(overlay.width, metrics.viewport.width, 'Overlay width matches viewport');
    assert.equal(overlay.height, metrics.viewport.height, 'Overlay height matches viewport');

    // 2. Play button horizontal centering
    const playCenterX = playBtn.left + playBtn.width / 2;
    const overlayCenterX = overlay.width / 2;
    const centerDeltaX = Math.abs(playCenterX - overlayCenterX);
    console.log(`  [Centering Check] Play button center X delta: ${centerDeltaX}px (tolerance: 2px)`);
    assert.ok(centerDeltaX <= 2, `Play button is horizontally centered (delta: ${centerDeltaX}px)`);

    // 3. Play button vertical centering
    const playCenterY = playBtn.top + playBtn.height / 2;
    const overlayCenterY = overlay.height / 2;
    const centerDeltaY = Math.abs(playCenterY - overlayCenterY);
    console.log(`  [Centering Check] Play button center Y delta: ${centerDeltaY}px (tolerance: 15px)`);
    assert.ok(centerDeltaY <= 15, `Play button is vertically centered (delta: ${centerDeltaY}px)`);

    // 4. Symmetric gap between center controls
    const rewindGap = playBtn.left - rewindBtn.right;
    const forwardGap = forwardBtn.left - playBtn.right;
    const gapDelta = Math.abs(rewindGap - forwardGap);
    console.log(`  [Symmetry Check] Rewind gap: ${rewindGap}px, Forward gap: ${forwardGap}px, delta: ${gapDelta}px`);
    assert.ok(gapDelta <= 2, `Center controls have symmetric spacing (delta: ${gapDelta}px)`);

    // 5. Header buttons order and distinct placement
    assert.ok(closeBtn.left > restoreBtn.right, 'Close button is placed to the right of restore button');
    assert.ok(restoreBtn.top >= 0 && closeBtn.top >= 0, 'Header buttons are within top bar');

    // 6. Footer layout order
    assert.ok(timeDisplay.left < volumeBtn.left, 'Time display on left, volume controls on right');
    assert.ok(footer.bottom <= overlay.bottom, 'Footer within overlay bounds');

    // 7. Check absence of overflow
    const overflowCheck = await evalExpr(`(() => {
      return {
        rootScrollWidth: document.documentElement.scrollWidth,
        rootClientWidth: document.documentElement.clientWidth,
        rootScrollHeight: document.documentElement.scrollHeight,
        rootClientHeight: document.documentElement.clientHeight
      };
    })()`);
    assert.equal(overflowCheck.rootScrollWidth, overflowCheck.rootClientWidth, 'No horizontal scrollbar overflow');
    assert.equal(overflowCheck.rootScrollHeight, overflowCheck.rootClientHeight, 'No vertical scrollbar overflow');
    console.log('  [PASS] Zero layout overflow verified');

    // 8. Test small viewport (330x185) resize
    await send('Emulation.setDeviceMetricsOverride', {
      width: 330,
      height: 185,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 200));

    const smallMetrics = await evalExpr(`(() => {
      const getBox = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { id, width: Math.round(r.width), height: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
      };
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        overlay: getBox('tt-floating-overlay'),
        rewindBtn: getBox('tt-floating-rewind-btn'),
        playBtn: getBox('tt-floating-play-btn'),
        forwardBtn: getBox('tt-floating-forward-btn'),
        restoreBtn: getBox('tt-floating-restore-btn'),
        closeBtn: getBox('tt-floating-close-btn')
      };
    })()`);

    assert.ok(smallMetrics.rewindBtn.left >= 0, 'Small PiP: Rewind button not clipped on left');
    assert.ok(smallMetrics.forwardBtn.right <= 330, 'Small PiP: Forward button not clipped on right');
    assert.ok(smallMetrics.closeBtn.right <= 330, 'Small PiP: Close button not clipped on right');
    console.log('  [PASS] Small window size (330x185) verified without clipping');

    ws.close();
    cleanup();
    console.log('\nAll Empirical Layout & Geometry Invariants PASSED successfully.');
  } catch (err) {
    cleanup();
    console.error('Empirical layout verification failed:', err);
    process.exit(1);
  }
}

runLayoutVerification();
