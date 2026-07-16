// v3.15: test "vai trò làm được đúng việc của mình".
//
// Bắt nguồn từ một lỗi Leoz phát hiện khi dùng thật: HR không thêm được nhân sự.
// Đào ra thì có 3 nút cùng một bệnh — GIAO DIỆN MỜI, API TỪ CHỐI. Cổng ở giao diện và cổng
// ở API được viết riêng rẽ rồi trôi lệch nhau, và lỗi im lặng nên không ai báo.
//
// File này khóa 2 thứ:
//  1. Mỗi vai trò PHẢI làm được việc lõi của mình (nếu không thì người đó đứng hình)
//  2. Mỗi vai trò KHÔNG được làm việc của người khác (nếu không thì hở quyền)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canRead, canWrite, canDelete } from '../lib/registry.js';

const U = r => ({ id: 'u', roles: JSON.stringify(Array.isArray(r) ? r : [r]) });
const GD = U('DIRECTOR'), PM = U('PM'), AM = U('AM'), KT = U('ACCOUNTANT');
const HR = U('HR'), LEAD = U('LEAD'), NV = U('STAFF');

/* ===== Việc lõi của từng vai trò — thiếu là người đó đứng hình ===== */
test('HR làm được việc của HR', () => {
  for (const r of ['candidates', 'onboardings', 'leaves', 'attendance', 'teams', 'assets', 'holidays', 'reviews']) {
    assert.equal(canWrite(r, HR), true, `HR phải ghi được ${r}`);
  }
});

test('PM làm được việc của PM', () => {
  for (const r of ['projects', 'tasks', 'milestones', 'phases', 'vendors', 'vendorbills', 'projecttemplates']) {
    assert.equal(canWrite(r, PM), true, `PM phải ghi được ${r}`);
  }
});

test('AM làm được việc của AM', () => {
  for (const r of ['leads', 'clients', 'quotes', 'services', 'contacts', 'activities']) {
    assert.equal(canWrite(r, AM), true, `AM phải ghi được ${r}`);
  }
});

test('Kế toán làm được việc của Kế toán', () => {
  for (const r of ['invoices', 'transactions', 'budgets', 'commissions', 'vendorbills', 'contracts', 'payouts']) {
    assert.equal(canWrite(r, KT), true, `Kế toán phải ghi được ${r}`);
  }
});

// v3.16: LEAD = trưởng nhóm marketing ≈ product lead (sản phẩm của agency là dịch vụ marketing).
// Leoz báo "quyền của lead có vẻ không đủ" — đúng: LEAD chỉ đọc được dự án, không đặt được mốc,
// và không thấy báo giá nên không biết đã bán scope gì mà vẫn phải giao đúng.
test('LEAD chạy được mảng giao hàng (ngang PM)', () => {
  for (const r of ['projects', 'milestones', 'tasks', 'phases', 'vendors', 'vendorbills', 'rfqs',
    'projectmembers', 'projecttemplates', 'payouts']) {
    assert.equal(canWrite(r, LEAD), true, `LEAD phải ghi được ${r}`);
  }
  for (const r of ['quotes', 'contracts', 'contacts', 'clients']) {
    assert.equal(canRead(r, LEAD), true, `LEAD phải đọc được ${r} để biết đã bán/cam kết gì`);
  }
});

test('LEAD vẫn KHÔNG đụng được sổ tiền công ty', () => {
  // Ranh giới cố ý: LEAD lo giao hàng, Kế toán lo sổ. LEAD xem được biên lợi nhuận DỰ ÁN
  // qua /api/projects/stats, nhưng không phải sổ quỹ công ty.
  for (const r of ['invoices', 'transactions', 'budgets', 'commissions']) {
    assert.equal(canWrite(r, LEAD), false, `LEAD KHÔNG được ghi ${r}`);
  }
  assert.equal(canWrite('candidates', LEAD), false, 'tuyển dụng là việc của HR');
  assert.equal(canRead('audit', LEAD), false);
});

test('LEAD trả được freelancer thì phải thấy được sổ nhà cung cấp', () => {
  // Trước v3.16 mâu thuẫn: payouts RW nhưng vendors không đọc nổi — tiêu tiền được mà không thấy sổ.
  assert.equal(canWrite('payouts', LEAD), true);
  assert.equal(canRead('vendors', LEAD), true);
  assert.equal(canRead('vendorbills', LEAD), true);
});

test('Nhân viên làm được việc của mình (phạm vi do scope/canWriteRow chặn)', () => {
  for (const r of ['tasks', 'timelogs', 'leaves', 'attendance', 'taskcomments']) {
    assert.equal(canWrite(r, NV), true, `Nhân viên phải ghi được ${r} (của mình)`);
  }
});

/* ===== Ranh giới — vượt là hở quyền ===== */
test('AM không tự xuất hóa đơn / mở dự án qua CRUD chung', () => {
  // Chuyển báo giá thì đi qua /api/quotes/[id]/convert (có cổng gác riêng),
  // KHÔNG mở quyền ghi thẳng — nếu không AM tự xuất hóa đơn không qua Kế toán,
  // tự mở dự án không qua PM.
  assert.equal(canWrite('invoices', AM), false);
  assert.equal(canWrite('projects', AM), false);
});

test('Không ai ngoài Kế toán đụng được sổ quỹ', () => {
  for (const ai of [PM, AM, HR, LEAD, NV]) assert.equal(canWrite('transactions', ai), false);
  assert.equal(canWrite('transactions', KT), true);
});

test('Nhân viên không đụng được tiền và hồ sơ nhạy cảm', () => {
  for (const r of ['invoices', 'transactions', 'budgets', 'payouts', 'commissions', 'candidates', 'contracts']) {
    assert.equal(canRead(r, NV), false, `Nhân viên KHÔNG được đọc ${r}`);
    assert.equal(canWrite(r, NV), false, `Nhân viên KHÔNG được ghi ${r}`);
  }
});

test('Nhật ký hệ thống + webhook + rule: chỉ Giám đốc', () => {
  for (const ai of [PM, AM, KT, HR, LEAD, NV]) {
    assert.equal(canRead('audit', ai), false);
    assert.equal(canWrite('webhooks', ai), false);
    assert.equal(canWrite('rules', ai), false);
  }
});

test('Giám đốc qua được mọi cửa (trừ resource có route ghi riêng)', () => {
  assert.equal(canWrite('transactions', GD), true);
  assert.equal(canWrite('candidates', GD), true);
  assert.equal(canRead('audit', GD), true);
  assert.equal(canWrite('users', GD), false, 'users ghi qua /api/users, writeVia chặn cả Giám đốc');
});

/* ===== Chống trôi lệch giao diện ↔ API =====
   Mỗi dòng = một nút CÓ THẬT trên giao diện, ghi rõ vai trò nào thấy nút và nút đó ghi vào đâu.
   Thêm nút mới mà quên mở quyền → test này đỏ ngay, thay vì người dùng bấm rồi ăn 403 im lặng. */
test('mọi nút trên giao diện đều được API cho qua', () => {
  const NUT = [
    // [mô tả nút, vai trò thấy nút, resource nút đó ghi vào]
    ['Công việc → tạo/sửa việc', NV, 'tasks'],
    ['Chấm công → Vào ca', NV, 'attendance'],
    ['Nghỉ phép → xin nghỉ', NV, 'leaves'],
    ['Chấm giờ → ghi giờ', NV, 'timelogs'],
    ['Việc → bình luận', NV, 'taskcomments'],
    ['Báo giá → tạo báo giá', AM, 'quotes'],
    ['Khách hàng → thêm khách', AM, 'clients'],
    ['Lead → thêm lead', AM, 'leads'],
    ['Dự án → tạo dự án', PM, 'projects'],
    ['Dự án → thêm mốc', PM, 'milestones'],
    ['NCC → tạo phiếu', PM, 'vendorbills'],
    ['Hóa đơn → tạo hóa đơn', KT, 'invoices'],
    ['Thu chi → ghi sổ', KT, 'transactions'],
    ['Ngân sách → đặt hạn mức', KT, 'budgets'],
    ['Freelancer → chốt thanh toán', HR, 'payouts'],
    ['Tuyển dụng → thêm ứng viên', HR, 'candidates'],
    ['Nhân sự → tạo nhóm', HR, 'teams'],
    ['Ngày lễ → thêm ngày lễ', HR, 'holidays'],
    ['Công việc → giai đoạn', LEAD, 'phases'],
  ];
  for (const [nut, ai, res] of NUT) {
    assert.equal(canWrite(res, ai), true, `Nút "${nut}" hiện ra nhưng API chặn ghi ${res}`);
  }
});
