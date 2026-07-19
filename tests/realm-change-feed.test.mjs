import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeRealmChangeCursor,
  encodeRealmChangeCursor,
  loadRealmChangeFeed,
  publishRealmChange,
  realmChangeDomains,
  safelyPublishRealmChange,
} from '../lib/realm-change-feed.js';

test('mapping chỉ phát domain Realm cần invalidation', () => {
  assert.deepEqual(realmChangeDomains('tasks'), ['operations', 'guild', 'campaigns', 'rewards']);
  assert.deepEqual(realmChangeDomains('leads'), ['embassy']);
  assert.deepEqual(realmChangeDomains('collaboration'), ['collaboration', 'notifications', 'communications']);
  assert.deepEqual(realmChangeDomains('payroll'), []);
  assert.deepEqual(realmChangeDomains('../tasks'), []);
});

test('cursor round-trip có version và từ chối payload lỗi', () => {
  const cursor = encodeRealmChangeCursor({ createdAt: '2026-07-18T12:00:00.000Z', id: 'event-1' });
  assert.deepEqual(decodeRealmChangeCursor(cursor), {
    createdAt: new Date('2026-07-18T12:00:00.000Z'),
    id: 'event-1',
  });
  assert.throws(() => decodeRealmChangeCursor('not-a-cursor'), (error) => error.code === 'realm_change_cursor_invalid');
});

test('publisher ghi metadata allowlist, không sao chép business payload và dọn retention', async () => {
  const calls = { create: null, prune: null };
  const db = { realmChangeEvent: {
    create: async (args) => { calls.create = args; return { id: 'event-1', ...args.data }; },
    deleteMany: async (args) => { calls.prune = args; return { count: 0 }; },
  } };
  const createdAt = new Date('2026-07-18T12:00:00.000Z');
  const row = await publishRealmChange(db, {
    resource: 'tasks', action: 'update', entityId: 'task-1', actorId: 'user-1', audienceUserId: 'user-2', createdAt,
    payload: { title: 'must never persist' },
  });
  assert.equal(row.resource, 'tasks');
  assert.deepEqual(JSON.parse(calls.create.data.domains), ['operations', 'guild', 'campaigns', 'rewards']);
  assert.equal(calls.create.data.audienceUserId, 'user-2');
  assert.equal('payload' in calls.create.data, false);
  assert.equal(calls.prune.where.createdAt.lt.toISOString(), '2026-07-04T12:00:00.000Z');
  assert.equal(await publishRealmChange(db, { resource: 'payroll' }), null);
});

test('initial feed chỉ cấp watermark; incremental feed chỉ trả domain tổng hợp', async () => {
  const at = new Date('2026-07-18T12:00:00.000Z');
  const db = { realmChangeEvent: {
    findFirst: async (args) => {
      assert.deepEqual(args.where, { OR: [{ audienceUserId: null }, { audienceUserId: 'user-1' }] });
      return { id: 'event-1', createdAt: at };
    },
    findMany: async (args) => {
      assert.deepEqual(args.orderBy, [{ createdAt: 'asc' }, { id: 'asc' }]);
      assert.deepEqual(args.where.AND[0], { OR: [{ audienceUserId: null }, { audienceUserId: 'user-1' }] });
      return [
        { id: 'event-2', createdAt: new Date(at.getTime() + 1), domains: '["guild","operations"]' },
        { id: 'event-3', createdAt: new Date(at.getTime() + 2), domains: '["embassy","guild"]' },
      ];
    },
  } };
  const initial = await loadRealmChangeFeed(db, { id: 'user-1' }, {}, at);
  assert.equal(initial.changed, false);
  assert.equal(initial.eventCount, 0);
  const next = await loadRealmChangeFeed(db, { id: 'user-1' }, { cursor: initial.cursor }, new Date(at.getTime() + 3));
  assert.equal(next.changed, true);
  assert.equal(next.eventCount, 2);
  assert.deepEqual(next.domains, ['embassy', 'guild', 'operations']);
  assert.equal(JSON.stringify(next).includes('event-2'), false);
  assert.equal(JSON.stringify(next).includes('task-1'), false);
  assert.deepEqual(decodeRealmChangeCursor(next.cursor), {
    createdAt: new Date(at.getTime() + 2),
    id: 'event-3',
  });
});

test('feed chặn anonymous và safe publisher không làm hỏng mutation chính', async () => {
  await assert.rejects(loadRealmChangeFeed({}, null), (error) => error.status === 401);
  const errors = [];
  const result = await safelyPublishRealmChange({ realmChangeEvent: {
    create: async () => { throw new Error('database detail'); },
  } }, { resource: 'tasks' }, (message) => errors.push(message));
  assert.equal(result, null);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /realm-change-feed/);
});
