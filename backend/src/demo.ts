// End-to-end demo: runs the full pipeline over the Kauaʻi fixtures and prints the alerts
// ScoreAlert would push. Demonstrates NEW detection, cross-source dedupe, scoring, watch
// rules, velocity, and the FCM payloads — all without any network or credentials.
//
//   npm run demo

import { createApp } from './app.ts';
import { MemoryFcmSender } from './alerts/fcm.ts';
import { ingest } from './ingest/pipeline.ts';
import { loadFixtures } from './fixtures.ts';
import { SOURCE_REGISTRY } from './sources/registry.ts';

const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m';
const RED = '\x1b[31m', GREEN = '\x1b[32m', YEL = '\x1b[33m', CYAN = '\x1b[36m';

async function main() {
  const now = new Date();
  const fcm = new MemoryFcmSender();
  const app = createApp({ fcm });

  console.log(`${BOLD}${CYAN}ScoreAlert — pipeline demo${RESET}\n`);

  console.log(`${BOLD}Source register (what we actually monitor):${RESET}`);
  for (const s of SOURCE_REGISTRY) {
    const dot = s.autoCollect ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
    console.log(`  ${dot} ${s.name.padEnd(28)} ${DIM}${s.policy.padEnd(14)}${RESET} ${s.autoCollect ? GREEN + 'auto' : DIM + 'manual/email'}${RESET}`);
  }
  console.log();

  const raws = await loadFixtures(now);
  const report = await ingest(raws, { ...app, now: () => now });

  console.log(`${BOLD}Ingest summary:${RESET} seen=${report.seen} created=${GREEN}${report.created}${RESET} duplicates=${YEL}${report.duplicates}${RESET} priceDrops=${report.priceDrops}\n`);

  console.log(`${BOLD}Alerts produced:${RESET}`);
  for (const a of report.alerts) {
    const s = a.alert.score;
    const color = s.label === 'SCORE_NOW' ? RED : s.label === 'GREAT_FIND' ? YEL : GREEN;
    const status = a.delivered ? `${GREEN}✔ pushed${RESET}` : `${DIM}✕ ${a.suppressedReason}${RESET}`;
    console.log(`\n  ${color}${BOLD}${s.overall} ${labelText(s.label)}${RESET}  ${a.alert.listing.title}`);
    console.log(`    ${DIM}${a.alert.listing.sourceId} · $${a.alert.listing.price ?? 'FREE'} · ${a.alert.listing.town ?? a.alert.listing.locationText ?? '?'} · rule "${a.alert.rule.name}"${RESET}  ${status}`);
    console.log(`    ${DIM}breakdown: price=${s.price} fresh=${s.freshness} cat=${s.category} cond=${s.condition} loc=${s.location} kw=${s.keyword}${RESET}`);
    if (s.explanation.positives.length) console.log(`    ${GREEN}+ ${s.explanation.positives.join('; ')}${RESET}`);
    if (s.explanation.watchouts.length) console.log(`    ${YEL}- ${s.explanation.watchouts.join('; ')}${RESET}`);
  }

  console.log(`\n${BOLD}FCM messages that would be sent (${fcm.sent.length}):${RESET}`);
  for (const msg of fcm.sent) {
    console.log(`  ${CYAN}${msg.notification.title}${RESET}`);
    console.log(`    ${msg.notification.body}`);
    console.log(`    ${DIM}channel=${msg.android.notification.channel_id} priority=${msg.android.priority} deeplink=${msg.data.deeplink}${RESET}`);
  }
  console.log();
}

function labelText(label: string): string {
  return { SCORE_NOW: '🔥 SCORE NOW', GREAT_FIND: '⭐ GREAT FIND', GOOD_LEAD: 'GOOD LEAD', BELOW: '' }[label] ?? '';
}

main().catch((e) => { console.error(e); process.exit(1); });
