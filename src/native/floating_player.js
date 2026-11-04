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
html.tt-floating-mode, html.tt-floating-mode body { overflow: hidden !important; }
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
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-chrome-bottom {
  bottom: 0 !important;
  transition: opacity 0.2s ease-in-out !important;
  transform: scale(0.88) !important;
  transform-origin: bottom center !important;
}
html.tt-floating-mode body > #movie_player.tt-floating-player:not(:hover) .ytp-chrome-bottom,
html.tt-floating-mode body > #movie_player.tt-floating-player:not(:hover) .ytp-gradient-bottom,
html.tt-floating-mode body > #movie_player.tt-floating-player:not(:hover) .ytp-gradient-top {
  opacity: 0 !important;
  pointer-events: none !important;
}
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-ce-element,
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-cards-teaser,
html.tt-floating-mode body > #movie_player.tt-floating-player .ytp-paid-content-overlay {
  display: none !important;
}
html.tt-floating-mode #tt-floating-header {
  position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important;
  height: 34px !important; z-index: 2147483648 !important;
  display: flex !important; align-items: center !important; justify-content: flex-end !important;
  padding: 0 10px !important; background: linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%) !important;
  opacity: 0 !important; transition: opacity 0.2s ease !important; cursor: move !important;
}
html.tt-floating-mode:hover #tt-floating-header,
html.tt-floating-mode #tt-floating-header:hover {
  opacity: 1 !important;
}
html.tt-floating-mode .tt-float-btn {
  background: rgba(255,255,255,0.18) !important; border: none !important; color: #fff !important;
  cursor: pointer !important; padding: 2px 8px !important; border-radius: 4px !important;
  font-size: 13px !important; line-height: 20px !important; display: inline-flex !important;
  align-items: center !important; justify-content: center !important; margin-left: 6px !important;
  font-family: sans-serif !important;
}
html.tt-floating-mode .tt-float-btn:hover {
  background: rgba(255,255,255,0.35) !important;
}
html.tt-floating-mode .tt-resize-grip {
  position: fixed !important;
  z-index: 2147483647 !important;
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
      return { tag: element?.tagName?.toLowerCase() || null,
        classes: String(element?.className || '').slice(0, 110),
        x: left(element), width: element ? Math.round(element.getBoundingClientRect().width) : null,
        float: computed?.float || null, display: computed?.display || null,
        order: computed?.order || null };
    };
    return { active: !!state, videoReadyState: video?.readyState ?? -1,
      videoWidth: video?.videoWidth || 0, videoHeight: video?.videoHeight || 0,
      currentTime: Math.round(video?.currentTime || 0), paused: video?.paused ?? true,
      videoRect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      playerInBody: document.querySelector('#movie_player')?.parentElement === document.body,
      theater: typeof theater?.hasAttribute === 'function' ? theater.hasAttribute('theater') : null,
      fullscreen: !!document.fullscreenElement,
      youtubeFullscreen: !!document.querySelector('.ytp-fullscreen'),
      theaterPreference: typeof window.__TT_THEATER_PREF === 'boolean'
        ? window.__TT_THEATER_PREF : null,
      pipButtonVisible: !!pip && pip.getBoundingClientRect().width > 0,
      captionsButtonPresent: !!captions, settingsButtonPresent: !!settings,
      controlX: { captions: left(captions), pip: left(pip), settings: left(settings) },
      controlDetails: { captions: describeControl(captions), pip: describeControl(pip),
        settings: describeControl(settings) },
      controlsChildren: Array.from(controls?.children || []).slice(0, 20).map(describeControl),
      pipButtonBetweenCaptionsAndSettings: !!captions && !!pip && !!settings &&
        !!(captions.compareDocumentPosition(pip) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        !!(pip.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING) };
  };
  const start = () => {
    if (state) return true;
    if (location.pathname !== '/watch') return false;
    if (document.fullscreenElement) return false;
    const player = document.getElementById('movie_player');
    const video = player?.querySelector('video.html5-main-video');
    if (!player || !video || !video.isConnected || video.readyState < 2 ||
        video.videoWidth < 1 || video.videoHeight < 1 || !document.body) return false;
    const parent = player.parentElement;
    const reference = player.nextSibling;
    if (!parent) return false;
    const previousStyle = player.getAttribute('style');
    const css = document.createElement('style');
    css.id = 'tt-floating-player-styles';
    css.textContent = style;
    const backdrop = document.createElement('div');
    backdrop.id = 'tt-floating-backdrop';
    const header = document.createElement('div');
    header.id = 'tt-floating-header';
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'tt-float-btn';
    restoreBtn.textContent = '⤢';
    restoreBtn.title = 'Restaurar ventana (F9)';
    restoreBtn.setAttribute('aria-label', 'Restaurar');
    if (typeof restoreBtn.addEventListener === 'function') {
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (typeof window !== 'undefined' && window.chrome?.webview?.postMessage) {
          window.chrome.webview.postMessage({ channel: 'window:restore-floating' });
        } else {
          stop();
        }
      });
    }
    header.appendChild(restoreBtn);
    if (typeof header.addEventListener === 'function') {
      header.addEventListener('mousedown', (e) => {
        if (e.button === 0 && e.target === header) {
          window.chrome?.webview?.postMessage?.({ channel: 'window:drag' });
        }
      });
    }
    const playing = !video.paused;
    const initialTime = video.currentTime;
    const initialVideo = video;
    const grips = [];
    const directions = ['top', 'bottom', 'left', 'right', 'topleft', 'topright', 'bottomleft', 'bottomright'];
    for (const dir of directions) {
      const grip = document.createElement('div');
      grip.className = 'tt-resize-grip tt-grip-' + dir;
      grip.setAttribute('data-direction', dir);
      if (typeof grip.addEventListener === 'function') {
        grip.addEventListener('pointerdown', (e) => {
          if (e.button === 0) {
            e.preventDefault();
            e.stopPropagation();
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
            e.preventDefault();
            e.stopPropagation();
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
            e.preventDefault();
            e.stopPropagation();
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
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        window.chrome?.webview?.postMessage?.({ channel: 'window:scale-floating', delta });
      }
    };
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('wheel', onWheel, { passive: false });
    }

    try {
      if (document.head) document.head.appendChild(css);
      else document.documentElement?.appendChild(css);
      document.body.appendChild(backdrop);
      document.body.appendChild(header);
      for (const grip of grips) {
        document.body.appendChild(grip);
      }
      // If a browser lacks moveBefore, a legacy DOM move may restart video.
      // Restore its playing state below if this happens; never hide failure.
      relocate(document.body, player, null);
      player.classList.add('tt-floating-player');
      document.documentElement.classList.add('tt-floating-mode');
      document.getElementById('tizentube-native-pip')?.setAttribute('aria-pressed', 'true');
      state = { parent, reference, player, previousStyle, css, backdrop, header, grips, onWheel };
      if (player.querySelector('video.html5-main-video') !== initialVideo)
        throw new Error('YouTube replaced the video element while floating');
      if (video.paused && playing) {
        if (Math.abs(video.currentTime - initialTime) > 3) video.currentTime = initialTime;
        video.play()?.catch?.(() => {});
      }
      return true;
    } catch (e) {
      console.warn('[TizenTube] Floating mode was cancelled:', String(e));
      stop();
      return false;
    }
  };
  const stop = () => {
    if (activeResize) {
      activeResize = null;
      try { window.chrome?.webview?.postMessage?.({ channel: 'window:resize-end' }); } catch (_) {}
    }
    const savedState = state;
    state = null;
    document.documentElement.classList.remove('tt-floating-mode');
    document.getElementById('tt-floating-backdrop')?.remove();
    document.getElementById('tt-floating-player-styles')?.remove();
    document.getElementById('tt-floating-header')?.remove();
    document.getElementById('tizentube-native-pip')?.setAttribute('aria-pressed', 'false');
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
    savedState?.header?.remove();
    // Dispatch window resize so YouTube player recalculates internal dimensions
    // rather than staying clipped/miniaturized in the corner.
    try { window.dispatchEvent(new Event('resize')); } catch (_) {}
    return true;
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
  window.__ttFloating = { start, stop, recover, diagnostics };
  window.addEventListener('pagehide', stop, { once: true });
})();
