// v3.17: test bật/tắt phân hệ. Điểm mấu chốt: công ty CŨ (chưa có Setting.modules) phải
// vẫn thấy MỌI thứ — nâng cấp không được làm biến mất menu của 3 công ty đang chạy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modOn, MODULE_GROUPS, MODULE_PRESETS, resourceMod } from '../lib/modules.js';

test('mục lõi (không mod) luôn bật, kể cả khi tắt hết', () => {
  assert.equal(modOn(null, []), true);
  assert.equal(modOn(undefined, ['sales']), true);
  assert.equal(modOn('', []), true);
});

test('công ty cũ (modules=null) → agency BẬT, phân hệ chuyên biệt TẮT', () => {
  // các phân hệ agency cũ vẫn bật → 3 công ty đang chạy không đổi
  assert.equal(modOn('delivery', null), true);
  assert.equal(modOn('sales', undefined), true);
  assert.equal(modOn('commissions', null), true);
  // v3.22: services tách khỏi sales nhưng KHÔNG nằm trong DEFAULT_OFF → công ty cũ vẫn thấy
  assert.equal(modOn('services', null), true, 'agency cũ (null) vẫn thấy Bảng giá dịch vụ');
  // 🔴 REGRESSION đã bắt: export/livestream KHÔNG được tự hiện cho agency chưa cấu hình
  assert.equal(modOn('export', null), false, 'agency modules=null KHÔNG thấy menu XNK');
  assert.equal(modOn('livestream', null), false, 'agency modules=null KHÔNG thấy menu Livestream');
});

test('v3.23: "Bảng công việc" (tasks) tách khỏi delivery — Fretas CÓ bảng việc, KHÔNG có Gantt/dự án', () => {
  const ex = MODULE_PRESETS.export.mods;
  assert.ok(ex.includes('tasks'), 'preset export có bảng công việc');
  assert.ok(!ex.includes('delivery'), 'nhưng KHÔNG có vận hành dự án (Gantt/timesheet)');
  assert.equal(modOn('tasks', ex), true, 'Fretas: menu Công việc BẬT');
  assert.equal(modOn('delivery', ex), false, 'Fretas: Gantt/dự án TẮT');
  // resource guard: tasks/taskcomments/taskevents thuộc mod tasks; projects/timelogs vẫn delivery
  assert.equal(resourceMod('tasks'), 'tasks');
  assert.equal(resourceMod('taskcomments'), 'tasks');
  assert.equal(modOn(resourceMod('tasks'), ex), true, 'API /api/data/tasks qua ở Fretas');
  assert.equal(modOn(resourceMod('projects'), ex), false, 'projects (delivery) vẫn chặn ở Fretas');
  assert.equal(modOn(resourceMod('timelogs'), ex), false, 'ghi giờ dự án (delivery) chặn ở Fretas');
  // công ty cũ (null) vẫn thấy bảng công việc
  assert.equal(modOn('tasks', null), true, 'agency cũ vẫn có bảng công việc');
  // 3 preset đều có tasks (bảng việc dùng chung mọi loại hình)
  for (const p of ['agency', 'export', 'livestream']) assert.ok(MODULE_PRESETS[p].mods.includes('tasks'), `${p} có tasks`);
});

test('v3.24: "Kho hàng / Lô" (inventory) — Fretas CÓ, công ty khác mặc định TẮT', () => {
  const ex = MODULE_PRESETS.export.mods;
  assert.ok(ex.includes('inventory'), 'preset export có kho hàng');
  assert.ok(!MODULE_PRESETS.agency.mods.includes('inventory'), 'agency không có kho');
  assert.ok(!MODULE_PRESETS.livestream.mods.includes('inventory'), 'livestream không có kho');
  // mặc định TẮT: công ty cũ (null) KHÔNG tự thấy menu kho
  assert.equal(modOn('inventory', null), false, 'agency cũ (null) KHÔNG thấy Kho hàng');
  assert.equal(modOn('inventory', ex), true, 'Fretas thấy Kho hàng');
  // resource guard
  assert.equal(resourceMod('stocklots'), 'inventory');
  assert.equal(resourceMod('stockmoves'), 'inventory');
  assert.equal(modOn(resourceMod('stocklots'), ex), true, 'API stocklots qua ở Fretas');
  assert.equal(modOn(resourceMod('stocklots'), null), false, 'API stocklots chặn ở agency');
});

test('v3.22: "Bảng giá dịch vụ" là phân hệ agency — Fretas (export) KHÔNG thấy', () => {
  const ex = MODULE_PRESETS.export.mods;
  assert.ok(!ex.includes('services'), 'preset export không có services');
  assert.ok(ex.includes('sales'), 'nhưng vẫn có sales (leads/proforma cho buyer)');
  assert.equal(modOn('services', ex), false, 'Fretas: menu Bảng giá dịch vụ TẮT');
  // leads/quotes vẫn qua vì chúng thuộc mod 'sales' (không phải 'services')
  assert.equal(modOn(resourceMod('leads'), ex), true, 'leads (mod sales) vẫn bật cho buyer CRM');
  assert.equal(modOn(resourceMod('quotes'), ex), true, 'quotes (mod sales) vẫn bật cho proforma');
  // agency preset giữ services
  assert.ok(MODULE_PRESETS.agency.mods.includes('services'), 'agency vẫn có services');
  // resource guard: services thuộc mod services → API /api/data/services bị chặn ở Fretas
  assert.equal(resourceMod('services'), 'services');
  assert.equal(modOn(resourceMod('services'), ex), false, 'API /api/data/services bị chặn ở Fretas');
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
