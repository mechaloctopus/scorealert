# ScoreAlert — Architecture

Cloud-first, event-driven. The **cloud does the work**; the phone never polls sources. The
backend keeps running while the Android app is closed and pushes alerts via FCM.

## Pipeline

```
SOURCE ADAPTERS ─┐
                 ├─▶ INGESTION ─▶ NORMALIZE ─▶ DEDUPE ─▶ CLASSIFY ─▶ SCORE ─▶ DB
 eBay (poll)  ───┘      │                                  │                    │
 Email webhook ─────────┤                          (automotive parser)          ▼
 Share Sheet  ──────────┘                                              WATCH-RULE MATCH
                                                                                 │
                                                                                 ▼
                                                                          ALERT ENGINE
                                                                                 │
                                                                                 ▼
                                                                               FCM
                                                                                 │
                                                                                 ▼
                                                                     ANDROID SCOREALERT APP
```

Each stage is an independent module in `backend/src`:

| Stage | Module | Notes |
| --- | --- | --- |
| Source adapters | `sources/*` | Common `ListingSourceAdapter` contract. Only eBay + email auto-collect. |
| Ingestion orchestration | `ingest/pipeline.ts` | Single entry point every source funnels through. |
| Normalize + classify | `pipeline/normalize.ts`, `classify.ts`, `automotive-parser.ts`, `synonyms.ts` | Deterministic first; LLM only when `needsLlm()`. |
| Dedupe | `pipeline/dedupe.ts` | phone + make/model/year + price + text similarity; clusters cross-source dupes. |
| Score | `pipeline/score.ts` | 0–100, configurable weights, explainable. |
| Watch rules | `watch/rules.ts` | category/price/keyword/score gates; velocity modes. |
| Alerts | `alerts/engine.ts`, `alerts/fcm.ts` | idempotent; builds FCM HTTP v1 payloads. |
| Storage | `db/repo.ts` (+ Postgres) | NEW detection via `first_seen_at`; price-drop detection. |

## Why this shape

- **Latency is the product.** eBay + email are event/near-real-time; the Share Sheet is
  instant. New-listing detection (`first_seen_at`) guarantees we alert once, fast.
- **Legitimacy is enforced structurally.** Restricted sources have adapters that *cannot*
  self-collect (`fetchNewListings()` returns `[]`); ingestion for them only exists via
  user-initiated share/email. See `docs/source-research.md`.
- **Cheap by design.** Zero-dependency engine; deterministic parsing avoids per-listing LLM
  spend; small polling footprint (one user). Target $0–$25/mo.

## Deployment (recommended, low-cost)

- **DB + Auth:** Supabase (Postgres + RLS + anon/JWT for the app).
- **Backend HTTP + jobs:** a single small container on **Cloud Run** (or Fly/Render), or
  Supabase Edge Functions. Endpoints in `backend/src/server.ts`.
- **Scheduler:** Cloud Scheduler (or cron) hits the eBay poll job at a modest interval
  (`backend/src/jobs/poll-ebay.ts`).
- **Email:** an inbound-parse provider (SendGrid Inbound Parse / Mailgun Routes /
  CloudMailin) POSTs to `/ingest/email`.
- **Push:** Firebase Cloud Messaging (HTTP v1, service account on the backend only).

```
Cloud Scheduler ──▶ poll-ebay job ─┐
Inbound email  ──▶ /ingest/email  ─┼─▶ pipeline ─▶ Supabase ─▶ FCM ─▶ Pixel
Android share  ──▶ /ingest/share  ─┘
```

## Multi-user readiness

One user today, but `users`, user-scoped `watch_rules`/`alerts`/`devices`, and RLS are in
place. Adding a trusted user = one `users` row + their rules + their device token.

## Data flow guarantees

- **NEW only:** a listing alerts once on first observation (`first_seen_at`). Re-ingestion
  is a no-op unless the price drops significantly (≥ $250 or ≥ 15%, configurable) → a second
  `price_drop` alert.
- **Dedup:** the same item across FB/CL/OfferUp collapses into one `listing_cluster`; the
  card shows "also listed on N sources."
- **Never silent:** every collector reports `healthy|degraded|disabled|authorization_required|policy_blocked`
  to `/admin/health` and the app's Source Health screen.

## Future phases (architecture already accommodates)

- **Phase 2:** value estimation (licensed comps), perceptual-hash image dedupe, LLM
  summaries, maps.
- **Phase 3:** flip/repair/resale scores, historical Kauaʻi pricing (the `price_history`
  table already accrues the data), tools/equipment + lumber/farm categories.
