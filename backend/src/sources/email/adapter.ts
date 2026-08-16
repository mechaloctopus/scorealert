// Email alert ingestion. When a site the user subscribed to sends a saved-search alert
// email to the ScoreAlert inbox, an inbound-email webhook (SendGrid/Mailgun/CloudMailin)
// POSTs the message here. We extract listing links + metadata from the user's OWN email —
// no site is crawled.
//
// Parsing is best-effort and per-sender: a generic extractor pulls anchor links + nearby
// price/title text; sender-specific extractors can refine it.

import type { RawListing } from '../../types.ts';

export interface InboundEmail {
  from: string;
  subject: string;
  html?: string;
  text?: string;
  receivedAt?: string;
}

/** Route to a sender-specific extractor, else the generic one. */
export function parseEmail(email: InboundEmail): RawListing[] {
  const from = email.from.toLowerCase();
  if (from.includes('ebay')) return parseGeneric(email, 'ebay');
  if (from.includes('offerup')) return parseGeneric(email, 'offerup');
  if (from.includes('craigslist')) return parseGeneric(email, 'craigslist');
  if (from.includes('facebook') || from.includes('facebookmail')) return parseGeneric(email, 'facebook');
  return parseGeneric(email, 'email');
}

/**
 * Generic extractor: find listing-ish anchors in the HTML, and pull a title + price from
 * the link text / surrounding context. Falls back to plain-text link scan.
 */
export function parseGeneric(email: InboundEmail, sourceId: string): RawListing[] {
  const out: RawListing[] = [];
  const seen = new Set<string>();
  const html = email.html ?? '';

  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const url = cleanUrl(m[1]);
    const linkText = stripTags(m[2]).trim();
    if (!looksLikeListing(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    const context = html.slice(Math.max(0, m.index - 400), Math.min(html.length, anchorRe.lastIndex + 400));
    const price = extractPrice(linkText) ?? extractPrice(context);
    const title = linkText && linkText.length > 3 ? linkText : (extractTitle(context) ?? email.subject);
    out.push({
      sourceId,
      url,
      title,
      description: stripTags(context).replace(/\s+/g, ' ').trim().slice(0, 500),
      price,
      currency: 'USD',
      imageUrls: extractImage(context) ? [extractImage(context)!] : [],
      postedAt: email.receivedAt,
      raw: { via: 'email', from: email.from, subject: email.subject },
    });
  }

  // Plain-text fallback if no HTML anchors found.
  if (out.length === 0 && email.text) {
    const urlRe = /https?:\/\/[^\s<>"']+/gi;
    for (const url of email.text.match(urlRe) ?? []) {
      const clean = cleanUrl(url);
      if (!looksLikeListing(clean) || seen.has(clean)) continue;
      seen.add(clean);
      out.push({
        sourceId, url: clean, title: email.subject,
        description: email.text.slice(0, 500), price: extractPrice(email.text),
        currency: 'USD', imageUrls: [], postedAt: email.receivedAt,
        raw: { via: 'email', from: email.from, subject: email.subject },
      });
    }
  }
  return out;
}

function looksLikeListing(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  // filter out unsubscribe / tracking / settings links
  if (/unsubscribe|preferences|settings|privacy|help|support|account/i.test(url)) return false;
  return /item|listing|marketplace|\/itm\/|\/d\/|for-sale|\/p\/|\/ad\//i.test(url) || /craigslist\.org/i.test(url);
}

function extractPrice(text: string): number | null {
  const m = text.match(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function extractTitle(context: string): string | undefined {
  const text = stripTags(context).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 80) : undefined;
}

function extractImage(context: string): string | undefined {
  const m = context.match(/<img\b[^>]*src=["']([^"']+)["']/i);
  return m ? cleanUrl(m[1]) : undefined;
}

function cleanUrl(url: string): string {
  return url.replace(/&amp;/g, '&').trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ');
}
