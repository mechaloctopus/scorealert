import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromShare, parseSharedPrice, sourceForUrl } from '../src/sources/manual/adapter.ts';
import { parseEmail } from '../src/sources/email/adapter.ts';
import { EbayAdapter } from '../src/sources/ebay/adapter.ts';

test('share: maps host to source and parses price', () => {
  assert.equal(sourceForUrl('https://www.facebook.com/marketplace/item/1'), 'facebook');
  assert.equal(sourceForUrl('https://honolulu.craigslist.org/kau/cto/1.html'), 'craigslist');
  assert.equal(sourceForUrl('https://offerup.com/item/detail/1'), 'offerup');
  assert.equal(sourceForUrl('https://example.com/thing'), 'manual');
  assert.equal(parseSharedPrice('Great truck $1,200 obo'), 1200);
  assert.equal(parseSharedPrice('FREE curb alert'), 0);
});

test('share: builds a RawListing from payload without network', async () => {
  const raw = await fromShare({
    url: 'https://www.facebook.com/marketplace/item/123',
    text: '2006 Toyota Tacoma\nRuns and drives, $1,500, Lihue',
    imageUrl: 'https://img.invalid/t.jpg',
  });
  assert.equal(raw.sourceId, 'facebook');
  assert.equal(raw.title, '2006 Toyota Tacoma');
  assert.equal(raw.price, 1500);
  assert.deepEqual(raw.imageUrls, ['https://img.invalid/t.jpg']);
});

test('email: extracts listing links + price from HTML alert', () => {
  const html = `
    <html><body>
      <p>New matches for your saved search</p>
      <a href="https://offerup.com/item/detail/555">2008 Toyota Tacoma — $2,200</a>
      <img src="https://img.invalid/tac.jpg"/>
      <a href="https://offerup.com/account/settings">Unsubscribe</a>
    </body></html>`;
  const raws = parseEmail({ from: 'alerts@offerup.com', subject: 'Saved search', html });
  assert.equal(raws.length, 1, 'unsubscribe link filtered out');
  assert.equal(raws[0].sourceId, 'offerup');
  assert.match(raws[0].title, /Tacoma/);
  assert.equal(raws[0].price, 2200);
});

test('ebay: adapter reports authorization_required without credentials', async () => {
  const adapter = new EbayAdapter({
    clientId: '', clientSecret: '', env: 'SANDBOX',
    pickupPostalCode: '96766', marketplaceId: 'EBAY_US', queries: [],
  });
  const out = await adapter.fetchNewListings();
  assert.deepEqual(out, []);
  assert.equal(adapter.info.health, 'authorization_required');
});

test('ebay: parses a mocked Browse API response into RawListings', async () => {
  const fakeFetch: typeof fetch = (async (url: string | URL) => {
    const u = String(url);
    if (u.includes('/oauth2/token')) {
      return jsonResponse({ access_token: 'tok', expires_in: 7200 });
    }
    return jsonResponse({
      itemSummaries: [{
        itemId: 'v1|123|0', title: '2006 Toyota Tacoma',
        shortDescription: 'runs and drives', price: { value: '1500.00', currency: 'USD' },
        image: { imageUrl: 'https://img.invalid/e.jpg' },
        itemWebUrl: 'https://www.ebay.com/itm/123',
        itemLocation: { city: 'Lihue', stateOrProvince: 'HI' },
        itemCreationDate: '2026-08-16T00:00:00Z',
      }],
    });
  }) as unknown as typeof fetch;

  const adapter = new EbayAdapter({
    clientId: 'id', clientSecret: 'secret', env: 'PRODUCTION',
    pickupPostalCode: '96766', marketplaceId: 'EBAY_US',
    queries: [{ q: 'tacoma', minPrice: 500, maxPrice: 3500, localPickup: true, radiusMiles: 75 }],
    fetchImpl: fakeFetch,
  });
  const out = await adapter.fetchNewListings();
  assert.equal(out.length, 1);
  assert.equal(out[0].sourceId, 'ebay');
  assert.equal(out[0].price, 1500);
  assert.equal(out[0].externalId, 'v1|123|0');
  assert.equal(adapter.info.health, 'healthy');
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}
