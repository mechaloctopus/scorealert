// Deterministic automotive/condition parser. Runs FIRST, before any LLM.
// Extracts running status, title/registration/safety status, drivetrain, transmission,
// make/model/year/mileage, and a normalized list of mechanical issues.
//
// It NEVER invents mechanical assessments. It only reports what the seller's text says,
// mapped to normalized fields. Downstream, "seller claims" is kept distinct from inference.

import type { Drivetrain, RegStatus, RunningStatus, TitleStatus, Transmission } from '../types.ts';

const MAKES = [
  'toyota', 'honda', 'ford', 'chevy', 'chevrolet', 'nissan', 'subaru', 'jeep', 'dodge',
  'gmc', 'mazda', 'mitsubishi', 'hyundai', 'kia', 'volkswagen', 'vw', 'bmw', 'mercedes',
  'lexus', 'acura', 'isuzu', 'suzuki', 'yamaha', 'kawasaki', 'harley', 'harley-davidson',
  'ram', 'volvo', 'audi', 'scion', 'infiniti', 'buick',
];

// A compact make -> common models map to improve model extraction.
const MODELS: Record<string, string[]> = {
  toyota: ['tacoma', 'tundra', '4runner', 'corolla', 'camry', 'rav4', 'tercel', 'sienna', 'pickup', 'hilux', 'previa'],
  honda: ['cr-v', 'crv', 'civic', 'accord', 'pilot', 'odyssey', 'ridgeline', 'element', 'fit'],
  ford: ['ranger', 'f-150', 'f150', 'f-250', 'explorer', 'escape', 'focus', 'mustang', 'econoline'],
  nissan: ['frontier', 'titan', 'altima', 'sentra', 'xterra', 'pathfinder', 'versa'],
  subaru: ['outback', 'forester', 'impreza', 'legacy', 'crosstrek'],
  jeep: ['wrangler', 'cherokee', 'grand cherokee'],
};

export interface AutoFacts {
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
}

// Ordered so more specific phrases win.
const RUNNING_RULES: Array<[RegExp, RunningStatus]> = [
  [/\bruns?\s+(and|&)\s+drives?\b/i, 'runs_and_drives'],
  [/\b(does\s*n'?t|wont|won'?t|no)\s+start\b/i, 'no_start'],
  [/\bnot?\s+running\b/i, 'no_start'],
  [/\bparts?\s+(car|only)\b/i, 'no_start'],
  [/\bruns?\s+(good|great|strong|well)\b/i, 'runs'],
  [/\bruns\b/i, 'runs'],
];

const ISSUE_RULES: Array<[RegExp, string]> = [
  [/\bhead\s*gasket\b/i, 'head_gasket'],
  [/\boverheat(s|ing)?\b/i, 'overheating'],
  [/\btransmission\s+(bad|slipping|issue|problem)\b|\bno\s+reverse\b/i, 'transmission'],
  [/\bmisfire\b/i, 'misfire'],
  [/\balternator\b/i, 'alternator'],
  [/\bstarter\b/i, 'starter'],
  [/\bwheel\s+bearing\b/i, 'wheel_bearing'],
  [/\bclutch\b/i, 'clutch'],
  [/\bbrakes?\b.*\b(bad|need|soft|grind)/i, 'brakes'],
  [/\bcheck\s+engine\b|\bCEL\b/i, 'check_engine'],
  [/\bneeds?\s+tow\b|\bmust\s+tow\b/i, 'needs_tow'],
  [/\bmechanic'?s?\s+special\b/i, 'mechanic_special'],
  [/\brust\b/i, 'rust'],
  [/\bleak(s|ing|y)?\b/i, 'leak'],
];

export function parseAutomotive(rawTitle: string, rawDescription: string): AutoFacts {
  const text = `${rawTitle}\n${rawDescription}`;
  const lower = text.toLowerCase();

  const facts: AutoFacts = {
    runningStatus: 'unknown',
    titleStatus: 'unknown',
    registrationStatus: 'unknown',
    safetyStatus: 'unknown',
    drivetrain: 'unknown',
    transmission: 'unknown',
    issues: [],
  };

  // Year (1950–2029), take the first plausible 4-digit year.
  const yearMatch = text.match(/\b(19[5-9]\d|20[0-2]\d)\b/);
  if (yearMatch) facts.year = Number(yearMatch[1]);

  // Make + model
  for (const make of MAKES) {
    if (new RegExp(`\\b${make.replace('-', '[- ]?')}\\b`, 'i').test(text)) {
      facts.make = normalizeMake(make);
      const models = MODELS[facts.make.toLowerCase()] ?? [];
      for (const model of models) {
        if (new RegExp(`\\b${model.replace('-', '[- ]?')}\\b`, 'i').test(text)) {
          facts.model = model.toUpperCase();
          break;
        }
      }
      break;
    }
  }

  // Mileage: "201k", "201,000 miles", "201000 mi"
  facts.mileage = parseMileage(lower);

  // Running status
  for (const [re, status] of RUNNING_RULES) {
    if (re.test(text)) { facts.runningStatus = status; break; }
  }

  // Title status
  if (/\bclean\s+title\b/i.test(text)) facts.titleStatus = 'clean';
  else if (/\brebuilt\b/i.test(text)) facts.titleStatus = 'rebuilt';
  else if (/\bsalvage\b/i.test(text)) facts.titleStatus = 'salvage';
  else if (/\bno\s+title\b|\bbill\s+of\s+sale\s+only\b/i.test(text)) facts.titleStatus = 'no_title';

  // Registration
  if (/\breg(istration)?\s+(current|good|valid|up\s*to\s*date)\b|\bcurrent\s+reg/i.test(text))
    facts.registrationStatus = 'current';
  else if (/\breg(istration)?\s+(expired|out|lapsed)\b|\bexpired\s+reg/i.test(text))
    facts.registrationStatus = 'expired';

  // Safety check (Hawaiʻi vehicle safety inspection)
  if (/\bsafety\s+(current|good|valid|passed)\b|\bcurrent\s+safety\b/i.test(text))
    facts.safetyStatus = 'current';
  else if (/\bsafety\s+(expired|out|needed)\b|\bno\s+safety\b|\bneeds?\s+safety\b/i.test(text))
    facts.safetyStatus = 'expired';

  // Drivetrain
  if (/\b4x4\b|\bfour\s*wheel\s*drive\b|\b4wd\b/i.test(text)) facts.drivetrain = '4x4';
  else if (/\bawd\b|\ball\s*wheel\s*drive\b/i.test(text)) facts.drivetrain = 'awd';
  else if (/\brwd\b|\brear\s*wheel\s*drive\b/i.test(text)) facts.drivetrain = 'rwd';
  else if (/\bfwd\b|\bfront\s*wheel\s*drive\b/i.test(text)) facts.drivetrain = 'fwd';

  // Transmission
  if (/\b(manual|stick\s*shift|5\s*speed|6\s*speed|standard\s+trans)\b/i.test(text))
    facts.transmission = 'manual';
  else if (/\b(automatic|auto\s+trans|a\/t)\b/i.test(text)) facts.transmission = 'automatic';

  // Issues (deduped, order preserved)
  const seen = new Set<string>();
  for (const [re, tag] of ISSUE_RULES) {
    if (re.test(text) && !seen.has(tag)) { seen.add(tag); facts.issues.push(tag); }
  }

  return facts;
}

function parseMileage(lower: string): number | undefined {
  // "201k" / "201k miles" / "201,000 mi" / "201000 miles"
  const k = lower.match(/\b(\d{2,3})\s*k\b(?:\s*(?:miles|mi|mileage))?/);
  if (k) return Number(k[1]) * 1000;
  const full = lower.match(/\b(\d{2,3}(?:,\d{3})|\d{4,6})\s*(?:miles|mi|mileage)\b/);
  if (full) return Number(full[1].replace(/,/g, ''));
  return undefined;
}

function normalizeMake(make: string): string {
  const m = make.toLowerCase();
  if (m === 'chevy') return 'Chevrolet';
  if (m === 'vw') return 'Volkswagen';
  if (m === 'harley') return 'Harley-Davidson';
  return make.charAt(0).toUpperCase() + make.slice(1);
}
