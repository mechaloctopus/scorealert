// Duplicate detection. The same vehicle is often posted to FB + Craigslist + OfferUp.
// We combine several signals into a similarity score and cluster likely duplicates.
//
// Signals (image perceptual hash is a Phase-2 add where image processing is licensed):
//   * exact normalized_hash match           -> certain duplicate
//   * shared phone number                   -> strong
//   * make/model/year agreement             -> strong
//   * price closeness                        -> supporting
//   * title/description token similarity     -> supporting
//   * same town                              -> supporting

import { titleFingerprint } from './normalize.ts';
import type { NormalizedListing } from '../types.ts';

export interface DupeCandidate {
  listing: NormalizedListing & { id?: string; town?: string };
}

export interface DupeResult {
  isDuplicate: boolean;
  score: number; // 0–1
  reasons: string[];
}

const DUPLICATE_THRESHOLD = 0.62;

export function extractPhone(text: string): string | null {
  // Common US formats; returns digits only. (Stored transiently for dedupe, not retained
  // as seller PII — see docs privacy section.)
  const m = text.replace(/[^\d]/g, ' ').match(/\b(\d{10})\b/) ||
    text.match(/\b(\d{3})[\s.\-]?(\d{3})[\s.\-]?(\d{4})\b/);
  if (!m) return null;
  const digits = (m[0] || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export function compare(a: NormalizedListing, b: NormalizedListing): DupeResult {
  const reasons: string[] = [];

  if (a.normalizedHash === b.normalizedHash) {
    return { isDuplicate: true, score: 1, reasons: ['identical normalized hash'] };
  }

  let score = 0;

  // Phone
  const pa = extractPhone(`${a.title} ${a.description}`);
  const pb = extractPhone(`${b.title} ${b.description}`);
  if (pa && pb && pa === pb) { score += 0.5; reasons.push('same phone number'); }

  // Make/model/year
  const fa = a.facts, fb = b.facts;
  if (fa.year && fb.year && fa.year === fb.year) { score += 0.12; reasons.push('same year'); }
  if (fa.make && fb.make && eq(fa.make, fb.make)) { score += 0.13; reasons.push('same make'); }
  if (fa.model && fb.model && eq(fa.model, fb.model)) { score += 0.15; reasons.push('same model'); }

  // Price closeness
  if (a.price != null && b.price != null) {
    const hi = Math.max(a.price, b.price), lo = Math.min(a.price, b.price);
    const rel = hi === 0 ? 1 : lo / hi;
    if (rel >= 0.9) { score += 0.12; reasons.push('price within 10%'); }
    else if (rel >= 0.8) { score += 0.06; reasons.push('price within 20%'); }
  }

  // Town
  const ta = (a as { town?: string }).town, tb = (b as { town?: string }).town;
  if (ta && tb && eq(ta, tb)) { score += 0.06; reasons.push('same town'); }

  // Title/description token similarity (Jaccard over fingerprint tokens)
  const sim = jaccard(
    tokens(`${a.title} ${a.description}`),
    tokens(`${b.title} ${b.description}`),
  );
  if (sim >= 0.5) { score += 0.25 * sim + 0.1; reasons.push(`text similarity ${sim.toFixed(2)}`); }
  else if (sim >= 0.3) { score += 0.12; reasons.push(`text similarity ${sim.toFixed(2)}`); }

  const clamped = Math.min(1, score);
  return { isDuplicate: clamped >= DUPLICATE_THRESHOLD, score: clamped, reasons };
}

/** Find the best existing match for `incoming` among `pool`. */
export function findDuplicate<T extends NormalizedListing>(
  incoming: NormalizedListing,
  pool: T[],
): { match: T; result: DupeResult } | null {
  let best: { match: T; result: DupeResult } | null = null;
  for (const candidate of pool) {
    if (candidate === incoming) continue;
    const result = compare(incoming, candidate);
    if (result.isDuplicate && (!best || result.score > best.result.score)) {
      best = { match: candidate, result };
    }
  }
  return best;
}

function tokens(text: string): Set<string> {
  return new Set(titleFingerprint(text).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function eq(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
