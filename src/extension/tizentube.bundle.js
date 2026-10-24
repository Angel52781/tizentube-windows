/**
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


// --- Module: src/runtime/ipc_bridge.js ---
/**
 * TizenTube Windows - IPC Bridge
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Facilitates two-way asynchronous communication between native Windows host
 * (WebView2 CoreWebView2) and web client scripts / mods.
 */
class IpcBridge {
  constructor() {
    this.handlers = new Map();
    this.isNativeAvailable = typeof window !== 'undefined' && 
                             window.chrome && 
                             window.chrome.webview && 
                             typeof window.chrome.webview.postMessage === 'function';

    this.init();
  }

  init() {
    if (this.isNativeAvailable) {
      window.chrome.webview.addEventListener('message', (event) => {
        this.dispatchMessage(event.data);
      });
    }
  }

  /**
   * Send message to native Windows host.
   * @param {string} channel Message topic
   * @param {any} payload Message payload
   */
  send(channel, payload = {}) {
    const message = {
      channel,
      payload,
      timestamp: Date.now()
    };

    if (this.isNativeAvailable) {
      window.chrome.webview.postMessage(message);
    } else {
      // In mock/test environments or direct browsers
      this.dispatchMessage(message);
    }
    return message;
  }

  /**
   * Register a message listener for a specific channel.
   * @param {string} channel 
   * @param {Function} handler 
   */
  on(channel, handler) {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
    }
    this.handlers.get(channel).push(handler);
  }

  /**
   * Internal message dispatcher.
   */
  dispatchMessage(data) {
    if (!data || typeof data !== 'object') return;
    const { channel, payload } = data;
    const list = this.handlers.get(channel) || [];
    for (const handler of list) {
      try {
        handler(payload, data);
      } catch (err) {
        console.error(`Error in IPC handler for ${channel}:`, err);
      }
    }
  }
}

// --- Module: src/runtime/navigation.js ---
/**
 * TizenTube Windows - Navigation Manager
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Handles URL sanitization, search queries, in-app navigation,
 * and security containment to prevent external window popups.
 */
class NavigationManager {
  constructor(options = {}) {
    this.options = {
      allowedHosts: ['www.youtube.com', 'youtube.com', 'm.youtube.com'],
      baseSearchUrl: 'https://www.youtube.com/results?search_query=',
      ...options
    };
  }

  /**
   * Sanitizes and parses a target navigation URL.
   * @param {string} inputUrl 
   * @returns {string|null} Safe YouTube URL or null if invalid
   */
  sanitizeUrl(inputUrl) {
    try {
      const parsed = new URL(inputUrl, 'https://www.youtube.com');
      if (this.options.allowedHosts.includes(parsed.hostname)) {
        return parsed.href;
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Constructs search URL for given query.
   * @param {string} query 
   * @returns {string}
   */
  buildSearchUrl(query) {
    return `${this.options.baseSearchUrl}${encodeURIComponent(query.trim())}`;
  }

  /**
   * Determines whether an external URL should be opened outside the app.
   * @param {string} url 
   * @returns {boolean}
   */
  isExternalUrl(url) {
    try {
      const parsed = new URL(url);
      return !this.options.allowedHosts.includes(parsed.hostname);
    } catch (_) {
      return true;
    }
  }
}

// --- Module: src/runtime/playback_engine.js ---
/**
 * TizenTube Windows - Base YouTube Playback Engine
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Provides robust HTML5 media control, keyboard navigation,
 * custom shortcuts, fullscreen management, and persistent preferences.
 */
class PlaybackEngine {
  constructor(options = {}) {
    this.options = {
      defaultSpeed: 1.0,
      defaultVolume: 100,
      rememberPreferences: true,
      ...options
    };

    this.videoElement = null;
    this.videoObserver = null;
    this.listeners = new Map();
    this._videoListeners = [];
    this._onFsChange = null;
    this._onKeyDown = null;
    this._onDomReady = null;
    this.state = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: this.options.defaultVolume,
      isMuted: false,
      playbackRate: this.options.defaultSpeed,
      isFullscreen: false,
      videoId: null
    };

    this.init();
  }

  /**
   * Initializes playback engine and attaches DOM listeners if available.
   */
  init() {
    this.loadPreferences();
    if (typeof navigator !== 'undefined') {
      this.attachMediaSession();
    }
    if (typeof document !== 'undefined') {
      // AddScriptToExecuteOnDocumentCreatedAsync runs before document.body
      // exists. A one-off query here misses every subsequent YouTube video,
      // leaving SponsorBlock without timeupdate events.
      if (document.body) {
        this.attachVideoFinder();
      } else if (typeof window !== 'undefined') {
        this._onDomReady = () => {
          this._onDomReady = null;
          this.attachVideoFinder();
        };
        window.addEventListener('DOMContentLoaded', this._onDomReady, { once: true });
      }
      this.attachKeyboardShortcuts();
      this.attachFullscreenWatcher();
    }
  }

  /**
   * Discovers and binds to YouTube's HTML5 video element with debouncing.
   */
  attachVideoFinder() {
    if (this.videoObserver) return;
    let pendingFrame = false;
    const findVideo = () => {
      pendingFrame = false;
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (video && video !== this.videoElement) {
        this.bindVideoElement(video);
      }
    };

    findVideo();

    if (typeof MutationObserver !== 'undefined' && document.body) {
      this.videoObserver = new MutationObserver(() => {
        if (!pendingFrame) {
          pendingFrame = true;
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(findVideo);
          } else {
            setTimeout(findVideo, 50);
          }
        }
      });
      // YouTube re-creates #movie_player on SPA navigation; watch the stable
      // body rather than a player subtree that becomes detached.
      this.videoObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  /**
   * Binds event listeners to HTML5 video element.
   * @param {HTMLVideoElement} video 
   */
  bindVideoElement(video) {
    this.unbindVideoElement();
    this.videoElement = video;

    const onPlay = () => {
      this.state.isPlaying = true;
      this.emit('play', this.getState());
    };

    const onPause = () => {
      this.state.isPlaying = false;
      this.emit('pause', this.getState());
    };

    const onTimeUpdate = () => {
      this.state.currentTime = video.currentTime;
      this.state.duration = video.duration || 0;
      if (typeof navigator !== 'undefined' && navigator.mediaSession?.setPositionState && video.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: video.duration,
            playbackRate: video.playbackRate || 1.0,
            position: video.currentTime || 0
          });
        } catch (_) {}
      }
      this.emit('timeupdate', { currentTime: video.currentTime, duration: video.duration });
    };

    const onVolumeChange = () => {
      this.state.volume = Math.round(video.volume * 100);
      this.state.isMuted = video.muted;
      this.savePreferences();
      this.emit('volumechange', { volume: this.state.volume, isMuted: video.muted });
    };

    const onRateChange = () => {
      this.state.playbackRate = video.playbackRate;
      this.savePreferences();
      this.emit('ratechange', { playbackRate: video.playbackRate });
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('volumechange', onVolumeChange);
    video.addEventListener('ratechange', onRateChange);

    this._videoListeners = [
      { event: 'play', handler: onPlay },
      { event: 'pause', handler: onPause },
      { event: 'timeupdate', handler: onTimeUpdate },
      { event: 'volumechange', handler: onVolumeChange },
      { event: 'ratechange', handler: onRateChange }
    ];

    // Apply saved preferences
    if (this.state.playbackRate !== 1.0) {
      video.playbackRate = this.state.playbackRate;
    }
    if (this.state.volume !== 100) {
      video.volume = this.state.volume / 100;
    }

    this.emit('ready', { videoElement: video });
  }

  /**
   * Unbinds video element event listeners to prevent memory retention.
   */
  unbindVideoElement() {
    if (this.videoElement && this._videoListeners.length > 0) {
      for (const { event, handler } of this._videoListeners) {
        try {
          this.videoElement.removeEventListener(event, handler);
        } catch (_) {}
      }
    }
    this._videoListeners = [];
    this.videoElement = null;
  }

  /**
   * Hooks MediaSession API for native Windows multimedia keys and volume overlay.
   */
  attachMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('play', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => this.togglePlay());
      navigator.mediaSession.setActionHandler('seekbackward', (details) => this.seekBy(-(details?.seekOffset || 10)));
      navigator.mediaSession.setActionHandler('seekforward', (details) => this.seekBy(details?.seekOffset || 10));
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details?.seekTime != null) this.seekTo(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        if (this.videoElement) this.videoElement.pause();
      });
    } catch (_) {}
  }

  /**
   * Toggle play / pause state.
   */
  togglePlay() {
    if (!this.videoElement) return false;
    if (this.videoElement.paused) {
      this.videoElement.play();
      this.state.isPlaying = true;
    } else {
      this.videoElement.pause();
      this.state.isPlaying = false;
    }
    return this.state.isPlaying;
  }

  /**
   * Seek video forward or backward by seconds.
   * @param {number} deltaSeconds Positive or negative offset in seconds
   */
  seekBy(deltaSeconds) {
    if (!this.videoElement) {
      this.state.currentTime = Math.max(0, this.state.currentTime + deltaSeconds);
      return this.state.currentTime;
    }
    const maxTime = this.videoElement.duration || (this.videoElement.currentTime + deltaSeconds);
    const newTime = Math.max(0, Math.min(maxTime, this.videoElement.currentTime + deltaSeconds));
    this.videoElement.currentTime = newTime;
    this.state.currentTime = newTime;
    return newTime;
  }

  /**
   * Seek video to absolute time in seconds.
   * @param {number} targetSeconds 
   */
  seekTo(targetSeconds) {
    if (!this.videoElement) {
      this.state.currentTime = Math.max(0, targetSeconds);
      return this.state.currentTime;
    }
    const maxTime = this.videoElement.duration || targetSeconds;
    const newTime = Math.max(0, Math.min(maxTime, targetSeconds));
    this.videoElement.currentTime = newTime;
    this.state.currentTime = newTime;
    return newTime;
  }

  /**
   * Adjust volume by delta percentage.
   * @param {number} deltaPercent 
   */
  adjustVolume(deltaPercent) {
    const newVol = Math.max(0, Math.min(100, this.state.volume + deltaPercent));
    this.setVolume(newVol);
    return newVol;
  }

  /**
   * Set absolute volume percentage (0 - 100).
   * @param {number} volume 
   */
  setVolume(volume) {
    this.state.volume = Math.max(0, Math.min(100, volume));
    if (this.videoElement) {
      this.videoElement.volume = this.state.volume / 100;
      if (this.state.volume > 0 && this.videoElement.muted) {
        this.videoElement.muted = false;
      }
    }
    this.savePreferences();
  }

  /**
   * Toggle mute.
   */
  toggleMute() {
    if (!this.videoElement) return false;
    this.videoElement.muted = !this.videoElement.muted;
    this.state.isMuted = this.videoElement.muted;
    return this.state.isMuted;
  }

  /**
   * Set playback speed rate (e.g. 0.25 to 3.0).
   * @param {number} rate 
   */
  setPlaybackRate(rate) {
    const clamped = Math.max(0.25, Math.min(4.0, rate));
    this.state.playbackRate = clamped;
    if (this.videoElement) {
      this.videoElement.playbackRate = clamped;
    }
    this.savePreferences();
    return clamped;
  }

  /**
   * Attaches fullscreen change listeners across vendor implementations.
   */
  attachFullscreenWatcher() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    if (this._onFsChange) return;

    this._onFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      this.state.isFullscreen = isFs;
      this.emit('fullscreenchange', { isFullscreen: isFs });
    };

    document.addEventListener('fullscreenchange', this._onFsChange);
    document.addEventListener('webkitfullscreenchange', this._onFsChange);
    document.addEventListener('mozfullscreenchange', this._onFsChange);
    document.addEventListener('MSFullscreenChange', this._onFsChange);
  }

  /**
   * Request fullscreen mode.
   */
  enterFullscreen() {
    if (typeof document === 'undefined') return false;
    const target = document.querySelector('#movie_player') || document.querySelector('video') || document.documentElement || document.body;
    if (!target) return false;

    try {
      if (target.requestFullscreen) {
        target.requestFullscreen().catch(() => {});
      } else if (target.webkitRequestFullscreen) {
        target.webkitRequestFullscreen();
      } else if (target.mozRequestFullScreen) {
        target.mozRequestFullScreen();
      } else if (target.msRequestFullscreen) {
        target.msRequestFullscreen();
      }
    } catch (_) {}
    // Only fullscreenchange from the browser is authoritative. Never
    // overwrite read-only document.fullscreenElement or send a duplicate IPC.
    return true;
  }

  /**
   * Exit fullscreen mode.
   */
  exitFullscreen() {
    if (typeof document === 'undefined') return false;
    try {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    } catch (_) {}
    return true;
  }

  /**
   * Toggle fullscreen mode.
   */
  toggleFullscreen() {
    if (typeof document === 'undefined') return false;
    const isFs = Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      this.state.isFullscreen
    );
    if (isFs) {
      return this.exitFullscreen();
    } else {
      return this.enterFullscreen();
    }
  }

  /**
   * Keyboard shortcuts handling.
   */
  attachKeyboardShortcuts() {
    if (typeof window === 'undefined') return;
    if (this._onKeyDown) return;

    this._onKeyDown = (e) => {
      // Avoid intercepting keystrokes inside search input or comments
      const tag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) {
        return;
      }

      // Percent jumps (0-9)
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        const percent = parseInt(e.key, 10) * 10;
        const target = (this.state.duration || 0) * (percent / 100);
        this.seekTo(target);
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'j':
        case 'J':
          e.preventDefault();
          this.seekBy(-10);
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          this.seekBy(10);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.seekBy(5);
          break;
        case 'Home':
          e.preventDefault();
          this.seekTo(0);
          break;
        case 'End':
          e.preventDefault();
          this.seekTo(this.state.duration || 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.adjustVolume(5);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.adjustVolume(-5);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'f':
        case 'F':
        case 'F11':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case '>':
        case '.':
          if (e.shiftKey || e.key === '>') {
            e.preventDefault();
            this.setPlaybackRate(this.state.playbackRate + 0.25);
          }
          break;
        case '<':
        case ',':
          if (e.shiftKey || e.key === '<') {
            e.preventDefault();
            this.setPlaybackRate(this.state.playbackRate - 0.25);
          }
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          if (typeof document !== 'undefined') {
            const ccBtn = document.querySelector('.ytp-subtitles-button');
            if (ccBtn) ccBtn.click();
          }
          this.emit('toggleCaptions');
          break;
        case 't':
        case 'T':
          e.preventDefault();
          if (typeof document !== 'undefined') {
            const theaterBtn = document.querySelector('.ytp-size-button');
            if (theaterBtn) theaterBtn.click();
          }
          this.emit('toggleTheater');
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          if (typeof document !== 'undefined') {
            const miniBtn = document.querySelector('.ytp-miniplayer-button');
            if (miniBtn) miniBtn.click();
          }
          this.emit('toggleMiniplayer');
          break;
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
  }

  /**
   * Persist playback preferences into localStorage.
   */
  savePreferences() {
    if (typeof localStorage === 'undefined' || !this.options.rememberPreferences) return;
    try {
      localStorage.setItem('tizentube_playback_prefs', JSON.stringify({
        volume: this.state.volume,
        isMuted: this.state.isMuted,
        playbackRate: this.state.playbackRate
      }));
    } catch (_) {}
  }

  /**
   * Retrieve saved playback preferences.
   */
  loadPreferences() {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = localStorage.getItem('tizentube_playback_prefs');
      if (data) {
        const parsed = JSON.parse(data);
        if (typeof parsed.volume === 'number' && !isNaN(parsed.volume)) {
          this.state.volume = Math.max(0, Math.min(100, parsed.volume));
        }
        if (typeof parsed.isMuted === 'boolean') {
          this.state.isMuted = parsed.isMuted;
        }
        if (typeof parsed.playbackRate === 'number' && !isNaN(parsed.playbackRate)) {
          this.state.playbackRate = Math.max(0.25, Math.min(4.0, parsed.playbackRate));
        }
      }
    } catch (_) {}
  }

  /**
   * Current playback state snapshot.
   * @returns {Object}
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Event emitter registration.
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  off(event, handler) {
    const handlers = this.listeners.get(event);
    if (handlers) this.listeners.set(event, handlers.filter(h => h !== handler));
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const h of handlers) {
      try {
        h(data);
      } catch (err) {
        console.error(`Error in playback listener for ${event}:`, err);
      }
    }
  }

  /**
   * Releases video observers, window/document event listeners, and internal state.
   */
  dispose() {
    this.unbindVideoElement();
    if (typeof window !== 'undefined' && this._onDomReady) {
      window.removeEventListener('DOMContentLoaded', this._onDomReady);
      this._onDomReady = null;
    }
    if (this.videoObserver) {
      this.videoObserver.disconnect();
      this.videoObserver = null;
    }
    if (typeof window !== 'undefined' && this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
      this._onKeyDown = null;
    }
    if (typeof document !== 'undefined' && this._onFsChange) {
      document.removeEventListener('fullscreenchange', this._onFsChange);
      document.removeEventListener('webkitfullscreenchange', this._onFsChange);
      document.removeEventListener('mozfullscreenchange', this._onFsChange);
      document.removeEventListener('MSFullscreenChange', this._onFsChange);
      this._onFsChange = null;
    }
    this.listeners.clear();
  }
}

// --- Module: src/runtime/viewing_experience.js ---
/**
 * TizenTube Windows - Native player experience and local continuity.
 * GPL-3.0-only. No account tokens, history API calls or additional WebViews.
 */
class ViewingExperience {
  constructor(playback, options = {}) {
    this.playback = playback;
    this.options = { restoreOnLaunch: true, ...options };
    this.theaterKey = 'tizentube.theater.v1';
    this.lastKey = 'tizentube.lastVideo.v1';
    this.lastSavedAt = 0;
    this.lastVideo = null;
    this.theaterObserver = null;
    this.theaterElement = null;
    this.theaterButton = null;
    this.theaterUserChoicePending = false;
    this._boundTheaterClick = e => {
      // YouTube can dispatch synthetic size-button clicks on navigation.
      // Only a trusted USER click changes the durable preference.
      if (this.saveTheaterSuppressed || window.__TT_RESTORING_THEATER ||
          e?.isTrusted !== true) return;
      this.theaterUserChoicePending = true;
      setTimeout(() => {
        if (!this.disposed && this.getVideoId() && this.theaterElement) {
          this.setTheaterPreference(this.theaterElement.hasAttribute('theater'));
        }
        this.theaterUserChoicePending = false;
      }, 180);
    };
    this._boundTheaterKeyboard = e => {
      if (!e?.isTrusted || e.repeat || e.altKey || e.ctrlKey || e.metaKey ||
          e.key?.toLowerCase() !== 't' ||
          ['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable ||
          !this.getVideoId()) return;
      this.theaterUserChoicePending = true;
      setTimeout(() => {
        if (!this.disposed && this.theaterElement)
          this.setTheaterPreference(this.theaterElement.hasAttribute('theater'));
        this.theaterUserChoicePending = false;
      }, 250);
    };
    this.pipControls = null;
    this.pipControlsObserver = null;
    this.pipScanScheduled = false;
    this.pipWatchdog = null;
    this.theaterRestoreUntil = 0;
    this.lastNativeTheaterRestoreAt = 0;
    this.nativeTheaterRestoreAttempts = 0;
    this.pipButton = null;
    // The native WebView2 controller handles floating shortcuts: Chromium
    // consumes Ctrl+Shift+P for Print before a document keydown can cancel it.
    this.retryTimer = null;
    this.saveTheaterSuppressed = false;
    this.isNavigating = false;
    this.mounted = false;
    this.disposed = false;
    this._boundNav = () => this.onNavigation();
    this._boundNavStart = () => {
      this.flushProgress();
      this.isNavigating = true;
    };
    this._boundVisibility = () => this.flushProgress();
    this._boundReady = () => this.onVideoReady();
    this._boundTime = () => this.persistProgress();
    this._boundEnded = () => this.clearCompletedVideo();
  }

  getStorage() {
    try { return typeof localStorage !== 'undefined' ? localStorage : null; }
    catch (_) { return null; }
  }

  getVideoId(url = typeof location !== 'undefined' ? location.href : '') {
    try {
      const parsed = new URL(url);
      if (!['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(parsed.hostname)
        || parsed.pathname !== '/watch') return null;
      const id = parsed.searchParams.get('v');
      return /^[\w-]{11}$/.test(id || '') ? id : null;
    } catch (_) { return null; }
  }

  readLastVideo() {
    try {
      const data = JSON.parse(this.getStorage()?.getItem(this.lastKey) || 'null');
      if (!data || !/^[\w-]{11}$/.test(data.id) || !Number.isFinite(data.position)
        || !Number.isFinite(data.duration) || !Number.isFinite(data.updatedAt)
        || data.position < 5 || data.position >= data.duration - 15
        || data.updatedAt > Date.now() + 60000) return null;
      return data;
    } catch (_) { return null; }
  }

  persistProgress(force = false) {
    if (!this.playback?.videoElement) return;
    const now = Date.now();
    if (!force && now - this.lastSavedAt < 8000) return;
    const id = this.getVideoId();
    const video = this.playback.videoElement;
    // Never store ad positions, livestreams, short previews, or invalid data.
    if (!id || !Number.isFinite(video.currentTime) || !Number.isFinite(video.duration)
      || video.duration < 30 || video.currentTime < 5) return;
    if (typeof document !== 'undefined' && document.querySelector?.('.ad-showing')) return;
    if (video.currentTime >= video.duration - 15) {
      this.clearCompletedVideo();
      return;
    }
    try {
      const state = { id, position: Math.floor(video.currentTime),
        duration: Math.floor(video.duration), updatedAt: now };
      this.getStorage()?.setItem(this.lastKey, JSON.stringify(state));
      this.lastSavedAt = now;
    } catch (_) { /* Quota/privacy mode: fail without blocking playback */ }
  }

  flushProgress() { this.persistProgress(true); }

  clearCompletedVideo() {
    const old = this.readLastVideo();
    if (old && old.id === this.getVideoId()) {
      try { this.getStorage()?.removeItem(this.lastKey); } catch (_) {}
    }
  }

  restoreLastVideoOnLaunch() {
    if (!this.options.restoreOnLaunch || typeof location === 'undefined') return false;
    try {
      const home = location.hostname === 'www.youtube.com' && location.pathname === '/';
      if (!home || sessionStorage.getItem('tizentube.launchRestoreAttempted')) return false;
      sessionStorage.setItem('tizentube.launchRestoreAttempted', '1');
      const state = this.readLastVideo();
      if (!state) return false;
      // Only navigation on app launch, not on each SPA visit to Home.
      location.replace('https://www.youtube.com/watch?v=' + state.id +
        '&t=' + Math.max(0, Math.floor(state.position)) + 's');
      return true;
    } catch (_) { return false; }
  }

  savedTheaterState() {
    try {
      if (typeof window !== 'undefined' && typeof window.__TT_THEATER_PREF === 'boolean')
        return window.__TT_THEATER_PREF;
      const value = this.getStorage()?.getItem(this.theaterKey);
      return value === 'true' ? true : value === 'false' ? false : null;
    } catch (_) { return null; }
  }

  setTheaterPreference(value) {
    try {
      const enabled = Boolean(value);
      this.getStorage()?.setItem(this.theaterKey, String(enabled));
      if (typeof window !== 'undefined') {
        window.__TT_THEATER_PREF = enabled;
        window.chrome?.webview?.postMessage?.({ channel: 'viewing:theater', enabled });
      }
    }
    catch (_) {}
  }

  syncTheaterMode() {
    if (typeof document === 'undefined' || !this.getVideoId()) return false;
    const flexy = document.querySelector?.('ytd-watch-flexy');
    const theaterButton = document.querySelector?.('.ytp-size-button');
    if (!flexy || !theaterButton) return false;
    if (this.theaterButton !== theaterButton) {
      this.theaterButton?.removeEventListener?.('click', this._boundTheaterClick);
      this.theaterButton = theaterButton;
      this.theaterButton.addEventListener?.('click', this._boundTheaterClick);
    }
    if (this.theaterElement !== flexy) {
      this.theaterObserver?.disconnect();
      this.theaterElement = flexy;
      if (typeof MutationObserver !== 'undefined') {
        // Never SAVE automatic mutations: YouTube resets the 'theater'
        // attribute on watch navigation, overwriting what the user chose.
        this.theaterObserver = new MutationObserver(() => {
          if (this.saveTheaterSuppressed || this.theaterUserChoicePending ||
              this.isNavigating || this.disposed) return;
          const wanted = this.savedTheaterState();
          if (wanted !== null && flexy.hasAttribute('theater') !== wanted) {
            // Delay reconciliation until YouTube finishes laying out its new
            // player, rather than fighting its synchronous rendering.
            if (this.retryTimer) clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(() => this.syncTheaterMode(), 250);
          }
        });
        this.theaterObserver.observe(flexy, { attributes: true, attributeFilter: ['theater'] });
      }
    }
    const saved = this.savedTheaterState();
    if (saved === null) {
      // Critical: a first-time user must be allowed to save their FIRST
      // theater click. Previously isNavigating stayed true forever here.
      this.isNavigating = false;
      return true;
    }
    const current = flexy.hasAttribute('theater');
    if (saved !== current && !this.theaterUserChoicePending) {
      // YouTube sometimes ignores HTMLElement.click() (untrusted event). The
      // host restores an actual user-visible theater button via WebView2's
      // trusted input protocol, after verifying that the state still differs.
      if (typeof window !== 'undefined' && window.chrome?.webview?.postMessage) {
        const now = Date.now();
        if (this.nativeTheaterRestoreAttempts < 5 &&
            now - this.lastNativeTheaterRestoreAt > 3000) {
          this.lastNativeTheaterRestoreAt = now;
          this.nativeTheaterRestoreAttempts++;
          window.chrome.webview.postMessage({ channel: 'viewing:restore-theater', enabled: saved });
        }
      } else {
        this.saveTheaterSuppressed = true;
        try { theaterButton.click(); } finally {
          queueMicrotask(() => { this.saveTheaterSuppressed = false; });
        }
      }
    }
    this.isNavigating = false;
    return true;
  }

  /** Chromium's real HTMLVideoElement Picture-in-Picture: no extra WebView. */
  togglePictureInPicture() {
    if (typeof document === 'undefined') return false;
    const video = this.playback?.videoElement || document.querySelector?.('video.html5-main-video');
    if (!video) return false;
    // WebView2 commonly disables the Chromium PiP API. Never hide the
    // control: the native host can float the *same* playback session in a
    // compact topmost window without cloning the video or losing auth.
    if (typeof window !== 'undefined' && window.chrome?.webview?.postMessage) {
      window.chrome.webview.postMessage({ channel: 'window:toggle-floating' });
      return true;
    }
    if (!document.pictureInPictureEnabled || !video.requestPictureInPicture) return false;
    try {
      const operation = document.pictureInPictureElement
        ? document.exitPictureInPicture() : video.requestPictureInPicture();
      Promise.resolve(operation).catch(() => {});
      return true;
    } catch (_) { return false; }
  }

  mountPipControl() {
    if (typeof document === 'undefined' || !this.getVideoId()) return false;
    const controls = document.querySelector?.('.ytp-right-controls');
    if (!controls) return false;
    const existing = document.getElementById?.('tizentube-native-pip');
    if (existing && existing.parentNode === controls) {
      const settings = controls.querySelector?.('.ytp-settings-button');
      if (settings && existing.nextSibling !== settings) controls.insertBefore(existing, settings);
      this.pipButton = existing;
      return true;
    }
    if (existing) existing.remove?.();
    const button = document.createElement('button');
    button.id = 'tizentube-native-pip';
    button.type = 'button';
    button.className = 'ytp-button';
    button.title = 'Reproductor flotante (F9)';
    button.setAttribute('aria-label', 'Imagen en imagen');
    button.setAttribute('aria-pressed', 'false');
    // Avoid innerHTML: YouTube often enforces TrustedHTML, which throws and
    // silently aborted the full mount in prior releases.
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    for (const [name, value] of Object.entries({ viewBox: '0 0 36 36', width: '34',
      height: '34', 'aria-hidden': 'true' })) svg.setAttribute(name, value);
    const outline = document.createElementNS(svgNs, 'rect');
    for (const [name, value] of Object.entries({ x: '4', y: '6', width: '28',
      height: '23', rx: '2', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }))
      outline.setAttribute(name, value);
    const inset = document.createElementNS(svgNs, 'rect');
    for (const [name, value] of Object.entries({ x: '17', y: '17', width: '12',
      height: '9', rx: '1', fill: 'currentColor' })) inset.setAttribute(name, value);
    svg.appendChild(outline);
    svg.appendChild(inset);
    button.appendChild(svg);
    button.addEventListener('click', e => {
      e.stopPropagation();
      if (!this.togglePictureInPicture()) button.title = 'Abre un vídeo para usar el reproductor flotante';
    });
    // Exact requested location: immediately after CC, before YouTube settings.
    const captions = controls.querySelector?.('.ytp-subtitles-button');
    const settings = controls.querySelector?.('.ytp-settings-button');
    // .ytp-settings-button may live in a wrapper instead of being a direct
    // .ytp-right-controls child. insertBefore() requires a direct child.
    let settingsChild = settings;
    while (settingsChild && settingsChild.parentElement !== controls)
      settingsChild = settingsChild.parentElement;
    if (settingsChild) controls.insertBefore(button, settingsChild);
    else if (captions?.nextSibling) controls.insertBefore(button, captions.nextSibling);
    else controls.appendChild?.(button);
    this.pipButton = button;
    if (this.pipControls !== controls) {
      this.pipControlsObserver?.disconnect();
      this.pipControls = controls;
      if (typeof MutationObserver !== 'undefined') {
        this.pipControlsObserver = new MutationObserver(() => {
          if (this.disposed || this.pipScanScheduled) return;
          this.pipScanScheduled = true;
          queueMicrotask(() => {
            this.pipScanScheduled = false;
            if (!this.disposed) this.mountPipControl();
          });
        });
        this.pipControlsObserver.observe(controls, { childList: true });
      }
    }
    return true;
  }

  onVideoReady() {
    const video = this.playback?.videoElement;
    if (!video) return;
    video.addEventListener('ended', this._boundEnded, { once: true });
    this.onNavigation();
  }

  onNavigation() {
    if (this.disposed) return;
    if (!this.getVideoId()) {
      if (typeof document !== 'undefined' && document.documentElement?.classList?.contains('tt-floating-mode')) {
        window.chrome?.webview?.postMessage?.({ channel: 'window:restore-floating' });
      }
      return;
    }
    this.theaterRestoreUntil = Date.now() + 35000;
    this.nativeTheaterRestoreAttempts = 0;
    // On SPA transitions, the player/controls arrive after yt-navigate-finish.
    if (this.retryTimer) clearTimeout(this.retryTimer);
    let attempts = 0;
    const tryAttach = () => {
      if (this.disposed || !this.getVideoId()) return;
      const theaterReady = this.syncTheaterMode();
      const pipReady = this.mountPipControl();
      const ready = theaterReady && pipReady;
      if (!ready && attempts++ < 16) this.retryTimer = setTimeout(tryAttach, 650);
    };
    tryAttach();
  }

  mount() {
    if (this.mounted || typeof window === 'undefined') return;
    this.mounted = true;
    this.restoreLastVideoOnLaunch();
    window.addEventListener('yt-navigate-start', this._boundNavStart);
    window.addEventListener('yt-navigate-finish', this._boundNav);
    window.addEventListener('popstate', this._boundNav);
    window.addEventListener('pagehide', this._boundVisibility);
    document?.addEventListener?.('visibilitychange', this._boundVisibility);
    document?.addEventListener?.('keydown', this._boundTheaterKeyboard, true);
    this.playback?.on('timeupdate', this._boundTime);
    this.playback?.on('ready', this._boundReady);
    // YouTube dynamically replaces control buttons without a full SPA
    // navigation. Keep our requested CC → floating → settings placement.
    if (typeof setInterval === 'function')
      this.pipWatchdog = setInterval(() => {
        if (!this.disposed && this.getVideoId()) {
          this.mountPipControl();
          // YouTube reinitializes ytd-watch-flexy after initial navigation,
          // so the first restore can be overwritten. Reconcile late UI
          // hydration during a bounded 35-second startup window only.
          if (Date.now() < this.theaterRestoreUntil) this.syncTheaterMode();
        }
      }, 2200);
    this.onNavigation();
  }

  dispose() {
    this.flushProgress();
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pipWatchdog) clearInterval(this.pipWatchdog);
    this.theaterObserver?.disconnect();
    this.pipControlsObserver?.disconnect();
    this.theaterButton?.removeEventListener?.('click', this._boundTheaterClick);
    this.pipButton?.remove?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('yt-navigate-finish', this._boundNav);
      window.removeEventListener('yt-navigate-start', this._boundNavStart);
      window.removeEventListener('popstate', this._boundNav);
      window.removeEventListener('pagehide', this._boundVisibility);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener?.('visibilitychange', this._boundVisibility);
      document.removeEventListener?.('keydown', this._boundTheaterKeyboard, true);
    }
    this.playback?.off?.('timeupdate', this._boundTime);
    this.playback?.off?.('ready', this._boundReady);
  }
}

// --- Module: src/mods/sponsorblock_base.js ---
/**
 * TizenTube Windows - SponsorBlock Base Engine
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Queries SponsorBlock API for video skip segments, tracks playback timeline,
 * provides timeline marker geometry for custom seekbars, and executes segment skips
 * with robust fail-open resilience against API downtime or network loss.
 */
const SPONSORBLOCK_CATEGORIES = {
  sponsor: {
    color: '#00d400',
    name: 'Sponsor'
  },
  intro: {
    color: '#00ffff',
    name: 'Intermission / Intro'
  },
  outro: {
    color: '#0202ed',
    name: 'Endcards / Outro'
  },
  interaction: {
    color: '#cc00ff',
    name: 'Interaction Reminder'
  },
  selfpromo: {
    color: '#ffff00',
    name: 'Self-Promotion'
  },
  preview: {
    color: '#008fd6',
    name: 'Preview / Recap'
  },
  filler: {
    color: '#7300ff',
    name: 'Filler / Tangents'
  },
  music_offtopic: {
    color: '#ff9900',
    name: 'Music Off-Topic'
  },
  poi_highlight: {
    color: '#9b044c',
    name: 'Highlight'
  }
};
class SponsorBlockBase {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      apiUrl: 'https://sponsor.ajay.app/api',
      categories: ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction'],
      autoSkip: true,
      showNotice: true,
      timeoutMs: 4000,
      maxCacheSize: 100,
      circuitBreakerThreshold: 3,
      circuitCooldownMs: 60000,
      ...options
    };

    this.currentSegments = [];
    this.currentVideoId = null;
    this.skipCount = 0;
    this.lastSkipped = null;
    this.alreadySkippedSegments = new Set();

    // Resilient bounded caching & deduplication to minimize network overhead and memory
    this.cache = new Map(); // videoId -> Array<Segment>
    this.inFlightRequests = new Map(); // videoId -> Promise<Array<Segment>>

    // Circuit breaker state for external API outages
    this.consecutiveFailures = 0;
    this.circuitCooldownUntil = 0;
  }

  /**
   * Updates enabled status.
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    this.options.enabled = Boolean(enabled);
    if (!this.options.enabled) this.currentSegments = [];
  }

  /**
   * Updates auto-skip preference.
   * @param {boolean} autoSkip 
   */
  setAutoSkip(autoSkip) {
    this.options.autoSkip = Boolean(autoSkip);
  }

  /**
   * Updates active category filters.
   * @param {Array<string>} categories 
   */
  setCategories(categories) {
    if (Array.isArray(categories)) {
      this.options.categories = [...categories];
    }
  }

  /**
   * Sets current active video ID and fetches segments from API with fail-open fallback.
   * @param {string} videoId 
   */
  async setVideo(videoId) {
    if (!videoId) return;
    if (videoId === this.currentVideoId && this.currentSegments.length > 0) return;

    this.currentVideoId = videoId;
    this.currentSegments = [];
    this.alreadySkippedSegments.clear();

    if (!this.options.enabled) return;

    try {
      const segments = await this.fetchSegments(videoId);
      // In YouTube's SPA, earlier network replies can arrive after navigating
      // to the next video. Never associate stale sponsor segments with it.
      if (videoId === this.currentVideoId && this.options.enabled) {
        this.currentSegments = segments;
      }
    } catch (err) {
      // SponsorBlock API downtime must never break video playback (fail-open)
      console.warn(`[SponsorBlock] Query failed for ${videoId} (fail-open):`, err.message);
      if (videoId === this.currentVideoId) this.currentSegments = [];
    }
  }

  /**
   * Fetches skip segments for a given video ID with timeout, circuit breaker,
   * bounded caching, and error protection.
   * @param {string} videoId 
   * @returns {Promise<Array>}
   */
  async fetchSegments(videoId) {
    if (!videoId) return [];

    // Return from bounded cache if previously fetched
    if (this.cache.has(videoId)) {
      return this.cache.get(videoId);
    }

    // Deduplicate concurrent in-flight requests for same video
    if (this.inFlightRequests.has(videoId)) {
      return this.inFlightRequests.get(videoId);
    }

    // Circuit breaker: fail-open immediately if API is in cooldown after repeated outages
    const now = Date.now();
    if (this.circuitCooldownUntil > now) {
      return [];
    }

    const fetchPromise = (async () => {
      if (typeof fetch === 'undefined') return [];

      const catsParam = encodeURIComponent(JSON.stringify(this.options.categories));
      const url = `${this.options.apiUrl}/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${catsParam}`;

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutMs = this.options.timeoutMs || 4000;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: controller ? controller.signal : undefined
        });

        if (!res.ok) {
          if (res.status === 404) {
            // No segments exist for this video - cache empty array to avoid redundant queries
            this.setCache(videoId, []);
            this.consecutiveFailures = 0;
            return [];
          }
          if (res.status === 429) {
            // Rate limit encountered: trip circuit breaker with longer backoff
            this.consecutiveFailures = this.options.circuitBreakerThreshold;
            this.circuitCooldownUntil = Date.now() + Math.max(60000, this.options.circuitCooldownMs * 2);
            return [];
          }
          throw new Error(`HTTP ${res.status}`);
        }

        let data;
        try {
          data = await res.json();
        } catch (jsonErr) {
          throw new Error(`Malformed JSON response: ${jsonErr.message}`);
        }

        if (!Array.isArray(data)) {
          this.setCache(videoId, []);
          return [];
        }

        const segments = data
          .filter(item => Array.isArray(item.segment) && item.segment.length === 2 && !isNaN(item.segment[0]) && !isNaN(item.segment[1]))
          .map(item => {
            const catInfo = SPONSORBLOCK_CATEGORIES[item.category] || {
              color: '#00d400',
              name: item.category || 'Segment'
            };
            return {
              category: item.category,
              categoryName: catInfo.name,
              color: catInfo.color,
              start: Math.max(0, item.segment[0]),
              end: Math.max(0, item.segment[1]),
              segment: [Math.max(0, item.segment[0]), Math.max(0, item.segment[1])],
              uuid: item.UUID || `${item.category}_${item.segment[0]}`
            };
          });

        this.setCache(videoId, segments);
        this.consecutiveFailures = 0;
        this.circuitCooldownUntil = 0;
        return segments;
      } catch (err) {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.options.circuitBreakerThreshold) {
          this.circuitCooldownUntil = Date.now() + this.options.circuitCooldownMs;
        }
        console.warn(`[SponsorBlock] Query failed for ${videoId} (fail-open):`, err.message);
        return [];
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        this.inFlightRequests.delete(videoId);
      }
    })();

    this.inFlightRequests.set(videoId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Stores segments in bounded LRU cache, evicting oldest when limit exceeded.
   * @param {string} videoId 
   * @param {Array} segments 
   */
  setCache(videoId, segments) {
    if (!videoId) return;
    const max = this.options.maxCacheSize || 100;
    if (this.cache.size >= max) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(videoId, segments);
  }

  /**
   * Clears internal caches to minimize memory on trim or navigation.
   */
  clearCache() {
    this.cache.clear();
    this.inFlightRequests.clear();
    this.alreadySkippedSegments.clear();
  }

  /**
   * Resets engine state and clears all memory buffers.
   */
  dispose() {
    this.clearCache();
    this.currentSegments = [];
    this.currentVideoId = null;
    this.lastSkipped = null;
    this.consecutiveFailures = 0;
    this.circuitCooldownUntil = 0;
  }

  /**
   * Evaluates current playback time against active segments.
   * Returns skip details if inside an eligible segment, or null.
   * @param {number} currentTime Current video time in seconds
   * @returns {Object|null} Skip target information or null
   */
  checkSkip(currentTime) {
    if (!this.options.enabled || !this.options.autoSkip || !this.currentSegments.length) {
      return null;
    }

    for (const seg of this.currentSegments) {
      // Must match enabled categories
      if (!this.options.categories.includes(seg.category)) continue;

      const [start, end] = seg.segment;
      // Skip window check: if currently inside the segment
      if (currentTime >= start && currentTime < end - 0.2) {
        // Prevent repeated skips on the exact same segment if user seeks back into it
        if (this.alreadySkippedSegments.has(seg.uuid)) {
          continue;
        }

        this.skipCount++;
        this.alreadySkippedSegments.add(seg.uuid);
        this.lastSkipped = {
          uuid: seg.uuid,
          category: seg.category,
          categoryName: seg.categoryName,
          color: seg.color,
          start,
          end,
          targetTime: end
        };

        return end;
      }
    }

    return null;
  }

  /**
   * Computes normalized geometry (percentage values) for seekbar visualization.
   * @param {number} duration Video duration in seconds
   * @returns {Array<Object>} List of marker dimensions for UI rendering
   */
  getTimelineMarkers(duration) {
    if (!duration || duration <= 0 || !this.currentSegments.length) {
      return [];
    }

    return this.currentSegments
      .filter(seg => this.options.categories.includes(seg.category))
      .map(seg => {
        const startSec = Math.max(0, seg.start);
        const endSec = Math.min(duration, seg.end);
        const startPct = (startSec / duration) * 100;
        const widthPct = Math.max(0.2, ((endSec - startSec) / duration) * 100);

        return {
          category: seg.category,
          categoryName: seg.categoryName,
          color: seg.color,
          start: startSec,
          end: endSec,
          startPct: Math.min(100, Math.max(0, startPct)),
          widthPct: Math.min(100 - startPct, widthPct)
        };
      });
  }

  /**
   * Resets skip history for a segment (e.g., when user clicks undo).
   * @param {string} uuid 
   */
  resetSegmentSkip(uuid) {
    if (uuid) {
      this.alreadySkippedSegments.delete(uuid);
    }
  }

  getStats() {
    return {
      enabled: this.options.enabled,
      autoSkip: this.options.autoSkip,
      categories: [...this.options.categories],
      currentVideoId: this.currentVideoId,
      segmentCount: this.currentSegments.length,
      cachedVideosCount: this.cache.size,
      skipCount: this.skipCount,
      lastSkipped: this.lastSkipped,
      circuitBreakerTripped: this.circuitCooldownUntil > Date.now()
    };
  }
}

// --- Module: src/mods/dearrow_base.js ---
/**
 * TizenTube Windows - DeArrow Base Engine
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Queries DeArrow API for crowdsourced titles and thumbnails to replace
 * clickbait thumbnails and sensationalist video titles on YouTube feeds and player,
 * with fail-open fallback and non-destructive DOM modification.
 */
class DeArrowBase {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      apiUrl: 'https://dearrow-thumb.ajay.app/api/v1',
      replaceThumbnails: true,
      replaceTitles: true,
      timeoutMs: 4000,
      maxCacheSize: 300,
      circuitBreakerThreshold: 3,
      circuitCooldownMs: 60000,
      batchChunkSize: 30,
      ...options
    };

    this.cache = new Map();
    this.inFlightRequests = new Map();
    this.pendingIds = new Set();
    this.replacementsApplied = 0;
    this.observer = null;
    this.batchTimeout = null;

    // Circuit breaker state for external API outages
    this.consecutiveFailures = 0;
    this.circuitCooldownUntil = 0;
  }

  /**
   * Sets enabled state.
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    this.options.enabled = Boolean(enabled);
    if (!this.options.enabled) {
      this.stopDomObserver();
    } else {
      this.startDomObserver();
    }
  }

  /**
   * Updates feature flags.
   */
  setOptions(newOpts = {}) {
    Object.assign(this.options, newOpts);
  }

  /**
   * Stores branding item in bounded LRU cache.
   * @param {string} videoId 
   * @param {Object} branding 
   */
  setCacheItem(videoId, branding) {
    if (!videoId) return;
    const max = this.options.maxCacheSize || 300;
    if (this.cache.size >= max) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(videoId, branding);
  }

  /**
   * Fetches DeArrow branding data for a video or list of video IDs with fail-open safety,
   * bounded memory caching, request deduplication, and circuit breaker.
   * @param {string|Array<string>} videoIds 
   * @returns {Promise<Object>} Map of videoId -> DeArrow branding data
   */
  async fetchBranding(videoIds) {
    if (!this.options.enabled || typeof fetch === 'undefined') return {};
    const ids = (Array.isArray(videoIds) ? videoIds : [videoIds]).filter(Boolean);
    const uncached = ids.filter(id => !this.cache.has(id));

    if (uncached.length === 0) {
      return this.getCached(ids);
    }

    // Circuit breaker check
    const now = Date.now();
    if (this.circuitCooldownUntil > now) {
      return this.getCached(ids);
    }

    // Chunk uncached requests into batches of max 30 to avoid URI length overflow
    const chunkSize = this.options.batchChunkSize || 30;
    const chunks = [];
    for (let i = 0; i < uncached.length; i += chunkSize) {
      chunks.push(uncached.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      const chunkKey = chunk.sort().join(',');
      if (this.inFlightRequests.has(chunkKey)) {
        await this.inFlightRequests.get(chunkKey);
        continue;
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutMs = this.options.timeoutMs || 4000;
      const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      const chunkPromise = (async () => {
        try {
          const url = `${this.options.apiUrl}/branding?videoIDs=${encodeURIComponent(JSON.stringify(chunk))}`;
          const res = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            signal: controller ? controller.signal : undefined
          });

          if (!res.ok) {
            if (res.status === 404) {
              return;
            }
            if (res.status === 429) {
              this.consecutiveFailures = this.options.circuitBreakerThreshold;
              this.circuitCooldownUntil = Date.now() + Math.max(60000, this.options.circuitCooldownMs * 2);
              return;
            }
            throw new Error(`HTTP ${res.status}`);
          }

          let data;
          try {
            data = await res.json();
          } catch (jsonErr) {
            throw new Error(`Malformed JSON response from DeArrow: ${jsonErr.message}`);
          }

          if (Array.isArray(data)) {
            for (const item of data) {
              if (item && item.videoID) {
                const titleObj = Array.isArray(item.titles) ? item.titles.find(t => !t.locked) || item.titles[0] : null;
                const thumbObj = Array.isArray(item.thumbnails) ? item.thumbnails.find(t => !t.locked) || item.thumbnails[0] : null;

                this.setCacheItem(item.videoID, {
                  videoID: item.videoID,
                  title: titleObj?.title || null,
                  thumbnail: thumbObj?.timestamp ? `${this.options.apiUrl}/thumbnail?videoID=${item.videoID}&time=${thumbObj.timestamp}` : null,
                  original: item
                });
              }
            }
          }

          this.consecutiveFailures = 0;
          this.circuitCooldownUntil = 0;
        } catch (err) {
          this.consecutiveFailures++;
          if (this.consecutiveFailures >= this.options.circuitBreakerThreshold) {
            this.circuitCooldownUntil = Date.now() + this.options.circuitCooldownMs;
          }
          console.warn('[DeArrow] API query failed (fail-open):', err.message);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          this.inFlightRequests.delete(chunkKey);
        }
      })();

      this.inFlightRequests.set(chunkKey, chunkPromise);
      await chunkPromise;
    }

    return this.getCached(ids);
  }

  /**
   * Reads cached branding records.
   * @param {Array<string>} ids 
   * @returns {Object}
   */
  getCached(ids) {
    const result = {};
    for (const id of ids) {
      if (this.cache.has(id)) {
        result[id] = this.cache.get(id);
      }
    }
    return result;
  }

  /**
   * Clears in-memory caches to minimize footprint on navigation or memory trim.
   */
  clearCache() {
    this.cache.clear();
    this.inFlightRequests.clear();
    this.pendingIds.clear();
  }

  /**
   * Disposes timers, observers, and caches.
   */
  dispose() {
    this.stopDomObserver();
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.clearCache();
    this.consecutiveFailures = 0;
    this.circuitCooldownUntil = 0;
  }

  /**
   * Applies DeArrow replacements to DOM elements found within rootElement.
   * @param {HTMLElement} [rootElement]
   */
  async applyToDom(rootElement = typeof document !== 'undefined' ? document : null) {
    if (!this.options.enabled || !rootElement) return 0;

    // Discover video renderers (YouTube desktop, mobile, TV)
    const videoCards = rootElement.querySelectorAll(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model'
    );

    const idsToFetch = [];
    const elementsToPatch = [];

    videoCards.forEach(card => {
      // Find video link
      const link = card.querySelector('a#video-title-link, a#thumbnail, a[href*="watch?v="]');
      if (!link || !link.href) return;

      const urlMatch = link.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      const videoId = urlMatch ? urlMatch[1] : null;
      if (!videoId) return;

      if (!card.dataset.dearrowProcessed) {
        elementsToPatch.push({ card, videoId });
        if (!this.cache.has(videoId)) {
          idsToFetch.push(videoId);
        }
      }
    });

    if (idsToFetch.length > 0) {
      await this.fetchBranding(idsToFetch);
    }

    let modified = 0;
    for (const { card, videoId } of elementsToPatch) {
      const branding = this.cache.get(videoId);
      if (!branding) {
        card.dataset.dearrowProcessed = 'empty';
        continue;
      }

      // 1. Replace Title
      if (this.options.replaceTitles && branding.title) {
        const titleEl = card.querySelector('#video-title, .yt-core-attributed-string, [id="video-title"]');
        if (titleEl && titleEl.textContent !== branding.title) {
          titleEl.setAttribute('data-original-title', titleEl.textContent || '');
          titleEl.textContent = branding.title;
          titleEl.title = branding.title;
          modified++;
        }
      }

      // 2. Replace Thumbnail
      if (this.options.replaceThumbnails && branding.thumbnail) {
        const img = card.querySelector('ytd-thumbnail img, yt-image img, img.yt-core-image');
        if (img && img.src !== branding.thumbnail) {
          img.setAttribute('data-original-src', img.src || '');
          img.src = branding.thumbnail;
          modified++;
        }
      }

      card.dataset.dearrowProcessed = 'true';
    }

    this.replacementsApplied += modified;
    return modified;
  }

  /**
   * Starts MutationObserver to automatically apply DeArrow to dynamic content feeds.
   */
  startDomObserver() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    if (this.observer) return;

    let timeout = null;
    this.observer = new MutationObserver(() => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (this.options.enabled) {
          this.applyToDom();
        }
      }, 500);
    });

    const target = document.querySelector('ytd-app') || document.body;
    if (target) {
      this.observer.observe(target, { childList: true, subtree: true });
    }
  }

  /**
   * Stops DOM observer.
   */
  stopDomObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  getStats() {
    return {
      enabled: this.options.enabled,
      replaceTitles: this.options.replaceTitles,
      replaceThumbnails: this.options.replaceThumbnails,
      cachedCount: this.cache.size,
      replacementsApplied: this.replacementsApplied,
      circuitBreakerTripped: this.circuitCooldownUntil > Date.now()
    };
  }
}

// --- Module: src/mods/adblock_base.js ---
/**
 * TizenTube Windows - AdBlock Base Interceptor
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Ports core TizenTube JSON response filtering logic for YouTube desktop/web,
 * stripping adPlacements, playerAds, and adSlots from API payloads,
 * coupled with cosmetic DOM element suppression and automated ad skip handling.
 */
class AdBlockBase {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      blockAdsInJson: true,
      cosmeticFilter: true,
      autoSkipVideoAds: true,
      ...options
    };

    this.blockedCount = 0;
    this.isHooked = false;
    this.skipObserver = null;
    this.adVideoSpeedupCount = 0;
    this._skipScheduled = false;
    this._wasAdPlaying = false;
    this._preAdRate = null;
    this._preAdMuted = null;
    this._origJsonParse = null;
    this._origJsonStringify = null;
    this._origResponseJson = null;
    this._domReadyListener = null;
    this.sponsoredObserver = null;
    this._sponsoredScanScheduled = false;
    this._diagnosticKeyHandler = null;
  }

  /**
   * Initializes JSON.parse and fetch/XHR hooks for YouTube responses.
   */
  install() {
    if (!this.options.enabled || this.isHooked) return;
    this.hookJsonParser();
    this.hookTvInlinePlayback();
    this.hookFetchResponseJson();
    this.attachDocumentFilters();
    this.installDiagnosticShortcut();
    this.isHooked = true;
  }

  /** WebView2 injects at document creation, often before <body> exists. */
  attachDocumentFilters() {
    if (typeof document === 'undefined') return;
    if (this.options.cosmeticFilter) this.injectCosmeticStyles();
    if (document.body) {
      if (this.options.cosmeticFilter) this.startSponsoredCardObserver();
      if (this.options.autoSkipVideoAds) this.startAutoSkipObserver();
    } else if (!this._domReadyListener && typeof document.addEventListener === 'function') {
      this._domReadyListener = () => {
        this._domReadyListener = null;
        if (!this.options.enabled) return;
        this.attachDocumentFilters();
      };
      document.addEventListener('DOMContentLoaded', this._domReadyListener, { once: true });
    }
  }

  /**
   * Toggles active adblock state at runtime.
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    this.options.enabled = Boolean(enabled);
    if (!this.options.enabled) {
      this.removeCosmeticStyles();
      this.stopAutoSkipObserver();
      this.stopSponsoredCardObserver();
    } else {
      if (!this.isHooked) {
        this.install();
      } else {
        this.attachDocumentFilters();
      }
    }
  }

  /**
   * Hooks JSON.parse globally to clean YouTube ad objects as they are deserialized.
   */
  hookJsonParser() {
    if (typeof JSON === 'undefined') return;
    if (this._origJsonParse) return; // Prevent double hooking

    const originalParse = JSON.parse;
    this._origJsonParse = originalParse;
    const self = this;

    JSON.parse = function (...args) {
      const result = originalParse.apply(this, args);
      // Avoid deleting similarly named fields in unrelated services (e.g.
      // account APIs) even when called from within the YouTube page.
      const youtubePayload = result && typeof result === 'object' && (
        'playerResponse' in result || 'videoDetails' in result || 'streamingData' in result
        || 'playabilityStatus' in result ||
        Boolean(result.contents?.twoColumnBrowseResultsRenderer
          || result.contents?.twoColumnSearchResultsRenderer
          || result.contents?.singleColumnBrowseResultsRenderer
          || result.contents?.tvBrowseRenderer)
        || Boolean(result.continuationContents?.richGridContinuation
          || result.continuationContents?.sectionListContinuation)
      );
      if (self.options.enabled && self.options.blockAdsInJson && youtubePayload) {
        try {
          self.cleanAdData(result);
        } catch (err) {
          // Fail-open: never let ad cleaning crash core page JSON deserialization
          console.warn('[AdBlock] Safe parse cleanup error (fail-open):', err.message);
        }
      }
      return result;
    };
  }

  /**
   * TizenTube TV upstream also patches JSON.stringify so inline playback
   * requests include isInlinePlaybackNoAd=true. Scope this to /tv only;
   * modifying desktop InnerTube requests can break ordinary videos.
   */
  hookTvInlinePlayback() {
    if (this._origJsonStringify || typeof JSON === 'undefined') return;
    const original = JSON.stringify;
    const self = this;
    this._origJsonStringify = original;
    JSON.stringify = function (value, replacer, space) {
      const tvPage = typeof location !== 'undefined'
        && /^\/tv(?:\/|$)/.test(location.pathname || '');
      const context = value?.playbackContext?.contentPlaybackContext;
      if (tvPage && self.options.enabled && context && !context.isInlinePlaybackNoAd) {
        value = { ...value, playbackContext: { ...value.playbackContext,
          contentPlaybackContext: { ...context, isInlinePlaybackNoAd: true } } };
      }
      return original.call(this, value, replacer, space);
    };
  }

  /**
   * Modern YouTube desktop decodes its /youtubei/v1/player responses with
   * Response.json(), which does not need to call the page's JSON.parse hook.
   * Intercept only YouTube player responses; avoid modifying other sites,
   * account/OAuth responses, or arbitrary API payloads.
   */
  hookFetchResponseJson() {
    if (typeof Response === 'undefined' || !Response.prototype?.json || this._origResponseJson) return;
    const original = Response.prototype.json;
    this._origResponseJson = original;
    const self = this;

    Response.prototype.json = async function (...args) {
      const result = await original.apply(this, args);
      if (!self.options.enabled || !self.options.blockAdsInJson || !result || typeof result !== 'object') {
        return result;
      }
      try {
        const url = new URL(this.url);
        if ((url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com'
          || url.hostname === 'm.youtube.com') &&
          /^\/youtubei\/v1\/(player|browse|search|next)(?:\/|$)/.test(url.pathname)) {
          self.cleanAdData(result);
        }
      } catch (_) { /* Malformed or absent URL: never break playback. */ }
      return result;
    };
  }

  /**
   * Strips ad slots, player ads, and promotional banners from YouTube response object.
   * Based on TizenTube's proven structural cleaning approach.
   * @param {Object} obj Target JSON object
   */
  cleanAdData(obj) {
    if (!obj || typeof obj !== 'object') return;

    // Original TizenTube (mods/features/adblock.js, f99945a) targets
    // YouTube TV. It preserves ad fields with empty values instead of
    // deleting properties. Desktop YouTube has different response contracts;
    // retain the port's existing behavior there until it is E2E verified.
    const isTvPayload = Boolean(obj.contents?.tvBrowseRenderer)
      || (typeof location !== 'undefined' && /^\/tv(?:\/|$)/.test(location.pathname || ''));

    if (obj.adPlacements) {
      if (isTvPayload) obj.adPlacements = [];
      else delete obj.adPlacements;
      this.blockedCount++;
    }

    if (obj.playerAds) {
      if (isTvPayload) obj.playerAds = false;
      else delete obj.playerAds;
      this.blockedCount++;
    }

    if (obj.adSlots) {
      if (isTvPayload) obj.adSlots = [];
      else delete obj.adSlots;
      this.blockedCount++;
    }

    if (obj.adBreakHeartbeatParams) {
      delete obj.adBreakHeartbeatParams;
      this.blockedCount++;
    }

    if (obj.adBreakParams) {
      delete obj.adBreakParams;
      this.blockedCount++;
    }

    if (obj.paidContentOverlay) {
      obj.paidContentOverlay = null;
      this.blockedCount++;
    }

    // Clean playerResponse nested ad structures
    if (obj.playerResponse && typeof obj.playerResponse === 'object') {
      this.cleanAdData(obj.playerResponse);
    }

    // Clean masthead / home feed / search ad slots in browse responses
    if (obj.contents && typeof obj.contents === 'object') {
      this.cleanBrowseAds(obj.contents);
      this.cleanSearchAds(obj.contents);
    }

    // Clean continuation browse feeds
    if (obj.continuationContents && typeof obj.continuationContents === 'object') {
      this.cleanContinuationAds(obj.continuationContents);
    }

    // Remove shorts ads from feed entries
    if (Array.isArray(obj.entries)) {
      const beforeCount = obj.entries.length;
      obj.entries = obj.entries.filter(
        (elm) => !elm?.command?.reelWatchEndpoint?.adClientParams?.isAd
      );
      if (obj.entries.length < beforeCount) {
        this.blockedCount += (beforeCount - obj.entries.length);
      }
    }
  }

  /**
   * Cleans ad renderers from browse/feed responses.
   * @param {Object} contents 
   */
  cleanBrowseAds(contents) {
    if (!contents) return;

    // Desktop tabs: sectionListRenderer and modern richGridRenderer
    const tabs = contents.twoColumnBrowseResultsRenderer?.tabs;
    if (Array.isArray(tabs)) {
      for (const tab of tabs) {
        const tabContent = tab?.tabRenderer?.content;
        if (!tabContent) continue;

        // Classical section list
        if (Array.isArray(tabContent.sectionListRenderer?.contents)) {
          tabContent.sectionListRenderer.contents = this.removeSponsoredItems(tabContent.sectionListRenderer.contents);
        }

        // Modern rich grid feed (desktop YouTube homepage)
        if (Array.isArray(tabContent.richGridRenderer?.contents)) {
          tabContent.richGridRenderer.contents = this.removeSponsoredItems(tabContent.richGridRenderer.contents);
        }
      }
    }

    // Mobile / TV sectionListRenderer
    const tvSections = contents.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
    if (Array.isArray(tvSections)) {
      const filtered = this.removeSponsoredItems(tvSections);
      for (const section of filtered) {
        // Exact structural analogue of the original TV shelf ad removal.
        const tiles = section.shelfRenderer?.content?.horizontalListRenderer?.items;
        if (Array.isArray(tiles)) {
          section.shelfRenderer.content.horizontalListRenderer.items = this.removeSponsoredItems(tiles);
        }
      }
      contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents = filtered;
    }
  }

  /**
   * Cleans sponsored and promoted video ads from search results.
   * @param {Object} contents 
   */
  cleanSearchAds(contents) {
    if (!contents) return;
    const searchSections = contents.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (Array.isArray(searchSections)) {
      for (const section of searchSections) {
        if (Array.isArray(section.itemSectionRenderer?.contents)) {
          section.itemSectionRenderer.contents = this.removeSponsoredItems(section.itemSectionRenderer.contents);
        }
      }
    }
  }

  /**
   * Cleans ad renderers from dynamic continuation payloads.
   * @param {Object} continuations 
   */
  cleanContinuationAds(continuations) {
    if (!continuations) return;
    if (Array.isArray(continuations.sectionListContinuation?.contents)) {
      continuations.sectionListContinuation.contents = this.removeSponsoredItems(continuations.sectionListContinuation.contents);
    }
    if (Array.isArray(continuations.richGridContinuation?.contents)) {
      continuations.richGridContinuation.contents = this.removeSponsoredItems(continuations.richGridContinuation.contents);
    }
  }

  /** Only remove recognized advertisement renderers, not ordinary videos. */
  removeSponsoredItems(items) {
    const adKeys = [
      'adSlotRenderer', 'inFeedAdRenderer', 'displayAdRenderer',
      'promotedVideoRenderer', 'promotedSparklesWebRenderer',
      'videoMastheadAdRenderer', 'videoMastheadAdV3Renderer',
      'searchPyvRenderer'
    ];
    return items.filter(item => {
      const nested = [item, item?.richItemRenderer?.content,
        item?.richSectionRenderer?.content, item?.itemSectionRenderer?.content];
      const sponsored = nested.some(part => part && adKeys.some(key => Object.hasOwn(part, key)));
      if (sponsored) this.blockedCount++;
      return !sponsored;
    });
  }

  /**
   * Injects CSS to hide ad banners, promotions, and sidebar sponsored items.
   */
  injectCosmeticStyles() {
    if (typeof document === 'undefined') return;

    const styleId = 'tizentube-adblock-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .video-ads,
      .ytp-ad-module,
      .ytp-ad-overlay-container,
      .ytp-ad-overlay-slot,
      .ytp-ad-image-overlay,
      ytd-promoted-sparkles-web-renderer,
      ytd-promoted-video-renderer,
      ytd-display-ad-renderer,
      ytd-compact-promoted-video-renderer,
      ytd-search-pyv-renderer,
      ytd-video-masthead-ad-renderer,
      ytd-video-masthead-ad-v3-renderer,
      ytd-video-masthead-ad-primary-video-renderer,
      ytd-banner-promo-renderer,
      ytd-ad-slot-renderer,
      #player-ads,
      #masthead-ad,
      ytd-companion-slot-renderer,
      ytd-in-feed-ad-layout-renderer,
      ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
      ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer),
      ytd-rich-item-renderer:has(ytd-display-ad-renderer),
      ytd-rich-section-renderer:has(ytd-ad-slot-renderer),
      ytd-rich-section-renderer:has(ytd-video-masthead-ad-v3-renderer),
      ytd-rich-section-renderer:has(yt-promoted-card),
      ytd-rich-item-renderer:has(a[href*="/pagead/aclk"]),
      ytd-rich-item-renderer:has(a[href*="googleadservices.com"]),
      ytd-rich-section-renderer:has(a[href*="/pagead/aclk"]),
      ytd-rich-section-renderer:has(a[href*="googleadservices.com"]),
      [data-tizentube-sponsored="true"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        pointer-events: none !important;
      }
    `;

    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
    }
  }

  /** Remove the enclosing feed card, not just its inner sponsored banner. */
  scanSponsoredCards() {
    if (!this.options.enabled || !this.options.cosmeticFilter || typeof document === 'undefined') return;
    const markers = [
      'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer',
      'ytd-display-ad-renderer', 'ytd-promoted-video-renderer',
      'ytd-promoted-sparkles-web-renderer', 'ytd-video-masthead-ad-v3-renderer'
    ];
    if (typeof document.querySelectorAll !== 'function') return;
    for (const marker of document.querySelectorAll(markers.join(','))) {
      const card = marker.closest?.('ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-item-section-renderer');
      this.markSponsoredCard(card);
    }

    // A logged-in YouTube feed can render a sponsored video inside a normal
    // rich-item/section container without an ad-slot-renderer. Recognize only
    // an explicit ad badge or a known ad-click URL inside that *feed card*;
    // never search comments, titles or the entire document for ad keywords.
    for (const card of document.querySelectorAll(
      'ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-item-section-renderer, ytd-video-renderer'
    )) {
      if (card.getAttribute?.('data-tizentube-sponsored') === 'true') continue;
      const adLink = card.querySelector?.(
        'a[href*="/pagead/aclk"], a[href*="googleadservices.com"], a[href*="doubleclick.net"]'
      );
      const badges = card.querySelectorAll?.(
        '#ad-badge, #ad-badge-container, yt-badge-shape, .badge-shape, ytd-badge-supported-renderer'
      ) || [];
      const adBadge = Array.from(badges).some(badge => {
        const label = String(badge.getAttribute?.('aria-label') || badge.textContent || '')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        return /^(patrocinad[oa]s?|promocionad[oa]s?|sponsored|promoted|advertisement|publicidad|anuncio|paid promotion|ad)$/.test(label);
      });
      if (adLink || adBadge) this.markSponsoredCard(card);
    }
  }

  markSponsoredCard(card) {
    if (!card || typeof card.setAttribute !== 'function') return;
    if (card.getAttribute?.('data-tizentube-sponsored') === 'true') return;
    card.setAttribute('data-tizentube-sponsored', 'true');
    this.blockedCount++;
  }

  startSponsoredCardObserver() {
    if (this.sponsoredObserver || typeof MutationObserver === 'undefined' || !document.body) return;
    this.scanSponsoredCards();
    this.sponsoredObserver = new MutationObserver(() => {
      if (this._sponsoredScanScheduled) return;
      this._sponsoredScanScheduled = true;
      const run = () => {
        this._sponsoredScanScheduled = false;
        this.scanSponsoredCards();
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 50);
    });
    this.sponsoredObserver.observe(document.body, { childList: true, subtree: true });
  }

  stopSponsoredCardObserver() {
    this.sponsoredObserver?.disconnect();
    this.sponsoredObserver = null;
    this._sponsoredScanScheduled = false;
  }

  /**
   * Local, opt-in diagnosis of unrecognized ad DOM structures. The report
   * includes only element TAG/ID names and recognized ad badges; no cookies,
   * account names, video IDs, ad URLs, titles, comments or DOM innerHTML.
   */
  collectSponsoredDiagnostics() {
    const data = { schema: 'tizentube.adblock.dom.v1',
      timestamp: new Date().toISOString(), cards: [], badgeAncestors: [],
      counts: {} };
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return data;

    const known = ['ytd-ad-slot-renderer', 'ytd-video-masthead-ad-v3-renderer',
      'ytd-in-feed-ad-layout-renderer', '[data-tizentube-sponsored="true"]'];
    for (const selector of known) {
      data.counts[selector] = document.querySelectorAll(selector).length;
    }
    const badgePattern = /^(patrocinad[oa]s?|promocionad[oa]s?|sponsored|promoted|advertisement|publicidad|anuncio|paid promotion|ad)$/i;
    const candidates = document.querySelectorAll(
      'span, yt-formatted-string, yt-attributed-string, yt-badge-shape, yt-badge-shape-element'
    );
    for (const element of candidates) {
      if (data.badgeAncestors.length >= 12) break;
      if (element.children?.length) continue;
      const label = String(element.textContent || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (!badgePattern.test(label)) continue;
      const ancestry = [];
      let node = element;
      for (let depth = 0; depth < 9 && node; depth++, node = node.parentElement) {
        ancestry.push({ tag: String(node.tagName || '').toLowerCase().slice(0, 70),
          id: String(node.id || '').slice(0, 70) });
      }
      data.badgeAncestors.push({ badge: label.toLowerCase(), ancestry });
    }
    return data;
  }

  installDiagnosticShortcut() {
    if (typeof window === 'undefined' || this._diagnosticKeyHandler) return;
    this._diagnosticKeyHandler = e => {
      if (!e.ctrlKey || !e.shiftKey || e.code !== 'F10' || e.repeat) return;
      e.preventDefault?.();
      const payload = this.collectSponsoredDiagnostics();
      try {
        window.chrome?.webview?.postMessage({ channel: 'adblock:diagnostic', payload });
      } catch (_) { /* Keep playback working when host IPC is unavailable. */ }
      console.info('[TizenTube] Local structural ad diagnostic requested');
    };
    window.addEventListener?.('keydown', this._diagnosticKeyHandler, true);
  }

  /**
   * Removes injected cosmetic CSS.
   */
  removeCosmeticStyles() {
    if (typeof document === 'undefined') return;
    const style = document.getElementById('tizentube-adblock-styles');
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }

  /**
   * Observes player DOM for video ad elements and skips them immediately.
   * Employs requestAnimationFrame throttling to minimize CPU cycles on high-mutation feeds.
   */
  startAutoSkipObserver() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    if (this.skipObserver) return;

    const trySkip = () => {
      this._skipScheduled = false;
      if (!this.options.enabled || !this.options.autoSkipVideoAds) return;

      // 1. Detect and click skip buttons
      const skipSelectors = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        '.ytp-skip-ad-button-modern',
        '.videoAdUiSkipButton',
        'button.ytp-ad-skip-button-modern',
        'button.ytp-skip-ad-button'
      ];

      for (const sel of skipSelectors) {
        const btn = document.querySelector(sel);
        if (btn && typeof btn.click === 'function') {
          btn.click();
          this.blockedCount++;
          break;
        }
      }

      // 2. If video player is marked as showing an ad (.ad-showing), speed through it and mute
      const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
      const isAdShowing = Boolean(player && player.classList && player.classList.contains('ad-showing'));
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');

      if (isAdShowing) {
        if (video && !isNaN(video.duration) && video.duration > 0) {
          try {
            if (!this._wasAdPlaying) {
              this._preAdRate = video.playbackRate || 1.0;
              this._preAdMuted = video.muted || false;
              this._wasAdPlaying = true;
            }
            video.muted = true;
            video.playbackRate = 16.0;
            video.currentTime = video.duration;
            this.adVideoSpeedupCount++;
          } catch (_) {}
        }
      } else if (this._wasAdPlaying) {
        // Ad finished: cleanly restore user's preferred speed and mute state
        this._wasAdPlaying = false;
        if (video) {
          try {
            if (this._preAdRate !== null) video.playbackRate = this._preAdRate;
            if (this._preAdMuted !== null) video.muted = this._preAdMuted;
          } catch (_) {}
        }
        this._preAdRate = null;
        this._preAdMuted = null;
      }
    };

    this.skipObserver = new MutationObserver(() => {
      if (!this._skipScheduled) {
        this._skipScheduled = true;
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(trySkip);
        } else {
          setTimeout(trySkip, 50);
        }
      }
    });

    const target = document.body || document.documentElement;
    if (target) {
      this.skipObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  }

  /**
   * Stops auto-skip observer.
   */
  stopAutoSkipObserver() {
    if (this.skipObserver) {
      this.skipObserver.disconnect();
      this.skipObserver = null;
    }
    this._skipScheduled = false;
  }

  /**
   * Disposes adblock resources and restores global hooks.
   */
  dispose() {
    if (this._diagnosticKeyHandler && typeof window !== 'undefined') {
      window.removeEventListener?.('keydown', this._diagnosticKeyHandler, true);
      this._diagnosticKeyHandler = null;
    }
    this.stopAutoSkipObserver();
    this.stopSponsoredCardObserver();
    if (this._domReadyListener && typeof document !== 'undefined') {
      document.removeEventListener?.('DOMContentLoaded', this._domReadyListener);
      this._domReadyListener = null;
    }
    this.removeCosmeticStyles();
    if (this._origJsonParse && typeof JSON !== 'undefined') {
      JSON.parse = this._origJsonParse;
      this._origJsonParse = null;
    }
    if (this._origJsonStringify && typeof JSON !== 'undefined') {
      JSON.stringify = this._origJsonStringify;
      this._origJsonStringify = null;
    }
    if (this._origResponseJson && typeof Response !== 'undefined') {
      Response.prototype.json = this._origResponseJson;
      this._origResponseJson = null;
    }
    this.isHooked = false;
  }

  getStats() {
    return {
      enabled: this.options.enabled,
      blockedCount: this.blockedCount,
      adVideoSpeedupCount: this.adVideoSpeedupCount,
      isHooked: this.isHooked
    };
  }
}

// --- Module: src/ui/toast_notification.js ---
/**
 * TizenTube Windows - Toast Notification System
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Lightweight, accessible, non-intrusive floating toasts for events like
 * SponsorBlock segment skips, preference changes, and network notices.
 */
class ToastNotification {
  constructor(options = {}) {
    this.options = {
      defaultDurationMs: 3500,
      containerId: 'tizentube-toast-container',
      maxToasts: 3,
      ...options
    };

    this.container = null;
    this.activeToasts = new Set();
  }

  /**
   * Ensures the container DOM element exists.
   */
  ensureContainer() {
    if (typeof document === 'undefined') return null;
    if (this.container && (typeof document.body?.contains === 'function' ? document.body.contains(this.container) : Boolean(this.container.parentNode))) {
      return this.container;
    }

    let el = document.getElementById(this.options.containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = this.options.containerId;
      el.className = 'tt-toast-container';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      document.body.appendChild(el);
    }
    this.container = el;
    return this.container;
  }

  /**
   * Displays a toast notification.
   * @param {Object} toastParams
   * @param {string} toastParams.message Main message text
   * @param {string} [toastParams.title] Optional title or category
   * @param {string} [toastParams.color] Accent indicator color
   * @param {number} [toastParams.durationMs] Auto-dismiss duration
   * @param {string} [toastParams.actionLabel] Optional action button text (e.g. "Undo")
   * @param {Function} [toastParams.onAction] Action button callback
   * @returns {HTMLElement|null} The toast element
   */
  show({ message, title, color = '#3ea6ff', durationMs, actionLabel, onAction } = {}) {
    if (typeof document === 'undefined') return null;
    const container = this.ensureContainer();
    if (!container) return null;

    // Cap active toasts to prevent DOM node accumulation and memory bloat
    const max = this.options.maxToasts || 3;
    while (this.activeToasts.size >= max) {
      const oldest = this.activeToasts.values().next().value;
      if (oldest) this.dismiss(oldest, true);
      else break;
    }

    const toast = document.createElement('div');
    toast.className = 'tt-toast';
    toast.setAttribute('role', 'alert');

    // Visual color accent pill
    const accent = document.createElement('span');
    accent.className = 'tt-toast-accent';
    accent.style.backgroundColor = color;
    toast.appendChild(accent);

    const body = document.createElement('div');
    body.className = 'tt-toast-body';

    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'tt-toast-title';
      titleEl.textContent = title;
      body.appendChild(titleEl);
    }

    const msgEl = document.createElement('div');
    msgEl.className = 'tt-toast-message';
    msgEl.textContent = message || '';
    body.appendChild(msgEl);

    toast.appendChild(body);

    // Optional action button (e.g., Undo)
    if (actionLabel && typeof onAction === 'function') {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'tt-toast-action';
      actionBtn.textContent = actionLabel;
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          onAction();
        } catch (err) {
          console.error('[Toast] Action error:', err);
        }
        this.dismiss(toast);
      });
      toast.appendChild(actionBtn);
    }

    // Dismiss close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'tt-toast-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.dismiss(toast));
    toast.appendChild(closeBtn);

    container.appendChild(toast);
    this.activeToasts.add(toast);

    // Entrance animation class
    requestAnimationFrame(() => {
      toast.classList.add('tt-toast-visible');
    });

    const timeout = durationMs || this.options.defaultDurationMs;
    const timer = setTimeout(() => {
      this.dismiss(toast);
    }, timeout);

    toast._dismissTimer = timer;
    return toast;
  }

  /**
   * Dismisses a toast element with optional exit animation.
   * @param {HTMLElement} toast 
   * @param {boolean} [immediate]
   */
  dismiss(toast, immediate = false) {
    if (!toast || !this.activeToasts.has(toast)) return;
    if (toast._dismissTimer) clearTimeout(toast._dismissTimer);

    if (immediate) {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.activeToasts.delete(toast);
      return;
    }

    toast.classList.remove('tt-toast-visible');
    toast.classList.add('tt-toast-hiding');

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
      this.activeToasts.delete(toast);
    }, 250);
  }

  /**
   * Clears all active toasts.
   * @param {boolean} [immediate]
   */
  clearAll(immediate = true) {
    for (const t of [...this.activeToasts]) {
      this.dismiss(t, immediate);
    }
  }

  /**
   * Unmounts toast system and removes container element from DOM.
   */
  unmount() {
    this.clearAll(true);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
  }
}

// --- Module: src/ui/player_controls.js ---
/**
 * TizenTube Windows - Player Controls HUD
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Rich media playback interface with SponsorBlock segment timeline markers,
 * smooth scrub seeking, playback rate selector, volume slider, and responsive layout.
 */
class PlayerControls {
  constructor(options = {}) {
    this.options = {
      containerId: 'tizentube-player-hud',
      autoHideDelayMs: 3000,
      ...options
    };

    this.element = null;
    this.listeners = new Map();
    this.isDraggingSeek = false;
    this.autoHideTimer = null;
    this._lastCurTimeStr = '';
    this._lastDurStr = '';
    this._lastPct = -1;
    this._lastMarkersSig = '';
    this.state = {
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 100,
      isMuted: false,
      playbackRate: 1.0,
      isFullscreen: false,
      timelineMarkers: []
    };
  }

  /**
   * Mounts the player HUD.
   * @param {HTMLElement} [parentElement]
   */
  mount(parentElement = typeof document !== 'undefined' ? document.body : null) {
    if (!parentElement || typeof document === 'undefined') return;

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    const hud = document.createElement('div');
    hud.id = this.options.containerId;
    hud.className = 'tt-player-hud tt-hud-visible';
    hud.setAttribute('role', 'region');
    hud.setAttribute('aria-label', 'Playback Controls');

    hud.innerHTML = `
      <!-- Seekbar with SponsorBlock Markers -->
      <div class="tt-timeline-container" data-element="timelineContainer" role="slider" aria-label="Seek Video" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
        <div class="tt-timeline-track">
          <div class="tt-timeline-buffer" data-element="bufferBar"></div>
          <div class="tt-timeline-markers" data-element="markersContainer"></div>
          <div class="tt-timeline-progress" data-element="progressBar"></div>
          <div class="tt-timeline-handle" data-element="scrubberHandle"></div>
        </div>
        <div class="tt-timeline-tooltip" data-element="timeTooltip">00:00</div>
      </div>

      <!-- Controls Row -->
      <div class="tt-controls-row">
        <!-- Left: Play/Pause, Seek, Time -->
        <div class="tt-controls-left">
          <button type="button" class="tt-btn tt-play-btn" data-action="togglePlay" title="Play/Pause (Space / K)" aria-label="Play or Pause">
            <svg class="tt-icon-play" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            <svg class="tt-icon-pause" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="display:none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          </button>
          <button type="button" class="tt-btn" data-action="seekBackward" title="Rewind 10s (J / Left)" aria-label="Rewind 10 seconds">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.2 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
          </button>
          <button type="button" class="tt-btn" data-action="seekForward" title="Forward 10s (L / Right)" aria-label="Fast forward 10 seconds">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M11.5 8c2.65 0 5.05.99 6.9 2.6L22 7v9h-9l3.62-3.62c-1.39-1.2-3.16-1.88-5.12-1.88-3.54 0-6.55 2.31-7.6 5.5l-2.37-.78C2.92 11.03 6.85 8 11.5 8z"/></svg>
          </button>
          <div class="tt-time-display" data-element="timeDisplay">
            <span data-element="currentTimeText">00:00</span> / <span data-element="durationText">00:00</span>
          </div>
        </div>

        <!-- Right: Volume, Speed, Fullscreen -->
        <div class="tt-controls-right">
          <!-- Volume Group -->
          <div class="tt-volume-group">
            <button type="button" class="tt-btn tt-mute-btn" data-action="toggleMute" title="Mute/Unmute (M)" aria-label="Mute or Unmute">
              <svg class="tt-icon-vol-high" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              <svg class="tt-icon-vol-mute" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="display:none"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
            </button>
            <input type="range" class="tt-volume-slider" data-element="volumeSlider" min="0" max="100" value="100" aria-label="Volume" />
          </div>

          <!-- Playback Speed Dropdown -->
          <div class="tt-speed-dropdown">
            <button type="button" class="tt-btn tt-speed-btn" data-element="speedBtn" title="Playback Speed" aria-haspopup="true" aria-expanded="false">
              <span data-element="speedLabel">1.0x</span>
            </button>
            <div class="tt-speed-menu" data-element="speedMenu" role="menu">
              <button type="button" class="tt-speed-item" data-rate="0.5">0.5x</button>
              <button type="button" class="tt-speed-item" data-rate="0.75">0.75x</button>
              <button type="button" class="tt-speed-item tt-speed-active" data-rate="1.0">1.0x</button>
              <button type="button" class="tt-speed-item" data-rate="1.25">1.25x</button>
              <button type="button" class="tt-speed-item" data-rate="1.5">1.5x</button>
              <button type="button" class="tt-speed-item" data-rate="2.0">2.0x</button>
            </div>
          </div>

          <!-- Fullscreen -->
          <button type="button" class="tt-btn" data-action="toggleFullscreen" title="Fullscreen (F / F11)" aria-label="Fullscreen">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
          </button>
        </div>
      </div>
    `;

    this.element = hud;
    parentElement.appendChild(hud);
    this.attachEvents();
    this.resetAutoHide();
  }

  /**
   * Formats seconds into MM:SS or HH:MM:SS format.
   * @param {number} sec 
   * @returns {string}
   */
  static formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '00:00';
    const s = Math.floor(sec % 60);
    const m = Math.floor((sec / 60) % 60);
    const h = Math.floor(sec / 3600);
    const pad = (n) => String(n).padStart(2, '0');

    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  }

  /**
   * Binds interaction listeners to timeline and control buttons.
   */
  attachEvents() {
    if (!this.element) return;

    // Action clicks
    this.element.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'togglePlay') this.emit('togglePlay');
        if (action === 'seekBackward') this.emit('seekBy', -10);
        if (action === 'seekForward') this.emit('seekBy', 10);
        if (action === 'toggleMute') this.emit('toggleMute');
        if (action === 'toggleFullscreen') this.emit('toggleFullscreen');
      });
    });

    // Volume slider
    const volSlider = this.element.querySelector('[data-element="volumeSlider"]');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        const val = Number(e.target.value);
        this.emit('setVolume', val);
      });
    }

    // Speed dropdown
    const speedBtn = this.element.querySelector('[data-element="speedBtn"]');
    const speedMenu = this.element.querySelector('[data-element="speedMenu"]');
    if (speedBtn && speedMenu) {
      speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = speedMenu.classList.toggle('tt-menu-open');
        speedBtn.setAttribute('aria-expanded', String(isOpen));
      });

      speedMenu.querySelectorAll('[data-rate]').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const rate = parseFloat(item.dataset.rate);
          this.emit('setRate', rate);
          speedMenu.classList.remove('tt-menu-open');
          speedBtn.setAttribute('aria-expanded', 'false');
        });
      });

      document.addEventListener('click', () => {
        speedMenu.classList.remove('tt-menu-open');
        speedBtn.setAttribute('aria-expanded', 'false');
      });
    }

    // Timeline Scrubbing
    const timeline = this.element.querySelector('[data-element="timelineContainer"]');
    const tooltip = this.element.querySelector('[data-element="timeTooltip"]');

    if (timeline) {
      const getPos = (e) => {
        const rect = timeline.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return { ratio, targetTime: ratio * this.state.duration, clientX: clientX - rect.left };
      };

      timeline.addEventListener('mousemove', (e) => {
        if (!tooltip || !this.state.duration) return;
        const { targetTime, clientX } = getPos(e);
        tooltip.textContent = PlayerControls.formatTime(targetTime);
        tooltip.style.left = `${clientX}px`;
        tooltip.style.display = 'block';
      });

      timeline.addEventListener('mouseleave', () => {
        if (tooltip && !this.isDraggingSeek) {
          tooltip.style.display = 'none';
        }
      });

      const onSeek = (e) => {
        const { targetTime } = getPos(e);
        this.emit('seekTo', targetTime);
      };

      timeline.addEventListener('mousedown', (e) => {
        this.isDraggingSeek = true;
        onSeek(e);

        const onMouseMove = (ev) => {
          if (this.isDraggingSeek) onSeek(ev);
        };

        const onMouseUp = () => {
          this.isDraggingSeek = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          if (tooltip) tooltip.style.display = 'none';
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }

    // Auto-hide HUD on idle
    this.element.addEventListener('mousemove', () => this.resetAutoHide());
    this.element.addEventListener('click', () => this.resetAutoHide());
  }

  /**
   * Resets HUD auto-hide timer.
   */
  resetAutoHide() {
    if (!this.element) return;
    this.element.classList.add('tt-hud-visible');
    if (this.autoHideTimer) clearTimeout(this.autoHideTimer);

    if (this.state.isPlaying && !this.isDraggingSeek) {
      this.autoHideTimer = setTimeout(() => {
        if (this.state.isPlaying && !this.isDraggingSeek) {
          this.element.classList.remove('tt-hud-visible');
        }
      }, this.options.autoHideDelayMs);
    }
  }

  /**
   * Updates state and refreshes DOM elements with diff-checking to avoid layout thrashing.
   * @param {Object} partialState 
   */
  update(partialState = {}) {
    Object.assign(this.state, partialState);
    if (!this.element) return;

    // Fullscreen styling
    if (typeof partialState.isFullscreen === 'boolean') {
      this.element.classList.toggle('tt-hud-fullscreen', partialState.isFullscreen);
    }

    // 1. Play/Pause Button
    const playIcon = this.element.querySelector('.tt-icon-play');
    const pauseIcon = this.element.querySelector('.tt-icon-pause');
    if (playIcon && pauseIcon) {
      playIcon.style.display = this.state.isPlaying ? 'none' : 'block';
      pauseIcon.style.display = this.state.isPlaying ? 'block' : 'none';
    }

    // 2. Time Text (only mutate DOM when formatted string actually changes)
    const curTimeStr = PlayerControls.formatTime(this.state.currentTime);
    if (curTimeStr !== this._lastCurTimeStr) {
      this._lastCurTimeStr = curTimeStr;
      const curTimeEl = this.element.querySelector('[data-element="currentTimeText"]');
      if (curTimeEl) curTimeEl.textContent = curTimeStr;
    }
    const durStr = PlayerControls.formatTime(this.state.duration);
    if (durStr !== this._lastDurStr) {
      this._lastDurStr = durStr;
      const durEl = this.element.querySelector('[data-element="durationText"]');
      if (durEl) durEl.textContent = durStr;
    }

    // 3. Progress Bar & Scrubber Handle (debounced to avoid micro-layouts)
    if (!this.isDraggingSeek && this.state.duration > 0) {
      const pct = Math.min(100, (this.state.currentTime / this.state.duration) * 100);
      if (Math.abs(pct - this._lastPct) >= 0.05 || pct === 0 || pct === 100) {
        this._lastPct = pct;
        const pctStr = `${pct.toFixed(2)}%`;
        const progressBar = this.element.querySelector('[data-element="progressBar"]');
        const handle = this.element.querySelector('[data-element="scrubberHandle"]');
        const container = this.element.querySelector('[data-element="timelineContainer"]');

        if (progressBar) progressBar.style.width = pctStr;
        if (handle) handle.style.left = pctStr;
        if (container) container.setAttribute('aria-valuenow', String(Math.round(pct)));
      }
    }

    // 4. Volume & Mute
    const volHigh = this.element.querySelector('.tt-icon-vol-high');
    const volMute = this.element.querySelector('.tt-icon-vol-mute');
    const volSlider = this.element.querySelector('[data-element="volumeSlider"]');
    const isMuted = this.state.isMuted || this.state.volume === 0;

    if (volHigh && volMute) {
      volHigh.style.display = isMuted ? 'none' : 'block';
      volMute.style.display = isMuted ? 'block' : 'none';
    }
    if (volSlider && document.activeElement !== volSlider) {
      volSlider.value = isMuted ? '0' : String(this.state.volume);
    }

    // 5. Playback Speed
    const speedLabel = this.element.querySelector('[data-element="speedLabel"]');
    if (speedLabel) {
      speedLabel.textContent = `${this.state.playbackRate}x`;
    }
    this.element.querySelectorAll('.tt-speed-item').forEach(item => {
      const rate = parseFloat(item.dataset.rate);
      item.classList.toggle('tt-speed-active', rate === this.state.playbackRate);
    });

    // 6. SponsorBlock Markers
    if (Array.isArray(partialState.timelineMarkers)) {
      this.renderTimelineMarkers(partialState.timelineMarkers);
    }
  }

  /**
   * Renders colored SponsorBlock segment markers onto the timeline track.
   * Skips re-rendering if markers have not changed.
   * @param {Array<Object>} markers 
   */
  renderTimelineMarkers(markers = []) {
    if (!this.element) return;
    const sig = markers.map(m => `${m.startPct}-${m.widthPct}-${m.category}`).join('|');
    if (sig === this._lastMarkersSig) return;
    this._lastMarkersSig = sig;

    const container = this.element.querySelector('[data-element="markersContainer"]');
    if (!container) return;

    container.innerHTML = '';
    for (const marker of markers) {
      const el = document.createElement('div');
      el.className = 'tt-segment-marker';
      el.style.left = `${marker.startPct}%`;
      el.style.width = `${marker.widthPct}%`;
      el.style.backgroundColor = marker.color || '#00d400';
      el.title = `${marker.categoryName || marker.category} (${PlayerControls.formatTime(marker.start)} - ${PlayerControls.formatTime(marker.end)})`;
      container.appendChild(el);
    }
  }

  /**
   * Unmounts HUD from DOM, disposes timers, and cleans up references.
   */
  unmount() {
    if (this.autoHideTimer) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.listeners.clear();
  }

  /**
   * Event emitter registration.
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const h of handlers) {
      try {
        h(data);
      } catch (err) {
        console.error(`[PlayerControls] Error in ${event} handler:`, err);
      }
    }
  }
}

// --- Module: src/ui/navigation_bar.js ---
/**
 * TizenTube Windows - Top Navigation Bar Component
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Provides clean in-app browsing controls, quick YouTube search,
 * mod status badges (AdBlock, SponsorBlock), settings trigger, and fullscreen toggle.
 */
class NavigationBar {
  constructor(options = {}) {
    this.options = {
      containerId: 'tizentube-nav-bar',
      autoHide: false,
      startUrl: 'https://www.youtube.com',
      ...options
    };

    this.element = null;
    this.listeners = new Map();
    this.stats = {
      adblockCount: 0,
      sponsorblockCount: 0
    };
  }

  /**
   * Mounts the navigation bar into the DOM.
   * @param {HTMLElement} [parentElement]
   */
  mount(parentElement = typeof document !== 'undefined' ? document.body : null) {
    if (!parentElement || typeof document === 'undefined') return;

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    const nav = document.createElement('header');
    nav.id = this.options.containerId;
    nav.className = 'tt-nav-bar' + (this.options.autoHide ? ' tt-nav-autohide' : '');
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main Navigation');

    nav.innerHTML = `
      <div class="tt-nav-left">
        <button type="button" class="tt-btn tt-nav-btn" data-action="back" title="Back (Alt+Left)" aria-label="Go Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <button type="button" class="tt-btn tt-nav-btn" data-action="forward" title="Forward (Alt+Right)" aria-label="Go Forward">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
        </button>
        <button type="button" class="tt-btn tt-nav-btn" data-action="reload" title="Reload (F5 / Ctrl+R)" aria-label="Reload Page">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
        </button>
        <button type="button" class="tt-btn tt-nav-btn" data-action="home" title="Home" aria-label="YouTube Home">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        </button>
      </div>

      <div class="tt-nav-center">
        <form class="tt-search-form" data-element="searchForm" role="search">
          <div class="tt-search-wrapper">
            <svg class="tt-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input type="text" class="tt-search-input" data-element="searchInput" placeholder="Search YouTube or enter URL..." aria-label="Search YouTube or enter URL" spellcheck="false" autocomplete="off" />
            <button type="button" class="tt-search-clear" data-element="clearBtn" title="Clear input" aria-label="Clear Search">&times;</button>
          </div>
          <button type="submit" class="tt-btn tt-search-submit" title="Search" aria-label="Submit Search">Search</button>
        </form>
      </div>

      <div class="tt-nav-right">
        <div class="tt-status-badge tt-badge-adblock" title="AdBlock active: 0 ads suppressed" data-badge="adblock">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#3ea6ff"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
          <span class="tt-badge-text" data-element="adblockCount">0</span>
        </div>
        <div class="tt-status-badge tt-badge-sponsorblock" title="SponsorBlock active: 0 segments skipped" data-badge="sponsorblock">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="#00d400"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
          <span class="tt-badge-text" data-element="sponsorblockCount">0</span>
        </div>
        <button type="button" class="tt-btn tt-nav-btn" data-action="settings" title="Settings (S)" aria-label="TizenTube Settings">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </button>
        <button type="button" class="tt-btn tt-nav-btn" data-action="fullscreen" title="Toggle Fullscreen (F11)" aria-label="Toggle Fullscreen">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        </button>
      </div>
    `;

    this.element = nav;
    parentElement.prepend(nav);
    this.attachEvents();
  }

  /**
   * Binds interaction listeners to elements.
   */
  attachEvents() {
    if (!this.element) return;

    // Action buttons
    this.element.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this.emit(action);
      });
    });

    // Search form
    const form = this.element.querySelector('[data-element="searchForm"]');
    const input = this.element.querySelector('[data-element="searchInput"]');
    const clearBtn = this.element.querySelector('[data-element="clearBtn"]');

    if (form && input) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = input.value.trim();
        if (query) {
          this.emit('search', query);
        }
      });

      input.addEventListener('input', () => {
        if (clearBtn) {
          clearBtn.style.display = input.value ? 'block' : 'none';
        }
      });

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          input.value = '';
          input.focus();
          clearBtn.style.display = 'none';
        });
      }
    }
  }

  /**
   * Sets URL / search field text.
   * @param {string} url 
   */
  setUrl(url) {
    if (!this.element) return;
    const input = this.element.querySelector('[data-element="searchInput"]');
    if (input && document.activeElement !== input) {
      input.value = url || '';
    }
  }

  /**
   * Focuses search input.
   */
  focusSearch() {
    if (!this.element) return;
    const input = this.element.querySelector('[data-element="searchInput"]');
    if (input) {
      input.focus();
      input.select();
    }
  }

  /**
   * Updates mod statistics display in badges.
   */
  updateStats({ adblockCount, sponsorblockCount } = {}) {
    if (typeof adblockCount === 'number') {
      this.stats.adblockCount = adblockCount;
      const el = this.element?.querySelector('[data-element="adblockCount"]');
      if (el) el.textContent = String(adblockCount);
    }

    if (typeof sponsorblockCount === 'number') {
      this.stats.sponsorblockCount = sponsorblockCount;
      const el = this.element?.querySelector('[data-element="sponsorblockCount"]');
      if (el) el.textContent = String(sponsorblockCount);
    }
  }

  /**
   * Unmounts the navigation bar from the DOM and clears listeners.
   */
  unmount() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.listeners.clear();
  }

  /**
   * Sets fullscreen visual state on navigation bar.
   * In fullscreen, top bar is smoothly hidden out of view to avoid obstructing video.
   * @param {boolean} isFullscreen
   */
  setFullscreen(isFullscreen) {
    if (!this.element) return;
    this.element.classList.toggle('tt-nav-fullscreen-hidden', Boolean(isFullscreen));
  }

  /**
   * Event emitter registration.
   */
  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const h of handlers) {
      try {
        h(data);
      } catch (err) {
        console.error(`[NavBar] Error in ${event} handler:`, err);
      }
    }
  }
}

// --- Module: src/ui/settings_modal.js ---
/**
 * TizenTube Windows - Settings & Preferences Modal
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Accessible configuration modal for toggling and customizing AdBlock,
 * SponsorBlock categories, DeArrow clickbait filters, and playback preferences.
 */
class SettingsModal {
  constructor(options = {}) {
    this.options = {
      containerId: 'tizentube-settings-modal',
      ...options
    };

    this.element = null;
    this.listeners = new Map();
    this.isOpen = false;
    this.settings = {
      adblock: {
        enabled: true,
        blockAdsInJson: true,
        cosmeticFilter: true,
        autoSkipVideoAds: true
      },
      sponsorblock: {
        enabled: true,
        autoSkip: true,
        showNotice: true,
        categories: ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction']
      },
      dearrow: {
        enabled: true,
        replaceTitles: true,
        replaceThumbnails: true
      },
      playback: {
        defaultSpeed: 1.0,
        defaultVolume: 100,
        rememberPreferences: true
      },
      ui: {
        autoHideNav: false,
        compactHud: false,
        highContrast: false
      }
    };
  }

  /**
   * Mounts the modal into the DOM.
   * @param {HTMLElement} [parentElement]
   */
  mount(parentElement = typeof document !== 'undefined' ? document.body : null) {
    if (!parentElement || typeof document === 'undefined') return;

    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }

    const backdrop = document.createElement('div');
    backdrop.id = this.options.containerId;
    backdrop.className = 'tt-modal-backdrop';
    backdrop.style.display = 'none';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'tt-settings-title');

    backdrop.innerHTML = `
      <div class="tt-modal-dialog">
        <div class="tt-modal-header">
          <div class="tt-modal-title" id="tt-settings-title">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="#3ea6ff"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            <h2>TizenTube Preferences</h2>
          </div>
          <button type="button" class="tt-modal-close" data-action="close" aria-label="Close Settings">&times;</button>
        </div>

        <div class="tt-modal-body">
          <!-- Section 1: AdBlock -->
          <fieldset class="tt-settings-section">
            <legend class="tt-section-title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#3ea6ff"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
              <span>Ad Blocking & Suppression</span>
            </legend>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Enable AdBlock</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="adblock.enabled" checked />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Filter Ad Payloads in API Responses</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="adblock.blockAdsInJson" checked />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Cosmetic Banner & Promotion Hiding</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="adblock.cosmeticFilter" checked />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Auto-Skip Video Ads</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="adblock.autoSkipVideoAds" checked />
              <span class="tt-toggle-switch"></span>
            </label>
          </fieldset>

          <!-- Section 2: SponsorBlock -->
          <fieldset class="tt-settings-section">
            <legend class="tt-section-title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#00d400"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>
              <span>SponsorBlock Segment Skips</span>
            </legend>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Enable SponsorBlock</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="sponsorblock.enabled" checked />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Automatically Skip Segments</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="sponsorblock.autoSkip" checked />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Show Toast Notice on Skip</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="sponsorblock.showNotice" checked />
              <span class="tt-toggle-switch"></span>
            </label>

            <div class="tt-categories-header">Active Skip Categories:</div>
            <div class="tt-categories-grid" data-element="categoriesGrid">
              <!-- Dynamically populated with category toggles -->
            </div>
          </fieldset>

          <!-- Section 3: DeArrow -->
          <fieldset class="tt-settings-section">
            <legend class="tt-section-title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#ff9900"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-10-7h9v6h-9z"/></svg>
              <span>DeArrow (Anti-Clickbait)</span>
            </legend>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Enable DeArrow</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="dearrow.enabled" checked />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Replace Clickbait Titles with Factual Titles</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="dearrow.replaceTitles" checked />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Replace Sensationalist Thumbnails</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="dearrow.replaceThumbnails" checked />
              <span class="tt-toggle-switch"></span>
            </label>
          </fieldset>

          <!-- Section 4: Playback Preferences -->
          <fieldset class="tt-settings-section">
            <legend class="tt-section-title">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#f1f1f1"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
              <span>Playback & Interface</span>
            </legend>
            <div class="tt-select-row">
              <span class="tt-label-text">Default Playback Speed</span>
              <select class="tt-select" data-bind="playback.defaultSpeed">
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1.0" selected>1.0x (Normal)</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
                <option value="2.0">2.0x</option>
              </select>
            </div>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Persist Volume & Speed Between Sessions</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="playback.rememberPreferences" checked />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Auto-Hide Top Navigation Bar</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="ui.autoHideNav" />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">Compact Player HUD (Minimal Screen Footprint)</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="ui.compactHud" />
              <span class="tt-toggle-switch"></span>
            </label>
            <label class="tt-toggle-row">
              <span class="tt-label-text">High Contrast UI Elements</span>
              <input type="checkbox" class="tt-toggle-checkbox" data-bind="ui.highContrast" />
              <span class="tt-toggle-switch"></span>
            </label>
          </fieldset>
        </div>

        <div class="tt-modal-footer">
          <button type="button" class="tt-btn tt-btn-secondary" data-action="reset">Reset Defaults</button>
          <button type="button" class="tt-btn tt-btn-primary" data-action="save">Save & Close</button>
        </div>
      </div>
    `;

    this.element = backdrop;
    parentElement.appendChild(backdrop);
    this.populateCategories();
    this.attachEvents();
  }

  /**
   * Populates SponsorBlock category checkboxes with their distinct color pills.
   */
  populateCategories() {
    if (!this.element) return;
    const grid = this.element.querySelector('[data-element="categoriesGrid"]');
    if (!grid) return;

    grid.innerHTML = '';
    for (const [key, info] of Object.entries(SPONSORBLOCK_CATEGORIES)) {
      const isChecked = this.settings.sponsorblock.categories.includes(key);
      const label = document.createElement('label');
      label.className = 'tt-category-item';

      label.innerHTML = `
        <input type="checkbox" value="${key}" ${isChecked ? 'checked' : ''} class="tt-cat-checkbox" />
        <span class="tt-cat-color" style="background-color: ${info.color}"></span>
        <span class="tt-cat-name">${info.name}</span>
      `;

      label.querySelector('input').addEventListener('change', () => {
        const checkedList = Array.from(grid.querySelectorAll('input:checked')).map(el => el.value);
        this.settings.sponsorblock.categories = checkedList;
      });

      grid.appendChild(label);
    }
  }

  /**
   * Binds modal events.
   */
  attachEvents() {
    if (!this.element) return;

    // Close actions
    this.element.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', () => this.close());
    });

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });

    // Save button
    const saveBtn = this.element.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.readInputs();
        this.emit('change', this.getSettings());
        this.close();
      });
    }

    // Reset button
    const resetBtn = this.element.querySelector('[data-action="reset"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetDefaults();
      });
    }

    // Keyboard ESC
    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
  }

  /**
   * Reads state from bound inputs.
   */
  readInputs() {
    if (!this.element) return;

    this.element.querySelectorAll('[data-bind]').forEach(input => {
      const path = input.dataset.bind.split('.');
      let target = this.settings;
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]];
      }
      const prop = path[path.length - 1];

      if (input.type === 'checkbox') {
        target[prop] = input.checked;
      } else if (input.tagName === 'SELECT') {
        target[prop] = parseFloat(input.value) || input.value;
      }
    });
  }

  /**
   * Updates inputs to reflect this.settings.
   */
  syncInputs() {
    if (!this.element) return;

    this.element.querySelectorAll('[data-bind]').forEach(input => {
      const path = input.dataset.bind.split('.');
      let val = this.settings;
      for (const p of path) {
        val = val?.[p];
      }

      if (input.type === 'checkbox') {
        input.checked = Boolean(val);
      } else if (input.tagName === 'SELECT') {
        input.value = String(val);
      }
    });

    this.populateCategories();
  }

  /**
   * Resets settings to factory defaults.
   */
  resetDefaults() {
    this.settings = {
      adblock: {
        enabled: true,
        blockAdsInJson: true,
        cosmeticFilter: true,
        autoSkipVideoAds: true
      },
      sponsorblock: {
        enabled: true,
        autoSkip: true,
        showNotice: true,
        categories: ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction']
      },
      dearrow: {
        enabled: true,
        replaceTitles: true,
        replaceThumbnails: true
      },
      playback: {
        defaultSpeed: 1.0,
        defaultVolume: 100,
        rememberPreferences: true
      },
      ui: {
        autoHideNav: false,
        compactHud: false,
        highContrast: false
      }
    };
    this.syncInputs();
    this.emit('change', this.getSettings());
  }

  /**
   * Opens the settings modal.
   */
  open() {
    if (!this.element) return;
    this.syncInputs();
    this.element.style.display = 'flex';
    this.isOpen = true;
    requestAnimationFrame(() => {
      this.element.classList.add('tt-modal-open');
    });
    this.emit('open');
  }

  /**
   * Closes the settings modal.
   */
  close() {
    if (!this.element) return;
    this.element.classList.remove('tt-modal-open');
    setTimeout(() => {
      if (this.element) this.element.style.display = 'none';
      this.isOpen = false;
      this.emit('close');
    }, 200);
  }

  /**
   * Loads initial settings.
   * @param {Object} newSettings 
   */
  loadSettings(newSettings = {}) {
    if (!newSettings) return;
    if (newSettings.adblock) Object.assign(this.settings.adblock, newSettings.adblock);
    if (newSettings.sponsorblock) Object.assign(this.settings.sponsorblock, newSettings.sponsorblock);
    if (newSettings.dearrow) Object.assign(this.settings.dearrow, newSettings.dearrow);
    if (newSettings.playback) Object.assign(this.settings.playback, newSettings.playback);
    if (newSettings.ui) Object.assign(this.settings.ui, newSettings.ui);
    this.syncInputs();
  }

  getSettings() {
    return JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * Serializes current preferences to JSON.
   * @returns {string}
   */
  exportSettings() {
    return JSON.stringify(this.settings, null, 2);
  }

  /**
   * Imports preferences from JSON string.
   * @param {string} jsonString 
   * @returns {boolean}
   */
  importSettings(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && typeof parsed === 'object') {
        this.loadSettings(parsed);
        this.emit('change', this.getSettings());
        return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Unmounts modal backdrop from DOM and clears listeners.
   */
  unmount() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.listeners.clear();
    this.isOpen = false;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const h of handlers) {
      try {
        h(data);
      } catch (err) {
        console.error(`[SettingsModal] Error in ${event} handler:`, err);
      }
    }
  }
}

// --- Module: src/ui/app_ui.js ---
/**
 * TizenTube Windows - App UI Orchestrator
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Seamlessly integrates NavigationBar, PlayerControls HUD, SettingsModal,
 * ToastNotifications, and CSS injection, connecting them with PlaybackEngine,
 * AdBlockBase, SponsorBlockBase, DeArrowBase, and NavigationManager.
 */
class AppUI {
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
          const skipTarget = this.sponsorblock.checkSkip(currentTime);
          if (skipTarget !== null) {
            this.handleSponsorBlockSkip(this.sponsorblock.lastSkipped || { targetTime: skipTarget });
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
    if (typeof localStorage !== 'undefined') {
      try {
        const data = localStorage.getItem('tizentube_settings');
        if (data) {
          parsed = JSON.parse(data);
        }
      } catch (_) {}
    }

    if (!parsed && typeof window !== 'undefined' && window.__TIZENTUBE_INITIAL_PREFERENCES__) {
      try {
        const init = window.__TIZENTUBE_INITIAL_PREFERENCES__;
        const raw = typeof init === 'string' ? JSON.parse(init) : init;
        parsed = (raw && raw.payload) ? raw.payload : raw;
      } catch (_) {}
    }

    if (parsed) {
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

// --- Module: src/mods/mod_loader.js ---
/**
 * TizenTube Windows - Mod Loader & Coordination Runtime
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Injected prior to document execution via CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync.
 * Instantiates and coordinates AdBlock, SponsorBlock, DeArrow, Playback Engine, App UI, and IPC Bridge.
 */
class ModLoader {
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
    this._mountRetryTimer = null;
    this._mountAttempts = 0;
    this._mountEventHandler = null;
    this._viewingMountReported = false;
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

    // 3. Mount the native playback experience INDEPENDENTLY of custom UI.
    // WebView2 document-start injection sometimes precedes body but misses a
    // DOMContentLoaded event during YouTube navigation. Worse, any exception
    // in AppUI.mount used to prevent ViewingExperience.mount entirely: PiP
    // button disappears and theater preference is never tracked.
    const mountIfReady = () => {
      if (typeof document === 'undefined' || !document.body) return false;
      try {
        if (!this.viewing.mounted) this.viewing.mount();
        if (this.viewing.mounted && !this._viewingMountReported) {
          this._viewingMountReported = true;
          this.ipc.send('viewing:mounted', { enabled: true });
        }
      } catch (err) {
        console.warn('[TizenTube] ViewingExperience mount retry:', String(err));
      }
      try {
        if (!this.ui.isMounted) this.ui.mount(document.body);
      } catch (err) {
        console.warn('[TizenTube] Optional UI mount retry:', String(err));
      }
      return Boolean(this.viewing.mounted && this.ui.isMounted);
    };
    const retryMount = () => {
      this._mountRetryTimer = null;
      if (mountIfReady() || this._mountAttempts++ >= 40) return;
      this._mountRetryTimer = setTimeout(retryMount, 400);
      this._mountRetryTimer?.unref?.();
    };
    this._mountEventHandler = mountIfReady;
    if (typeof window !== 'undefined') {
      window.addEventListener('DOMContentLoaded', mountIfReady, { once: true });
      window.addEventListener('load', mountIfReady, { once: true });
    }
    retryMount();

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
    if (this._mountRetryTimer) clearTimeout(this._mountRetryTimer);
    if (this._mountEventHandler && typeof window !== 'undefined') {
      window.removeEventListener?.('DOMContentLoaded', this._mountEventHandler);
      window.removeEventListener?.('load', this._mountEventHandler);
    }
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
