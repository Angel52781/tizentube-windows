/**
 * TizenTube Windows - IPC Bridge
 * Copyright (C) 2026 TizenTube Windows Contributors
 * Licensed under the GNU General Public License v3.0 (GPL-3.0-only).
 *
 * Facilitates two-way asynchronous communication between native Windows host
 * (WebView2 CoreWebView2) and web client scripts / mods.
 */

export class IpcBridge {
  constructor() {
    this.handlers = new Map();
    this.isNativeAvailable = typeof window !== 'undefined' && 
                             window.chrome && 
                             window.chrome.webview && 
                             typeof window.chrome.webview.postMessage === 'function';

    this.init();
  }

  init() {
    if (this.isNativeAvailable) {
      window.chrome.webview.addEventListener('message', (event) => {
        this.dispatchMessage(event.data);
      });
    }
  }

  /**
   * Send message to native Windows host.
   * @param {string} channel Message topic
   * @param {any} payload Message payload
   */
  send(channel, payload = {}) {
    const message = {
      channel,
      payload,
      timestamp: Date.now()
    };

    if (this.isNativeAvailable) {
      window.chrome.webview.postMessage(message);
    } else {
      // In mock/test environments or direct browsers
      this.dispatchMessage(message);
    }
    return message;
  }

  /**
   * Register a message listener for a specific channel.
   * @param {string} channel 
   * @param {Function} handler 
   */
  on(channel, handler) {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
    }
    this.handlers.get(channel).push(handler);
  }

  /**
   * Internal message dispatcher.
   */
  dispatchMessage(data) {
    if (!data || typeof data !== 'object') return;
    const { channel, payload } = data;
    const list = this.handlers.get(channel) || [];
    for (const handler of list) {
      try {
        handler(payload, data);
      } catch (err) {
        console.error(`Error in IPC handler for ${channel}:`, err);
      }
    }
  }
}
