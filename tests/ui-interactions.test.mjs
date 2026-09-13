import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildUiInteractionVerification, renderUiInteractionArtifacts } from '../scripts/lib/ui-interaction-verification.mjs';
import { createResourceClient } from '../lib/resource-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Phase 3 closes every Phase 2 UX candidate with an interaction guard', () => {
  const result = buildUiInteractionVerification(root);
  assert.equal(result.summary.finalCandidateElements, 0);
  assert.equal(result.summary.finalCandidateFlags, 0);
  assert.ok(result.summary.guardedActions >= 70);
  assert.ok(result.summary.asyncButtonGuards >= 35);
});

test('all six high-risk destructive flows require a confirmation dialog', () => {
  const result = buildUiInteractionVerification(root);
  assert.equal(result.summary.destructiveFlows, 6);
  assert.equal(result.summary.destructiveFlowsVerified, 6);
  assert.ok(result.destructiveFlows.every(flow => flow.status === 'verified'));
});

test('shared async primitives guard double-submit and preserve failed forms', async () => {
  const source = fs.readFileSync(path.join(root, 'components', 'ui.jsx'), 'utf8');
  assert.match(source, /export function AsyncButton/);
  assert.match(source, /pendingRef\.current/);
  assert.match(source, /aria-busy=\{pending \|\| undefined\}/);
  assert.match(source, /res !== false && res !== null/);
  assert.match(source, /createResourceClient/);
  let resolveWrite, writes = 0;
  const gate = new Promise(resolve => { resolveWrite = resolve; });
  const client = createResourceClient({ url: '/api/data/leads', onState() {}, fetcher: async (_url, options) => {
    if (options.method) { writes++; await gate; return new Response('{"error":"failed"}', {status:409}); }
    return new Response('[]');
  } });
  const first = client.call('POST', '/api/data/leads', {name:'A'});
  const duplicate = client.call('POST', '/api/data/leads', {name:'A'});
  assert.equal(first, duplicate);
  resolveWrite(); assert.equal(await first, null); assert.equal(writes, 1);
  client.dispose();
});

test('login fields expose stable accessible labels and autocomplete contracts', () => {
  const source = fs.readFileSync(path.join(root, 'app', 'login', 'LoginForm.jsx'), 'utf8');
  for (const id of ['login-email', 'login-password', 'login-otp']) {
    assert.ok(source.includes(`htmlFor="${id}"`));
    assert.ok(source.includes(`id="${id}"`));
  }
  assert.match(source, /role="alert" aria-live="polite"/);
});

test('Phase 3 artifacts are deterministic', () => {
  const first = renderUiInteractionArtifacts(buildUiInteractionVerification(root));
  const second = renderUiInteractionArtifacts(buildUiInteractionVerification(root));
  assert.deepEqual(second, first);
});
