// Scheduled job: poll eBay and run new listings through the pipeline.
// Run on a cron (Cloud Scheduler / cron / Supabase scheduled function). The phone never
// polls — this is the cloud doing the work while the app is closed.
//
//   npm run poll:ebay

import { createApp } from '../app.ts';
import { HttpFcmSender } from '../alerts/fcm.ts';
import { ingest } from '../ingest/pipeline.ts';
import { EbayAdapter, defaultQueries } from '../sources/ebay/adapter.ts';

async function main() {
  const adapter = new EbayAdapter({
    clientId: process.env.EBAY_CLIENT_ID ?? '',
    clientSecret: process.env.EBAY_CLIENT_SECRET ?? '',
    env: (process.env.EBAY_ENV as 'PRODUCTION' | 'SANDBOX') ?? 'PRODUCTION',
    pickupPostalCode: process.env.EBAY_PICKUP_POSTAL_CODE ?? '96766',
    marketplaceId: process.env.EBAY_MARKETPLACE_ID ?? 'EBAY_US',
    queries: defaultQueries(),
  });

  if (adapter.info.health === 'authorization_required' || !process.env.EBAY_CLIENT_ID) {
    console.error('eBay credentials not configured (EBAY_CLIENT_ID/SECRET). Skipping.');
    process.exit(process.env.EBAY_CLIENT_ID ? 1 : 0);
  }

  // Use the real FCM sender in production; falls back to logging if unconfigured.
  const app = createApp({ fcm: new HttpFcmSender() });

  const started = Date.now();
  const raws = await adapter.fetchNewListings();
  const report = await ingest(raws, app);

  console.log(JSON.stringify({
    source: 'ebay',
    health: adapter.info.health,
    ms: Date.now() - started,
    seen: report.seen,
    created: report.created,
    duplicates: report.duplicates,
    priceDrops: report.priceDrops,
    alertsDelivered: report.alerts.filter((a) => a.delivered).length,
  }));
}

main().catch((e) => { console.error(e); process.exit(1); });
