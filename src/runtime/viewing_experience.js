/**
 * TizenTube Windows - Native player experience and local continuity.
 * GPL-3.0-only. No account tokens, history API calls or additional WebViews.
 */
export class ViewingExperience {
  constructor(playback, options = {}) {
    this.playback = playback;
    // User-selected continuity: re-open the last unfinished video at its
    // last saved timestamp. The session guard prevents redirects on Home.
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
    if (!force && now - this.lastSavedAt < 2000) return;
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
      if (typeof window !== 'undefined' && window.chrome?.webview?.postMessage) {
        window.chrome.webview.postMessage({
          channel: 'viewing:last-video',
          id: state.id,
          position: state.position,
          duration: state.duration,
          updatedAt: state.updatedAt
        });
      }
    } catch (_) { /* Quota/privacy mode: fail without blocking playback */ }
  }

  flushProgress() { this.persistProgress(true); }

  clearCompletedVideo() {
    const old = this.readLastVideo();
    if (old && old.id === this.getVideoId()) {
      try {
        this.getStorage()?.removeItem(this.lastKey);
        if (typeof window !== 'undefined' && window.chrome?.webview?.postMessage) {
          window.chrome.webview.postMessage({ channel: 'viewing:clear-last-video' });
        }
      } catch (_) {}
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
        const interval = this.nativeTheaterRestoreAttempts === 0 ? 0 : 2500;
        if (this.nativeTheaterRestoreAttempts < 5 &&
            now - this.lastNativeTheaterRestoreAt >= interval) {
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
    // Actual YouTube DOM: right-controls > .ytp-right-controls-left >
    // [CC, settings]. Inserting into right-controls put our button BEFORE
    // the entire wrapper instead of BETWEEN CC and settings (physical E2E).
    const settings = controls.querySelector?.('.ytp-settings-button');
    const captions = controls.querySelector?.('.ytp-subtitles-button');
    const destination = settings?.parentElement || captions?.parentElement || controls;
    const beforeSettings = settings?.parentElement === destination ? settings : null;
    const existing = document.getElementById?.('tizentube-native-pip');
    if (existing && existing.parentNode === destination) {
      if (beforeSettings && existing.nextSibling !== beforeSettings)
        destination.insertBefore(existing, beforeSettings);
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
    if (beforeSettings) destination.insertBefore(button, beforeSettings);
    else if (captions?.nextSibling && captions.parentElement === destination)
      destination.insertBefore(button, captions.nextSibling);
    else destination.appendChild?.(button);
    this.pipButton = button;
    if (this.pipControls !== destination) {
      this.pipControlsObserver?.disconnect();
      this.pipControls = destination;
      if (typeof MutationObserver !== 'undefined') {
        this.pipControlsObserver = new MutationObserver(() => {
          if (this.disposed || this.pipScanScheduled) return;
          this.pipScanScheduled = true;
          queueMicrotask(() => {
            this.pipScanScheduled = false;
            if (!this.disposed) this.mountPipControl();
          });
        });
        this.pipControlsObserver.observe(destination, { childList: true });
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
