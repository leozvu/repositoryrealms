import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { state } from './helpers/stub-lead-conversion-route.mjs';
import { createLeadConversionDb, WON_LEAD } from './helpers/lead-conversion-db.mjs';
register('./helpers/lead-conversion-route-loader.mjs', import.meta.url);
const { POST } = await import('../app/api/leads/[id]/convert/route.js');
const request = () => new Request('http://localhost/api/leads/lead-1/convert', { method: 'POST' });
const context = () => ({ params: Promise.resolve({ id: WON_LEAD.id }) });

test('authenticated command route creates once and returns the same client on HTTP retry', async () => {
  const memory = createLeadConversionDb([WON_LEAD]);
  Object.assign(state, { user: { id: 'am-1', roles: ['AM'] }, db: memory.db, enabled: true });
  const first = await POST(request(), context());
  const retry = await POST(request(), context());
  assert.equal(first.status, 201);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.clientId, first.body.clientId);
  assert.equal(retry.body.replayed, true);
  assert.equal(memory.state().client.length, 1);
});

test('anonymous, wrong role and disabled-module requests are rejected before conversion', async () => {
  for (const [user, enabled, expected] of [[null, true, 401], [{ id: 'staff', roles: ['STAFF'] }, true, 403], [{ id: 'am-1', roles: ['AM'] }, false, 403]]) {
    const memory = createLeadConversionDb([WON_LEAD]);
    Object.assign(state, { user, db: memory.db, enabled });
    assert.equal((await POST(request(), context())).status, expected);
    assert.equal(memory.stats.transactions, 0);
  }
});

test('route hides another owner’s lead and never exposes storage error details', async () => {
  const memory = createLeadConversionDb([WON_LEAD]);
  Object.assign(state, { user: { id: 'other', roles: ['AM'] }, db: memory.db, enabled: true });
  assert.equal((await POST(request(), context())).status, 404);
  const failing = createLeadConversionDb([WON_LEAD], { auditFailureOnce: true });
  Object.assign(state, { user: { id: 'am-1', roles: ['AM'] }, db: failing.db });
  const response = await POST(request(), context());
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(response.body).includes('audit storage'), false);
  assert.equal(failing.state().client.length, 0);
});
