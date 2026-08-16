// Alert engine: turns matched+scored listings into Alerts, applies velocity mode +
// idempotency, and dispatches to registered device tokens via an FcmSender.

import type { Alert, MatchResult, ScoreBreakdown, StoredListing } from '../types.ts';
import type { ListingRepo } from '../db/repo.ts';
import { buildMessage, type FcmSender } from './fcm.ts';

export interface DeviceProvider {
  tokensFor(userId: string): Promise<string[]>;
}

export class StaticDeviceProvider implements DeviceProvider {
  private map: Record<string, string[]>;
  constructor(map: Record<string, string[]>) { this.map = map; }
  async tokensFor(userId: string): Promise<string[]> { return this.map[userId] ?? []; }
}

export interface AlertOutcome {
  alert: Alert;
  delivered: boolean;
  suppressedReason?: string;
}

export class AlertEngine {
  private repo: ListingRepo;
  private fcm: FcmSender;
  private devices: DeviceProvider;
  constructor(repo: ListingRepo, fcm: FcmSender, devices: DeviceProvider) {
    this.repo = repo;
    this.fcm = fcm;
    this.devices = devices;
  }

  /**
   * Decide + deliver alerts for a stored, scored listing given the rules it matched.
   * `priceDrop` is passed through from the upsert step when the price fell.
   */
  async process(
    listing: StoredListing,
    score: ScoreBreakdown,
    matches: MatchResult[],
    priceDrop?: { from: number; to: number },
  ): Promise<AlertOutcome[]> {
    const outcomes: AlertOutcome[] = [];
    if (matches.length === 0) return outcomes;

    // One alert per user per listing per kind. Pick the strongest matching rule.
    const best = matches.reduce((a, b) => (b.rule.minimumScore >= a.rule.minimumScore ? b : a));
    const rule = best.rule;
    const kind: Alert['kind'] = priceDrop ? 'price_drop' : 'new';

    const highPriority = rule.highPriorityAt != null && score.overall >= rule.highPriorityAt;
    const alert: Alert = { userId: rule.userId, listing, score, rule, kind, priceDrop, highPriority };

    // Idempotency
    if (await this.repo.hasAlert(rule.userId, listing.id, kind)) {
      return [{ alert, delivered: false, suppressedReason: 'already alerted' }];
    }

    // Velocity: QUIET stores but never interrupts; SMART only interrupts for high scores.
    if (rule.alertVelocity === 'quiet') {
      await this.repo.recordAlert(rule.userId, listing.id, kind, score.overall);
      return [{ alert, delivered: false, suppressedReason: 'quiet mode (stored, not pushed)' }];
    }
    if (rule.alertVelocity === 'smart' && !highPriority && score.label !== 'SCORE_NOW') {
      await this.repo.recordAlert(rule.userId, listing.id, kind, score.overall);
      return [{ alert, delivered: false, suppressedReason: 'smart mode digest (stored, not pushed now)' }];
    }

    const tokens = await this.devices.tokensFor(rule.userId);
    let deliveredAny = false;
    for (const token of tokens) {
      const msg = buildMessage(alert, token);
      const res = await this.fcm.send(msg);
      deliveredAny = deliveredAny || res.ok;
    }
    await this.repo.recordAlert(rule.userId, listing.id, kind, score.overall);
    outcomes.push({ alert, delivered: deliveredAny, suppressedReason: tokens.length ? undefined : 'no registered devices' });
    return outcomes;
  }
}
