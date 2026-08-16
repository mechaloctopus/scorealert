// Source info for Facebook Marketplace + OfferUp. Both are captured through the ScoreAlert
// userscript running in the user's OWN browser (in-session, user-driven) — not a server
// bot. Craigslist has its own RSS collector (craigslist/adapter.ts); eBay + email poll
// server-side. See docs/personal-collectors.md.

import type { RawListing } from '../types.ts';
import type { ListingSourceAdapter, SourceInfo } from './adapter.ts';

class InformationalAdapter implements ListingSourceAdapter {
  public info: SourceInfo;
  constructor(info: SourceInfo) { this.info = info; }
  async fetchNewListings(): Promise<RawListing[]> {
    // No server-side collection. Listings arrive via the userscript -> /ingest/scrape,
    // or the Android Share Sheet -> /ingest/share.
    return [];
  }
}

export const FACEBOOK_INFO: SourceInfo = {
  id: 'facebook',
  name: 'Facebook Marketplace',
  policy: 'USER_PROVIDED',
  autoCollect: false,
  health: 'healthy',
  howItWorks: 'Captured by the ScoreAlert userscript in your own browser as you browse Marketplace (or via Share → ScoreAlert). No account automation.',
};

export const OFFERUP_INFO: SourceInfo = {
  id: 'offerup',
  name: 'OfferUp',
  policy: 'USER_PROVIDED',
  autoCollect: false,
  health: 'healthy',
  howItWorks: 'Captured by the ScoreAlert userscript in your own browser as you browse OfferUp (or via Share → ScoreAlert).',
};

export const facebookAdapter = new InformationalAdapter(FACEBOOK_INFO);
export const offerupAdapter = new InformationalAdapter(OFFERUP_INFO);
