#!/usr/bin/env node
/**
 * TizenTube Windows - JS Mod Bundler
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Compiles modular ES6 modules into a single self-contained, standalone IIFE bundle
 * suitable for direct injection into Microsoft Edge WebView2 via
 * CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync without syntax errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const MODULE_ORDER = [
  'src/runtime/ipc_bridge.js',
  'src/runtime/navigation.js',
  'src/runtime/playback_engine.js',
  'src/runtime/viewing_experience.js',
  'src/mods/sponsorblock_base.js',
  'src/mods/dearrow_base.js',
  'src/mods/adblock_base.js',
  'src/ui/toast_notification.js',
  'src/ui/player_controls.js',
  'src/ui/navigation_bar.js',
  'src/ui/settings_modal.js',
  'src/ui/app_ui.js',
  'src/mods/mod_loader.js'
];

function transformModule(code, relPath) {
  // Strip import statements
  let transformed = code.replace(/^\s*import\s+[^;]+;\s*$/gm, '');
  
  // Replace export class / export const / export function / export default
  transformed = transformed.replace(/^\s*export\s+class\s+/gm, 'class ');
  transformed = transformed.replace(/^\s*export\s+const\s+/gm, 'const ');
  transformed = transformed.replace(/^\s*export\s+let\s+/gm, 'let ');
  transformed = transformed.replace(/^\s*export\s+function\s+/gm, 'function ');
  transformed = transformed.replace(/^\s*export\s+default\s+/gm, '');

  // For mod_loader.js, strip trailing auto-bootstrap since bundle IIFE handles it explicitly
  if (relPath.endsWith('mod_loader.js')) {
    transformed = transformed.replace(/\/\/\s*Auto-bootstrap in browser\/WebView context[\s\S]*$/, '');
  }

  return `// --- Module: ${relPath} ---\n` + transformed.trim();
}

export function buildBundle() {
  const chunks = [];

  chunks.push(`/**
 * TizenTube Windows - Injected Mod & UI Bundle (Self-Contained IIFE)
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 * Generated automatically by scripts/bundle_mods.js
 * Injected on document created: YouTube AdBlock, SponsorBlock, DeArrow & HUD UI
 */
(function(window, document) {
  'use strict';

  if (window.__TIZENTUBE_INJECTED__) {
    return;
  }
  window.__TIZENTUBE_INJECTED__ = true;
`);

  for (const relPath of MODULE_ORDER) {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Module file not found: ${fullPath}`);
    }
    const raw = fs.readFileSync(fullPath, 'utf8');
    const transformed = transformModule(raw, relPath);
    chunks.push(transformed);
  }

  chunks.push(`
  // Expose classes on global namespace for debugging and external hooks
  window.TizenTube = {
    IpcBridge,
    NavigationManager,
    PlaybackEngine,
    ViewingExperience,
    SPONSORBLOCK_CATEGORIES,
    SponsorBlockBase,
    DeArrowBase,
    AdBlockBase,
    ToastNotification,
    PlayerControls,
    NavigationBar,
    SettingsModal,
    AppUI,
    ModLoader
  };

  // Auto-bootstrap runtime
  try {
    const config = window.__TIZENTUBE_CONFIG__ || {};
    const loader = new ModLoader(config);
    loader.bootstrap();
    window.__TIZENTUBE_LOADER__ = loader;
    console.info('[TizenTube] Injected bundle initialized successfully.');
  } catch (err) {
    console.error('[TizenTube] Failed to bootstrap injected bundle:', err);
  }
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : undefined);
`);

  const bundleSource = chunks.join('\n\n');

  // Destinations:
  const targets = [
    path.join(projectRoot, 'src', 'mods', 'tizentube.bundle.js'),
    path.join(projectRoot, 'src', 'extension', 'tizentube.bundle.js')
  ];

  const distModsDir = path.join(projectRoot, 'dist', 'TizenTube-win-x64', 'app', 'mods');
  if (fs.existsSync(distModsDir)) {
    targets.push(path.join(distModsDir, 'tizentube.bundle.js'));
  }

  const distExtDir = path.join(projectRoot, 'dist', 'TizenTube-win-x64', 'app', 'extension');
  if (fs.existsSync(distExtDir)) {
    targets.push(path.join(distExtDir, 'tizentube.bundle.js'));
  }

  for (const target of targets) {
    const dir = path.dirname(target);
    if (fs.existsSync(target)) {
      try {
        const existing = fs.readFileSync(target, 'utf8');
        if (existing === bundleSource) {
          console.log(`[OK] Up-to-date bundle at: ${path.relative(projectRoot, target)} (${bundleSource.length} bytes)`);
          continue;
        }
      } catch (_) {}
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(target, bundleSource, 'utf8');
    console.log(`[OK] Generated bundle at: ${path.relative(projectRoot, target)} (${bundleSource.length} bytes)`);
  }

  // Also sync styles.css to extension and app ui folders
  const cssSource = fs.readFileSync(path.join(projectRoot, 'src', 'ui', 'styles.css'), 'utf8');
  const cssTargets = [
    path.join(projectRoot, 'src', 'extension', 'styles.css'),
    path.join(projectRoot, 'dist', 'TizenTube-win-x64', 'app', 'ui', 'styles.css'),
    path.join(projectRoot, 'dist', 'TizenTube-win-x64', 'app', 'extension', 'styles.css')
  ];
  for (const cssTarget of cssTargets) {
    const dir = path.dirname(cssTarget);
    if (fs.existsSync(cssTarget)) {
      try {
        const existing = fs.readFileSync(cssTarget, 'utf8');
        if (existing === cssSource) {
          continue;
        }
      } catch (_) {}
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cssTarget, cssSource, 'utf8');
  }

  return bundleSource;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildBundle();
}
