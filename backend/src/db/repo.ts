// Storage abstraction. The engine talks to this interface; the MVP ships an
// in-memory implementation (used by tests + the demo). A Postgres/Supabase-backed
// implementation lives in pg-repo.ts and satisfies the same contract.

import type { NormalizedListing, ScoreBreakdown, StoredListing } from '../types.ts';

export interface UpsertResult {
  listing: StoredListing;
  isNew: boolean;
  priceDrop?: { from: number; to: number };
  duplicateOf?: string; // id of the cluster primary, if this was merged as a duplicate
}

export interface ListingRepo {
  /** All active listings (used as the dedupe pool; a real impl would window this). */
  activeListings(): Promise<StoredListing[]>;
  /** Insert or update by (source, external_id) / normalized hash. Detects NEW + price drops. */
  upsert(listing: NormalizedListing, opts?: { now?: Date }): Promise<UpsertResult>;
  attachScore(id: string, score: ScoreBreakdown): Promise<void>;
  get(id: string): Promise<StoredListing | undefined>;
  /** Record that an alert was delivered (idempotency for new/price_drop). */
  hasAlert(userId: string, listingId: string, kind: 'new' | 'price_drop'): Promise<boolean>;
  recordAlert(userId: string, listingId: string, kind: 'new' | 'price_drop', score: number): Promise<void>;
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `lst_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export class InMemoryRepo implements ListingRepo {
  private byId = new Map<string, StoredListing>();
  private byHash = new Map<string, string>(); // hash -> id
  private byExternal = new Map<string, string>(); // source:external -> id
  private alerts = new Set<string>(); // `${user}:${listing}:${kind}`

  async activeListings(): Promise<StoredListing[]> {
    return [...this.byId.values()].filter((l) => l.status === 'active');
  }

  async upsert(listing: NormalizedListing, opts: { now?: Date } = {}): Promise<UpsertResult> {
    const now = (opts.now ?? new Date()).toISOString();
    const extKey = listing.externalId ? `${listing.sourceId}:${listing.externalId}` : undefined;

    // 1. Same source+external id => update-in-place (price-drop candidate).
    const existingId = (extKey && this.byExternal.get(extKey)) || this.byHash.get(listing.normalizedHash);
    if (existingId) {
      const existing = this.byId.get(existingId)!;
      const prevPrice = existing.price;
      existing.lastSeenAt = now;
      let priceDrop: { from: number; to: number } | undefined;
      if (prevPrice != null && listing.price != null && listing.price < prevPrice) {
        priceDrop = { from: prevPrice, to: listing.price };
        existing.price = listing.price;
      }
      // refresh mutable fields
      existing.title = listing.title;
      existing.description = listing.description;
      existing.primaryImageUrl = listing.primaryImageUrl;
      return { listing: existing, isNew: false, priceDrop };
    }

    // 2. Brand-new listing.
    const stored: StoredListing = {
      ...listing,
      id: newId(),
      firstSeenAt: now,
      lastSeenAt: now,
      status: 'active',
    };
    this.byId.set(stored.id, stored);
    this.byHash.set(stored.normalizedHash, stored.id);
    if (extKey) this.byExternal.set(extKey, stored.id);
    return { listing: stored, isNew: true };
  }

  async attachScore(id: string, score: ScoreBreakdown): Promise<void> {
    const l = this.byId.get(id);
    if (l) l.score = score;
  }

  async get(id: string): Promise<StoredListing | undefined> {
    return this.byId.get(id);
  }

  async hasAlert(userId: string, listingId: string, kind: 'new' | 'price_drop'): Promise<boolean> {
    return this.alerts.has(`${userId}:${listingId}:${kind}`);
  }

  async recordAlert(userId: string, listingId: string, kind: 'new' | 'price_drop'): Promise<void> {
    this.alerts.add(`${userId}:${listingId}:${kind}`);
  }
}
