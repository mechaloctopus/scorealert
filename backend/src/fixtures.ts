// Loads the Kauaʻi fixture listings and resolves their relative-time tokens
// (e.g. "MINUS_3_MIN") to concrete ISO timestamps relative to a reference `now`.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { RawListing } from './types.ts';

const TOKEN_RE = /^MINUS_(\d+)_(MIN|HOUR|DAY)$/;

export function resolvePostedAt(token: string | undefined, now: Date): string | undefined {
  if (!token) return undefined;
  const m = token.match(TOKEN_RE);
  if (!m) return token; // already an ISO string
  const n = Number(m[1]);
  const unitMs = m[2] === 'MIN' ? 60_000 : m[2] === 'HOUR' ? 3_600_000 : 86_400_000;
  return new Date(now.getTime() - n * unitMs).toISOString();
}

export async function loadFixtures(now: Date = new Date()): Promise<RawListing[]> {
  const path = fileURLToPath(new URL('../fixtures/kauai-listings.json', import.meta.url));
  const raw = JSON.parse(await readFile(path, 'utf8')) as RawListing[];
  return raw.map((r) => ({ ...r, postedAt: resolvePostedAt(r.postedAt, now) }));
}
