// Manual / Share Sheet ingestion. The Android app posts { url, text, imageUrl } from the
// system Share Sheet (from FB Marketplace, OfferUp, Craigslist, Chrome, …). We build a
// RawListing from ONLY what the user handed us. For a shared URL we may fetch that single
// page's OpenGraph metadata (the one page the user chose to give us) — never a crawl.

import type { RawListing } from '../../types.ts';

export interface SharePayload {
  url?: string;
  text?: string;
  imageUrl?: string;
  /** which app it was shared from, if the client can tell us (best-effort) */
  sharedFrom?: string;
}

const HOST_TO_SOURCE: Array<[RegExp, string]> = [
  [/facebook\.com|fb\.com|fb\.watch/i, 'facebook'],
  [/craigslist\.org/i, 'craigslist'],
  [/offerup\.com/i, 'offerup'],
  [/ebay\.com/i, 'ebay'],
];

export function sourceForUrl(url?: string): string {
  if (!url) return 'manual';
  for (const [re, id] of HOST_TO_SOURCE) if (re.test(url)) return id;
  return 'manual';
}

/** Parse price from shared text, e.g. "$1,200" or "1200". Returns null if none / "free". */
export function parseSharedPrice(text: string): number | null {
  if (/\bfree\b/i.test(text)) return 0;
  const m = text.match(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export interface OgFetcher {
  (url: string): Promise<{ title?: string; description?: string; image?: string; price?: number | null }>;
}

/** Build a RawListing from a share payload. `og` optionally enriches from the shared URL. */
export async function fromShare(payload: SharePayload, og?: OgFetcher): Promise<RawListing> {
  const sourceId = sourceForUrl(payload.url);
  const text = (payload.text ?? '').trim();

  let title = firstLine(text);
  let description = text;
  let price = parseSharedPrice(text);
  let image = payload.imageUrl;

  if (payload.url && og) {
    try {
      const meta = await og(payload.url);
      if (meta.title) title = title || meta.title;
      if (meta.description) description = description || meta.description;
      if (meta.image) image = image || meta.image;
      if (price == null && meta.price != null) price = meta.price;
    } catch {
      // If enrichment fails we still create a record from what the user shared.
    }
  }

  if (!title) title = payload.url ? hostname(payload.url) : 'Shared listing';

  return {
    sourceId,
    url: payload.url ?? '',
    title,
    description,
    price,
    currency: 'USD',
    imageUrls: image ? [image] : [],
    raw: { via: 'share', sharedFrom: payload.sharedFrom, payload },
  };
}

/** Minimal OpenGraph fetcher — pulls og:* tags from a single page. */
export const ogFetch: OgFetcher = async (url: string) => {
  const res = await fetch(url, { headers: { 'user-agent': 'ScoreAlertBot/0.1 (+personal use)' } });
  if (!res.ok) return {};
  const html = await res.text();
  const og = (prop: string) => {
    const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
    return m ? decodeEntities(m[1]) : undefined;
  };
  const priceStr = og('price:amount');
  return {
    title: og('title'),
    description: og('description'),
    image: og('image'),
    price: priceStr ? Number(priceStr) : null,
  };
};

function firstLine(s: string): string { return (s.split('\n')[0] ?? '').trim(); }
function hostname(url: string): string { try { return new URL(url).hostname; } catch { return url; } }
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
