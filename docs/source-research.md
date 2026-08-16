# ScoreAlert — Source Research & Policy Register

_Last researched: 2026-08. Re-verify each source's current Terms before changing its
collector status. Policies change; this document is the source of truth the code seeds
into the `sources` table._

This project follows one hard rule: **we do not scrape sources that prohibit automated
access, and we never bypass technical controls.** Each source below is assigned a
`SourcePolicy.status`. Only sources marked `OFFICIAL_API` or `APPROVED_FEED` are polled
automatically by the cloud. Everything else is ingested through legitimate, user-initiated
paths (email alerts the user asked for, or the Android Share Sheet).

## Policy status vocabulary

| Status | Meaning | Automated cloud collection? |
| --- | --- | --- |
| `OFFICIAL_API` | Documented public API with terms that permit our use. | **Yes** |
| `APPROVED_FEED` | Official RSS/Atom/partner feed permitted for our use. | Yes, within stated limits |
| `EMAIL_ALERT` | User configures a saved-search alert; the source emails the user; we parse the user's own inbox. | Indirect (event-driven on the user's mail) |
| `USER_PROVIDED` | User shares a listing URL/text/image into ScoreAlert (Share Sheet). | No — user-initiated |
| `MANUAL_IMPORT` | User pastes/uploads listing data by hand. | No |
| `RESEARCH_REQUIRED` | Access path unclear; needs re-verification before any code path is enabled. | No (disabled) |
| `NOT_ALLOWED` | Automated retrieval violates the source's Terms. | **Never** |

## Health states a collector can report

`healthy` · `degraded` · `disabled` · `authorization_required` · `policy_blocked`

A collector never silently stops. `policy_blocked` and `disabled` are first-class states
surfaced on the admin/diagnostics screen so it is always obvious what is actually running.

---

## 1. eBay — ✅ `OFFICIAL_API` (the automated backbone of the MVP)

- **API:** [eBay Browse API](https://developer.ebay.com/api-docs/buy/browse/overview.html)
  (`buy/browse/v1`), `item_summary/search`.
- **Auth:** OAuth 2.0 **client-credentials** grant (application token) — no user login
  required for public search. Register an app in the eBay Developers Program.
- **Relevant capabilities for us:**
  - Keyword + category search (`q`, `category_ids`).
  - **Local pickup** filtering: pass buyer context headers
    (`X-EBAY-C-ENDUSERCTX: contextualLocation=...`) and
    `filter=pickupCountry:US,pickupPostalCode:96766,pickupRadius:...` to get items
    available for local pickup near Kauaʻi, with distance returned.
  - Price filtering (`filter=price:[500..3500],priceCurrency:USD`).
  - `filter=deliveryCountry:US` and postal-code buyer context for shipping estimates.
- **Free items:** eBay rarely has true "$0 free" listings, but very-low-price + local
  pickup is supported (`price:[0..1]`). Free-item value comes mainly from Craigslist/FB
  groups (via email/share), not eBay.
- **Rate limits:** Browse API default ~5,000 calls/day on the application token
  (varies by grant). Far more than a one-user, few-searches-per-hour need.
- **Storage/display:** eBay permits displaying returned item data in an app that drives
  buyers to eBay. We store metadata + deep link and thumbnail URL. We do **not** mirror
  full-resolution images.
- **Implementation:** [`backend/src/sources/ebay/adapter.ts`](../backend/src/sources/ebay/adapter.ts) — implemented.
- **Decision:** **Poll automatically.** This is the only source with unattended cloud
  collection in the MVP.

## 2. Craigslist (Kauaʻi) — ⛔ `NOT_ALLOWED` for automated collection

- **Terms:** Craigslist's [Terms of Use](https://www.craigslist.org/about/terms.of.use/en)
  expressly prohibit accessing the site via "robots, spiders, scripts, scrapers, crawlers"
  and set liquidated damages for harvesting.
- **Enforcement is real and aggressive:** Craigslist has won/settled large judgments
  against scrapers — e.g. **$60.5M vs. RadPad**, **$31M vs. Instamotor**, and the 3Taps
  injunction. This is not a theoretical risk.
- **RSS feeds:** Craigslist exposes per-search RSS on some result pages, nominally for
  personal feed-reader use. Given the breadth of the anti-automation terms and enforcement
  history, **we do not run an automated RSS collector.** The adapter exists only in
  informational/disabled form.
- **Legitimate paths we DO support:**
  - **User-forwarded / shared listing URLs** → `USER_PROVIDED` via the Share Sheet. A user
    browsing Craigslist can Share → ScoreAlert; we parse the single URL they chose to give
    us. See [`manual` adapter](../backend/src/sources/manual/adapter.ts).
  - **Craigslist email:** Craigslist itself does not send saved-search email alerts, so
    there is no first-party email path.
- **Implementation:** [`backend/src/sources/craigslist/adapter.ts`](../backend/src/sources/craigslist/adapter.ts)
  — informational adapter, collector permanently `disabled` / `policy_blocked`.
- **Decision:** **No automated collection.** Manual share only.

## 3. Facebook Marketplace + Kauaʻi FB groups — ⛔ `NOT_ALLOWED` (no public API)

- **API reality:** Meta has **no public Marketplace listings/search API.** Marketplace is a
  consumer-to-consumer product; listing data is not exposed to developers. There is a
  limited **Marketplace Partner Seller API** and a Content Library, neither of which grants
  a personal app general Marketplace search. The Graph API does **not** provide Marketplace
  search.
- **Scraping:** Prohibited by Meta's Terms and actively blocked. We do not do it, and we
  never touch **private** Facebook groups.
- **Legitimate paths we DO support:**
  - **Android Share Sheet** (`USER_PROVIDED`): the strongest FB path. User taps Share on a
    Marketplace listing → ScoreAlert receives the URL/text/thumbnail and creates a record.
  - **User-owned email:** if the user has configured any Facebook notification emails that
    contain listing links they are entitled to, the email adapter can parse the user's own
    inbox. (Facebook does not offer marketplace saved-search email alerts today, so treat
    this as best-effort.)
- **Kauaʻi groups** (informational only — surfaced in-app so the user knows where to browse
  and share from): "Kauai Marketplace", "Kauai Buy/Sell/Trade", "Kauai Cars & Trucks",
  "Kauai Free Stuff / Curb Alerts". We never automate access to these; we only make it
  one tap to Share a listing the user is already viewing.
- **Implementation:** [`backend/src/sources/facebook/adapter.ts`](../backend/src/sources/facebook/adapter.ts)
  — informational adapter, `disabled`. Ingestion happens via `manual`/`email`.
- **Decision:** **Share Sheet + user email only.**

## 4. OfferUp — ⚠️ `USER_PROVIDED` / `RESEARCH_REQUIRED` (no official public API)

- **API reality:** OfferUp provides **no official public listings/search API.** Only
  unofficial, reverse-engineered clients exist.
- **Policy:** We will **not** ship a reverse-engineered API as a working integration. An
  `offerup` unofficial adapter stub exists but is **disabled by default and unsupported**,
  and is never enabled automatically.
- **Legitimate paths we DO support:**
  - **Android Share Sheet** (`USER_PROVIDED`).
  - **OfferUp native alerts / saved searches** the user sets up; if any generate emails the
    user receives, the email adapter can parse the user's own inbox.
- **Implementation:** [`backend/src/sources/offerup/adapter.ts`](../backend/src/sources/offerup/adapter.ts)
  — informational adapter, `disabled`.
- **Decision:** **Share Sheet + native-alert/email path only.**

## 5. Email alert ingestion — ✅ `EMAIL_ALERT` (a strong legitimate backbone)

- **How it works:** The user creates saved-search **email alerts** on any site that offers
  them (many auction, dealership, and classifieds sites do) and points them at a dedicated
  ScoreAlert inbox, or forwards them. An inbound-email webhook (SendGrid/Mailgun/CloudMailin
  parse) POSTs the message to our backend, which extracts listing links + metadata,
  normalizes, dedupes, scores, and pushes.
- **Why it's legitimate:** we parse **the user's own email** that a service chose to send
  them. No site is being crawled.
- **Implementation:** [`backend/src/sources/email/adapter.ts`](../backend/src/sources/email/adapter.ts)
  + `POST /ingest/email` in [`server.ts`](../backend/src/server.ts). Provider-agnostic parser
  with per-sender extractors.
- **Decision:** **Enabled**, event-driven.

## 6. Android Share Sheet ingestion — ✅ `USER_PROVIDED` (the universal fallback)

- Registers ScoreAlert as a share target for `text/plain` and `image/*`. From **any** app
  (FB Marketplace, OfferUp, Craigslist, Chrome), Share → ScoreAlert sends URL + text +
  optional image to `POST /ingest/share`. The backend fetches only what the user handed it
  (and, for a shared URL, only that one page's OpenGraph metadata), normalizes, dedupes,
  scores, and pushes.
- **Decision:** **Enabled.** This is what makes ScoreAlert useful even where automated
  access is prohibited.

## 7. Vehicle value data (future) — `RESEARCH_REQUIRED`

For the Phase-2 "estimated deal spread," candidate **licensed** data sources: KBB/Kelley
Blue Book API, J.D. Power (NADA) valuation API, eBay **sold** comps (via Marketplace
Insights API — access-restricted). All are gated behind licensing/approval and are **not**
used in the MVP. Until a licensed source is wired in, ScoreAlert shows spreads only from its
own observed Kauaʻi listing history, clearly labeled as an estimate with uncertainty.

---

## Summary decision table (seeded into `sources`)

| Source | Status | Auto-collect | Path |
| --- | --- | --- | --- |
| eBay | `OFFICIAL_API` | ✅ yes | Browse API (OAuth client creds) |
| Email alerts | `EMAIL_ALERT` | ✅ event-driven | inbound-email webhook |
| Manual share | `USER_PROVIDED` | ➖ user-initiated | Android Share Sheet |
| Craigslist Kauaʻi | `NOT_ALLOWED` | ⛔ never | share / forwarded URL only |
| Facebook Marketplace | `NOT_ALLOWED` | ⛔ never | share / user email only |
| Facebook groups | `NOT_ALLOWED` | ⛔ never | share only |
| OfferUp | `USER_PROVIDED` | ⛔ no auto | share / native-alert email |
| Vehicle values | `RESEARCH_REQUIRED` | ⛔ no | licensed API TBD |

**Bottom line:** In the MVP, ScoreAlert automatically monitors **eBay** and the **user's
email alerts**, and accepts **shared** listings from everywhere else. That is the honest,
legitimate footprint — and the admin screen says exactly this.
