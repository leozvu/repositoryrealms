import assert from 'node:assert/strict';
import test from 'node:test';
import { createRealmChronicleDashboard, createRealmChronicleDemoDashboard } from '../lib/realm-chronicle.js';

const now = new Date('2026-07-18T12:00:00.000Z');

function chronicle() {
  return createRealmChronicleDashboard({
    source: 'erp', generatedAt: now.toISOString(), now,
    user: { id: 'staff-1', name: 'Mai Anh', title: 'Designer', salary: 99_000_000, managerNote: 'must not leak' },
    team: { id: 'team-1', name: 'Delivery Guild' },
    profile: { realmClass: 'Questsmith', color: '#3b8061', streakDays: 5 },
    tasks: [
      {
        id: 'task-overdue', title: 'Key visual', status: 'doing', priority: 'high', dueDate: '2026-07-17', estHours: 8,
        checklist: JSON.stringify([{ done: true }, { done: false }]), note: 'private task note',
        project: { id: 'project-1', name: 'EVA', status: 'active', progress: 62 },
        realmQuest: { active: true, status: 'approved', approvedAt: now, gold: 8, renown: 20 },
      },
      {
        id: 'task-soon', title: 'Launch plan', status: 'review', priority: 'medium', dueDate: '2026-07-20', estHours: 4,
        checklist: '[]', project: { id: 'project-1', name: 'EVA', status: 'active', progress: 62 },
      },
      { id: 'task-done', title: 'Brief', status: 'done', priority: 'low', dueDate: '2026-07-10', checklist: '[]' },
    ],
    timeLogs: [
      { id: 'time-1', date: '2026-07-18', hours: 3.5, note: 'private note', project: { id: 'project-1', name: 'EVA' } },
      { id: 'time-old', date: '2026-07-10', hours: 9, project: { id: 'project-1', name: 'EVA' } },
    ],
    attendance: [{ id: 'att-1', date: '2026-07-18', status: 'remote', checkIn: '08:55', checkOut: null, note: 'private' }],
    leaves: [{ id: 'leave-1', from: '2026-07-25', to: '2026-07-26', type: 'annual', status: 'approved', note: 'private leave reason' }],
    approvals: [{ id: 'approval-1', type: 'task_handoff', title: 'Bàn giao QA', status: 'pending', payload: 'secret', createdAt: now }],
    entries: [{ id: 'entry-1', type: 'quest_reward', amount: 12, renown: 40, label: 'Quest reward', createdAt: now }],
    links: { tasks: '/tasks', projects: '/projects', timesheet: '/timesheet', attendance: '/attendance', approvals: '/approvals', profile: '/staff/staff-1' },
  });
}

test('Chronicle tổng hợp đúng self status và không tạo bảng xếp hạng', () => {
  const result = chronicle();
  assert.equal(result.source, 'erp');
  assert.equal(result.privacy.scope, 'self');
  assert.equal(result.privacy.performanceRanking, false);
  assert.equal(result.metrics.openQuests, 2);
  assert.equal(result.metrics.overdueQuests, 1);
  assert.equal(result.metrics.dueSoonQuests, 1);
  assert.equal(result.metrics.loggedHours, 3.5);
  assert.equal(result.metrics.pendingApprovals, 1);
  assert.equal(result.career.wallet, 12);
  assert.equal(result.muster.today.status, 'remote');
  assert.equal(result.muster.nextLeave.from, '2026-07-25');
});

test('Chronicle chỉ serialize allowlist, loại trường nhạy cảm và tạo deep-link ERP', () => {
  const result = chronicle();
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('99_000_000'), false);
  assert.equal(serialized.includes('99000000'), false);
  assert.equal(serialized.includes('must not leak'), false);
  assert.equal(serialized.includes('private task note'), false);
  assert.equal(serialized.includes('private leave reason'), false);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(result.quests[0].href, '/tasks?focus=task-overdue&from=realm');
  assert.equal(result.campaigns[0].href, '/projects/project-1');
  assert.equal(result.approvals[0].href, '/approvals?focus=approval-1&from=realm');
});

test('Timeline hợp nhất Gold, TimeLog, Leave và Approval nhưng không trả payload gốc', () => {
  const result = chronicle();
  assert.ok(result.timeline.some((event) => event.kind === 'gold'));
  assert.ok(result.timeline.some((event) => event.kind === 'time'));
  assert.ok(result.timeline.some((event) => event.kind === 'leave'));
  assert.ok(result.timeline.some((event) => event.kind === 'approval'));
  assert.equal(result.timeline.every((event) => ['id', 'at', 'kind', 'icon', 'title', 'detail', 'href'].every((key) => key in event)), true);
});

test('Demo Chronicle vẫn khai báo local sandbox và có dữ liệu trạng thái hữu ích', () => {
  const result = createRealmChronicleDemoDashboard({
    profile: { name: 'Adventurer Zero', role: 'Realm Builder', color: '#3b8061' },
    career: { streakDays: 4, renown: 1180, completedQuests: 7 },
    wallet: 28,
    quests: [{ id: 'q-1', title: 'Demo quest', status: 'active', project: 'Demo', total: 3, progress: 1, reward: 5 }],
    ledger: [{ id: 'l-1', amount: 10, label: 'Opening balance' }],
  });
  assert.equal(result.source, 'local');
  assert.equal(result.identity.name, 'Adventurer Zero');
  assert.equal(result.metrics.openQuests, 1);
  assert.equal(result.career.wallet, 28);
  assert.equal(result.career.renown, 1180);
  assert.equal(result.career.completedQuests, 7);
  assert.equal(result.privacy.sourceOfTruth, 'erp-records');
});
