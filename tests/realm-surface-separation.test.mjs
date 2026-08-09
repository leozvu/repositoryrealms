import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Realm demo keeps local fixtures while its ERP gateway opens the original workspace', () => {
  const demoPage = read('app', 'realm-demo', 'page.jsx');
  const office = read('components', 'realm', 'RealmOffice.jsx');

  assert.match(demoPage, /<RealmOffice erpHref="\/dashboard" demoMode initialMode=/);
  assert.match(office, /realmDataSourceMode\(\{ erpHref: demoMode \? null : erpHref/);
  assert.match(office, /aria-label="Mở workspace ERP CRM gốc"/);
  assert.match(office, /href=\{erpHref\}/);
  assert.match(office, /fetch\('\/api\/realm-demo\/session'/);
  assert.match(office, /if \(!demoMode \|\| erpHandoffState === 'loading'\) return/);
});

test('only Sổ Realm can enter the gamified ledger mode', () => {
  const office = read('components', 'realm', 'RealmOffice.jsx');
  const ledgerButtons = [...office.matchAll(/<button[^>]*onClick=\{\(\) => setMode\('ledger'\)\}[^>]*>([\s\S]*?)<\/button>/g)];

  assert.ok(ledgerButtons.length >= 2);
  assert.ok(ledgerButtons.every((match) => match[1].includes('Sổ Realm') || match[1].includes('Sổ Realm & Tavern')));
  assert.doesNotMatch(office, /setMode\('ledger'\)[\s\S]{0,180}>ERP · CRM<\/button>/);
  assert.match(office, /Giao diện gamified, không thay thế ERP/);
});

test('the ERP shell retains the original business navigation and exposes Realm as optional', () => {
  const shell = read('components', 'Shell.jsx');
  const collaboration = read('components', 'collaboration', 'CollaborationBridge.jsx');

  assert.match(shell, /const NAV = ERP_NAV/);
  assert.match(shell, /ERP · CRM · 7 vai trò nghiệp vụ/);
  assert.match(collaboration, /const href = realm \? '\/dashboard' : realmV2Available \? '\/realm-v2\/home' : '\/realm'/);
  assert.match(collaboration, /const label = realm \? 'ERP · CRM' : 'Mở Realm'/);
  assert.match(collaboration, /Mở văn phòng Realm tùy chọn/);
  assert.match(collaboration, /pathname\.startsWith\('\/realm-v2'\)/);
});

test('the separation contract keeps synchronization below the presentation layer', () => {
  const contract = read('docs', 'realms', 'ERP-REALM-SURFACE-SEPARATION.md');

  assert.match(contract, /two clients of the same RepositoryRealms business system/);
  assert.match(contract, /They do not share information architecture/);
  assert.match(contract, /ERP · CRM.*always a gateway to `\/dashboard`/);
  assert.match(contract, /receipt and audit entry/);
  assert.match(contract, /change feed invalidates both read models/);
});
