# ScoreAlert — Setup

## 0. Prerequisites

- Node.js **22.6+** (the backend uses native TypeScript execution — no build step).
- (Optional) Supabase project, Firebase project, eBay developer app, inbound-email provider.
- For the app: Android SDK + JDK 17.

## 1. Backend engine — run it right now (no accounts needed)

```bash
cd backend
npm test        # 29 tests: parser, scoring, dedupe, watch rules, ingestion, e2e
npm run demo    # runs the pipeline over Kauaʻi fixtures and prints the alerts produced
```

The demo needs no credentials — it exercises normalize → dedupe → classify → score →
watch-rule match → alert with an in-memory store and a fake FCM sender.

## 2. Database (Supabase / Postgres)

```bash
# with psql against your database:
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
psql "$DATABASE_URL" -f db/migrations/0002_seed.sql
psql "$DATABASE_URL" -f db/migrations/0003_rls.sql   # Supabase only
```

Seeds create the source register, the default user, the four default watch rules (Free,
Vehicles $500–$3,500, Motorcycles, Boats), and the synonym dictionary.

## 3. Environment

Copy `.env.example` → `backend/.env` and fill in what you have. Everything is optional for
the demo; each integration activates when its keys are present. **Secrets are server-side
only — never place any of these in the Android app.**

## 4. eBay (the one automated source)

1. Create an app at <https://developer.ebay.com> and get a **Client ID / Client Secret**.
2. Set `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_PICKUP_POSTAL_CODE=96766`.
3. Poll all server-side collectors (eBay + Craigslist RSS):
   ```bash
   cd backend && npm run poll
   ```
4. Schedule it (Cloud Scheduler / cron) at a modest interval. eBay queries live in
   `src/sources/ebay/adapter.ts::defaultQueries()`; Craigslist categories in `.env`
   (`CRAIGSLIST_CATEGORIES`). Craigslist needs no credentials.

## 4b. Facebook Marketplace + OfferUp (userscript)

These have no public API. Capture them with the userscript that runs in your own browser —
full instructions in [`personal-collectors.md`](personal-collectors.md):

1. Install Tampermonkey/Violentmonkey and add `tools/scorealert-capture.user.js`.
2. Set the backend URL + secret (`SCRAPE_INGEST_SECRET`) from the extension menu.
3. Browse Marketplace/OfferUp — captured listings POST to `/ingest/scrape`, get scored, and
   push like any other source.

## 5. Firebase Cloud Messaging (push)

1. Firebase project → add Android app `com.scorealert.app` → download `google-services.json`
   into `android/app/` (git-ignored).
2. Create a **service account** with the *Firebase Cloud Messaging API*; download its JSON.
3. On the backend set `FCM_PROJECT_ID` and `GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json`.
4. Enable the `com.google.gms.google-services` plugin in the two `build.gradle.kts` files.

## 6. Email alert ingestion

1. Stand up an inbound-parse address (SendGrid Inbound Parse / Mailgun Routes / CloudMailin).
2. Point its webhook at `POST https://<backend>/ingest/email` with header
   `Authorization: Bearer $EMAIL_INGEST_SECRET`.
3. On any site that offers saved-search **email alerts**, subscribe and send them to that
   address. Incoming alerts are parsed, deduped, scored, and pushed.

## 7. Run the backend

```bash
cd backend && npm run serve     # listens on :$PORT (default 8080)
# endpoints: POST /ingest/share, POST /ingest/email, POST /devices,
#            GET /admin/health, GET /listings/:id, GET /healthz
```

For production, containerize and deploy to Cloud Run (see `docs/architecture.md`).

## 8. Android app

```bash
cd android
gradle wrapper            # first time: generate gradlew + wrapper jar
./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug
```

Set `scorealert.apiBaseUrl` (in `gradle.properties` or `local.properties`) to your backend.
The **Share Sheet** target and `scorealert://listing/{id}` **deep link** work as soon as the
app is installed; **push** works once FCM is configured (step 5).

## 9. Verify the whole loop

1. `npm run serve` (backend) with FCM configured and a device token registered.
2. On the phone, open a Facebook Marketplace / Craigslist listing → **Share → ScoreAlert**.
3. Backend ingests, scores, and (if it matches a watch rule) pushes a notification.
4. Tap the notification → the ScoreAlert **detail screen** opens → **View original**.

## Troubleshooting

- **`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`** — use Node ≥ 22.6 (native TS strip mode).
- **eBay `authorization_required`** — client id/secret missing or invalid.
- **No push** — confirm `google-services.json`, the FCM service account, a registered
  device token (`POST /devices`), and Android 13+ notification permission granted.
- **Source shows `policy_blocked`** — that's intentional (Craigslist/Facebook). Use Share.
