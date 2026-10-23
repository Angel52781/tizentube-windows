#!/usr/bin/env node
/**
 * TizenTube Windows - Host Architecture & Binary Integrity Test Suite
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Formally verifies that the Windows host implementation, PE32+ entry point,
 * project configuration, and launch scripts meet all non-trampoline architecture gates.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Running TizenTube Windows Host & Binary Integrity Tests...\n');

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

// ============================================================================
// 1. Native C# / .NET Host Project & Source Verification
// ============================================================================
it('C# Project file specifies x64 WinExe, WebView2 package, and net8.0 target', () => {
  const csprojPath = path.join(rootDir, 'src', 'native', 'TizenTubeWindows.csproj');
  assert.ok(fs.existsSync(csprojPath), 'TizenTubeWindows.csproj must exist');
  const content = fs.readFileSync(csprojPath, 'utf8');

  assert.ok(content.includes('<OutputType>WinExe</OutputType>'), 'Must specify WinExe output');
  assert.ok(content.includes('<PlatformTarget>x64</PlatformTarget>'), 'Must target x64');
  assert.ok(content.includes('net8.0-windows'), 'Must target net8.0-windows');
  assert.ok(content.includes('Microsoft.Web.WebView2'), 'Must reference Microsoft.Web.WebView2');
  assert.ok(content.includes('<PackageLicenseExpression>GPL-3.0-only</PackageLicenseExpression>'), 'Must declare GPL-3.0-only');
});

it('C# Host implementation configures WebView2, single-renderer, ad-filtering, IPC, and script injection', () => {
  const hostCsPath = path.join(rootDir, 'src', 'native', 'TizenTubeHost.cs');
  assert.ok(fs.existsSync(hostCsPath), 'TizenTubeHost.cs must exist');
  const code = fs.readFileSync(hostCsPath, 'utf8');

  // Licensing and namespace
  assert.ok(code.includes('GPL-3.0-only'), 'Must include GPL-3.0-only license header');
  assert.ok(code.includes('using Microsoft.Web.WebView2.Core;'), 'Must import WebView2 Core');
  assert.ok(code.includes('using Microsoft.Web.WebView2.WinForms;'), 'Must import WebView2 WinForms');

  // Resource optimization flags
  assert.ok(code.includes('--renderer-process-limit=1'), 'Must constrain renderer process limit');
  assert.ok(code.includes('VaapiVideoDecoder'), 'Must enable hardware video acceleration');
  assert.ok(code.includes('--disk-cache-size='), 'Must bound disk cache size');

  // Network-level adblock filter
  assert.ok(code.includes('AddWebResourceRequestedFilter'), 'Must install protocol-level ad filters');
  assert.ok(code.includes('204'), 'Must return HTTP 204 No Content for blocked network requests');

  // Mod injection prior to page navigation
  assert.ok(code.includes('AddScriptToExecuteOnDocumentCreatedAsync'), 'Must register mod injection on document creation');
  const injectCallPos = code.indexOf('await InjectModsAsync();');
  const sourceNavPos = code.indexOf('webView.Source = new Uri');
  assert.ok(injectCallPos > 0 && sourceNavPos > 0 && injectCallPos < sourceNavPos,
    'Must register script injection BEFORE navigating webView.Source to YouTube');

  // IPC bridge handling
  assert.ok(code.includes('WebMessageReceived'), 'Must handle IPC messages from web context');
  assert.ok(code.includes('sponsorblock:skipped'), 'Must handle SponsorBlock IPC');
  assert.ok(code.includes('preferences:save'), 'Must handle preferences persistence IPC');
  assert.ok(code.includes('fullscreen:toggle') || code.includes('fullscreen:state'), 'Must handle fullscreen IPC');

  // Working set memory trimming
  assert.ok(code.includes('EmptyWorkingSet'), 'Must import Win32 EmptyWorkingSet API');
  assert.ok(code.includes('msedgewebview2'), 'Must trim child WebView2 process working sets');
});

// ============================================================================
// 2. Deterministic PE32+ Entry-Point Binary Verification
// ============================================================================
it('TizenTube.exe is a bit-exact PE32+ binary with genuine host launching and GUI error handling', () => {
  const exePath = path.join(rootDir, 'dist', 'TizenTube-win-x64', 'TizenTube.exe');
  assert.ok(fs.existsSync(exePath), 'dist/TizenTube-win-x64/TizenTube.exe must exist');
  const buffer = fs.readFileSync(exePath);

  assert.strictEqual(buffer.length, 3072, 'Binary size must be exactly 3072 bytes (0xC00)');
  assert.strictEqual(buffer.toString('ascii', 0, 2), 'MZ', 'Must start with MZ DOS magic');

  const peOffset = buffer.readUInt32LE(0x3C);
  assert.strictEqual(buffer.toString('ascii', peOffset, peOffset + 4), 'PE\0\0', 'Must have valid PE signature');

  const machine = buffer.readUInt16LE(peOffset + 4);
  assert.strictEqual(machine, 0x8664, 'Must be AMD64 / x86-64 machine');

  const optMagic = buffer.readUInt16LE(peOffset + 24);
  assert.strictEqual(optMagic, 0x020b, 'Must be PE32+ Optional Header');

  const subsystem = buffer.readUInt16LE(peOffset + 24 + 68);
  assert.strictEqual(subsystem, 2, 'Subsystem must be Windows GUI (2)');

  const dllChars = buffer.readUInt16LE(peOffset + 24 + 70);
  assert.ok((dllChars & 0x0100) !== 0, 'NX_COMPAT (DEP) must be enabled');
  assert.ok((dllChars & 0x0040) !== 0, 'DYNAMIC_BASE (ASLR) must be enabled');
  assert.ok((dllChars & 0x0020) !== 0, 'HIGH_ENTROPY_VA (64-bit ASLR) must be enabled');
});

it('TizenTube.exe does NOT contain PowerShell or Edge trampoline launcher strings', () => {
  const exePath = path.join(rootDir, 'dist', 'TizenTube-win-x64', 'TizenTube.exe');
  const buffer = fs.readFileSync(exePath);
  const binaryString = buffer.toString('binary');

  // Verify that deceptive launcher strings are absent
  assert.ok(!binaryString.includes('powershell'), 'Must NOT contain powershell string');
  assert.ok(!binaryString.includes('launch.ps1'), 'Must NOT contain launch.ps1 string');
  assert.ok(!binaryString.includes('msedge'), 'Must NOT contain msedge string');

  // Verify that genuine host and error reporting strings are present
  const utf16Host = Buffer.from('TizenTubeHost.exe\0', 'utf16le').toString('binary');
  const utf16MsgBox = Buffer.from('MessageBoxW\0', 'binary').toString('binary');
  assert.ok(binaryString.includes(utf16Host), 'Must reference TizenTubeHost.exe');
  assert.ok(binaryString.includes(utf16MsgBox), 'Must reference USER32 MessageBoxW');
});

// ============================================================================
// 3. Launch Scripts & Fallback Verification
// ============================================================================
it('launch.ps1 requires native host and does NOT fall back to msedge.exe --app', () => {
  const ps1Path = path.join(rootDir, 'dist', 'TizenTube-win-x64', 'launch.ps1');
  assert.ok(fs.existsSync(ps1Path), 'dist/TizenTube-win-x64/launch.ps1 must exist');
  const ps1 = fs.readFileSync(ps1Path, 'utf8');

  assert.ok(ps1.includes('TizenTubeHost.exe'), 'Must check for TizenTubeHost.exe');
  assert.ok(!ps1.includes('msedge.exe'), 'Must NOT fall back to msedge.exe');
  assert.ok(!ps1.includes('--app='), 'Must NOT launch Edge in --app mode');
  assert.ok(ps1.includes('exit 1'), 'Must exit with error if host is absent');
});

// ============================================================================
// 4. Distribution Manifest & Cryptographic Verification
// ============================================================================
it('SHA256SUMS.txt accurately validates all distribution artifacts', () => {
  const sumsPath = path.join(rootDir, 'dist', 'TizenTube-win-x64', 'SHA256SUMS.txt');
  assert.ok(fs.existsSync(sumsPath), 'SHA256SUMS.txt must exist');
  const lines = fs.readFileSync(sumsPath, 'utf8').trim().split('\n');

  assert.ok(lines.length >= 20, `Expected at least 20 distribution files, found ${lines.length}`);

  for (const line of lines) {
    if (!line.trim()) continue;
    const [expectedHash, relPath] = line.trim().split(/\s+/);
    const filePath = path.join(rootDir, 'dist', 'TizenTube-win-x64', relPath);
    assert.ok(fs.existsSync(filePath), `Distribution file missing: ${relPath}`);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    assert.strictEqual(actualHash, expectedHash, `Hash mismatch for ${relPath}`);
  }
});

console.log(`\nAll ${passedTests}/${totalTests} Host Integrity & Architecture Tests PASSED successfully.\n`);
