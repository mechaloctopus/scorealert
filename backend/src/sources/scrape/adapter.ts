// In-browser capture ingestion. The ScoreAlert userscript runs in the user's OWN logged-in
// browser (Tampermonkey/Violentmonkey), reads listing cards from pages the user is viewing
// on Facebook Marketplace / OfferUp / Craigslist, and POSTs batches to /ingest/scrape.
//
// This is user-driven, in-session capture — not a server-side bot. No stored credentials,
// no headless login, no anti-bot circumvention. It only ever sees what the user's browser
// already rendered to them. See tools/scorealert-capture.user.js and docs/personal-collectors.md.

import type { RawListing } from '../../types.ts';

export interface ScrapedCard {
  url: string;
  title?: string;
  price?: number | string | null;
  image?: string;
  images?: string[];
  location?: string;
  description?: string;
  /** human posted-age text if the page shows it, e.g. "3 minutes ago" */
  postedText?: string;
  externalId?: string;
}

export interface ScrapeBatch {
  source: string; // 'facebook' | 'offerup' | 'craigslist' | ...
  listings: ScrapedCard[];
  capturedAt?: string;
}

const ALLOWED_SOURCES = new Set(['facebook', 'offerup', 'craigslist', 'manual']);

export function fromScrapeBatch(batch: ScrapeBatch): RawListing[] {
  const source = ALLOWED_SOURCES.has(batch.source) ? batch.source : 'manual';
  const out: RawListing[] = [];
  for (const card of batch.listings ?? []) {
    if (!card.url || !card.title) continue;
    const images = (card.images ?? []).concat(card.image ? [card.image] : []).filter(Boolean);
    out.push({
      sourceId: source,
      externalId: card.externalId ?? idFromUrl(card.url),
      url: card.url,
      title: String(card.title).trim(),
      description: (card.description ?? '').trim(),
      price: parsePrice(card.price),
      currency: 'USD',
      locationText: card.location,
      imageUrls: [...new Set(images)],
      postedAt: resolvePostedText(card.postedText, batch.capturedAt),
      raw: { via: 'userscript', capturedAt: batch.capturedAt, card },
    });
  }
  return out;
}

export function parsePrice(price?: number | string | null): number | null {
  if (price == null) return null;
  if (typeof price === 'number') return Number.isFinite(price) ? price : null;
  const s = price.trim();
  if (/free/i.test(s)) return 0;
  const m = s.match(/\$?\s*([\d,]+(?:\.\d{2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Turn "3 minutes ago" / "2 hours ago" / "yesterday" into an ISO timestamp. */
export function resolvePostedText(text?: string, capturedAt?: string): string | undefined {
  const now = capturedAt ? Date.parse(capturedAt) : Date.now();
  if (!text) return undefined;
  const t = text.toLowerCase();
  const m = t.match(/(\d+)\s*(min|hour|hr|day|week)/);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2];
    const ms = unit.startsWith('min') ? 60_000 : unit.startsWith('hour') || unit === 'hr' ? 3_600_000
      : unit === 'day' ? 86_400_000 : 604_800_000;
    return new Date(now - n * ms).toISOString();
  }
  if (/just now|moments? ago|a minute ago/.test(t)) return new Date(now).toISOString();
  if (/yesterday/.test(t)) return new Date(now - 86_400_000).toISOString();
  return undefined;
}

function idFromUrl(url: string): string | undefined {
  const m = url.match(/item\/(\d+)/) || url.match(/\/(\d+)(?:[/?]|$)/) || url.match(/(\d{6,})/);
  return m ? m[1] : undefined;
}
