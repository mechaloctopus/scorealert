// Wires the engine together into a single App object shared by the server, jobs, and demo.
// Uses the in-memory repo by default; swap in a Postgres repo for production.

import { InMemoryRepo, type ListingRepo } from './db/repo.ts';
import { AlertEngine, StaticDeviceProvider, type DeviceProvider } from './alerts/engine.ts';
import { MemoryFcmSender, type FcmSender } from './alerts/fcm.ts';
import { defaultRules } from './watch/rules.ts';
import type { WatchRule } from './types.ts';

export interface App {
  repo: ListingRepo;
  fcm: FcmSender;
  devices: DeviceProvider;
  engine: AlertEngine;
  rules: WatchRule[];
}

export function createApp(overrides: Partial<App> = {}): App {
  const repo = overrides.repo ?? new InMemoryRepo();
  const fcm = overrides.fcm ?? new MemoryFcmSender();
  const devices = overrides.devices ?? new StaticDeviceProvider({
    '00000000-0000-0000-0000-000000000001': (process.env.DEMO_FCM_TOKEN ? [process.env.DEMO_FCM_TOKEN] : ['demo-device-token']),
  });
  const engine = overrides.engine ?? new AlertEngine(repo, fcm, devices);
  const rules = overrides.rules ?? defaultRules();
  return { repo, fcm, devices, engine, rules };
}
