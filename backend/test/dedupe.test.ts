import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/pipeline/normalize.ts';
import { compare, extractPhone, findDuplicate } from '../src/pipeline/dedupe.ts';
import type { RawListing } from '../src/types.ts';

const fbTacoma: RawListing = {
  sourceId: 'facebook', url: 'fb', title: '2006 Toyota Tacoma - runs and drives',
  description: '184k miles, 4x4 automatic, clean title. $1,500 obo. Lihue. 808-555-0142',
  price: 1500, locationText: 'Lihue, Kauai',
};
const clTacoma: RawListing = {
  sourceId: 'craigslist', url: 'cl', title: '06 Tacoma 4x4 Lihue',
  description: '2006 Toyota Tacoma 184,000 miles runs and drives clean title $1500 call 808-555-0142',
  price: 1500, locationText: 'Lihue',
};
const differentCar: RawListing = {
  sourceId: 'offerup', url: 'ou', title: '2010 Honda CR-V',
  description: 'AWD 201k miles $3,200 Kapaa', price: 3200, locationText: 'Kapaa',
};

test('extractPhone finds and normalizes US numbers', () => {
  assert.equal(extractPhone('call 808-555-0142 today'), '8085550142');
  assert.equal(extractPhone('no phone here'), null);
});

test('same vehicle across FB + Craigslist is detected as duplicate', async () => {
  const a = await normalize(fbTacoma);
  const b = await normalize(clTacoma);
  const r = compare(a, b);
  assert.equal(r.isDuplicate, true, `reasons: ${r.reasons.join(', ')} score ${r.score}`);
  assert.ok(r.reasons.some((x) => /phone/.test(x)) || r.score >= 0.62);
});

test('different vehicles are not duplicates', async () => {
  const a = await normalize(fbTacoma);
  const c = await normalize(differentCar);
  assert.equal(compare(a, c).isDuplicate, false);
});

test('findDuplicate returns the best match from a pool', async () => {
  const incoming = await normalize(clTacoma);
  const pool = await Promise.all([differentCar, fbTacoma].map((r) => normalize(r)));
  const found = findDuplicate(incoming, pool);
  assert.ok(found);
  assert.equal(found!.match.sourceId, 'facebook');
});
