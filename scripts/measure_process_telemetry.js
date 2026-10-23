#!/usr/bin/env node
/**
 * TizenTube Windows - Process Telemetry Parser & Validator
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Validates, summarizes, and simulates multi-process telemetry datasets
 * capturing Working Set and Private Memory per PID across the host process tree.
 */

import fs from 'fs';
import path from 'path';

/**
 * Validates a memory telemetry JSON artifact.
 * @param {string} filePath Path to telemetry JSON file
 * @returns {{ valid: boolean, errors: string[], summary: Object }}
 */
export function validateTelemetryFile(filePath) {
  const errors = [];

  if (!fs.existsSync(filePath)) {
    return { valid: false, errors: [`Telemetry file not found: ${filePath}`], summary: null };
  }

  let data;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(raw);
  } catch (err) {
    return { valid: false, errors: [`Failed to parse JSON: ${err.message}`], summary: null };
  }

  // 1. Root structure validation
  if (!data.timestamp || typeof data.timestamp !== 'string') {
    errors.push('Missing or invalid root "timestamp" field');
  }
  if (!data.scenario || typeof data.scenario !== 'string') {
    errors.push('Missing or invalid root "scenario" field');
  }
  if (typeof data.durationSeconds !== 'number' || data.durationSeconds < 0) {
    errors.push('Missing or invalid root "durationSeconds" field');
  }

  // 2. Summary structure validation
  if (!data.summary || typeof data.summary !== 'object') {
    errors.push('Missing root "summary" object');
  } else {
    const s = data.summary;
    const hasWorkingSet = typeof s.avgTotalWorkingSetMb === 'number' || typeof s.totalWorkingSetMb === 'number';
    const hasPrivateMemory = typeof s.avgTotalPrivateMemoryMb === 'number' || typeof s.totalPrivateMemoryMb === 'number';

    if (!hasWorkingSet) {
      errors.push('Summary missing total working set metric');
    }
    if (!hasPrivateMemory) {
      errors.push('Summary missing total private memory metric');
    }

    const wsVal = s.avgTotalWorkingSetMb ?? s.totalWorkingSetMb ?? 0;
    const privVal = s.avgTotalPrivateMemoryMb ?? s.totalPrivateMemoryMb ?? 0;

    if (wsVal <= 0) {
      errors.push(`Total Working Set must be greater than 0 MB (found ${wsVal})`);
    }
    if (privVal <= 0) {
      errors.push(`Total Private Memory must be greater than 0 MB (found ${privVal})`);
    }
  }

  // 3. Process breakdown validation
  if (!Array.isArray(data.processes) || data.processes.length === 0) {
    errors.push('Missing or empty "processes" array (must track at least host process)');
  } else {
    for (let i = 0; i < data.processes.length; i++) {
      const p = data.processes[i];
      if (!p.pid || typeof p.pid !== 'number') {
        errors.push(`Process[${i}] missing valid numeric PID`);
      }
      const pWs = p.maxWorkingSetMb ?? p.workingSetMb ?? (p.workingSetBytes ? p.workingSetBytes / 1048576 : null);
      const pPriv = p.maxPrivateMemoryMb ?? p.privateMemoryMb ?? (p.privateMemoryBytes ? p.privateMemoryBytes / 1048576 : null);

      if (pWs === null || typeof pWs !== 'number') {
        errors.push(`Process[${i}] (PID ${p.pid}) missing Working Set measurement`);
      }
      if (pPriv === null || typeof pPriv !== 'number') {
        errors.push(`Process[${i}] (PID ${p.pid}) missing Private Memory measurement`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: data.summary,
    processCount: data.processes ? data.processes.length : 0,
    scenario: data.scenario,
    timestamp: data.timestamp
  };
}

/**
 * Generates a realistic simulated telemetry object for testing and verification.
 * @param {string} scenario Label
 * @returns {Object}
 */
export function generateSimulatedTelemetry(scenario = 'simulated-run') {
  const hostPid = 12040;
  const rendererPid = 12044;
  const gpuPid = 12048;

  const processes = [
    {
      pid: hostPid,
      name: 'TizenTubeHost',
      role: 'host',
      maxWorkingSetMb: 34.2,
      maxPrivateMemoryMb: 28.5,
      latestWorkingSetMb: 31.8,
      latestPrivateMemoryMb: 28.1
    },
    {
      pid: rendererPid,
      name: 'msedgewebview2',
      role: 'renderer',
      maxWorkingSetMb: 112.4,
      maxPrivateMemoryMb: 98.7,
      latestWorkingSetMb: 108.1,
      latestPrivateMemoryMb: 97.4
    },
    {
      pid: gpuPid,
      name: 'msedgewebview2',
      role: 'gpu-process',
      maxWorkingSetMb: 46.8,
      maxPrivateMemoryMb: 35.2,
      latestWorkingSetMb: 42.1,
      latestPrivateMemoryMb: 34.8
    }
  ];

  const totalWs = processes.reduce((acc, p) => acc + p.latestWorkingSetMb, 0);
  const totalPriv = processes.reduce((acc, p) => acc + p.latestPrivateMemoryMb, 0);

  return {
    schemaVersion: 1,
    scenario,
    timestamp: new Date().toISOString(),
    durationSeconds: 20,
    hostPid,
    summary: {
      avgTotalWorkingSetMb: parseFloat((totalWs * 1.05).toFixed(2)),
      minTotalWorkingSetMb: parseFloat((totalWs * 0.92).toFixed(2)),
      maxTotalWorkingSetMb: parseFloat((totalWs * 1.1).toFixed(2)),
      avgTotalPrivateMemoryMb: parseFloat((totalPriv * 1.02).toFixed(2)),
      minTotalPrivateMemoryMb: parseFloat((totalPriv * 0.95).toFixed(2)),
      maxTotalPrivateMemoryMb: parseFloat((totalPriv * 1.06).toFixed(2)),
      finalWorkingSetMb: parseFloat(totalWs.toFixed(2)),
      finalPrivateMemoryMb: parseFloat(totalPriv.toFixed(2)),
      sampleCount: 20,
      peakProcessCount: processes.length,
      note: 'Simulated multi-process telemetry for automated verification.'
    },
    processes,
    samples: []
  };
}

// CLI Execution entry point
if (process.argv[1] && process.argv[1].endsWith('measure_process_telemetry.js')) {
  const args = process.argv.slice(2);
  const flag = args[0];
  const target = args[1];

  if (flag === '--validate' && target) {
    const res = validateTelemetryFile(path.resolve(target));
    if (res.valid) {
      console.log(`[PASS] Telemetry artifact is valid: ${target}`);
      console.log(`       Scenario: ${res.scenario}, Processes: ${res.processCount}`);
      console.log(`       Avg Working Set:    ${res.summary.avgTotalWorkingSetMb ?? res.summary.totalWorkingSetMb} MB`);
      console.log(`       Avg Private Memory: ${res.summary.avgTotalPrivateMemoryMb ?? res.summary.totalPrivateMemoryMb} MB`);
      process.exit(0);
    } else {
      console.error(`[FAIL] Telemetry artifact validation failed: ${target}`);
      for (const err of res.errors) {
        console.error(`       - ${err}`);
      }
      process.exit(1);
    }
  } else if (flag === '--simulate') {
    const outputPath = target ? path.resolve(target) : path.resolve('simulated-telemetry.json');
    const sim = generateSimulatedTelemetry('cli-simulation');
    fs.writeFileSync(outputPath, JSON.stringify(sim, null, 2), 'utf8');
    console.log(`[OK] Simulated telemetry written to: ${outputPath}`);
    process.exit(0);
  } else {
    console.log('Usage: node measure_process_telemetry.js [--validate <json_file> | --simulate [out_file]]');
  }
}
