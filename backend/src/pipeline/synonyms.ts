// Configurable semantic dictionaries. In production these are loaded from the
// category_synonyms table; here we keep a default that matches db/migrations/0002_seed.sql.
import type { Category } from '../types.ts';

export const SYNONYMS: Record<Exclude<Category, 'other'>, string[]> = {
  free: [
    'free', 'curb alert', 'free pickup', 'free stuff', 'must go', 'take it',
    'first come', 'you haul', 'u haul', 'giveaway', 'give away',
  ],
  car: ['car', 'sedan', 'coupe', 'hatchback', 'wagon'],
  truck: ['truck', 'pickup', 'pick up', 'pick-up', 'flatbed'],
  suv: ['suv', '4runner', 'cr-v', 'crv', 'tahoe', 'pilot', 'highlander', 'rav4', 'rav-4'],
  van: ['van', 'minivan', 'mini van', 'cargo van', 'sienna', 'odyssey', 'caravan'],
  motorcycle: [
    'motorcycle', 'motorbike', 'dirt bike', 'dirtbike', 'enduro', 'dual sport',
    'dual-sport', 'scooter', 'moped',
  ],
  boat: [
    'boat', 'skiff', 'dinghy', 'jon boat', 'sailboat', 'fishing boat', 'aluminum boat',
    'whaler', 'jet ski', 'jetski', 'personal watercraft', 'pwc', 'kayak with motor',
  ],
  trailer: ['trailer', 'utility trailer', 'boat trailer', 'flatbed trailer'],
  tool: [
    'tool', 'tools', 'stihl', 'dewalt', 'makita', 'milwaukee', 'generator',
    'compressor', 'lumber', 'chainsaw', 'welder',
  ],
};

/**
 * Order matters: 'free' and specific vehicle body styles take priority over the
 * broad 'car' bucket. Returns the best category + which synonym matched.
 */
const PRIORITY: Category[] = [
  'free', 'motorcycle', 'boat', 'trailer', 'truck', 'van', 'suv', 'tool', 'car',
];

export function detectCategory(text: string): { category: Category; term?: string } {
  const hay = ` ${text.toLowerCase()} `;
  for (const cat of PRIORITY) {
    const terms = SYNONYMS[cat as Exclude<Category, 'other'>] ?? [];
    for (const term of terms) {
      // word-ish boundary match so "carbon" doesn't match "car"
      if (matchesTerm(hay, term)) return { category: cat, term };
    }
  }
  return { category: 'other' };
}

export function matchesTerm(haystackLowerPadded: string, term: string): boolean {
  const t = term.toLowerCase();
  if (t.includes(' ')) return haystackLowerPadded.includes(` ${t} `) || haystackLowerPadded.includes(`${t}`);
  // single word: require non-alphanumeric boundaries
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}([^a-z0-9]|$)`, 'i');
  return re.test(haystackLowerPadded);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
