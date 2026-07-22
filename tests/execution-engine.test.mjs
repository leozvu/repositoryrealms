import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMyWorkReadModel,
  buildTeamWorkReadModel,
  capacityBand,
  compareWorkItems,
  myWorkQueueFor,
  normalizedExecutionStatus,
} from '../lib/execution-engine.js';

test('My Work phân nhóm cùng Task ERP, giữ alias cũ và ưu tiên có thứ tự ổn định', () => {
  const tasks = [
    { id: 'inbox', status: 'todo', queuePosition: 0, priority: 'low' },
    { id: 'planned-2', status: 'todo', queuePosition: 2, priority: 'high' },
    { id: 'planned-1', status: 'todo', queuePosition: 1, priority: 'low' },
    { id: 'doing', status: 'in_progress', queuePosition: 3 },
    { id: 'review', status: 'review' },
    { id: 'blocked', status: 'blocked', dueDate: '2026-07-18' },
    { id: 'done', status: 'done' },
    { id: 'merged', status: 'merged' },
  ];
  const model = buildMyWorkReadModel(tasks, { today: '2026-07-20' });
  assert.equal(normalizedExecutionStatus('in_progress'), 'doing');
  assert.equal(myWorkQueueFor(tasks[0], '2026-07-20'), 'inbox');
  assert.deepEqual(model.queues.planned.map((task) => task.id), ['planned-1', 'planned-2']);
  assert.deepEqual(model.queues.completed.map((task) => task.id), ['done', 'merged']);
  assert.equal(model.metrics.open, 6);
  assert.equal(model.metrics.blocked, 1);
  assert.equal(model.metrics.overdue, 1);
  assert.ok(compareWorkItems({ id: 'high', priority: 'high' }, { id: 'low', priority: 'low' }) < 0);
});

test('Team Work biểu diễn WIP/capacity nhưng không tạo employee ranking', () => {
  assert.equal(capacityBand(2, 5).key, 'available');
  assert.equal(capacityBand(4, 5).key, 'near');
  assert.equal(capacityBand(6, 5).key, 'over');
  const model = buildTeamWorkReadModel({
    members: [{ id: 'u1', name: 'An' }, { id: 'u2', name: 'Bình' }],
    tasks: [
      { id: 't1', assigneeId: 'u1', status: 'doing', estHours: 2 },
      { id: 't2', assigneeId: 'u1', status: 'review', estHours: 1, dueDate: '2026-07-18' },
      { id: 't3', assigneeId: 'u1', status: 'blocked' },
      { id: 't4', assigneeId: null, status: 'todo' },
    ],
    queueStates: [{ ownerId: 'u1', version: 4, wipLimit: 1 }],
    today: '2026-07-20',
  });
  assert.equal(model.metrics.people, 2);
  assert.equal(model.metrics.open, 4);
  assert.equal(model.metrics.overCapacity, 1);
  assert.equal(model.members[0].queue.version, 4);
  assert.equal(model.members[0].metrics.estimatedOpenHours, 3);
  assert.equal(model.unassigned.length, 1);
  assert.deepEqual(model.policy, { employeeRanking: false, presenceAsProductivity: false, capacityUnit: 'wip' });
});
