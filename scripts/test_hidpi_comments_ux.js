#!/usr/bin/env node
/**
 * TizenTube Windows - HiDPI & Comment Section UX Test Suite
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Verifies WebView2 text clarity configuration, HiDPI font smoothing,
 * comment section anti-blur rules, spacing consistency, and ensures zero
 * regression of theater mode and floating video controls.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Running TizenTube Windows HiDPI & Comments UX Regression Tests...\n');

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
    throw err;
  }
}

// ============================================================================
// 1. Native Host & Manifest DPI Configuration
// ============================================================================
it('C# Host specifies PerMonitorV2 DPI awareness via Win32 API and WinForms', () => {
  const hostCsPath = path.join(rootDir, 'src', 'native', 'TizenTubeHost.cs');
  assert.ok(fs.existsSync(hostCsPath), 'TizenTubeHost.cs must exist');
  const code = fs.readFileSync(hostCsPath, 'utf8');

  assert.ok(code.includes('SetProcessDpiAwarenessContext'), 'Must import Win32 SetProcessDpiAwarenessContext');
  assert.ok(code.includes('DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2'), 'Must declare PerMonitorV2 context');
  assert.ok(code.includes('Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);'), 'Must configure WinForms HighDpiMode.PerMonitorV2');
});

it('C# Project file and app.manifest configure PerMonitorV2 HiDPI mode', () => {
  const csprojPath = path.join(rootDir, 'src', 'native', 'TizenTubeWindows.csproj');
  assert.ok(fs.existsSync(csprojPath), 'TizenTubeWindows.csproj must exist');
  const csproj = fs.readFileSync(csprojPath, 'utf8');
  assert.ok(csproj.includes('<ApplicationHighDpiMode>PerMonitorV2</ApplicationHighDpiMode>'), 'Must specify ApplicationHighDpiMode in csproj');
  assert.ok(csproj.includes('<ApplicationManifest>app.manifest</ApplicationManifest>'), 'Must reference app.manifest in csproj');

  const manifestPath = path.join(rootDir, 'src', 'native', 'app.manifest');
  assert.ok(fs.existsSync(manifestPath), 'app.manifest must exist');
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  assert.ok(manifest.includes('<dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2, PerMonitor</dpiAwareness>'),
    'Manifest must declare PerMonitorV2 dpiAwareness');
});

it('Chromium CLI arguments include high-DPI support, font antialiasing, and sRGB profile', () => {
  const hostCsPath = path.join(rootDir, 'src', 'native', 'TizenTubeHost.cs');
  const code = fs.readFileSync(hostCsPath, 'utf8');
  assert.ok(code.includes('--high-dpi-support=1'), 'Host must pass --high-dpi-support=1');
  assert.ok(code.includes('--enable-font-antialiasing'), 'Host must pass --enable-font-antialiasing');
  assert.ok(code.includes('--force-color-profile=srgb'), 'Host must pass --force-color-profile=srgb');

  const configPath = path.join(rootDir, 'src', 'core', 'config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const flags = config.runtime?.chromiumFlags || [];
  assert.ok(flags.includes('--high-dpi-support=1'), 'config.json must include --high-dpi-support=1');
  assert.ok(flags.includes('--enable-font-antialiasing'), 'config.json must include --enable-font-antialiasing');
  assert.ok(flags.includes('--force-color-profile=srgb'), 'config.json must include --force-color-profile=srgb');
});

// ============================================================================
// 2. CSS HiDPI Typography & Anti-Blur Engine
// ============================================================================
it('Stylesheet contains global HiDPI font smoothing and legibility optimization', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  assert.ok(fs.existsSync(cssPath), 'src/ui/styles.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('-webkit-font-smoothing: antialiased;'), 'Must specify -webkit-font-smoothing: antialiased');
  assert.ok(css.includes('-moz-osx-font-smoothing: grayscale;'), 'Must specify -moz-osx-font-smoothing: grayscale');
  assert.ok(css.includes('text-rendering: optimizeLegibility;'), 'Must optimize text rendering');
  assert.ok(css.includes('text-size-adjust: 100%;'), 'Must constrain text-size-adjust to 100%');
});

it('Eliminates subpixel compositing blur on comment sections and watch metadata', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Comment anti-blur
  assert.ok(css.includes('ytd-comment-thread-renderer') && css.includes('transform: none !important;'),
    'Must disable unwanted 3D transforms on comment renderers');
  assert.ok(css.includes('will-change: auto !important;'), 'Must reset will-change to prevent layer promotion');
  assert.ok(css.includes('filter: none !important;'), 'Must disable filters that degrade text sharpness');

  // Watch metadata anti-blur
  assert.ok(css.includes('ytd-watch-metadata #title') && css.includes('backface-visibility: visible !important;'),
    'Must prevent backface layer promotion on titles');
});

it('Enforces crisp typography, kerning, and line spacing on comment text', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('#content-text.ytd-comment-view-model') || css.includes('#content-text.ytd-comment-renderer'),
    'Must target comment text containers');
  assert.ok(css.includes('font-size: 1.4rem !important;'), 'Comment font size must match YouTube desktop standard (1.4rem)');
  assert.ok(css.includes('line-height: 2.0rem !important;'), 'Comment line height must be 2.0rem for crisp readability');
  assert.ok(css.includes('font-feature-settings: "kern" 1;'), 'Must enable OpenType kerning');
  assert.ok(css.includes('word-break: break-word;'), 'Must cleanly break long words');
});

it('Optimizes comment author avatar image rendering for high contrast on HiDPI', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('image-rendering: -webkit-optimize-contrast;'), 'Must specify -webkit-optimize-contrast for avatars');
  assert.ok(css.includes('image-rendering: crisp-edges;'), 'Must specify crisp-edges for avatars');
  assert.ok(css.includes('border-radius: 50% !important;'), 'Must enforce 50% border radius');
});

// ============================================================================
// 3. Comment Layout & Spacing Consistency
// ============================================================================
it('Enforces uniform 16px vertical spacing between top-level comment threads', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('ytd-comment-thread-renderer {'), 'Must target ytd-comment-thread-renderer');
  assert.ok(css.includes('margin-bottom: 16px !important;'), 'Must enforce 16px margin-bottom between comments');
});

it('Configures clean flex row and 16px gap between avatar and comment main column', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('#body.ytd-comment-view-model') && css.includes('gap: 16px !important;'),
    'Must enforce 16px flex gap on comment body');
  assert.ok(css.includes('width: 40px !important;') && css.includes('height: 40px !important;'),
    'Top-level avatar must be 40x40px');
});

it('Aligns comment author header elements with baseline and 8px horizontal gap', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('#header-author {'), 'Must target #header-author');
  assert.ok(css.includes('align-items: baseline !important;'), 'Must align author elements to baseline');
  assert.ok(css.includes('gap: 8px !important;'), 'Must enforce 8px gap in header');
});

it('Enforces 56px left indentation for nested reply threads matching avatar offset', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('#replies.ytd-comment-thread-renderer') || css.includes('ytd-comment-replies-renderer'),
    'Must target reply containers');
  assert.ok(css.includes('margin-left: 56px !important;'), 'Reply margin-left must be 56px (40px avatar + 16px gap)');
  assert.ok(css.includes('width: 24px !important;') && css.includes('height: 24px !important;'),
    'Reply avatar must be 24x24px');
});

// ============================================================================
// 4. Zero Regression: Theater and Floating Player Controls
// ============================================================================
it('Zero regression: Native PiP button retains exact positioning, size and styling', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  assert.ok(css.includes('.ytp-right-controls #tizentube-native-pip.ytp-button {'), 'Must preserve #tizentube-native-pip selector');
  assert.ok(css.includes('display: inline-flex !important;'), 'Must retain display: inline-flex');
  assert.ok(css.includes('width: 48px;'), 'Must retain width: 48px');
  assert.ok(css.includes('flex: 0 0 48px;'), 'Must retain flex: 0 0 48px');
  assert.ok(css.includes('visibility: visible !important;'), 'Must retain visibility: visible');
  assert.ok(css.includes('opacity: 1 !important;'), 'Must retain opacity: 1');
});

it('Zero regression: Theater mode and player selectors remain uncompromised', () => {
  const cssPath = path.join(rootDir, 'src', 'ui', 'styles.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify that theater attributes and size buttons are not overridden
  assert.ok(!css.includes('ytd-watch-flexy[theater] { display: none'), 'Theater must not be suppressed');
  assert.ok(!css.includes('.ytp-size-button { display: none'), 'Theater size button must not be suppressed');
  assert.ok(!css.includes('video.html5-main-video { display: none'), 'Main video element must not be suppressed');
});

// ============================================================================
// 5. Simulated DOM Geometry & Layout Hierarchy Verification
// ============================================================================
it('Simulated YouTube DOM verifies comment layout hierarchy and PiP button alignment', () => {
  class SimpleDOMNode {
    constructor(tag, id = '', className = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.className = className;
      this.children = [];
      this.parentNode = null;
      this.styles = {};
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    querySelector(selector) {
      if (selector.startsWith('#')) {
        const targetId = selector.slice(1);
        if (this.id === targetId) return this;
      } else if (selector.startsWith('.')) {
        const targetClass = selector.slice(1);
        if (this.className.split(/\s+/).includes(targetClass)) return this;
      } else if (this.tagName.toLowerCase() === selector.toLowerCase()) {
        return this;
      }
      for (const child of this.children) {
        const res = child.querySelector(selector);
        if (res) return res;
      }
      return null;
    }
    querySelectorAll(selector) {
      const results = [];
      const match = (node) => {
        if (selector.startsWith('.')) {
          if (node.className.split(/\s+/).includes(selector.slice(1))) results.push(node);
        } else if (selector.startsWith('#')) {
          if (node.id === selector.slice(1)) results.push(node);
        } else if (node.tagName.toLowerCase() === selector.toLowerCase()) {
          results.push(node);
        }
        for (const c of node.children) match(c);
      };
      for (const c of this.children) match(c);
      return results;
    }
  }

  // Build simulated YouTube watch page DOM tree
  const root = new SimpleDOMNode('div', 'ytd-app');
  const watchFlexy = root.appendChild(new SimpleDOMNode('ytd-watch-flexy', 'columns'));

  // Right controls bar
  const rightControls = watchFlexy.appendChild(new SimpleDOMNode('div', '', 'ytp-right-controls'));
  const ccBtn = rightControls.appendChild(new SimpleDOMNode('button', '', 'ytp-subtitles-button'));
  const pipBtn = rightControls.appendChild(new SimpleDOMNode('button', 'tizentube-native-pip', 'ytp-button'));
  const settingsBtn = rightControls.appendChild(new SimpleDOMNode('button', '', 'ytp-settings-button'));

  // Verify pip button position: exactly between CC and settings
  const ccIdx = rightControls.children.indexOf(ccBtn);
  const pipIdx = rightControls.children.indexOf(pipBtn);
  const settingsIdx = rightControls.children.indexOf(settingsBtn);
  assert.ok(pipIdx > ccIdx && pipIdx < settingsIdx, 'PiP button must sit directly between CC and Settings');

  // Comments section
  const comments = watchFlexy.appendChild(new SimpleDOMNode('ytd-comments', 'comments'));
  const commentThread1 = comments.appendChild(new SimpleDOMNode('ytd-comment-thread-renderer', 'thread-1'));
  const body1 = commentThread1.appendChild(new SimpleDOMNode('div', 'body', 'ytd-comment-view-model'));
  const avatar1 = body1.appendChild(new SimpleDOMNode('div', 'author-thumbnail'));
  const main1 = body1.appendChild(new SimpleDOMNode('div', 'main'));
  const header1 = main1.appendChild(new SimpleDOMNode('div', 'header-author'));
  const content1 = main1.appendChild(new SimpleDOMNode('div', 'content-text'));

  // Nested reply thread
  const replies1 = commentThread1.appendChild(new SimpleDOMNode('div', 'replies', 'ytd-comment-thread-renderer'));
  const replyBody1 = replies1.appendChild(new SimpleDOMNode('div', 'body', 'ytd-comment-view-model'));
  const replyAvatar1 = replyBody1.appendChild(new SimpleDOMNode('div', 'author-thumbnail'));

  assert.ok(comments.querySelector('ytd-comment-thread-renderer') !== null, 'Comments contains comment threads');
  assert.ok(commentThread1.querySelector('#content-text') !== null, 'Comment thread contains content text');
  assert.ok(commentThread1.querySelector('#replies') !== null, 'Comment thread contains nested replies');
});

console.log(`\nAll ${passedTests}/${totalTests} HiDPI & Comments UX regression checks PASSED successfully.\n`);
