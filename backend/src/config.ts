// Central, overridable configuration. Every number the spec calls "configurable"
// lives here and can be overridden per deployment via env or a settings row.

export interface ScoreWeights {
  price: number; // 0–30
  freshness: number; // 0–25
  category: number; // 0–15
  condition: number; // 0–10
  location: number; // 0–10
  keyword: number; // 0–10
}

export interface Config {
  weights: ScoreWeights;
  /** default vehicle price window (configurable per rule too) */
  vehiclePriceRange: { min: number; max: number };
  /** freshness: minutes at which freshness score hits floor */
  freshnessDecayMinutes: number;
  /** price-drop alert thresholds (either triggers) */
  priceDrop: { absolute: number; percent: number };
  /** score label cutoffs */
  labels: { scoreNow: number; greatFind: number; goodLead: number };
  /** known Kauaʻi towns (approximate location is enough) */
  kauaiTowns: string[];
  /** categories we consider "high interest" for the category-match component */
  highInterestMakes: string[];
}

export const CONFIG: Config = {
  weights: {
    price: 30,
    freshness: 25,
    category: 15,
    condition: 10,
    location: 10,
    keyword: 10,
  },
  vehiclePriceRange: {
    min: numEnv('VEHICLE_MIN_PRICE', 500),
    max: numEnv('VEHICLE_MAX_PRICE', 3500),
  },
  freshnessDecayMinutes: numEnv('FRESHNESS_DECAY_MINUTES', 3 * 24 * 60), // 3 days -> floor
  priceDrop: {
    absolute: numEnv('PRICE_DROP_ABS', 250),
    percent: numEnv('PRICE_DROP_PCT', 15),
  },
  labels: { scoreNow: 90, greatFind: 75, goodLead: 60 },
  kauaiTowns: [
    'Līhuʻe', 'Lihue', 'Kapaʻa', 'Kapaa', 'Wailua', 'Anahola', 'Kīlauea', 'Kilauea',
    'Princeville', 'Hanalei', 'Kōloa', 'Koloa', 'Poʻipū', 'Poipu', 'Waimea', 'Kekaha',
    'Hanapēpē', 'Hanapepe', 'Kalāheo', 'Kalaheo', 'Lāwaʻi', 'Lawai', 'Puhi', 'Eleele',
    'ʻŌmaʻo', 'Omao', 'Kilohana', 'Hanamāʻulu', 'Hanamaulu',
  ],
  highInterestMakes: ['toyota', 'honda', 'ford', 'nissan', 'subaru', 'jeep'],
};

function numEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function scoreLabel(overall: number): ScoreBreakdownLabel {
  if (overall >= CONFIG.labels.scoreNow) return 'SCORE_NOW';
  if (overall >= CONFIG.labels.greatFind) return 'GREAT_FIND';
  if (overall >= CONFIG.labels.goodLead) return 'GOOD_LEAD';
  return 'BELOW';
}

export type ScoreBreakdownLabel = 'SCORE_NOW' | 'GREAT_FIND' | 'GOOD_LEAD' | 'BELOW';
