// Craigslist collector — first-party RSS feed (RDF/RSS 1.0).
//
// Personal-use posture: this polls Craigslist's own publicly-published RSS feed for the
// user's Kauaʻi searches, at a low rate, with no login and no anti-bot circumvention.
// If Craigslist returns 403/empty (they throttle aggressively), the adapter reports
// `degraded` and backs off — it never evades blocking. See docs/personal-collectors.md.
//
// Feed URL shape:  https://honolulu.craigslist.org/search/<sub>/<cat>?format=rss
//   <sub> kau = Kauaʻi subarea;  <cat> cta = cars+trucks, mca = motorcycles, boo = boats,
//   zip = free, sss = general for-sale.

import type { RawListing } from '../../types.ts';
import type { ListingSourceAdapter, SourceInfo } from '../adapter.ts';

export interface CraigslistConfig {
  /** e.g. "https://honolulu.craigslist.org" */
  base: string;
  /** subarea code; Kauaʻi is "kau" on the Honolulu site */
  subarea: string;
  /** category codes to poll (cta, mca, boo, zip, sss, ...) */
  categories: string[];
  /** extra query params, e.g. { max_price: "3500", min_price: "500" } */
  params?: Record<string, string>;
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

export const CRAIGSLIST_INFO: SourceInfo = {
  id: 'craigslist',
  name: 'Craigslist Kauaʻi',
  policy: 'APPROVED_FEED',
  autoCollect: true,
  health: 'disabled',
  howItWorks: "Polls Craigslist's own public RSS feed for your Kauaʻi searches (no login, gentle rate). Runs hands-off in the cloud.",
};

export function defaultCategories(): string[] {
  // cars+trucks, motorcycles, boats, free, general for-sale
  return ['cta', 'mca', 'boo', 'zip', 'sss'];
}

export class CraigslistAdapter implements ListingSourceAdapter {
  public info: SourceInfo = { ...CRAIGSLIST_INFO };
  private cfg: CraigslistConfig;
  private fetchImpl: typeof fetch;

  constructor(cfg: CraigslistConfig) {
    this.cfg = cfg;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async fetchNewListings(): Promise<RawListing[]> {
    const all: RawListing[] = [];
    let anyOk = false;
    for (const cat of this.cfg.categories) {
      try {
        const items = await this.fetchCategory(cat);
        all.push(...items);
        anyOk = true;
      } catch {
        // one category failing shouldn't kill the run; keep going
      }
    }
    this.info.health = anyOk ? 'healthy' : 'degraded';
    return all;
  }

  private async fetchCategory(cat: string): Promise<RawListing[]> {
    const url = this.feedUrl(cat);
    const res = await this.fetchImpl(url, {
      headers: { 'user-agent': this.cfg.userAgent ?? 'ScoreAlert/0.1 (personal feed reader)' },
    });
    if (res.status === 403) { this.info.health = 'degraded'; throw new Error('craigslist 403 (throttled)'); }
    if (!res.ok) throw new Error(`craigslist ${res.status}`);
    return parseCraigslistRss(await res.text(), cat);
  }

  private feedUrl(cat: string): string {
    const p = new URLSearchParams({ format: 'rss', ...(this.cfg.params ?? {}) });
    return `${this.cfg.base}/search/${this.cfg.subarea}/${cat}?${p}`;
  }
}

// --- RSS/RDF parsing (no dependencies) -------------------------------------

const CL_CATEGORY: Record<string, string> = {
  cta: 'car', mca: 'motorcycle', boo: 'boat', zip: 'free', sss: 'other',
};

export function parseCraigslistRss(xml: string, cat: string): RawListing[] {
  const items = matchAll(xml, /<item\b[\s\S]*?<\/item>/gi);
  const out: RawListing[] = [];
  for (const item of items) {
    const link = tag(item, 'link') || attr(item, 'item', 'rdf:about');
    const rawTitle = decode(tag(item, 'title'));
    if (!link || !rawTitle) continue;
    const { title, price, location } = parseTitle(rawTitle);
    const description = decode(tag(item, 'description'));
    const date = tag(item, 'dc:date') || tag(item, 'date');
    const image = attr(item, 'enc:enclosure', 'resource') || attr(item, 'enclosure', 'url');
    out.push({
      sourceId: 'craigslist',
      externalId: idFromUrl(link),
      url: link,
      title,
      description: description || title,
      price,
      currency: 'USD',
      locationText: location,
      imageUrls: image ? [image] : [],
      postedAt: date || undefined,
      raw: { via: 'rss', category: cat, categoryGuess: CL_CATEGORY[cat] },
    });
  }
  return out;
}

/** Craigslist titles look like: "2006 Toyota Tacoma - $1,500 (Kapaa)". */
export function parseTitle(raw: string): { title: string; price: number | null; location?: string } {
  let s = raw.trim();
  let location: string | undefined;
  const locM = s.match(/\s*\(([^()]+)\)\s*$/);
  if (locM) { location = locM[1].trim(); s = s.slice(0, locM.index).trim(); }
  let price: number | null = null;
  const priceM = s.match(/\s*[-–]?\s*\$([\d,]+)\s*$/);
  if (priceM) { price = Number(priceM[1].replace(/,/g, '')); s = s.slice(0, priceM.index).trim(); }
  s = s.replace(/\s*[-–]\s*$/, '').trim();
  return { title: s || raw.trim(), price, location };
}

function idFromUrl(url: string): string | undefined {
  const m = url.match(/(\d+)\.html/);
  return m ? m[1] : undefined;
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${escapeRe(name)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRe(name)}>`, 'i'));
  return m ? m[1].trim() : '';
}

function attr(xml: string, tagName: string, attrName: string): string | undefined {
  const m = xml.match(new RegExp(`<${escapeRe(tagName)}\\b[^>]*\\b${escapeRe(attrName)}=["']([^"']+)["']`, 'i'));
  return m ? m[1] : undefined;
}

function matchAll(s: string, re: RegExp): string[] {
  return [...s.matchAll(re)].map((m) => m[0]);
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#x2F;/g, '/')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
