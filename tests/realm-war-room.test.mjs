import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmWarRoomDashboard, createRealmWarRoomDemoDashboard } from '../lib/realm-war-room.js';

test('War Room demo tạo Phase, Milestone và giữ nguyên nguyên tắc không ranking', () => {
  const dashboard = createRealmWarRoomDemoDashboard({
    campaign: { id: 'campaign-2', name: 'Website Nhà Giả Kim', owner: 'Nghĩa Nguyễn', progress: 46 },
    quests: [{ id: 'q-landing', title: 'Build landing page', project: 'Website Egoric', owner: 'Nghĩa Nguyễn', priority: 'skilled', status: 'active', progress: 2, total: 5, due: 'Ngày mai' }],
  });
  assert.equal(dashboard.source, 'local');
  assert.equal(dashboard.campaign.id, 'campaign-2');
  assert.equal(dashboard.phases.length, 3);
  assert.equal(dashboard.milestones.length, 2);
  assert.equal(dashboard.permissions.readOnly, true);
  assert.equal(dashboard.permissions.performanceRanking, false);
  assert.ok(dashboard.blockers.some((blocker) => blocker.task === 'QA responsive và accessibility'));
});

test('War Room suy ra dependency blocker, quá hạn và cổng thưởng từ Task hiện hữu', () => {
  const dashboard = createRealmWarRoomDashboard({
    source: 'erp',
    project: { id: 'project-1', name: 'Rồng Xanh', status: 'active', progress: 50, deadline: '2026-07-20' },
    phases: [{ id: 'phase-1', name: 'Build', order: 0, color: '#336655' }],
    tasks: [
      { id: 'task-a', title: 'Foundation', status: 'doing', priority: 'high', dueDate: '2026-07-16', phaseId: 'phase-1', assignee: { id: 'staff-1', name: 'Mai Anh' } },
      { id: 'task-b', title: 'Release', status: 'todo', dependsOn: '["task-a"]', phaseId: 'phase-1', assignee: { id: 'lead-1', name: 'Minh Quân' } },
      { id: 'task-c', title: 'QA approved', status: 'done', checklist: '[{"text":"QA","done":true}]', phaseId: 'phase-1', assignee: { id: 'staff-1', name: 'Mai Anh' }, realmQuest: { active: true, approvedAt: new Date('2026-07-16') } },
    ],
    milestones: [{ id: 'ms-1', name: 'Go live', date: '2026-07-16', done: false }],
    now: new Date('2026-07-17T12:00:00.000Z'),
    permissions: { scope: 'team', teamId: 'delivery' },
  });
  assert.equal(dashboard.campaign.health, 'critical');
  assert.equal(dashboard.metrics.overdueTasks, 1);
  assert.equal(dashboard.metrics.blockedTasks, 1);
  assert.equal(dashboard.metrics.activeTasks, 1);
  assert.equal(dashboard.metrics.readyRewards, 1);
  assert.equal(dashboard.phases[0].tasks.find((task) => task.id === 'task-b').lane, 'blocked');
  assert.deepEqual(dashboard.blockers[0].reasons, ['Foundation']);
});

test('Task ngoài Phase đã biết được gom vào Backlog an toàn', () => {
  const dashboard = createRealmWarRoomDashboard({
    project: { id: 'project-1', name: 'Campaign' },
    phases: [{ id: 'phase-1', name: 'Known', order: 0 }],
    tasks: [{ id: 'task-1', title: 'Unassigned', status: 'todo', phaseId: 'unknown-phase' }],
  });
  assert.equal(dashboard.phases.at(-1).id, 'unassigned');
  assert.equal(dashboard.phases.at(-1).tasks[0].id, 'task-1');
});

test('Reward đã ghi journal không còn xuất hiện ở hàng chờ ghi nhận', () => {
  const dashboard = createRealmWarRoomDashboard({
    project: { id: 'project-1', name: 'Campaign' },
    tasks: [{ id: 'task-1', title: 'Approved', status: 'done', realmQuest: { active: true, approvedAt: new Date('2026-07-16') } }],
    rewardedSourceIds: new Set(['task-1']),
  });
  assert.equal(dashboard.metrics.readyRewards, 0);
  assert.equal(dashboard.phases[0].tasks[0].rewardGate, 'claimed');
});
