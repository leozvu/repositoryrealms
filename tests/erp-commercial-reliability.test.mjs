import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { parse } from '@babel/parser';
import { transform } from 'next/dist/build/swc/index.js';
import * as format from '../lib/format.js';
import * as financial from '../lib/financial-reporting.js';
import { paymentAttempt } from '../lib/payment-attempt.js';

// Execute the actual page and callback source with deterministic hook/resource
// fixtures. These checks cover callers and render state, not browser focus/auth.
const compiled = {};
for (const page of ['quotes', 'invoices', 'tickets']) {
  const source = await readFile(new URL(`../app/(app)/${page}/page.jsx`, import.meta.url), 'utf8');
  const nodes = parse(source, { sourceType: 'module', plugins: ['jsx'] }).program.body;
  const body = nodes.filter(node => node.type !== 'ImportDeclaration')
    .map(node => source.slice(node.start, node.end).replace(/^export default /, '')).join('\n');
  compiled[page] = (await transform(body, {
    filename: `${page}-caller-test.jsx`, jsc: { parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'classic' } }, target: 'es2020' }, module: { type: 'es6' },
  })).code;
}

const shells = Object.fromEntries(['Icon', 'Modal', 'ConfirmDialog', 'FormModal', 'AsyncButton', 'EmptyState',
  'Badge', 'Forbidden', 'ExportCsv', 'ResourceError', 'PageHeader', 'DataTable', 'SendEmailModal'].map(name =>
  [name, Object.defineProperty(() => null, 'name', { value: name })]));
const resource = overrides => ({ rows: [], loading: false, error: '', forbidden: false, mutating: false,
  refresh: async () => [], create: async () => null, update: async () => null, remove: async () => null, ...overrides });

function fixture(page, { resources = {}, modal = null, fetcher = async () => new Response('{}'), states = [] } = {}) {
  const cells = [...states], effects = [], messages = [], navigations = [];
  let cursor = 0;
  const dependencies = {
    React, ...format, ...financial, ...shells, paymentAttempt,
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return cells[index] ??= { current: initial }; },
    useEffect(effect) { effects.push(effect); }, useMemo: callback => callback(),
    useResource: name => resource(resources[name]), useToast: () => (message, type) => messages.push({ message, type }),
    useSession: () => ({ data: { user: { id: 'test-am', roles: ['AM'] } } }), hasAny: () => true,
    useRouter: () => ({ push: path => navigations.push(path) }), printDoc() {}, fetch: fetcher,
  };
  if (modal) cells[1] = modal;
  const names = page === 'quotes' ? ['QuotesPage'] : page === 'invoices' ? ['InvoicesPage', 'PayModal', 'FromHoursModal'] : ['TicketsPage', 'CsatModal'];
  const components = new Function(...Object.keys(dependencies), `${compiled[page]}; return {${names.join(',')}};`)(...Object.values(dependencies));
  const render = (name = names[0], props) => { cursor = 0; effects.length = 0; return components[name](props); };
  return { cells, effects, messages, navigations, render };
}

function elements(tree, predicate) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object' || !node.props) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
    visit(node.props.footer);
  }
  visit(tree);
  return result;
}
const shell = (tree, name) => elements(tree, node => node.type === shells[name])[0];
const button = (tree, label) => elements(tree, node => node.type === 'button' && node.props.children === label)[0];
const kpis = tree => elements(tree, node => node.props.className === 'kpi-value').map(node => node.props.children);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = () => new Promise(resolve => setImmediate(resolve));
const ticket = { id: 'ticket-1', code: 'TK-1', title: 'Hỗ trợ', priority: 'normal', status: 'open', createdAt: '2026-09-10T09:00:00Z' };

for (const page of ['quotes', 'invoices', 'tickets']) {
  test(`${page}: failed deletion keeps confirmation open and emits no success`, async () => {
    let outcome = null, calls = 0;
    const app = fixture(page, { modal: { mode: 'del', row: { id: 'record-1', code: 'DOC-1' } },
      resources: { [page]: { remove: async id => { assert.equal(id, 'record-1'); calls++; return outcome; } } } });
    const confirm = shell(app.render(), 'ConfirmDialog');
    assert.equal(await confirm.props.onYes(), false);
    assert.equal(app.messages.length, 0);
    outcome = { ok: true };
    assert.equal(await confirm.props.onYes(), true);
    assert.equal(app.messages.length, 1);
    assert.equal(calls, 2);
  });
}

for (const mode of ['add', 'edit']) {
  test(`tickets: ${mode} preserves form on rejected write and acknowledges only saved data`, async () => {
    let outcome = null;
    const calls = [];
    const app = fixture('tickets', { modal: { mode, row: ticket }, resources: { tickets: {
      create: async data => { calls.push(data); return outcome; },
      update: async (id, data) => { assert.equal(id, ticket.id); calls.push(data); return outcome; },
    } } });
    const form = shell(app.render(), 'FormModal');
    const values = { title: 'Nội dung chưa lưu', priority: 'normal', status: 'open', clientId: '' };
    assert.equal(await form.props.onSave(values), false);
    assert.equal(app.messages.length, 0);
    assert.equal(calls[0].title, values.title);
    assert.equal(calls[0].clientId, null);
    outcome = { id: ticket.id };
    assert.equal(await form.props.onSave(values), true);
    assert.equal(app.messages.length, 1);
  });
}

test('quote conversion propagates failure to the confirmation and locks concurrent writes', async () => {
  const gate = deferred(); let writes = 0;
  const app = fixture('quotes', { modal: { mode: 'toinv', row: { id: 'q-1', code: 'Q-1' } },
    fetcher: async () => { writes++; await gate.promise; return new Response('{"error":"Báo giá đã đổi"}', { status: 409 }); } });
  const confirm = shell(app.render(), 'ConfirmDialog');
  const pending = confirm.props.onYes();
  assert.equal(await confirm.props.onYes(), null);
  gate.resolve();
  assert.equal(await pending, null);
  assert.equal(writes, 1);
  assert.deepEqual(app.messages.map(item => item.type), ['error']);
});

test('confirmed quote conversion remains confirmed when a related refresh fails', async () => {
  const app = fixture('quotes', { modal: { mode: 'toinv', row: { id: 'q-1', code: 'Q-1' } },
    resources: { invoices: { refresh: async () => { throw new Error('read unavailable'); } } },
    fetcher: async () => new Response('{"id":"i-1","code":"INV-1"}') });
  assert.equal((await shell(app.render(), 'ConfirmDialog').props.onYes()).id, 'i-1');
  assert.equal(app.messages.length, 1);
  assert.match(app.messages[0].message, /Đã tạo hóa đơn INV-1/);
});

test('unverifiable quote conversion produces no success and is never replayed automatically', async () => {
  for (const failure of ['malformed', 'offline', 'approval']) {
    let writes = 0;
    const app = fixture('quotes', { modal: { mode: 'toproj', row: { id: 'q-1', code: 'Q-1' } }, fetcher: async () => {
      writes++;
      if (failure === 'offline') throw new Error('offline');
      return new Response(failure === 'approval' ? '{"_blocked":true,"_notice":"Cần duyệt"}' : '{}');
    } });
    assert.equal(await shell(app.render(), 'ConfirmDialog').props.onYes(), null);
    assert.equal(writes, 1);
    assert.equal(app.messages.length, 1);
    assert.equal(app.messages[0].type, 'error');
  }
});

test('invoice totals distinguish unavailable reads, verified zero and missing FX', () => {
  for (const state of [{ loading: true }, { error: 'Không đọc được hóa đơn' }]) {
    const tree = fixture('invoices', { resources: { invoices: state } }).render();
    assert.deepEqual(kpis(tree), ['—', '—', '—']);
    assert.equal(shell(tree, 'EmptyState'), undefined);
  }
  assert.deepEqual(kpis(fixture('invoices').render()), [format.money(0), format.money(0), format.money(0)]);
  const tree = fixture('invoices', { resources: { invoices: { rows: [{ id: 'usd', status: 'sent', currency: 'USD', items: '[]', payments: '[]' }] } } }).render();
  assert.deepEqual(kpis(tree), ['Cần kiểm tra tỷ giá', 'Cần kiểm tra tỷ giá', 'Cần kiểm tra tỷ giá']);
});

test('ticket/CSAT failures never publish zero tickets or offer duplicate feedback', () => {
  const app = fixture('tickets', { resources: { tickets: { error: 'Mất kết nối' }, csat: { error: 'Mất kết nối' } } });
  const tree = app.render();
  assert.deepEqual(kpis(tree), ['—', '—', '—', '—']);
  assert.equal(shell(tree, 'EmptyState'), undefined);
  const csatFailed = fixture('tickets', { resources: { tickets: { rows: [{ ...ticket, status: 'resolved' }] }, csat: { error: 'Không đọc được đánh giá' } } }).render();
  assert.equal(elements(csatFailed, node => node.props.title === 'Ghi đánh giá CSAT của khách').length, 0);
});

test('ticket monthly completion excludes the same month in an earlier year', () => {
  const now = new Date(), earlierYear = new Date(now.getFullYear() - 1, now.getMonth(), 12);
  const tree = fixture('tickets', { resources: { tickets: { rows: [
    { ...ticket, id: 'current', resolvedAt: now.toISOString(), createdAt: new Date(now.getTime() - 86400000).toISOString() },
    { ...ticket, id: 'historical', resolvedAt: earlierYear.toISOString(), createdAt: new Date(earlierYear.getTime() - 86400000).toISOString() },
  ] } } }).render();
  assert.equal(elements(tree, node => node.props.className === 'kpi-sub')[0].props.children, '1 ticket đã xử lý');
});

test('quotes show read failure without an empty table or invalid customer actions', () => {
  const tree = fixture('quotes', { resources: { quotes: { error: 'Không đọc được báo giá' }, clients: { error: 'Không đọc được khách hàng' } } }).render();
  assert.equal(shell(tree, 'DataTable'), undefined);
  assert.equal(shell(tree, 'PageHeader').props.actions.props.disabled, true);
});

test('hour preview ignores the previous project even when fetch ignores abort', async () => {
  const gates = { a: deferred(), b: deferred() };
  const app = fixture('invoices', { fetcher: async url => {
    const projectId = new URL(url, 'http://test.local').searchParams.get('projectId');
    await gates[projectId].promise;
    return new Response(JSON.stringify({ lines: [], totalHours: projectId === 'a' ? 10 : 20 }));
  } });
  const props = { projects: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], onClose() {}, onDone() {} };
  app.render('FromHoursModal', props);
  const cleanA = app.effects[0]();
  app.cells[0] = 'b'; cleanA();
  app.render('FromHoursModal', props);
  const cleanB = app.effects[0]();
  gates.b.resolve(); await settle();
  assert.equal(app.cells[3].projectId, 'b'); assert.equal(app.cells[3].data.totalHours, 20);
  gates.a.resolve(); await settle();
  assert.equal(app.cells[3].projectId, 'b'); assert.equal(app.cells[3].data.totalHours, 20);
  cleanB();
});

test('hour preview errors finish loading and expose a working retry', async () => {
  let fail = true;
  const app = fixture('invoices', { fetcher: async () => fail
    ? new Response('{"error":"Không tải được giờ công"}', { status: 500 })
    : new Response('{"lines":[],"totalHours":0}') });
  const props = { projects: [{ id: 'a', name: 'A' }], onClose() {}, onDone() {} };
  app.render('FromHoursModal', props); app.effects[0](); await settle();
  assert.equal(app.cells[3].loading, false);
  let tree = app.render('FromHoursModal', props);
  assert.equal(shell(tree, 'ResourceError').props.error, 'Không tải được giờ công');
  fail = false; shell(tree, 'ResourceError').props.onRetry();
  tree = app.render('FromHoursModal', props); app.effects[0](); await settle();
  assert.equal(app.cells[3].error, ''); assert.equal(app.cells[3].data.totalHours, 0);
});

test('hour invoice creation locks duplicate submits/close and recovers from uncertain network failure', async () => {
  const gate = deferred(); let writes = 0, closed = 0;
  const app = fixture('invoices', { states: ['a', '300000', 15, { projectId: 'a', data: { totalHours: 4, lines: [] }, loading: false, error: '' }],
    fetcher: async () => { writes++; await gate.promise; throw new Error('offline'); } });
  const props = { projects: [{ id: 'a', name: 'A' }], onClose() { closed++; }, onDone() { assert.fail('Unconfirmed write cannot refresh as success'); } };
  const tree = app.render('FromHoursModal', props);
  const submit = button(tree, 'Tạo hóa đơn nháp').props.onClick;
  const pending = submit(); await submit(); shell(tree, 'Modal').props.onClose();
  assert.equal(writes, 1); assert.equal(closed, 0);
  gate.resolve(); await pending;
  assert.equal(app.cells[5], false); assert.equal(closed, 0);
  assert.equal(app.messages[0].type, 'error');
});

test('payment retries preserve idempotency key; success requires the expected invoice identity', async () => {
  const keys = []; let outcome = 'offline', closed = 0, refreshed = 0;
  const app = fixture('invoices', { fetcher: async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    if (outcome === 'offline') throw new Error('offline');
    return new Response(JSON.stringify(outcome === 'wrong' ? { id: 'another-invoice' } : { id: 'i-1', _payment: { replayed: true } }));
  } });
  const props = { inv: { id: 'i-1', code: 'INV-1', items: '[{"qty":1,"price":100}]', payments: '[]', vat: 0 },
    onClose() { closed++; }, onDone() { refreshed++; } };
  const submit = button(app.render('PayModal', props), 'Ghi nhận').props.onClick;
  await submit(); outcome = 'wrong'; await submit();
  assert.equal(closed, 0); assert.equal(refreshed, 0);
  outcome = 'saved'; await submit();
  assert.equal(closed, 1); assert.equal(refreshed, 1);
  assert.equal(new Set(keys).size, 1);
});

test('payment locks simultaneous submissions and closing until the receipt is confirmed', async () => {
  const gate = deferred(); let writes = 0, closed = 0;
  const app = fixture('invoices', { fetcher: async () => { writes++; await gate.promise; return new Response('{"id":"i-1"}'); } });
  const tree = app.render('PayModal', { inv: { id: 'i-1', code: 'INV-1', items: '[{"qty":1,"price":100}]', payments: '[]' },
    onClose() { closed++; }, onDone() {} });
  const submit = button(tree, 'Ghi nhận').props.onClick;
  const pending = submit(); await submit(); shell(tree, 'Modal').props.onClose();
  assert.equal(writes, 1); assert.equal(closed, 0);
  gate.resolve(); await pending; assert.equal(closed, 1);
});

test('CSAT cannot close or submit twice while saving, and rejected feedback stays open', async () => {
  const gate = deferred(); let saves = 0, closed = 0;
  const app = fixture('tickets');
  const tree = app.render('CsatModal', { ticket, onClose() { closed++; }, onSave: async () => { saves++; await gate.promise; return false; } });
  const save = shell(tree, 'AsyncButton').props.onClick;
  const pending = save(); assert.equal(await save(), false); shell(tree, 'Modal').props.onClose();
  assert.equal(saves, 1); assert.equal(closed, 0);
  gate.resolve(); assert.equal(await pending, false); assert.equal(closed, 0);
});
