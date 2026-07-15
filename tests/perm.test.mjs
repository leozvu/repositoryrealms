// v3.13: test vai trò — nền của toàn bộ phân quyền, sai ở đây là sai cả hệ thống.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rolesOf, hasAny, isDirector, isFreelancer } from '../lib/perm.js';

test('rolesOf: đọc được roles dạng chuỗi JSON lẫn mảng', () => {
  assert.deepEqual(rolesOf({ roles: '["PM"]' }), ['PM']);
  assert.deepEqual(rolesOf({ roles: ['PM', 'AM'] }), ['PM', 'AM']);
});

test('rolesOf: roles hỏng thì lùi về cột role cũ, không nổ', () => {
  assert.deepEqual(rolesOf({ roles: '[[[hỏng', role: 'HR' }), ['HR']);
  assert.deepEqual(rolesOf({ roles: '[]', role: 'AM' }), ['AM']);
  assert.deepEqual(rolesOf({}), ['STAFF']); // không có gì → mặc định thấp nhất
});

test('rolesOf: MANAGER cũ nở ra PM + AM + Kế toán', () => {
  const r = rolesOf({ role: 'MANAGER', roles: '["MANAGER"]' });
  assert.ok(r.includes('PM') && r.includes('AM') && r.includes('ACCOUNTANT'));
  assert.ok(!r.includes('MANAGER'), 'không được giữ lại MANAGER sau khi nở');
});

test('hasAny: Giám đốc luôn qua mọi cửa', () => {
  const gd = { roles: '["DIRECTOR"]' };
  assert.equal(hasAny(gd, ['ACCOUNTANT']), true);
  assert.equal(hasAny(gd, []), true, 'kể cả danh sách rỗng');
  assert.equal(isDirector(gd), true);
});

test('hasAny: nhân viên thường không qua cửa của vai trò khác', () => {
  const nv = { roles: '["STAFF"]' };
  assert.equal(hasAny(nv, ['ACCOUNTANT', 'HR']), false);
  assert.equal(hasAny(nv, ['STAFF']), true);
});

test('isFreelancer: nhận diện qua userType lẫn roles', () => {
  assert.equal(isFreelancer({ userType: 'freelancer' }), true);
  assert.equal(isFreelancer({ roles: '["FREELANCER"]' }), true);
  assert.equal(isFreelancer({ userType: 'employee', roles: '["PM"]' }), false);
});
