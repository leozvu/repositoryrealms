import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCeoUniversalNavigator, searchCeoUniversalNavigator } from '../lib/ceo-universal-navigator.js';

const text = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ENTITIES = [
  {
    id: 'egoric', displayName: 'Egoric Agency', enabled: true, status: 'ready',
    capabilities: ['finance', 'crm', 'delivery', 'support', 'people'],
    baseUrl: 'https://erp-egoric.example', credentialRef: 'MUST_NOT_ESCAPE',
  },
  {
    id: 'egolive', displayName: 'Egolive', enabled: true, status: 'degraded',
    capabilities: ['finance', 'delivery', 'people', 'livestream'],
  },
];

test('CEO15 builds a workflow-only catalog without indexing company records or registry secrets', () => {
  const catalog = buildCeoUniversalNavigator({ entities: ENTITIES, identityReady: true, locale: 'vi' });
  assert.equal(catalog.version, 1);
  assert.equal(catalog.entities.length, 2);
  assert.equal(catalog.entities[0].baseUrl, undefined);
  assert.equal(JSON.stringify(catalog).includes('MUST_NOT_ESCAPE'), false);
  assert.equal(catalog.invariants.businessRecordsIndexed, false);
  assert.equal(catalog.invariants.directEntityDatabaseReads, false);
  assert.equal(catalog.invariants.directEntityDatabaseWrites, false);
  assert.equal(catalog.invariants.entityLaunchRequiresSignedSso, true);
});
test('CEO15 exposes only workflows supported by each entity capability profile', () => {
  const catalog = buildCeoUniversalNavigator({ entities: ENTITIES, identityReady: true });
  assert.ok(catalog.items.some((item) => item.id === 'entity:egolive:livestream'));
  assert.equal(catalog.items.some((item) => item.id === 'entity:egoric:livestream'), false);
  assert.ok(catalog.items.some((item) => item.id === 'entity:egoric:crm'));
  assert.equal(catalog.items.some((item) => item.id === 'entity:egolive:crm'), false);
});

test('CEO15 requires step-up for entity SSO but keeps Portal navigation available', () => {
  const locked = buildCeoUniversalNavigator({ entities: ENTITIES, identityReady: false });
  assert.ok(locked.portalItems.every((item) => item.available));
  assert.ok(locked.items.filter((item) => item.kind === 'entity').every((item) => !item.available && item.disabledReason === 'step_up_required'));
  const ready = buildCeoUniversalNavigator({ entities: ENTITIES, identityReady: true });
  assert.ok(ready.items.filter((item) => item.kind === 'entity').every((item) => item.available));
});

test('CEO15 search is accent-insensitive, tokenized and entity scoped', () => {
  const catalog = buildCeoUniversalNavigator({ entities: ENTITIES, identityReady: true, locale: 'vi' });
  const crm = searchCeoUniversalNavigator(catalog, { query: 'egoric khach tiem nang' });
  assert.deepEqual(crm.map((item) => item.id), ['entity:egoric:crm']);
  const live = searchCeoUniversalNavigator(catalog, { query: 'ca live', scope: 'egolive' });
  assert.deepEqual(live.map((item) => item.id), ['entity:egolive:livestream']);
  assert.ok(searchCeoUniversalNavigator(catalog, { query: 'quyet dinh', scope: 'portal' }).some((item) => item.id === 'portal:decisions'));
});

test('CEO15 UI launches entity workflows only through the existing signed SSO boundary', () => {
  const page = text('app/(app)/ceo-navigator/page.jsx');
  const shell = text('components/Shell.jsx');
  assert.match(page, /fetch\('\/api\/ceo\/v1\/sso\/authorize'/);
  assert.match(page, /entityId:\s*item\.entityId, redirectPath:\s*item\.redirectPath/);
  assert.doesNotMatch(page, /\/api\/data\//);
  assert.doesNotMatch(page, /@\/lib\/prisma|approve|reject/);
  assert.match(shell, /if \(ceoPortal\) router\.push\('\/ceo-navigator'\)/);
  assert.match(shell, /!ceoPortal && showSearch/);
});
