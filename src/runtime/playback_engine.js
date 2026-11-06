/**
 * TizenTube Windows - Base YouTube Playback Engine
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Provides robust HTML5 media control, keyboard navigation,
 * custom shortcuts, fullscreen management, and persistent preferences.
 */

export class PlaybackEngine {
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
      // Do not auto-persist transient playback rate changes (e.g. YouTube
      // long-press 2x speedup or transient ad skips). Preferences are saved
      // when setPlaybackRate() is explicitly invoked.
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
    if (this.state.playbackRate !== 1.0 && this.state.playbackRate <= 2.0) {
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
    if (!this.videoElement || (typeof document !== 'undefined' && this.videoElement.isConnected === false)) {
      if (typeof document !== 'undefined') {
        const video = document.querySelector?.('video.html5-main-video') || document.querySelector?.('video');
        if (video) this.bindVideoElement(video);
      }
    }
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
    if (!this.videoElement || (typeof document !== 'undefined' && this.videoElement.isConnected === false)) {
      if (typeof document !== 'undefined') {
        const video = document.querySelector?.('video.html5-main-video') || document.querySelector?.('video');
        if (video) this.bindVideoElement(video);
      }
    }
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
    if (!this.videoElement || (typeof document !== 'undefined' && this.videoElement.isConnected === false)) {
      if (typeof document !== 'undefined') {
        const video = document.querySelector?.('video.html5-main-video') || document.querySelector?.('video');
        if (video) this.bindVideoElement(video);
      }
    }
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

    // Reinjection defense: unregister lingering handler from previous instance on this window
    if (window.__tt_playback_keydown__) {
      try {
        window.removeEventListener('keydown', window.__tt_playback_keydown__, true);
      } catch (_) {}
    }

    this._onKeyDown = (e) => {
      // Do not steal IME composition or system / browser combinations
      if (e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.target;
      const tag = target?.tagName?.toLowerCase?.() || '';

      // Text entry fields and menus must never be intercepted (search bar, comments, text inputs, settings menus)
      if (target?.isContentEditable ||
          ['input', 'textarea', 'select'].includes(tag) ||
          target?.closest?.('[contenteditable], [role="textbox"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="menu"], .ytp-menuitem, .ytp-panel-menu')) {
        return;
      }

      // Modal dialogs (e.g. SettingsModal): user is configuring settings, not controlling playback
      if (target?.closest?.('[role="dialog"], .tt-modal, #tizentube-settings-modal')) {
        return;
      }

      // Check whether target belongs to the video player or player controls
      const isPlayerTarget = !target || ['body', 'video'].includes(tag) ||
        Boolean(target?.closest?.('#movie_player, .html5-video-player, video, .tt-player-controls, .tt-btn, .ytp-button')) ||
        Boolean(target?.classList?.contains?.('ytp-button') || target?.classList?.contains?.('tt-btn')) ||
        Boolean(typeof target?.className === 'string' && target.className.includes('ytp-'));

      // Check whether target is an interactive button or link control
      const isInteractiveButton = Boolean(
        ['button', 'a'].includes(tag) ||
        target?.closest?.('button, [role="button"], a, [role="link"]')
      );

      const key = e.code === 'Space' ? ' ' : e.key;

      // Native YouTube owns C (captions), T (theater) and I (miniplayer).
      // ViewingExperience observes the *trusted* T key to persist theater
      // choice. Consuming these at window capture would break that contract.
      if (typeof key === 'string' && ['c', 't', 'i'].includes(key.toLowerCase())) return;

      // Authority of Focus for Space:
      // If focus is on an interactive button or link (whether player buttons like play/mute/settings,
      // external buttons like subscribe, or TizenTube buttons), Space must NOT be intercepted here.
      // The browser natively handles Space on keydown and fires 'click' on keyup for the focused button,
      // activating that button exactly once. For example:
      // - Focused play button toggles playback via its click handler without duplicate keydown toggle.
      // - Focused mute button toggles mute (does NOT toggle playback).
      // - Focused subscribe button toggles subscription (does NOT toggle playback).
      if (isInteractiveButton && (key === ' ' || key === 'Spacebar')) {
        return;
      }

      // Unrelated external interactive controls outside player (e.g. subscribe button, links):
      // K is the dedicated YouTube hotkey for play/pause and applies globally (except text fields/dialogs).
      // Navigation keys (arrows, Tab, Space) on external controls belong to native UI.
      if (!isPlayerTarget && isInteractiveButton) {
        if (!['k', 'K'].includes(key)) {
          return;
        }
      }

      // YouTube also handles these keys. Capture *before* its document/player
      // handlers; preventDefault alone at window bubble phase is too late
      // and causes a 5s seek followed by another 5s seek (visible as 10s).
      const claim = () => {
        e.preventDefault();
        e.stopImmediatePropagation?.();
      };

      // Percent jumps (0-9)
      if (key >= '0' && key <= '9') {
        claim();
        const percent = parseInt(key, 10) * 10;
        const targetTime = (this.state.duration || 0) * (percent / 100);
        this.seekTo(targetTime);
        return;
      }

      switch (key) {
        case ' ':
        case 'Spacebar':
          // Focused on progress bar, video element, #movie_player or body:
          // Claim event so YouTube bubble listeners don't double-toggle,
          // and filter e.repeat so holding Space does not oscillate.
          claim();
          if (!e.repeat) this.togglePlay();
          break;
        case 'k':
        case 'K':
          // Universal play/pause hotkey: claims event, filters e.repeat
          claim();
          if (!e.repeat) this.togglePlay();
          break;
        case 'j':
        case 'J':
          claim();
          this.seekBy(-10);
          break;
        case 'l':
        case 'L':
          claim();
          this.seekBy(10);
          break;
        case 'ArrowLeft':
          if (target?.closest?.('.ytp-volume-slider')) {
            claim();
            this.adjustVolume(-5);
          } else {
            claim();
            this.seekBy(-5);
          }
          break;
        case 'ArrowRight':
          if (target?.closest?.('.ytp-volume-slider')) {
            claim();
            this.adjustVolume(5);
          } else {
            claim();
            this.seekBy(5);
          }
          break;
        case 'Home':
          claim();
          this.seekTo(0);
          break;
        case 'End':
          claim();
          this.seekTo(this.state.duration || 0);
          break;
        case 'ArrowUp':
          claim();
          this.adjustVolume(5);
          break;
        case 'ArrowDown':
          claim();
          this.adjustVolume(-5);
          break;
        case 'm':
        case 'M':
          claim();
          this.toggleMute();
          break;
        case 'f':
        case 'F':
        case 'F11':
          claim();
          this.toggleFullscreen();
          break;
        case 'Escape':
          if (this.state.isFullscreen || (typeof document !== 'undefined' && Boolean(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
          ))) {
            claim();
            this.exitFullscreen();
          }
          break;
        case '>':
        case '.':
          if (e.shiftKey || key === '>') {
            claim();
            this.setPlaybackRate(this.state.playbackRate + 0.25);
          } else {
            // Frame-step forward only when video is paused (standard YouTube)
            const isPaused = this.videoElement ? this.videoElement.paused : !this.state.isPlaying;
            if (isPaused) {
              claim();
              this.seekBy(1 / 30);
            }
          }
          break;
        case '<':
        case ',':
          if (e.shiftKey || key === '<') {
            claim();
            this.setPlaybackRate(this.state.playbackRate - 0.25);
          } else {
            // Frame-step backward only when video is paused (standard YouTube)
            const isPaused = this.videoElement ? this.videoElement.paused : !this.state.isPlaying;
            if (isPaused) {
              claim();
              this.seekBy(-1 / 30);
            }
          }
          break;
      }
    };

    window.__tt_playback_keydown__ = this._onKeyDown;
    window.addEventListener('keydown', this._onKeyDown, true);
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
          // Playback speed preferences must be in standard range (0.25 to 2.0).
          // If a speed > 2.0 was saved (e.g. ad skip speedup leftover from older previews),
          // sanitize back to default 1.0.
          if (parsed.playbackRate > 2.0 || parsed.playbackRate < 0.25) {
            this.state.playbackRate = 1.0;
          } else {
            this.state.playbackRate = parsed.playbackRate;
          }
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
      window.removeEventListener('keydown', this._onKeyDown, true);
      if (window.__tt_playback_keydown__ === this._onKeyDown) {
        delete window.__tt_playback_keydown__;
      }
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
