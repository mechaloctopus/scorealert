// Scheduled job: run every server-side collector and push new listings.
// eBay runs only if credentials are set; Craigslist RSS always runs (no login).
// Facebook + OfferUp are captured by the userscript, not here.
//
//   npm run poll
// Schedule on cron / Cloud Scheduler. The phone never polls — this is the cloud working
// while the app is closed.

import { createApp } from '../app.ts';
import { HttpFcmSender } from '../alerts/fcm.ts';
import { ingest } from '../ingest/pipeline.ts';
import { EbayAdapter, defaultQueries } from '../sources/ebay/adapter.ts';
import { CraigslistAdapter, defaultCategories } from '../sources/craigslist/adapter.ts';
import type { ListingSourceAdapter } from '../sources/adapter.ts';

async function main() {
  const app = createApp({ fcm: new HttpFcmSender() });
  const collectors: ListingSourceAdapter[] = [];

  // Craigslist RSS (hands-off, no credentials).
  collectors.push(new CraigslistAdapter({
    base: process.env.CRAIGSLIST_BASE ?? 'https://honolulu.craigslist.org',
    subarea: process.env.CRAIGSLIST_SUBAREA ?? 'kau', // Kauaʻi
    categories: (process.env.CRAIGSLIST_CATEGORIES?.split(',')) ?? defaultCategories(),
    params: {
      ...(process.env.VEHICLE_MIN_PRICE ? { min_price: process.env.VEHICLE_MIN_PRICE } : {}),
      ...(process.env.VEHICLE_MAX_PRICE ? { max_price: process.env.VEHICLE_MAX_PRICE } : {}),
    },
  }));

  // eBay (only with credentials).
  if (process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET) {
    collectors.push(new EbayAdapter({
      clientId: process.env.EBAY_CLIENT_ID,
      clientSecret: process.env.EBAY_CLIENT_SECRET,
      env: (process.env.EBAY_ENV as 'PRODUCTION' | 'SANDBOX') ?? 'PRODUCTION',
      pickupPostalCode: process.env.EBAY_PICKUP_POSTAL_CODE ?? '96766',
      marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US',
      queries: defaultQueries(),
    }));
  }

  for (const collector of collectors) {
    const started = Date.now();
    try {
      const raws = await collector.fetchNewListings();
      const report = await ingest(raws, app);
      log(collector.info.id, collector.info.health, Date.now() - started, report);
    } catch (err) {
      console.error(JSON.stringify({ source: collector.info.id, error: (err as Error).message }));
    }
  }
}

function log(source: string, health: string, ms: number, report: Awaited<ReturnType<typeof ingest>>) {
  console.log(JSON.stringify({
    source, health, ms,
    seen: report.seen, created: report.created, duplicates: report.duplicates,
    priceDrops: report.priceDrops, alertsDelivered: report.alerts.filter((a) => a.delivered).length,
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
