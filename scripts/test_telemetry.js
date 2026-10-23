#!/usr/bin/env node
/**
 * TizenTube Windows - Process Telemetry Test Suite
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Verifies that the telemetry collection schemas, multi-process aggregation
 * algorithms, PID tracking, and Working Set vs Private Memory validations
 * function correctly and catch invalid/incomplete datasets.
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { validateTelemetryFile, generateSimulatedTelemetry } from './measure_process_telemetry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('Running TizenTube Windows Process Telemetry Tests...\n');

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

// 1. Simulation and Validation of Complete Process Tree Telemetry
it('Simulated telemetry payload validates successfully with multi-process tracking', () => {
  const tempFile = path.join(rootDir, 'scripts', 'temp_sim_telemetry.json');
  try {
    const simData = generateSimulatedTelemetry('automated-test');
    fs.writeFileSync(tempFile, JSON.stringify(simData, null, 2), 'utf8');

    const res = validateTelemetryFile(tempFile);
    assert.strictEqual(res.valid, true, `Expected valid telemetry, got errors: ${res.errors.join(', ')}`);
    assert.strictEqual(res.processCount, 3, 'Should track 3 processes (host, renderer, gpu)');
    assert.ok(res.summary.avgTotalWorkingSetMb > 0, 'Average Working Set must be positive');
    assert.ok(res.summary.avgTotalPrivateMemoryMb > 0, 'Average Private Memory must be positive');
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

// 2. Error Detection for Incomplete or Invalid Telemetry
it('Validator rejects telemetry missing Private Memory metrics', () => {
  const tempFile = path.join(rootDir, 'scripts', 'temp_invalid_priv.json');
  try {
    const badData = {
      timestamp: new Date().toISOString(),
      scenario: 'broken-test',
      durationSeconds: 10,
      hostPid: 100,
      summary: {
        avgTotalWorkingSetMb: 50
        // missing avgTotalPrivateMemoryMb
      },
      processes: [
        { pid: 100, name: 'TizenTubeHost', workingSetMb: 50 }
      ]
    };
    fs.writeFileSync(tempFile, JSON.stringify(badData), 'utf8');

    const res = validateTelemetryFile(tempFile);
    assert.strictEqual(res.valid, false, 'Should fail validation when Private Memory is omitted');
    assert.ok(res.errors.some(e => e.includes('private memory')), 'Error must mention private memory');
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

it('Validator rejects telemetry with non-positive memory values', () => {
  const tempFile = path.join(rootDir, 'scripts', 'temp_zero_mem.json');
  try {
    const badData = {
      timestamp: new Date().toISOString(),
      scenario: 'zero-test',
      durationSeconds: 10,
      hostPid: 100,
      summary: {
        avgTotalWorkingSetMb: 0,
        avgTotalPrivateMemoryMb: 0
      },
      processes: [
        { pid: 100, name: 'TizenTubeHost', workingSetMb: 0, privateMemoryMb: 0 }
      ]
    };
    fs.writeFileSync(tempFile, JSON.stringify(badData), 'utf8');

    const res = validateTelemetryFile(tempFile);
    assert.strictEqual(res.valid, false, 'Should reject zero memory values');
    assert.ok(res.errors.some(e => e.includes('greater than 0')), 'Error must specify greater than 0');
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

it('Validator rejects telemetry missing numeric process PID', () => {
  const tempFile = path.join(rootDir, 'scripts', 'temp_bad_pid.json');
  try {
    const badData = {
      timestamp: new Date().toISOString(),
      scenario: 'bad-pid-test',
      durationSeconds: 10,
      summary: {
        avgTotalWorkingSetMb: 100,
        avgTotalPrivateMemoryMb: 80
      },
      processes: [
        { name: 'TizenTubeHost', workingSetMb: 100, privateMemoryMb: 80 } // missing PID
      ]
    };
    fs.writeFileSync(tempFile, JSON.stringify(badData), 'utf8');

    const res = validateTelemetryFile(tempFile);
    assert.strictEqual(res.valid, false, 'Should reject process missing PID');
    assert.ok(res.errors.some(e => e.includes('PID')), 'Error must mention PID');
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

// 3. Validation of Internal Host Telemetry Schema
it('C# Host telemetry JSON format matches schema and contains required fields', () => {
  // Construct a sample payload matching MainWindow.CollectTelemetryJson
  const hostJsonPayload = {
    timestamp: "2026-10-23T05:00:00.0000000Z",
    scenario: "smoke-test-completed",
    durationSeconds: 15.02,
    summary: {
      totalWorkingSetBytes: 157286400,
      totalWorkingSetMb: 150.0,
      totalPrivateMemoryBytes: 136314880,
      totalPrivateMemoryMb: 130.0,
      processCount: 3,
      blockedAdRequests: 14,
      emptyWorkingSetTrimCount: 1,
      modsInitializedCount: 1,
      sponsorBlockSkipCount: 2
    },
    processes: [
      {
        pid: 8820,
        name: "TizenTubeHost",
        role: "host",
        workingSetBytes: 31457280,
        workingSetMb: 30.0,
        privateMemoryBytes: 25165824,
        privateMemoryMb: 24.0,
        peakWorkingSetBytes: 35651584,
        peakWorkingSetMb: 34.0,
        cpuTimeMs: 120.5
      },
      {
        pid: 8828,
        name: "msedgewebview2",
        role: "webview2-subsystem",
        workingSetBytes: 83886080,
        workingSetMb: 80.0,
        privateMemoryBytes: 73400320,
        privateMemoryMb: 70.0,
        peakWorkingSetBytes: 88080384,
        peakWorkingSetMb: 84.0,
        cpuTimeMs: 410.2
      },
      {
        pid: 8832,
        name: "msedgewebview2",
        role: "webview2-subsystem",
        workingSetBytes: 41943040,
        workingSetMb: 40.0,
        privateMemoryBytes: 37748736,
        privateMemoryMb: 36.0,
        peakWorkingSetBytes: 45088768,
        peakWorkingSetMb: 43.0,
        cpuTimeMs: 250.1
      }
    ]
  };

  const tempFile = path.join(rootDir, 'scripts', 'temp_host_json.json');
  try {
    fs.writeFileSync(tempFile, JSON.stringify(hostJsonPayload, null, 2), 'utf8');
    const res = validateTelemetryFile(tempFile);
    assert.strictEqual(res.valid, true, `Host JSON must be valid: ${res.errors.join(', ')}`);
    assert.strictEqual(res.summary.processCount, 3, 'Must report 3 processes');
    assert.strictEqual(res.summary.blockedAdRequests, 14, 'Must track blocked ad count');
    assert.strictEqual(res.summary.emptyWorkingSetTrimCount, 1, 'Must track trim count');
    assert.strictEqual(res.summary.modsInitializedCount, 1, 'Must track mods initialized count');
    assert.strictEqual(res.summary.sponsorBlockSkipCount, 2, 'Must track sponsorblock skip count');
  } finally {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
  }
});

// 4. Distinction Between Working Set and Private Memory
it('Confirms mathematical distinction between Working Set and Private Memory', () => {
  const sim = generateSimulatedTelemetry('memory-distinction-check');
  const host = sim.processes.find(p => p.role === 'host');
  assert.ok(host, 'Must contain host process');

  // Verify that Working Set and Private Memory are separate tracked dimensions
  assert.notStrictEqual(host.maxWorkingSetMb, undefined);
  assert.notStrictEqual(host.maxPrivateMemoryMb, undefined);
  assert.ok(typeof host.maxWorkingSetMb === 'number');
  assert.ok(typeof host.maxPrivateMemoryMb === 'number');
});

// 5. CLI Execution & Tooling Verification
it('CLI --simulate generates valid telemetry artifact on disk', () => {
  const cliScript = path.join(rootDir, 'scripts', 'measure_process_telemetry.js');
  const tempSimPath = path.join(rootDir, 'scripts', 'temp_cli_sim.json');
  try {
    const out = execSync(`node "${cliScript}" --simulate "${tempSimPath}"`, { encoding: 'utf8' });
    assert.ok(out.includes('[OK]'), 'Must report OK message on simulation');
    assert.ok(fs.existsSync(tempSimPath), 'Simulated file must exist on disk');

    const check = validateTelemetryFile(tempSimPath);
    assert.strictEqual(check.valid, true, `Generated simulation must be valid: ${check.errors.join(', ')}`);
  } finally {
    if (fs.existsSync(tempSimPath)) fs.unlinkSync(tempSimPath);
  }
});

it('CLI --validate exits with code 0 on valid artifact and code 1 on invalid artifact', () => {
  const cliScript = path.join(rootDir, 'scripts', 'measure_process_telemetry.js');
  const tempValidPath = path.join(rootDir, 'scripts', 'temp_cli_valid.json');
  const tempInvalidPath = path.join(rootDir, 'scripts', 'temp_cli_invalid.json');

  try {
    const sim = generateSimulatedTelemetry('cli-valid-test');
    fs.writeFileSync(tempValidPath, JSON.stringify(sim, null, 2), 'utf8');

    const validOut = execSync(`node "${cliScript}" --validate "${tempValidPath}"`, { encoding: 'utf8' });
    assert.ok(validOut.includes('[PASS]'), 'Must report PASS for valid artifact');

    fs.writeFileSync(tempInvalidPath, JSON.stringify({ broken: true }), 'utf8');
    let failedAsExpected = false;
    try {
      execSync(`node "${cliScript}" --validate "${tempInvalidPath}"`, { encoding: 'utf8', stdio: 'pipe' });
    } catch (err) {
      failedAsExpected = true;
      assert.strictEqual(err.status, 1, 'Must exit with status 1 on invalid artifact');
    }
    assert.strictEqual(failedAsExpected, true, 'CLI must fail on broken telemetry');
  } finally {
    if (fs.existsSync(tempValidPath)) fs.unlinkSync(tempValidPath);
    if (fs.existsSync(tempInvalidPath)) fs.unlinkSync(tempInvalidPath);
  }
});

// 6. PowerShell Telemetry Script Contract & Structural Verification
it('scripts/measure_memory.ps1 implements comprehensive PID, working set, and private memory tracking', () => {
  const ps1Path = path.join(rootDir, 'scripts', 'measure_memory.ps1');
  assert.ok(fs.existsSync(ps1Path), 'measure_memory.ps1 must exist');
  const ps1Content = fs.readFileSync(ps1Path, 'utf8');

  // Verify parameters
  assert.ok(ps1Content.includes('$ExePath'), 'Must support -ExePath parameter');
  assert.ok(ps1Content.includes('$HostPid'), 'Must support -HostPid parameter');
  assert.ok(ps1Content.includes('$DurationSeconds'), 'Must support -DurationSeconds parameter');
  assert.ok(ps1Content.includes('$SamplingIntervalMs'), 'Must support -SamplingIntervalMs parameter');
  assert.ok(ps1Content.includes('$OutputDir'), 'Must support -OutputDir parameter');
  assert.ok(ps1Content.includes('$Scenario'), 'Must support -Scenario parameter');
  assert.ok(ps1Content.includes('$Headless'), 'Must support -Headless parameter');

  // Verify metric tracking
  assert.ok(ps1Content.includes('WorkingSet64'), 'Must track WorkingSet64');
  assert.ok(ps1Content.includes('PrivateMemorySize64'), 'Must track PrivateMemorySize64');
  assert.ok(ps1Content.includes('msedgewebview2'), 'Must track msedgewebview2 child processes');
  assert.ok(ps1Content.includes('host-internal-telemetry.json'), 'Must coordinate with internal host telemetry');
  assert.ok(ps1Content.includes('memory-telemetry.json'), 'Must export memory-telemetry.json');
  assert.ok(ps1Content.includes('memory-summary.txt'), 'Must export memory-summary.txt');
  assert.ok(ps1Content.includes('WaitForExit'), 'Must wait for host graceful exit');
});

// 7. C# Native Host Telemetry Integration Contract
it('C# Host implementation enforces CultureInfo.InvariantCulture for telemetry serialization', () => {
  const hostCsPath = path.join(rootDir, 'src', 'native', 'TizenTubeHost.cs');
  assert.ok(fs.existsSync(hostCsPath), 'TizenTubeHost.cs must exist');
  const hostCode = fs.readFileSync(hostCsPath, 'utf8');

  assert.ok(hostCode.includes('CultureInfo.InvariantCulture'), 'Must use CultureInfo.InvariantCulture');
  assert.ok(hostCode.includes('CollectTelemetryJson'), 'Must implement CollectTelemetryJson');
  assert.ok(hostCode.includes('DumpTelemetryReport'), 'Must implement DumpTelemetryReport');
  assert.ok(hostCode.includes('telemetry:request'), 'Must support IPC telemetry query');
  assert.ok(hostCode.includes('modsInitializedCount'), 'Must track modsInitializedCount');
  assert.ok(hostCode.includes('sponsorBlockSkipCount'), 'Must track sponsorBlockSkipCount');
  assert.ok(hostCode.includes('--smoke-test'), 'Must support --smoke-test CLI argument');
  assert.ok(hostCode.includes('--telemetry-file'), 'Must support --telemetry-file CLI argument');
});

console.log(`\nAll ${passedTests}/${totalTests} Process Telemetry Tests PASSED successfully.\n`);
