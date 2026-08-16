// Core domain types shared across the ScoreAlert engine.

export type SourcePolicy =
  | 'OFFICIAL_API'
  | 'APPROVED_FEED'
  | 'EMAIL_ALERT'
  | 'USER_PROVIDED'
  | 'MANUAL_IMPORT'
  | 'RESEARCH_REQUIRED'
  | 'NOT_ALLOWED';

export type SourceHealth =
  | 'healthy'
  | 'degraded'
  | 'disabled'
  | 'authorization_required'
  | 'policy_blocked';

export type Category =
  | 'car'
  | 'truck'
  | 'van'
  | 'suv'
  | 'motorcycle'
  | 'boat'
  | 'trailer'
  | 'free'
  | 'tool'
  | 'other';

export type RunningStatus = 'runs_and_drives' | 'runs' | 'no_start' | 'unknown';
export type TitleStatus = 'clean' | 'salvage' | 'rebuilt' | 'no_title' | 'unknown';
export type RegStatus = 'current' | 'expired' | 'unknown';
export type Drivetrain = '4x4' | 'awd' | 'fwd' | 'rwd' | 'unknown';
export type Transmission = 'manual' | 'automatic' | 'unknown';

/** What an adapter emits before normalization. Deliberately loose. */
export interface RawListing {
  sourceId: string;
  externalId?: string;
  url: string;
  title: string;
  description?: string;
  price?: number | null;
  currency?: string;
  locationText?: string;
  imageUrls?: string[];
  sellerName?: string;
  postedAt?: string; // ISO; when the seller posted (source time), if known
  raw?: unknown; // original payload for audit
}

/** Facts pulled out of free text by the deterministic parser. */
export interface ExtractedFacts {
  category: Category;
  subcategory?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  runningStatus: RunningStatus;
  titleStatus: TitleStatus;
  registrationStatus: RegStatus;
  safetyStatus: 'current' | 'expired' | 'unknown' | 'na';
  drivetrain: Drivetrain;
  transmission: Transmission;
  issues: string[];
  isFree: boolean;
}

/** A listing after normalization + classification, ready to score/store. */
export interface NormalizedListing {
  sourceId: string;
  externalId?: string;
  canonicalUrl: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  locationText?: string;
  town?: string; // resolved to a known Kauaʻi town when possible
  imageUrls: string[];
  primaryImageUrl?: string;
  sellerName?: string;
  sourceCreatedAt?: string;
  facts: ExtractedFacts;
  normalizedHash: string;
  raw?: unknown;
}

export interface ScoreBreakdown {
  overall: number;
  price: number;
  freshness: number;
  category: number;
  keyword: number;
  location: number;
  condition: number;
  label: 'SCORE_NOW' | 'GREAT_FIND' | 'GOOD_LEAD' | 'BELOW';
  explanation: { positives: string[]; watchouts: string[] };
}

export interface WatchRule {
  id: string;
  userId: string;
  name: string;
  active: boolean;
  category?: Category | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  keywords: string[];
  excludedKeywords: string[];
  maxDistance?: number | null;
  geographicArea?: string;
  minimumScore: number;
  alertVelocity: 'instant' | 'smart' | 'quiet';
  highPriorityAt?: number | null;
}

export interface MatchResult {
  rule: WatchRule;
  matched: boolean;
  reasons: string[];
}

export interface Alert {
  userId: string;
  listing: StoredListing;
  score: ScoreBreakdown;
  rule: WatchRule;
  kind: 'new' | 'price_drop';
  priceDrop?: { from: number; to: number };
  highPriority: boolean;
}

/** A listing as persisted (normalized + id + score + timestamps + cluster). */
export interface StoredListing extends NormalizedListing {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  status: 'active' | 'expired' | 'removed' | 'duplicate';
  clusterId?: string;
  score?: ScoreBreakdown;
}
