// Classification pipeline (deterministic-first, LLM last).
//   1. regex / structured parsing (automotive-parser)
//   2. keyword rules + synonym category detection
//   3. category classifier (combine signals)
//   4. LLM fallback ONLY when uncertainty is high (hook provided, off by default)
//
// The LLM is never called for trivial parsing — see needsLlm().

import type { Category, ExtractedFacts, RawListing } from '../types.ts';
import { parseAutomotive } from './automotive-parser.ts';
import { detectCategory, matchesTerm } from './synonyms.ts';

export interface ClassifyOptions {
  /** optional async LLM fallback; only invoked when needsLlm() is true */
  llm?: (raw: RawListing, partial: ExtractedFacts) => Promise<Partial<ExtractedFacts>>;
}

const FREE_TERMS = [
  'free', 'curb alert', 'free pickup', 'must go', 'take it', 'first come',
  'you haul', 'u haul', 'giveaway', 'give away', 'free stuff', 'free lumber',
];

export async function classify(raw: RawListing, opts: ClassifyOptions = {}): Promise<ExtractedFacts> {
  const title = raw.title ?? '';
  const description = raw.description ?? '';
  const blob = `${title}\n${description}`;
  const padded = ` ${blob.toLowerCase()} `;

  // Step 1: automotive/condition facts (deterministic)
  const auto = parseAutomotive(title, description);

  // Step 2 + 3: category. Price 0 / free wording is decisive.
  const isFree = detectFree(padded, raw.price);
  let category: Category;
  let subcategory: string | undefined;

  if (isFree) {
    // A free item may still BE a vehicle; keep the vehicle category if strongly implied,
    // but mark free. We surface free via the isFree flag + a 'free' rule match.
    const c = detectCategory(blob);
    category = c.category === 'other' ? 'free' : c.category;
    subcategory = c.category === 'other' ? undefined : c.term;
    if (category === 'free') subcategory = 'free';
  } else {
    const c = detectCategory(blob);
    category = c.category;
    subcategory = c.term;
    // If we found a vehicle make but generic category, prefer 'car'.
    if (category === 'other' && auto.make) category = 'car';
  }

  const facts: ExtractedFacts = {
    category,
    subcategory,
    make: auto.make,
    model: auto.model,
    year: auto.year,
    mileage: auto.mileage,
    runningStatus: auto.runningStatus,
    titleStatus: auto.titleStatus,
    registrationStatus: auto.registrationStatus,
    safetyStatus: auto.safetyStatus,
    drivetrain: auto.drivetrain,
    transmission: auto.transmission,
    issues: auto.issues,
    isFree,
  };

  // Step 4: LLM fallback only when genuinely uncertain and a model is configured.
  if (opts.llm && needsLlm(facts, blob)) {
    try {
      const patch = await opts.llm(raw, facts);
      Object.assign(facts, cleanPatch(patch));
    } catch {
      // Never fail classification because the LLM failed; deterministic result stands.
    }
  }

  return facts;
}

/** True only when the cheap path left us genuinely unsure. Keeps LLM spend near zero. */
export function needsLlm(facts: ExtractedFacts, blob: string): boolean {
  const looksVehicle = /\b(19[5-9]\d|20[0-2]\d)\b/.test(blob) || facts.make != null;
  const uncategorized = facts.category === 'other';
  const vehicleButNoRunState = looksVehicle && facts.runningStatus === 'unknown' && blob.length > 120;
  return uncategorized || vehicleButNoRunState;
}

function detectFree(padded: string, price?: number | null): boolean {
  if (price === 0) return true;
  for (const t of FREE_TERMS) if (matchesTerm(padded, t)) return true;
  return false;
}

function cleanPatch(patch: Partial<ExtractedFacts>): Partial<ExtractedFacts> {
  // Only accept fields the LLM is allowed to fill; never let it fabricate issues as facts.
  const allowed: (keyof ExtractedFacts)[] = ['category', 'subcategory', 'make', 'model', 'year', 'mileage'];
  const out: Partial<ExtractedFacts> = {};
  for (const k of allowed) if (patch[k] != null) (out as Record<string, unknown>)[k] = patch[k];
  return out;
}
