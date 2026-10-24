/* TizenTube Windows — visible in-page Back control. GPL-3.0-only.
 * YouTube's own logo always goes home, not to the previously visited page.
 * An explicit history button is inserted alongside the native masthead menu.
 */
(() => {
  'use strict';
  if (window.__ttNavigationControls) return;
  const buttonId = 'tizentube-masthead-back';
  let watchdog = null;
  let observer = null;
  let queued = false;

  function mount() {
    const masthead = document.querySelector('ytd-masthead #start') ||
      document.querySelector('#masthead-container #start') ||
      document.querySelector('ytd-masthead #container');
    if (!masthead) return false;
    const existing = document.getElementById(buttonId);
    if (existing?.parentElement === masthead) return true;
    existing?.remove();
    const button = document.createElement('button');
    button.id = buttonId;
    button.type = 'button';
    button.className = 'tt-masthead-back';
    button.title = 'Retroceder a la página anterior (Alt + Izquierda)';
    button.setAttribute('aria-label', 'Retroceder');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M15 18l-6-6 6-6M9 12h11');
    svg.appendChild(arrow);
    button.appendChild(svg);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      // YouTube is a SPA: document-level native GoBack can miss transitions
      // recorded via pushState, but the browser History API preserves them.
      if (window.history && window.history.length > 1) window.history.back();
    });
    const guide = masthead.querySelector('#guide-button');
    if (guide?.nextSibling) masthead.insertBefore(button, guide.nextSibling);
    else masthead.insertBefore(button, masthead.firstChild);
    return true;
  }

  function scheduleMount() {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; mount(); }, 100);
  }

  function start() {
    mount();
    if (document.body && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        if (!document.getElementById(buttonId)?.isConnected) scheduleMount();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    watchdog = setInterval(() => { if (!document.getElementById(buttonId)?.isConnected) mount(); }, 3500);
    window.addEventListener('yt-navigate-finish', scheduleMount);
  }

  window.__ttNavigationControls = {
    mount,
    stop() {
      observer?.disconnect();
      if (watchdog) clearInterval(watchdog);
      window.removeEventListener('yt-navigate-finish', scheduleMount);
      document.getElementById(buttonId)?.remove();
    }
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
