import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ERP_NAV } from '../lib/erp-navigation.js';
import { GENERATED_EN_UI_COPY } from '../lib/i18n.generated.js';
import { EN_UI_COPY, normalizeAppLocale, translateUiCopy } from '../lib/i18n.js';

test('app locale accepts Vietnamese and English with a safe Vietnamese fallback', () => {
  assert.equal(normalizeAppLocale('EN'), 'en');
  assert.equal(normalizeAppLocale('vi'), 'vi');
  assert.equal(normalizeAppLocale('fr'), 'vi');
  assert.equal(normalizeAppLocale(null), 'vi');
});

test('English UI copy translates shell vocabulary without touching unknown business data', () => {
  assert.equal(translateUiCopy('Bảng điều khiển', 'en'), 'Dashboard');
  assert.equal(translateUiCopy('  Đăng nhập  ', 'en'), '  Sign in  ');
  assert.equal(translateUiCopy('Chiến dịch Rồng Xanh', 'en'), 'Chiến dịch Rồng Xanh');
  assert.equal(translateUiCopy('Bảng điều khiển', 'vi'), 'Bảng điều khiển');
});

test('every Vietnamese ERP navigation label has an English counterpart', () => {
  const vietnamese = /[À-ỹĐđ]/;
  const missing = ERP_NAV
    .flatMap((item) => [item.section, item.label])
    .filter((copy) => copy && vietnamese.test(copy) && !EN_UI_COPY[copy]);
  assert.deepEqual(missing, []);
});

test('legacy ERP and Realm screens have an app-wide static English fallback catalog', () => {
  assert.ok(Object.keys(GENERATED_EN_UI_COPY).length >= 2500);
  assert.ok(GENERATED_EN_UI_COPY['Chưa có hóa đơn']);
  assert.ok(GENERATED_EN_UI_COPY['Bạn không có quyền xem trang này']);
  assert.ok(GENERATED_EN_UI_COPY['Chưa có Party riêng']);
  assert.notEqual(GENERATED_EN_UI_COPY['Chưa có hóa đơn'], 'Chưa có hóa đơn');
});

test('Realm ledger is restored as a stable deep-link from ERP navigation', () => {
  const ledger = ERP_NAV.find((item) => item.key === 'realm-ledger');
  assert.deepEqual(
    { href: ledger?.href, realmSurface: ledger?.realmSurface, label: ledger?.label },
    { href: '/realm?view=ledger', realmSurface: true, label: 'Sổ Realm' },
  );
  const realmPage = fs.readFileSync(new URL('../app/(app)/realm/page.jsx', import.meta.url), 'utf8');
  const realmOffice = fs.readFileSync(new URL('../components/realm/RealmOffice.jsx', import.meta.url), 'utf8');
  assert.match(realmPage, /query\?\.view === 'ledger'/);
  assert.match(realmOffice, /initialMode === 'ledger'/);
});
