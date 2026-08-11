import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { auditRoleCapabilities, ROLE_CAPABILITY_REQUIREMENTS } from '../lib/role-capability-audit.js';
import { ERP_NAV } from '../lib/erp-navigation.js';
import { repositoryRealmsContract } from '../lib/repository-realms.js';

const root = path.resolve(process.cwd());

test('mọi vai trò có đủ route đọc/ghi cho công việc lõi và không có capability gap', () => {
  const result = auditRoleCapabilities();
  assert.equal(ROLE_CAPABILITY_REQUIREMENTS.length, 7);
  assert.deepEqual(result.failures, []);
});

test('Trưởng nhóm nhìn thấy các màn delivery đã được API cho phép', () => {
  for (const key of ['quotes', 'vendors', 'contracts']) {
    const item = ERP_NAV.find((entry) => entry.key === key);
    assert.ok(item?.roles.includes('LEAD'), `LEAD phải thấy menu ${key}`);
  }
});

test('màn Quản lý công việc có luồng giao việc mới qua RepositoryRealms', () => {
  const source = fs.readFileSync(path.join(root, 'app/(app)/teamwork/page.jsx'), 'utf8');
  assert.match(source, /Giao việc mới/);
  assert.match(source, /task\.delegate\.create/);
  const contract = repositoryRealmsContract('task.delegate.create');
  assert.equal(contract?.resource, 'tasks');
  assert.equal(contract?.surface, 'command');
});

test('các màn read-only không hiển thị nút ghi vượt quyền API', () => {
  const invoices = fs.readFileSync(path.join(root, 'app/(app)/invoices/page.jsx'), 'utf8');
  const contracts = fs.readFileSync(path.join(root, 'app/(app)/contracts/page.jsx'), 'utf8');
  const assets = fs.readFileSync(path.join(root, 'app/(app)/assets/page.jsx'), 'utf8');
  assert.match(invoices, /const canWriteInvoice = hasAny\(session\?\.user, \['ACCOUNTANT'\]\)/);
  assert.match(contracts, /const canWriteContract = hasAny\(session\?\.user, \['ACCOUNTANT'\]\)/);
  assert.match(assets, /const canManageAssets = hasAny\(session\?\.user, \['HR'\]\)/);
});

test('các màn quản lý dùng đúng capability và RepositoryRealms action', () => {
  const clients = fs.readFileSync(path.join(root, 'app/(app)/clients/page.jsx'), 'utf8');
  const projects = fs.readFileSync(path.join(root, 'app/(app)/projects/page.jsx'), 'utf8');
  const tickets = fs.readFileSync(path.join(root, 'app/(app)/tickets/page.jsx'), 'utf8');
  const resources = fs.readFileSync(path.join(root, 'app/(app)/resources/page.jsx'), 'utf8');
  const tasks = fs.readFileSync(path.join(root, 'app/(app)/tasks/page.jsx'), 'utf8');
  assert.match(clients, /const canDeleteClient = isDirector\(session\?\.user\)/);
  assert.match(projects, /const isMgmt = hasAny\(session\?\.user, \['PM', 'LEAD'\]\)/);
  assert.match(projects, /const canDeleteProject = isDirector\(session\?\.user\)/);
  assert.match(tickets, /const canDeleteTicket = hasAny\(session\?\.user, \['AM', 'PM'\]\)/);
  assert.match(resources, /const canAssign = hasAny\(session\?\.user, \['PM', 'LEAD'\]\)/);
  assert.match(resources, /action: 'task\.assign'/);
  assert.doesNotMatch(resources, /tasks\.update\(t\.id, \{ assigneeId:/);
  assert.match(tasks, /action: 'task\.delegate\.create'/);
});
