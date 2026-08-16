import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAutomotive } from '../src/pipeline/automotive-parser.ts';

test('extracts year, make, model, mileage', () => {
  const f = parseAutomotive('2006 Toyota Tacoma', 'runs and drives, 184k miles, 4x4 automatic, clean title, reg current');
  assert.equal(f.year, 2006);
  assert.equal(f.make, 'Toyota');
  assert.equal(f.model, 'TACOMA');
  assert.equal(f.mileage, 184000);
  assert.equal(f.runningStatus, 'runs_and_drives');
  assert.equal(f.drivetrain, '4x4');
  assert.equal(f.transmission, 'automatic');
  assert.equal(f.titleStatus, 'clean');
  assert.equal(f.registrationStatus, 'current');
});

test('mileage variants', () => {
  assert.equal(parseAutomotive('x', '201,000 miles').mileage, 201000);
  assert.equal(parseAutomotive('x', '201k').mileage, 201000);
  assert.equal(parseAutomotive('x', '95000 mi').mileage, 95000);
});

test('running status precedence: parts car => no_start', () => {
  assert.equal(parseAutomotive('Explorer', 'parts car, blown head gasket, does not start').runningStatus, 'no_start');
});

test('runs (not drives) is distinct from runs_and_drives', () => {
  assert.equal(parseAutomotive('x', 'runs good but overheats').runningStatus, 'runs');
  assert.equal(parseAutomotive('x', 'runs and drives').runningStatus, 'runs_and_drives');
});

test('collects mechanical issues without inventing them', () => {
  const f = parseAutomotive('x', 'needs alternator, front wheel bearing noise, overheating on hills');
  assert.ok(f.issues.includes('alternator'));
  assert.ok(f.issues.includes('wheel_bearing'));
  assert.ok(f.issues.includes('overheating'));
  assert.equal(parseAutomotive('x', 'perfect condition').issues.length, 0);
});

test('salvage vs clean title', () => {
  assert.equal(parseAutomotive('x', 'salvage title').titleStatus, 'salvage');
  assert.equal(parseAutomotive('x', 'bill of sale only').titleStatus, 'no_title');
});

test('does not match "car" inside "carbon" via make list (no false make)', () => {
  const f = parseAutomotive('carbon fiber hood', 'brand new');
  assert.equal(f.make, undefined);
});
