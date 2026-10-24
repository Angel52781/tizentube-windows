/**
 * TizenTube Windows - DeArrow Base Engine
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Queries DeArrow API for crowdsourced titles and thumbnails to replace
 * clickbait thumbnails and sensationalist video titles on YouTube feeds and player,
 * with fail-open fallback and non-destructive DOM modification.
 */

export class DeArrowBase {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      apiUrl: 'https://dearrow-thumb.ajay.app/api/v1',
      fallbackApiUrls: [],
      replaceThumbnails: true,
      replaceTitles: true,
      timeoutMs: 4000,
      maxCacheSize: 300,
      circuitBreakerThreshold: 3,
      circuitCooldownMs: 60000,
      batchChunkSize: 30,
      ...options
    };

    this.cache = new Map();
    this.inFlightRequests = new Map();
    this.pendingIds = new Set();
    this.replacementsApplied = 0;
    this.fallbackUsed = false;
    this.fallbackUsedCount = 0;
    this.observer = null;
    this.batchTimeout = null;

    // Circuit breaker state for external API outages
    this.consecutiveFailures = 0;
    this.circuitCooldownUntil = 0;
  }

  /**
   * Sets enabled state.
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    const prev = this.options.enabled;
    this.options.enabled = Boolean(enabled);
    if (!this.options.enabled) {
      this.stopDomObserver();
      this.restoreOriginals();
    } else {
      this.startDomObserver();
      if (!prev) {
        this.applyToDom();
      }
    }
  }

  /**
   * Updates feature flags.
   */
  setOptions(newOpts = {}) {
    const prevTitles = this.options.replaceTitles;
    const prevThumbs = this.options.replaceThumbnails;
    Object.assign(this.options, newOpts);

    if (prevTitles && !this.options.replaceTitles) {
      this.restoreOriginalTitles();
    }
    if (prevThumbs && !this.options.replaceThumbnails) {
      this.restoreOriginalThumbnails();
    }
    if (this.options.enabled && (this.options.replaceTitles || this.options.replaceThumbnails)) {
      this.applyToDom();
    }
  }

  /**
   * Stores branding item in bounded LRU cache.
   * @param {string} videoId 
   * @param {Object} branding 
   */
  setCacheItem(videoId, branding) {
    if (!videoId) return;
    const max = this.options.maxCacheSize || 300;
    if (this.cache.size >= max) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(videoId, branding);
  }

  /**
   * Fetches DeArrow branding data for a video or list of video IDs with fail-open safety,
   * bounded memory caching, request deduplication, and circuit breaker.
   * @param {string|Array<string>} videoIds 
   * @returns {Promise<Object>} Map of videoId -> DeArrow branding data
   */
  async fetchBranding(videoIds) {
    if (!this.options.enabled || typeof fetch === 'undefined') return {};
    const ids = (Array.isArray(videoIds) ? videoIds : [videoIds]).filter(Boolean);
    const uncached = ids.filter(id => !this.cache.has(id));

    if (uncached.length === 0) {
      return this.getCached(ids);
    }

    // Circuit breaker check
    const now = Date.now();
    if (this.circuitCooldownUntil > now) {
      return this.getCached(ids);
    }

    // Chunk uncached requests into batches of max 30 to avoid URI length overflow
    const chunkSize = this.options.batchChunkSize || 30;
    const chunks = [];
    for (let i = 0; i < uncached.length; i += chunkSize) {
      chunks.push(uncached.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      const chunkKey = chunk.sort().join(',');
      if (this.inFlightRequests.has(chunkKey)) {
        await this.inFlightRequests.get(chunkKey);
        continue;
      }

      const chunkPromise = (async () => {
        const urlsToTry = [
          this.options.apiUrl,
          ...(Array.isArray(this.options.fallbackApiUrls) ? this.options.fallbackApiUrls : [])
        ];

        for (let i = 0; i < urlsToTry.length; i++) {
          const baseUrl = urlsToTry[i];
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timeoutMs = this.options.timeoutMs || 4000;
          const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

          try {
            const url = `${baseUrl}/branding?videoIDs=${encodeURIComponent(JSON.stringify(chunk))}`;
            const res = await fetch(url, {
              headers: { 'Accept': 'application/json' },
              signal: controller ? controller.signal : undefined
            });

            if (!res.ok) {
              if (res.status === 404) {
                return;
              }
              if (res.status === 429) {
                this.consecutiveFailures = this.options.circuitBreakerThreshold;
                this.circuitCooldownUntil = Date.now() + Math.max(60000, this.options.circuitCooldownMs * 2);
                return;
              }
              throw new Error(`HTTP ${res.status}`);
            }

            let data;
            try {
              data = await res.json();
            } catch (jsonErr) {
              throw new Error(`Malformed JSON response from DeArrow: ${jsonErr.message}`);
            }

            if (Array.isArray(data)) {
              for (const item of data) {
                if (item && item.videoID) {
                  const titleObj = Array.isArray(item.titles) ? item.titles.find(t => !t.locked) || item.titles[0] : null;
                  const thumbObj = Array.isArray(item.thumbnails) ? item.thumbnails.find(t => !t.locked) || item.thumbnails[0] : null;

                  this.setCacheItem(item.videoID, {
                    videoID: item.videoID,
                    title: titleObj?.title || null,
                    thumbnail: thumbObj?.timestamp ? `${baseUrl}/thumbnail?videoID=${item.videoID}&time=${thumbObj.timestamp}` : null,
                    original: item
                  });
                }
              }
            }

            this.consecutiveFailures = 0;
            this.circuitCooldownUntil = 0;
            this.fallbackUsed = (baseUrl !== this.options.apiUrl);
            if (this.fallbackUsed) {
              this.fallbackUsedCount = (this.fallbackUsedCount || 0) + 1;
              console.info(`[DeArrow] Fallback mirror succeeded using ${baseUrl}`);
            }
            return;
          } catch (err) {
            if (i < urlsToTry.length - 1) {
              console.warn(`[DeArrow] Query to ${baseUrl} failed, trying fallback mirror:`, err.message);
              continue;
            }
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= this.options.circuitBreakerThreshold) {
              this.circuitCooldownUntil = Date.now() + this.options.circuitCooldownMs;
            }
            console.warn('[DeArrow] API query failed (fail-open):', err.message);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }
      })();

      this.inFlightRequests.set(chunkKey, chunkPromise);
      try {
        await chunkPromise;
      } finally {
        this.inFlightRequests.delete(chunkKey);
      }
    }

    return this.getCached(ids);
  }

  /**
   * Reads cached branding records.
   * @param {Array<string>} ids 
   * @returns {Object}
   */
  getCached(ids) {
    const result = {};
    for (const id of ids) {
      if (this.cache.has(id)) {
        result[id] = this.cache.get(id);
      }
    }
    return result;
  }

  /**
   * Clears in-memory caches to minimize footprint on navigation or memory trim.
   */
  clearCache() {
    this.cache.clear();
    this.inFlightRequests.clear();
    this.pendingIds.clear();
  }

  /**
   * Disposes timers, observers, and caches.
   */
  dispose() {
    this.stopDomObserver();
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    this.clearCache();
    this.consecutiveFailures = 0;
    this.circuitCooldownUntil = 0;
  }

  /**
   * Applies DeArrow replacements to DOM elements found within rootElement.
   * @param {HTMLElement} [rootElement]
   */
  async applyToDom(rootElement = typeof document !== 'undefined' ? document : null) {
    if (!this.options.enabled || !rootElement) return 0;

    // Discover video renderers (YouTube desktop, mobile, TV)
    const videoCards = rootElement.querySelectorAll(
      'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model, ytd-playlist-video-renderer, ytd-reel-item-renderer'
    );

    const idsToFetch = [];
    const elementsToPatch = [];

    videoCards.forEach(card => {
      // Find video link
      const link = card.querySelector('a#video-title-link, a#thumbnail, a[href*="watch?v="]');
      if (!link || !link.href) return;

      const urlMatch = link.href.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      const videoId = urlMatch ? urlMatch[1] : null;
      if (!videoId) return;

      if (!card.dataset.dearrowProcessed) {
        elementsToPatch.push({ card, videoId });
        if (!this.cache.has(videoId)) {
          idsToFetch.push(videoId);
        }
      }
    });

    if (idsToFetch.length > 0) {
      await this.fetchBranding(idsToFetch);
    }

    let modified = 0;
    for (const { card, videoId } of elementsToPatch) {
      const branding = this.cache.get(videoId);
      if (!branding) {
        card.dataset.dearrowProcessed = 'empty';
        continue;
      }

      // 1. Replace Title
      if (this.options.replaceTitles && branding.title) {
        const titleEl = card.querySelector('#video-title, .yt-core-attributed-string, [id="video-title"]');
        if (titleEl && titleEl.textContent !== branding.title) {
          titleEl.setAttribute('data-original-title', titleEl.textContent || '');
          titleEl.textContent = branding.title;
          titleEl.title = branding.title;
          modified++;
        }
      }

      // 2. Replace Thumbnail
      if (this.options.replaceThumbnails && branding.thumbnail) {
        const img = card.querySelector('ytd-thumbnail img, yt-image img, img.yt-core-image');
        if (img && img.src !== branding.thumbnail) {
          img.setAttribute('data-original-src', img.src || '');
          img.src = branding.thumbnail;
          modified++;
        }
      }

      card.dataset.dearrowProcessed = 'true';
    }

    this.replacementsApplied += modified;
    return modified;
  }

  /**
   * Starts MutationObserver to automatically apply DeArrow to dynamic content feeds.
   */
  startDomObserver() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    if (this.observer) return;

    let timeout = null;
    this.observer = new MutationObserver(() => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (this.options.enabled) {
          this.applyToDom();
        }
      }, 500);
    });

    const target = document.querySelector('ytd-app') || document.body;
    if (target) {
      this.observer.observe(target, { childList: true, subtree: true });
    }
  }

  /**
   * Stops DOM observer.
   */
  stopDomObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Restores original titles and thumbnails across all modified elements in rootElement.
   * @param {HTMLElement} [rootElement]
   */
  restoreOriginals(rootElement = typeof document !== 'undefined' ? document : null) {
    this.restoreOriginalTitles(rootElement);
    this.restoreOriginalThumbnails(rootElement);
  }

  /**
   * Restores original titles from data-original-title attribute.
   * @param {HTMLElement} [rootElement]
   */
  restoreOriginalTitles(rootElement = typeof document !== 'undefined' ? document : null) {
    if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return;
    const elements = rootElement.querySelectorAll('[data-original-title]');
    elements.forEach(el => {
      const orig = el.getAttribute('data-original-title');
      if (orig !== null) {
        el.textContent = orig;
        el.title = orig;
        el.removeAttribute('data-original-title');
      }
    });
    const cards = rootElement.querySelectorAll('[data-dearrow-processed]');
    cards.forEach(c => {
      if (!c.querySelector?.('[data-original-src]')) {
        if (typeof c.removeAttribute === 'function') c.removeAttribute('data-dearrow-processed');
        if (c.dataset) delete c.dataset.dearrowProcessed;
      }
    });
  }

  /**
   * Restores original thumbnail URLs from data-original-src attribute.
   * @param {HTMLElement} [rootElement]
   */
  restoreOriginalThumbnails(rootElement = typeof document !== 'undefined' ? document : null) {
    if (!rootElement || typeof rootElement.querySelectorAll !== 'function') return;
    const elements = rootElement.querySelectorAll('[data-original-src]');
    elements.forEach(el => {
      const orig = el.getAttribute('data-original-src');
      if (orig !== null) {
        el.src = orig;
        el.removeAttribute('data-original-src');
      }
    });
    const cards = rootElement.querySelectorAll('[data-dearrow-processed]');
    cards.forEach(c => {
      if (!c.querySelector?.('[data-original-title]')) {
        if (typeof c.removeAttribute === 'function') c.removeAttribute('data-dearrow-processed');
        if (c.dataset) delete c.dataset.dearrowProcessed;
      }
    });
  }

  getStats() {
    return {
      enabled: this.options.enabled,
      replaceTitles: this.options.replaceTitles,
      replaceThumbnails: this.options.replaceThumbnails,
      cachedCount: this.cache.size,
      replacementsApplied: this.replacementsApplied,
      circuitBreakerTripped: this.circuitCooldownUntil > Date.now(),
      fallbackUsed: Boolean(this.fallbackUsed),
      fallbackUsedCount: this.fallbackUsedCount || 0
    };
  }
}
