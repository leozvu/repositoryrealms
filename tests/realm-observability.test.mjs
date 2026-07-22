import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRealmRequestId,
  observeRealmApiRequest,
  safeRealmException,
  startRealmApiRequest,
} from '../lib/realm-observability.js';

test('Realm trace giữ upstream request ID hợp lệ và thay ID không an toàn', () => {
  const trusted = startRealmApiRequest(new Request('https://realm.test/api', {
    method: 'POST',
    headers: { 'X-Request-Id': 'edge-req_12345678' },
  }), { route: 'realm.operations', operation: 'snapshot.write' }, { now: () => 10, idFactory: () => 'unused' });
  assert.equal(trusted.requestId, 'edge-req_12345678');
  assert.equal(trusted.method, 'POST');
  assert.equal(trusted.startedAt, 10);

  const generated = startRealmApiRequest(new Request('https://realm.test/api', {
    headers: { 'X-Request-Id': 'bad/request/id' },
  }), { route: 'realm.operations', operation: 'snapshot.read' }, { now: () => 20, idFactory: () => '12345678-abcd' });
  assert.equal(generated.requestId, 'realm_12345678-abcd');
  assert.equal(normalizeRealmRequestId('short'), null);
  assert.equal(normalizeRealmRequestId(generated.requestId), generated.requestId);
});

test('Observed event chỉ chứa allowlist an toàn và sinh latency headers', () => {
  const logs = [];
  const trace = {
    requestId: 'realm_request-12345678', route: 'realm.operations', operation: 'snapshot.read', method: 'GET', startedAt: 100,
  };
  const observed = observeRealmApiRequest(trace, { status: 304, code: 'realm_snapshot_not_modified', outcome: 'not_modified' }, {
    now: () => 112.36,
    timestamp: () => '2026-07-18T12:00:00.000Z',
    logger: (line) => logs.push(line),
  });
  assert.deepEqual(observed.event, {
    schemaVersion: 1,
    timestamp: '2026-07-18T12:00:00.000Z',
    requestId: 'realm_request-12345678',
    route: 'realm.operations',
    operation: 'snapshot.read',
    method: 'GET',
    status: 304,
    outcome: 'not_modified',
    code: 'realm_snapshot_not_modified',
    durationMs: 12.4,
  });
  assert.equal(observed.headers['X-Realm-Request-Id'], trace.requestId);
  assert.equal(observed.headers['X-Realm-Duration-Ms'], '12.4');
  assert.equal(observed.headers['Server-Timing'], 'realm;dur=12.4');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].includes('payload'), false);
  assert.equal(logs[0].includes('userId'), false);
});

test('Safe exception log không chứa message, stack hoặc payload', () => {
  const lines = [];
  const secretError = new Error('password=do-not-log payload={private}');
  const event = safeRealmException({ requestId: 'realm_request-87654321', route: 'realm.health' }, secretError, 'realm_database_unreachable', (line) => lines.push(line));
  assert.equal(event.errorName, 'Error');
  assert.equal(event.code, 'realm_database_unreachable');
  assert.equal(lines.length, 1);
  assert.equal(lines[0].includes('do-not-log'), false);
  assert.equal(lines[0].includes('private'), false);
});
