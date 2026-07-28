import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRealmSnapshotRevision,
  createRealmSyncEnvelope,
  normalizeRealmProfileVersion,
  realmSnapshotEtag,
  realmSnapshotHeaders,
  realmSnapshotMatchesEtag,
} from '../lib/realm-sync.js';

const SNAPSHOT = {
  source: 'erp',
  profile: { name: 'Mai Anh', role: 'Questsmith', color: '#6a4c93' },
  operations: { wallet: 5, quests: [{ id: 'quest-1', status: 'ready' }], ledger: [] },
  bridge: { sourceOfTruth: 'erp', counters: { quests: 1 } },
};

test('Realm revision ổn định theo nội dung và không phụ thuộc giờ serialize', () => {
  const reordered = {
    operations: { ledger: [], quests: [{ status: 'ready', id: 'quest-1' }], wallet: 5 },
    bridge: { counters: { quests: 1 }, sourceOfTruth: 'erp' },
    profile: { color: '#6a4c93', role: 'Questsmith', name: 'Mai Anh' },
    source: 'erp',
  };
  const first = createRealmSyncEnvelope(SNAPSHOT, { generatedAt: new Date('2026-07-18T10:00:00.000Z') });
  const second = createRealmSyncEnvelope(reordered, { generatedAt: new Date('2026-07-18T11:00:00.000Z') });
  assert.equal(first.revision, second.revision);
  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.equal(first.revision, createRealmSnapshotRevision(SNAPSHOT));
  assert.notEqual(first.revision, createRealmSnapshotRevision({ ...SNAPSHOT, operations: { ...SNAPSHOT.operations, wallet: 6 } }));
});

test('ETag hỗ trợ conditional GET, weak validator và headers riêng theo session', () => {
  const sync = createRealmSyncEnvelope(SNAPSHOT, { generatedAt: new Date('2026-07-18T10:00:00.000Z') });
  const etag = realmSnapshotEtag(sync);
  assert.match(etag, /^"realm-[a-f0-9]{64}"$/);
  assert.equal(realmSnapshotMatchesEtag(etag, sync), true);
  assert.equal(realmSnapshotMatchesEtag(`W/${etag}`, sync), true);
  assert.equal(realmSnapshotMatchesEtag('"another", W/' + etag, sync), true);
  assert.equal(realmSnapshotMatchesEtag('"another"', sync), false);
  assert.deepEqual(realmSnapshotHeaders(sync), {
    'Cache-Control': 'private, no-cache, no-store, max-age=0',
    Vary: 'Cookie',
    ETag: etag,
    'X-Realm-Revision': sync.revision,
    'X-Realm-Generated-At': '2026-07-18T10:00:00.000Z',
  });
});

test('Profile version chỉ nhận ISO timestamp chính xác hoặc null', () => {
  assert.equal(normalizeRealmProfileVersion('2026-07-18T10:00:00.000Z'), '2026-07-18T10:00:00.000Z');
  assert.equal(normalizeRealmProfileVersion(null), null);
  assert.equal(normalizeRealmProfileVersion(undefined), undefined);
  assert.equal(normalizeRealmProfileVersion('yesterday'), undefined);
  assert.equal(normalizeRealmProfileVersion('2026-07-18'), undefined);
});
