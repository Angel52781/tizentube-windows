/**
 * TizenTube Windows - Navigation Manager
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Handles URL sanitization, search queries, in-app navigation,
 * and security containment to prevent external window popups.
 */

export class NavigationManager {
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
