import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleLeozOpsCommandInbox,
  handleLeozOpsManualJobRun,
  handleLeozOpsRuntime,
} from '../lib/leozops/command-handler.js';
import { createCommandDb } from './helpers/leozops-command-db.mjs';

const DIRECTOR = { id: 'director-1', name: 'Director', role: 'DIRECTOR' };
const ON = { LEOZOPS_COMMAND_ENABLED: 'true' };

function request(method = 'GET', { contentType, body = '' } = {}) {
  const headers = new Map();
  if (contentType) headers.set('content-type', contentType);
  return {
    method,
    url: 'https://erp.example/api/leozops/command-intents',
    headers: { get: name => headers.get(name.toLowerCase()) || null },
    text: async () => body,
  };
}

function options(memory, env = ON, getUser = async () => DIRECTOR) {
  return {
    env, db: memory.db, getUser, loadLeads: async () => [],
    now: () => new Date('2026-07-29T12:00:00.000Z').getTime(),
    uuid: () => '11111111-2222-4333-8444-555555555555',
    log: () => {},
  };
}

test('command HTTP boundary is default-off and requires a Director session before storage', async () => {
  const memory = createCommandDb();
  let authCalls = 0;
  const hidden = await handleLeozOpsCommandInbox(request(), options(memory, {}, async () => { authCalls += 1; return DIRECTOR; }));
  assert.equal(hidden.status, 404);
  assert.equal(authCalls, 0);
  const denied = await handleLeozOpsCommandInbox(request(), options(memory, ON, async () => null));
  assert.equal(denied.status, 401);
  assert.equal(memory.state.quotas.length, 0);
});

test('command inbox uses persistent no-store quota and strict JSON/content limits', async () => {
  const memory = createCommandDb();
  const inbox = await handleLeozOpsCommandInbox(request(), options(memory));
  assert.equal(inbox.status, 200);
  assert.equal(inbox.headers['Cache-Control'], 'private, no-store');
  assert.equal(inbox.body.contract, 'leozops.command-inbox');
  assert.equal(inbox.body.runtime.execution_enabled, false);
  assert.equal(memory.state.quotas[0].requestCount, 1);
  const badType = await handleLeozOpsCommandInbox(request('POST', {
    contentType: 'text/plain', body: '{}',
  }), options(memory));
  assert.equal(badType.status, 415);
  assert.equal(badType.body.code, 'leozops_command_content_type_unsupported');
});

test('runtime and manual job handlers deny unsupported methods explicitly', async () => {
  const memory = createCommandDb();
  const runtime = await handleLeozOpsRuntime(request('DELETE'), options(memory));
  assert.equal(runtime.status, 405);
  assert.equal(runtime.headers.Allow, 'GET, POST');
  const jobs = await handleLeozOpsManualJobRun(request('GET'), options(memory));
  assert.equal(jobs.status, 405);
  assert.equal(jobs.headers.Allow, 'POST');
});
