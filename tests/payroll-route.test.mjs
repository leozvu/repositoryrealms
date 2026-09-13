import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { resetPayroll, state } from './helpers/stub-payroll-boundaries.mjs';
import { computeLine } from '../lib/payroll.js';
register('./helpers/payroll-route-loader.mjs', import.meta.url);
const route = await import('../app/api/payroll/route.js');
const finalize = await import('../app/api/payroll/[id]/finalize/route.js');
const req = body => ({ json: async () => structuredClone(body) });
const staff = { id: 'u', name: 'Employee', status: 'active', userType: 'employee', salary: 30000000 };
const records = payroll => ({ user: { u: staff }, payroll: payroll ? { p: payroll } : {}, attendance: {}, setting: {} });

test('create and invalid-month paths use the selected period before any payroll write', async () => {
  for (const [month, tax] of [['2025-12', 1627500], ['2026-01', 635000]]) {
    resetPayroll(records()); const response = await route.POST(req({ month }));
    assert.equal(response.status, 200); const [line] = JSON.parse(response.body.lines);
    assert.equal(line.taxPeriod, month); assert.equal(line.tax, tax);
  }
  resetPayroll(records()); assert.equal((await route.POST(req({ month: '2026-13' }))).status, 400); assert.equal(state.writes.length, 0);
});

test('edit uses stored period, validates dependents, and regeneration retains their count', async () => {
  resetPayroll(records({ id: 'p', month: '2026-01', status: 'draft', lines: '[]' }));
  const response = await route.PUT(req({ id: 'p', lines: [{ ...staff, userId: 'u', base: 30000000, dependents: 1, taxPeriod: '2025-12' }] }));
  assert.equal(response.status, 200); let [line] = JSON.parse(response.body.lines);
  assert.equal(line.taxPeriod, '2026-01'); assert.equal(line.tax, 257500);
  const regenerated = await route.PUT(req({ id: 'p', regenerate: true }));
  assert.equal(regenerated.status, 200); [line] = JSON.parse(regenerated.body.lines);
  assert.equal(line.dependents, 1); assert.equal(line.tax, 257500);
  const count = state.writes.length;
  assert.equal((await route.PUT(req({ id: 'p', lines: [{ userId: 'u', base: 30000000, dependents: -1 }] }))).status, 400);
  assert.equal(state.writes.length, count);
});

test('outdated draft cannot create a final payroll or accounting entry; current version can', async () => {
  const old = { id: 'p', month: '2026-01', status: 'draft', lines: JSON.stringify([computeLine({ userId: 'u', base: 30000000 })]) };
  resetPayroll(records(old));
  const blocked = await finalize.POST(req({}), { params: { id: 'p' } });
  assert.equal(blocked.status, 400); assert.equal(blocked.body.code, 'payroll_tax_recalculation_required');
  assert.equal(state.writes.length, 0); assert.deepEqual(state.records.payroll.p, old);
  state.records.payroll.p.lines = JSON.stringify([computeLine({ userId: 'u', base: 30000000 }, 1.5, '2026-01')]);
  const accepted = await finalize.POST(req({}), { params: { id: 'p' } });
  assert.equal(accepted.status, 200); assert.equal(accepted.body.status, 'final');
  assert.equal(state.writes.filter(write => write.model === 'transaction').length, 1);
});

test('already finalized historical rows remain unchanged when read, edited, or finalized again', async () => {
  const saved = { id: 'p', month: '2025-12', status: 'final', lines: JSON.stringify([{ userId: 'u', tax: 1627500, net: 25222500 }]) };
  resetPayroll(records(saved));
  assert.equal((await route.GET()).body.payrolls[0].lines, saved.lines);
  assert.equal((await route.PUT(req({ id: 'p', regenerate: true }))).status, 400);
  assert.equal((await finalize.POST(req({}), { params: { id: 'p' } })).status, 400);
  assert.equal(state.writes.length, 0); assert.deepEqual(state.records.payroll.p, saved);
});
