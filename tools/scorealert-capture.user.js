// ==UserScript==
// @name         ScoreAlert Capture
// @namespace    com.scorealert.app
// @version      0.1.0
// @description  Stream Facebook Marketplace / OfferUp / Craigslist listings you browse into ScoreAlert. Runs in YOUR browser, in YOUR session — no account automation, no scraping bot.
// @author       ScoreAlert
// @match        https://www.facebook.com/marketplace/*
// @match        https://web.facebook.com/marketplace/*
// @match        https://offerup.com/*
// @match        https://*.craigslist.org/search/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      *
// ==/UserScript==

/*
 * HOW THIS WORKS (and why it's the right approach for a personal tool):
 *   - It only reads listing cards that YOUR browser already rendered for YOU as you browse.
 *   - It does NOT log in for you, store your password, hit private APIs, rotate proxies,
 *     spoof anything, or bypass bot-detection. It's you, browsing, with a helper that
 *     forwards what you see to your own backend.
 *   - Keep the optional auto-scroll gentle. Hammering even your own session can trip a
 *     site's protections — this tool intentionally scrolls slowly and can be turned off.
 *
 * SETUP:
 *   1. Install Tampermonkey (Chrome) or Violentmonkey (Firefox).
 *   2. Add this script.
 *   3. Click the Tampermonkey menu → "ScoreAlert: set backend URL" and
 *      "ScoreAlert: set secret" (must match SCRAPE_INGEST_SECRET on your backend).
 *   4. Browse Marketplace / OfferUp / Craigslist. Captured counts show bottom-right.
 *
 * When the DOM changes (Facebook renames its classes often), update the selectors in
 * SITE_EXTRACTORS below. Everything is deliberately heuristic + resilient.
 */

(function () {
  'use strict';

  const CONFIG = {
    backendUrl: () => GM_getValue('backendUrl', 'https://your-scorealert-backend.example.com'),
    secret: () => GM_getValue('secret', ''),
    autoScroll: () => GM_getValue('autoScroll', false),
    scrollDelayMs: 2500,      // gentle
    flushEveryMs: 4000,       // batch POSTs
    maxBatch: 40,
  };

  GM_registerMenuCommand('ScoreAlert: set backend URL', () => {
    const v = prompt('ScoreAlert backend base URL (no trailing slash):', CONFIG.backendUrl());
    if (v) GM_setValue('backendUrl', v.replace(/\/$/, ''));
  });
  GM_registerMenuCommand('ScoreAlert: set secret', () => {
    const v = prompt('SCRAPE_INGEST_SECRET (must match backend):', CONFIG.secret());
    if (v != null) GM_setValue('secret', v);
  });
  GM_registerMenuCommand('ScoreAlert: toggle auto-scroll', () => {
    const next = !CONFIG.autoScroll();
    GM_setValue('autoScroll', next);
    badge(`auto-scroll ${next ? 'ON' : 'OFF'}`);
  });

  const source = detectSource(location.hostname);
  const seen = new Set();
  const queue = [];

  // --- per-site extractors -------------------------------------------------
  const SITE_EXTRACTORS = {
    facebook() {
      const cards = [];
      document.querySelectorAll('a[href*="/marketplace/item/"]').forEach((a) => {
        const url = absolute(a.getAttribute('href'));
        const id = (url.match(/item\/(\d+)/) || [])[1];
        if (!id) return;
        const lines = textLines(a);
        const price = lines.find((l) => /(^|\s)(\$[\d,]+|free)/i.test(l)) || '';
        const nonPrice = lines.filter((l) => l !== price);
        const title = longest(nonPrice) || a.getAttribute('aria-label') || '';
        const location = nonPrice[nonPrice.length - 1] !== title ? nonPrice[nonPrice.length - 1] : '';
        const img = a.querySelector('img');
        cards.push({ url: `https://www.facebook.com/marketplace/item/${id}`, externalId: id,
          title, price, location, image: img && img.src });
      });
      return cards;
    },
    offerup() {
      const cards = [];
      document.querySelectorAll('a[href*="/item/detail/"]').forEach((a) => {
        const url = absolute(a.getAttribute('href'));
        const id = (url.match(/detail\/([\w-]+)/) || [])[1];
        const lines = textLines(a);
        const price = lines.find((l) => /(\$[\d,]+|free)/i.test(l)) || '';
        const title = longest(lines.filter((l) => l !== price)) || '';
        const img = a.querySelector('img');
        cards.push({ url, externalId: id, title, price, image: img && img.src });
      });
      return cards;
    },
    craigslist() {
      const cards = [];
      document.querySelectorAll('li.cl-search-result, .gallery-card, .cl-static-search-result').forEach((li) => {
        const a = li.querySelector('a.posting-title, a.cl-app-anchor, a.titlestring, a[href*=".html"]');
        if (!a) return;
        const url = absolute(a.getAttribute('href'));
        const title = (a.textContent || '').trim();
        const price = (li.querySelector('.priceinfo, .price') || {}).textContent || '';
        const location = (li.querySelector('.meta, .location, .supertitle') || {}).textContent || '';
        const img = li.querySelector('img');
        cards.push({ url, title, price, location: location.trim(), image: img && img.src });
      });
      return cards;
    },
  };

  function scan() {
    if (!source || !SITE_EXTRACTORS[source]) return;
    let added = 0;
    for (const card of SITE_EXTRACTORS[source]()) {
      if (!card.url || !card.title || seen.has(card.url)) continue;
      seen.add(card.url);
      queue.push(card);
      added++;
    }
    if (added) badge(`${seen.size} captured`);
  }

  async function flush() {
    if (queue.length === 0) return;
    const batch = queue.splice(0, CONFIG.maxBatch);
    const url = CONFIG.backendUrl();
    if (!url || url.includes('your-scorealert-backend')) { badge('set backend URL ⚙'); queue.unshift(...batch); return; }
    GM_xmlhttpRequest({
      method: 'POST',
      url: url + '/ingest/scrape',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CONFIG.secret() },
      data: JSON.stringify({ source, listings: batch, capturedAt: new Date().toISOString() }),
      onload: (r) => badge(r.status === 200 ? `sent ${batch.length} → ScoreAlert` : `err ${r.status}`),
      onerror: () => { badge('send failed'); },
    });
  }

  // --- helpers -------------------------------------------------------------
  function detectSource(host) {
    if (/facebook\.com/.test(host)) return 'facebook';
    if (/offerup\.com/.test(host)) return 'offerup';
    if (/craigslist\.org/.test(host)) return 'craigslist';
    return null;
  }
  function absolute(href) { try { return new URL(href, location.origin).href; } catch { return href || ''; } }
  function textLines(el) {
    return (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
  }
  function longest(arr) { return arr.reduce((a, b) => (b.length > a.length ? b : a), ''); }

  let badgeEl;
  function badge(text) {
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      Object.assign(badgeEl.style, {
        position: 'fixed', right: '14px', bottom: '14px', zIndex: 999999,
        background: '#0A0E12', color: '#00E5A8', font: '600 12px system-ui',
        padding: '8px 12px', borderRadius: '10px', border: '1px solid #00E5A8',
        boxShadow: '0 4px 16px rgba(0,0,0,.4)', pointerEvents: 'none',
      });
      document.body.appendChild(badgeEl);
    }
    badgeEl.textContent = '📡 ScoreAlert · ' + text;
  }

  async function autoScrollLoop() {
    if (!CONFIG.autoScroll()) return;
    window.scrollBy(0, window.innerHeight * 0.8);
    setTimeout(autoScrollLoop, CONFIG.scrollDelayMs);
  }

  // Observe DOM changes (infinite-scroll feeds) + periodic flush.
  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });
  scan();
  setInterval(flush, CONFIG.flushEveryMs);
  badge('watching ' + (source || 'page'));
  autoScrollLoop();
})();
