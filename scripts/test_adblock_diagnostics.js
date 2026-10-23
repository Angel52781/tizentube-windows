#!/usr/bin/env node
/** Metadata-only, on-demand structural ad diagnostics regression. GPL-3.0-only. */
import assert from 'node:assert/strict';
import { AdBlockBase } from '../src/mods/adblock_base.js';

const oldWindow = globalThis.window;
const oldDocument = globalThis.document;
const callbacks = new Map();
const sent = [];
let prevented = false;
const grandparent = { tagName: 'YTD-VIDEO-MASTHEAD-AD-V3-RENDERER', id: 'masthead', parentElement: null };
const parent = { tagName: 'YT-FORMATTED-STRING', id: 'ad-badge', parentElement: grandparent };
const badge = { tagName: 'SPAN', textContent: 'Patrocinado', children: [], id: '', parentElement: parent };
try {
  globalThis.window = {
    chrome: { webview: { postMessage: obj => sent.push(obj) } },
    addEventListener: (name, fn) => callbacks.set(name, fn),
    removeEventListener: name => callbacks.delete(name)
  };
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: sel => sel.includes('yt-formatted-string, yt-attributed-string')
      ? [badge] : sel === 'ytd-video-masthead-ad-v3-renderer' ? [grandparent] : []
  };
  const block = new AdBlockBase({ cosmeticFilter: false, autoSkipVideoAds: false });
  block.install();
  try {
    assert.ok(callbacks.has('keydown'), 'Manual diagnostic hotkey installed');
    callbacks.get('keydown')({ ctrlKey: true, shiftKey: true, code: 'F10', repeat: false,
      preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].channel, 'adblock:diagnostic');
    assert.equal(sent[0].payload.schema, 'tizentube.adblock.dom.v1');
    assert.equal(sent[0].payload.counts['ytd-video-masthead-ad-v3-renderer'], 1);
    assert.equal(sent[0].payload.badgeAncestors[0].badge, 'patrocinado');
    assert.equal(sent[0].payload.badgeAncestors[0].ancestry[2].tag,
      'ytd-video-masthead-ad-v3-renderer');
    const output = JSON.stringify(sent[0]);
    for (const sensitive of ['cookies', 'access_token', 'videoId', 'watch?v=',
      'personal recommendation title', 'account@gmail.com']) {
      assert.ok(!output.includes(sensitive), `Diagnostic leaked ${sensitive}`);
    }
  } finally { block.dispose(); }
  assert.ok(!callbacks.has('keydown'), 'Hotkey removed on disposal');
  assert.equal(sent.length, 1, 'No automatic personal information collection');
  console.log('On-demand ad diagnostic behavior and privacy checks PASSED.');
} finally {
  if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
}
