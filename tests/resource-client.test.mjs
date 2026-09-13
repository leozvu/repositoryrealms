import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceClient } from '../lib/resource-client.js';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(fetcher) {
  const state = { rows: [], loading: false }, messages = [];
  let inflight = 0;
  const client = createResourceClient({ url: '/api/data/leads', fetcher, onState: patch => Object.assign(state, patch), onInflight: value => { inflight += value; assert.ok(inflight >= 0); }, onMessage: text => messages.push(text) });
  return { client, state, messages, inflight: () => inflight };
}

test('late GET cannot overwrite newer results even when transport ignores abort', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const h = harness(() => (++calls === 1 ? first.promise : second.promise));
  const old = h.client.refresh(), current = h.client.refresh();
  assert.equal(h.inflight(), 1);
  second.resolve(reply([{ id: 'new' }])); await current;
  first.resolve(reply([{ id: 'old' }])); await old;
  assert.deepEqual(h.state.rows, [{ id: 'new' }]); assert.equal(h.inflight(), 0); assert.equal(h.state.loading, false);
});

test('network, malformed response and denied access clear stale rows; retry recovers', async () => {
  const responses = [reply([{ id: 'private' }]), reply({ error: 'denied' }, 403), reply([{ id: 'allowed' }]), reply({ error: 'expired' }, 401), reply({ unexpected: true }), new Error('offline'), reply([{ id: 'recovered' }])];
  const h = harness(async () => { const next = responses.shift(); if (next instanceof Error) throw next; return next; });
  await h.client.refresh(); await h.client.refresh();
  assert.equal(h.state.forbidden, true); assert.deepEqual(h.state.rows, []);
  await h.client.refresh(); assert.equal(h.state.forbidden, false); assert.equal(h.state.error, '');
  await h.client.refresh(); assert.match(h.state.error, /đăng nhập/); assert.deepEqual(h.state.rows, []);
  await h.client.refresh(); assert.ok(h.state.error); assert.equal(h.state.loading, false);
  await h.client.refresh(); assert.ok(h.state.error); assert.equal(h.inflight(), 0);
  await h.client.refresh(); assert.equal(h.state.error, ''); assert.deepEqual(h.state.rows, [{ id: 'recovered' }]);
});

test('dispose cancels accounting immediately and suppresses late state/messages', async () => {
  const pending = deferred(); const h = harness(() => pending.promise);
  const read = h.client.refresh(); h.client.dispose();
  assert.equal(h.inflight(), 0); const snapshot = { ...h.state };
  pending.resolve(reply([{ id: 'leak' }])); await read;
  assert.deepEqual(h.state, snapshot); assert.equal(await h.client.refresh(), null);
  assert.equal(await h.client.call('POST', '/api/data/leads', {}), null);
});

test('failed write returns failure and never refreshes or emits success', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return reply({ error: 'Không đủ quyền sửa' }, 403); });
  assert.equal(await h.client.call('PUT', '/api/data/leads/a', { name: 'new' }), null);
  assert.equal(calls, 1); assert.deepEqual(h.messages, ['Không đủ quyền sửa']); assert.equal(h.state.mutating, false);
});

test('confirmed write remains successful after refresh fails, with no duplicate POST', async () => {
  const methods = [];
  const h = harness(async (_url, options) => { methods.push(options.method || 'GET'); if (options.method) return reply({ id: 'created' }); throw new Error('GET offline'); });
  assert.deepEqual(await h.client.call('POST', '/api/data/leads', { name: 'A' }), { id: 'created' });
  assert.deepEqual(methods, ['POST', 'GET']); assert.ok(h.state.error); assert.match(h.messages[0], /Đã lưu trên máy chủ/);
});

test('only identical overlapping writes share a result; another record is not reported saved', async () => {
  const pending = deferred(); let writes = 0;
  const h = harness(async (_url, options) => { if (options.method) { writes++; return pending.promise; } return reply([]); });
  const first = h.client.call('PUT', '/api/data/leads/a', { stage: 'won' });
  const same = h.client.call('PUT', '/api/data/leads/a', { stage: 'won' });
  assert.equal(first, same);
  assert.equal(await h.client.call('PUT', '/api/data/leads/b', { stage: 'won' }), null);
  pending.resolve(reply({ id: 'a' })); assert.deepEqual(await first, { id: 'a' }); assert.equal(writes, 1);
});

test('uncertain mutation is never retried automatically; 204 delete is accepted', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; throw new Error('response lost'); });
  assert.equal(await h.client.call('POST', '/api/data/leads', { name: 'A' }), null);
  assert.equal(calls, 1); assert.match(h.messages[0], /chưa xác minh/);
  const deleted = harness(async (_url, options) => options.method ? new Response(null, { status: 204 }) : reply([]));
  assert.deepEqual(await deleted.client.call('DELETE', '/api/data/leads/a'), { ok: true });
});

test('approval interception is not a completed save even with HTTP 200', async () => {
  const h = harness(async () => reply({ _blocked: true, _notice: 'Cần quản lý phê duyệt' }));
  assert.equal(await h.client.call('PUT', '/api/data/leads/a', { stage: 'won' }), null);
  assert.deepEqual(h.messages, ['Cần quản lý phê duyệt']);
});
