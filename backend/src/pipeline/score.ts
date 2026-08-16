// ScoreAlert deal score (0–100). Weighted, configurable, and explainable.
// Every component returns both a number and human-readable reasons so the detail
// screen can show "WHY SCOREALERT FLAGGED THIS" / "WATCH OUT" without fabrication.

import { CONFIG, scoreLabel } from '../config.ts';
import type { NormalizedListing, ScoreBreakdown } from '../types.ts';

export interface ScoreInput {
  listing: NormalizedListing;
  /** effective age of the listing in minutes (from source post time or first_seen) */
  ageMinutes: number;
  /** optional per-rule price window; falls back to the vehicle default */
  priceRange?: { min: number; max: number };
}

// "Opportunity" keywords: seller signals that the deal may be unusually good.
const OPPORTUNITY = [
  'must sell', 'moving', 'leaving island', 'pcs', 'need gone', 'today only',
  'obo', 'or best offer', 'price drop', 'reduced', 'cash', 'first come',
  'mechanic special', 'project', 'easy fix',
];

export function scoreListing(input: ScoreInput): ScoreBreakdown {
  const { listing, ageMinutes } = input;
  const w = CONFIG.weights;
  const positives: string[] = [];
  const watchouts: string[] = [];

  const price = component_price(listing, input.priceRange, w.price, positives, watchouts);
  const freshness = component_freshness(ageMinutes, w.freshness, positives);
  const category = component_category(listing, w.category, positives);
  const condition = component_condition(listing, w.condition, positives, watchouts);
  const location = component_location(listing, w.location, positives, watchouts);
  const keyword = component_keyword(listing, w.keyword, positives);

  const overall = Math.round(price + freshness + category + condition + location + keyword);

  return {
    overall,
    price: Math.round(price),
    freshness: Math.round(freshness),
    category: Math.round(category),
    condition: Math.round(condition),
    location: Math.round(location),
    keyword: Math.round(keyword),
    label: scoreLabel(overall),
    explanation: { positives, watchouts },
  };
}

// --- components -------------------------------------------------------------

function component_price(
  l: NormalizedListing, range: { min: number; max: number } | undefined,
  max: number, positives: string[], watchouts: string[],
): number {
  if (l.facts.isFree || l.price === 0) {
    positives.push('Free item');
    return max;
  }
  if (l.price == null) return max * 0.4; // unknown price: neutral-ish
  const r = range ?? CONFIG.vehiclePriceRange;
  if (l.price < r.min) {
    // below the window — often too-good/parts; still cheap, give most but flag
    positives.push(`Very low asking price ($${l.price})`);
    return max * 0.85;
  }
  if (l.price > r.max) {
    watchouts.push(`Above target price ($${l.price} > $${r.max})`);
    // linear falloff up to 1.5x the ceiling, then floor
    const over = (l.price - r.max) / (r.max * 0.5);
    return Math.max(0, max * (1 - over)) * 0.5;
  }
  // Inside the window: cheaper => higher. Linear from max at r.min to 40% at r.max.
  const frac = (l.price - r.min) / Math.max(1, r.max - r.min); // 0..1
  const value = max * (1 - 0.6 * frac);
  if (frac <= 0.35) positives.push(`Priced low in the $${r.min}–$${r.max} window`);
  return value;
}

function component_freshness(ageMinutes: number, max: number, positives: string[]): number {
  const age = Math.max(0, ageMinutes);
  if (age <= 10) positives.push('Very fresh listing (posted minutes ago)');
  else if (age <= 60) positives.push('Fresh listing (within the hour)');
  // full score for <=10 min, decaying to 0 at freshnessDecayMinutes
  const decay = CONFIG.freshnessDecayMinutes;
  if (age <= 10) return max;
  const frac = Math.min(1, (age - 10) / Math.max(1, decay - 10));
  // ease-out so recent listings keep more of their score
  return max * (1 - Math.pow(frac, 0.7));
}

function component_category(l: NormalizedListing, max: number, positives: string[]): number {
  const cat = l.facts.category;
  const interestCats = new Set(['car', 'truck', 'van', 'suv', 'motorcycle', 'boat', 'free', 'trailer']);
  let v = interestCats.has(cat) ? max * 0.7 : max * 0.2;
  const make = l.facts.make?.toLowerCase();
  if (make && CONFIG.highInterestMakes.includes(make)) {
    v = max;
    positives.push(`${l.facts.make} — high-interest, holds value on Kauaʻi`);
  } else if (interestCats.has(cat) && cat !== 'free') {
    positives.push(`Matches a target category (${cat})`);
  }
  return Math.min(max, v);
}

function component_condition(
  l: NormalizedListing, max: number, positives: string[], watchouts: string[],
): number {
  const f = l.facts;
  if (f.category === 'free' || f.isFree) return max * 0.6; // condition less relevant for free
  let v = max * 0.5; // unknown baseline
  switch (f.runningStatus) {
    case 'runs_and_drives': v = max; positives.push('Seller says it runs and drives'); break;
    case 'runs': v = max * 0.8; positives.push('Seller says it runs'); break;
    case 'no_start': v = max * 0.2; watchouts.push('Seller says it does not start / parts'); break;
    default: break;
  }
  if (f.titleStatus === 'clean') positives.push('Clean title (per seller)');
  if (f.titleStatus === 'salvage') { watchouts.push('Salvage title'); v -= max * 0.15; }
  if (f.titleStatus === 'no_title') { watchouts.push('No title / bill of sale only'); v -= max * 0.2; }
  if (f.registrationStatus === 'current') positives.push('Registration current (per seller)');
  if (f.registrationStatus === 'expired') watchouts.push('Registration expired');
  if (f.registrationStatus === 'unknown' && isVehicle(f.category)) watchouts.push('Registration status unclear');
  for (const issue of f.issues) watchouts.push(`Mentioned: ${issue.replace(/_/g, ' ')}`);
  // each named issue is a small ding but not fatal (could be a cheap fix)
  v -= Math.min(max * 0.3, f.issues.length * (max * 0.08));
  if (f.mileage && f.mileage >= 200000) watchouts.push(`High mileage (${f.mileage.toLocaleString()} mi)`);
  return clamp(v, 0, max);
}

function component_location(
  l: NormalizedListing, max: number, positives: string[], watchouts: string[],
): number {
  if (l.town) { positives.push(`Located on Kauaʻi (${l.town})`); return max; }
  const loc = (l.locationText ?? '').toLowerCase();
  if (loc.includes('kauai') || loc.includes('kauaʻi')) { positives.push('Located on Kauaʻi'); return max * 0.8; }
  if (loc.includes('oahu') || loc.includes('maui') || loc.includes('hilo') || loc.includes('honolulu')) {
    watchouts.push('Appears to be a neighbor island (shipping/barge needed)');
    return max * 0.2;
  }
  return max * 0.5; // unknown location
}

function component_keyword(l: NormalizedListing, max: number, positives: string[]): number {
  const hay = ` ${(l.title + ' ' + l.description).toLowerCase()} `;
  let hits = 0;
  const matched: string[] = [];
  for (const kw of OPPORTUNITY) {
    if (hay.includes(kw)) { hits++; matched.push(kw); }
  }
  if (hits > 0) positives.push(`Opportunity signals: ${matched.slice(0, 3).join(', ')}`);
  return Math.min(max, hits * (max / 3));
}

function isVehicle(cat: string): boolean {
  return ['car', 'truck', 'van', 'suv', 'motorcycle'].includes(cat);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
