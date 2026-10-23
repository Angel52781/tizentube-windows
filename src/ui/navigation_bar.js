/**
 * TizenTube Windows - Top Navigation Bar Component
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Provides clean in-app browsing controls, quick YouTube search,
 * mod status badges (AdBlock, SponsorBlock), settings trigger, and fullscreen toggle.
 */

export class NavigationBar {
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
