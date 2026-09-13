import test from 'node:test';
import assert from 'node:assert/strict';
import { receiveInvoicePayment, settleVendorPayment, settleVendorPaymentInTransaction, requestVendorPayment, requirePaymentKey, vendorPaymentRequest } from '../lib/financial-payment-command.js';
import { paymentAttempt } from '../lib/payment-attempt.js';
import { transactionAmountVnd } from '../lib/money.js';
import { createPaymentDb, INVOICE, BILL } from './helpers/financial-payment-db.mjs';

const ACCOUNTANT = { id: 'accountant', name: 'Accountant', roles: ['ACCOUNTANT'] };
const DIRECTOR = { id: 'director', name: 'Director', roles: ['DIRECTOR'] };
const STAFF = { id: 'staff', roles: ['STAFF'] };
const command = (amount = 100, key = 'payment_key_00001') => ({ recordId: INVOICE.id, amount, date: '2026-09-08', note: '', idempotencyKey: key });
const vendor = (key = 'vendor_payment_0001') => ({ recordId: BILL.id, date: '2026-09-08', idempotencyKey: key });
const errorCode = code => error => error?.code === code;

test('invoice receipt keeps native amount/currency/rate and retry creates no second ledger entry', async () => {
  const memory = createPaymentDb({ invoice: [INVOICE] });
  const first = await receiveInvoicePayment(memory.db, ACCOUNTANT, command());
  const second = await receiveInvoicePayment(memory.db, ACCOUNTANT, command());
  const state = memory.state();
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(first.record, second.record);
  assert.equal(state.transaction.length, 1);
  assert.equal(state.auditLog.length, 1);
  assert.equal(state.financialPaymentReceipt.length, 1);
  assert.equal(state.eventOutbox.length, 2);
  assert.deepEqual([state.transaction[0].amount, state.transaction[0].currency, state.transaction[0].fxRate], [100, 'USD', 25000]);
  assert.equal(transactionAmountVnd(state.transaction[0]), 2500000);
  assert.equal(JSON.parse(state.invoice[0].payments)[0].fxRate, 25000);
});

test('same idempotency key with changed content conflicts without mutating cash', async () => {
  const memory = createPaymentDb({ invoice: [INVOICE] });
  await receiveInvoicePayment(memory.db, ACCOUNTANT, command(40));
  await assert.rejects(receiveInvoicePayment(memory.db, ACCOUNTANT, command(60)), errorCode('payment_idempotency_conflict'));
  assert.equal(memory.state().transaction.length, 1);
});

test('two concurrent copies of one invoice request replay one durable result', async () => {
  const memory = createPaymentDb({ invoice: [INVOICE] });
  const results = await Promise.all([receiveInvoicePayment(memory.db, ACCOUNTANT, command()), receiveInvoicePayment(memory.db, ACCOUNTANT, command())]);
  assert.equal(results.filter(result => result.replayed).length, 1);
  assert.ok(memory.stats.conflicts >= 1, 'the test must actually exercise a concurrent commit conflict');
  assert.equal(memory.state().transaction.length, 1);
  assert.equal(JSON.parse(memory.state().invoice[0].payments).length, 1);
});

test('independent concurrent partial receipts preserve both history entries and their sum', async () => {
  const memory = createPaymentDb({ invoice: [INVOICE] });
  await Promise.all([receiveInvoicePayment(memory.db, ACCOUNTANT, command(40)), receiveInvoicePayment(memory.db, ACCOUNTANT, command(60, 'payment_key_00002'))]);
  const state = memory.state();
  assert.equal(state.invoice[0].status, 'paid');
  assert.equal(JSON.parse(state.invoice[0].payments).length, 2);
  assert.equal(state.transaction.reduce((sum, row) => sum + row.amount, 0), 100);
  assert.equal(state.financialPaymentReceipt.length, 2);
});

test('different concurrent keys cannot both spend the same invoice balance', async () => {
  const memory = createPaymentDb({ invoice: [INVOICE] });
  const outcomes = await Promise.allSettled([receiveInvoicePayment(memory.db, ACCOUNTANT, command(70)), receiveInvoicePayment(memory.db, ACCOUNTANT, command(70, 'payment_key_00002'))]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'payment_exceeds_balance');
  assert.equal(memory.state().transaction.reduce((sum, row) => sum + row.amount, 0), 70);
});

test('receipt failure rolls back document, ledger and audit, then unchanged retry succeeds', async () => {
  const memory = createPaymentDb({ invoice: [INVOICE] }, { receiptFailureOnce: true });
  await assert.rejects(receiveInvoicePayment(memory.db, ACCOUNTANT, command()), /receipt storage failure/);
  assert.equal(memory.state().invoice[0].payments, '[]');
  assert.equal(memory.state().transaction.length, 0);
  assert.equal(memory.state().auditLog.length, 0);
  await receiveInvoicePayment(memory.db, ACCOUNTANT, command());
  assert.equal(memory.state().transaction.length, 1);
});

test('CAS miss retries from fresh state and never leaves an orphan cash entry', async () => {
  const memory = createPaymentDb({ invoice: [INVOICE] }, { casMissOnce: true });
  await receiveInvoicePayment(memory.db, ACCOUNTANT, command());
  assert.equal(memory.stats.casMisses, 1);
  assert.equal(memory.state().transaction.length, 1);
});

test('outbox failure rolls back payment receipt and cash; unchanged retry enqueues only once', async () => {
  const memory = createPaymentDb({ invoice: [INVOICE] }, { outboxFailureOnce: true });
  await assert.rejects(receiveInvoicePayment(memory.db, ACCOUNTANT, command()), /outbox storage failure/);
  assert.equal(memory.state().invoice[0].payments, '[]');
  assert.equal(memory.state().transaction.length, 0);
  assert.equal(memory.state().financialPaymentReceipt.length, 0);
  assert.equal(memory.state().eventOutbox.length, 0);
  await receiveInvoicePayment(memory.db, ACCOUNTANT, command());
  await receiveInvoicePayment(memory.db, ACCOUNTANT, command());
  assert.equal(memory.state().transaction.length, 1);
  assert.equal(memory.state().eventOutbox.length, 2);
});

test('malformed history, invalid currency rate and invalid integer amounts fail closed', async () => {
  for (const [change, code] of [[{ payments: '{broken' }, 'payment_history_invalid'], [{ payments: '[{"amount":-10}]' }, 'payment_history_invalid'], [{ fxRate: 0 }, 'payment_currency_invalid']]) {
    const memory = createPaymentDb({ invoice: [{ ...INVOICE, ...change }] });
    await assert.rejects(receiveInvoicePayment(memory.db, ACCOUNTANT, command()), errorCode(code));
    assert.equal(memory.state().transaction.length, 0);
  }
  for (const amount of [0, -1, 1.5, Infinity, 2147483648, true, {}, [1]]) {
    assert.throws(() => receiveInvoicePayment(createPaymentDb().db, ACCOUNTANT, command(amount)), errorCode('payment_amount_invalid'));
  }
});

test('vendor duplicate/different-key races post only one expense', async () => {
  for (const same of [true, false]) {
    const memory = createPaymentDb({ vendorBill: [BILL] });
    const results = await Promise.allSettled([settleVendorPayment(memory.db, ACCOUNTANT, vendor()), settleVendorPayment(memory.db, ACCOUNTANT, vendor(same ? 'vendor_payment_0001' : 'vendor_payment_0002'))]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, same ? 2 : 1);
    assert.equal(memory.state().transaction.length, 1);
    assert.equal(memory.state().vendorBill[0].status, 'paid');
  }
});

test('vendor threshold and approval snapshots are rechecked inside the transaction', async () => {
  const large = { ...BILL, amount: 20000000 };
  const memory = createPaymentDb({ vendorBill: [large] });
  await assert.rejects(settleVendorPayment(memory.db, ACCOUNTANT, vendor()), errorCode('payment_approval_required'));
  const stale = createPaymentDb({ vendorBill: [large], approval: [{ id: 'approval-1', type: 'vendorbill', refId: BILL.id, status: 'approved', amount: 10000000, payload: '{}' }] });
  await assert.rejects(settleVendorPayment(stale.db, ACCOUNTANT, { ...vendor(), approvalId: 'approval-1' }), errorCode('payment_approval_stale'));
  assert.equal(stale.state().transaction.length, 0);
  await settleVendorPayment(memory.db, DIRECTOR, vendor());
  assert.equal(memory.state().transaction.length, 1);
});

test('approval decision and vendor cash effect commit together; retries by another approver reuse its receipt', async () => {
  const approval = { id: 'approval-1', type: 'vendorbill', refId: BILL.id, status: 'pending', amount: BILL.amount, payload: JSON.stringify({ billSnapshot: { vendorId: BILL.vendorId, projectId: null, amount: BILL.amount, date: BILL.date, code: BILL.code } }) };
  const memory = createPaymentDb({ vendorBill: [BILL], approval: [approval] });
  const input = { ...vendor('approval_approval-1'), approvalId: approval.id };
  await memory.db.$transaction(async tx => {
    await tx.approval.updateMany({ where: { id: approval.id, status: 'pending' }, data: { status: 'approved' } });
    return settleVendorPaymentInTransaction(tx, ACCOUNTANT, input);
  }, { isolationLevel: 'Serializable' });
  const replay = await settleVendorPayment(memory.db, DIRECTOR, input);
  assert.equal(replay.replayed, true);
  assert.equal(memory.state().approval[0].status, 'approved');
  assert.equal(memory.state().transaction.length, 1);
});

test('failed approval cash effect leaves the approval pending and has no partial writes', async () => {
  const memory = createPaymentDb({ vendorBill: [BILL], approval: [{ id: 'approval-1', type: 'vendorbill', refId: BILL.id, status: 'pending', amount: BILL.amount, payload: '{}' }] }, { receiptFailureOnce: true });
  await assert.rejects(memory.db.$transaction(async tx => {
    await tx.approval.updateMany({ where: { id: 'approval-1' }, data: { status: 'approved' } });
    return settleVendorPaymentInTransaction(tx, ACCOUNTANT, { ...vendor('approval_approval-1'), approvalId: 'approval-1' });
  }, { isolationLevel: 'Serializable' }), /receipt storage failure/);
  assert.equal(memory.state().approval[0].status, 'pending');
  assert.equal(memory.state().vendorBill[0].status, 'pending');
  assert.equal(memory.state().transaction.length, 0);
});

test('client attempts reuse a key across unchanged retries, require keys for old callers, and reject staff', () => {
  const first = paymentAttempt(null, { amount: 40 }, () => 'payment_key_00001');
  assert.equal(paymentAttempt(first, { amount: 40 }, () => { throw new Error('must reuse'); }).key, first.key);
  assert.equal(paymentAttempt(first, { amount: 60 }, () => 'payment_key_00002').key, 'payment_key_00002');
  assert.throws(() => requirePaymentKey(null), errorCode('payment_idempotency_required'));
  assert.throws(() => receiveInvoicePayment(createPaymentDb().db, STAFF, command()), errorCode('forbidden'));
  assert.throws(() => vendorPaymentRequest(ACCOUNTANT, BILL.id, 'vendor_payment_0001', '2026-02-30'), errorCode('payment_date_invalid'));
});

test('concurrent vendor requests open one pending approval and replay its identifier', async () => {
  const memory = createPaymentDb({ vendorBill: [{ ...BILL, amount: 20000000 }] });
  const actor = { id: 'pm', name: 'PM', roles: ['PM'] };
  const results = await Promise.all([requestVendorPayment(memory.db, actor, vendor()), requestVendorPayment(memory.db, actor, vendor())]);
  assert.equal(results[0].approval.id, results[1].approval.id);
  assert.ok(results.every(result => result.pending));
  assert.equal(memory.state().approval.length, 1);
  assert.equal(memory.state().transaction.length, 0);
});

test('auto-approved vendor requests commit approval, receipt and cash once', async () => {
  const memory = createPaymentDb({ vendorBill: [{ ...BILL, amount: 20000000 }] });
  const results = await Promise.all([requestVendorPayment(memory.db, ACCOUNTANT, vendor()), requestVendorPayment(memory.db, ACCOUNTANT, vendor())]);
  assert.ok(results.every(result => !result.pending));
  assert.equal(results.filter(result => result.payment.replayed).length, 1);
  assert.equal(memory.state().approval.length, 1);
  assert.equal(memory.state().approval[0].status, 'approved');
  assert.equal(memory.state().transaction.length, 1);
});

test('failed auto-approved vendor receipt rolls back the new approval as well', async () => {
  const memory = createPaymentDb({ vendorBill: [{ ...BILL, amount: 20000000 }] }, { receiptFailureOnce: true });
  await assert.rejects(requestVendorPayment(memory.db, ACCOUNTANT, vendor()), /receipt storage failure/);
  assert.equal(memory.state().approval.length, 0);
  assert.equal(memory.state().transaction.length, 0);
  assert.equal(memory.state().vendorBill[0].status, 'pending');
  await requestVendorPayment(memory.db, ACCOUNTANT, vendor());
  assert.equal(memory.state().approval.length, 1);
  assert.equal(memory.state().transaction.length, 1);
});

test('large vendor request preserves the Director approval step and rejects changed-key content', async () => {
  const memory = createPaymentDb({ vendorBill: [{ ...BILL, amount: 60000000 }] });
  const result = await requestVendorPayment(memory.db, ACCOUNTANT, vendor());
  assert.equal(result.pending, true);
  assert.equal(JSON.parse(result.approval.steps).find(step => step.role === 'DIRECTOR').status, 'pending');
  await assert.rejects(requestVendorPayment(memory.db, ACCOUNTANT, { ...vendor(), date: '2026-09-09' }), errorCode('payment_idempotency_conflict'));
  assert.equal(memory.state().transaction.length, 0);
});
