import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hrEvidenceIntelligenceScope,
  loadHrEvidenceOutcomeIntelligence,
} from '../lib/hr-evidence-outcome-intelligence-admin.js';

function database() {
  const calls = [];
  const read = (name, rows) => async (args) => { calls.push({ name, args }); return rows; };
  return {
    calls,
    db: {
      user: { findMany: read('user', [{ id: 'u1', name: 'An', title: 'Dev', teamId: 'team-1', status: 'active', userType: 'employee' }]) },
      attendance: { findMany: read('attendance', [{ id: 'a1', userId: 'u1', date: '2026-07-18', status: 'remote' }]) },
      timeLog: { findMany: read('timeLog', [{ id: 'l1', userId: 'u1', taskId: 't1', date: '2026-07-18', hours: 2 }]) },
      task: { findMany: read('task', [{ id: 't1', assigneeId: 'u1', status: 'done', completedAt: new Date('2026-07-18T10:00:00.000Z'), updatedAt: new Date('2026-07-18T10:00:00.000Z') }]) },
      workItemEvent: { findMany: read('workItemEvent', [{ id: 'e1', taskId: 't1', action: 'task.transition', toState: 'done', receiptId: 'receipt-1', occurredAt: new Date('2026-07-18T10:00:00.000Z') }]) },
      okr: { findMany: read('okr', [{ id: 'o1', userId: 'u1', quarter: '2026-Q3', target: 10, current: 8 }]) },
      review: { findMany: read('review', [{ id: 'r1', userId: 'u1', quarter: '2026-Q3', status: 'self_done' }]) },
    },
  };
}

test('scope là company cho HR/Director, team cho manager có team và self cho staff', () => {
  assert.deepEqual(hrEvidenceIntelligenceScope({ id: 'hr', roles: ['HR'] }), { kind: 'company', canValidate: true });
  assert.deepEqual(hrEvidenceIntelligenceScope({ id: 'director', roles: ['DIRECTOR'] }), { kind: 'company', canValidate: true });
  assert.deepEqual(hrEvidenceIntelligenceScope({ id: 'lead', roles: ['LEAD'], teamId: 't1' }), { kind: 'team', teamId: 't1', canValidate: true });
  assert.deepEqual(hrEvidenceIntelligenceScope({ id: 'staff', roles: ['STAFF'], teamId: 't1' }), { kind: 'self', userId: 'staff', canValidate: false });
  assert.equal(hrEvidenceIntelligenceScope(null).code, 'unauthorized');
  assert.equal(hrEvidenceIntelligenceScope({ id: 'free', userType: 'freelancer' }).code, 'hr_evidence_freelancer_forbidden');
});

test('loader đọc canonical HR records theo company scope và không chọn private notes/scores', async () => {
  const { db, calls } = database();
  const result = await loadHrEvidenceOutcomeIntelligence(db, { id: 'hr', roles: ['HR'] }, new Date('2026-07-20T12:00:00.000Z'));
  assert.equal(result.source, 'canonical-erp-hr');
  assert.equal(result.scope.kind, 'company');
  assert.equal(result.hrEvidenceIntelligence.summary.people, 1);
  assert.equal(result.hrEvidenceIntelligence.summary.managerValidationItems, 2);
  assert.deepEqual(calls.map((row) => row.name).sort(), ['attendance', 'okr', 'review', 'task', 'timeLog', 'user', 'workItemEvent']);
  const reviewQuery = calls.find((row) => row.name === 'review').args;
  const attendanceQuery = calls.find((row) => row.name === 'attendance').args;
  assert.equal(reviewQuery.select.scores, undefined);
  assert.equal(reviewQuery.select.selfNote, undefined);
  assert.equal(reviewQuery.select.mgrNote, undefined);
  assert.equal(attendanceQuery.select.checkIn, undefined);
  assert.equal(attendanceQuery.select.checkOut, undefined);
});

test('team manager bị khóa bằng teamId còn staff chỉ query chính mình', async () => {
  const teamDb = database();
  await loadHrEvidenceOutcomeIntelligence(teamDb.db, { id: 'lead', roles: ['LEAD'], teamId: 'team-1' }, new Date('2026-07-20T12:00:00.000Z'));
  assert.deepEqual(teamDb.calls.find((row) => row.name === 'user').args.where, { teamId: 'team-1', status: 'active', userType: 'employee' });

  const selfDb = database();
  await loadHrEvidenceOutcomeIntelligence(selfDb.db, { id: 'u1', roles: ['STAFF'], teamId: 'team-1' }, new Date('2026-07-20T12:00:00.000Z'));
  assert.deepEqual(selfDb.calls.find((row) => row.name === 'user').args.where, { id: 'u1', status: 'active', userType: 'employee' });
});

test('snapshot limits và date window được áp dụng trên server', async () => {
  const { db, calls } = database();
  const result = await loadHrEvidenceOutcomeIntelligence(db, { id: 'director', roles: ['DIRECTOR'] }, new Date('2026-07-20T12:00:00.000Z'));
  const timeLog = calls.find((row) => row.name === 'timeLog').args;
  const events = calls.find((row) => row.name === 'workItemEvent').args;
  assert.equal(timeLog.take, 50_000);
  assert.equal(events.take, 100_000);
  assert.equal(timeLog.where.date.gte, '2026-07-01');
  assert.equal(timeLog.where.date.lt, '2026-10-01');
  assert.equal(result.limits.peopleSnapshotTruncated, false);
});

test('anonymous và freelancer bị chặn trước database query', async () => {
  const db = { user: { findMany: async () => { throw new Error('must not query'); } } };
  await assert.rejects(loadHrEvidenceOutcomeIntelligence(db, null), (error) => error.status === 401 && error.code === 'unauthorized');
  await assert.rejects(loadHrEvidenceOutcomeIntelligence(db, { id: 'free', userType: 'freelancer' }), (error) => error.status === 403 && error.code === 'hr_evidence_freelancer_forbidden');
});
