// The end-to-end ingestion pipeline:
//   RawListing -> normalize+classify -> dedupe -> upsert(new/price-drop) -> score
//                -> match watch rules -> alert engine -> FCM
//
// This is the single orchestration point used by every source (eBay poll, email webhook,
// share ingest). Adapters only produce RawListings; the pipeline does the rest.

import type { RawListing, WatchRule } from '../types.ts';
import type { ClassifyOptions } from '../pipeline/classify.ts';
import { normalize } from '../pipeline/normalize.ts';
import { findDuplicate } from '../pipeline/dedupe.ts';
import { scoreListing } from '../pipeline/score.ts';
import { matchAll } from '../watch/rules.ts';
import type { ListingRepo } from '../db/repo.ts';
import { AlertEngine, type AlertOutcome } from '../alerts/engine.ts';

export interface PipelineDeps {
  repo: ListingRepo;
  engine: AlertEngine;
  rules: WatchRule[];
  classify?: ClassifyOptions;
  now?: () => Date;
}

export interface IngestReport {
  seen: number;
  created: number;
  duplicates: number;
  priceDrops: number;
  alerts: AlertOutcome[];
}

export async function ingest(raws: RawListing[], deps: PipelineDeps): Promise<IngestReport> {
  const now = deps.now ?? (() => new Date());
  const report: IngestReport = { seen: 0, created: 0, duplicates: 0, priceDrops: 0, alerts: [] };

  for (const raw of raws) {
    report.seen += 1;

    // 1. Normalize + classify
    const normalized = await normalize(raw, deps.classify);

    // 2. Cross-source duplicate check against the active pool
    const pool = await deps.repo.activeListings();
    const dupe = findDuplicate(normalized, pool);
    if (dupe && dupe.match.sourceId !== normalized.sourceId) {
      // Same item, different source: cluster it onto the existing card, no new alert.
      report.duplicates += 1;
      continue;
    }

    // 3. Upsert (detects NEW + significant price drop)
    const up = await deps.repo.upsert(normalized, { now: now() });
    const listing = up.listing;

    // 4. Score
    const ageMinutes = computeAgeMinutes(raw.postedAt, listing.firstSeenAt, now());
    const priceRange = pickPriceRange(deps.rules);
    const score = scoreListing({ listing: normalized, ageMinutes, priceRange });
    await deps.repo.attachScore(listing.id, score);
    listing.score = score;

    // 5. Decide alerts
    const isPriceDrop = up.priceDrop && significantDrop(up.priceDrop);
    if (!up.isNew && !isPriceDrop) {
      // seen before, no meaningful change -> nothing to do
      continue;
    }
    if (up.isNew) report.created += 1;
    if (isPriceDrop) report.priceDrops += 1;

    const matches = matchAll(normalized, score, deps.rules);
    const outcomes = await deps.engine.process(
      listing, score, matches, isPriceDrop ? up.priceDrop : undefined,
    );
    report.alerts.push(...outcomes);
  }

  return report;
}

function computeAgeMinutes(postedAt: string | undefined, firstSeen: string, now: Date): number {
  const anchor = postedAt ? Date.parse(postedAt) : Date.parse(firstSeen);
  if (!Number.isFinite(anchor)) return 0;
  return Math.max(0, (now.getTime() - anchor) / 60000);
}

function significantDrop(drop: { from: number; to: number }): boolean {
  // matches CONFIG.priceDrop defaults; imported lazily to avoid a cycle
  const abs = drop.from - drop.to;
  const pct = drop.from === 0 ? 0 : (abs / drop.from) * 100;
  return abs >= 250 || pct >= 15;
}

function pickPriceRange(rules: WatchRule[]): { min: number; max: number } | undefined {
  const vehicle = rules.find((r) => r.maxPrice && r.maxPrice > 0 && r.category !== 'free');
  if (vehicle && vehicle.minPrice != null && vehicle.maxPrice != null) {
    return { min: vehicle.minPrice, max: vehicle.maxPrice };
  }
  return undefined;
}
