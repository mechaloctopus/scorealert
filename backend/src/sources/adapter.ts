// Common source-adapter contract. Every source implements this — including restricted
// ones, which exist in informational form so the UI can explain their legitimate path.

import type { RawListing, SourceHealth, SourcePolicy } from '../types.ts';

export interface SourceInfo {
  id: string;
  name: string;
  policy: SourcePolicy;
  /** Whether the cloud polls this source unattended. False for share/email/restricted. */
  autoCollect: boolean;
  /** Current operational state, surfaced on the admin screen. */
  health: SourceHealth;
  /** One-line, user-facing explanation of how this source is (or isn't) monitored. */
  howItWorks: string;
}

export interface ListingSourceAdapter {
  info: SourceInfo;
  /**
   * Pull new listings. Automated sources hit their API; restricted/informational
   * sources return [] (they never self-collect). Share/email adapters are driven by
   * incoming events instead and expose parse* helpers rather than fetchNewListings.
   */
  fetchNewListings(): Promise<RawListing[]>;
}
