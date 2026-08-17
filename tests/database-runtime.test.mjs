import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isServerlessRuntime,
  runtimeDatabaseUrl,
  SERVERLESS_CONNECTION_LIMIT,
  SERVERLESS_POOL_TIMEOUT_SECONDS,
} from '../lib/database-runtime.js';

test('serverless runtime detection is explicit and local development remains unchanged', () => {
  assert.equal(isServerlessRuntime({}), false);
  assert.equal(isServerlessRuntime({ VERCEL: '1' }), true);
  assert.equal(isServerlessRuntime({ VERCEL_ENV: 'production' }), true);
  const local = 'postgresql://user:secret@example.test/db?schema=ceoportal&sslmode=require';
  assert.equal(runtimeDatabaseUrl(local, {}), local);
});

test('Vercel runtime enforces a bounded Prisma pool without losing database parameters', () => {
  const value = 'postgresql://user:secret@example.test/db?schema=ceoportal&sslmode=require&connection_limit=9';
  const url = new URL(runtimeDatabaseUrl(value, { VERCEL: '1' }));
  assert.equal(url.searchParams.get('connection_limit'), String(SERVERLESS_CONNECTION_LIMIT));
  assert.equal(url.searchParams.get('pool_timeout'), String(SERVERLESS_POOL_TIMEOUT_SECONDS));
  assert.equal(url.searchParams.get('schema'), 'ceoportal');
  assert.equal(url.searchParams.get('sslmode'), 'require');
  assert.equal(url.password, 'secret');
});

test('runtime URL hardening is fail-safe for missing and non-Postgres values', () => {
  assert.equal(runtimeDatabaseUrl('', { VERCEL: '1' }), '');
  assert.equal(runtimeDatabaseUrl('not-a-url', { VERCEL: '1' }), 'not-a-url');
  assert.equal(runtimeDatabaseUrl('mysql://user:secret@example.test/db', { VERCEL: '1' }), 'mysql://user:secret@example.test/db');
});
