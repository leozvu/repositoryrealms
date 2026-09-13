import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { receiveInvoicePayment, requestVendorPayment, settleVendorPayment, settleVendorPaymentInTransaction } from '../lib/financial-payment-command.js';
import { transactionAmountVnd } from '../lib/money.js';

// Deliberately opt-in: never load .env or fall back to the application's database.
// Apply migrations to a disposable local codex_payment_test* database first.
const databaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;
function assertDisposable(url) {
  const parsed = new URL(url);
  assert.ok(['postgresql:', 'postgres:'].includes(parsed.protocol), 'PostgreSQL is required');
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname), 'Only a local disposable database is allowed');
  assert.match(decodeURIComponent(parsed.pathname), /^\/codex_payment_test(?:_[a-zA-Z0-9_-]+)?$/, 'Database name must start with codex_payment_test');
}

// Force the first two document reads to finish before either can update. The
// writes below therefore exercise PostgreSQL serialization, not merely retry
// two already sequential requests. Later reads/retries proceed normally.
function concurrentReads(db, model) {
  let reads = 0;
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  return {
    $transaction(work, options) {
      return db.$transaction(tx => work(new Proxy(tx, {
        get(target, property) {
          if (property !== model) return target[property];
          return new Proxy(target[property], {
            get(delegate, method) {
              if (method !== 'findUnique') return delegate[method];
              return async args => {
                const record = await delegate.findUnique(args);
                reads += 1;
                if (reads <= 2) {
                  if (reads === 2) release();
                  await barrier;
                }
                return record;
              };
            },
          });
        },
      })), { ...options, timeout: 15000 });
    },
  };
}

function failReceipt(tx) {
  return new Proxy(tx, {
    get(target, property) {
      if (property !== 'financialPaymentReceipt') return target[property];
      return new Proxy(target[property], {
        get(delegate, method) {
          if (method === 'create') return async () => { throw new Error('injected receipt failure after ledger write'); };
          return delegate[method];
        },
      });
    },
  });
}

test('PostgreSQL payment concurrency, durable replay, currency and rollback', { skip: !databaseUrl, timeout: 120000 }, async t => {
  assertDisposable(databaseUrl);
  const { PrismaClient } = await import('@prisma/client');
  const { interceptWrite } = await import('../lib/approvals.js');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const run = `payment-test-${randomUUID()}`;
  const actor = { id: `${run}-accountant`, name: 'Disposable payment test', roles: ['ACCOUNTANT'] };
  const director = { id: `${run}-director`, name: 'Disposable director', roles: ['DIRECTOR'] };
  const clientId = `${run}-client`;
  const vendorId = `${run}-vendor`;
  const invoiceIds = [];
  const billIds = [];
  const quoteIds = [];
  const actorIds = [actor.id, director.id];
  let counter = 0;
  const input = (recordId, amount, key = randomUUID()) => ({ recordId, amount, date: '2026-09-08', note: 'Disposable integration test', idempotencyKey: key });
  async function invoice() {
    const id = `${run}-invoice-${++counter}`;
    invoiceIds.push(id);
    return db.invoice.create({ data: { id, code: id, clientId, date: '2026-09-01', items: JSON.stringify([{ name: 'Service', qty: 1, price: 100 }]), vat: 0, currency: 'USD', fxRate: 25000 } });
  }
  async function bill(amount = 100000) {
    const id = `${run}-bill-${++counter}`;
    billIds.push(id);
    return db.vendorBill.create({ data: { id, code: id, vendorId, amount, date: '2026-09-01' } });
  }
  const receiptsFor = recordId => db.financialPaymentReceipt.findMany({ where: { recordId }, include: { transaction: true } });

  try {
    await db.$connect();
    await db.client.create({ data: { id: clientId, name: 'Disposable payment test client' } });
    await db.vendor.create({ data: { id: vendorId, name: 'Disposable payment test vendor' } });

    await t.test('concurrent same-key requests commit one native USD ledger entry and a durable replay', async () => {
      const doc = await invoice();
      const command = input(doc.id, 100);
      const gated = concurrentReads(db, 'invoice');
      const results = await Promise.all([receiveInvoicePayment(gated, actor, command), receiveInvoicePayment(gated, actor, command)]);
      assert.equal(results.filter(result => result.replayed).length, 1);
      const receipts = await receiptsFor(doc.id);
      assert.equal(receipts.length, 1);
      assert.equal(await db.eventOutbox.count({ where: { payload: { contains: doc.id } } }), 2);
      assert.deepEqual([receipts[0].transaction.amount, receipts[0].transaction.currency, receipts[0].transaction.fxRate], [100, 'USD', 25000]);
      assert.equal(transactionAmountVnd(receipts[0].transaction), 2500000);
      const freshClient = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      try {
        const replay = await receiveInvoicePayment(freshClient, actor, command);
        assert.equal(replay.replayed, true);
        assert.equal(replay.receipt.transactionId, receipts[0].transactionId);
      } finally { await freshClient.$disconnect(); }
      await assert.rejects(receiveInvoicePayment(db, actor, { ...command, amount: 99 }), error => error.code === 'payment_idempotency_conflict');
      await assert.rejects(db.transaction.delete({ where: { id: receipts[0].transactionId } }), error =>
        error.code === 'P2003' || /23001[\s\S]*FinancialPaymentReceipt_transactionId_fkey/.test(error.message));
      assert.ok(await db.transaction.findUnique({ where: { id: receipts[0].transactionId } }));
    });

    await t.test('two independent partial receipts preserve both payments and the exact total', async () => {
      const doc = await invoice();
      const gated = concurrentReads(db, 'invoice');
      await Promise.all([receiveInvoicePayment(gated, actor, input(doc.id, 40)), receiveInvoicePayment(gated, actor, input(doc.id, 60))]);
      const saved = await db.invoice.findUnique({ where: { id: doc.id } });
      const receipts = await receiptsFor(doc.id);
      assert.equal(saved.status, 'paid');
      assert.equal(JSON.parse(saved.payments).length, 2);
      assert.equal(receipts.length, 2);
      assert.equal(receipts.reduce((sum, row) => sum + row.transaction.amount, 0), 100);
    });

    await t.test('concurrent distinct requests cannot over-collect the same invoice balance', async () => {
      const doc = await invoice();
      const gated = concurrentReads(db, 'invoice');
      const outcomes = await Promise.allSettled([receiveInvoicePayment(gated, actor, input(doc.id, 70)), receiveInvoicePayment(gated, actor, input(doc.id, 70))]);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
      assert.equal(outcomes.find(result => result.status === 'rejected').reason.code, 'payment_exceeds_balance');
      assert.equal((await receiptsFor(doc.id)).length, 1);
    });

    await t.test('different concurrent vendor payment keys cannot produce two expenses', async () => {
      const doc = await bill();
      const gated = concurrentReads(db, 'vendorBill');
      const outcomes = await Promise.allSettled([settleVendorPayment(gated, director, input(doc.id)), settleVendorPayment(gated, director, input(doc.id))]);
      assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
      const receipts = await receiptsFor(doc.id);
      assert.equal(receipts.length, 1);
      assert.deepEqual([receipts[0].transaction.amount, receipts[0].transaction.currency, receipts[0].transaction.fxRate], [100000, 'VND', 1]);
    });

    await t.test('auto-approval and payment replay the same approved request under concurrency', async () => {
      const policy = JSON.parse((await db.setting.findUnique({ where: { id: 1 } }))?.json || '{}');
      const amount = policy.approveExpenseOver ?? 10000000;
      assert.ok(amount < (policy.approveExpenseDirectorOver ?? 50000000), 'Disposable fixture must have an accountant-only approval interval');
      const doc = await bill(amount);
      const command = input(doc.id);
      const gated = concurrentReads(db, 'vendorBill');
      const results = await Promise.all([requestVendorPayment(gated, actor, command), requestVendorPayment(gated, actor, command)]);
      assert.ok(results.every(result => !result.pending));
      assert.equal(results[0].approval.id, results[1].approval.id);
      assert.equal(await db.approval.count({ where: { refId: doc.id } }), 1);
      assert.equal((await receiptsFor(doc.id)).length, 1);
    });

    await t.test('failure after actual cash insert rolls back approval, document, ledger and audit', async () => {
      const doc = await bill();
      const approval = await db.approval.create({ data: { type: 'vendorbill', refId: doc.id, title: 'Disposable approval rollback', amount: doc.amount, requesterId: actor.id, requesterName: actor.name, payload: '{}' } });
      const command = { ...input(doc.id), approvalId: approval.id };
      const auditBefore = await db.auditLog.count({ where: { refId: doc.id } });
      const cashBefore = await db.transaction.count({ where: { createdById: actor.id } });
      await assert.rejects(db.$transaction(async tx => {
        await tx.approval.update({ where: { id: approval.id }, data: { status: 'approved' } });
        return settleVendorPaymentInTransaction(failReceipt(tx), actor, command);
      }, { isolationLevel: 'Serializable' }), /injected receipt failure/);
      assert.equal((await db.approval.findUnique({ where: { id: approval.id } })).status, 'pending');
      assert.equal((await db.vendorBill.findUnique({ where: { id: doc.id } })).status, 'pending');
      assert.equal(await db.transaction.count({ where: { createdById: actor.id } }), cashBefore);
      assert.equal(await db.auditLog.count({ where: { refId: doc.id } }), auditBefore);
      assert.equal((await receiptsFor(doc.id)).length, 0);
    });

    await t.test('outbox write failure rolls back the receipt and cash before an unchanged retry', async () => {
      const doc = await invoice();
      const command = input(doc.id, 100);
      const brokenOutbox = {
        $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, {
          get(target, property) {
            if (property === 'eventOutbox') return { createMany: async () => { throw new Error('injected outbox failure'); } };
            return target[property];
          },
        })), options),
      };
      const cashBefore = await db.transaction.count({ where: { createdById: actor.id } });
      await assert.rejects(receiveInvoicePayment(brokenOutbox, actor, command), /injected outbox failure/);
      assert.equal((await db.invoice.findUnique({ where: { id: doc.id } })).payments, '[]');
      assert.equal((await receiptsFor(doc.id)).length, 0);
      assert.equal(await db.transaction.count({ where: { createdById: actor.id } }), cashBefore);
      assert.equal(await db.auditLog.count({ where: { refId: doc.id } }), 0);
      assert.equal(await db.eventOutbox.count({ where: { payload: { contains: doc.id } } }), 0);
      await receiveInvoicePayment(db, actor, command);
      await receiveInvoicePayment(db, actor, command);
      assert.equal((await receiptsFor(doc.id)).length, 1);
      assert.equal(await db.eventOutbox.count({ where: { payload: { contains: doc.id } } }), 2);
    });

    await t.test('generic foreign expense threshold and auto-approval use the caller transaction and retain native cash', async () => {
      const expense = { type: 'expense', amount: 1000, currency: 'USD', fxRate: 25000, date: '2026-09-08', desc: `${run}-generic-expense` };
      const cashBefore = await db.transaction.count({ where: { createdById: actor.id } });
      const approvalsBefore = await db.approval.count({ where: { requesterId: actor.id } });
      await assert.rejects(db.$transaction(async tx => {
        const result = await interceptWrite('transactions', null, expense, actor, { db: tx });
        assert.ok(result.block, 'USD 1,000 must cross the VND 10m approval threshold');
        assert.equal(await tx.transaction.count({ where: { createdById: actor.id } }), cashBefore + 1);
        throw new Error('caller transaction aborts after approval and cash');
      }), /caller transaction aborts/);
      assert.equal(await db.transaction.count({ where: { createdById: actor.id } }), cashBefore);
      assert.equal(await db.approval.count({ where: { requesterId: actor.id } }), approvalsBefore);
      await db.$transaction(tx => interceptWrite('transactions', null, expense, actor, { db: tx }));
      const posted = await db.transaction.findFirst({ where: { desc: expense.desc } });
      assert.deepEqual([posted.amount, posted.currency, posted.fxRate], [1000, 'USD', 25000]);
      const approval = await db.approval.findFirst({ where: { requesterId: actor.id, type: 'expense', title: { contains: expense.desc } } });
      assert.equal(approval.amount, 25000000);
      assert.equal(approval.status, 'approved');
    });

    await t.test('quote after-hook approval and source document both roll back with the caller transaction', async () => {
      const id = `${run}-quote-${++counter}`;
      quoteIds.push(id);
      const data = { id, code: id, clientId, date: '2026-09-08', status: 'sent', vat: 0, items: JSON.stringify([{ qty: 1, price: 60000000 }]) };
      await assert.rejects(db.$transaction(async tx => {
        const interception = await interceptWrite('quotes', null, data, actor, { db: tx });
        assert.equal(interception.data.status, 'draft');
        const row = await tx.quote.create({ data: interception.data });
        await interception.after(row);
        assert.equal(await tx.approval.count({ where: { refId: id } }), 1);
        throw new Error('caller rejects quote transaction');
      }), /caller rejects quote transaction/);
      assert.equal(await db.quote.count({ where: { id } }), 0);
      assert.equal(await db.approval.count({ where: { refId: id } }), 0);
      assert.equal(await db.eventOutbox.count({ where: { payload: { contains: id } } }), 0);
    });
  } finally {
    // Only this run's generated fixture IDs are removed; no truncate, seed or reset.
    await db.eventOutbox.deleteMany({ where: { payload: { contains: run } } });
    await db.financialPaymentReceipt.deleteMany({ where: { recordId: { in: [...invoiceIds, ...billIds] } } });
    await db.auditLog.deleteMany({ where: { userId: { in: actorIds } } });
    await db.transaction.deleteMany({ where: { createdById: { in: actorIds } } });
    await db.approval.deleteMany({ where: { requesterId: { in: actorIds } } });
    await db.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await db.quote.deleteMany({ where: { id: { in: quoteIds } } });
    await db.vendorBill.deleteMany({ where: { id: { in: billIds } } });
    await db.client.deleteMany({ where: { id: clientId } });
    await db.vendor.deleteMany({ where: { id: vendorId } });
    await db.$disconnect();
  }
});
