import test from 'node:test';
import assert from 'node:assert/strict';
import { RealmOperationError } from '../lib/realm-operation.js';
import { realmEmptyResponse, realmErrorResponse, realmJsonResponse } from '../lib/realm-api-response.js';

const trace = () => ({
  requestId: 'realm_response-12345678',
  route: 'realm.operations',
  operation: 'snapshot.read',
  method: 'GET',
  startedAt: 10,
});
const observation = { now: () => 15, timestamp: () => '2026-07-18T12:00:00.000Z', logger: () => {} };

test('Observed JSON error trả support ID trong body và headers no-store', async () => {
  const response = realmJsonResponse(trace(), { error: 'Sync disabled', code: 'realm_erp_sync_disabled' }, {
    status: 503,
    code: 'realm_erp_sync_disabled',
    outcome: 'disabled',
    observation,
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('X-Realm-Request-Id'), 'realm_response-12345678');
  assert.equal(response.headers.get('X-Realm-Outcome'), 'disabled');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-cache, no-store, max-age=0');
  assert.equal(response.headers.get('Vary'), 'Cookie');
  assert.deepEqual(await response.json(), {
    error: 'Sync disabled', code: 'realm_erp_sync_disabled', requestId: 'realm_response-12345678',
  });
});

test('Known business error giữ status/message và conditional response không có body', async () => {
  const rejected = realmErrorResponse(trace(), new RealmOperationError('Version conflict', 409, 'realm_profile_conflict'), {
    fallbackMessage: 'Fallback', fallbackCode: 'realm_error', observation,
  });
  assert.equal(rejected.status, 409);
  assert.deepEqual(await rejected.json(), {
    error: 'Version conflict', code: 'realm_profile_conflict', requestId: 'realm_response-12345678',
  });

  const notModified = realmEmptyResponse(trace(), { status: 304, observation });
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get('X-Realm-Outcome'), 'not_modified');
  assert.equal(await notModified.text(), '');
});
