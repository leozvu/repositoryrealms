import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CeoStaffError, assertDistinctEntities, hashStaffCode, normalizePersonKey,
  normalizeRedirectPath, normalizeStaffMessage,
} from '../lib/ceo-staff-bridge.js';
import { authenticateEntityCaller, issueStaffSsoCode, redeemStaffSsoCode } from '../lib/ceo-staff-bridge-admin.js';

const ENTITY = { id: 'egoric', enabled: true, displayName: 'Egoric Agency', baseUrl: 'https://erp-egoric.vercel.app' };
const TARGET = { id: 'aim', enabled: true, displayName: 'AIm Agency', baseUrl: 'https://agency-erp-mu.vercel.app' };

function db({ links = {}, codeRow = null, created = {} } = {}) {
  return {
    created,
    ceoEntityRegistry: { findUnique: async ({ where }) => (where.id === 'egoric' ? ENTITY : where.id === 'aim' ? TARGET : null) },
    ceoStaffLink: {
      findUnique: async ({ where }) => links[`${where.personKey_entityId.personKey}@${where.personKey_entityId.entityId}`] || null,
    },
    ceoStaffSsoCode: {
      create: async ({ data }) => { created.code = data; return { id: 'code-1', ...data }; },
      findUnique: async () => codeRow,
      updateMany: async () => ({ count: codeRow && !codeRow.consumedAt ? 1 : 0 }),
    },
    auditLog: { create: async () => ({}) },
  };
}

const link = (personKey, entityId, localUserEmail = personKey) => ({ personKey, entityId, localUserEmail, status: 'active' });

test('chuẩn hóa đầu vào cầu nối nhân sự: email, redirect nội bộ, độ dài tin nhắn', () => {
  assert.equal(normalizePersonKey('  Bao.Yen@Egoric.VN '), 'bao.yen@egoric.vn');
  assert.throws(() => normalizePersonKey('không-phải-email'), (e) => e.code === 'ceo_staff_email_invalid');
  assert.equal(normalizeRedirectPath('/tasks?focus=1'), '/tasks?focus=1');
  assert.equal(normalizeRedirectPath('https://evil.example/x'), '/dashboard'); // chặn open redirect
  assert.equal(normalizeRedirectPath('//evil.example'), '/dashboard');
  assert.equal(normalizeStaffMessage('  xin chào  '), 'xin chào');
  assert.throws(() => normalizeStaffMessage('x'.repeat(2001)), (e) => e.code === 'ceo_staff_message_too_long');
  assert.throws(() => assertDistinctEntities('aim', 'aim'), (e) => e.code === 'ceo_staff_entity_pair_invalid');
});

test('công ty gọi portal phải khớp shared secret của chính nó', () => {
  const env = { CEO_ENTITY_EGORIC_API_KEY: 'ceos_secret_egoric_0123456789abcdef' };
  const request = (headers) => ({ headers: { get: (key) => headers[key.toLowerCase()] ?? null } });
  assert.equal(authenticateEntityCaller(request({ 'x-ceo-entity-id': 'egoric', authorization: 'Bearer ceos_secret_egoric_0123456789abcdef' }), { env }), 'egoric');
  assert.throws(() => authenticateEntityCaller(request({ 'x-ceo-entity-id': 'egoric', authorization: 'Bearer ceos_secret_sai_0123456789abcdefff' }), { env }), (e) => e.code === 'ceo_staff_caller_unauthorized');
  assert.throws(() => authenticateEntityCaller(request({ authorization: 'Bearer ceos_secret_egoric_0123456789abcdef' }), { env }), (e) => e.code === 'ceo_staff_caller_unidentified');
  // công ty khác không mượn được danh nghĩa khi thiếu secret riêng
  assert.throws(() => authenticateEntityCaller(request({ 'x-ceo-entity-id': 'aim', authorization: 'Bearer ceos_secret_egoric_0123456789abcdef' }), { env }), (e) => e.code === 'ceo_staff_caller_unauthorized');
});

test('chỉ phát mã SSO khi nhân sự có mặt ở CẢ HAI công ty', async () => {
  const person = 'bao.yen@egoric.vn';
  const links = { [`${person}@egoric`]: link(person, 'egoric'), [`${person}@aim`]: link(person, 'aim', 'baoyen@agency.vn') };
  const store = db({ links });
  const result = await issueStaffSsoCode(store, { sourceEntityId: 'egoric', targetEntityId: 'aim', sourceUserEmail: person, redirectPath: '/myday' }, { hashSecret: 's' });
  assert.match(result.code, /^stf_[0-9a-f]{48}$/);
  assert.equal(result.target.callbackUrl, 'https://agency-erp-mu.vercel.app/api/staff-sso/callback');
  // mã lưu dạng băm, email tại công ty đích được dùng chứ không phải email nguồn
  assert.equal(store.created.code.codeHash, hashStaffCode(result.code, 's'));
  assert.equal(store.created.code.localUserEmail, 'baoyen@agency.vn');
  assert.equal(store.created.code.redirectPath, '/myday');

  const missing = db({ links: { [`${person}@egoric`]: link(person, 'egoric') } });
  await assert.rejects(
    issueStaffSsoCode(missing, { sourceEntityId: 'egoric', targetEntityId: 'aim', sourceUserEmail: person }, { hashSecret: 's' }),
    (error) => error instanceof CeoStaffError && error.code === 'ceo_staff_link_missing',
  );
});

test('mã SSO dùng một lần, hết hạn và không dùng chéo công ty', async () => {
  const person = 'bao.yen@egoric.vn';
  const links = { [`${person}@aim`]: link(person, 'aim', 'baoyen@agency.vn') };
  const base = { personKey: person, sourceEntity: 'egoric', targetEntity: 'aim', localUserEmail: 'baoyen@agency.vn', redirectPath: '/dashboard', consumedAt: null };

  const fresh = db({ links, codeRow: { id: 'c1', ...base, expiresAt: new Date(Date.now() + 30_000) } });
  const claim = await redeemStaffSsoCode(fresh, { targetEntityId: 'aim', code: 'stf_x' }, { hashSecret: 's' });
  assert.equal(claim.localUserEmail, 'baoyen@agency.vn');
  assert.equal(claim.sourceEntity, 'egoric');

  const expired = db({ links, codeRow: { id: 'c2', ...base, expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(redeemStaffSsoCode(expired, { targetEntityId: 'aim', code: 'stf_x' }, { hashSecret: 's' }), (e) => e.code === 'ceo_staff_code_invalid');

  const used = db({ links, codeRow: { id: 'c3', ...base, consumedAt: new Date(), expiresAt: new Date(Date.now() + 30_000) } });
  await assert.rejects(redeemStaffSsoCode(used, { targetEntityId: 'aim', code: 'stf_x' }, { hashSecret: 's' }), (e) => e.code === 'ceo_staff_code_invalid');

  const wrongTarget = db({ links, codeRow: { id: 'c4', ...base, expiresAt: new Date(Date.now() + 30_000) } });
  await assert.rejects(redeemStaffSsoCode(wrongTarget, { targetEntityId: 'egoric', code: 'stf_x' }, { hashSecret: 's' }), (e) => e.code === 'ceo_staff_code_invalid');
});
