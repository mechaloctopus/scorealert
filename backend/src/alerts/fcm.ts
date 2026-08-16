// Firebase Cloud Messaging sender (HTTP v1). Builds the notification payload from an
// Alert and posts it to FCM. Auth uses a service account via GOOGLE_APPLICATION_CREDENTIALS;
// the access token is minted with a signed JWT (no third-party deps).
//
// NOTE: FCM credentials live only server-side. Nothing here is shipped in the APK.

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Alert } from '../types.ts';

export interface FcmMessage {
  token: string;
  notification: { title: string; body: string; image?: string };
  android: { priority: 'HIGH' | 'NORMAL'; notification: { channel_id: string; sound?: string } };
  data: Record<string, string>;
}

const LABELS: Record<string, string> = {
  SCORE_NOW: '🔥 SCORE NOW', GREAT_FIND: '⭐ GREAT FIND', GOOD_LEAD: 'GOOD LEAD', BELOW: '',
};

const CATEGORY_EMOJI: Record<string, string> = {
  car: '🚗', truck: '🚗', van: '🚗', suv: '🚗', motorcycle: '🏍', boat: '🚤', free: '🆓',
  trailer: '🚛', tool: '🛠', other: '📦',
};

/** Build the FCM message body for an alert (pure; testable without network). */
export function buildMessage(alert: Alert, token: string): FcmMessage {
  const { listing, score } = alert;
  const emoji = alert.kind === 'price_drop' ? '💰' : (CATEGORY_EMOJI[listing.facts.category] ?? '📦');
  const priceStr = listing.facts.isFree || listing.price === 0 ? 'FREE' : `$${(listing.price ?? 0).toLocaleString()}`;

  const titleBits = [listing.facts.year, listing.facts.make, listing.facts.model].filter(Boolean).join(' ');
  const itemName = titleBits || truncate(listing.title, 40);

  const title = alert.kind === 'price_drop'
    ? `💰 PRICE DROP — ${itemName}`
    : `${LABELS[score.label] || emoji} ${score.label !== 'BELOW' ? score.overall : ''} — ${itemName}`.trim();

  const bodyLines: string[] = [];
  bodyLines.push(alert.kind === 'price_drop' && alert.priceDrop
    ? `$${alert.priceDrop.from.toLocaleString()} → $${alert.priceDrop.to.toLocaleString()}`
    : `${priceStr}${listing.town ? ' · ' + listing.town : ''}`);
  if (listing.facts.mileage) bodyLines.push(`${listing.facts.mileage.toLocaleString()} mi`);
  const claim = firstSentence(listing.description);
  if (claim) bodyLines.push(`“${truncate(claim, 60)}”`);

  return {
    token,
    notification: { title, body: bodyLines.join(' · '), image: listing.primaryImageUrl },
    android: {
      // Channel always reflects the category (Vehicle/Motorcycle/Boat/Free/Price Drop);
      // the "🔥 score now" urgency is conveyed by HIGH priority + a distinct sound so a
      // hot free item still lands on the Free channel the user configured.
      priority: alert.highPriority ? 'HIGH' : 'NORMAL',
      notification: {
        channel_id: channelForCategory(listing.facts.category, alert.kind),
        sound: alert.highPriority ? 'score_now' : 'default',
      },
    },
    data: {
      listingId: listing.id,
      score: String(score.overall),
      label: score.label,
      source: listing.sourceId,
      category: listing.facts.category,
      kind: alert.kind,
      deeplink: `scorealert://listing/${listing.id}`,
      url: listing.canonicalUrl,
    },
  };
}

function channelForCategory(cat: string, kind: string): string {
  if (kind === 'price_drop') return 'price_drop';
  if (cat === 'free') return 'free';
  if (cat === 'motorcycle') return 'motorcycle';
  if (cat === 'boat') return 'boat';
  return 'vehicle';
}

export interface FcmSender {
  send(message: FcmMessage): Promise<{ ok: boolean; id?: string; error?: string }>;
}

/** Real FCM sender over HTTP v1. Lazily loads the service account + mints a token. */
export class HttpFcmSender implements FcmSender {
  private token?: { value: string; exp: number };
  private projectId: string;
  constructor(projectId = process.env.FCM_PROJECT_ID ?? '') {
    this.projectId = projectId;
  }

  async send(message: FcmMessage): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!this.projectId) return { ok: false, error: 'FCM_PROJECT_ID not set' };
    const accessToken = await this.accessToken();
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return { ok: false, error: `FCM ${res.status}: ${await res.text()}` };
    const json = (await res.json()) as { name?: string };
    return { ok: true, id: json.name };
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!keyPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS not set');
    const sa = JSON.parse(await readFile(keyPath, 'utf8')) as { client_email: string; private_key: string };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
    };
    const jwt = signJwt(claim, sa.private_key);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }
}

/** A no-op sender used by tests + the demo; records what it would have sent. */
export class MemoryFcmSender implements FcmSender {
  public sent: FcmMessage[] = [];
  async send(message: FcmMessage): Promise<{ ok: boolean; id?: string }> {
    this.sent.push(message);
    return { ok: true, id: `mem_${this.sent.length}` };
  }
}

function signJwt(claim: object, privateKey: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const enc = (o: object) => base64url(Buffer.from(JSON.stringify(o)));
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = base64url(signer.sign(privateKey));
  return `${unsigned}.${sig}`;
}

function base64url(b: Buffer): string {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function firstSentence(s: string): string {
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
}
