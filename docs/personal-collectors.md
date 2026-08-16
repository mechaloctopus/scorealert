# ScoreAlert — Personal Collectors (Facebook, OfferUp, Craigslist)

This is a private, single-user tool. Here is exactly how the three sources you asked for are
captured, what runs where, and the one thing that is deliberately not built.

## TL;DR

| Source | How it's captured | Runs where | Hands-off? |
| --- | --- | --- | --- |
| **Craigslist** | Its own public **RSS feed** | Cloud/server (`poll` job) | ✅ Fully — phone closed |
| **Facebook Marketplace** | **Userscript** reads cards you browse | Your browser | 🟡 While you have Marketplace open |
| **OfferUp** | **Userscript** reads cards you browse | Your browser | 🟡 While you have OfferUp open |
| eBay | Official Browse API | Cloud/server | ✅ Fully |
| Email alerts | Inbound-email webhook | Cloud/server | ✅ Event-driven |

## Craigslist — server-side RSS (best case: fully automatic)

Craigslist publishes an RSS feed on its own search pages. ScoreAlert polls the feeds for
your Kauaʻi searches with **no login**, at a **gentle rate**, and never tries to get around
throttling — if Craigslist returns 403, the collector reports `degraded` and backs off.

- Code: `backend/src/sources/craigslist/adapter.ts`
- Runs in: `backend/src/jobs/poll.ts` (schedule on cron / Cloud Scheduler)
- Config (`.env`): `CRAIGSLIST_BASE`, `CRAIGSLIST_SUBAREA=kau`, `CRAIGSLIST_CATEGORIES=cta,mca,boo,zip,sss`
- Categories: `cta` cars+trucks · `mca` motorcycles · `boo` boats · `zip` free · `sss` for-sale

This is the ideal path: it runs in the cloud while your phone is in your pocket.

> Note: Craigslist's Terms broadly discourage automated access, and they can throttle even
> RSS. For a single person polling their own local feed slowly this is the pragmatic,
> low-risk path — but it's your call, and the collector is easy to disable (drop it from the
> `poll` job or set `CRAIGSLIST_CATEGORIES=`).

## Facebook Marketplace & OfferUp — userscript in your own browser

There is **no** Facebook/OfferUp public API, and both actively block bots. The version that
actually works for a personal tool — without getting your account banned — is a small
**userscript** that runs inside *your* logged-in browser and forwards the listing cards your
browser already rendered to your ScoreAlert backend.

- Script: [`tools/scorealert-capture.user.js`](../tools/scorealert-capture.user.js)
- Endpoint: `POST /ingest/scrape` (backend), secured with `SCRAPE_INGEST_SECRET`
- Mapper/code: `backend/src/sources/scrape/adapter.ts`

### Install (2 minutes)

1. Install **Tampermonkey** (Chrome/Edge) or **Violentmonkey** (Firefox).
2. Create a new script and paste in `tools/scorealert-capture.user.js`.
3. From the extension menu: **ScoreAlert: set backend URL** and **ScoreAlert: set secret**
   (the secret must equal `SCRAPE_INGEST_SECRET` in your backend `.env`).
4. Browse Facebook Marketplace / OfferUp. A small `📡 ScoreAlert` badge shows the capture
   count; matching listings are scored and pushed to your phone like any other source.

### Make it *near*-automatic

- Save your Kauaʻi Marketplace searches (cheap cars, free stuff, etc.) as browser
  bookmarks/tabs.
- Open them once a day (or leave a tab open). The userscript captures everything the page
  loads. There's an optional **gentle auto-scroll** toggle in the menu to pull more of a
  search feed — keep it gentle.

### Why not a hands-off Facebook server bot?

A server that logs into your Facebook account and scrapes Marketplace headlessly requires
defeating Facebook's bot-detection (fingerprint/behavior spoofing, etc.) and reliably gets
the **account banned**. That's the one thing intentionally not built here — it's both against
Facebook's terms and actively harmful to you. The userscript gets you the same listings on
your phone using your normal browsing, which is the right trade for a personal tool.

### When Facebook changes its HTML

Facebook renames its CSS classes frequently. The extractors in the userscript are
deliberately heuristic (they key off `a[href*="/marketplace/item/"]` and parse visible
text), but if capture ever stops, update the selectors in `SITE_EXTRACTORS.facebook` /
`.offerup` in the userscript — it's commented for exactly this.

## What the admin/Source Health screen shows

- **eBay** — API, auto
- **Email** — webhook, auto
- **Craigslist** — RSS feed, auto (healthy/degraded)
- **Facebook / OfferUp** — in-session capture (userscript), healthy when configured
- **Manual/Share** — always available
