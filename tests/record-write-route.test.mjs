import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { resetRecords, state } from './helpers/stub-record-route-boundaries.mjs';

register('./helpers/record-route-loader.mjs', import.meta.url);
const routes = [
  { name: 'session', list: await import('../app/api/data/[resource]/route.js'), item: await import('../app/api/data/[resource]/[id]/route.js') },
  { name: 'API key', list: await import('../app/api/v1/[resource]/route.js'), item: await import('../app/api/v1/[resource]/[id]/route.js') },
];
const STAFF = { id: 'staff-a', roles: ['STAFF'] };
const HR = { id: 'hr', roles: ['HR'] };
const PM = { id: 'pm', roles: ['PM'] };
const ACCOUNTANT = { id: 'accountant', roles: ['ACCOUNTANT'] };
const DIRECTOR = { id: 'director', roles: ['DIRECTOR'] };
const invoice = { id: 'invoice', code: 'INV-1', clientId: 'client-a', projectId: null, items: '[{"desc":"Service","qty":1,"price":100}]', vat: 0, date: '2026-09-01', status: 'draft', payments: '[]', paidDate: null, currency: 'VND', fxRate: 1 };
const bill = { id: 'bill', code: 'BILL-1', vendorId: 'vendor-a', projectId: null, amount: 100, date: '2026-09-01', status: 'pending', paidDate: null };
const req = data => ({ json: async () => structuredClone(data) });
const context = (resource, id) => ({ params: { resource, id } });
const businessWrites = () => state.calls.filter(call => !['auditLog', 'eventOutbox'].includes(call.model));

for (const route of routes) {
  test(`${route.name}: audit or outbox failure rolls back the business mutation`, async () => {
    for (const failedModel of ['auditLog', 'eventOutbox']) {
      resetRecords(STAFF, { leave: { leave: { id: 'leave', userId: STAFF.id, status: 'pending', from: '2026-09-01', to: '2026-09-02', note: 'original' } } });
      state.failModel = failedModel;
      const response = await route.item.PUT(req({ note: 'must roll back' }), context('leaves', 'leave'));
      assert.equal(response.status, 400);
      assert.equal(state.records.leave.leave.note, 'original');
      assert.equal(state.calls.length, 0);
    }
  });
  test(`${route.name}: anonymous writes stop before persistence`, async () => {
    resetRecords(null);
    assert.equal((await route.list.POST(req({}), context('reviews'))).status, 401);
    assert.equal(businessWrites().length, 0);
  });

  test(`${route.name}: leave ownership and finalized state are enforced on the real handler`, async () => {
    for (const row of [
      { id: 'leave', userId: 'staff-b', status: 'pending' },
      { id: 'leave', userId: STAFF.id, status: 'approved' },
      { id: 'leave', userId: STAFF.id, status: 'rejected' },
    ]) {
      resetRecords(STAFF, { leave: { leave: row } });
      const response = await route.item.PUT(req({ note: 'forged' }), context('leaves', 'leave'));
      assert.equal(response.status, 403);
      assert.equal(businessWrites().length, 0);
    }
    resetRecords(STAFF, { leave: { leave: { id: 'leave', userId: STAFF.id, status: 'pending', from: '2026-09-01', to: '2026-09-02' } } });
    const response = await route.item.PUT(req({ userId: 'staff-b', user: { connect: { id: 'staff-b' } }, status: 'approved', note: 'corrected', to: '2026-09-03' }), context('leaves', 'leave'));
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { id: 'leave', userId: STAFF.id, status: 'pending', from: '2026-09-01', to: '2026-09-03', note: 'corrected' });
    state.user = HR;
    assert.equal((await route.item.PUT(req({ status: 'approved' }), context('leaves', 'leave'))).status, 200);
  });

  test(`${route.name}: create validation rejects reversed leave dates before any writes`, async () => {
    resetRecords(STAFF);
    const response = await route.list.POST(req({ from: '2026-09-20', to: '2026-09-01' }), context('leaves'));
    assert.equal(response.status, 400);
    assert.equal(businessWrites().length, 0);
  });

  test(`${route.name}: leave approval between permission read and save prevents stale employee edits`, async () => {
    resetRecords(STAFF, { leave: { leave: { id: 'leave', userId: STAFF.id, status: 'pending', from: '2026-09-01', to: '2026-09-02', note: 'original' } } });
    const response = await route.item.PUT({ json: async () => {
      // A manager commits after this handler read/authorized the pending row.
      state.records.leave.leave.status = 'approved';
      return { note: 'stale employee edit', to: '2026-09-10' };
    } }, context('leaves', 'leave'));
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'record_write_conflict');
    assert.equal(state.records.leave.leave.status, 'approved');
    assert.equal(state.records.leave.leave.note, 'original');
    assert.equal(state.records.leave.leave.to, '2026-09-02');
    assert.equal(businessWrites().length, 0);
  });

  test(`${route.name}: review creation cannot impersonate a manager or another employee`, async () => {
    resetRecords(STAFF);
    const response = await route.list.POST(req({ id: 'forged', userId: 'staff-b', quarter: '2026-Q3', status: 'final', mgrNote: 'forged', scores: '[{"name":"Quality","self":4,"mgr":5}]' }), context('reviews'));
    assert.equal(response.status, 200);
    assert.equal(response.body.userId, STAFF.id);
    assert.equal(response.body.status, 'pending');
    assert.equal(response.body.mgrNote, undefined);
    assert.notEqual(response.body.id, 'forged');
    assert.deepEqual(JSON.parse(response.body.scores), [{ name: 'Quality', self: 4, mgr: 0 }]);
  });

  test(`${route.name}: self review keeps stored manager scores; HR can still open and finalize reviews`, async () => {
    resetRecords(STAFF, { review: { review: { id: 'review', userId: STAFF.id, quarter: '2026-Q3', status: 'pending', scores: '[{"name":"Quality","self":2,"mgr":3}]', mgrNote: 'real manager' } } });
    const response = await route.item.PUT(req({ userId: 'staff-b', status: 'final', mgrNote: 'forged', scores: '[{"name":"Quality","self":4,"mgr":5}]' }), context('reviews', 'review'));
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'self_done');
    assert.equal(response.body.mgrNote, 'real manager');
    assert.equal(response.body.userId, STAFF.id);
    assert.deepEqual(JSON.parse(response.body.scores), [{ name: 'Quality', self: 4, mgr: 3 }]);
    state.user = HR;
    const opened = await route.list.POST(req({ userId: 'staff-b', quarter: '2026-Q3', scores: '[]' }), context('reviews'));
    assert.equal(opened.body.userId, 'staff-b');
    assert.equal((await route.item.PUT(req({ status: 'final', mgrNote: 'reviewed' }), context('reviews', 'review'))).status, 200);
    state.user = STAFF;
    assert.equal((await route.item.PUT(req({ selfNote: 'overwrite' }), context('reviews', 'review'))).status, 403);
  });

  test(`${route.name}: review finalization or concurrent manager score changes cannot be overwritten by a stale self-review`, async () => {
    for (const managerChange of [{ status: 'final' }, { scores: '[{"name":"Quality","self":2,"mgr":5}]', mgrNote: 'new manager decision' }]) {
      resetRecords(STAFF, { review: { review: { id: 'review', userId: STAFF.id, quarter: '2026-Q3', status: 'pending', scores: '[{"name":"Quality","self":2,"mgr":3}]', mgrNote: 'old manager decision' } } });
      const response = await route.item.PUT({ json: async () => {
        Object.assign(state.records.review.review, managerChange);
        return { scores: '[{"name":"Quality","self":4,"mgr":1}]' };
      } }, context('reviews', 'review'));
      assert.equal(response.status, 409);
      assert.equal(response.body.code, 'record_write_conflict');
      for (const [key, value] of Object.entries(managerChange)) assert.equal(state.records.review.review[key], value);
      assert.equal(businessWrites().length, 0);
    }
  });

  test(`${route.name}: invoices cannot be created paid or with fabricated payment history`, async () => {
    resetRecords(ACCOUNTANT);
    const response = await route.list.POST(req({ ...invoice, payments: '[{"amount":100}]', paidDate: '2026-09-01', client: { connect: { id: 'other' } } }), context('invoices'));
    assert.equal(response.status, 200);
    assert.equal(response.body.payments, '[]');
    assert.equal(response.body.paidDate, null);
    assert.equal(response.body.client, undefined);
    for (const status of ['paid', { set: 'paid' }]) {
      resetRecords(ACCOUNTANT);
      assert.equal((await route.list.POST(req({ ...invoice, status }), context('invoices'))).status, 400);
      assert.equal(businessWrites().length, 0);
    }
  });

  test(`${route.name}: unpaid invoice editing works; partial or full payments protect ledger dimensions`, async () => {
    resetRecords(ACCOUNTANT, { invoice: { invoice } });
    const updated = await route.item.PUT(req({ code: 'INV-2', items: '[{"desc":"Service","qty":2,"price":100}]', status: 'sent', payments: '[{"amount":200}]', paidDate: '2026-09-02' }), context('invoices', 'invoice'));
    assert.equal(updated.status, 200);
    assert.equal(updated.body.code, 'INV-2');
    assert.equal(updated.body.status, 'sent');
    assert.equal(updated.body.payments, '[]');
    assert.equal(updated.body.paidDate, null);
    for (const status of ['sent', 'paid']) {
      resetRecords(ACCOUNTANT, { invoice: { invoice: { ...invoice, status, payments: '[{"amount":50}]' } } });
      assert.equal((await route.item.PUT(req({ currency: 'USD' }), context('invoices', 'invoice'))).status, 400);
      assert.equal((await route.item.PUT(req({ status: 'draft' }), context('invoices', 'invoice'))).status, 400);
      assert.equal(businessWrites().length, 0);
      const metadata = await route.item.PUT(req({ dueDate: '2026-10-01', payments: '[]' }), context('invoices', 'invoice'));
      assert.equal(metadata.status, 200);
      assert.equal(metadata.body.status, status);
      assert.equal(metadata.body.payments, '[{"amount":50}]');
    }
  });

  test(`${route.name}: vendor bill terms remain editable until approval/payment, protected metadata is canonical`, async () => {
    resetRecords(PM, { vendorBill: { bill } });
    let response = await route.item.PUT(req({ amount: 150, desc: 'updated', paidDate: '2026-09-02' }), context('vendorbills', 'bill'));
    assert.equal(response.status, 200);
    assert.equal(response.body.amount, 150);
    assert.equal(response.body.paidDate, null);
    assert.equal((await route.item.PUT(req({ status: 'paid' }), context('vendorbills', 'bill'))).status, 400);
    state.pendingApproval = { id: 'approval' };
    assert.equal((await route.item.PUT(req({ amount: 250 }), context('vendorbills', 'bill'))).status, 400);
    resetRecords(ACCOUNTANT, { vendorBill: { bill: { ...bill, status: 'paid', paidDate: '2026-09-02' } } });
    assert.equal((await route.item.PUT(req({ amount: 250 }), context('vendorbills', 'bill'))).status, 400);
    response = await route.item.PUT(req({ desc: 'receipt attached', dueDate: '2026-10-01', paidDate: null }), context('vendorbills', 'bill'));
    assert.equal(response.status, 200);
    assert.equal(response.body.desc, 'receipt attached');
    assert.equal(response.body.paidDate, '2026-09-02');
    resetRecords(PM);
    assert.equal((await route.list.POST(req({ ...bill, status: 'paid' }), context('vendorbills'))).status, 400);
    assert.equal(businessWrites().length, 0);
  });

  test(`${route.name}: even Director cannot delete paid documents; unpaid deletion still works`, async () => {
    for (const [resource, model, row] of [['invoices', 'invoice', { ...invoice, status: 'paid' }], ['vendorbills', 'vendorBill', { ...bill, status: 'paid' }]]) {
      resetRecords(DIRECTOR, { [model]: { [row.id]: row } });
      assert.equal((await route.item.DELETE(req({}), context(resource, row.id))).status, 403);
      assert.equal(businessWrites().length, 0);
    }
    resetRecords(DIRECTOR, { invoice: { invoice } });
    assert.equal((await route.item.DELETE(req({}), context('invoices', 'invoice'))).status, 200);
    resetRecords(DIRECTOR, { vendorBill: { bill } });
    state.pendingApproval = { id: 'approval' };
    assert.equal((await route.item.DELETE(req({}), context('vendorbills', 'bill'))).status, 403);
    state.pendingApproval = null;
    assert.equal((await route.item.DELETE(req({}), context('vendorbills', 'bill'))).status, 200);
  });

  test(`${route.name}: a stale edit/delete cannot overwrite a payment that just committed`, async () => {
    for (const method of ['PUT', 'DELETE']) {
      resetRecords(DIRECTOR, { invoice: { invoice } });
      state.conflictOnce = true;
      const response = await route.item[method](req({ items: '[{"qty":1,"price":200}]' }), context('invoices', 'invoice'));
      assert.equal(response.status, 409);
      assert.equal(response.body.code, 'record_write_conflict');
      assert.equal(businessWrites().length, 0);
    }
  });

  test(`${route.name}: payment-linked cash entries are immutable even for Director`, async () => {
    resetRecords(DIRECTOR, {
      transaction: { cash: { id: 'cash', amount: 100, currency: 'USD', fxRate: 25000 } },
      financialPaymentReceipt: { cash: { id: 'receipt', transactionId: 'cash' } },
    });
    assert.equal((await route.item.PUT(req({ amount: 200 }), context('transactions', 'cash'))).status, 403);
    assert.equal((await route.item.DELETE(req({}), context('transactions', 'cash'))).status, 403);
    assert.equal(businessWrites().length, 0);
  });
}
