import assert from 'node:assert/strict';
import test from 'node:test';
import { createRealmCommandCenterDashboard } from '../lib/realm-command-center.js';

const now = new Date('2026-07-18T12:00:00.000Z');

function dashboard() {
  return createRealmCommandCenterDashboard({
    source: 'erp',
    generatedAt: now.toISOString(),
    actorId: 'staff-1',
    scope: 'team',
    now,
    permissions: { canAssign: false },
    members: [
      { id: 'staff-1', name: 'Mai Anh', title: 'Designer', realmProfile: { realmClass: 'Questsmith', color: '#3b8061' } },
      { id: 'staff-2', name: 'Quốc Việt', title: 'Editor', realmProfile: null },
    ],
    tasks: [
      { id: 'task-overdue', title: 'Key visual', status: 'doing', priority: 'high', dueDate: '2026-07-17', estHours: 24, assigneeId: 'staff-1', project: { id: 'project-1', name: 'EVA' }, note: 'must not leak' },
      { id: 'task-soon', title: 'Video cut', status: 'todo', priority: 'medium', dueDate: '2026-07-20', estHours: 20, assigneeId: 'staff-1', project: { id: 'project-1', name: 'EVA' } },
      { id: 'task-unknown', title: 'Caption', status: 'review', priority: 'low', dueDate: '2026-07-21', estHours: 0, assigneeId: 'staff-2', project: null },
    ],
    timeLogs: [{ userId: 'staff-1', hours: 7.5 }, { userId: 'staff-1', hours: 2 }],
    handoffs: [{
      id: 'approval-1', refId: 'task-overdue', requesterName: 'Mai Anh', status: 'pending',
      payload: JSON.stringify({ targetAssigneeId: 'staff-2', note: 'private reason' }), createdAt: now,
    }],
  });
}

test('Command Center tính tải 7 ngày từ giờ ước lượng, không dùng Gold hay presence', () => {
  const result = dashboard();
  const mai = result.workload.find((member) => member.id === 'staff-1');
  assert.equal(mai.plannedHours, 44);
  assert.equal(mai.loadPercent, 110);
  assert.equal(mai.loadLevel, 'overloaded');
  assert.equal(mai.loggedHours, 9.5);
  assert.equal(result.metrics.overdueTasks, 1);
  assert.equal(result.metrics.overloadedMembers, 1);
  assert.equal(result.permissions.performanceRanking, false);
  assert.equal(JSON.stringify(result).includes('Gold'), false);
  assert.equal(JSON.stringify(result).includes('presence'), false);
});

test('Task serializer chỉ trả allowlist và khóa yêu cầu bàn giao trùng', () => {
  const result = dashboard();
  const task = result.tasks.find((row) => row.id === 'task-overdue');
  assert.equal(task.handoff.targetAssignee.name, 'Quốc Việt');
  assert.equal(task.canRequestHandoff, false);
  assert.equal('note' in task, false);
  assert.equal(JSON.stringify(result).includes('private reason'), false);
  assert.equal(result.permissions.sourceOfTruth, 'erp-task');
});

test('Nhân sự chỉ được xin bàn giao Task của chính mình đang mở', () => {
  const result = createRealmCommandCenterDashboard({
    source: 'erp', actorId: 'staff-1', members: [{ id: 'staff-1', name: 'Mai Anh' }, { id: 'staff-2', name: 'Việt' }],
    tasks: [
      { id: 'mine', title: 'Mine', status: 'todo', assigneeId: 'staff-1', priority: 'medium' },
      { id: 'other', title: 'Other', status: 'todo', assigneeId: 'staff-2', priority: 'medium' },
      { id: 'done', title: 'Done', status: 'done', assigneeId: 'staff-1', priority: 'medium' },
    ],
    now,
  });
  assert.equal(result.tasks.find((task) => task.id === 'mine').canRequestHandoff, true);
  assert.equal(result.tasks.find((task) => task.id === 'other').canRequestHandoff, false);
  assert.equal(result.tasks.find((task) => task.id === 'done').canRequestHandoff, false);
});
