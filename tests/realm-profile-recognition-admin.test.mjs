import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRealmProfileRecognition } from '../lib/realm-profile-recognition-admin.js';

function mockDb({ status = 'active', userType = 'employee' } = {}) {
  const calls = {};
  const now = new Date('2026-08-01T12:00:00.000Z');
  const task = {
    id: 'task-1', title: 'Bàn giao campaign', assigneeId: 'staff-1', status: 'done', priority: 'high', dueDate: '2026-08-01',
    queuePosition: 1, updatedAt: now, completedAt: now,
    project: { id: 'project-1', name: 'Rồng Xanh', status: 'active', progress: 80 },
    realmQuest: { status: 'approved', gold: 5, approvedAt: now, configuredBy: { id: 'pm-1', name: 'PM' }, approvedBy: { id: 'hr-1', name: 'HR' } },
  };
  const db = {
    user: { findUnique: async (args) => { calls.user = args; return { id: 'staff-1', email: 'staff@example.invalid', name: 'Mai Anh', role: 'STAFF', roles: '["STAFF"]', teamId: 'team-1', title: 'Designer', phone: null, status, userType, workspacePreference: 'realm', skills: 'Design systems, Research', createdAt: now, avatarVersion: 1, realmProfile: { realmClass: 'Realm Builder', color: '#4fa47a', streakDays: 0, createdAt: now, updatedAt: now } }; } },
    setting: { findUnique: async (args) => { calls.setting = args; return { json: '{"company":"Egoric Agency"}' }; } },
    realmGoldEntry: { findMany: async (args) => { calls.entries = args; return [{ id: 'gold-1', type: 'quest_reward', amount: 5, renown: 20, label: 'Hoàn tất campaign', sourceType: 'task', sourceId: 'task-1', createdAt: now }]; } },
    collaborationPresenceSession: { findMany: async (args) => { calls.presence = args; return [{ availability: 'focus', surface: 'realm', lastSeen: now }]; } },
    realmRewardBudget: { findUnique: async (args) => { calls.budget = args; return { goldCap: 140, perUserGoldCap: 45, status: 'approved', approvedAt: now }; } },
    team: { findUnique: async (args) => { calls.team = args; return { id: 'team-1', name: 'Creative' }; } },
    task: { findMany: async (args) => { calls.tasks = args; return [task]; } },
  };
  return { db, calls };
}

test('profile and recognition loader self-scopes identity, presence and ledger', async () => {
  const { db, calls } = mockDb();
  const result = await loadRealmProfileRecognition(db, { id: 'staff-1', role: 'STAFF', roles: ['STAFF'] }, new Date('2026-08-01T12:00:00.000Z'));
  assert.deepEqual(calls.entries.where, { userId: 'staff-1' });
  assert.deepEqual(calls.presence.where, { userId: 'staff-1' });
  assert.deepEqual(calls.tasks.where.OR[0], { assigneeId: 'staff-1' });
  assert.equal(result.privacy.scope, 'self');
  assert.equal(result.identity.team.name, 'Creative');
  assert.equal(result.identity.availability.state, 'focus');
  assert.equal(result.recognition.summary.balance, 5);
  assert.equal(result.recognition.ledger[0].receipt.id, 'gold-1');
  assert.equal(result.recognition.ledger[0].from.name, 'PM');
  assert.equal(result.recognition.ledger[0].approver.name, 'HR');
});

test('profile loader excludes sensitive HR and surveillance fields from its select', async () => {
  const { db, calls } = mockDb();
  const result = await loadRealmProfileRecognition(db, { id: 'staff-1', role: 'STAFF', roles: ['STAFF'] }, new Date('2026-08-01T12:00:00.000Z'));
  const selected = JSON.stringify(calls.user.select);
  for (const forbidden of ['salary', 'hourlyRate', 'scores', 'mgrNote', 'selfNote', 'passwordHash', 'totpSecret']) assert.equal(selected.includes(`"${forbidden}"`), false);
  assert.equal(result.privacy.performanceRanking, false);
  assert.equal(result.privacy.inferredMood, false);
  assert.equal(result.recognition.policy.payrollEffect, false);
  assert.equal(result.recognition.policy.rankingEffect, false);
});

test('profile loader rejects inactive and non-employee identities before work queries', async () => {
  const inactive = mockDb({ status: 'inactive' });
  await assert.rejects(loadRealmProfileRecognition(inactive.db, { id: 'staff-1' }), (error) => error.code === 'realm_profile_forbidden');
  assert.equal(inactive.calls.tasks, undefined);
  const freelancer = mockDb({ userType: 'freelancer' });
  await assert.rejects(loadRealmProfileRecognition(freelancer.db, { id: 'staff-1' }), (error) => error.code === 'realm_profile_forbidden');
  assert.equal(freelancer.calls.tasks, undefined);
});
