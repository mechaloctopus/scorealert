import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CraigslistAdapter, parseCraigslistRss, parseTitle } from '../src/sources/craigslist/adapter.ts';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:enc="http://purl.oclc.org/net/rss_2.0/enc#">
  <item rdf:about="https://honolulu.craigslist.org/kau/cto/d/lihue-tacoma/7712345678.html">
    <title><![CDATA[2006 Toyota Tacoma 4x4 - $1,500 (Lihue)]]></title>
    <link>https://honolulu.craigslist.org/kau/cto/d/lihue-tacoma/7712345678.html</link>
    <description><![CDATA[Runs and drives, clean title, current reg. 184k miles.]]></description>
    <dc:date>2026-08-16T09:45:00-10:00</dc:date>
    <enc:enclosure resource="https://images.craigslist.org/abc_300x300.jpg" type="image/jpeg"/>
  </item>
  <item rdf:about="https://honolulu.craigslist.org/kau/zip/d/free-lumber/7712345699.html">
    <title><![CDATA[Free lumber curb alert (Kapaa)]]></title>
    <link>https://honolulu.craigslist.org/kau/zip/d/free-lumber/7712345699.html</link>
    <description><![CDATA[First come first served, you haul.]]></description>
    <dc:date>2026-08-16T09:50:00-10:00</dc:date>
  </item>
</rdf:RDF>`;

test('parses Craigslist RDF/RSS items', () => {
  const items = parseCraigslistRss(SAMPLE_RSS, 'cta');
  assert.equal(items.length, 2);
  const t = items[0];
  assert.equal(t.sourceId, 'craigslist');
  assert.equal(t.externalId, '7712345678');
  assert.equal(t.price, 1500);
  assert.equal(t.locationText, 'Lihue');
  assert.match(t.title, /Toyota Tacoma/);
  assert.equal(t.imageUrls[0], 'https://images.craigslist.org/abc_300x300.jpg');
  assert.ok(t.postedAt);
});

test('parseTitle splits "title - $price (location)"', () => {
  assert.deepEqual(parseTitle('2006 Toyota Tacoma 4x4 - $1,500 (Lihue)'),
    { title: '2006 Toyota Tacoma 4x4', price: 1500, location: 'Lihue' });
  assert.deepEqual(parseTitle('Free lumber curb alert (Kapaa)'),
    { title: 'Free lumber curb alert', price: null, location: 'Kapaa' });
  assert.deepEqual(parseTitle('Boat no price no loc'),
    { title: 'Boat no price no loc', price: null, location: undefined });
});

test('adapter reports healthy on a mocked feed and degraded on 403', async () => {
  const okFetch = (async () => new Response(SAMPLE_RSS, { status: 200 })) as unknown as typeof fetch;
  const ok = new CraigslistAdapter({ base: 'https://x', subarea: 'kau', categories: ['cta'], fetchImpl: okFetch });
  const out = await ok.fetchNewListings();
  assert.equal(out.length, 2);
  assert.equal(ok.info.health, 'healthy');

  const blockedFetch = (async () => new Response('blocked', { status: 403 })) as unknown as typeof fetch;
  const blocked = new CraigslistAdapter({ base: 'https://x', subarea: 'kau', categories: ['cta'], fetchImpl: blockedFetch });
  const out2 = await blocked.fetchNewListings();
  assert.deepEqual(out2, []);
  assert.equal(blocked.info.health, 'degraded');   // reports, never evades
});
