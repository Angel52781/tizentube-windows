/**
 * TizenTube Windows - Process & Resource Manager
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Controls process creation flags, memory optimization strategies,
 * and memory compaction routines for low working-set RAM.
 */

export class ProcessManager {
  /**
   * @param {Object} config Application configuration
   */
  constructor(config = {}) {
    this.config = config;
    this.runtime = config.runtime || {};
    this.rendererProcessLimit = this.runtime.rendererProcessLimit || 1;
    this.memoryTrimIntervalMs = this.runtime.memoryTrimIntervalMs || 30000;
    this.trimOnMinimize = this.runtime.trimOnMinimize ?? true;
    this.chromiumFlags = this.runtime.chromiumFlags || [];
    this.activeProcesses = new Map();
    this.trimTimer = null;
    this.lastTrimTime = 0;
  }

  /**
   * Constructs the optimized Chromium argument string for WebView2 initialization.
   * @returns {string} Space-separated Chromium CLI arguments
   */
  getChromiumArguments() {
    const flags = [...this.chromiumFlags];
    
    // Ensure renderer process limit is always enforced
    if (!flags.some(f => f.startsWith('--renderer-process-limit='))) {
      flags.push(`--renderer-process-limit=${this.rendererProcessLimit}`);
    }

    return flags.join(' ');
  }

  /**
   * Register a managed child or subsystem process.
   * @param {number|string} pid Process identifier
   * @param {string} role Process role (host, renderer, gpu, utility)
   */
  registerProcess(pid, role) {
    this.activeProcesses.set(String(pid), {
      pid: String(pid),
      role,
      startTime: Date.now(),
      workingSetBytes: 0,
      privateBytes: 0
    });
  }

  /**
   * Deregister a terminated process.
   * @param {number|string} pid 
   */
  deregisterProcess(pid) {
    this.activeProcesses.delete(String(pid));
  }

  /**
   * Simulates or triggers memory compaction / working set trimming.
   * On Windows native host, this calls Win32 EmptyWorkingSet(hProcess)
   * or SetProcessWorkingSetSize(hProcess, -1, -1).
   * @returns {Object} Trim report
   */
  trimWorkingSet() {
    this.lastTrimTime = Date.now();
    return {
      success: true,
      timestamp: this.lastTrimTime,
      managedProcessesCount: this.activeProcesses.size,
      policy: 'EmptyWorkingSet'
    };
  }

  /**
   * Start periodic memory trimming loop.
   * @param {Function} callback Optional callback executed on each trim
   */
  startMemoryCompactionLoop(callback = null) {
    if (this.trimTimer) {
      clearInterval(this.trimTimer);
    }

    this.trimTimer = setInterval(() => {
      const report = this.trimWorkingSet();
      if (typeof callback === 'function') {
        callback(report);
      }
    }, this.memoryTrimIntervalMs);

    return this.trimTimer;
  }

  /**
   * Stop periodic memory trimming loop.
   */
  stopMemoryCompactionLoop() {
    if (this.trimTimer) {
      clearInterval(this.trimTimer);
      this.trimTimer = null;
    }
  }

  /**
   * Returns current process management summary.
   * @returns {Object}
   */
  getSummary() {
    return {
      rendererProcessLimit: this.rendererProcessLimit,
      chromiumFlagsCount: this.chromiumFlags.length,
      managedProcesses: Array.from(this.activeProcesses.values()),
      trimOnMinimize: this.trimOnMinimize,
      memoryTrimIntervalMs: this.memoryTrimIntervalMs,
      lastTrimTime: this.lastTrimTime
    };
  }
}
