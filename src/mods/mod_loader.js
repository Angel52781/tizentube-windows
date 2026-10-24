/**
 * TizenTube Windows - Mod Loader & Coordination Runtime
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Injected prior to document execution via CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync.
 * Instantiates and coordinates AdBlock, SponsorBlock, DeArrow, Playback Engine, App UI, and IPC Bridge.
 */

import { AdBlockBase } from './adblock_base.js';
import { SponsorBlockBase } from './sponsorblock_base.js';
import { DeArrowBase } from './dearrow_base.js';
import { PlaybackEngine } from '../runtime/playback_engine.js';
import { ViewingExperience } from '../runtime/viewing_experience.js';
import { NavigationManager } from '../runtime/navigation.js';
import { IpcBridge } from '../runtime/ipc_bridge.js';
import { AppUI } from '../ui/app_ui.js';

export class ModLoader {
  constructor(config = {}) {
    this.config = config;
    this.ipc = new IpcBridge();
    this.adblock = new AdBlockBase(config.features?.adblock || {});
    this.sponsorblock = new SponsorBlockBase(config.features?.sponsorblock || {});
    this.dearrow = new DeArrowBase(config.features?.dearrow || {});
    this.playback = new PlaybackEngine(config.features?.playback || {});
    this.viewing = new ViewingExperience(this.playback, config.features?.viewing || {});
    this.navigation = new NavigationManager();

    this.ui = new AppUI({
      playbackEngine: this.playback,
      adblock: this.adblock,
      sponsorblock: this.sponsorblock,
      dearrow: this.dearrow,
      ipc: this.ipc,
      navigationManager: this.navigation,
      initialConfig: config
    });

    this.initialized = false;
  }

  /**
   * Bootstraps all modules in correct precedence order.
   */
  bootstrap() {
    if (this.initialized) return;

    // 1. Install AdBlock hooks first before YouTube scripts execute
    this.adblock.install();

    // 2. Attach timeline listener to PlaybackEngine for SponsorBlock auto-skipping (headless fallback)
    this.playback.on('timeupdate', ({ currentTime }) => {
      // When UI is mounted, AppUI coordinates skip handling, stats updates, IPC, and toast notifications.
      if (this.ui && this.ui.isMounted) return;

      const skipTarget = this.sponsorblock.checkSkip(currentTime);
      if (skipTarget !== null) {
        this.playback.seekTo(typeof skipTarget === 'number' ? skipTarget : skipTarget.targetTime);
        this.ipc.send('sponsorblock:skipped', {
          skipTarget,
          videoTime: currentTime
        });
      }
    });

    // 3. Mount UI if DOM is available
    if (typeof document !== 'undefined' && document.body) {
      this.ui.mount(document.body);
      this.viewing.mount();
    } else if (typeof window !== 'undefined') {
      window.addEventListener('DOMContentLoaded', () => {
        this.ui.mount(document.body);
        this.viewing.mount();
      });
    }

    // 4. Setup IPC commands from Native Host
    this.ipc.on('playback:command', (payload) => {
      if (!payload || !payload.action) return;
      switch (payload.action) {
        case 'togglePlay':
          this.playback.togglePlay();
          break;
        case 'seekBy':
          this.playback.seekBy(payload.seconds || 0);
          break;
        case 'seekTo':
          this.playback.seekTo(payload.targetSeconds || 0);
          break;
        case 'setVolume':
          this.playback.setVolume(payload.volume || 100);
          break;
        case 'setRate':
          this.playback.setPlaybackRate(payload.rate || 1.0);
          break;
        case 'fullscreen':
          this.playback.toggleFullscreen();
          break;
      }
    });

    this.ipc.on('settings:open', () => {
      this.ui.settingsModal.open();
    });

    // 5. Memory Trim Command from Native Host or Navigation Watcher
    this.ipc.on('memory:trim', () => {
      if (this.sponsorblock && typeof this.sponsorblock.clearCache === 'function') {
        this.sponsorblock.clearCache();
      }
      if (this.dearrow && typeof this.dearrow.clearCache === 'function') {
        this.dearrow.clearCache();
      }
    });

    this.initialized = true;
    this.ipc.send('mods:initialized', this.getStatus());
  }

  /**
   * Cleans up all mod listeners, timers, caches, and injected DOM elements.
   */
  dispose() {
    if (this.viewing?.dispose) this.viewing.dispose();
    if (this.adblock?.dispose) this.adblock.dispose();
    if (this.sponsorblock?.dispose) this.sponsorblock.dispose();
    if (this.dearrow?.dispose) this.dearrow.dispose();
    if (this.playback?.dispose) this.playback.dispose();
    if (this.ui?.unmount) this.ui.unmount();
    this.initialized = false;
  }

  /**
   * Returns complete runtime status.
   */
  getStatus() {
    return {
      adblock: this.adblock.getStats(),
      sponsorblock: this.sponsorblock.getStats(),
      dearrow: this.dearrow.getStats(),
      playback: this.playback.getState()
    };
  }
}

// Auto-bootstrap in browser/WebView context
if (typeof window !== 'undefined') {
  const loader = new ModLoader(window.__TIZENTUBE_CONFIG__ || {});
  loader.bootstrap();
  window.__TIZENTUBE_LOADER__ = loader;
}
