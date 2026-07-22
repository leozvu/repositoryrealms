import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStats } from '../lib/projectStats.js';

const project = {
  id: 'p1', status: 'active', budget: 5_000_000, budgetHours: 10,
  startDate: '2026-07-01', deadline: '2026-07-31', autoProgress: true,
};
const tasks = [
  { id: 't1', projectId: 'p1', title: 'Blocked', status: 'blocked', blockReason: 'Review', estHours: 5, assigneeId: 'u1', dueDate: '2026-07-19', dependsOn: '[]' },
  { id: 't2', projectId: 'p1', title: 'Done', status: 'done', estHours: 5, assigneeId: 'u1', dependsOn: '[]' },
];

test('legacy project stats dùng cùng Execution Health rules và giữ response compatibility', () => {
  const result = projectStats({
    project,
    tasks,
    timeLogs: [{ projectId: 'p1', taskId: 't1', userId: 'u1', hours: 6 }],
    usersById: { u1: { userType: 'employee', salary: 17_600_000 } },
    vendorBills: [{ projectId: 'p1', amount: 500_000, status: 'approved' }],
    invoices: [], milestones: [], phases: [],
    queueStates: [{ ownerId: 'u1', wipLimit: 5 }],
    canSeeMoney: true,
    today: '2026-07-20',
  });
  assert.equal(result.health, 'red');
  assert.equal(result.deliveryRisk.primarySignal, '1 Task đang blocked');
  assert.equal(result.blockedTasks, 1);
  assert.equal(result.taskOverdue, 1);
  assert.equal(result.progress, 50);
  assert.equal(result.loggedHours, 6);
  assert.equal(result.source, 'canonical-erp-project');
  assert.equal(result.isAccountingProfit, false);
  assert.equal(result.margin, 3_900_000);
});

test('legacy stats không trả cost/margin khi caller không có money authorization', () => {
  const result = projectStats({
    project, tasks, timeLogs: [], usersById: {}, vendorBills: [],
    canSeeMoney: false, today: '2026-07-20',
  });
  assert.equal(Object.hasOwn(result, 'margin'), false);
  assert.equal(Object.hasOwn(result, 'cost'), false);
  assert.equal(result.estimateCoverage, 100);
});
