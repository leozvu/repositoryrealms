import assert from 'node:assert/strict';
import test from 'node:test';
import {
  financialIntelligenceScope,
  loadFinancialOperatingIntelligence,
} from '../lib/financial-operating-intelligence-admin.js';

function database() {
  const calls = [];
  const read = (name, rows) => async (args) => { calls.push({ name, args }); return rows; };
  return {
    calls,
    db: {
      project: { findMany: read('project', [{ id: 'p1', name: 'Atlas', status: 'active', budget: 20_000_000 }]) },
      timeLog: { findMany: read('timeLog', [{ id: 'l1', userId: 'u1', projectId: 'p1', taskId: 't1', invoiceId: null, date: '2026-07-19', hours: 2, billable: true }]) },
      user: { findMany: read('user', [{ id: 'u1', userType: 'employee', salary: 17_600_000, hourlyRate: 0 }]) },
      invoice: { findMany: read('invoice', [{ id: 'i1', code: 'INV-1', projectId: 'p1', items: '[{"qty":1,"price":1000000}]', vat: 0, status: 'sent', date: '2026-07-01', dueDate: '2026-07-30', paidDate: null, payments: '[]', currency: 'VND', fxRate: 1 }]) },
      vendorBill: { findMany: read('vendorBill', []) },
      transaction: { findMany: read('transaction', []) },
      budget: { findMany: read('budget', []) },
      recurringExpense: { findMany: read('recurringExpense', []) },
    },
  };
}

test('Financial Intelligence chỉ mở company scope cho Accountant/Director', () => {
  assert.deepEqual(financialIntelligenceScope({ id: 'director', roles: ['DIRECTOR'] }), { kind: 'company' });
  assert.deepEqual(financialIntelligenceScope({ id: 'accountant', roles: ['ACCOUNTANT'] }), { kind: 'company' });
  assert.equal(financialIntelligenceScope({ id: 'pm', roles: ['PM'] }).code, 'financial_intelligence_scope_missing');
  assert.equal(financialIntelligenceScope({ id: 'free', userType: 'freelancer' }).code, 'financial_intelligence_freelancer_forbidden');
  assert.equal(financialIntelligenceScope(null).code, 'unauthorized');
});

test('server đọc canonical ERP stores và response không leak salary/rate', async () => {
  const { db, calls } = database();
  const result = await loadFinancialOperatingIntelligence(db, { id: 'accountant', roles: ['ACCOUNTANT'] }, new Date('2026-07-20T12:00:00.000Z'));
  assert.equal(result.source, 'canonical-erp-finance');
  assert.equal(result.scope.kind, 'company');
  assert.equal(result.financialIntelligence.summary.laborAccrued, 200_000);
  assert.equal(result.financialIntelligence.summary.invoiced, 1_000_000);
  assert.equal(result.financialIntelligence.policy.accountingProfit, false);
  assert.deepEqual(calls.map((row) => row.name).sort(), ['budget', 'invoice', 'project', 'recurringExpense', 'timeLog', 'transaction', 'user', 'vendorBill']);
  assert.equal(JSON.stringify(result).includes('17600000'), false);
  assert.equal(JSON.stringify(result).includes('salary'), false);
  assert.equal(JSON.stringify(result).includes('hourlyRate'), false);
});

test('server áp snapshot limits và chỉ lấy field cần thiết', async () => {
  const { db, calls } = database();
  await loadFinancialOperatingIntelligence(db, { id: 'director', roles: ['DIRECTOR'] }, new Date('2026-07-20T12:00:00.000Z'));
  const timeLog = calls.find((row) => row.name === 'timeLog').args;
  const users = calls.find((row) => row.name === 'user').args;
  assert.equal(timeLog.take, 50_000);
  assert.equal(timeLog.select.note, undefined);
  assert.equal(users.select.name, undefined);
  assert.equal(users.where.status, 'active');
});

test('anonymous, PM và freelancer bị chặn trước mọi database query', async () => {
  const db = { project: { findMany: async () => { throw new Error('must not query'); } } };
  await assert.rejects(loadFinancialOperatingIntelligence(db, null), (error) => error.status === 401 && error.code === 'unauthorized');
  await assert.rejects(loadFinancialOperatingIntelligence(db, { id: 'pm', roles: ['PM'] }), (error) => error.status === 403 && error.code === 'financial_intelligence_scope_missing');
  await assert.rejects(loadFinancialOperatingIntelligence(db, { id: 'free', userType: 'freelancer' }), (error) => error.status === 403 && error.code === 'financial_intelligence_freelancer_forbidden');
});
