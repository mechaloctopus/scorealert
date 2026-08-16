// Normalization: RawListing -> NormalizedListing. Resolves town, cleans price,
// classifies, and computes the normalized_hash used for exact-ish dedupe.

import { createHash } from 'node:crypto';
import { CONFIG } from '../config.ts';
import type { NormalizedListing, RawListing } from '../types.ts';
import { classify, type ClassifyOptions } from './classify.ts';

export async function normalize(raw: RawListing, opts: ClassifyOptions = {}): Promise<NormalizedListing> {
  const title = collapse(raw.title ?? '');
  const description = collapse(raw.description ?? '');
  const price = normalizePrice(raw.price);
  const facts = await classify(raw, opts);
  const town = resolveTown(raw.locationText);
  const imageUrls = dedupeUrls(raw.imageUrls ?? []);

  const normalizedHash = computeHash({
    make: facts.make,
    model: facts.model,
    year: facts.year,
    price,
    title,
  });

  return {
    sourceId: raw.sourceId,
    externalId: raw.externalId,
    canonicalUrl: raw.url,
    title,
    description,
    price,
    currency: raw.currency ?? 'USD',
    locationText: raw.locationText,
    town,
    imageUrls,
    primaryImageUrl: imageUrls[0],
    sellerName: raw.sellerName,
    sourceCreatedAt: raw.postedAt,
    facts,
    normalizedHash,
    raw: raw.raw ?? raw,
  };
}

export function normalizePrice(price?: number | null): number | null {
  if (price == null) return null;
  if (!Number.isFinite(price)) return null;
  if (price < 0) return null;
  return Math.round(price * 100) / 100;
}

/** Resolve free-text location to a known Kauaʻi town (approximate is enough). */
export function resolveTown(locationText?: string): string | undefined {
  if (!locationText) return undefined;
  const lower = locationText.toLowerCase();
  for (const town of CONFIG.kauaiTowns) {
    // compare against a diacritic-stripped form so "Lihue" matches "Līhuʻe"
    if (lower.includes(stripDiacritics(town).toLowerCase()) || lower.includes(town.toLowerCase())) {
      return canonicalTown(town);
    }
  }
  return undefined;
}

// Map ASCII spellings to the canonical ʻōkina/kahakō form for display.
const TOWN_CANON: Record<string, string> = {
  lihue: 'Līhuʻe', kapaa: 'Kapaʻa', koloa: 'Kōloa', poipu: 'Poʻipū',
  kilauea: 'Kīlauea', hanapepe: 'Hanapēpē', kalaheo: 'Kalāheo', lawai: 'Lāwaʻi',
  omao: 'ʻŌmaʻo', hanamaulu: 'Hanamāʻulu',
};

function canonicalTown(town: string): string {
  const key = stripDiacritics(town).toLowerCase();
  return TOWN_CANON[key] ?? town;
}

export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ʻʼ'`]/g, '');
}

export function computeHash(parts: {
  make?: string; model?: string; year?: number; price: number | null; title: string;
}): string {
  // Prefer structured identity when available; fall back to a title fingerprint.
  const structured = [parts.year, parts.make, parts.model]
    .filter(Boolean)
    .join('|')
    .toLowerCase();
  const key = structured
    ? `${structured}|${priceBucket(parts.price)}`
    : `t:${titleFingerprint(parts.title)}|${priceBucket(parts.price)}`;
  return createHash('sha1').update(key).digest('hex');
}

/** Bucket price so a $1,200 vs $1,199 don't split an otherwise-identical listing. */
function priceBucket(price: number | null): string {
  if (price == null) return 'na';
  if (price === 0) return '0';
  const bucket = Math.round(price / 100) * 100; // nearest $100
  return String(bucket);
}

export function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .sort()
    .slice(0, 12)
    .join(' ');
}

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls.filter((u) => typeof u === 'string' && u.length > 0))];
}
