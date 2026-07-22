import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProjectExecutionHealth } from '../lib/project-execution-health-admin.js';

const PROJECT = {
  id: 'project-1', name: 'Realm launch', clientId: 'client-1', service: 'Product',
  budget: 10_000_000, budgetHours: 40, status: 'active', startDate: '2026-07-01',
  deadline: '2026-07-31', progress: 0, autoProgress: true,
  client: { id: 'client-1', name: 'Egoric' },
};
const TASK = {
  id: 'task-1', projectId: PROJECT.id, phaseId: null, title: 'Build dashboard', status: 'doing',
  priority: 'high', dueDate: '2026-07-25', assigneeId: 'user-1', estHours: 8, dependsOn: '[]',
  workType: 'development', complexity: 'medium', workVersion: 1, blockReason: null,
  waitingReason: null, escalationLevel: 0, completedAt: null,
};

function database({ project = PROJECT } = {}) {
  const calls = { vendor: 0, invoice: 0 };
  const db = {
    project: { findUnique: async () => project },
    task: { findMany: async ({ where }) => {
      if (where?.projectId === PROJECT.id) return [TASK];
      if (where?.assigneeId) return [TASK];
      return [];
    } },
    timeLog: { findMany: async () => [{ id: 'log-1', taskId: TASK.id, projectId: PROJECT.id, userId: 'user-1', date: '2026-07-20', hours: 2, billable: true, invoiceId: null }] },
    phase: { findMany: async () => [] },
    milestone: { findMany: async () => [] },
    vendorBill: { findMany: async () => { calls.vendor += 1; return [{ amount: 100_000, status: 'paid' }]; } },
    invoice: { findMany: async () => { calls.invoice += 1; return []; } },
    user: { findMany: async () => [{ id: 'user-1', name: 'An', title: 'Developer', teamId: 'team-1', userType: 'employee', salary: 17_600_000, hourlyRate: 0 }] },
    workQueueState: { findMany: async () => [{ ownerId: 'user-1', version: 1, wipLimit: 5 }] },
  };
  return { db, calls };
}

const identityEnricher = async (_db, tasks) => ({ tasks, summary: {} });

test('Project read model dùng ERP records, aggregate salary server-side và không leak salary', async () => {
  const { db, calls } = database();
  const result = await loadProjectExecutionHealth(db, {
    id: 'director-1', name: 'Director', role: 'DIRECTOR', roles: '["DIRECTOR"]', userType: 'employee',
  }, PROJECT.id, new Date('2026-07-20T12:00:00.000Z'), { enricher: identityEnricher });

  assert.equal(result.source, 'canonical-erp-project');
  assert.equal(result.canSeeMoney, true);
  assert.equal(result.executionHealth.financial.laborAccrued, 200_000);
  assert.equal(result.executionHealth.policy.employeeRanking, false);
  assert.equal(JSON.stringify(result).includes('17600000'), false);
  assert.equal(JSON.stringify(result).includes('salary'), false);
  assert.equal(calls.vendor, 1);
  assert.equal(calls.invoice, 1);
});

test('Staff nhận Execution Health nhưng finance bị chặn từ query tới response', async () => {
  const { db, calls } = database();
  const result = await loadProjectExecutionHealth(db, {
    id: 'staff-1', name: 'Staff', role: 'STAFF', roles: '["STAFF"]', userType: 'employee',
  }, PROJECT.id, new Date('2026-07-20T12:00:00.000Z'), { enricher: identityEnricher });

  assert.equal(result.canSeeMoney, false);
  assert.equal(result.executionHealth.financial, null);
  assert.equal(result.executionHealth.provenance.finance, 'withheld_by_authorization');
  assert.equal(calls.vendor, 0);
  assert.equal(calls.invoice, 0);
});

test('Project read model fail-closed cho anonymous, freelancer, ID lỗi và missing Project', async () => {
  const { db } = database();
  await assert.rejects(loadProjectExecutionHealth(db, null, PROJECT.id, new Date(), { enricher: identityEnricher }), (error) => error.code === 'unauthorized');
  await assert.rejects(loadProjectExecutionHealth(db, { id: 'free', userType: 'freelancer' }, PROJECT.id, new Date(), { enricher: identityEnricher }), (error) => error.code === 'project_execution_freelancer_forbidden');
  await assert.rejects(loadProjectExecutionHealth(db, { id: 'staff', userType: 'employee' }, '../bad', new Date(), { enricher: identityEnricher }), (error) => error.code === 'project_execution_project_id_invalid');
  const missing = database({ project: null });
  await assert.rejects(loadProjectExecutionHealth(missing.db, { id: 'staff', userType: 'employee' }, PROJECT.id, new Date(), { enricher: identityEnricher }), (error) => error.code === 'project_execution_not_found');
});
