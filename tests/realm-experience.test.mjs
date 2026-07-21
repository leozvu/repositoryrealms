import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REALM_EXPERIENCE_STORAGE_KEY,
  applyRealmExperienceTelemetryEvent,
  evaluateRealmExperiencePilot,
  normalizeRealmExperienceContext,
  normalizeRealmExperienceEvent,
  normalizeRealmExperienceTelemetry,
  parseRealmExperienceContext,
  realmJourneyForContext,
} from '../lib/realm-experience.js';
import { loadRealmExperienceTelemetry, recordRealmExperienceEvent } from '../lib/realm-experience-admin.js';

test('Phase 22 continuity context accepts only bounded presentation state', () => {
  const context = normalizeRealmExperienceContext({
    mode: 'ledger', panel: 'guild', ledgerView: 'treasury', campaignId: '../secret', position: { x: -4, y: 120 }, recordId: 'must-not-persist',
  });
  assert.equal(REALM_EXPERIENCE_STORAGE_KEY, 'crmegoric-realm-experience:v1');
  assert.deepEqual(context, {
    version: 1, mode: 'ledger', panel: 'guild', ledgerView: 'treasury', position: { x: 0, y: 100 },
  });
  assert.equal('recordId' in context, false);
  assert.equal('campaignId' in context, false);
  assert.equal(parseRealmExperienceContext(JSON.stringify(context)).ledgerView, 'treasury');
  assert.equal(parseRealmExperienceContext('{broken'), null);
  assert.equal(parseRealmExperienceContext({ ...context, version: 2 }), null);
});

test('journey mapping distinguishes business meaning instead of matching buttons', () => {
  assert.equal(realmJourneyForContext({ mode: 'world', panel: 'guild' }), 'guild');
  assert.equal(realmJourneyForContext({ mode: 'world', panel: 'campaigns' }), 'war');
  assert.equal(realmJourneyForContext({ mode: 'world', panel: 'treasury' }), 'treasury');
  assert.equal(realmJourneyForContext({ mode: 'ledger', ledgerView: 'treasury' }), 'tavern');
  assert.equal(realmJourneyForContext({ mode: 'ledger', ledgerView: 'personal' }), null);
});

test('experience signals are fixed, aggregate-only and contain no content or identity', () => {
  assert.deepEqual(normalizeRealmExperienceEvent({ event: 'journey_opened', surface: 'ledger', journey: 'tavern', userId: 'u1', recordId: 'task-1' }), {
    event: 'journey_opened', surface: 'ledger', journey: 'tavern',
  });
  assert.equal(normalizeRealmExperienceEvent({ event: 'key_pressed', surface: 'realm' }), null);
  const next = applyRealmExperienceTelemetryEvent(null, { event: 'journey_opened', surface: 'realm', journey: 'guild' }, new Date('2026-07-20T12:00:00.000Z'));
  assert.equal(next.totalEvents, 1);
  assert.equal(next.journeys.guild, 1);
  assert.equal(next.surfaces.realm, 1);
  assert.equal(JSON.stringify(next).includes('userId'), false);
  assert.equal(JSON.stringify(next).includes('recordId'), false);
});

test('Phase 23 scorecard is advisory to the authoritative launch gate', () => {
  let telemetry = normalizeRealmExperienceTelemetry();
  for (const journey of ['guild', 'war', 'treasury', 'tavern']) telemetry = applyRealmExperienceTelemetryEvent(telemetry, { event: 'journey_opened', surface: 'realm', journey });
  telemetry = applyRealmExperienceTelemetryEvent(telemetry, { event: 'continuity_restored', surface: 'realm' });
  telemetry = applyRealmExperienceTelemetryEvent(telemetry, { event: 'erp_handoff', surface: 'erp' });
  const scorecard = evaluateRealmExperiencePilot({ telemetry, readiness: { ready: true }, openFeedback: 1, blockedFeedback: 0 });
  assert.equal(scorecard.ready, true);
  assert.equal(scorecard.status, 'ready');
  assert.equal(scorecard.authoritativeLaunchGate, false);
  assert.equal(scorecard.privacy.aggregateOnly, true);
  assert.equal(scorecard.privacy.performanceTracking, false);
  const empty = evaluateRealmExperiencePilot({ readiness: { ready: false }, blockedFeedback: 1 });
  assert.equal(empty.status, 'insufficient-data');
  assert.equal(empty.recommendedDecision, 'hold-or-limited-pilot');
});

test('aggregate telemetry reuses Setting and preserves unrelated configuration', async () => {
  let settings = { company: 'Keep', realmPilot: { mode: 'pilot' } };
  const db = {
    setting: { findUnique: async () => ({ json: JSON.stringify(settings) }) },
    $transaction: async (operation, options) => {
      assert.deepEqual(options, { isolationLevel: 'Serializable' });
      return operation({
        setting: {
          findUnique: async () => ({ json: JSON.stringify(settings) }),
          upsert: async (value) => { settings = JSON.parse(value.update.json); },
        },
      });
    },
  };
  await recordRealmExperienceEvent(db, { event: 'realm_opened', surface: 'realm' }, new Date('2026-07-20T12:00:00.000Z'));
  const telemetry = await loadRealmExperienceTelemetry({ setting: { findUnique: async () => ({ json: JSON.stringify(settings) }) } });
  assert.equal(settings.company, 'Keep');
  assert.equal(settings.realmPilot.mode, 'pilot');
  assert.equal(telemetry.totals.realm_opened, 1);
  assert.equal(telemetry.totalEvents, 1);
  await assert.rejects(() => recordRealmExperienceEvent(db, { event: 'mouse_move', surface: 'realm' }), (error) => error.code === 'realm_experience_event_invalid');
});
