import test from 'node:test';
import assert from 'node:assert/strict';
import { amountInVnd, transactionAmountVnd } from '../lib/money.js';
import { financialConversionIssues, invoiceCollectedVnd, invoiceReceivableVnd, invoiceSubtotalVnd, invoiceVatVnd, transactionTotalsVnd } from '../lib/financial-reporting.js';
import { cashBalanceAsOf, cashFlow, incomeStatement, periodMatch } from '../lib/financials.js';

const transactions = [
  { type: 'income', category: 'Dịch vụ', amount: 100, currency: 'USD', fxRate: 25_000, date: '2026-09-01' },
  { type: 'income', category: 'Dịch vụ', amount: 50, currency: 'EUR', fxRate: 30_000, date: '2026-09-02' },
  { type: 'income', category: 'Dịch vụ', amount: 200_000, currency: 'VND', fxRate: 99, date: '2026-09-03' },
  { type: 'expense', category: 'Công cụ', amount: 20, currency: 'USD', fxRate: 25_000, date: '2026-09-02' },
  { type: 'expense', category: 'Công cụ', amount: 10, currency: 'EUR', fxRate: 30_000, date: '2026-09-02' },
  { type: 'expense', category: 'Khác', amount: 100_000, date: '2026-09-03' },
];

test('USD/EUR/VND use recorded rates and never reconvert VND or legacy VND rows', () => {
  assert.equal(amountInVnd(1.25, 'USD', 25_123.4), 31_404);
  assert.equal(amountInVnd(10, 'EUR', 30_000), 300_000);
  assert.equal(amountInVnd(200_000, 'VND', 99), 200_000);
  assert.equal(transactionAmountVnd({ amount: 200_000, fxRate: 99 }), 200_000);
  assert.equal(amountInVnd(-10, 'EUR', 30_000), -300_000);
});

test('cash summary, statements and category buckets reconcile for mixed currencies', () => {
  const expected = { income: 4_200_000, expense: 900_000, balance: 3_300_000 };
  assert.deepEqual(transactionTotalsVnd(transactions), expected);
  const match = periodMatch({ year: 2026, month: 9 });
  const cash = cashFlow(transactions, match);
  const income = incomeStatement(transactions, match);
  assert.equal(cash.totalIn, expected.income);
  assert.equal(cash.totalOut, expected.expense);
  assert.equal(cash.net, expected.balance);
  assert.deepEqual(cash.outflows, [{ cat: 'Công cụ', amount: 800_000 }, { cat: 'Khác', amount: 100_000 }]);
  assert.equal(income.netProfit, expected.balance);
  assert.equal(income.totalRevenue, expected.income);
  assert.equal(income.totalExpense, expected.expense);
  assert.equal(cashBalanceAsOf(transactions, '2026-09-01'), 2_500_000);
  assert.equal(cashBalanceAsOf(transactions, '2026-09-30'), expected.balance);
});

test('receivables retain invoice rate, collections retain receipt rates, legacy receipts fall back explicitly', () => {
  const invoice = { currency: 'EUR', fxRate: 30_000, vat: 10, items: '[{"qty":1,"price":100}]', payments: '[{"amount":20,"currency":"EUR","fxRate":31000},{"amount":10}]' };
  assert.equal(invoiceReceivableVnd(invoice), 2_400_000);
  assert.equal(invoiceCollectedVnd(invoice), 920_000);
  assert.equal(invoiceSubtotalVnd(invoice), 3_000_000);
  assert.equal(invoiceVatVnd(invoice), 300_000);
  const vnd = { ...invoice, currency: 'VND', payments: '[{"amount":20,"currency":"VND","fxRate":900}]' };
  assert.equal(invoiceReceivableVnd(vnd), 90);
  assert.equal(invoiceCollectedVnd(vnd), 20);
  assert.equal(invoiceVatVnd(vnd), 10);
  assert.equal(invoiceVatVnd({ ...invoice, vat: 0, items: '[{"qty":0.015,"price":100}]' }), 0);
});

test('missing/invalid foreign rates fail closed instead of inventing parity or partial totals', () => {
  for (const fxRate of [undefined, null, 0, -1, Infinity, NaN, 'not-a-rate', true, false]) {
    assert.throws(() => amountInVnd(100, 'USD', fxRate), RangeError);
  }
  for (const value of [undefined, null, '', true, false, Infinity]) assert.throws(() => amountInVnd(value, 'VND', 1), RangeError);
  assert.equal(amountInVnd(0, 'VND', 1), 0, 'an explicit zero amount is valid');
  assert.throws(() => transactionTotalsVnd([...transactions, { type: 'income', amount: 100, currency: 'EUR' }]), RangeError);
  const input = {
    transactions: [{ id: 'missing-rate', amount: 100, currency: 'USD' }],
    invoices: [{ id: 'bad-receipt', status: 'sent', items: '[]', currency: 'EUR', fxRate: 30_000, payments: '[{"amount":1,"fxRate":0}]' }, { id: 'draft', status: 'draft', currency: 'USD' }],
    shipments: [{ id: 'shipment', status: 'shipped', amount: 100, currency: 'EUR', fxRate: 0 }],
  };
  const before = structuredClone(input);
  assert.deepEqual(financialConversionIssues(input), [
    { resource: 'transactions', id: 'missing-rate', currency: 'USD' },
    { resource: 'invoices', id: 'bad-receipt', currency: 'EUR' },
    { resource: 'shipments', id: 'shipment', currency: 'EUR' },
  ]);
  assert.deepEqual(input, before);
});
