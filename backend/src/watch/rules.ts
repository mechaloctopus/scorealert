// Watch-rule matching engine. Decides whether a scored listing matches a user's rules,
// and provides the default rule set (mirrors db/migrations/0002_seed.sql).

import type { Category, MatchResult, NormalizedListing, ScoreBreakdown, WatchRule } from '../types.ts';

const DEFAULT_USER = '00000000-0000-0000-0000-000000000001';

export function defaultRules(userId: string = DEFAULT_USER): WatchRule[] {
  return [
    {
      id: 'rule-free', userId, name: 'Free Stuff', active: true,
      category: 'free', minPrice: 0, maxPrice: 0,
      keywords: ['free', 'curb alert', 'free pickup', 'must go', 'take it', 'first come', 'you haul', 'giveaway'],
      excludedKeywords: ['scam', 'shipping only', 'must buy', 'deposit required'],
      minimumScore: 55, alertVelocity: 'instant', highPriorityAt: 80,
    },
    {
      id: 'rule-vehicles', userId, name: 'Vehicles $500–$3,500', active: true,
      category: null, minPrice: 500, maxPrice: 3500,
      keywords: ['car', 'truck', 'van', 'suv', 'toyota', 'honda', 'ford', 'tacoma', 'cr-v', '4runner', 'tundra', 'corolla', 'civic', '4x4'],
      excludedKeywords: ['dealer', 'financing', 'down payment', 'monthly', 'parts only', 'for parts'],
      minimumScore: 60, alertVelocity: 'instant', highPriorityAt: 90,
    },
    {
      id: 'rule-moto', userId, name: 'Motorcycles / Scooters $500–$3,500', active: true,
      category: 'motorcycle', minPrice: 500, maxPrice: 3500,
      keywords: ['motorcycle', 'dirt bike', 'dual sport', 'enduro', 'scooter', 'moped'],
      excludedKeywords: ['dealer', 'financing', 'parts only'],
      minimumScore: 60, alertVelocity: 'instant', highPriorityAt: 90,
    },
    {
      id: 'rule-boats', userId, name: 'Boats $500–$3,500', active: true,
      category: 'boat', minPrice: 500, maxPrice: 3500,
      keywords: ['boat', 'skiff', 'dinghy', 'jon boat', 'sailboat', 'fishing boat', 'jet ski', 'whaler'],
      excludedKeywords: ['dealer', 'financing', 'parts only'],
      minimumScore: 60, alertVelocity: 'instant', highPriorityAt: 90,
    },
  ];
}

/** Vehicle categories a null-category vehicle rule should accept. */
const VEHICLE_CATS: Category[] = ['car', 'truck', 'van', 'suv'];

export function matchRule(
  listing: NormalizedListing, score: ScoreBreakdown, rule: WatchRule,
): MatchResult {
  const reasons: string[] = [];
  if (!rule.active) return fail(rule, 'rule inactive');

  const hay = ` ${(listing.title + ' ' + listing.description).toLowerCase()} `;

  // Excluded keywords are decisive.
  for (const ex of rule.excludedKeywords) {
    if (hay.includes(` ${ex.toLowerCase()} `) || hay.includes(ex.toLowerCase())) {
      return fail(rule, `excluded keyword: "${ex}"`);
    }
  }

  // Category
  if (rule.category != null) {
    if (rule.category === 'free') {
      if (!(listing.facts.isFree || listing.facts.category === 'free')) return fail(rule, 'not a free item');
    } else if (listing.facts.category !== rule.category) {
      return fail(rule, `category ${listing.facts.category} != ${rule.category}`);
    }
    reasons.push(`category ${rule.category}`);
  } else {
    // null category on a vehicle rule => accept vehicle categories
    if (!VEHICLE_CATS.includes(listing.facts.category)) {
      return fail(rule, `category ${listing.facts.category} not a vehicle`);
    }
    reasons.push(`vehicle (${listing.facts.category})`);
  }

  // Price window (free rule uses 0..0)
  const price = listing.facts.isFree ? 0 : listing.price;
  if (rule.minPrice != null && price != null && price < rule.minPrice) {
    return fail(rule, `price ${price} < min ${rule.minPrice}`);
  }
  if (rule.maxPrice != null && price != null && price > rule.maxPrice) {
    return fail(rule, `price ${price} > max ${rule.maxPrice}`);
  }
  if (price != null) reasons.push(`price ${price} in window`);

  // Keyword requirement: at least one keyword must appear (unless rule has no keywords).
  if (rule.keywords.length > 0) {
    const hit = rule.keywords.find((k) => hay.includes(k.toLowerCase()));
    if (!hit && rule.category == null) {
      // vehicle rule already category-gated; keywords are a bonus, not required
    } else if (!hit && rule.category !== 'free') {
      return fail(rule, 'no matching keyword');
    }
    if (hit) reasons.push(`keyword "${hit}"`);
  }

  // Score gate
  if (score.overall < rule.minimumScore) {
    return fail(rule, `score ${score.overall} < min ${rule.minimumScore}`);
  }
  reasons.push(`score ${score.overall} ≥ ${rule.minimumScore}`);

  return { rule, matched: true, reasons };
}

/** Return every rule that matches (a listing may satisfy multiple rules). */
export function matchAll(
  listing: NormalizedListing, score: ScoreBreakdown, rules: WatchRule[],
): MatchResult[] {
  return rules.map((r) => matchRule(listing, score, r)).filter((m) => m.matched);
}

function fail(rule: WatchRule, reason: string): MatchResult {
  return { rule, matched: false, reasons: [reason] };
}
