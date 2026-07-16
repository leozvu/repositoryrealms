// v3.17: test bật/tắt phân hệ. Điểm mấu chốt: công ty CŨ (chưa có Setting.modules) phải
// vẫn thấy MỌI thứ — nâng cấp không được làm biến mất menu của 3 công ty đang chạy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modOn, MODULE_GROUPS, MODULE_PRESETS } from '../lib/modules.js';

test('mục lõi (không mod) luôn bật, kể cả khi tắt hết', () => {
  assert.equal(modOn(null, []), true);
  assert.equal(modOn(undefined, ['sales']), true);
  assert.equal(modOn('', []), true);
});

test('công ty cũ (modules=undefined/null) → bật hết', () => {
  assert.equal(modOn('delivery', undefined), true);
  assert.equal(modOn('delivery', null), true);
  assert.equal(modOn('export', undefined), true, 'kể cả phân hệ mới cũng coi là bật cho tới khi công ty tự tắt');
});

test('có cấu hình modules → chỉ bật cái trong danh sách', () => {
  const m = ['sales', 'procurement', 'export'];
  assert.equal(modOn('sales', m), true);
  assert.equal(modOn('delivery', m), false, 'Fretas tắt vận hành dự án');
  assert.equal(modOn('freelancers', m), false);
  assert.equal(modOn('export', m), true);
});

test('preset export KHÔNG có delivery/freelancers (Fretas không bán theo dự án)', () => {
  const ex = MODULE_PRESETS.export.mods;
  assert.ok(!ex.includes('delivery'));
  assert.ok(!ex.includes('freelancers'));
  assert.ok(ex.includes('export'));
  assert.ok(ex.includes('procurement'), 'XNK cần quản lý nhà cung cấp nông sản');
});

test('preset livestream có freelancers + commissions (host/KOC), không có delivery', () => {
  const ls = MODULE_PRESETS.livestream.mods;
  assert.ok(ls.includes('freelancers'));
  assert.ok(ls.includes('commissions'));
  assert.ok(ls.includes('livestream'));
  assert.ok(!ls.includes('delivery'));
});

test('mọi mod trong preset đều là mod có thật (không gõ sai)', () => {
  const valid = new Set(MODULE_GROUPS.map(g => g.mod));
  for (const [name, p] of Object.entries(MODULE_PRESETS)) {
    for (const mod of p.mods) {
      assert.ok(valid.has(mod), `preset ${name} tham chiếu mod không tồn tại: ${mod}`);
    }
  }
});
