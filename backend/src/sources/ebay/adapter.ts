// eBay adapter — the one automated cloud source in the MVP.
// Uses the official Browse API (buy/browse/v1 item_summary/search) with an OAuth
// client-credentials application token. Supports local-pickup + price filtering so we
// can target Kauaʻi/Hawaiʻi and the $500–$3,500 vehicle window (and free/very-low tools).
//
// Docs: https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search

import type { RawListing } from '../../types.ts';
import type { ListingSourceAdapter, SourceInfo } from '../adapter.ts';

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  env: 'PRODUCTION' | 'SANDBOX';
  pickupPostalCode: string; // e.g. 96766 Līhuʻe
  marketplaceId: string; // EBAY_US
  /** the saved queries we poll; each maps to a category focus */
  queries: EbayQuery[];
  fetchImpl?: typeof fetch; // injectable for tests
}

export interface EbayQuery {
  q: string;
  categoryIds?: string;
  minPrice?: number;
  maxPrice?: number;
  localPickup?: boolean;
  radiusMiles?: number;
  limit?: number;
}

const HOSTS = {
  PRODUCTION: { api: 'https://api.ebay.com', auth: 'https://api.ebay.com/identity/v1/oauth2/token' },
  SANDBOX: { api: 'https://api.sandbox.ebay.com', auth: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token' },
};

export const EBAY_INFO: SourceInfo = {
  id: 'ebay',
  name: 'eBay (Browse API)',
  policy: 'OFFICIAL_API',
  autoCollect: true,
  health: 'disabled',
  howItWorks: 'Polled automatically via the official eBay Browse API (OAuth). Targets local pickup near Kauaʻi and the configured price windows.',
};

export function defaultQueries(): EbayQuery[] {
  return [
    { q: 'truck', localPickup: true, radiusMiles: 75, minPrice: 500, maxPrice: 3500, limit: 50 },
    { q: 'car', localPickup: true, radiusMiles: 75, minPrice: 500, maxPrice: 3500, limit: 50 },
    { q: 'motorcycle', localPickup: true, radiusMiles: 75, minPrice: 500, maxPrice: 3500, limit: 25 },
    { q: 'boat', localPickup: true, radiusMiles: 75, minPrice: 500, maxPrice: 3500, limit: 25 },
    // tools/equipment (future category) — shippable, so no local-pickup restriction
    { q: 'stihl OR dewalt OR generator', minPrice: 1, maxPrice: 500, limit: 25 },
  ];
}

export class EbayAdapter implements ListingSourceAdapter {
  public info: SourceInfo = { ...EBAY_INFO };
  private token?: { value: string; exp: number };
  private fetchImpl: typeof fetch;
  private cfg: EbayConfig;

  constructor(cfg: EbayConfig) {
    this.cfg = cfg;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async fetchNewListings(): Promise<RawListing[]> {
    if (!this.cfg.clientId || !this.cfg.clientSecret) {
      this.info.health = 'authorization_required';
      return [];
    }
    try {
      const token = await this.appToken();
      const all: RawListing[] = [];
      for (const query of this.cfg.queries) {
        const items = await this.search(token, query);
        all.push(...items);
      }
      this.info.health = 'healthy';
      return all;
    } catch (err) {
      this.info.health = 'degraded';
      throw err;
    }
  }

  private async search(token: string, query: EbayQuery): Promise<RawListing[]> {
    const host = HOSTS[this.cfg.env].api;
    const params = new URLSearchParams();
    params.set('q', query.q);
    params.set('limit', String(query.limit ?? 50));
    if (query.categoryIds) params.set('category_ids', query.categoryIds);

    const filters: string[] = [];
    if (query.minPrice != null || query.maxPrice != null) {
      filters.push(`price:[${query.minPrice ?? 0}..${query.maxPrice ?? ''}]`);
      filters.push('priceCurrency:USD');
    }
    if (query.localPickup) {
      filters.push(`pickupCountry:US`);
      filters.push(`pickupPostalCode:${this.cfg.pickupPostalCode}`);
      if (query.radiusMiles) filters.push(`pickupRadius:${query.radiusMiles}`, 'pickupRadiusUnit:mi');
    }
    if (filters.length) params.set('filter', filters.join(','));

    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': this.cfg.marketplaceId,
      'X-EBAY-C-ENDUSERCTX': `contextualLocation=country=US,zip=${this.cfg.pickupPostalCode}`,
    };

    const res = await this.fetchImpl(`${host}/buy/browse/v1/item_summary/search?${params}`, { headers });
    if (!res.ok) throw new Error(`eBay search ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as EbaySearchResponse;
    return (json.itemSummaries ?? []).map((it) => this.toRaw(it, query.q));
  }

  private toRaw(it: EbayItemSummary, query: string): RawListing {
    const price = it.price ? Number(it.price.value) : null;
    const images = [it.image?.imageUrl, ...(it.additionalImages ?? []).map((a) => a.imageUrl)]
      .filter((u): u is string => !!u);
    const loc = [it.itemLocation?.city, it.itemLocation?.stateOrProvince].filter(Boolean).join(', ');
    return {
      sourceId: 'ebay',
      externalId: it.itemId,
      url: it.itemWebUrl ?? it.itemHref ?? '',
      title: it.title ?? query,
      description: it.shortDescription ?? '',
      price,
      currency: it.price?.currency ?? 'USD',
      locationText: loc || undefined,
      imageUrls: images,
      postedAt: it.itemCreationDate,
      raw: it,
    };
  }

  private async appToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
    const res = await this.fetchImpl(HOSTS[this.cfg.env].auth, {
      method: 'POST',
      headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'https://api.ebay.com/oauth/api_scope',
      }),
    });
    if (!res.ok) {
      this.info.health = 'authorization_required';
      throw new Error(`eBay token ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, exp: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }
}

// --- eBay response types (subset we use) -----------------------------------
interface EbaySearchResponse { itemSummaries?: EbayItemSummary[]; total?: number; }
interface EbayItemSummary {
  itemId: string;
  title?: string;
  shortDescription?: string;
  price?: { value: string; currency: string };
  image?: { imageUrl: string };
  additionalImages?: { imageUrl: string }[];
  itemWebUrl?: string;
  itemHref?: string;
  itemLocation?: { city?: string; stateOrProvince?: string; postalCode?: string };
  itemCreationDate?: string;
}
