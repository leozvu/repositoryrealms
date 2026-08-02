import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildCeoTerminalCockpit, CEO_TERMINAL_COCKPIT_VERSION } from '../lib/ceo-terminal-cockpit.js';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const NOW = new Date('2026-08-01T22:00:00.000Z');

const dashboard = {
  health: { available: 3, registered: 4 },
  rings: { aim: { ring: 'commands', status: 'active' } },
  entities: [
    { id: 'aim', displayName: 'AIm Agency', freshness: { state: 'fresh', ageSeconds: 40 } },
    { id: 'egoric', displayName: 'Egoric Agency', freshness: { state: 'stale', ageSeconds: 900 } },
    { id: 'egolive', displayName: 'Egolive', freshness: { state: 'missing', ageSeconds: null } },
    { id: 'vnecom', displayName: 'Vnecom LLC', freshness: { state: 'fresh', ageSeconds: 60 } },
  ],
};

const rollout = {
  entities: [
    { id: 'aim', displayName: 'AIm Agency', state: { currentRing: 'commands', status: 'active' } },
    { id: 'egoric', displayName: 'Egoric Agency', state: { currentRing: 'messaging', status: 'paused' } },
    { id: 'egolive', displayName: 'Egolive', state: { currentRing: 'read_only', status: 'hold', migrationRequired: true } },
    { id: 'vnecom', displayName: 'Vnecom LLC', state: { currentRing: 'ceo_sso', status: 'active' } },
  ],
};

test('CEO-12 composes a prioritized operating queue from sanitized control-plane read models', () => {
  const model = buildCeoTerminalCockpit({
    dashboard,
    rollout,
    commands: { deliveries: [
      { targetEntityId: 'aim', status: 'pending_confirmation' },
      { targetEntityId: 'egoric', status: 'failed' },
      { targetEntityId: 'vnecom', status: 'delivered' },
    ] },
    conversations: { conversations: [
      { targetEntityId: 'aim', lastMessage: { direction: 'inbound', status: 'read' } },
      { targetEntityId: 'egolive', lastMessage: { direction: 'outbound', status: 'pending_confirmation' } },
    ] },
    staffLinks: { links: [
      { personKey: 'shared@example.com', entityId: 'aim', status: 'active' },
      { personKey: 'shared@example.com', entityId: 'egoric', status: 'active' },
      { personKey: 'local@example.com', entityId: 'vnecom', status: 'active' },
    ] },
    sourceStates: { rollout: 'available', workforce: 'available', commands: 'available', conversations: 'available' },
    identityReady: true,
    now: NOW,
  });

  assert.equal(model.version, CEO_TERMINAL_COCKPIT_VERSION);
  assert.deepEqual(model.metrics, {
    sourcesAvailable: 3,
    sourcesRegistered: 4,
    openReceipts: 3,
    recentReplies: 1,
    groupPeople: 2,
    crossEntityPeople: 1,
    activeRollouts: 2,
    rolloutEntities: 4,
  });
  assert.deepEqual(model.attention.slice(0, 3).map((item) => item.code), [
    'entity.source_unavailable',
    'command.delivery_failed',
    'rollout.migration_required',
  ]);
  assert.equal(model.companies.find((company) => company.id === 'egoric').openReceipts, 1);
  assert.equal(model.invariants.directEntityDatabaseWrites, false);
  assert.equal(model.invariants.businessActionsUseCanonicalWorkflows, true);
  assert.equal(model.invariants.financialMetricsCombined, false);
});

test('CEO-12 scopes the cockpit without copying records or pretending protected sources are empty', () => {
  const model = buildCeoTerminalCockpit({
    dashboard: { ...dashboard, health: { available: 1, registered: 1 }, entities: dashboard.entities.filter((entity) => entity.id === 'aim') },
    rollout,
    staffLinks: { links: [] },
    sourceStates: { commands: 'locked', conversations: 'locked', rollout: 'available', workforce: 'available' },
    identityReady: false,
    entityId: 'aim',
    now: NOW,
  });

  assert.deepEqual(model.companies.map((company) => company.id), ['aim']);
  assert.equal(model.sources.commands, 'locked');
  assert.equal(model.sources.conversations, 'locked');
  assert.equal(model.attention[0].code, 'identity.step_up_required');
  assert.equal(model.metrics.openReceipts, 0);
  assert.equal(model.metrics.sourcesAvailable, 1);
  assert.equal(model.metrics.sourcesRegistered, 1);
});

test('CEO-12 UI remains a read-only cockpit over existing CEO workflows', () => {
  const component = text('components/ceo/CeoOperationsCockpit.jsx');
  const css = text('components/ceo/ceo-operations-cockpit.module.css');
  const overview = text('app/(app)/ceo-overview/page.jsx');
  const navigation = text('lib/erp-navigation.js');

  for (const endpoint of [
    '/api/ceo/v1/rollout',
    '/api/ceo/v1/staff/links',
    '/api/ceo/v1/command-gateway?limit=100',
    '/api/ceo/v1/messaging/conversations',
  ]) assert.match(component, new RegExp(endpoint.replace(/[/?]/g, '\\$&')));
  for (const href of ['/ceo-commands?compose=task.create', '/ceo-inbox', '/ceo-workforce', '/ceo-world']) {
    assert.match(component, new RegExp(href.replace(/[/?]/g, '\\$&')));
  }
  assert.doesNotMatch(component, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
  assert.match(component, /aria-labelledby="ceo-operations-cockpit-title"/);
  assert.match(component, /aria-busy/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /max-width:\s*520px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(overview, /<CeoOperationsCockpit/);
  assert.match(navigation, /CEO · Trung tâm điều hành/);
});
