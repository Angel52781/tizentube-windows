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
    this._origJsonStringify = null;
    this._origResponseJson = null;
    this._domReadyListener = null;
    this.sponsoredObserver = null;
    this._sponsoredScanScheduled = false;
    this._diagnosticKeyHandler = null;
  }

  /**
   * Initializes JSON.parse and fetch/XHR hooks for YouTube responses.
   */
  install() {
    if (!this.options.enabled || this.isHooked) return;
    this.hookJsonParser();
    this.hookTvInlinePlayback();
    this.hookFetchResponseJson();
    this.attachDocumentFilters();
    this.installDiagnosticShortcut();
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
   * TizenTube TV upstream also patches JSON.stringify so inline playback
   * requests include isInlinePlaybackNoAd=true. Scope this to /tv only;
   * modifying desktop InnerTube requests can break ordinary videos.
   */
  hookTvInlinePlayback() {
    if (this._origJsonStringify || typeof JSON === 'undefined') return;
    const original = JSON.stringify;
    const self = this;
    this._origJsonStringify = original;
    JSON.stringify = function (value, replacer, space) {
      const tvPage = typeof location !== 'undefined'
        && /^\/tv(?:\/|$)/.test(location.pathname || '');
      const context = value?.playbackContext?.contentPlaybackContext;
      if (tvPage && self.options.enabled && context && !context.isInlinePlaybackNoAd) {
        value = { ...value, playbackContext: { ...value.playbackContext,
          contentPlaybackContext: { ...context, isInlinePlaybackNoAd: true } } };
      }
      return original.call(this, value, replacer, space);
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

    // Original TizenTube (mods/features/adblock.js, f99945a) targets
    // YouTube TV. It preserves ad fields with empty values instead of
    // deleting properties. Desktop YouTube has different response contracts;
    // retain the port's existing behavior there until it is E2E verified.
    const isTvPayload = Boolean(obj.contents?.tvBrowseRenderer)
      || (typeof location !== 'undefined' && /^\/tv(?:\/|$)/.test(location.pathname || ''));

    // Desktop player responses carry the streaming contract. Removing ad
    // properties here can invalidate playback on accounts/regions not used
    // by CI. Fail open on the player; feed cosmetics remain independently on.
    if (!isTvPayload && (obj.streamingData || obj.playabilityStatus)) return;

    if (obj.adPlacements) {
      if (isTvPayload) obj.adPlacements = [];
      else delete obj.adPlacements;
      this.blockedCount++;
    }

    if (obj.playerAds) {
      if (isTvPayload) obj.playerAds = false;
      else delete obj.playerAds;
      this.blockedCount++;
    }

    if (obj.adSlots) {
      if (isTvPayload) obj.adSlots = [];
      else delete obj.adSlots;
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

    // Clean masthead / home feed / search / watch ad slots in browse & watch responses
    if (obj.contents && typeof obj.contents === 'object') {
      this.cleanBrowseAds(obj.contents);
      this.cleanSearchAds(obj.contents);
      this.cleanWatchAds(obj.contents);
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
    const tabs = contents.twoColumnBrowseResultsRenderer?.tabs
      || contents.singleColumnBrowseResultsRenderer?.tabs;
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

    // Secondary contents in twoColumnBrowseResultsRenderer
    if (Array.isArray(contents.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents)) {
      contents.twoColumnBrowseResultsRenderer.secondaryContents.sectionListRenderer.contents =
        this.removeSponsoredItems(contents.twoColumnBrowseResultsRenderer.secondaryContents.sectionListRenderer.contents);
    }

    // Mobile / TV sectionListRenderer
    const tvSections = contents.tvBrowseRenderer?.content?.tvSurfaceContentRenderer?.content?.sectionListRenderer?.contents;
    if (Array.isArray(tvSections)) {
      const filtered = this.removeSponsoredItems(tvSections);
      for (const section of filtered) {
        // Exact structural analogue of the original TV shelf ad removal.
        const tiles = section.shelfRenderer?.content?.horizontalListRenderer?.items;
        if (Array.isArray(tiles)) {
          section.shelfRenderer.content.horizontalListRenderer.items = this.removeSponsoredItems(tiles);
        }
      }
      contents.tvBrowseRenderer.content.tvSurfaceContentRenderer.content.sectionListRenderer.contents = filtered;
    }
  }

  /**
   * Cleans ad slots and sponsored companion items from watch page responses.
   * Handles twoColumnWatchNextResults and singleColumnWatchNextResults.
   * @param {Object} contents
   */
  cleanWatchAds(contents) {
    if (!contents) return;

    // Desktop two-column watch next results (secondary sidebar & primary panels)
    const watchNext = contents.twoColumnWatchNextResults;
    if (watchNext) {
      const secondaryResults = watchNext.secondaryResults?.secondaryResults?.results;
      if (Array.isArray(secondaryResults)) {
        watchNext.secondaryResults.secondaryResults.results = this.removeSponsoredItems(secondaryResults);
      }
      const secondarySectionList = watchNext.secondaryResults?.secondaryResults?.sectionListRenderer?.contents;
      if (Array.isArray(secondarySectionList)) {
        watchNext.secondaryResults.secondaryResults.sectionListRenderer.contents = this.removeSponsoredItems(secondarySectionList);
      }
    }

    // Single column watch next results (fallback / compact layouts)
    const singleSections = contents.singleColumnWatchNextResults?.pivot?.sectionListRenderer?.contents;
    if (Array.isArray(singleSections)) {
      contents.singleColumnWatchNextResults.pivot.sectionListRenderer.contents = this.removeSponsoredItems(singleSections);
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
      'videoMastheadAdPrimaryVideoRenderer',
      'searchPyvRenderer', 'brandVideoSingletonRenderer',
      'statementBannerRenderer', 'adSlotHeaderRenderer',
      'compactPromotedVideoRenderer', 'compactPromotedItemRenderer',
      'actionCompanionAdRenderer'
    ];
    return items.filter(item => {
      const nested = [
        item,
        item?.richItemRenderer?.content,
        item?.richSectionRenderer?.content,
        item?.itemSectionRenderer?.content,
        item?.compactVideoRenderer
      ];
      const sponsored = nested.some(part => {
        if (!part) return false;
        if (adKeys.some(key => Object.hasOwn(part, key))) return true;
        if (part?.adClientParams?.isAd === true) return true;
        return false;
      });
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
      .ytp-ad-player-overlay,
      .ytp-ad-player-overlay-layout,
      .ytp-ad-message-container,
      .ytp-ad-progress,
      .ytp-ad-progress-list,
      .ytp-ad-overlay-close-button,
      ytd-promoted-sparkles-web-renderer,
      ytd-promoted-video-renderer,
      ytd-display-ad-renderer,
      ytd-compact-promoted-video-renderer,
      ytd-compact-promoted-item-renderer,
      ytd-action-companion-ad-renderer,
      ytd-ad-slot-header-renderer,
      ytd-statement-banner-renderer,
      ytd-player-legacy-desktop-watch-ads-renderer,
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
      ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
      #panels:has(ytd-ads-engagement-panel-content-renderer),
      #panels:has(ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]),
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
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').trim().toLowerCase();
        return /^(patrocinad[oa]s?|promocionad[oa]s?|sponsored|promoted|advertisement|publicidad|anuncio|paid promotion|ad|sponsoris[eé]e?|publicit[eé]|annonce|gesponsert|anzeige|werbung|sponsorizzato|annuncio|スポンサー|広告)$/i.test(label);
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
   * Local, opt-in diagnosis of unrecognized ad DOM structures. The report
   * includes only element TAG/ID names and recognized ad badges; no cookies,
   * account names, video IDs, ad URLs, titles, comments or DOM innerHTML.
   */
  collectSponsoredDiagnostics() {
    const data = { schema: 'tizentube.adblock.dom.v1',
      timestamp: new Date().toISOString(), cards: [], badgeAncestors: [],
      counts: {} };
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return data;

    const known = ['ytd-ad-slot-renderer', 'ytd-video-masthead-ad-v3-renderer',
      'ytd-in-feed-ad-layout-renderer', '[data-tizentube-sponsored="true"]'];
    for (const selector of known) {
      data.counts[selector] = document.querySelectorAll(selector).length;
    }
    const badgePattern = /^(patrocinad[oa]s?|promocionad[oa]s?|sponsored|promoted|advertisement|publicidad|anuncio|paid promotion|ad|sponsoris[eé]e?|publicit[eé]|annonce|gesponsert|anzeige|werbung|sponsorizzato|annuncio|スポンサー|広告)$/i;
    const candidates = document.querySelectorAll(
      'span, yt-formatted-string, yt-attributed-string, yt-badge-shape, yt-badge-shape-element'
    );
    for (const element of candidates) {
      if (data.badgeAncestors.length >= 12) break;
      if (element.children?.length) continue;
      const label = String(element.textContent || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').trim();
      if (!badgePattern.test(label)) continue;
      const ancestry = [];
      let node = element;
      for (let depth = 0; depth < 9 && node; depth++, node = node.parentElement) {
        ancestry.push({ tag: String(node.tagName || '').toLowerCase().slice(0, 70),
          id: String(node.id || '').slice(0, 70) });
      }
      data.badgeAncestors.push({ badge: label.toLowerCase(), ancestry });
    }
    return data;
  }

  installDiagnosticShortcut() {
    if (typeof window === 'undefined' || this._diagnosticKeyHandler) return;
    this._diagnosticKeyHandler = e => {
      if (!e.ctrlKey || !e.shiftKey || e.code !== 'F10' || e.repeat) return;
      e.preventDefault?.();
      const payload = this.collectSponsoredDiagnostics();
      try {
        window.chrome?.webview?.postMessage({ channel: 'adblock:diagnostic', payload });
      } catch (_) { /* Keep playback working when host IPC is unavailable. */ }
      console.info('[TizenTube] Local structural ad diagnostic requested');
    };
    window.addEventListener?.('keydown', this._diagnosticKeyHandler, true);
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
        'button.ytp-skip-ad-button',
        '.ytp-ad-skip-button-container button',
        'button.ytp-ad-skip-button-text',
        '.ytp-ad-overlay-close-button',
        '.ytp-ad-overlay-close-container button'
      ];

      for (const sel of skipSelectors) {
        const btn = document.querySelector(sel);
        if (btn && typeof btn.click === 'function') {
          btn.click();
          this.blockedCount++;
          break;
        }
      }

      // 2. If video player is marked as showing an ad (.ad-showing / .ad-interrupting), speed through it and mute
      const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
      const isAdShowing = Boolean(player && player.classList && (
        player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')
      ));
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
    if (this._diagnosticKeyHandler && typeof window !== 'undefined') {
      window.removeEventListener?.('keydown', this._diagnosticKeyHandler, true);
      this._diagnosticKeyHandler = null;
    }
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
    if (this._origJsonStringify && typeof JSON !== 'undefined') {
      JSON.stringify = this._origJsonStringify;
      this._origJsonStringify = null;
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
