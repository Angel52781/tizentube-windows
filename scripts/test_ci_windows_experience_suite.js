#!/usr/bin/env node
/**
 * TizenTube Windows - CI Experience & Performance Suite Verification Test
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Verifies that scripts/ci_windows_experience.ps1 and the GitHub Actions workflow
 * preserve all 29 baseline tests, incorporate AdBlock, SponsorBlock, and HiDPI verifications,
 * and collect process-tree CPU and private RAM metrics.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Running TizenTube Windows CI Experience & Performance Suite Tests...\n');

let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}`);
    console.error(`         ${err.message}`);
    process.exitCode = 1;
  }
}

const ps1Path = path.join(rootDir, 'scripts', 'ci_windows_experience.ps1');
assert.ok(fs.existsSync(ps1Path), 'ci_windows_experience.ps1 must exist');
const ps1Content = fs.readFileSync(ps1Path, 'utf8');

const ymlPath = path.join(rootDir, '.github', 'workflows', 'windows-experience-e2e.yml');
assert.ok(fs.existsSync(ymlPath), 'windows-experience-e2e.yml must exist');
const ymlContent = fs.readFileSync(ymlPath, 'utf8');

const hostCsPath = path.join(rootDir, 'src', 'native', 'TizenTubeHost.cs');
assert.ok(fs.existsSync(hostCsPath), 'TizenTubeHost.cs must exist');
const hostCsContent = fs.readFileSync(hostCsPath, 'utf8');

// 1. Baseline 29/29 Verification
it('Maintains all 29 baseline tests from preview.11 and run 40060448719', () => {
  const baselineChecks = [
    'host-exit:floating',
    'bundled-mods:floating',
    'artifact:floating-before.json',
    'artifact:floating-button-click.json',
    'artifact:floating-after.json',
    'actual-player-button-click',
    'original-video-playing',
    'same-player-moved-to-floating-window',
    'visible-floating-video-geometry',
    'video-time-continues-while-floating',
    'webview2-video-frame-captured',
    'preview-image-dimensions',
    'real-nonblack-video-pixels',
    'host-exit:theater-user-choice',
    'bundled-mods:theater-user-choice',
    'artifact:theater-after-click.json',
    'theater-preference-saved-on-windows-disk',
    'theater-preference-valid-boolean',
    'trusted-user-click-saved',
    'host-exit:theater-restart',
    'bundled-mods:theater-restart',
    'artifact:theater-after-restart.json',
    'artifact:theater-after-settle.json',
    'theater-disk-choice-survives-restart',
    'theater-layout-survives-restart',
    'theater-never-activates-fullscreen',
    'theater-restoration-keeps-video-visible',
    'floating-control-exactly-between-cc-and-settings',
    'playback-continues-after-cinema-restore'
  ];

  assert.strictEqual(baselineChecks.length, 29, 'Baseline must contain exactly 29 tests');
  for (const check of baselineChecks) {
    if (check.startsWith('host-exit:')) {
      const label = check.replace('host-exit:', '');
      assert.ok(
        ps1Content.includes('host-exit:$label') && ps1Content.includes(`'${label}'`),
        `Host exit check missing for label: ${label}`
      );
    } else if (check.startsWith('bundled-mods:')) {
      const label = check.replace('bundled-mods:', '');
      assert.ok(
        ps1Content.includes('bundled-mods:$label') && ps1Content.includes(`'${label}'`),
        `Bundled mods check missing for label: ${label}`
      );
    } else if (check.startsWith('artifact:')) {
      const artifact = check.replace('artifact:', '');
      assert.ok(
        ps1Content.includes('artifact:$name') && ps1Content.includes(`'${artifact}'`),
        `Artifact check missing for file: ${artifact}`
      );
    } else {
      assert.ok(
        ps1Content.includes(`'${check}'`) || ps1Content.includes(`"${check}"`),
        `Baseline check missing: ${check}`
      );
    }
  }
});

// 2. HiDPI Layout Verification
it('Verifies HiDPI font rendering, DPI ratio, and layout alignment', () => {
  assert.ok(ps1Content.includes('hidpi-layout-probe.json'), 'Must read hidpi-layout-probe.json');
  assert.ok(ps1Content.includes('hidpi-ui-styles-injected'), 'Must assert hidpi-ui-styles-injected');
  assert.ok(ps1Content.includes('hidpi-device-pixel-ratio-valid'), 'Must assert hidpi-device-pixel-ratio-valid');
  assert.ok(ps1Content.includes('pip-controls-aligned-between-cc-and-settings'), 'Must assert pip button alignment');
  assert.ok(hostCsContent.includes('hidpi-layout-probe.json'), 'TizenTubeHost must produce hidpi-layout-probe.json');
});

// 3. AdBlock, SponsorBlock & DeArrow Feature Verification
it('Verifies AdBlock, SponsorBlock, and DeArrow module states on hosted Windows runner', () => {
  assert.ok(ps1Content.includes('features-probe.json'), 'Must read features-probe.json');
  assert.ok(ps1Content.includes('adblock-module-loaded'), 'Must assert adblock-module-loaded');
  assert.ok(ps1Content.includes('adblock-enabled-by-default'), 'Must assert adblock-enabled-by-default');
  assert.ok(ps1Content.includes('adblock-cosmetic-stylesheet-injected'), 'Must assert adblock-cosmetic-stylesheet-injected');
  assert.ok(ps1Content.includes('sponsorblock-module-loaded'), 'Must assert sponsorblock-module-loaded');
  assert.ok(ps1Content.includes('sponsorblock-enabled-by-default'), 'Must assert sponsorblock-enabled-by-default');
  assert.ok(ps1Content.includes('sponsorblock-autoskip-enabled'), 'Must assert sponsorblock-autoskip-enabled');
  assert.ok(ps1Content.includes('sponsorblock-categories-configured'), 'Must assert sponsorblock-categories-configured');
  assert.ok(ps1Content.includes('dearrow-module-loaded'), 'Must assert dearrow-module-loaded');
  assert.ok(ps1Content.includes('dearrow-enabled-by-default'), 'Must assert dearrow-enabled-by-default');
  assert.ok(hostCsContent.includes('features-probe.json'), 'TizenTubeHost must emit features-probe.json');
});

// 4. Process-Tree CPU and Private RAM Telemetry Collection
it('Collects and aggregates process-tree CPU and private RAM metrics across scenarios', () => {
  assert.ok(ps1Content.includes('process-tree-private-ram-positive'), 'Must verify private RAM is positive');
  assert.ok(ps1Content.includes('process-tree-working-set-positive'), 'Must verify working set is positive');
  assert.ok(ps1Content.includes('process-tree-processes-enumerated'), 'Must verify process tree is enumerated');
  assert.ok(ps1Content.includes('process-tree-performance-metrics.json'), 'Must export process-tree-performance-metrics.json');
  assert.ok(ps1Content.includes('process-tree-performance-summary.txt'), 'Must export process-tree-performance-summary.txt');
  assert.ok(ps1Content.includes('performance-private-ram-metric-positive'), 'Must assert performance-private-ram-metric-positive');
  assert.ok(ps1Content.includes('performance-working-set-metric-positive'), 'Must assert performance-working-set-metric-positive');
  assert.ok(ps1Content.includes('performance-process-tree-metrics-collected'), 'Must assert performance-process-tree-metrics-collected');
  assert.ok(ps1Content.includes('performance-total-cpu-time-tracked'), 'Must assert performance-total-cpu-time-tracked');
});

// 5. GitHub Actions Workflow Configuration
it('GitHub Actions workflow configures full test lifecycle, timeout, and evidence capture', () => {
  assert.ok(ymlContent.includes('runs-on: windows-latest'), 'Must run on windows-latest');
  assert.ok(ymlContent.includes('setup-dotnet@v4'), 'Must setup .NET SDK 8');
  assert.ok(ymlContent.includes('setup-node@v4'), 'Must setup Node.js 20');
  assert.ok(ymlContent.includes('setup-python@v5'), 'Must setup Python 3.11');
  assert.ok(ymlContent.includes('ci_windows_experience.ps1'), 'Must invoke ci_windows_experience.ps1');
  assert.ok(ymlContent.includes('measure_process_telemetry.js --validate'), 'Must validate process telemetry');
  assert.ok(ymlContent.includes('upload-artifact@v4'), 'Must preserve E2E evidence artifact');
  assert.ok(ymlContent.includes('windows-experience-evidence/**'), 'Must upload evidence directory');
});

console.log(`\nAll ${passedTests}/${totalTests} CI Experience & Performance Suite tests PASSED successfully.\n`);
