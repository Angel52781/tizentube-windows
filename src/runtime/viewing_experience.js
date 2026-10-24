/**
 * TizenTube Windows - Native player experience and local continuity.
 * GPL-3.0-only. No account tokens, history API calls or additional WebViews.
 */
export class ViewingExperience {
  constructor(playback, options = {}) {
    this.playback = playback;
    this.options = { restoreOnLaunch: true, ...options };
    this.theaterKey = 'tizentube.theater.v1';
    this.lastKey = 'tizentube.lastVideo.v1';
    this.lastSavedAt = 0;
    this.lastVideo = null;
    this.theaterObserver = null;
    this.theaterElement = null;
    this.pipButton = null;
    this._boundFloatingKey = e => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyP' && !e.repeat) {
        e.preventDefault?.();
        this.togglePictureInPicture();
      }
    };
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
      const value = this.getStorage()?.getItem(this.theaterKey);
      return value === 'true' ? true : value === 'false' ? false : null;
    } catch (_) { return null; }
  }

  setTheaterPreference(value) {
    try { this.getStorage()?.setItem(this.theaterKey, String(Boolean(value))); }
    catch (_) {}
  }

  syncTheaterMode() {
    if (typeof document === 'undefined' || !this.getVideoId()) return false;
    const flexy = document.querySelector?.('ytd-watch-flexy');
    const theaterButton = document.querySelector?.('.ytp-size-button');
    if (!flexy || !theaterButton) return false;
    if (this.theaterElement !== flexy) {
      this.theaterObserver?.disconnect();
      this.theaterElement = flexy;
      if (typeof MutationObserver !== 'undefined') {
        this.theaterObserver = new MutationObserver(() => {
          if (!this.saveTheaterSuppressed && !this.isNavigating)
            this.setTheaterPreference(flexy.hasAttribute('theater'));
        });
        this.theaterObserver.observe(flexy, { attributes: true, attributeFilter: ['theater'] });
      }
    }
    const saved = this.savedTheaterState();
    if (saved === null) return true;
    const current = flexy.hasAttribute('theater');
    if (saved !== current) {
      this.saveTheaterSuppressed = true;
      try { theaterButton.click(); } finally {
        // Attribute changes can arrive via the next mutation microtask.
        queueMicrotask(() => { this.saveTheaterSuppressed = false; });
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
    if (existing) { this.pipButton = existing; return true; }
    const button = document.createElement('button');
    button.id = 'tizentube-native-pip';
    button.type = 'button';
    button.className = 'ytp-button';
    button.title = 'Reproductor flotante · Ctrl+Mayús+P';
    button.setAttribute('aria-label', 'Imagen en imagen');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<svg viewBox="0 0 36 36" width="34" height="34" aria-hidden="true">' +
      '<rect x="4" y="6" width="28" height="23" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<rect x="17" y="17" width="12" height="9" rx="1" fill="currentColor"/></svg>';
    button.addEventListener('click', e => {
      e.stopPropagation();
      if (!this.togglePictureInPicture()) button.title = 'Abre un vídeo para usar el reproductor flotante';
    });
    const settings = controls.querySelector?.('.ytp-settings-button');
    controls.insertBefore(button, settings || null);
    this.pipButton = button;
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
    window.addEventListener('keydown', this._boundFloatingKey);
    document?.addEventListener?.('visibilitychange', this._boundVisibility);
    this.playback?.on('timeupdate', this._boundTime);
    this.playback?.on('ready', this._boundReady);
    this.onNavigation();
  }

  dispose() {
    this.flushProgress();
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.theaterObserver?.disconnect();
    this.pipButton?.remove?.();
    if (typeof window !== 'undefined') {
      window.removeEventListener('yt-navigate-finish', this._boundNav);
      window.removeEventListener('yt-navigate-start', this._boundNavStart);
      window.removeEventListener('popstate', this._boundNav);
      window.removeEventListener('pagehide', this._boundVisibility);
      window.removeEventListener('keydown', this._boundFloatingKey);
    }
    if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', this._boundVisibility);
    this.playback?.off?.('timeupdate', this._boundTime);
    this.playback?.off?.('ready', this._boundReady);
  }
}
