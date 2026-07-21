import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFinancialOperatingIntelligence,
  FINANCIAL_INTELLIGENCE_RULE_VERSION,
} from '../lib/financial-operating-intelligence.js';

const TODAY = '2026-07-20';

function fixture(overrides = {}) {
  return buildFinancialOperatingIntelligence({
    projects: [{ id: 'p1', name: 'Atlas', status: 'active', budget: 20_000_000 }],
    usersById: {
      employee: { userType: 'employee', salary: 17_600_000, hourlyRate: 0 },
      freelancer: { userType: 'freelancer', salary: 0, hourlyRate: 200_000 },
    },
    timeLogs: [
      { id: 'l1', userId: 'employee', projectId: 'p1', taskId: 't1', invoiceId: null, hours: 10, billable: true },
      { id: 'l2', userId: 'freelancer', projectId: 'p1', taskId: 't2', invoiceId: 'i1', hours: 2, billable: true },
    ],
    invoices: [{
      id: 'i1', code: 'INV-1', projectId: 'p1', items: '[{"qty":1,"price":10000000}]',
      vat: 10, status: 'sent', date: '2026-07-01', dueDate: '2026-07-10',
      payments: '[{"amount":4000000}]', fxRate: 1,
    }],
    vendorBills: [{ id: 'v1', code: 'VB-1', projectId: 'p1', amount: 2_000_000, status: 'approved', dueDate: '2026-07-15' }],
    transactions: [
      { id: 'tx1', type: 'income', amount: 4_000_000, fxRate: 1, date: '2026-07-10' },
      { id: 'tx2', type: 'expense', category: 'Tools', amount: 2_000_000, fxRate: 1, date: '2026-07-11' },
    ],
    budgets: [{ id: 'b1', month: '2026-07', category: 'Tools', amount: 2_500_000 }],
    recurringExpenses: [{ id: 'r1', category: 'Office', amount: 500_000, active: true }],
    today: TODAY,
    ...overrides,
  });
}

test('nối TimeLog → cost → Invoice → margin nhưng không nhận là accounting profit', () => {
  const result = fixture();
  assert.equal(result.ruleVersion, FINANCIAL_INTELLIGENCE_RULE_VERSION);
  assert.equal(result.summary.cashBalance, 2_000_000);
  assert.equal(result.summary.invoiced, 11_000_000);
  assert.equal(result.summary.collected, 4_000_000);
  assert.equal(result.summary.receivable, 7_000_000);
  assert.equal(result.summary.laborAccrued, 1_400_000);
  assert.equal(result.summary.operatingCostProxy, 3_400_000);
  assert.equal(result.summary.operatingMarginProxy, 7_600_000);
  assert.equal(result.summary.unbilledBillableHours, 10);
  assert.equal(result.summary.isAccountingProfit, false);
  assert.equal(result.provenance.laborCost, 'declared_timelog_x_current_rate_not_payroll');
  assert.equal(result.provenance.activityIsObservedTruth, false);
});

test('manager queue nêu công nợ, giờ chưa bill và budget bằng nguồn giải thích', () => {
  const result = fixture();
  assert.equal(result.managerQueue.some((row) => row.id === 'receivable-overdue:i1'), true);
  assert.equal(result.managerQueue.some((row) => row.id === 'payable-overdue:v1'), true);
  assert.equal(result.managerQueue.some((row) => row.id === 'unbilled-hours:p1'), true);
  assert.equal(result.currentMonthBudget.rows[0].band, 'near');
  assert.equal(result.cashForecast.length, 3);
  assert.equal(result.cashForecast[0].closingBalance, 7_000_000);
  assert.equal(result.cashForecast[1].futureRecurringTemplates, 500_000);
});

test('invoice JSON hỏng fail-closed và không được cộng doanh thu giả', () => {
  const result = fixture({
    invoices: [{ id: 'broken', code: 'INV-BROKEN', projectId: 'p1', items: '{bad', payments: '[]', status: 'sent' }],
  });
  assert.equal(result.summary.invoiced, 0);
  assert.equal(result.dataQuality.malformedInvoices, 1);
  assert.equal(result.managerQueue[0].id, 'invoice-data:broken');
  assert.equal(result.managerQueue[0].severity, 'critical');
});

test('project economics sắp theo tên, không tạo employee ranking hay individual profitability', () => {
  const result = fixture({
    projects: [
      { id: 'z', name: 'Zulu', status: 'active', budget: 1 },
      { id: 'a', name: 'Alpha', status: 'active', budget: 1 },
    ],
    timeLogs: [], invoices: [], vendorBills: [], transactions: [], budgets: [], recurringExpenses: [],
  });
  assert.deepEqual(result.projects.map((row) => row.name), ['Alpha', 'Zulu']);
  assert.equal(result.policy.employeeRanking, false);
  assert.equal(result.policy.individualProfitability, false);
  assert.equal(result.policy.automaticPayment, false);
  assert.equal(JSON.stringify(result).includes('salary'), false);
});
