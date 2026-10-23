/**
 * TizenTube Windows - Player Controls HUD
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Rich media playback interface with SponsorBlock segment timeline markers,
 * smooth scrub seeking, playback rate selector, volume slider, and responsive layout.
 */

export class PlayerControls {
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
