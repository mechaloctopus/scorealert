// Informational adapters for sources we do NOT auto-collect. They never fetch; they
// exist so the app can display an honest status + the legitimate path for each source.
// See docs/source-research.md for the policy reasoning behind each.

import type { RawListing } from '../types.ts';
import type { ListingSourceAdapter, SourceInfo } from './adapter.ts';

class InformationalAdapter implements ListingSourceAdapter {
  public info: SourceInfo;
  constructor(info: SourceInfo) { this.info = info; }
  async fetchNewListings(): Promise<RawListing[]> {
    // Never self-collects. Ingestion happens via manual share / email only.
    return [];
  }
}

export const CRAIGSLIST_INFO: SourceInfo = {
  id: 'craigslist',
  name: 'Craigslist Kauaʻi',
  policy: 'NOT_ALLOWED',
  autoCollect: false,
  health: 'policy_blocked',
  howItWorks: 'Craigslist prohibits automated access (aggressively enforced). Not scraped. Use Share → ScoreAlert, or paste a listing URL.',
};

export const FACEBOOK_INFO: SourceInfo = {
  id: 'facebook',
  name: 'Facebook Marketplace',
  policy: 'NOT_ALLOWED',
  autoCollect: false,
  health: 'policy_blocked',
  howItWorks: 'No public Marketplace API and scraping is prohibited. Ingest by tapping Share → ScoreAlert on a listing, or via your own saved-search alert emails.',
};

export const OFFERUP_INFO: SourceInfo = {
  id: 'offerup',
  name: 'OfferUp',
  policy: 'USER_PROVIDED',
  autoCollect: false,
  health: 'disabled',
  howItWorks: 'No official public API. Unofficial APIs are unsupported and disabled. Ingest via Share → ScoreAlert or OfferUp native alert emails.',
};

export const craigslistAdapter = new InformationalAdapter(CRAIGSLIST_INFO);
export const facebookAdapter = new InformationalAdapter(FACEBOOK_INFO);
export const offerupAdapter = new InformationalAdapter(OFFERUP_INFO);
