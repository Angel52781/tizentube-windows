/**
 * TizenTube Windows - Toast Notification System
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Lightweight, accessible, non-intrusive floating toasts for events like
 * SponsorBlock segment skips, preference changes, and network notices.
 */

export class ToastNotification {
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
