import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.ts';
import { MemoryFcmSender } from '../src/alerts/fcm.ts';
import { ingest } from '../src/ingest/pipeline.ts';
import { loadFixtures } from '../src/fixtures.ts';
import type { RawListing } from '../src/types.ts';

test('end-to-end over Kauaʻi fixtures: dedupes, scores, alerts', async () => {
  const now = new Date();
  const fcm = new MemoryFcmSender();
  const app = createApp({ fcm });
  const raws = await loadFixtures(now);

  const report = await ingest(raws, { ...app, now: () => now });

  // 8 fixtures, but the CL Tacoma duplicates the FB Tacoma -> 1 duplicate.
  assert.equal(report.seen, 8);
  assert.ok(report.duplicates >= 1, 'FB+CL Tacoma should dedupe');
  assert.ok(report.created >= 5);

  // The fresh running Tacoma should be pushed as a high-scoring alert.
  const pushed = fcm.sent.map((m) => m.notification.title);
  assert.ok(pushed.some((t) => /Tacoma/i.test(t)), `pushed: ${pushed.join(' | ')}`);

  // The free lumber curb alert should be pushed on the free channel.
  const freeMsg = fcm.sent.find((m) => m.data.category === 'free');
  assert.ok(freeMsg, 'free item should alert');
  assert.equal(freeMsg!.android.notification.channel_id, 'free');

  // The Oahu Corolla should NOT be a high-priority push (neighbor island low score/loc).
  const corolla = fcm.sent.find((m) => /Corolla/i.test(m.notification.title));
  if (corolla) assert.notEqual(corolla.android.priority, 'HIGH');
});

test('NEW detection: re-ingesting the same listing produces no new alert', async () => {
  const now = new Date();
  const fcm = new MemoryFcmSender();
  const app = createApp({ fcm });
  const raw: RawListing = {
    sourceId: 'facebook', url: 'x', externalId: 'fb-x1', title: '2006 Toyota Tacoma',
    description: 'runs and drives clean title current reg $1,500 Lihue', price: 1500,
    locationText: 'Lihue, Kauai', postedAt: new Date(now.getTime() - 3 * 60000).toISOString(),
  };

  const r1 = await ingest([raw], { ...app, now: () => now });
  const first = fcm.sent.length;
  assert.equal(r1.created, 1);
  assert.ok(first >= 1);

  const r2 = await ingest([raw], { ...app, now: () => now });
  assert.equal(r2.created, 0, 'second pass creates nothing');
  assert.equal(fcm.sent.length, first, 'no duplicate push');
});

test('PRICE DROP: a significant reduction fires a price_drop alert', async () => {
  const now = new Date();
  const fcm = new MemoryFcmSender();
  const app = createApp({ fcm });
  const base: RawListing = {
    sourceId: 'facebook', url: 'x', externalId: 'fb-drop', title: '2006 Toyota Tacoma',
    description: 'runs and drives clean title current reg Lihue', price: 2500,
    locationText: 'Lihue, Kauai', postedAt: new Date(now.getTime() - 3 * 60000).toISOString(),
  };
  await ingest([base], { ...app, now: () => now });
  const before = fcm.sent.length;

  const dropped = { ...base, price: 1700 }; // -$800, well past thresholds
  const r = await ingest([dropped], { ...app, now: () => now });
  assert.equal(r.priceDrops, 1);
  const dropMsg = fcm.sent.slice(before).find((m) => m.data.kind === 'price_drop');
  assert.ok(dropMsg, 'a price_drop push should be sent');
  assert.match(dropMsg!.notification.title, /PRICE DROP/);
  assert.match(dropMsg!.notification.body, /2,500.*1,700/);
});
