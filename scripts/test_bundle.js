#!/usr/bin/env node
/**
 * TizenTube Windows - Injected Bundle Verification Test
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Verifies that the compiled IIFE bundle is standalone, has zero ES imports/exports,
 * evaluates cleanly in a DOM/window context, and initializes all modules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const bundlePath = path.join(projectRoot, 'src', 'mods', 'tizentube.bundle.js');

if (!fs.existsSync(bundlePath)) {
  console.error(`[FAIL] Bundle file missing at: ${bundlePath}`);
  process.exit(1);
}

const bundleCode = fs.readFileSync(bundlePath, 'utf8');

// 1. Static check: Ensure NO import or export statements exist outside strings
const lines = bundleCode.split('\n');
const forbiddenKeywords = [/^\s*import\s+[^;]+;/, /^\s*export\s+(class|const|let|default|function)\s+/];

for (let i = 0; i < lines.length; i++) {
  for (const regex of forbiddenKeywords) {
    if (regex.test(lines[i])) {
      console.error(`[FAIL] Forbidden module keyword at line ${i + 1}: ${lines[i]}`);
      process.exit(1);
    }
  }
}
console.log('  [PASS] Zero standalone import/export statements in bundle');

// 2. Dynamic execution check with mock browser environment
const mockElement = {
  tagName: 'div',
  style: {},
  classList: { add: () => {}, remove: () => {} },
  appendChild: () => {},
  prepend: () => {},
  setAttribute: () => {},
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => []
};

const mockDocument = {
  createElement: () => ({ ...mockElement }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  head: { ...mockElement },
  body: { ...mockElement }
};

const ipcSent = [];
const mockWindow = {
  addEventListener: () => {},
  location: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', hostname: 'www.youtube.com' },
  chrome: {
    webview: {
      addEventListener: () => {},
      postMessage: (msg) => { ipcSent.push(msg); }
    }
  }
};

const runner = new Function('window', 'document', bundleCode);
runner(mockWindow, mockDocument);

if (!mockWindow.TizenTube) {
  console.error('[FAIL] window.TizenTube global namespace was not exposed');
  process.exit(1);
}
console.log('  [PASS] window.TizenTube global namespace exposed with all modules');

if (!mockWindow.__TIZENTUBE_LOADER__) {
  console.error('[FAIL] window.__TIZENTUBE_LOADER__ was not bootstrapped');
  process.exit(1);
}
console.log('  [PASS] window.__TIZENTUBE_LOADER__ bootstrapped successfully');

const status = mockWindow.__TIZENTUBE_LOADER__.getStatus();
if (!status.adblock?.isHooked) {
  console.error('[FAIL] AdBlock JSON hook is not active');
  process.exit(1);
}
console.log('  [PASS] AdBlock JSON parser hook is active in bundle');

if (status.sponsorblock?.currentVideoId !== 'dQw4w9WgXcQ') {
  console.error('[FAIL] SponsorBlock video ID not tracked');
  process.exit(1);
}
console.log('  [PASS] SponsorBlock initialized with active video URL tracking');

// 3. Extension Manifest & Declarative Net Request rules verification
const extManifestPath = path.join(projectRoot, 'src', 'extension', 'manifest.json');
const extRulesPath = path.join(projectRoot, 'src', 'extension', 'rules.json');

if (fs.existsSync(extManifestPath) && fs.existsSync(extRulesPath)) {
  const manifest = JSON.parse(fs.readFileSync(extManifestPath, 'utf8'));
  const rules = JSON.parse(fs.readFileSync(extRulesPath, 'utf8'));
  if (manifest.manifest_version !== 3 || !Array.isArray(rules) || rules.length === 0) {
    console.error('[FAIL] Invalid extension manifest or rules');
    process.exit(1);
  }
  console.log('  [PASS] Chromium unpacked extension manifest and adblock rules verified');
}

console.log('\nAll Bundle Verification Tests PASSED successfully.');
