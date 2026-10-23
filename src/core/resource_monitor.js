/**
 * TizenTube Windows - Resource Monitor
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Collects process tree resource metrics (Working Set RAM, Private Bytes, CPU usage)
 * across host and child processes for performance benchmarking and QA audits.
 */

export class ResourceMonitor {
  constructor(processManager = null) {
    this.processManager = processManager;
    this.samples = [];
    this.maxSamples = 1000;
  }

  /**
   * Records a snapshot of process metrics.
   * @param {Object} metrics Metric snapshot
   * @param {string} scenario Label for benchmark scenario (e.g. 'idle', 'browse', 'playback-1080p')
   * @returns {Object} Recorded snapshot
   */
  recordSample(metrics = {}, scenario = 'unspecified') {
    const sample = {
      timestamp: Date.now(),
      scenario,
      hostWorkingSetMb: metrics.hostWorkingSetMb || 0,
      renderersWorkingSetMb: metrics.renderersWorkingSetMb || 0,
      gpuWorkingSetMb: metrics.gpuWorkingSetMb || 0,
      totalWorkingSetMb: (metrics.hostWorkingSetMb || 0) + 
                         (metrics.renderersWorkingSetMb || 0) + 
                         (metrics.gpuWorkingSetMb || 0),
      cpuPercent: metrics.cpuPercent || 0,
      processCount: metrics.processCount || 1
    };

    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }

    return sample;
  }

  /**
   * Generates benchmark summary statistics for a given scenario.
   * @param {string} scenario 
   * @returns {Object}
   */
  getScenarioStats(scenario = null) {
    const filtered = scenario 
      ? this.samples.filter(s => s.scenario === scenario)
      : this.samples;

    if (filtered.length === 0) {
      return { count: 0, avgTotalMb: 0, minTotalMb: 0, maxTotalMb: 0, avgCpuPercent: 0 };
    }

    const totalMbs = filtered.map(s => s.totalWorkingSetMb);
    const cpuPercents = filtered.map(s => s.cpuPercent);

    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const avg = (arr) => sum(arr) / arr.length;

    return {
      scenario: scenario || 'all',
      count: filtered.length,
      avgTotalWorkingSetMb: parseFloat(avg(totalMbs).toFixed(2)),
      minTotalWorkingSetMb: parseFloat(Math.min(...totalMbs).toFixed(2)),
      maxTotalWorkingSetMb: parseFloat(Math.max(...totalMbs).toFixed(2)),
      avgCpuPercent: parseFloat(avg(cpuPercents).toFixed(2)),
      maxCpuPercent: parseFloat(Math.max(...cpuPercents).toFixed(2))
    };
  }

  /**
   * Clears recorded samples.
   */
  reset() {
    this.samples = [];
  }
}
