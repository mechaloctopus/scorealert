import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/pipeline/normalize.ts';
import { scoreListing } from '../src/pipeline/score.ts';
import { defaultRules, matchAll, matchRule } from '../src/watch/rules.ts';
import type { RawListing } from '../src/types.ts';

const rules = defaultRules();

async function prep(raw: RawListing, age = 5) {
  const n = await normalize(raw);
  const s = scoreListing({ listing: n, ageMinutes: age });
  return { n, s };
}

test('a running $1,500 Tacoma matches the Vehicles rule', async () => {
  const { n, s } = await prep({
    sourceId: 'facebook', url: 'x', title: '2006 Toyota Tacoma',
    description: 'runs and drives clean title current reg. $1,500. Lihue', price: 1500, locationText: 'Lihue, Kauai',
  });
  const matches = matchAll(n, s, rules);
  assert.ok(matches.some((m) => m.rule.name.startsWith('Vehicles')), 'should match vehicles rule');
});

test('free lumber matches the Free rule, not vehicles', async () => {
  const { n, s } = await prep({
    sourceId: 'facebook', url: 'x', title: 'FREE lumber curb alert',
    description: 'free you haul first come must go Kapaa', price: 0, locationText: 'Kapaa',
  });
  const matches = matchAll(n, s, rules);
  assert.ok(matches.some((m) => m.rule.name === 'Free Stuff'));
  assert.ok(!matches.some((m) => m.rule.name.startsWith('Vehicles')));
});

test('excluded keyword (dealer/financing) blocks a match', async () => {
  const { n, s } = await prep({
    sourceId: 'facebook', url: 'x', title: '2008 Toyota Corolla',
    description: 'runs and drives. Dealer financing available, low monthly down payment. $2,000 Lihue',
    price: 2000, locationText: 'Lihue, Kauai',
  });
  const vehicles = rules.find((r) => r.name.startsWith('Vehicles'))!;
  assert.equal(matchRule(n, s, vehicles).matched, false);
});

test('price outside window fails the rule', async () => {
  const { n, s } = await prep({
    sourceId: 'facebook', url: 'x', title: '2015 Toyota Tacoma',
    description: 'runs and drives clean title. $12,000. Lihue', price: 12000, locationText: 'Lihue, Kauai',
  });
  const vehicles = rules.find((r) => r.name.startsWith('Vehicles'))!;
  assert.equal(matchRule(n, s, vehicles).matched, false);
});

test('boat matches boats rule', async () => {
  const { n, s } = await prep({
    sourceId: 'facebook', url: 'x', title: '16ft aluminum skiff with trailer',
    description: 'fishing boat, motor runs. $2,800 Lihue', price: 2800, locationText: 'Lihue',
  });
  assert.ok(matchAll(n, s, rules).some((m) => m.rule.name.startsWith('Boats')));
});
