import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimRealmTaskReward,
  mapErpTaskToRealmQuest,
  realmTaskProgress,
  serializeRealmErpSnapshot,
  updateRealmErpProfile,
} from '../lib/realm-erp-adapter.js';

const USER = { id: 'user-1', name: 'Mai Anh', title: 'Product Lead' };

function rewardTask(overrides = {}) {
  return {
    id: 'task-123',
    assigneeId: USER.id,
    title: 'Hoàn tất launch checklist',
    status: 'done',
    priority: 'high',
    checklist: JSON.stringify([{ text: 'QA', done: true }, { text: 'Release', done: true }]),
    dueDate: new Date('2026-07-20T00:00:00.000Z'),
    project: { id: 'project-1', name: 'Rồng Xanh' },
    assignee: USER,
    realmQuest: {
      active: true,
      gold: 5,
      renown: 120,
      approvedAt: new Date('2026-07-17T00:00:00.000Z'),
      approvedBy: { id: 'manager-1', name: 'Minh Quân' },
    },
    ...overrides,
  };
}

function createClaimDb(task = rewardTask(), seedEntries = []) {
  const state = {
    entries: seedEntries.map((entry) => ({ ...entry })),
    taskEvents: [],
    auditLogs: [],
    transactionOptions: null,
  };
  const realmGoldEntry = {
    findUnique: async ({ where }) => state.entries.find((entry) => entry.idempotencyKey === where.idempotencyKey) || null,
    findFirst: async ({ where }) => state.entries.find((entry) => (
      entry.userId === where.userId
      && entry.type === where.type
      && entry.sourceType === where.sourceType
      && entry.sourceId === where.sourceId
    )) || null,
    create: async ({ data }) => {
      const entry = { id: `gold-${state.entries.length + 1}`, createdAt: new Date(), ...data };
      state.entries.push(entry);
      return entry;
    },
  };
  const tx = {
    realmGoldEntry,
    task: { findUnique: async () => task },
    taskEvent: { create: async ({ data }) => { state.taskEvents.push(data); return data; } },
    auditLog: { create: async ({ data }) => { state.auditLogs.push(data); return data; } },
  };
  return {
    state,
    db: {
      realmGoldEntry,
      $transaction: async (callback, options) => {
        state.transactionOptions = options;
        return callback(tx);
      },
    },
  };
}

test('Task ERP được map thành Quest với checklist, deadline và reward đã duyệt', () => {
  const task = rewardTask();
  assert.deepEqual(realmTaskProgress(task), { progress: 2, total: 2 });
  const quest = mapErpTaskToRealmQuest(task);
  assert.equal(quest.id, 'erp-task:task-123');
  assert.equal(quest.businessRef, 'task-123');
  assert.equal(quest.status, 'ready');
  assert.equal(quest.priority, 'Epic');
  assert.equal(quest.reward, 5);
  assert.equal(quest.renown, 120);
  assert.equal(quest.due, '2026-07-20');
  assert.equal(quest.approval, 'Đã duyệt bởi Minh Quân');
  assert.deepEqual(quest.links, {
    task: '/tasks?focus=task-123&from=realm',
    project: '/projects/project-1',
    owner: '/staff/user-1',
  });
});

test('Snapshot ERP là nguồn chung cho profile, Quest, Gold và Renown', () => {
  const entries = [
    { id: 'gold-1', type: 'quest_reward', amount: 5, renown: 120, label: 'Quest reward', sourceType: 'task', sourceId: 'task-123', createdAt: new Date('2026-07-17T10:00:00.000Z') },
    { id: 'gold-2', type: 'shop_spend', amount: -2, renown: 0, label: 'Cosmetic', sourceType: 'shop', sourceId: 'iron-scribe-title', createdAt: new Date('2026-07-17T11:00:00.000Z') },
    { id: 'gold-3', type: 'loadout_equip', amount: 0, renown: 0, label: 'Trang bị title', sourceType: 'loadout', sourceId: 'title:iron-scribe-title:event-1', createdAt: new Date('2026-07-17T11:05:00.000Z') },
  ];
  const snapshot = serializeRealmErpSnapshot({
    user: USER,
    profile: { realmClass: 'Questsmith', color: '#6a4c93', streakDays: 9, updatedAt: new Date('2026-07-17T09:00:00.000Z') },
    tasks: [rewardTask()],
    entries,
  });
  assert.equal(snapshot.source, 'erp');
  assert.equal(snapshot.profile.name, 'Mai Anh');
  assert.equal(snapshot.profile.role, 'Questsmith');
  assert.equal(snapshot.profile.color, '#6a4c93');
  assert.equal(snapshot.profile.loadout.title.equipName, 'Iron Scribe');
  assert.equal(snapshot.profile.loadout.seal, null);
  assert.equal(snapshot.operations.wallet, 3);
  assert.equal(snapshot.operations.renown, 120);
  assert.equal(snapshot.operations.completedQuests, 1);
  assert.equal(snapshot.operations.streakDays, 9);
  assert.equal(snapshot.operations.quests[0].status, 'claimed');
  assert.equal(snapshot.bridge.sourceOfTruth, 'erp');
  assert.equal(snapshot.bridge.profileHref, '/staff/user-1');
  assert.deepEqual(snapshot.bridge.counters, { quests: 1, openQuests: 0, campaigns: 1 });
  assert.match(snapshot.sync.revision, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.sync.entities.profileVersion, '2026-07-17T09:00:00.000Z');
});

test('Claim reward chạy transaction serializable và idempotent', async () => {
  const { db, state } = createClaimDb();
  const input = { taskId: 'task-123', idempotencyKey: 'realm-claim:task-123' };
  const first = await claimRealmTaskReward(db, USER, input);
  const second = await claimRealmTaskReward(db, USER, input);
  const sameQuestNewRetryKey = await claimRealmTaskReward(db, USER, { ...input, idempotencyKey: 'realm-claim:task-123-retry' });

  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(sameQuestNewRetryKey.idempotent, true);
  assert.equal(state.entries.length, 1);
  assert.equal(state.entries[0].amount, 5);
  assert.equal(state.entries[0].renown, 120);
  assert.equal(state.taskEvents.length, 1);
  assert.equal(state.auditLogs.length, 1);
  assert.deepEqual(state.transactionOptions, { isolationLevel: 'Serializable' });
});

test('Claim chặn task ngoài quyền, chưa xong, chưa duyệt và key xung đột', async () => {
  for (const [task, code] of [
    [rewardTask({ assigneeId: 'user-2' }), 'not_task_assignee'],
    [rewardTask({ status: 'doing' }), 'task_not_done'],
    [rewardTask({ realmQuest: { active: true, gold: 5, renown: 120, approvedAt: null } }), 'reward_not_approved'],
  ]) {
    const { db } = createClaimDb(task);
    await assert.rejects(
      claimRealmTaskReward(db, USER, { taskId: task.id, idempotencyKey: `realm-claim:${task.id}` }),
      (error) => error.code === code,
    );
  }

  const collision = {
    id: 'gold-existing', userId: USER.id, type: 'quest_reward', sourceType: 'task', sourceId: 'another-task',
    idempotencyKey: 'realm-claim:task-123', amount: 4, renown: 20,
  };
  const { db } = createClaimDb(rewardTask(), [collision]);
  await assert.rejects(
    claimRealmTaskReward(db, USER, { taskId: 'task-123', idempotencyKey: 'realm-claim:task-123' }),
    (error) => error.code === 'idempotency_conflict',
  );
});

test('Snapshot và claim tôn trọng module ERP đang bật', async () => {
  const snapshot = serializeRealmErpSnapshot({
    user: { ...USER, role: 'STAFF', roles: ['STAFF'], userType: 'employee' },
    profile: null,
    tasks: [rewardTask()],
    entries: [],
    modules: ['tasks'],
  });
  assert.equal(snapshot.operations.quests[0].links.task, '/tasks?focus=task-123&from=realm');
  assert.equal(snapshot.operations.quests[0].links.project, null);
  assert.equal(snapshot.operations.quests[0].links.owner, '/staff/user-1');

  const { db } = createClaimDb();
  await assert.rejects(
    claimRealmTaskReward(db, USER, { taskId: 'task-123', idempotencyKey: 'realm-claim:module-off', modules: [] }),
    (error) => error.code === 'realm_tasks_module_disabled' && error.status === 403,
  );
});

test('Profile Realm chỉ nhận class allowlist và màu hex hợp lệ', async () => {
  const state = { upsert: null, audit: null };
  const tx = {
    realmProfile: { upsert: async (args) => { state.upsert = args; return args.create; } },
    auditLog: { create: async ({ data }) => { state.audit = data; return data; } },
  };
  const db = { $transaction: async (callback) => callback(tx) };
  await updateRealmErpProfile(db, USER, { role: 'Alchemist', color: '#AABBCC' });
  assert.equal(state.upsert.create.realmClass, 'Alchemist');
  assert.equal(state.upsert.create.color, '#aabbcc');
  assert.equal(state.audit.action, 'realm_profile');
  await assert.rejects(updateRealmErpProfile(db, USER, { role: 'Admin', color: '#aabbcc' }), (error) => error.code === 'invalid_realm_class');
  await assert.rejects(updateRealmErpProfile(db, USER, { role: 'Scout', color: 'red' }), (error) => error.code === 'invalid_profile_color');
});

test('Profile Realm chặn tab cũ ghi đè phiên bản mới hơn', async () => {
  const currentVersion = new Date('2026-07-18T10:00:00.000Z');
  const state = { upserts: 0, options: null };
  const tx = {
    realmProfile: {
      findUnique: async () => ({ updatedAt: currentVersion }),
      upsert: async ({ update }) => { state.upserts += 1; return { ...update, updatedAt: new Date() }; },
    },
    auditLog: { create: async ({ data }) => data },
  };
  const db = {
    $transaction: async (callback, options) => {
      state.options = options;
      return callback(tx);
    },
  };
  await assert.rejects(
    updateRealmErpProfile(db, USER, { role: 'Scout', color: '#aabbcc' }, { expectedProfileVersion: '2026-07-18T09:00:00.000Z' }),
    (error) => error.code === 'realm_profile_conflict' && error.status === 409,
  );
  assert.equal(state.upserts, 0);
  await updateRealmErpProfile(db, USER, { role: 'Scout', color: '#aabbcc' }, { expectedProfileVersion: currentVersion.toISOString() });
  assert.equal(state.upserts, 1);
  assert.deepEqual(state.options, { isolationLevel: 'Serializable' });
});
