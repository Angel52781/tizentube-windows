/**
 * TizenTube Windows - SponsorBlock Base Engine
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Queries SponsorBlock API for video skip segments, tracks playback timeline,
 * provides timeline marker geometry for custom seekbars, and executes segment skips
 * with robust fail-open resilience against API downtime or network loss.
 */

export const SPONSORBLOCK_CATEGORIES = {
  sponsor: {
    color: '#00d400',
    name: 'Sponsor'
  },
  intro: {
    color: '#00ffff',
    name: 'Intermission / Intro'
  },
  outro: {
    color: '#0202ed',
    name: 'Endcards / Outro'
  },
  interaction: {
    color: '#cc00ff',
    name: 'Interaction Reminder'
  },
  selfpromo: {
    color: '#ffff00',
    name: 'Self-Promotion'
  },
  preview: {
    color: '#008fd6',
    name: 'Preview / Recap'
  },
  filler: {
    color: '#7300ff',
    name: 'Filler / Tangents'
  },
  music_offtopic: {
    color: '#ff9900',
    name: 'Music Off-Topic'
  },
  poi_highlight: {
    color: '#9b044c',
    name: 'Highlight'
  }
};

export class SponsorBlockBase {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      apiUrl: 'https://sponsor.ajay.app/api',
      fallbackApiUrls: [],
      categories: ['sponsor', 'intro', 'outro', 'selfpromo', 'interaction'],
      autoSkip: true,
      showNotice: true,
      timeoutMs: 4000,
      maxCacheSize: 100,
      circuitBreakerThreshold: 3,
      circuitCooldownMs: 60000,
      ...options
    };

    this.currentSegments = [];
    this.currentVideoId = null;
    this.skipCount = 0;
    this.lastSkipped = null;
    this.alreadySkippedSegments = new Set();
    this.fallbackUsed = false;
    this.fallbackUsedCount = 0;

    // Resilient bounded caching & deduplication to minimize network overhead and memory
    this.cache = new Map(); // videoId -> Array<Segment>
    this.inFlightRequests = new Map(); // videoId -> Promise<Array<Segment>>

    // Circuit breaker state for external API outages
    this.consecutiveFailures = 0;
    this.circuitCooldownUntil = 0;
  }

  /**
   * Updates enabled status.
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    const prev = this.options.enabled;
    this.options.enabled = Boolean(enabled);
    if (!this.options.enabled) {
      this.currentSegments = [];
    } else if (!prev && this.currentVideoId && !this.currentSegments.length) {
      void this.setVideo(this.currentVideoId);
    }
  }

  /**
   * Updates auto-skip preference.
   * @param {boolean} autoSkip 
   */
  setAutoSkip(autoSkip) {
    this.options.autoSkip = Boolean(autoSkip);
  }

  /**
   * Updates active category filters.
   * @param {Array<string>} categories 
   */
  setCategories(categories) {
    if (Array.isArray(categories)) {
      this.options.categories = [...categories];
    }
  }

  /**
   * Sets current active video ID and fetches segments from API with fail-open fallback.
   * @param {string} videoId 
   */
  async setVideo(videoId) {
    if (!videoId) return;
    if (videoId === this.currentVideoId && this.currentSegments.length > 0) return;

    this.currentVideoId = videoId;
    this.currentSegments = [];
    this.alreadySkippedSegments.clear();

    if (!this.options.enabled) return;

    try {
      const segments = await this.fetchSegments(videoId);
      // In YouTube's SPA, earlier network replies can arrive after navigating
      // to the next video. Never associate stale sponsor segments with it.
      if (videoId === this.currentVideoId && this.options.enabled) {
        this.currentSegments = segments;
      }
    } catch (err) {
      // SponsorBlock API downtime must never break video playback (fail-open)
      console.warn(`[SponsorBlock] Query failed for ${videoId} (fail-open):`, err.message);
      if (videoId === this.currentVideoId) this.currentSegments = [];
    }
  }

  /**
   * Fetches skip segments for a given video ID with timeout, circuit breaker,
   * bounded caching, and error protection.
   * @param {string} videoId 
   * @returns {Promise<Array>}
   */
  async fetchSegments(videoId) {
    if (!videoId) return [];

    // Return from bounded cache if previously fetched
    if (this.cache.has(videoId)) {
      return this.cache.get(videoId);
    }

    // Deduplicate concurrent in-flight requests for same video
    if (this.inFlightRequests.has(videoId)) {
      return this.inFlightRequests.get(videoId);
    }

    // Circuit breaker: fail-open immediately if API is in cooldown after repeated outages
    const now = Date.now();
    if (this.circuitCooldownUntil > now) {
      return [];
    }

    const fetchPromise = (async () => {
      try {
        if (typeof fetch === 'undefined') return [];

        const catsParam = encodeURIComponent(JSON.stringify(this.options.categories));
        const urlsToTry = [
          this.options.apiUrl,
          ...(Array.isArray(this.options.fallbackApiUrls) ? this.options.fallbackApiUrls : [])
        ];

        for (let i = 0; i < urlsToTry.length; i++) {
          const baseUrl = urlsToTry[i];
          const url = `${baseUrl}/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${catsParam}`;

          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timeoutMs = this.options.timeoutMs || 4000;
          const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

          try {
            const res = await fetch(url, {
              headers: { 'Accept': 'application/json' },
              signal: controller ? controller.signal : undefined
            });

            if (!res.ok) {
              if (res.status === 404) {
                // No segments exist for this video - cache empty array to avoid redundant queries
                this.setCache(videoId, []);
                this.consecutiveFailures = 0;
                return [];
              }
              if (res.status === 429) {
                // Rate limit encountered: trip circuit breaker with longer backoff
                this.consecutiveFailures = this.options.circuitBreakerThreshold;
                this.circuitCooldownUntil = Date.now() + Math.max(60000, this.options.circuitCooldownMs * 2);
                return [];
              }
              throw new Error(`HTTP ${res.status}`);
            }

            let data;
            try {
              data = await res.json();
            } catch (jsonErr) {
              throw new Error(`Malformed JSON response: ${jsonErr.message}`);
            }

            if (!Array.isArray(data)) {
              this.setCache(videoId, []);
              return [];
            }

            const segments = data
              .filter(item => Array.isArray(item.segment) && item.segment.length === 2 && !isNaN(item.segment[0]) && !isNaN(item.segment[1]))
              .map(item => {
                const catInfo = SPONSORBLOCK_CATEGORIES[item.category] || {
                  color: '#00d400',
                  name: item.category || 'Segment'
                };
                return {
                  category: item.category,
                  categoryName: catInfo.name,
                  color: catInfo.color,
                  start: Math.max(0, item.segment[0]),
                  end: Math.max(0, item.segment[1]),
                  segment: [Math.max(0, item.segment[0]), Math.max(0, item.segment[1])],
                  uuid: item.UUID || `${item.category}_${item.segment[0]}`
                };
              });

            this.setCache(videoId, segments);
            this.consecutiveFailures = 0;
            this.circuitCooldownUntil = 0;
            this.fallbackUsed = (baseUrl !== this.options.apiUrl);
            if (this.fallbackUsed) {
              this.fallbackUsedCount = (this.fallbackUsedCount || 0) + 1;
              console.info(`[SponsorBlock] Fallback mirror succeeded for ${videoId} using ${baseUrl}`);
            }
            return segments;
          } catch (err) {
            // If we have remaining fallback URLs to attempt, try next mirror
            if (i < urlsToTry.length - 1) {
              console.warn(`[SponsorBlock] Query to ${baseUrl} failed for ${videoId}, attempting fallback mirror:`, err.message);
              continue;
            }
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= this.options.circuitBreakerThreshold) {
              this.circuitCooldownUntil = Date.now() + this.options.circuitCooldownMs;
            }
            console.warn(`[SponsorBlock] Query failed for ${videoId} (fail-open):`, err.message);
            return [];
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
        }
        return [];
      } finally {
        this.inFlightRequests.delete(videoId);
      }
    })();

    this.inFlightRequests.set(videoId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Stores segments in bounded LRU cache, evicting oldest when limit exceeded.
   * @param {string} videoId 
   * @param {Array} segments 
   */
  setCache(videoId, segments) {
    if (!videoId) return;
    const max = this.options.maxCacheSize || 100;
    if (this.cache.size >= max) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(videoId, segments);
  }

  /**
   * Clears internal caches to minimize memory on trim or navigation.
   */
  clearCache() {
    this.cache.clear();
    this.inFlightRequests.clear();
    this.alreadySkippedSegments.clear();
  }

  /**
   * Resets engine state and clears all memory buffers.
   */
  dispose() {
    this.clearCache();
    this.currentSegments = [];
    this.currentVideoId = null;
    this.lastSkipped = null;
    this.consecutiveFailures = 0;
    this.circuitCooldownUntil = 0;
  }

  /**
   * Evaluates current playback time against active segments.
   * Returns skip details if inside an eligible segment, or null.
   * @param {number} currentTime Current video time in seconds
   * @returns {Object|null} Skip target information or null
   */
  checkSkip(currentTime) {
    if (!this.options.enabled || !this.options.autoSkip || !this.currentSegments.length) {
      return null;
    }

    for (const seg of this.currentSegments) {
      // Must match enabled categories
      if (!this.options.categories.includes(seg.category)) continue;

      const [start, end] = seg.segment;
      // Skip window check: if currently inside the segment
      if (currentTime >= start && currentTime < end - 0.2) {
        // Prevent repeated skips on the exact same segment if user seeks back into it
        if (this.alreadySkippedSegments.has(seg.uuid)) {
          continue;
        }

        this.skipCount++;
        this.alreadySkippedSegments.add(seg.uuid);
        this.lastSkipped = {
          uuid: seg.uuid,
          category: seg.category,
          categoryName: seg.categoryName,
          color: seg.color,
          start,
          end,
          targetTime: end
        };

        return end;
      }
    }

    return null;
  }

  /**
   * Computes normalized geometry (percentage values) for seekbar visualization.
   * @param {number} duration Video duration in seconds
   * @returns {Array<Object>} List of marker dimensions for UI rendering
   */
  getTimelineMarkers(duration) {
    if (!duration || duration <= 0 || !this.currentSegments.length) {
      return [];
    }

    return this.currentSegments
      .filter(seg => this.options.categories.includes(seg.category))
      .map(seg => {
        const startSec = Math.max(0, seg.start);
        const endSec = Math.min(duration, seg.end);
        const startPct = (startSec / duration) * 100;
        const widthPct = Math.max(0.2, ((endSec - startSec) / duration) * 100);

        return {
          category: seg.category,
          categoryName: seg.categoryName,
          color: seg.color,
          start: startSec,
          end: endSec,
          startPct: Math.min(100, Math.max(0, startPct)),
          widthPct: Math.min(100 - startPct, widthPct)
        };
      });
  }

  /**
   * Resets skip history for a segment (e.g., when user clicks undo).
   * @param {string} uuid 
   */
  resetSegmentSkip(uuid) {
    if (uuid) {
      this.alreadySkippedSegments.delete(uuid);
    }
  }

  getStats() {
    return {
      enabled: this.options.enabled,
      autoSkip: this.options.autoSkip,
      categories: [...this.options.categories],
      currentVideoId: this.currentVideoId,
      segmentCount: this.currentSegments.length,
      cachedVideosCount: this.cache.size,
      skipCount: this.skipCount,
      lastSkipped: this.lastSkipped,
      circuitBreakerTripped: this.circuitCooldownUntil > Date.now(),
      fallbackUsed: Boolean(this.fallbackUsed),
      fallbackUsedCount: this.fallbackUsedCount || 0
    };
  }
}
