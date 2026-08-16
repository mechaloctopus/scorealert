// ScoreAlert HTTP backend. Zero-dependency Node http server exposing:
//   POST /ingest/share   — Android Share Sheet ingestion            (SHARE_INGEST_SECRET)
//   POST /ingest/email   — inbound-email webhook (saved-search alerts)(EMAIL_INGEST_SECRET)
//   POST /devices        — register an FCM device token
//   GET  /admin/health   — source health + diagnostics dashboard data
//   GET  /listings/:id   — listing detail (for deep links)
//   GET  /healthz        — liveness
//
// A real deployment runs this on Cloud Run / a small VM; the phone never polls sources.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createApp, type App } from './app.ts';
import { ingest } from './ingest/pipeline.ts';
import { fromShare, ogFetch, type SharePayload } from './sources/manual/adapter.ts';
import { parseEmail, type InboundEmail } from './sources/email/adapter.ts';
import { fromScrapeBatch, type ScrapeBatch } from './sources/scrape/adapter.ts';
import { SOURCE_REGISTRY } from './sources/registry.ts';

const app = createApp();
const PORT = Number(process.env.PORT ?? 8080);

const server = createServer(async (req, res) => {
  try {
    await route(req, res, app);
  } catch (err) {
    json(res, 500, { error: (err as Error).message });
  }
});

async function route(req: IncomingMessage, res: ServerResponse, app: App): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS: the userscript POSTs to /ingest/scrape cross-origin from marketplace pages.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && path === '/healthz') return json(res, 200, { ok: true });

  if (req.method === 'GET' && path === '/admin/health') {
    return json(res, 200, { sources: SOURCE_REGISTRY, generatedAt: new Date().toISOString() });
  }

  if (req.method === 'GET' && path.startsWith('/listings/')) {
    const id = path.slice('/listings/'.length);
    const listing = await app.repo.get(id);
    return listing ? json(res, 200, listing) : json(res, 404, { error: 'not found' });
  }

  if (req.method === 'POST' && path === '/ingest/share') {
    if (!authorized(req, process.env.SHARE_INGEST_SECRET)) return json(res, 401, { error: 'unauthorized' });
    const payload = (await body(req)) as SharePayload;
    const raw = await fromShare(payload, ogFetch);
    const report = await ingest([raw], app);
    return json(res, 200, summarize(report));
  }

  if (req.method === 'POST' && path === '/ingest/scrape') {
    // In-browser userscript capture (Facebook / OfferUp / Craigslist). CORS-enabled so the
    // userscript can POST cross-origin from the marketplace page.
    if (!authorized(req, process.env.SCRAPE_INGEST_SECRET)) return json(res, 401, { error: 'unauthorized' });
    const batch = (await body(req)) as ScrapeBatch;
    const raws = fromScrapeBatch(batch);
    const report = await ingest(raws, app);
    return json(res, 200, summarize(report));
  }

  if (req.method === 'POST' && path === '/ingest/email') {
    if (!authorized(req, process.env.EMAIL_INGEST_SECRET)) return json(res, 401, { error: 'unauthorized' });
    const email = (await body(req)) as InboundEmail;
    const raws = parseEmail(email);
    const report = await ingest(raws, app);
    return json(res, 200, summarize(report));
  }

  if (req.method === 'POST' && path === '/devices') {
    const { userId, token } = (await body(req)) as { userId?: string; token?: string };
    if (!token) return json(res, 400, { error: 'token required' });
    // In-memory app doesn't persist devices; a pg-backed app would upsert into `devices`.
    return json(res, 200, { ok: true, userId: userId ?? 'default', token: mask(token) });
  }

  json(res, 404, { error: 'not found' });
}

function summarize(report: Awaited<ReturnType<typeof ingest>>) {
  return {
    seen: report.seen,
    created: report.created,
    duplicates: report.duplicates,
    priceDrops: report.priceDrops,
    alerts: report.alerts.map((a) => ({
      title: a.alert.listing.title,
      score: a.alert.score.overall,
      label: a.alert.score.label,
      delivered: a.delivered,
      suppressed: a.suppressedReason,
    })),
  };
}

function authorized(req: IncomingMessage, secret?: string): boolean {
  if (!secret) return true; // no secret configured (dev)
  const header = req.headers['authorization'];
  return header === `Bearer ${secret}`;
}

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  const s = JSON.stringify(payload);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function mask(token: string): string {
  return token.length <= 8 ? '****' : `${token.slice(0, 4)}…${token.slice(-4)}`;
}

// Only listen when run directly (not when imported by tests).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  server.listen(PORT, () => console.log(`ScoreAlert backend listening on :${PORT}`));
}

export { server, route };
