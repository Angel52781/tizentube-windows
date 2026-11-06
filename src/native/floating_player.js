/* TizenTube Windows floating playback surface. GPL-3.0-only.
 * Chromium/YouTube keeps a fixed-size native video compositor. Styling a
 * player still buried under transformed/clipped YouTube layout ancestors
 * produced a black rectangle in preview.10. Move the EXISTING player out of
 * that containing block instead; no second stream, URL, iframe or WebView.
 */
(() => {
  'use strict';
  if (window.__ttFloating) return;
  let state = null;
  let activeResize = null;

  const style = `
html.tt-floating-mode, html.tt-floating-mode body {
  overflow: hidden !important;
}
html.tt-floating-mode #tt-floating-backdrop {
  position: fixed !important; inset: 0 !important;
  z-index: 2147483600 !important; background: #000 !important;
}
html.tt-floating-mode body > #movie_player.tt-floating-player {
  display: block !important; visibility: visible !important;
  position: fixed !important; inset: 0 !important;
  width: 100vw !important; height: 100vh !important;
  max-width: none !important; max-height: none !important;
  margin: 0 !important; padding: 0 !important;
  opacity: 1 !important; transform: none !important;
  z-index: 2147483640 !important; background: #000 !important;
}
html.tt-floating-mode body > #movie_player.tt-floating-player .html5-video-container,
html.tt-floating-mode body > #movie_player.tt-floating-player .html5-video-player {
  width: 100% !important; height: 100% !important;
  overflow: visible !important; transform: none !important;
}
html.tt-floating-mode body > #movie_player.tt-floating-player video.html5-main-video {
  position: absolute !important; left: 0 !important; top: 0 !important;
  width: 100% !important; height: 100% !important;
  max-width: none !important; max-height: none !important;
  transform: none !important; object-fit: contain !important;
  opacity: 1 !important; visibility: visible !important;
}

/* Suppress YouTube default controls to eliminate duplicate conflicting UI */
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-chrome-bottom,
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-chrome-top,
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-gradient-bottom,
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-gradient-top,
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-ce-element,
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-cards-teaser,
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-paid-content-overlay {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
  visibility: hidden !important;
}

/* Cursor auto-hiding during playback inactivity */
html.tt-floating-mode.tt-cursor-hidden,
html.tt-floating-mode.tt-cursor-hidden * {
  cursor: none !important;
}

/* Dedicated TizenTube PiP Overlay Container */
html.tt-floating-mode #tt-floating-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483648 !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.28) 0%, rgba(0, 0, 0, 0.65) 100%) !important;
  pointer-events: none !important;
  opacity: 0 !important;
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important;
  user-select: none !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
  color: #ffffff !important;
  box-sizing: border-box !important;
}

html.tt-floating-mode #tt-floating-overlay.tt-overlay-visible {
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* Top Header Bar */
html.tt-floating-mode #tt-floating-header {
  position: relative !important;
  top: 0 !important; left: 0 !important; right: 0 !important;
  height: 38px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 0 10px !important;
  background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%) !important;
  cursor: move !important;
  flex-shrink: 0 !important;
}

html.tt-floating-mode .tt-float-title {
  font-size: 12px !important;
  font-weight: 500 !important;
  color: rgba(255, 255, 255, 0.85) !important;
  letter-spacing: 0.2px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  padding-left: 2px !important;
  max-width: calc(100vw - 120px) !important;
}

html.tt-floating-mode .tt-float-header-controls {
  display: inline-flex !important;
  align-items: center !important;
  flex-shrink: 0 !important;
  gap: 6px !important;
}

/* Top Bar Window Control Buttons */
html.tt-floating-mode .tt-float-btn {
  background: rgba(255, 255, 255, 0.16) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  color: #ffffff !important;
  cursor: pointer !important;
  padding: 3px 9px !important;
  border-radius: 5px !important;
  font-size: 13px !important;
  line-height: 20px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-family: inherit !important;
  transition: background-color 0.14s ease, border-color 0.14s ease, transform 0.1s ease !important;
}

html.tt-floating-mode .tt-float-btn:hover {
  background: rgba(255, 255, 255, 0.32) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
}

html.tt-floating-mode .tt-float-btn:active {
  transform: scale(0.95) !important;
}

html.tt-floating-mode .tt-float-btn:focus-visible {
  outline: 2px solid #3ea6ff !important;
  outline-offset: 2px !important;
}

html.tt-floating-mode .tt-float-btn-close:hover {
  background: rgba(235, 50, 50, 0.88) !important;
  border-color: rgba(255, 60, 60, 0.9) !important;
  color: #ffffff !important;
}

/* Center Playback Controls (-10, Play/Pause, +10) */
html.tt-floating-mode #tt-floating-center-controls {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: clamp(14px, 4vw, 26px) !important;
  padding: 8px !important;
  flex-shrink: 0 !important;
}

html.tt-floating-mode .tt-float-ctrl-btn {
  background: rgba(24, 24, 24, 0.72) !important;
  backdrop-filter: blur(8px) !important;
  -webkit-backdrop-filter: blur(8px) !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  color: #ffffff !important;
  cursor: pointer !important;
  border-radius: 50% !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45) !important;
  transition: transform 0.14s ease, background-color 0.14s ease, border-color 0.14s ease !important;
  padding: 0 !important;
  font-family: inherit !important;
}

html.tt-floating-mode .tt-float-ctrl-btn:hover {
  background: rgba(45, 45, 45, 0.88) !important;
  border-color: rgba(255, 255, 255, 0.38) !important;
  transform: scale(1.08) !important;
}

html.tt-floating-mode .tt-float-ctrl-btn:active {
  transform: scale(0.94) !important;
}

html.tt-floating-mode .tt-float-ctrl-btn:focus-visible {
  outline: 2px solid #3ea6ff !important;
  outline-offset: 3px !important;
}

html.tt-floating-mode #tt-floating-rewind-btn,
html.tt-floating-mode #tt-floating-forward-btn {
  width: clamp(38px, 10vw, 48px) !important;
  height: clamp(38px, 10vw, 48px) !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  letter-spacing: -0.5px !important;
}

html.tt-floating-mode #tt-floating-play-btn {
  width: clamp(48px, 13vw, 62px) !important;
  height: clamp(48px, 13vw, 62px) !important;
  font-size: 22px !important;
  line-height: 1 !important;
}

/* Overlay Bottom Bar (Footer) */
html.tt-floating-mode #tt-floating-footer {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  padding: 8px 12px 10px 12px !important;
  background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%) !important;
  flex-shrink: 0 !important;
}

/* Progress Scrubber Container */
html.tt-floating-mode #tt-floating-progress-container {
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
  cursor: pointer !important;
  padding: 3px 0 !important;
}

html.tt-floating-mode .tt-float-progress-slider {
  -webkit-appearance: none !important;
  appearance: none !important;
  width: 100% !important;
  height: 4px !important;
  border-radius: 2px !important;
  background: rgba(255, 255, 255, 0.28) !important;
  outline: none !important;
  cursor: pointer !important;
  margin: 0 !important;
  padding: 0 !important;
  transition: height 0.15s ease !important;
}

html.tt-floating-mode #tt-floating-progress-container:hover .tt-float-progress-slider,
html.tt-floating-mode .tt-float-progress-slider:focus-visible {
  height: 6px !important;
}

html.tt-floating-mode .tt-float-progress-slider::-webkit-slider-thumb {
  -webkit-appearance: none !important;
  appearance: none !important;
  width: 12px !important;
  height: 12px !important;
  border-radius: 50% !important;
  background: #ff0000 !important;
  border: 2px solid #ffffff !important;
  cursor: pointer !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.6) !important;
  transition: transform 0.12s ease !important;
}

html.tt-floating-mode .tt-float-progress-slider::-moz-range-thumb {
  width: 12px !important;
  height: 12px !important;
  border-radius: 50% !important;
  background: #ff0000 !important;
  border: 2px solid #ffffff !important;
  cursor: pointer !important;
  box-shadow: 0 1px 4px rgba(0,0,0,0.6) !important;
}

html.tt-floating-mode .tt-float-progress-slider:focus-visible {
  outline: 2px solid #3ea6ff !important;
  outline-offset: 2px !important;
}

/* Bottom Controls Row: Time and Volume */
html.tt-floating-mode #tt-floating-bottom-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 0 2px !important;
}

html.tt-floating-mode #tt-floating-time-display {
  font-size: 11px !important;
  font-weight: 500 !important;
  font-variant-numeric: tabular-nums !important;
  color: rgba(255, 255, 255, 0.88) !important;
  letter-spacing: 0.2px !important;
}

html.tt-floating-mode #tt-floating-volume-group {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
}

html.tt-floating-mode #tt-floating-volume-btn {
  background: transparent !important;
  border: none !important;
  color: #ffffff !important;
  cursor: pointer !important;
  padding: 2px 4px !important;
  font-size: 14px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 4px !important;
  opacity: 0.9 !important;
  transition: opacity 0.12s ease, transform 0.1s ease !important;
}

html.tt-floating-mode #tt-floating-volume-btn:hover {
  opacity: 1 !important;
  transform: scale(1.1) !important;
}

html.tt-floating-mode #tt-floating-volume-btn:focus-visible {
  outline: 2px solid #3ea6ff !important;
  outline-offset: 2px !important;
}

html.tt-floating-mode .tt-float-volume-slider {
  -webkit-appearance: none !important;
  appearance: none !important;
  width: 52px !important;
  height: 4px !important;
  border-radius: 2px !important;
  background: rgba(255, 255, 255, 0.28) !important;
  outline: none !important;
  cursor: pointer !important;
  margin: 0 !important;
  padding: 0 !important;
}

html.tt-floating-mode .tt-float-volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none !important;
  appearance: none !important;
  width: 10px !important;
  height: 10px !important;
  border-radius: 50% !important;
  background: #ffffff !important;
  cursor: pointer !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.5) !important;
}

html.tt-floating-mode .tt-float-volume-slider::-moz-range-thumb {
  width: 10px !important;
  height: 10px !important;
  border-radius: 50% !important;
  background: #ffffff !important;
  border: none !important;
  cursor: pointer !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.5) !important;
}

html.tt-floating-mode .tt-float-volume-slider:focus-visible {
  outline: 2px solid #3ea6ff !important;
  outline-offset: 2px !important;
}

/* Resize Grips */
html.tt-floating-mode .tt-resize-grip {
  position: fixed !important;
  z-index: 2147483649 !important;
  pointer-events: auto !important;
  background: transparent !important;
  user-select: none !important;
  touch-action: none !important;
}
html.tt-floating-mode .tt-grip-top {
  top: 0 !important; left: 16px !important; right: 16px !important; height: 12px !important;
  cursor: ns-resize !important;
}
html.tt-floating-mode .tt-grip-bottom {
  bottom: 0 !important; left: 16px !important; right: 16px !important; height: 12px !important;
  cursor: ns-resize !important;
}
html.tt-floating-mode .tt-grip-left {
  left: 0 !important; top: 16px !important; bottom: 16px !important; width: 12px !important;
  cursor: ew-resize !important;
}
html.tt-floating-mode .tt-grip-right {
  right: 0 !important; top: 16px !important; bottom: 16px !important; width: 12px !important;
  cursor: ew-resize !important;
}
html.tt-floating-mode .tt-grip-topleft {
  top: 0 !important; left: 0 !important; width: 16px !important; height: 16px !important;
  cursor: nwse-resize !important;
}
html.tt-floating-mode .tt-grip-topright {
  top: 0 !important; right: 0 !important; width: 16px !important; height: 16px !important;
  cursor: nesw-resize !important;
}
html.tt-floating-mode .tt-grip-bottomleft {
  bottom: 0 !important; left: 0 !important; width: 16px !important; height: 16px !important;
  cursor: nesw-resize !important;
}
html.tt-floating-mode .tt-grip-bottomright {
  bottom: 0 !important; right: 0 !important; width: 16px !important; height: 16px !important;
  cursor: nwse-resize !important;
}
`;

  const setTimer = (fn, ms) => {
    if (typeof setTimeout === 'function') return setTimeout(fn, ms);
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') return window.setTimeout(fn, ms);
    return null;
  };

  const clearTimer = (id) => {
    if (id == null) return;
    if (typeof clearTimeout === 'function') clearTimeout(id);
    else if (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') window.clearTimeout(id);
  };

  const formatTime = (seconds) => {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const secStr = sec < 10 ? '0' + sec : String(sec);
    if (h > 0) {
      const mStr = m < 10 ? '0' + m : String(m);
      return `${h}:${mStr}:${secStr}`;
    }
    return `${m}:${secStr}`;
  };

  const relocate = (parent, node, reference) => {
    // Element.moveBefore preserves video/iframe playback on Chromium 133+;
    // ordinary appendChild is a fallback, never a second instance of video.
    if (typeof parent.moveBefore === 'function') parent.moveBefore(node, reference);
    else parent.insertBefore(node, reference);
  };

  const getWatchFallbackContainer = () => {
    return document.querySelector(
      '#player-theater-container, #player-container-outer, #player-container, ytd-watch-flexy #player, #movie_player_parent'
    );
  };

  const diagnostics = () => {
    const video = document.querySelector('video.html5-main-video');
    const rect = video?.getBoundingClientRect();
    const controls = document.querySelector('.ytp-right-controls');
    const captions = controls?.querySelector('.ytp-subtitles-button');
    const pip = controls?.querySelector('#tizentube-native-pip');
    const settings = controls?.querySelector('.ytp-settings-button');
    const theater = document.querySelector('ytd-watch-flexy');
    const left = element => element ? Math.round(element.getBoundingClientRect().left) : null;
    const describeControl = element => {
      const computed = element ? getComputedStyle(element) : null;
      return {
        tag: element?.tagName?.toLowerCase() || null,
        classes: String(element?.className || '').slice(0, 110),
        x: left(element),
        width: element ? Math.round(element.getBoundingClientRect().width) : null,
        float: computed?.float || null,
        display: computed?.display || null,
        order: computed?.order || null
      };
    };

    return {
      active: !!state,
      videoReadyState: video?.readyState ?? -1,
      videoWidth: video?.videoWidth || 0,
      videoHeight: video?.videoHeight || 0,
      currentTime: Math.round(video?.currentTime || 0),
      paused: video?.paused ?? true,
      duration: typeof video?.duration === 'number' && !isNaN(video.duration) ? Math.round(video.duration) : 0,
      restoreButtonPresent: !!document.getElementById('tt-floating-restore-btn'),
      closeButtonPresent: !!document.getElementById('tt-floating-close-btn'),
      rewindButtonPresent: !!document.getElementById('tt-floating-rewind-btn'),
      playButtonPresent: !!document.getElementById('tt-floating-play-btn'),
      forwardButtonPresent: !!document.getElementById('tt-floating-forward-btn'),
      progressBarPresent: !!document.getElementById('tt-floating-progress-bar'),
      timeDisplayPresent: !!document.getElementById('tt-floating-time-display'),
      volumeButtonPresent: !!document.getElementById('tt-floating-volume-btn'),
      volumeSliderPresent: !!document.getElementById('tt-floating-volume-slider'),
      overlayPresent: !!document.getElementById('tt-floating-overlay'),
      overlayVisible: state?.isOverlayVisible ?? false,
      videoRect: rect ? {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      playerInBody: document.querySelector('#movie_player')?.parentElement === document.body,
      theater: typeof theater?.hasAttribute === 'function' ? theater.hasAttribute('theater') : null,
      fullscreen: !!document.fullscreenElement,
      youtubeFullscreen: !!document.querySelector('.ytp-fullscreen'),
      theaterPreference: typeof window.__TT_THEATER_PREF === 'boolean'
        ? window.__TT_THEATER_PREF : null,
      pipButtonVisible: !!pip && pip.getBoundingClientRect().width > 0,
      captionsButtonPresent: !!captions,
      settingsButtonPresent: !!settings,
      controlX: { captions: left(captions), pip: left(pip), settings: left(settings) },
      controlDetails: { captions: describeControl(captions), pip: describeControl(pip), settings: describeControl(settings) },
      controlsChildren: Array.from(controls?.children || []).slice(0, 20).map(describeControl),
      pipButtonBetweenCaptionsAndSettings: !!captions && !!pip && !!settings &&
        !!(captions.compareDocumentPosition(pip) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !!(pip.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING)
    };
  };

  const start = () => {
    if (state) return true;
    if (location.pathname !== '/watch' && !location.pathname.endsWith('fixture_floating_overlay.html')) return false;
    if (document.fullscreenElement) return false;
    const player = document.getElementById('movie_player');
    const video = player?.querySelector('video.html5-main-video');
    if (!player || !video || !video.isConnected || video.readyState < 2 ||
        video.videoWidth < 1 || video.videoHeight < 1 || !document.body) return false;
    const parent = player.parentElement;
    const reference = player.nextSibling;
    if (!parent) return false;

    const previousStyle = player.getAttribute('style');

    // 1. Stylesheet
    const css = document.createElement('style');
    css.id = 'tt-floating-player-styles';
    css.textContent = style;

    // 2. Video Backdrop (for letterbox regions)
    const backdrop = document.createElement('div');
    backdrop.id = 'tt-floating-backdrop';

    // 3. Dedicated Floating Overlay Container
    const overlay = document.createElement('div');
    overlay.id = 'tt-floating-overlay';
    overlay.className = 'tt-overlay-visible';

    // 3a. Top Header Bar
    const header = document.createElement('div');
    header.id = 'tt-floating-header';

    const titleBadge = document.createElement('span');
    titleBadge.id = 'tt-floating-title';
    titleBadge.className = 'tt-float-title';
    titleBadge.textContent = 'TizenTube PiP';
    header.appendChild(titleBadge);

    const headerControls = document.createElement('div');
    headerControls.className = 'tt-float-header-controls';

    const restoreBtn = document.createElement('button');
    restoreBtn.id = 'tt-floating-restore-btn';
    restoreBtn.className = 'tt-float-btn tt-float-btn-restore';
    restoreBtn.textContent = '⤢';
    restoreBtn.title = 'Restaurar ventana (F9)';
    restoreBtn.setAttribute('aria-label', 'Volver a ventana');
    if (typeof restoreBtn.addEventListener === 'function') {
      restoreBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        restore();
      });
    }
    headerControls.appendChild(restoreBtn);

    const closeBtn = document.createElement('button');
    closeBtn.id = 'tt-floating-close-btn';
    closeBtn.className = 'tt-float-btn tt-float-btn-close';
    closeBtn.textContent = '✕';
    closeBtn.title = 'Cerrar reproductor flotante';
    closeBtn.setAttribute('aria-label', 'Cerrar');
    if (typeof closeBtn.addEventListener === 'function') {
      closeBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        close();
      });
    }
    headerControls.appendChild(closeBtn);
    header.appendChild(headerControls);

    if (typeof header.addEventListener === 'function') {
      header.addEventListener('mousedown', (e) => {
        if (e.button === 0 && (e.target === header || e.target === titleBadge)) {
          window.chrome?.webview?.postMessage?.({ channel: 'window:drag' });
        }
      });
    }

    // 3b. Center Controls (-10, Play/Pause, +10)
    const centerControls = document.createElement('div');
    centerControls.id = 'tt-floating-center-controls';

    const rewindBtn = document.createElement('button');
    rewindBtn.id = 'tt-floating-rewind-btn';
    rewindBtn.className = 'tt-float-ctrl-btn tt-float-btn-rewind';
    rewindBtn.textContent = '-10';
    rewindBtn.title = 'Retroceder 10 segundos (J / Flecha izquierda)';
    rewindBtn.setAttribute('aria-label', 'Retroceder 10 segundos');
    if (typeof rewindBtn.addEventListener === 'function') {
      rewindBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        seek(-10);
      });
    }
    centerControls.appendChild(rewindBtn);

    const playBtn = document.createElement('button');
    playBtn.id = 'tt-floating-play-btn';
    playBtn.className = 'tt-float-ctrl-btn tt-float-btn-play';
    playBtn.textContent = video.paused ? '▶' : '❚❚';
    playBtn.title = video.paused ? 'Reproducir (Espacio / K)' : 'Pausar (Espacio / K)';
    playBtn.setAttribute('aria-label', video.paused ? 'Reproducir' : 'Pausar');
    if (typeof playBtn.addEventListener === 'function') {
      playBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        togglePlay();
      });
    }
    centerControls.appendChild(playBtn);

    const forwardBtn = document.createElement('button');
    forwardBtn.id = 'tt-floating-forward-btn';
    forwardBtn.className = 'tt-float-ctrl-btn tt-float-btn-forward';
    forwardBtn.textContent = '+10';
    forwardBtn.title = 'Avanzar 10 segundos (L / Flecha derecha)';
    forwardBtn.setAttribute('aria-label', 'Avanzar 10 segundos');
    if (typeof forwardBtn.addEventListener === 'function') {
      forwardBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        seek(10);
      });
    }
    centerControls.appendChild(forwardBtn);

    // 3c. Bottom Controls Bar (Progress Scrubber, Time Display, Volume)
    const footer = document.createElement('div');
    footer.id = 'tt-floating-footer';

    const progressContainer = document.createElement('div');
    progressContainer.id = 'tt-floating-progress-container';

    const progressBar = document.createElement('input');
    progressBar.id = 'tt-floating-progress-bar';
    progressBar.className = 'tt-float-progress-slider';
    progressBar.setAttribute('type', 'range');
    progressBar.setAttribute('min', '0');
    progressBar.setAttribute('max', '100');
    progressBar.setAttribute('step', '0.1');
    progressBar.setAttribute('value', '0');
    progressBar.setAttribute('role', 'slider');
    progressBar.setAttribute('aria-label', 'Progreso de reproducción');

    let isScrubbing = false;
    const onProgressInput = (e) => {
      isScrubbing = true;
      const pct = parseFloat(e?.target?.value ?? progressBar.value ?? 0);
      const dur = (typeof video.duration === 'number' && !isNaN(video.duration) && video.duration > 0)
        ? video.duration : 0;
      const targetTime = (pct / 100) * dur;
      timeDisplay.textContent = `${formatTime(targetTime)} / ${formatTime(dur)}`;
      try {
        progressBar.style.background = `linear-gradient(to right, #ff0000 0%, #ff0000 ${pct}%, rgba(255, 255, 255, 0.28) ${pct}%, rgba(255, 255, 255, 0.28) 100%)`;
      } catch (_) {}
    };
    const onProgressChange = (e) => {
      isScrubbing = false;
      const pct = parseFloat(e?.target?.value ?? progressBar.value ?? 0);
      const dur = (typeof video.duration === 'number' && !isNaN(video.duration) && video.duration > 0)
        ? video.duration : 0;
      video.currentTime = (pct / 100) * dur;
      updateTimeAndProgress();
      showOverlay();
    };

    if (typeof progressBar.addEventListener === 'function') {
      progressBar.addEventListener('input', onProgressInput);
      progressBar.addEventListener('change', onProgressChange);
    }
    progressContainer.appendChild(progressBar);
    footer.appendChild(progressContainer);

    const bottomRow = document.createElement('div');
    bottomRow.id = 'tt-floating-bottom-row';

    const timeDisplay = document.createElement('div');
    timeDisplay.id = 'tt-floating-time-display';
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    bottomRow.appendChild(timeDisplay);

    const volumeGroup = document.createElement('div');
    volumeGroup.id = 'tt-floating-volume-group';

    const volumeBtn = document.createElement('button');
    volumeBtn.id = 'tt-floating-volume-btn';
    volumeBtn.className = 'tt-float-volume-btn';
    const isInitialMuted = video.muted || video.volume === 0;
    volumeBtn.textContent = isInitialMuted ? '🔇' : (video.volume < 0.5 ? '🔉' : '🔊');
    volumeBtn.title = isInitialMuted ? 'Activar sonido (M)' : 'Silenciar (M)';
    volumeBtn.setAttribute('aria-label', isInitialMuted ? 'Activar sonido' : 'Silenciar');

    const volumeSlider = document.createElement('input');
    volumeSlider.id = 'tt-floating-volume-slider';
    volumeSlider.className = 'tt-float-volume-slider';
    volumeSlider.setAttribute('type', 'range');
    volumeSlider.setAttribute('min', '0');
    volumeSlider.setAttribute('max', '1');
    volumeSlider.setAttribute('step', '0.05');
    volumeSlider.setAttribute('value', String(isInitialMuted ? 0 : (video.volume ?? 1)));
    volumeSlider.setAttribute('aria-label', 'Control de volumen');

    if (typeof volumeBtn.addEventListener === 'function') {
      volumeBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        video.muted = !video.muted;
        updateVolumeState();
        showOverlay();
      });
    }

    if (typeof volumeSlider.addEventListener === 'function') {
      volumeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e?.target?.value ?? volumeSlider.value ?? 1);
        video.volume = val;
        video.muted = val === 0;
        updateVolumeState();
      });
    }

    volumeGroup.appendChild(volumeBtn);
    volumeGroup.appendChild(volumeSlider);
    bottomRow.appendChild(volumeGroup);
    footer.appendChild(bottomRow);

    // Assemble Overlay
    overlay.appendChild(header);
    overlay.appendChild(centerControls);
    overlay.appendChild(footer);

    // 4. Inactivity & Auto-Hide Overlay Controller
    let inactivityTimer = null;
    let isOverlayVisible = true;

    const showOverlay = () => {
      isOverlayVisible = true;
      overlay.classList.add('tt-overlay-visible');
      document.documentElement.classList.remove('tt-cursor-hidden');
      if (state) state.isOverlayVisible = true;
      resetInactivityTimer();
    };

    const hideOverlay = () => {
      // Do not auto-hide if paused or if user is interacting with an input/button
      if (video.paused) return;
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'BUTTON')) return;
      if (isScrubbing || activeResize) return;

      isOverlayVisible = false;
      overlay.classList.remove('tt-overlay-visible');
      document.documentElement.classList.add('tt-cursor-hidden');
      if (state) state.isOverlayVisible = false;
    };

    const resetInactivityTimer = () => {
      clearTimer(inactivityTimer);
      if (!video.paused) {
        inactivityTimer = setTimer(hideOverlay, 2500);
      }
    };

    // Keep overlay visible while hovering it
    if (typeof overlay.addEventListener === 'function') {
      overlay.addEventListener('mouseenter', () => {
        showOverlay();
        clearTimer(inactivityTimer);
      });
      overlay.addEventListener('mouseleave', () => {
        resetInactivityTimer();
      });
      overlay.addEventListener('mousemove', () => {
        showOverlay();
      });
    }

    // 5. Reactive State Updaters
    const updatePlayBtnState = () => {
      const isPaused = video.paused;
      playBtn.textContent = isPaused ? '▶' : '❚❚';
      playBtn.title = isPaused ? 'Reproducir (Espacio / K)' : 'Pausar (Espacio / K)';
      playBtn.setAttribute('aria-label', isPaused ? 'Reproducir' : 'Pausar');
      if (isPaused) {
        showOverlay();
      } else {
        resetInactivityTimer();
      }
    };

    const updateTimeAndProgress = () => {
      const cur = video.currentTime || 0;
      const dur = (typeof video.duration === 'number' && !isNaN(video.duration) && video.duration > 0)
        ? video.duration : 0;
      timeDisplay.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
      if (!isScrubbing) {
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        progressBar.value = String(pct);
        progressBar.setAttribute('aria-valuenow', String(Math.round(cur)));
        progressBar.setAttribute('aria-valuemax', String(Math.round(dur)));
        progressBar.setAttribute('aria-valuetext', `${formatTime(cur)} de ${formatTime(dur)}`);
        try {
          progressBar.style.background = `linear-gradient(to right, #ff0000 0%, #ff0000 ${pct}%, rgba(255, 255, 255, 0.28) ${pct}%, rgba(255, 255, 255, 0.28) 100%)`;
        } catch (_) {}
      }
    };

    const updateVolumeState = () => {
      const isMuted = video.muted || video.volume === 0;
      volumeBtn.textContent = isMuted ? '🔇' : (video.volume < 0.5 ? '🔉' : '🔊');
      volumeBtn.title = isMuted ? 'Activar sonido (M)' : 'Silenciar (M)';
      volumeBtn.setAttribute('aria-label', isMuted ? 'Activar sonido' : 'Silenciar');
      const volVal = isMuted ? 0 : (video.volume ?? 1);
      volumeSlider.value = String(volVal);
      try {
        const volPct = Math.round(volVal * 100);
        volumeSlider.style.background = `linear-gradient(to right, #ffffff 0%, #ffffff ${volPct}%, rgba(255, 255, 255, 0.28) ${volPct}%, rgba(255, 255, 255, 0.28) 100%)`;
      } catch (_) {}
    };

    // Attach video media listeners
    if (typeof video.addEventListener === 'function') {
      video.addEventListener('timeupdate', updateTimeAndProgress);
      video.addEventListener('play', updatePlayBtnState);
      video.addEventListener('pause', updatePlayBtnState);
      video.addEventListener('volumechange', updateVolumeState);
    }

    // 6. Keyboard & Focus Authority Management
    const onKeyDown = (e) => {
      if (!e) return;
      showOverlay();

      const active = typeof document !== 'undefined' ? document.activeElement : null;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      const isButton = active && active.tagName === 'BUTTON';

      // Focus authority: focused buttons handle Space/Enter natively without interception
      if (isButton && (e.key === ' ' || e.key === 'Enter')) {
        return;
      }
      // Sliders handle Arrow keys natively
      if (isInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End')) {
        return;
      }

      if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        togglePlay();
      } else if (e.key === 'j' || e.key === 'J') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        seek(-10);
      } else if (e.key === 'l' || e.key === 'L') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        seek(10);
      } else if (e.key === 'ArrowLeft') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        seek(-5);
      } else if (e.key === 'ArrowRight') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        seek(5);
      } else if (e.key === 'ArrowUp') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        video.muted = false;
        video.volume = Math.min(1, Math.round(((video.volume ?? 1) + 0.05) * 100) / 100);
        updateVolumeState();
      } else if (e.key === 'ArrowDown') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        video.volume = Math.max(0, Math.round(((video.volume ?? 1) - 0.05) * 100) / 100);
        if (video.volume === 0) video.muted = true;
        updateVolumeState();
      } else if (e.key === 'm' || e.key === 'M') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        video.muted = !video.muted;
        updateVolumeState();
      } else if (e.key === 'Escape' || e.key === 'F9') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        restore();
      }
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('mousemove', showOverlay);
    }

    // 7. Window Resize Grips (for borderless WinForms PiP window)
    const grips = [];
    const directions = ['top', 'bottom', 'left', 'right', 'topleft', 'topright', 'bottomleft', 'bottomright'];
    for (const dir of directions) {
      const grip = document.createElement('div');
      grip.className = 'tt-resize-grip tt-grip-' + dir;
      grip.setAttribute('data-direction', dir);
      if (typeof grip.addEventListener === 'function') {
        grip.addEventListener('pointerdown', (e) => {
          if (e.button === 0) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            activeResize = { dir, startX: e.screenX, startY: e.screenY, pointerId: e.pointerId };
            if (typeof grip.setPointerCapture === 'function') {
              try { grip.setPointerCapture(e.pointerId); } catch (_) {}
            }
            window.chrome?.webview?.postMessage?.({
              channel: 'window:resize-start',
              direction: dir
            });
          }
        });
        grip.addEventListener('pointermove', (e) => {
          if (activeResize && activeResize.pointerId === e.pointerId) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            const deltaX = e.screenX - activeResize.startX;
            const deltaY = e.screenY - activeResize.startY;
            window.chrome?.webview?.postMessage?.({
              channel: 'window:resize-step',
              direction: activeResize.dir,
              deltaX: Math.round(deltaX),
              deltaY: Math.round(deltaY)
            });
          }
        });
        const onPointerEnd = (e) => {
          if (activeResize && activeResize.pointerId === e.pointerId) {
            if (typeof e.preventDefault === 'function') e.preventDefault();
            if (typeof e.stopPropagation === 'function') e.stopPropagation();
            if (typeof grip.releasePointerCapture === 'function') {
              try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
            }
            activeResize = null;
            window.chrome?.webview?.postMessage?.({
              channel: 'window:resize-end'
            });
          }
        };
        grip.addEventListener('pointerup', onPointerEnd);
        grip.addEventListener('pointercancel', onPointerEnd);
      }
      grips.push(grip);
    }

    const onWheel = (e) => {
      if (e.ctrlKey) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        window.chrome?.webview?.postMessage?.({ channel: 'window:scale-floating', delta });
      }
    };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('wheel', onWheel, { passive: false });
    }

    const playing = !video.paused;
    const initialTime = video.currentTime;
    const initialVideo = video;

    try {
      if (document.head) document.head.appendChild(css);
      else document.documentElement?.appendChild(css);
      document.body.appendChild(backdrop);
      document.body.appendChild(overlay);
      for (const grip of grips) {
        document.body.appendChild(grip);
      }

      // Move existing #movie_player to body
      relocate(document.body, player, null);
      player.classList.add('tt-floating-player');
      document.documentElement.classList.add('tt-floating-mode');
      document.getElementById('tizentube-native-pip')?.setAttribute('aria-pressed', 'true');

      state = {
        parent, reference, player, previousStyle, css, backdrop, overlay, header,
        grips, onWheel, onKeyDown, inactivityTimer, video, updatePlayBtnState,
        updateTimeAndProgress, updateVolumeState, showOverlay, isOverlayVisible: true
      };

      if (player.querySelector('video.html5-main-video') !== initialVideo) {
        throw new Error('YouTube replaced the video element while floating');
      }

      if (video.paused && playing) {
        if (Math.abs(video.currentTime - initialTime) > 3) video.currentTime = initialTime;
        video.play()?.catch?.(() => {});
      }

      // Initial progress & inactivity setup
      updateTimeAndProgress();
      updatePlayBtnState();
      resetInactivityTimer();

      return true;
    } catch (e) {
      console.warn('[TizenTube] Floating mode was cancelled:', String(e));
      stop();
      return false;
    }
  };

  const stop = (pause = false) => {
    if (pause) {
      const video = document.querySelector('video.html5-main-video');
      if (video && !video.paused && typeof video.pause === 'function') {
        try { video.pause(); } catch (_) {}
      }
    }
    if (activeResize) {
      activeResize = null;
      try { window.chrome?.webview?.postMessage?.({ channel: 'window:resize-end' }); } catch (_) {}
    }
    const savedState = state;
    state = null;

    document.documentElement.classList.remove('tt-floating-mode');
    document.documentElement.classList.remove('tt-cursor-hidden');
    document.getElementById('tt-floating-backdrop')?.remove();
    document.getElementById('tt-floating-player-styles')?.remove();
    document.getElementById('tt-floating-overlay')?.remove();
    document.getElementById('tt-floating-header')?.remove();
    document.getElementById('tizentube-native-pip')?.setAttribute('aria-pressed', 'false');

    if (savedState?.inactivityTimer) {
      clearTimer(savedState.inactivityTimer);
    }
    if (savedState?.video && typeof savedState.video.removeEventListener === 'function') {
      savedState.video.removeEventListener('timeupdate', savedState.updateTimeAndProgress);
      savedState.video.removeEventListener('play', savedState.updatePlayBtnState);
      savedState.video.removeEventListener('pause', savedState.updatePlayBtnState);
      savedState.video.removeEventListener('volumechange', savedState.updateVolumeState);
    }
    if (savedState?.onKeyDown && typeof window.removeEventListener === 'function') {
      window.removeEventListener('keydown', savedState.onKeyDown);
      window.removeEventListener('mousemove', savedState.showOverlay);
    }
    if (savedState?.grips) {
      for (const grip of savedState.grips) {
        try { grip?.remove?.(); } catch (_) {}
      }
    }
    if (savedState?.onWheel && typeof window.removeEventListener === 'function') {
      window.removeEventListener('wheel', savedState.onWheel);
    }

    const player = savedState?.player || document.getElementById('movie_player');
    if (player) {
      player.classList.remove('tt-floating-player');
      if (savedState) {
        if (savedState.previousStyle === null) player.removeAttribute('style');
        else player.setAttribute('style', savedState.previousStyle);
      }
      // Return the SAME YouTube player to its original position in the watch
      // page. If parent was detached, fall back to known watch container.
      if (player.parentElement === document.body) {
        let target = savedState?.parent;
        if (!target || !target.isConnected) target = getWatchFallbackContainer();
        if (target && target.isConnected) {
          const ref = (savedState?.reference && savedState.reference.parentNode === target)
            ? savedState.reference : null;
          relocate(target, player, ref);
        }
      }
    }
    savedState?.backdrop?.remove();
    savedState?.css?.remove();
    savedState?.overlay?.remove();
    savedState?.header?.remove();

    // Dispatch window resize so YouTube player recalculates internal dimensions
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    return true;
  };

  const restore = () => {
    if (typeof window !== 'undefined' && window.chrome?.webview?.postMessage) {
      try {
        window.chrome.webview.postMessage({ channel: 'window:restore-floating' });
      } catch (_) {
        stop();
      }
    } else {
      stop();
    }
    return true;
  };

  const close = () => {
    const video = document.querySelector('video.html5-main-video');
    if (video && !video.paused && typeof video.pause === 'function') {
      try { video.pause(); } catch (_) {}
    }
    if (typeof window !== 'undefined' && window.chrome?.webview?.postMessage) {
      try {
        window.chrome.webview.postMessage({ channel: 'window:close-floating' });
      } catch (_) {
        stop(true);
      }
    } else {
      stop(true);
    }
    return true;
  };

  const seek = (delta) => {
    const video = document.querySelector('video.html5-main-video');
    if (!video) return 0;
    const numDelta = typeof delta === 'number' && !isNaN(delta) ? delta : 0;
    const duration = (typeof video.duration === 'number' && !isNaN(video.duration) && video.duration > 0)
      ? video.duration : Infinity;
    const target = Math.max(0, Math.min(duration, (video.currentTime || 0) + numDelta));
    video.currentTime = target;
    if (state?.updateTimeAndProgress) {
      state.updateTimeAndProgress();
    }
    if (state?.showOverlay) {
      state.showOverlay();
    }
    return video.currentTime;
  };

  const togglePlay = () => {
    const video = document.querySelector('video.html5-main-video');
    if (!video) return { paused: true, currentTime: 0 };
    if (video.paused) {
      if (typeof video.play === 'function') {
        try { video.play().catch(() => {}); } catch (_) {}
      }
    } else {
      if (typeof video.pause === 'function') {
        try { video.pause(); } catch (_) {}
      }
    }
    if (state?.updatePlayBtnState) {
      state.updatePlayBtnState();
    }
    return { paused: video.paused, currentTime: video.currentTime };
  };

  const recover = () => {
    const player = document.getElementById('movie_player');
    const inBody = player?.parentElement === document.body;
    const isFloating = document.documentElement.classList.contains('tt-floating-mode');
    if (inBody && (!isFloating || !state)) {
      stop();
    }
    const video = document.querySelector('video.html5-main-video');
    if (video && video.paused && !video.ended && typeof video.play === 'function') {
      try { video.play().catch(() => {}); } catch (_) {}
    }
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    return diagnostics();
  };

  window.__ttFloating = { start, stop, recover, restore, close, seek, togglePlay, diagnostics };
  window.addEventListener('pagehide', stop, { once: true });
})();
