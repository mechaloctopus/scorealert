# ScoreAlert

**Find it first.** A personal Kauaʻi deal-intelligence system that ingests listings
from *legally and technically permitted* sources, detects **new** listings, classifies
and scores them, removes duplicates, and pushes an instant alert to an Android phone.

> The entire system exists to reduce the time between **LISTING POSTED** and **ME SEEING IT.**

## What this repo contains

| Area | Path | Status |
| --- | --- | --- |
| Source & policy research | [`docs/source-research.md`](docs/source-research.md), [`docs/kauai-data-sources.md`](docs/kauai-data-sources.md) | ✅ Complete |
| Architecture | [`docs/architecture.md`](docs/architecture.md) | ✅ Complete |
| Database schema + seeds | [`db/migrations/`](db/migrations/) | ✅ Complete (Postgres/Supabase) |
| Deal-intelligence engine | [`backend/src/`](backend/src/) | ✅ Implemented + tested (`node --test`) |
| eBay Browse API adapter | [`backend/src/sources/ebay/`](backend/src/sources/ebay/) | ✅ Implemented (real official API) |
| Craigslist / Facebook / OfferUp adapters | [`backend/src/sources/`](backend/src/sources/) | ✅ Informational (automated collection **disabled** — see policy) |
| Email + manual-share ingestion | [`backend/src/sources/email`](backend/src/sources/), [`manual`](backend/src/sources/) | ✅ Implemented |
| HTTP backend (share/email ingest, admin health, FCM) | [`backend/src/server.ts`](backend/src/server.ts) | ✅ Implemented |
| Android app (Kotlin + Jetpack Compose) | [`android/`](android/) | ⚙️ Source scaffold — **not compiled here** (no Android SDK in this environment) |

## The core rule this project follows

**We do not scrape sources that prohibit it.** Every source has a `SourcePolicy` record.
The only source with fully-automated cloud collection in the MVP is **eBay** (official
Browse API). Facebook Marketplace, Craigslist, and OfferUp are ingested only through
**legitimate** paths: user-owned email alerts and the Android Share Sheet. The app
displays each source's real status so it's always clear what ScoreAlert is actually
monitoring automatically. See [`docs/source-research.md`](docs/source-research.md).

## Quick start (backend engine)

The engine runs on Node 22+ with **zero dependencies** and native TypeScript:

```bash
cd backend
npm test          # runs the full pipeline test suite (parser, score, dedupe, rules, e2e)
npm run demo      # runs the pipeline over Kauaʻi fixtures and prints the alerts produced
```

See [`docs/setup.md`](docs/setup.md) for the full stack (Supabase, Firebase/FCM, eBay
credentials, deploying the cloud worker, and building the Android APK).

## Honest status

This is an MVP foundation, built to be *real and legitimate*, not a fake demo:

- The **deal engine** (normalize → dedupe → classify → automotive-parse → score → match
  watch rules → build alert) is fully implemented and unit-tested against realistic
  Kauaʻi fixtures.
- The **eBay adapter** targets the real Browse API; give it credentials and it works.
- Restricted sources are **honestly disabled**, with the legitimate alert path documented
  in-app.
- The **Android app** is provided as complete Kotlin/Compose source. It could not be
  compiled in this build environment (no Android SDK), so no APK is attached; build
  instructions are in [`docs/setup.md`](docs/setup.md).
