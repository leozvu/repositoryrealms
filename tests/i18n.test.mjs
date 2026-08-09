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

test('English UI copy translates dynamic Realm status without translating record names', () => {
  assert.equal(translateUiCopy('Chào mừng trở lại, Vũ Lương Sơn', 'en'), 'Welcome back, Vũ Lương Sơn');
  assert.equal(translateUiCopy('0 đồng đội', 'en'), '0 teammates');
  assert.equal(translateUiCopy('1 đồng đội', 'en'), '1 teammate');
  assert.equal(translateUiCopy('1 nhiệm vụ', 'en'), '1 Quest');
  assert.equal(translateUiCopy('3 người trong tầm thoại', 'en'), '3 people within voice range');
  assert.equal(translateUiCopy('Đã mở Sổ Realm · personal.', 'en'), 'Opened Realm Ledger · personal.');
  assert.equal(translateUiCopy('2 ngày có TimeLog', 'en'), '2 days with TimeLog');
  assert.equal(translateUiCopy('4h ước lượng', 'en'), '4h estimated');
  assert.equal(translateUiCopy('1 vật phẩm sở hữu', 'en'), '1 owned item');
  assert.equal(translateUiCopy('2 yêu cầu đang chờ hội đồng', 'en'), '2 requests awaiting council');
  assert.equal(translateUiCopy('Mở bản ghi Ghi giờ cho Rồng Xanh', 'en'), 'Open record Ghi giờ cho Rồng Xanh');
  assert.equal(translateUiCopy('Khóa sổ chiến dịch Rồng Xanh', 'en'), 'Blue Dragon Operations Window');
});

test('Phase 4 Inbox and Collaboration copy is available in English without translating record names', () => {
  assert.equal(translateUiCopy('Hộp thư hợp nhất', 'en'), 'Unified Inbox');
  assert.equal(translateUiCopy('Điều phối cộng tác', 'en'), 'Collaboration');
  assert.equal(translateUiCopy('Không hiển thị raw heartbeat, thời lượng online, Task, Gold hoặc điểm hiệu suất.', 'en'), 'Raw heartbeat, online duration, Tasks, Gold, and performance scores are never displayed.');
  assert.equal(translateUiCopy('Message record đã được lưu: msg_01', 'en'), 'Message record saved: msg_01');
  assert.equal(translateUiCopy('Contact request đã được ghi nhận: contact_01.', 'en'), 'Contact request recorded: contact_01.');
  assert.equal(translateUiCopy('Chiến dịch mùa thu', 'en'), 'Chiến dịch mùa thu');
});

test('Phase 5 Project Realm and Chronicle copy is available in English without translating record names', () => {
  assert.equal(translateUiCopy('Project Realm', 'en'), 'Project Realm');
  assert.equal(translateUiCopy('Tín hiệu cần quyết định', 'en'), 'Signals requiring a decision');
  assert.equal(translateUiCopy('Chronicle này là AuditLog ERP chỉ đọc.', 'en'), 'This Chronicle is the read-only ERP AuditLog.');
  assert.equal(translateUiCopy('Không sửa lịch sử tại đây.', 'en'), 'History cannot be edited here.');
  assert.equal(translateUiCopy('Chiến dịch Rồng Xanh', 'en'), 'Chiến dịch Rồng Xanh');
});

test('Phase 6 World Map and CEO Terminal copy preserves executive accounting meanings', () => {
  assert.equal(translateUiCopy('Bản đồ bốn công ty', 'en'), 'Four-company Map');
  assert.equal(translateUiCopy('Danh sách công ty tương đương', 'en'), 'Equivalent company list');
  assert.equal(translateUiCopy('Không phải recognized revenue', 'en'), 'Not recognized revenue');
  assert.equal(translateUiCopy('GMV không phải revenue', 'en'), 'GMV is not revenue');
  assert.equal(translateUiCopy('Chiến dịch Rồng Xanh', 'en'), 'Chiến dịch Rồng Xanh');
});

test('Phase 7 Employee Profile and Recognition copy preserves privacy and Gold meaning', () => {
  assert.equal(translateUiCopy('Hồ sơ nhân sự', 'en'), 'Employee Profile');
  assert.equal(translateUiCopy('Kỹ năng & bằng chứng', 'en'), 'Skills & evidence');
  assert.equal(translateUiCopy('Số dư hiện tại', 'en'), 'Current balance');
  assert.equal(translateUiCopy('Hạn mức policy cá nhân', 'en'), 'Personal policy limit');
  assert.equal(translateUiCopy('Mở Hội đồng Gold', 'en'), 'Open Gold Council');
  assert.equal(translateUiCopy('Chiến dịch Rồng Xanh', 'en'), 'Chiến dịch Rồng Xanh');
});

test('Phase 8 final experience copy is available in English without translating record names', () => {
  assert.equal(translateUiCopy('Thông báo', 'en'), 'Notifications');
  assert.equal(translateUiCopy('Tìm kiếm toàn hệ thống', 'en'), 'Search & Commands');
  assert.equal(translateUiCopy('Cài đặt Realm', 'en'), 'Realm Settings');
  assert.equal(translateUiCopy('Không gian làm việc di động', 'en'), 'Mobile Workspace');
  assert.equal(translateUiCopy('Chiến dịch Rồng Xanh', 'en'), 'Chiến dịch Rồng Xanh');
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
