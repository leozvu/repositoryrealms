// v3.13: test phân quyền. Mỗi test dưới đây khóa lại MỘT lỗ đã từng có thật —
// nếu ai đó vô tình sửa registry làm hở lại, test này phải đỏ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESOURCES, canRead, canWrite, canDelete, filterableOf } from '../lib/registry.js';

const GD = { id: 'gd', roles: '["DIRECTOR"]' };
const PM = { id: 'pm', roles: '["PM"]' };
const HR = { id: 'hr', roles: '["HR"]' };
const KT = { id: 'kt', roles: '["ACCOUNTANT"]' };
const NV = { id: 'nv', roles: '["STAFF"]' };
const LEAD = { id: 'ld', roles: '["LEAD"]', teamId: 'team1' };

/* ===== payouts: đánh dấu đã trả mà tiền không ra sổ quỹ ===== */
test('payout: status/paidDate/userId KHÔNG đặt được qua CRUD chung', () => {
  const out = RESOURCES.payouts.filterUpdate(
    { status: 'paid', paidDate: '2026-07-15', userId: 'ke-gian', amount: 5000000, note: 'ok' }, PM);
  assert.equal(out.status, undefined, 'status phải bị bóc — chỉ /api/payouts/[id]/pay mới được đặt');
  assert.equal(out.paidDate, undefined);
  assert.equal(out.userId, undefined, 'không được đổi người nhận tiền');
  assert.equal(out.amount, 5000000, 'sửa số tiền khi chưa trả thì vẫn cho');
  assert.equal(out.note, 'ok');
});

test('payout: phiếu đã trả là chứng từ — khóa, không sửa nữa', () => {
  assert.equal(RESOURCES.payouts.canWriteRow({ status: 'paid' }, GD), false, 'kể cả Giám đốc');
  assert.equal(RESOURCES.payouts.canWriteRow({ status: 'pending' }, PM), true);
});

test('payout: nhân viên thường không đọc/ghi được', () => {
  assert.equal(canRead('payouts', NV), false);
  assert.equal(canWrite('payouts', NV), false);
  assert.equal(canRead('payouts', KT), true);
});

/* ===== reviews: nhân viên ghi đè nhận xét của sếp ===== */
test('review: nhân viên không ghi được mgrNote, không tự chốt final', () => {
  const out = RESOURCES.reviews.filterUpdate(
    { mgrNote: 'tự khen', status: 'final', selfNote: 'tự nhận xét', scores: '[]', userId: 'nguoi-khac' }, NV);
  assert.equal(out.mgrNote, undefined, 'nhận xét quản lý phải bị bóc');
  assert.equal(out.status, 'self_done', 'tối đa chỉ tới self_done');
  assert.equal(out.userId, undefined, 'không chuyển đánh giá sang người khác');
  assert.equal(out.selfNote, 'tự nhận xét', 'phần tự nhận xét hợp lệ vẫn ghi được');
});

test('review: HR/PM/Lead vẫn ghi được nhận xét quản lý', () => {
  const out = RESOURCES.reviews.filterUpdate({ mgrNote: 'cần chủ động hơn', status: 'final' }, HR);
  assert.equal(out.mgrNote, 'cần chủ động hơn');
  assert.equal(out.status, 'final');
});

test('review: đã chốt thì người được đánh giá không sửa lại', () => {
  assert.equal(RESOURCES.reviews.canWriteRow({ userId: 'nv', status: 'final' }, NV), false);
  assert.equal(RESOURCES.reviews.canWriteRow({ userId: 'nv', status: 'self_done' }, NV), true);
  assert.equal(RESOURCES.reviews.canWriteRow({ userId: 'nguoi-khac', status: 'pending' }, NV), false,
    'không sửa được đánh giá của người khác');
  assert.equal(RESOURCES.reviews.canWriteRow({ userId: 'nv', status: 'final' }, HR), true);
});

test('review: nhân viên chỉ thấy đánh giá của mình', () => {
  assert.deepEqual(RESOURCES.reviews.scope(NV), { userId: 'nv' });
  assert.deepEqual(RESOURCES.reviews.scope(HR), {});
});

/* ===== attendance: Lead lấy được chấm công cả công ty ===== */
test('attendance: Lead chỉ thấy chấm công nhóm mình (lọc ở server)', async () => {
  const fakePrisma = { user: { findMany: async () => [{ id: 'a' }, { id: 'b' }] } };
  const w = await RESOURCES.attendance.scope(LEAD, fakePrisma);
  assert.ok(w.userId?.in, 'phải trả điều kiện lọc theo danh sách người, không được trả {} (cả công ty)');
  assert.deepEqual([...w.userId.in].sort(), ['a', 'b', 'ld']);
});

test('attendance: nhân viên chỉ thấy của mình, HR thấy tất cả', async () => {
  assert.deepEqual(await RESOURCES.attendance.scope(NV, null), { userId: 'nv' });
  assert.deepEqual(await RESOURCES.attendance.scope(HR, null), {});
  assert.deepEqual(await RESOURCES.attendance.scope(GD, null), {}, 'Giám đốc thấy tất cả');
});

test('attendance: tự chấm công không gán được sang người khác', () => {
  const out = RESOURCES.attendance.filterUpdate({ userId: 'nguoi-khac', otHours: 3 }, NV);
  assert.equal(out.userId, undefined);
  assert.equal(out.otHours, 3);
  assert.equal(RESOURCES.attendance.filterUpdate({ userId: 'x' }, HR).userId, 'x', 'HR thì được');
});

/* ===== users: rò bí mật 2FA ===== */
test('user: KHÔNG bao giờ trả passwordHash / totpSecret ra ngoài', () => {
  const row = { id: 'x', name: 'A', passwordHash: '$2a$hash', totpSecret: 'BIMAT2FA', salary: 99, loginFails: 3, lockedUntil: new Date() };
  for (const ai of [GD, HR, KT, NV, PM]) {
    const s = RESOURCES.users.sanitize(row, ai);
    assert.equal(s.passwordHash, undefined, 'lộ passwordHash cho ' + ai.roles);
    assert.equal(s.totpSecret, undefined, 'lộ bí mật 2FA cho ' + ai.roles + ' → sinh được mã 2FA của người khác');
    assert.equal(s.loginFails, undefined);
    assert.equal(s.lockedUntil, undefined);
    assert.equal(s.has2fa, true, 'vẫn cho biết CÓ bật 2FA hay không');
  }
});

test('user: lương chỉ Giám đốc/HR/Kế toán và chính chủ được xem', () => {
  const row = { id: 'nv', name: 'A', passwordHash: 'h', salary: 14000000 };
  assert.equal(RESOURCES.users.sanitize(row, GD).salary, 14000000);
  assert.equal(RESOURCES.users.sanitize(row, HR).salary, 14000000);
  assert.equal(RESOURCES.users.sanitize(row, NV).salary, 14000000, 'chính chủ xem được lương mình');
  assert.equal(RESOURCES.users.sanitize(row, PM).salary, undefined, 'PM không xem được lương người khác');
});

test('user: không ai ghi qua CRUD chung (đi đường /api/users)', () => {
  for (const ai of [GD, HR, NV]) assert.equal(canWrite('users', ai), false);
});

/* ===== doclinks: sửa URL người khác → phishing ===== */
test('doclink: chỉ người gắn hoặc AM/PM sửa được URL', () => {
  const link = { addedBy: 'nguoi-khac', url: 'https://drive.google.com/that' };
  assert.equal(RESOURCES.doclinks.canWriteRow(link, NV), false);
  assert.equal(RESOURCES.doclinks.canWriteRow(link, PM), true);
  assert.equal(RESOURCES.doclinks.canWriteRow({ addedBy: 'nv' }, NV), true);
});

test('doclink: tạo link luôn ghi lại người gắn', () => {
  assert.equal(RESOURCES.doclinks.beforeCreate({ url: 'x' }, NV).addedBy, 'nv');
});

/* ===== tasks ===== */
test('task: nhân viên không tự gán việc cho người khác', () => {
  assert.equal(RESOURCES.tasks.filterUpdate({ assigneeId: 'ai-do', title: 'x' }, NV).assigneeId, undefined);
  assert.equal(RESOURCES.tasks.filterUpdate({ assigneeId: 'ai-do' }, PM).assigneeId, 'ai-do');
  const forged = RESOURCES.tasks.filterUpdate({ title: 'x', workVersion: 99, escalationLevel: 3, mergedIntoTaskId: 'task-2' }, PM);
  assert.deepEqual(forged, { title: 'x' });
});

test('task: nhân viên chỉ sửa việc của mình', () => {
  assert.equal(RESOURCES.tasks.canWriteRow({ assigneeId: 'nv' }, NV), true);
  assert.equal(RESOURCES.tasks.canWriteRow({ assigneeId: 'nguoi-khac' }, NV), false);
  assert.equal(RESOURCES.tasks.canWriteRow({ assigneeId: 'nguoi-khac' }, PM), true);
});

/* ===== bộ lọc server ===== */
test('bộ lọc: chỉ nhận cột trong danh sách trắng', () => {
  assert.ok(filterableOf('timelogs').includes('taskId'));
  assert.ok(!filterableOf('timelogs').includes('hours'), 'không cho lọc cột tùy ý');
  assert.deepEqual(filterableOf('users'), [], 'users không cho lọc → không dò được nhân sự qua query');
  assert.deepEqual(filterableOf('khong-ton-tai'), []);
});

/* ===== chốt chặn chung ===== */
test('nhật ký hệ thống: chỉ Giám đốc', () => {
  for (const ai of [PM, HR, KT, NV]) assert.equal(canRead('audit', ai), false);
  assert.equal(canRead('audit', GD), true);
});

test('webhook/rule: chỉ Giám đốc (tránh gọi URL tùy ý ra ngoài)', () => {
  for (const r of ['webhooks', 'rules']) {
    for (const ai of [PM, KT, NV]) assert.equal(canWrite(r, ai), false, r + ' hở cho ' + ai.roles);
    assert.equal(canWrite(r, GD), true);
  }
});

test('mọi resource đều khai báo đủ read/write/del', () => {
  for (const [ten, cfg] of Object.entries(RESOURCES)) {
    assert.ok(Array.isArray(cfg.read), ten + ' thiếu read');
    assert.ok(Array.isArray(cfg.write), ten + ' thiếu write');
    assert.ok(Array.isArray(cfg.del), ten + ' thiếu del');
    assert.ok(cfg.model, ten + ' thiếu model');
  }
});
