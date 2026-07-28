import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  PRODUCTION_SURFACES,
  PUBLIC_PROBES,
  evaluatePublicProbe,
  summarizeObservation,
} from '../scripts/production-observation.mjs';

function response(status, headers = {}) {
  return { status, headers: new Headers(headers) };
}

const surface = PRODUCTION_SURFACES[0];

test('observation inventory contains exactly four entities and the CEO Terminal', () => {
  assert.deepEqual(PRODUCTION_SURFACES.map((item) => item.id), ['aim', 'egoric', 'vnecom', 'egolive', 'ceo-terminal']);
  assert.ok(PRODUCTION_SURFACES.every((item) => item.baseUrl.startsWith('https://')));
  assert.ok(!PRODUCTION_SURFACES.some((item) => /fretas/i.test(item.id) || /fretas/i.test(item.baseUrl)));
  for (const item of PRODUCTION_SURFACES) {
    const applicable = PUBLIC_PROBES.filter((probe) => !probe.surfaceKinds || probe.surfaceKinds.includes(item.kind));
    assert.equal(applicable.length, 7, `${item.id} must have seven topology-aware probes`);
  }
});

test('every production observation probe is a read-only GET without a body', () => {
  assert.equal(PUBLIC_PROBES.length, 8);
  assert.ok(PUBLIC_PROBES.every((probe) => probe.method === 'GET'));
  assert.ok(PUBLIC_PROBES.every((probe) => !Object.hasOwn(probe, 'body')));
  assert.deepEqual(PUBLIC_PROBES.find((probe) => probe.id === 'realm-api-fail-closed').surfaceKinds, ['entity']);
  assert.deepEqual(PUBLIC_PROBES.find((probe) => probe.id === 'ceo-portal-auth-boundary').surfaceKinds, ['portal']);
  const source = fs.readFileSync(new URL('../scripts/production-observation.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /response\.(?:text|json|arrayBuffer|blob|formData)\s*\(/);
  assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
});

test('login probe requires HTML and Content-Security-Policy', () => {
  const probe = PUBLIC_PROBES.find((item) => item.id === 'login');
  const pass = evaluatePublicProbe({
    surface,
    probe,
    response: response(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'self'" }),
    durationMs: 123.4,
  });
  assert.equal(pass.passed, true);
  assert.equal(pass.durationMs, 123);

  const fail = evaluatePublicProbe({ surface, probe, response: response(200, { 'content-type': 'text/html' }), durationMs: 5 });
  assert.equal(fail.passed, false);
  assert.deepEqual(fail.failureCodes, ['content_security_policy']);
});

test('protected surfaces must redirect to same-origin login', () => {
  const probe = PUBLIC_PROBES.find((item) => item.id === 'erp-auth-boundary');
  const pass = evaluatePublicProbe({ surface, probe, response: response(307, { location: '/login?callbackUrl=%2Fdashboard' }), durationMs: 9 });
  assert.equal(pass.passed, true);

  const crossOrigin = evaluatePublicProbe({ surface, probe, response: response(307, { location: 'https://evil.example/login' }), durationMs: 9 });
  assert.equal(crossOrigin.passed, false);
  assert.deepEqual(crossOrigin.failureCodes, ['same_origin_login_redirect']);
});

test('summary fails closed and artifact-shaped results contain no body or header data', () => {
  const probe = PUBLIC_PROBES.find((item) => item.id === 'realm-api-fail-closed');
  const result = evaluatePublicProbe({ surface, probe, response: response(500, { 'content-type': 'application/json' }), durationMs: 3_500 });
  const summary = summarizeObservation([{ id: surface.id, probes: [result] }], 3_000);
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.failed, 1);
  assert.ok(!Object.hasOwn(result, 'body'));
  assert.ok(!Object.hasOwn(result, 'headers'));
});

test('scheduled workflow is read-only and retains observation evidence for 30 days', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/production-observation.yml', import.meta.url), 'utf8');
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /npm run observe:production/);
  assert.match(workflow, /retention-days:\s*30/);
  assert.doesNotMatch(workflow, /secrets\.|permissions:\s*write|POST|deploy/i);
});
