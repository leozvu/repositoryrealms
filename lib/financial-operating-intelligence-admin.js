import { buildFinancialOperatingIntelligence } from './financial-operating-intelligence.js';
import { hasAny, isFreelancer } from './perm.js';
import { RealmOperationError } from './realm-operation.js';

function fail(message, status, code) {
  throw new RealmOperationError(message, status, code);
}

export function financialIntelligenceScope(user) {
  if (!user?.id) return { kind: 'none', code: 'unauthorized' };
  if (isFreelancer(user)) return { kind: 'none', code: 'financial_intelligence_freelancer_forbidden' };
  if (hasAny(user, ['ACCOUNTANT'])) return { kind: 'company' };
  return { kind: 'none', code: 'financial_intelligence_scope_missing' };
}

export async function loadFinancialOperatingIntelligence(db, user, now = new Date()) {
  const scope = financialIntelligenceScope(user);
  if (scope.code === 'unauthorized') fail('Bạn cần đăng nhập ERP.', 401, scope.code);
  if (scope.kind === 'none') fail(
    scope.code === 'financial_intelligence_freelancer_forbidden'
      ? 'Freelancer không được truy cập Financial Intelligence nội bộ.'
      : 'Financial Intelligence chỉ dành cho Accountant và Director.',
    403,
    scope.code,
  );

  const [projects, timeLogs, users, invoices, vendorBills, transactions, budgets, recurringExpenses] = await Promise.all([
    db.project.findMany({
      select: { id: true, name: true, status: true, budget: true },
      orderBy: { name: 'asc' },
      take: 5000,
    }),
    db.timeLog.findMany({
      select: { id: true, userId: true, projectId: true, taskId: true, invoiceId: true, date: true, hours: true, billable: true },
      orderBy: { date: 'desc' },
      take: 50_000,
    }),
    db.user.findMany({
      where: { status: 'active' },
      select: { id: true, userType: true, salary: true, hourlyRate: true },
      take: 5000,
    }),
    db.invoice.findMany({
      select: {
        id: true, code: true, projectId: true, items: true, vat: true, status: true,
        date: true, dueDate: true, paidDate: true, payments: true, currency: true, fxRate: true,
      },
      orderBy: { date: 'desc' },
      take: 20_000,
    }),
    db.vendorBill.findMany({
      select: { id: true, code: true, projectId: true, amount: true, date: true, dueDate: true, status: true, paidDate: true },
      orderBy: { date: 'desc' },
      take: 20_000,
    }),
    db.transaction.findMany({
      select: { id: true, type: true, category: true, amount: true, currency: true, fxRate: true, date: true, projectId: true },
      orderBy: { date: 'desc' },
      take: 50_000,
    }),
    db.budget.findMany({
      select: { id: true, month: true, category: true, amount: true },
      orderBy: [{ month: 'desc' }, { category: 'asc' }],
      take: 10_000,
    }),
    db.recurringExpense.findMany({
      where: { active: true },
      select: { id: true, category: true, amount: true, dayOfMonth: true, active: true },
      orderBy: { category: 'asc' },
      take: 5000,
    }),
  ]);
  const usersById = Object.fromEntries(users.map((row) => [row.id, row]));
  const financialIntelligence = buildFinancialOperatingIntelligence({
    projects,
    timeLogs,
    usersById,
    invoices,
    vendorBills,
    transactions,
    budgets,
    recurringExpenses,
    today: now.toISOString().slice(0, 10),
  });

  return Object.freeze({
    source: 'canonical-erp-finance',
    generatedAt: now.toISOString(),
    scope: Object.freeze({ kind: scope.kind }),
    financialIntelligence,
    limits: Object.freeze({
      projectSnapshot: 5000,
      timeLogSnapshot: 50_000,
      invoiceSnapshot: 20_000,
      vendorBillSnapshot: 20_000,
      transactionSnapshot: 50_000,
      projectSnapshotTruncated: projects.length >= 5000,
      timeLogSnapshotTruncated: timeLogs.length >= 50_000,
      invoiceSnapshotTruncated: invoices.length >= 20_000,
      vendorBillSnapshotTruncated: vendorBills.length >= 20_000,
      transactionSnapshotTruncated: transactions.length >= 50_000,
    }),
  });
}
