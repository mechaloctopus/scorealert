import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/pipeline/normalize.ts';
import { scoreListing } from '../src/pipeline/score.ts';
import type { RawListing } from '../src/types.ts';

async function score(raw: RawListing, ageMinutes: number) {
  const n = await normalize(raw);
  return scoreListing({ listing: n, ageMinutes });
}

test('cheap running Toyota posted minutes ago scores HOT (>=90)', async () => {
  const s = await score({
    sourceId: 'facebook',
    url: 'x',
    title: '2006 Toyota Tacoma',
    description: 'Runs and drives. Clean title, registration current. 4x4. $900. Located Kapaʻa. Must sell, leaving island.',
    price: 900,
    locationText: 'Kapaa, Kauai',
  }, 2);
  assert.equal(s.label, 'SCORE_NOW');
  assert.ok(s.overall >= 90, `expected >=90 got ${s.overall}`);
  assert.ok(s.explanation.positives.some((p) => /runs and drives/i.test(p)));
});

test('broken expensive stale vehicle scores low (~40)', async () => {
  const s = await score({
    sourceId: 'facebook',
    url: 'x',
    title: '2003 Ford Explorer parts car',
    description: 'Blown head gasket, does not start, salvage title. $3,400.',
    price: 3400,
    locationText: 'Waimea',
  }, 14 * 24 * 60);
  assert.ok(s.overall < 60, `expected <60 got ${s.overall}`);
  assert.ok(s.explanation.watchouts.length > 0);
});

test('free item scores well on price+category', async () => {
  const s = await score({
    sourceId: 'facebook',
    url: 'x',
    title: 'FREE lumber curb alert',
    description: 'Free, you haul, first come, must go today. Kapaʻa.',
    price: 0,
    locationText: 'Kapaa',
  }, 5);
  assert.equal(s.price, 30);
  assert.ok(s.overall >= 75);
});

test('neighbor-island listing loses location points', async () => {
  const s = await score({
    sourceId: 'offerup',
    url: 'x',
    title: '2005 Toyota Corolla',
    description: 'Runs and drives, clean title. $2,500. Honolulu Oahu.',
    price: 2500,
    locationText: 'Honolulu, Oahu',
  }, 30);
  assert.ok(s.location <= 3, `expected low location got ${s.location}`);
  assert.ok(s.explanation.watchouts.some((w) => /neighbor island/i.test(w)));
});

test('score is bounded 0..100', async () => {
  const s = await score({ sourceId: 'x', url: 'x', title: 'thing', description: '', price: 1 }, 0);
  assert.ok(s.overall >= 0 && s.overall <= 100);
});
