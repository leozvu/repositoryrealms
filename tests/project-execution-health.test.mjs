import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectExecutionHealth,
  parseProjectDependencyIds,
  PROJECT_EXECUTION_HEALTH_RULE_VERSION,
} from '../lib/project-execution-health.js';

const PROJECT = {
  id: 'project-1', name: 'Realm launch', status: 'active', budget: 20_000_000,
  budgetHours: 20, startDate: '2026-07-01', deadline: '2026-07-31',
};

function task(id, data = {}) {
  return {
    id,
    projectId: PROJECT.id,
    title: `Task ${id}`,
    status: 'todo',
    estHours: 4,
    assigneeId: 'user-1',
    dependsOn: '[]',
    ...data,
  };
}

test('dependency parser fail-closed với JSON hỏng, ID lạ và duplicate', () => {
  assert.deepEqual(parseProjectDependencyIds('["a","a","b-2","../x",null]'), ['a', 'b-2']);
  assert.deepEqual(parseProjectDependencyIds('{broken'), []);
  assert.deepEqual(parseProjectDependencyIds(null), []);
});

test('Project Execution Health phát hiện blocker, dependency cycle, WIP và deadline risk', () => {
  const tasks = [
    task('a', { status: 'blocked', blockReason: 'Chờ khách duyệt', dependsOn: '["b"]', dueDate: '2026-07-18' }),
    task('b', { status: 'doing', dependsOn: '["a"]', dueDate: '2026-07-25' }),
    task('c', { status: 'done', estHours: 2, assigneeId: 'user-2' }),
  ];
  const companyTasks = [...tasks, task('outside-1', { projectId: 'other', status: 'doing' }), task('outside-2', { projectId: 'other', status: 'review' })];
  const result = buildProjectExecutionHealth({
    project: PROJECT,
    tasks,
    companyTasks,
    timeLogs: [{ taskId: 'a', projectId: PROJECT.id, userId: 'user-1', hours: 3 }],
    usersById: { 'user-1': { name: 'An' }, 'user-2': { name: 'Bình' } },
    queueStates: [{ ownerId: 'user-1', wipLimit: 2 }],
    milestones: [{ name: 'Review', date: '2026-07-19', done: false }],
    today: '2026-07-20',
  });

  assert.equal(result.ruleVersion, PROJECT_EXECUTION_HEALTH_RULE_VERSION);
  assert.equal(result.health.level, 'red');
  assert.equal(result.delivery.blocked, 1);
  assert.equal(result.delivery.dependencyCycles, 2);
  assert.equal(result.delivery.overdueMilestones, 1);
  assert.equal(result.capacity.constrainedMembers, 1);
  assert.equal(result.policy.employeeRanking, false);
  assert.equal(result.resource.actualSource, 'declared_timelog');
  assert.equal(result.resource.actualIsObservedTruth, false);
});

test('capacity sắp theo tên để phục vụ điều phối, không tạo employee ranking', () => {
  const result = buildProjectExecutionHealth({
    project: PROJECT,
    tasks: [task('a', { assigneeId: 'z' }), task('b', { assigneeId: 'a' })],
    usersById: { z: { name: 'Zed' }, a: { name: 'An' } },
    queueStates: [{ ownerId: 'z', wipLimit: 5 }, { ownerId: 'a', wipLimit: 5 }],
    today: '2026-07-20',
  });
  assert.deepEqual(result.capacity.members.map((member) => member.name), ['An', 'Zed']);
  assert.equal(result.capacity.employeeRanking, false);
  assert.equal(Object.hasOwn(result.capacity.members[0], 'score'), false);
});

test('finance chỉ trả planning proxy có provenance, không nhận là accounting profit', () => {
  const invoice = {
    status: 'sent',
    items: JSON.stringify([{ qty: 1, price: 10_000_000 }]),
    vat: 10,
    payments: JSON.stringify([{ amount: 4_000_000 }]),
    fxRate: 1,
  };
  const result = buildProjectExecutionHealth({
    project: PROJECT,
    tasks: [task('a')],
    timeLogs: [{ taskId: 'a', projectId: PROJECT.id, userId: 'employee', hours: 8 }],
    usersById: { employee: { name: 'An', userType: 'employee', salary: 17_600_000 } },
    vendorBills: [{ amount: 2_000_000, status: 'paid' }],
    invoices: [invoice],
    canSeeMoney: true,
    today: '2026-07-20',
  });
  assert.equal(result.financial.laborAccrued, 800_000);
  assert.equal(result.financial.invoiced, 11_000_000);
  assert.equal(result.financial.collected, 4_000_000);
  assert.equal(result.financial.planningCostProxy, 2_800_000);
  assert.equal(result.financial.planningMarginProxy, 17_200_000);
  assert.equal(result.financial.isAccountingProfit, false);
  assert.equal(result.provenance.finance, 'planning_proxy_not_accounting_profit');
});

test('non-money read model không suy ra hay để lộ financial snapshot', () => {
  const result = buildProjectExecutionHealth({
    project: PROJECT,
    tasks: [task('a', { status: 'done' }), task('b', { status: 'merged' }), task('c')],
    vendorBills: [{ amount: 999_000_000, status: 'paid' }],
    invoices: [{ items: '[{"qty":1,"price":999000000}]', payments: '[]' }],
    canSeeMoney: false,
    today: '2026-07-20',
  });
  assert.equal(result.progress.basis, 'task_estimate');
  assert.equal(result.progress.percent, 67);
  assert.equal(result.financial, null);
  assert.equal(result.provenance.finance, 'withheld_by_authorization');
  assert.equal(result.health.confidence.ceiling, 'medium');
});
