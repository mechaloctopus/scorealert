# Kauaʻi Data Sources — Field Report

_What people on Kauaʻi actually use to buy and sell, ranked for ScoreAlert. Usefulness is
1–10 for **this** use case (fast alerts on cheap vehicles / free stuff). "Access" reflects
the legitimate path only — see [`source-research.md`](source-research.md) for the policy
detail behind each._

## Ranked sources

### 1. Facebook Marketplace & Kauaʻi FB groups — Usefulness 10/10
- **Categories:** everything — cars, trucks, vans, motorcycles, boats, free stuff, tools.
- **Why it matters:** by far the dominant place Kauaʻi residents post vehicles and free
  items. If a $1,000 running Corolla appears anywhere first, it's usually here.
- **API availability:** none (no public Marketplace API).
- **Automated access policy:** prohibited. **Do not scrape.**
- **Auth:** N/A.
- **Alerts:** no first-party saved-search email alerts.
- **Legitimate path:** **Android Share Sheet.** One tap from the listing → ScoreAlert.
- **Notable Kauaʻi groups** (for the user to browse & share from): Kauai Marketplace;
  Kauai Buy, Sell, Trade; Kauai Cars & Trucks; Kauai Free Stuff / Curb Alert; Westside /
  Eastside community groups.
- **Recommendation:** Ship the Share Sheet as the primary FB path. Surface the group list
  in-app as bookmarks. Never automate.

### 2. Craigslist Kauaʻi (`honolulu.craigslist.org` → Kauaʻi area) — Usefulness 8/10
- **Categories:** cars+trucks, free, boats, motorcycles, tools, general for-sale.
- **Why it matters:** still heavily used on Kauaʻi, especially for vehicles and free piles.
- **API availability:** none supported for third parties; RSS exists but anti-automation
  terms + enforcement make an automated collector unsafe.
- **Automated access policy:** prohibited (aggressively enforced). **Do not scrape.**
- **Auth:** N/A.
- **Alerts:** no first-party email alerts.
- **Legitimate path:** user-forwarded / **shared** listing URLs.
- **Recommendation:** Share Sheet + paste-URL only. Informational adapter marked
  `policy_blocked`.

### 3. eBay (local pickup, Hawaiʻi) — Usefulness 7/10
- **Categories:** vehicles (Motors, limited local), motorcycles, boats, **tools/equipment**
  (strong), parts, very-low-price items.
- **Why it matters:** the one source we can legitimately poll unattended. Good for
  tools/equipment and shippable parts; some local-pickup vehicles.
- **API availability:** **official Browse API** (OAuth client credentials).
- **Automated access policy:** permitted within program terms + rate limits.
- **Auth:** app-level OAuth token (no user login for search).
- **Alerts:** we synthesize alerts from polled results.
- **Recommendation:** **Primary automated source.** Poll a small set of saved queries on a
  schedule. Implemented.

### 4. User email alerts (any site that offers them) — Usefulness 7/10
- **Categories:** whatever the user subscribes to (dealership clearance, auctions, boat &
  motorcycle classifieds, government/surplus sites, estate-sale sites).
- **Why it matters:** turns any alert-capable site into a legitimate feed via the user's own
  inbox. Event-driven, low-latency, zero scraping.
- **Access policy:** we parse the user's own mail — legitimate.
- **Recommendation:** Ship the inbound-email webhook + parser. Second automated backbone.

### 5. OfferUp — Usefulness 6/10
- **Categories:** cars, general goods, some tools.
- **Why it matters:** moderate Kauaʻi usage; overlaps heavily with FB (good dedupe target).
- **API:** none official. Unofficial APIs exist but unsupported/disabled.
- **Legitimate path:** Share Sheet + native alerts/email the user sets up.
- **Recommendation:** Share Sheet only. Adapter `disabled`.

### 6. Local newspaper / community classifieds — Usefulness 4/10
- **Examples:** _The Garden Island_ (thegardenisland.com) classifieds; Kauaʻi community
  boards. Lower volume, slower, but occasionally unique vehicle/estate listings.
- **API:** none. Some have RSS or email alerts — **verify each site's terms individually**
  before enabling; default to email-alert or manual.
- **Recommendation:** `RESEARCH_REQUIRED` per-site; email-alert path preferred.

### 7. Local auctions / impound / government surplus — Usefulness 4/10
- **Examples:** County of Kauaʻi surplus/auction notices; towing/impound auctions; GovDeals
  / Public Surplus style platforms (some have APIs or email alerts).
- **Why it matters:** occasional very cheap vehicles/equipment.
- **Recommendation:** email-alert or manual; check each platform's API/terms. Phase 2+.

### 8. Marina / boat & motorcycle classifieds — Usefulness 3/10
- **Examples:** boat-specific classifieds, marina bulletin boards, motorcycle forums.
- **Recommendation:** manual/share; low automated priority. Phase 2+.

### 9. Nextdoor — Usefulness 3/10
- **API:** no general public listings API for third-party ingestion.
- **Recommendation:** manual/share only.

### 10. Reddit (r/Kauai and Hawaiʻi subs) — Usefulness 2/10
- **API:** official Reddit API exists (auth + rate limits + terms). Low for-sale volume on
  Kauaʻi subs; occasional free/giveaway posts.
- **Recommendation:** optional Phase 3 official-API adapter; not in MVP.

## What ScoreAlert automatically monitors in the MVP

Only two things run unattended in the cloud: **eBay (Browse API)** and the **user's email
alerts**. Everything else on Kauaʻi — where the real vehicle/free-stuff volume lives (FB,
Craigslist, OfferUp) — is captured through the **Android Share Sheet**, one tap from the
listing. This is the honest, legal footprint, and the admin screen states it plainly.
