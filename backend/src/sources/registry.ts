// Source registry. Single place the app/admin screen reads to know what ScoreAlert is
// (and isn't) monitoring. Mirrors db/migrations/0002_seed.sql.

import type { SourceInfo } from './adapter.ts';
import { EBAY_INFO } from './ebay/adapter.ts';
import { CRAIGSLIST_INFO } from './craigslist/adapter.ts';
import { FACEBOOK_INFO, OFFERUP_INFO } from './informational.ts';

export const EMAIL_INFO: SourceInfo = {
  id: 'email',
  name: 'Email alert ingestion',
  policy: 'EMAIL_ALERT',
  autoCollect: true,
  health: 'healthy',
  howItWorks: 'Parses your own saved-search alert emails via an inbound webhook. Event-driven; no site is crawled.',
};

export const MANUAL_INFO: SourceInfo = {
  id: 'manual',
  name: 'Manual / Share Sheet',
  policy: 'USER_PROVIDED',
  autoCollect: false,
  health: 'healthy',
  howItWorks: 'Tap Share → ScoreAlert from any app (FB Marketplace, OfferUp, Craigslist, Chrome). The universal legitimate fallback.',
};

/** The full source register, in display order. */
export const SOURCE_REGISTRY: SourceInfo[] = [
  { ...EBAY_INFO },
  { ...EMAIL_INFO },
  { ...MANUAL_INFO },
  { ...FACEBOOK_INFO },
  { ...CRAIGSLIST_INFO },
  { ...OFFERUP_INFO },
];

export function sourceInfo(id: string): SourceInfo | undefined {
  return SOURCE_REGISTRY.find((s) => s.id === id);
}
