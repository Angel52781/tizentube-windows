/**
 * TizenTube Windows - App UI Orchestrator
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Seamlessly integrates NavigationBar, PlayerControls HUD, SettingsModal,
 * ToastNotifications, and CSS injection, connecting them with PlaybackEngine,
 * AdBlockBase, SponsorBlockBase, DeArrowBase, and NavigationManager.
 */

import { NavigationBar } from './navigation_bar.js';
import { PlayerControls } from './player_controls.js';
import { SettingsModal } from './settings_modal.js';
import { ToastNotification } from './toast_notification.js';
import { NavigationManager } from '../runtime/navigation.js';

export class AppUI {
  constructor({
    playbackEngine,
    adblock,
    sponsorblock,
    dearrow,
    ipc,
    navigationManager,
    initialConfig = {}
  } = {}) {
    this.playback = playbackEngine;
    this.adblock = adblock;
    this.sponsorblock = sponsorblock;
    this.dearrow = dearrow;
    this.ipc = ipc;
    this.navigation = navigationManager || new NavigationManager();
    this.config = initialConfig;

    this.navBar = new NavigationBar({
      autoHide: initialConfig.ui?.autoHideNav || false
    });
    this.playerControls = new PlayerControls();
    this.settingsModal = new SettingsModal();
    this.toasts = new ToastNotification();

    this.currentVideoId = null;
    this.isMounted = false;
    this.isFullscreen = false;
    this.cursorIdleTimer = null;
    this.isCursorHidden = false;
    this._onMouseMove = null;
    this._onKeyDown = null;
    this._checkUrl = null;
  }

  /**
   * Mounts all UI components into the target DOM.
   * @param {HTMLElement} [rootElement]
   */
  mount(rootElement = typeof document !== 'undefined' ? document.body : null) {
    if (!rootElement || typeof document === 'undefined' || this.isMounted) return;

    this.injectStyles();
    this.loadPersistedPreferences();

    this.navBar.mount(rootElement);
    this.playerControls.mount(rootElement);
    this.settingsModal.mount(rootElement);
    this.toasts.ensureContainer();

    this.wireEvents();
    this.attachUrlChangeWatcher();
    this.isMounted = true;
  }

  /**
   * Injects CSS stylesheet if not already present.
   */
  injectStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('tizentube-ui-styles')) return;

    // Link external or inline styles
    const link = document.createElement('link');
    link.id = 'tizentube-ui-styles';
    link.rel = 'stylesheet';
    link.href = (typeof window !== 'undefined' && window.__TIZENTUBE_CSS_PATH__) || 'styles.css';
    document.head.appendChild(link);
  }

  /**
   * Connects events between UI, engines, and mods.
   */
  wireEvents() {
    // 1. Navigation Bar Events
    this.navBar.on('back', () => {
      if (typeof window !== 'undefined' && window.history) window.history.back();
      if (this.ipc) this.ipc.send('navigation:back');
    });

    this.navBar.on('forward', () => {
      if (typeof window !== 'undefined' && window.history) window.history.forward();
      if (this.ipc) this.ipc.send('navigation:forward');
    });

    this.navBar.on('reload', () => {
      if (typeof window !== 'undefined' && window.location) window.location.reload();
      if (this.ipc) this.ipc.send('navigation:reload');
    });

    this.navBar.on('home', () => {
      this.navigateTo('https://www.youtube.com');
    });

    this.navBar.on('search', (query) => {
      const sanitized = this.navigation.sanitizeUrl(query);
      if (sanitized) {
        this.navigateTo(sanitized);
      } else {
        const searchUrl = this.navigation.buildSearchUrl(query);
        this.navigateTo(searchUrl);
      }
    });

    this.navBar.on('settings', () => {
      this.settingsModal.open();
    });

    this.navBar.on('fullscreen', () => {
      if (this.playback) this.playback.toggleFullscreen();
    });

    // 2. Player Controls Events
    this.playerControls.on('togglePlay', () => {
      if (this.playback) this.playback.togglePlay();
    });

    this.playerControls.on('seekBy', (delta) => {
      if (this.playback) this.playback.seekBy(delta);
    });

    this.playerControls.on('seekTo', (targetSec) => {
      if (this.playback) this.playback.seekTo(targetSec);
    });

    this.playerControls.on('setVolume', (vol) => {
      if (this.playback) this.playback.setVolume(vol);
    });

    this.playerControls.on('toggleMute', () => {
      if (this.playback) this.playback.toggleMute();
    });

    this.playerControls.on('setRate', (rate) => {
      if (this.playback) this.playback.setPlaybackRate(rate);
    });

    this.playerControls.on('toggleFullscreen', () => {
      if (this.playback) this.playback.toggleFullscreen();
    });

    // 3. PlaybackEngine State Synchronization & Fullscreen Handling
    if (this.playback) {
      this.playback.on('fullscreenchange', ({ isFullscreen }) => {
        this.isFullscreen = isFullscreen;
        this.navBar.setFullscreen(isFullscreen);
        this.playerControls.update({ isFullscreen });
        if (this.ipc) {
          this.ipc.send('fullscreen:state', { isFullscreen });
        }
        if (typeof document !== 'undefined' && document.body) {
          document.body.classList.toggle('tt-fullscreen-active', isFullscreen);
          if (!isFullscreen) {
            document.body.classList.remove('tt-cursor-hidden');
            this.isCursorHidden = false;
          }
        }
      });

      this.playback.on('timeupdate', ({ currentTime, duration }) => {
        // Evaluate SponsorBlock skip
        if (this.sponsorblock) {
          const visible = typeof document !== 'undefined'
            ? document.querySelector?.('video.html5-main-video') : null;
          const adPlaying = typeof document !== 'undefined'
            ? Boolean(document.querySelector?.('.html5-video-player.ad-showing, #movie_player.ad-showing')) : false;
          if (!adPlaying && (!visible || visible === this.playback.videoElement)) {
            const skipTarget = this.sponsorblock.checkSkip(currentTime);
            if (skipTarget !== null) {
              this.handleSponsorBlockSkip(this.sponsorblock.lastSkipped || { targetTime: skipTarget });
            }
          }
        }

        // Update player controls HUD
        this.playerControls.update({ currentTime, duration });
      });

      this.playback.on('play', (state) => {
        this.playerControls.update({ isPlaying: true, ...state });
      });

      this.playback.on('pause', (state) => {
        this.playerControls.update({ isPlaying: false, ...state });
        if (typeof document !== 'undefined' && document.body) {
          document.body.classList.remove('tt-cursor-hidden');
          this.isCursorHidden = false;
        }
      });

      this.playback.on('volumechange', ({ volume, isMuted }) => {
        this.playerControls.update({ volume, isMuted });
      });

      this.playback.on('ratechange', ({ playbackRate }) => {
        this.playerControls.update({ playbackRate });
      });
    }

    // 4. Cursor Auto-Hiding during Active Video Playback
    const resetCursorIdle = () => {
      if (this.isCursorHidden) {
        this.isCursorHidden = false;
        if (typeof document !== 'undefined' && document.body) {
          document.body.classList.remove('tt-cursor-hidden');
        }
      }
      if (this.cursorIdleTimer) clearTimeout(this.cursorIdleTimer);

      if (this.playback?.state?.isPlaying) {
        this.cursorIdleTimer = setTimeout(() => {
          if (this.playback?.state?.isPlaying) {
            this.isCursorHidden = true;
            if (typeof document !== 'undefined' && document.body) {
              document.body.classList.add('tt-cursor-hidden');
            }
          }
        }, 2500);
      }
    };

    this._onMouseMove = resetCursorIdle;
    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', this._onMouseMove, { passive: true });
    }

    // 5. Settings Modal Changes
    this.settingsModal.on('change', (newSettings) => {
      this.applySettings(newSettings);
      this.savePreferences(newSettings);
      this.toasts.show({
        title: 'Settings Saved',
        message: 'Your preferences have been applied.',
        durationMs: 2000
      });
    });

    // 6. Global Keyboard Shortcuts
    this._onKeyDown = (e) => {
      const tag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
        if (e.key === 'Escape' && typeof e.target.blur === 'function') {
          e.target.blur();
        }
        return;
      }

      resetCursorIdle();

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (this.settingsModal.isOpen) {
          this.settingsModal.close();
        } else {
          this.settingsModal.open();
        }
      } else if (e.key === '/') {
        e.preventDefault();
        this.navBar.focusSearch();
      } else if (e.key === 'Escape') {
        if (this.settingsModal.isOpen) {
          e.preventDefault();
          this.settingsModal.close();
        }
      } else if (e.key === 'b' || e.key === 'B') {
        if (this.sponsorblock) {
          e.preventDefault();
          const next = !this.sponsorblock.options.autoSkip;
          this.sponsorblock.setAutoSkip(next);
          this.settingsModal.settings.sponsorblock.autoSkip = next;
          this.savePreferences(this.settingsModal.getSettings());
          this.toasts.show({
            title: 'SponsorBlock',
            message: `Auto-Skip: ${next ? 'Enabled' : 'Disabled'}`,
            color: '#00d400',
            durationMs: 2000
          });
        }
      } else if (e.key === 'a' || e.key === 'A') {
        if (this.adblock) {
          e.preventDefault();
          const next = !this.adblock.options.enabled;
          this.adblock.setEnabled(next);
          this.settingsModal.settings.adblock.enabled = next;
          this.savePreferences(this.settingsModal.getSettings());
          this.toasts.show({
            title: 'AdBlock',
            message: `Ad Blocking: ${next ? 'Enabled' : 'Disabled'}`,
            color: '#3ea6ff',
            durationMs: 2000
          });
        }
      } else if (e.key === 'd' || e.key === 'D') {
        if (this.dearrow) {
          e.preventDefault();
          const next = !this.dearrow.options.enabled;
          this.dearrow.setEnabled(next);
          this.settingsModal.settings.dearrow.enabled = next;
          this.savePreferences(this.settingsModal.getSettings());
          this.toasts.show({
            title: 'DeArrow',
            message: `Anti-Clickbait: ${next ? 'Enabled' : 'Disabled'}`,
            color: '#ff9900',
            durationMs: 2000
          });
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
    }
  }

  /**
   * Handles SponsorBlock segment skip execution and toast feedback.
   * @param {Object} skipInfo 
   */
  handleSponsorBlockSkip(skipInfo) {
    const target = typeof skipInfo === 'number' ? skipInfo : skipInfo.targetTime;
    const catName = skipInfo.categoryName || skipInfo.category || 'Sponsor';
    const color = skipInfo.color || '#00d400';
    const uuid = skipInfo.uuid;
    const originalTime = this.playback?.state?.currentTime || 0;

    if (this.playback) {
      this.playback.seekTo(target);
    }

    this.navBar.updateStats({
      sponsorblockCount: this.sponsorblock ? this.sponsorblock.skipCount : 0
    });

    if (this.ipc) {
      this.ipc.send('sponsorblock:skipped', {
        targetTime: target,
        category: skipInfo.category,
        videoId: this.currentVideoId
      });
    }

    // Display non-intrusive toast notification with Undo action
    if (this.settingsModal.settings.sponsorblock.showNotice) {
      this.toasts.show({
        title: 'SponsorBlock',
        message: `Skipped ${catName}`,
        color,
        durationMs: 3500,
        actionLabel: 'Undo',
        onAction: () => {
          if (this.playback) {
            this.playback.seekTo(originalTime);
          }
          if (this.sponsorblock && uuid) {
            this.sponsorblock.resetSegmentSkip(uuid);
          }
        }
      });
    }
  }

  /**
   * Navigates to a YouTube URL.
   * @param {string} url 
   */
  navigateTo(url) {
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = url;
    }
    this.navBar.setUrl(url);
    if (this.ipc) {
      this.ipc.send('navigation:navigate', { url });
    }
  }

  /**
   * Watches for YouTube navigation and URL changes.
   */
  attachUrlChangeWatcher() {
    if (typeof window === 'undefined') return;

    const checkUrl = () => {
      const href = window.location.href;
      this.navBar.setUrl(href);

      const urlMatch = href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      const videoId = urlMatch ? urlMatch[1] : null;

      if (videoId && videoId !== this.currentVideoId) {
        this.currentVideoId = videoId;
        this.onVideoChanged(videoId);
        if (this.ipc) {
          this.ipc.send('memory:trim');
        }
      }
    };

    // Watch standard popstate and YouTube's custom navigation events
    this._checkUrl = checkUrl;
    window.addEventListener('popstate', this._checkUrl);
    window.addEventListener('yt-navigate-finish', this._checkUrl);

    // Initial check
    checkUrl();
  }

  /**
   * Triggered when active video ID changes.
   * @param {string} videoId 
   */
  async onVideoChanged(videoId) {
    try {
      if (this.sponsorblock) {
        await this.sponsorblock.setVideo(videoId);
        if (this.playback?.state?.duration) {
          const markers = this.sponsorblock.getTimelineMarkers(this.playback.state.duration);
          this.playerControls.update({ timelineMarkers: markers });
        }
      }
    } catch (err) {
      console.warn('[AppUI] SponsorBlock update failed (fail-open):', err?.message);
    }

    try {
      if (this.dearrow) {
        setTimeout(() => {
          try {
            this.dearrow.applyToDom();
          } catch (_) {}
        }, 300);
      }
    } catch (_) {}
  }

  /**
   * Applies settings to underlying components.
   * @param {Object} settings 
   */
  applySettings(settings) {
    if (!settings) return;

    // AdBlock
    if (this.adblock && settings.adblock) {
      this.adblock.setEnabled(settings.adblock.enabled);
      this.adblock.options.blockAdsInJson = Boolean(settings.adblock.blockAdsInJson);
      this.adblock.options.cosmeticFilter = Boolean(settings.adblock.cosmeticFilter);
      this.adblock.options.autoSkipVideoAds = Boolean(settings.adblock.autoSkipVideoAds);
    }

    // SponsorBlock
    if (this.sponsorblock && settings.sponsorblock) {
      this.sponsorblock.setEnabled(settings.sponsorblock.enabled);
      this.sponsorblock.setAutoSkip(settings.sponsorblock.autoSkip);
      this.sponsorblock.setCategories(settings.sponsorblock.categories || []);
      this.sponsorblock.options.showNotice = Boolean(settings.sponsorblock.showNotice);
      if (settings.sponsorblock.enabled && this.currentVideoId && !this.sponsorblock.currentSegments.length) {
        void this.sponsorblock.setVideo(this.currentVideoId);
      }

      // Refresh seekbar markers
      if (this.playback?.state?.duration) {
        const markers = this.sponsorblock.getTimelineMarkers(this.playback.state.duration);
        this.playerControls.update({ timelineMarkers: markers });
      }
    }

    // DeArrow
    if (this.dearrow && settings.dearrow) {
      this.dearrow.setEnabled(settings.dearrow.enabled);
      this.dearrow.setOptions({
        replaceTitles: Boolean(settings.dearrow.replaceTitles),
        replaceThumbnails: Boolean(settings.dearrow.replaceThumbnails)
      });
      if (settings.dearrow.enabled) {
        this.dearrow.applyToDom();
      }
    }

    // Playback
    if (this.playback && settings.playback) {
      if (settings.playback.defaultSpeed) {
        this.playback.setPlaybackRate(settings.playback.defaultSpeed);
      }
      this.playback.options.rememberPreferences = Boolean(settings.playback.rememberPreferences);
    }

    // UI
    if (settings.ui) {
      if (typeof settings.ui.autoHideNav === 'boolean') {
        this.navBar.options.autoHide = settings.ui.autoHideNav;
        if (this.navBar.element) {
          this.navBar.element.classList.toggle('tt-nav-autohide', settings.ui.autoHideNav);
        }
      }

      if (typeof settings.ui.compactHud === 'boolean' && this.playerControls?.element) {
        this.playerControls.element.classList.toggle('tt-hud-compact', settings.ui.compactHud);
      }

      if (typeof settings.ui.highContrast === 'boolean' && typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('tt-high-contrast', settings.ui.highContrast);
      }
    }
  }

  /**
   * Persists settings to localStorage and dispatches to native Windows host.
   * @param {Object} settings 
   */
  savePreferences(settings) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('tizentube_settings', JSON.stringify(settings));
      } catch (_) {}
    }
    if (this.ipc) {
      this.ipc.send('preferences:save', settings);
    }
  }

  /**
   * Restores persisted preferences from localStorage or initial host payload.
   */
  loadPersistedPreferences() {
    let parsed = null;
    // The Windows host is authoritative after relaunch or machine reboot.
    // The old implementation preferred WebView localStorage even when it held
    // stale defaults, silently undoing an already-persisted native choice.
    if (typeof window !== 'undefined' && window.__TIZENTUBE_INITIAL_PREFERENCES__) {
      try {
        const raw = window.__TIZENTUBE_INITIAL_PREFERENCES__;
        const hostValue = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const candidate = hostValue?.channel === 'preferences:save'
          ? hostValue.payload : hostValue;
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate))
          parsed = candidate;
      } catch (_) {}
    }
    if (!parsed && typeof localStorage !== 'undefined') {
      try {
        const data = localStorage.getItem('tizentube_settings');
        if (data) {
          parsed = JSON.parse(data);
        }
      } catch (_) {}
    }

    if (parsed) {
      // Reconcile website storage after a native restore so subsequent SPA
      // navigation cannot resurrect outdated per-origin preferences.
      try { localStorage?.setItem('tizentube_settings', JSON.stringify(parsed)); } catch (_) {}
      this.settingsModal.loadSettings(parsed);
      this.applySettings(parsed);
    }
  }

  /**
   * Updates mod statistics displayed across UI components.
   */
  refreshStats() {
    const adCount = this.adblock ? this.adblock.blockedCount : 0;
    const sbCount = this.sponsorblock ? this.sponsorblock.skipCount : 0;
    this.navBar.updateStats({ adblockCount: adCount, sponsorblockCount: sbCount });
  }

  /**
   * Unmounts all UI components, disposes event listeners, and releases DOM references.
   * Eliminates memory leaks and lingering timers during document reload or destruction.
   */
  unmount() {
    if (this.cursorIdleTimer) {
      clearTimeout(this.cursorIdleTimer);
      this.cursorIdleTimer = null;
    }
    if (typeof window !== 'undefined') {
      if (this._onMouseMove) {
        window.removeEventListener('mousemove', this._onMouseMove);
        this._onMouseMove = null;
      }
      if (this._onKeyDown) {
        window.removeEventListener('keydown', this._onKeyDown);
        this._onKeyDown = null;
      }
      if (this._checkUrl) {
        window.removeEventListener('popstate', this._checkUrl);
        window.removeEventListener('yt-navigate-finish', this._checkUrl);
        this._checkUrl = null;
      }
    }
    if (this.navBar && typeof this.navBar.unmount === 'function') {
      this.navBar.unmount();
    }
    if (this.playerControls && typeof this.playerControls.unmount === 'function') {
      this.playerControls.unmount();
    }
    if (this.settingsModal && typeof this.settingsModal.unmount === 'function') {
      this.settingsModal.unmount();
    }
    if (this.toasts && typeof this.toasts.unmount === 'function') {
      this.toasts.unmount();
    }
    this.isMounted = false;
  }
}
