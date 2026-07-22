import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeEnv } from '../scripts/validate-runtime-env.mjs';

const valid = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:secret@db.internal:6543/crmegoric?schema=public',
  DIRECT_URL: 'postgresql://app:secret@db.internal:5432/crmegoric?schema=public',
  NEXTAUTH_SECRET: '0123456789abcdef0123456789abcdef',
  NEXTAUTH_URL: 'https://erp.example.vn',
};

test('runtime config accepts PostgreSQL, a strong auth secret and production HTTPS', () => {
  assert.deepEqual(validateRuntimeEnv(valid), []);
});

test('runtime config rejects missing direct URL, placeholders and public HTTP', () => {
  const errors = validateRuntimeEnv({
    ...valid,
    DIRECT_URL: '',
    DATABASE_URL: 'file:./dev.db',
    NEXTAUTH_SECRET: 'thay-bang-secret',
    NEXTAUTH_URL: 'http://erp.example.vn',
  });
  assert.ok(errors.some((error) => error.includes('DIRECT_URL is required')));
  assert.ok(errors.some((error) => error.includes('DATABASE_URL must use')));
  assert.ok(errors.some((error) => error.includes('NEXTAUTH_SECRET')));
  assert.ok(errors.some((error) => error.includes('HTTPS')));
});

test('runtime config allows localhost HTTP for an explicit production smoke server', () => {
  assert.deepEqual(validateRuntimeEnv({ ...valid, NEXTAUTH_URL: 'http://127.0.0.1:3400' }), []);
});
