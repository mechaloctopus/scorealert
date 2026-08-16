import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromScrapeBatch, parsePrice, resolvePostedText } from '../src/sources/scrape/adapter.ts';
import { createApp } from '../src/app.ts';
import { MemoryFcmSender } from '../src/alerts/fcm.ts';
import { ingest } from '../src/ingest/pipeline.ts';

test('parsePrice handles $, commas, and free', () => {
  assert.equal(parsePrice('$1,500'), 1500);
  assert.equal(parsePrice('Free'), 0);
  assert.equal(parsePrice(2200), 2200);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice('call for price'), null);
});

test('resolvePostedText converts relative ages', () => {
  const base = '2026-08-16T12:00:00.000Z';
  assert.equal(resolvePostedText('3 minutes ago', base), '2026-08-16T11:57:00.000Z');
  assert.equal(resolvePostedText('2 hours ago', base), '2026-08-16T10:00:00.000Z');
  assert.equal(resolvePostedText('yesterday', base), '2026-08-15T12:00:00.000Z');
});

test('fromScrapeBatch maps userscript cards to RawListings', () => {
  const raws = fromScrapeBatch({
    source: 'facebook',
    capturedAt: '2026-08-16T12:00:00.000Z',
    listings: [
      { url: 'https://www.facebook.com/marketplace/item/123', title: '2006 Toyota Tacoma',
        price: '$1,500', location: 'Lihue', image: 'https://img/1.jpg', postedText: '5 minutes ago' },
      { url: '', title: 'skip me' },            // no url -> dropped
    ],
  });
  assert.equal(raws.length, 1);
  assert.equal(raws[0].sourceId, 'facebook');
  assert.equal(raws[0].externalId, '123');
  assert.equal(raws[0].price, 1500);
  assert.equal(raws[0].postedAt, '2026-08-16T11:55:00.000Z');
});

test('scraped Facebook listing flows through the pipeline to an alert', async () => {
  const fcm = new MemoryFcmSender();
  const app = createApp({ fcm });
  const raws = fromScrapeBatch({
    source: 'facebook',
    capturedAt: new Date().toISOString(),
    listings: [{
      url: 'https://www.facebook.com/marketplace/item/999',
      title: '2004 Toyota 4Runner 4x4',
      price: '$1,200', location: 'Lihue',
      description: 'Runs and drives, clean title, current reg. Must sell leaving island.',
      postedText: '2 minutes ago',
    }],
  });
  const report = await ingest(raws, app);
  assert.equal(report.created, 1);
  assert.ok(fcm.sent.some((m) => /4Runner/i.test(m.notification.title)));
});
