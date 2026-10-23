/**
 * TizenTube Windows - AdBlock Base Interceptor
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Ports core TizenTube JSON response filtering logic for YouTube desktop/web,
 * stripping adPlacements, playerAds, and adSlots from API payloads,
 * coupled with cosmetic DOM element suppression and automated ad skip handling.
 */

export class AdBlockBase {
  constructor(options = {}) {
    this.options = {
      enabled: true,
      blockAdsInJson: true,
      cosmeticFilter: true,
      autoSkipVideoAds: true,
      ...options
    };

    this.blockedCount = 0;
    this.isHooked = false;
    this.skipObserver = null;
    this.adVideoSpeedupCount = 0;
    this._skipScheduled = false;
    this._wasAdPlaying = false;
    this._preAdRate = null;
    this._preAdMuted = null;
    this._origJsonParse = null;
    this._origResponseJson = null;
    this._domReadyListener = null;
    this.sponsoredObserver = null;
    this._sponsoredScanScheduled = false;
  }

  /**
   * Initializes JSON.parse and fetch/XHR hooks for YouTube responses.
   */
  install() {
    if (!this.options.enabled || this.isHooked) return;
    this.hookJsonParser();
    this.hookFetchResponseJson();
    this.attachDocumentFilters();
    this.isHooked = true;
  }

  /** WebView2 injects at document creation, often before <body> exists. */
  attachDocumentFilters() {
    if (typeof document === 'undefined') return;
    if (this.options.cosmeticFilter) this.injectCosmeticStyles();
    if (document.body) {
      if (this.options.cosmeticFilter) this.startSponsoredCardObserver();
      if (this.options.autoSkipVideoAds) this.startAutoSkipObserver();
    } else if (!this._domReadyListener && typeof document.addEventListener === 'function') {
      this._domReadyListener = () => {
        this._domReadyListener = null;
        if (!this.options.enabled) return;
        this.attachDocumentFilters();
      };
      document.addEventListener('DOMContentLoaded', this._domReadyListener, { once: true });
    }
  }

  /**
   * Toggles active adblock state at runtime.
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    this.options.enabled = Boolean(enabled);
    if (!this.options.enabled) {
      this.removeCosmeticStyles();
      this.stopAutoSkipObserver();
      this.stopSponsoredCardObserver();
    } else {
      if (!this.isHooked) {
        this.install();
      } else {
        this.attachDocumentFilters();
      }
    }
  }

  /**
   * Hooks JSON.parse globally to clean YouTube ad objects as they are deserialized.
   */
  hookJsonParser() {
    if (typeof JSON === 'undefined') return;
    if (this._origJsonParse) return; // Prevent double hooking

    const originalParse = JSON.parse;
    this._origJsonParse = originalParse;
    const self = this;

    JSON.parse = function (...args) {
      const result = originalParse.apply(this, args);
      // Avoid deleting similarly named fields in unrelated services (e.g.
      // account APIs) even when called from within the YouTube page.
      const youtubePayload = result && typeof result === 'object' && (
        'playerResponse' in result || 'videoDetails' in result || 'streamingData' in result
        || 'playabilityStatus' in result ||
        Boolean(result.contents?.twoColumnBrowseResultsRenderer
          || result.contents?.twoColumnSearchResultsRenderer
          || result.contents?.singleColumnBrowseResultsRenderer
          || result.contents?.tvBrowseRenderer)
        || Boolean(result.continuationContents?.richGridContinuation
          || result.continuationContents?.sectionListContinuation)
      );
      if (self.options.enabled && self.options.blockAdsInJson && youtubePayload) {
        try {
          self.cleanAdData(result);
        } catch (err) {
          // Fail-open: never let ad cleaning crash core page JSON deserialization
          console.warn('[AdBlock] Safe parse cleanup error (fail-open):', err.message);
        }
      }
      return result;
    };
  }

  /**
   * Modern YouTube desktop decodes its /youtubei/v1/player responses with
   * Response.json(), which does not need to call the page's JSON.parse hook.
   * Intercept only YouTube player responses; avoid modifying other sites,
   * account/OAuth responses, or arbitrary API payloads.
   */
  hookFetchResponseJson() {
    if (typeof Response === 'undefined' || !Response.prototype?.json || this._origResponseJson) return;
    const original = Response.prototype.json;
    this._origResponseJson = original;
    const self = this;

    Response.prototype.json = async function (...args) {
      const result = await original.apply(this, args);
      if (!self.options.enabled || !self.options.blockAdsInJson || !result || typeof result !== 'object') {
        return result;
      }
      try {
        const url = new URL(this.url);
        if ((url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com'
          || url.hostname === 'm.youtube.com') &&
          /^\/youtubei\/v1\/(player|browse|search|next)(?:\/|$)/.test(url.pathname)) {
          self.cleanAdData(result);
        }
      } catch (_) { /* Malformed or absent URL: never break playback. */ }
      return result;
    };
  }

  /**
   * Strips ad slots, player ads, and promotional banners from YouTube response object.
   * Based on TizenTube's proven structural cleaning approach.
   * @param {Object} obj Target JSON object
   */
  cleanAdData(obj) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.adPlacements) {
      delete obj.adPlacements;
      this.blockedCount++;
    }

    if (obj.playerAds) {
      delete obj.playerAds;
      this.blockedCount++;
    }

    if (obj.adSlots) {
      delete obj.adSlots;
      this.blockedCount++;
    }

    if (obj.adBreakHeartbeatParams) {
      delete obj.adBreakHeartbeatParams;
      this.blockedCount++;
    }

    if (obj.adBreakParams) {
      delete obj.adBreakParams;
      this.blockedCount++;
    }

    if (obj.paidContentOverlay) {
      obj.paidContentOverlay = null;
      this.blockedCount++;
    }

    // Clean playerResponse nested ad structures
    if (obj.playerResponse && typeof obj.playerResponse === 'object') {
      this.cleanAdData(obj.playerResponse);
    }

    // Clean masthead / home feed / search ad slots in browse responses
    if (obj.contents && typeof obj.contents === 'object') {
      this.cleanBrowseAds(obj.contents);
      this.cleanSearchAds(obj.contents);
    }

    // Clean continuation browse feeds
    if (obj.continuationContents && typeof obj.continuationContents === 'object') {
      this.cleanContinuationAds(obj.continuationContents);
    }

    // Remove shorts ads from feed entries
    if (Array.isArray(obj.entries)) {
      const beforeCount = obj.entries.length;
      obj.entries = obj.entries.filter(
        (elm) => !elm?.command?.reelWatchEndpoint?.adClientParams?.isAd
      );
      if (obj.entries.length < beforeCount) {
        this.blockedCount += (beforeCount - obj.entries.length);
      }
    }
  }

  /**
   * Cleans ad renderers from browse/feed responses.
   * @param {Object} contents 
   */
  cleanBrowseAds(contents) {
    if (!contents) return;

    // Desktop tabs: sectionListRenderer and modern richGridRenderer
    const tabs = contents.twoColumnBrowseResultsRenderer?.tabs;
    if (Array.isArray(tabs)) {
      for (const tab of tabs) {
        const tabContent = tab?.tabRenderer?.content;
        if (!tabContent) continue;

        // Classical section list
        if (Array.isArray(tabContent.sectionListRenderer?.contents)) {
          tabContent.sectionListRenderer.contents = this.removeSponsoredItems(tabContent.sectionListRenderer.contents);
        }

        // Modern rich grid feed (desktop YouTube homepage)
        if (Array.isArray(tabContent.richGridRenderer?.contents)) {
          tabContent.richGridRenderer.contents = this.removeSponsoredItems(tabContent.richGridRenderer.contents);
        }
      }
    }

    // Mobile / TV sectionListRenderer
    const tvSections = contents.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
    if (Array.isArray(tvSections)) {
      contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents =
        this.removeSponsoredItems(tvSections);
    }
  }

  /**
   * Cleans sponsored and promoted video ads from search results.
   * @param {Object} contents 
   */
  cleanSearchAds(contents) {
    if (!contents) return;
    const searchSections = contents.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
    if (Array.isArray(searchSections)) {
      for (const section of searchSections) {
        if (Array.isArray(section.itemSectionRenderer?.contents)) {
          section.itemSectionRenderer.contents = this.removeSponsoredItems(section.itemSectionRenderer.contents);
        }
      }
    }
  }

  /**
   * Cleans ad renderers from dynamic continuation payloads.
   * @param {Object} continuations 
   */
  cleanContinuationAds(continuations) {
    if (!continuations) return;
    if (Array.isArray(continuations.sectionListContinuation?.contents)) {
      continuations.sectionListContinuation.contents = this.removeSponsoredItems(continuations.sectionListContinuation.contents);
    }
    if (Array.isArray(continuations.richGridContinuation?.contents)) {
      continuations.richGridContinuation.contents = this.removeSponsoredItems(continuations.richGridContinuation.contents);
    }
  }

  /** Only remove recognized advertisement renderers, not ordinary videos. */
  removeSponsoredItems(items) {
    const adKeys = [
      'adSlotRenderer', 'inFeedAdRenderer', 'displayAdRenderer',
      'promotedVideoRenderer', 'promotedSparklesWebRenderer',
      'videoMastheadAdRenderer', 'videoMastheadAdV3Renderer',
      'searchPyvRenderer'
    ];
    return items.filter(item => {
      const nested = [item, item?.richItemRenderer?.content,
        item?.richSectionRenderer?.content, item?.itemSectionRenderer?.content];
      const sponsored = nested.some(part => part && adKeys.some(key => Object.hasOwn(part, key)));
      if (sponsored) this.blockedCount++;
      return !sponsored;
    });
  }

  /**
   * Injects CSS to hide ad banners, promotions, and sidebar sponsored items.
   */
  injectCosmeticStyles() {
    if (typeof document === 'undefined') return;

    const styleId = 'tizentube-adblock-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .video-ads,
      .ytp-ad-module,
      .ytp-ad-overlay-container,
      .ytp-ad-overlay-slot,
      .ytp-ad-image-overlay,
      ytd-promoted-sparkles-web-renderer,
      ytd-promoted-video-renderer,
      ytd-display-ad-renderer,
      ytd-compact-promoted-video-renderer,
      ytd-search-pyv-renderer,
      ytd-video-masthead-ad-renderer,
      ytd-video-masthead-ad-v3-renderer,
      ytd-video-masthead-ad-primary-video-renderer,
      ytd-banner-promo-renderer,
      ytd-ad-slot-renderer,
      #player-ads,
      #masthead-ad,
      ytd-companion-slot-renderer,
      ytd-in-feed-ad-layout-renderer,
      ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
      ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer),
      ytd-rich-item-renderer:has(ytd-display-ad-renderer),
      ytd-rich-section-renderer:has(ytd-ad-slot-renderer),
      ytd-rich-section-renderer:has(ytd-video-masthead-ad-v3-renderer),
      ytd-rich-section-renderer:has(yt-promoted-card),
      ytd-rich-item-renderer:has(a[href*="/pagead/aclk"]),
      ytd-rich-item-renderer:has(a[href*="googleadservices.com"]),
      ytd-rich-section-renderer:has(a[href*="/pagead/aclk"]),
      ytd-rich-section-renderer:has(a[href*="googleadservices.com"]),
      [data-tizentube-sponsored="true"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        pointer-events: none !important;
      }
    `;

    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
    }
  }

  /** Remove the enclosing feed card, not just its inner sponsored banner. */
  scanSponsoredCards() {
    if (!this.options.enabled || !this.options.cosmeticFilter || typeof document === 'undefined') return;
    const markers = [
      'ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer',
      'ytd-display-ad-renderer', 'ytd-promoted-video-renderer',
      'ytd-promoted-sparkles-web-renderer', 'ytd-video-masthead-ad-v3-renderer'
    ];
    if (typeof document.querySelectorAll !== 'function') return;
    for (const marker of document.querySelectorAll(markers.join(','))) {
      const card = marker.closest?.('ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-item-section-renderer');
      this.markSponsoredCard(card);
    }

    // A logged-in YouTube feed can render a sponsored video inside a normal
    // rich-item/section container without an ad-slot-renderer. Recognize only
    // an explicit ad badge or a known ad-click URL inside that *feed card*;
    // never search comments, titles or the entire document for ad keywords.
    for (const card of document.querySelectorAll(
      'ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-item-section-renderer, ytd-video-renderer'
    )) {
      if (card.getAttribute?.('data-tizentube-sponsored') === 'true') continue;
      const adLink = card.querySelector?.(
        'a[href*="/pagead/aclk"], a[href*="googleadservices.com"], a[href*="doubleclick.net"]'
      );
      const badges = card.querySelectorAll?.(
        '#ad-badge, #ad-badge-container, yt-badge-shape, .badge-shape, ytd-badge-supported-renderer'
      ) || [];
      const adBadge = Array.from(badges).some(badge => {
        const label = String(badge.getAttribute?.('aria-label') || badge.textContent || '')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        return /^(patrocinad[oa]s?|promocionad[oa]s?|sponsored|promoted|advertisement|publicidad|anuncio|paid promotion|ad)$/.test(label);
      });
      if (adLink || adBadge) this.markSponsoredCard(card);
    }
  }

  markSponsoredCard(card) {
    if (!card || typeof card.setAttribute !== 'function') return;
    if (card.getAttribute?.('data-tizentube-sponsored') === 'true') return;
    card.setAttribute('data-tizentube-sponsored', 'true');
    this.blockedCount++;
  }

  startSponsoredCardObserver() {
    if (this.sponsoredObserver || typeof MutationObserver === 'undefined' || !document.body) return;
    this.scanSponsoredCards();
    this.sponsoredObserver = new MutationObserver(() => {
      if (this._sponsoredScanScheduled) return;
      this._sponsoredScanScheduled = true;
      const run = () => {
        this._sponsoredScanScheduled = false;
        this.scanSponsoredCards();
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 50);
    });
    this.sponsoredObserver.observe(document.body, { childList: true, subtree: true });
  }

  stopSponsoredCardObserver() {
    this.sponsoredObserver?.disconnect();
    this.sponsoredObserver = null;
    this._sponsoredScanScheduled = false;
  }

  /**
   * Removes injected cosmetic CSS.
   */
  removeCosmeticStyles() {
    if (typeof document === 'undefined') return;
    const style = document.getElementById('tizentube-adblock-styles');
    if (style && style.parentNode) {
      style.parentNode.removeChild(style);
    }
  }

  /**
   * Observes player DOM for video ad elements and skips them immediately.
   * Employs requestAnimationFrame throttling to minimize CPU cycles on high-mutation feeds.
   */
  startAutoSkipObserver() {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    if (this.skipObserver) return;

    const trySkip = () => {
      this._skipScheduled = false;
      if (!this.options.enabled || !this.options.autoSkipVideoAds) return;

      // 1. Detect and click skip buttons
      const skipSelectors = [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        '.ytp-skip-ad-button-modern',
        '.videoAdUiSkipButton',
        'button.ytp-ad-skip-button-modern',
        'button.ytp-skip-ad-button'
      ];

      for (const sel of skipSelectors) {
        const btn = document.querySelector(sel);
        if (btn && typeof btn.click === 'function') {
          btn.click();
          this.blockedCount++;
          break;
        }
      }

      // 2. If video player is marked as showing an ad (.ad-showing), speed through it and mute
      const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
      const isAdShowing = Boolean(player && player.classList && player.classList.contains('ad-showing'));
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');

      if (isAdShowing) {
        if (video && !isNaN(video.duration) && video.duration > 0) {
          try {
            if (!this._wasAdPlaying) {
              this._preAdRate = video.playbackRate || 1.0;
              this._preAdMuted = video.muted || false;
              this._wasAdPlaying = true;
            }
            video.muted = true;
            video.playbackRate = 16.0;
            video.currentTime = video.duration;
            this.adVideoSpeedupCount++;
          } catch (_) {}
        }
      } else if (this._wasAdPlaying) {
        // Ad finished: cleanly restore user's preferred speed and mute state
        this._wasAdPlaying = false;
        if (video) {
          try {
            if (this._preAdRate !== null) video.playbackRate = this._preAdRate;
            if (this._preAdMuted !== null) video.muted = this._preAdMuted;
          } catch (_) {}
        }
        this._preAdRate = null;
        this._preAdMuted = null;
      }
    };

    this.skipObserver = new MutationObserver(() => {
      if (!this._skipScheduled) {
        this._skipScheduled = true;
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(trySkip);
        } else {
          setTimeout(trySkip, 50);
        }
      }
    });

    const target = document.body || document.documentElement;
    if (target) {
      this.skipObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  }

  /**
   * Stops auto-skip observer.
   */
  stopAutoSkipObserver() {
    if (this.skipObserver) {
      this.skipObserver.disconnect();
      this.skipObserver = null;
    }
    this._skipScheduled = false;
  }

  /**
   * Disposes adblock resources and restores global hooks.
   */
  dispose() {
    this.stopAutoSkipObserver();
    this.stopSponsoredCardObserver();
    if (this._domReadyListener && typeof document !== 'undefined') {
      document.removeEventListener?.('DOMContentLoaded', this._domReadyListener);
      this._domReadyListener = null;
    }
    this.removeCosmeticStyles();
    if (this._origJsonParse && typeof JSON !== 'undefined') {
      JSON.parse = this._origJsonParse;
      this._origJsonParse = null;
    }
    if (this._origResponseJson && typeof Response !== 'undefined') {
      Response.prototype.json = this._origResponseJson;
      this._origResponseJson = null;
    }
    this.isHooked = false;
  }

  getStats() {
    return {
      enabled: this.options.enabled,
      blockedCount: this.blockedCount,
      adVideoSpeedupCount: this.adVideoSpeedupCount,
      isHooked: this.isHooked
    };
  }
}
