/**
 * TizenTube Windows - Settings & Preferences Modal
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Accessible configuration modal for toggling and customizing AdBlock,
 * SponsorBlock categories, DeArrow clickbait filters, and playback preferences.
 */

import { SPONSORBLOCK_CATEGORIES } from '../mods/sponsorblock_base.js';

export class SettingsModal {
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
