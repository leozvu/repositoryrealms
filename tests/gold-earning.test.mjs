import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GOLD_SOURCE, attendanceEarnsGold, capDailyGold, goldIdempotencyKey, goldSettings, taskEarnsGold,
} from '../lib/gold-earning.js';

test('Gold tắt mặc định; tham số có trần chống nhập bừa', () => {
  assert.equal(goldSettings({}).enabled, false);
  assert.equal(goldSettings({ goldEnabled: true }).enabled, true);
  assert.equal(goldSettings({ goldEnabled: 'true' }).enabled, false); // chỉ boolean thật mới bật
  assert.equal(goldSettings({ goldPerOnTimeTask: 99999 }).perOnTimeTask, 100);
  assert.equal(goldSettings({ goldPerOnTimeTask: -5 }).perOnTimeTask, 10);
});

test('việc xong ĐÚNG HẠN mới có Gold; xong muộn hoặc không hạn thì không', () => {
  const base = { id: 't1', title: 'Thiết kế banner', status: 'done', dueDate: '2026-07-20' };
  const onTime = taskEarnsGold({ ...base, completedAt: '2026-07-19T10:00:00Z' });
  assert.equal(onTime.earned, true);
  assert.equal(onTime.source, GOLD_SOURCE.ON_TIME_TASK);

  assert.equal(taskEarnsGold({ ...base, completedAt: '2026-07-25T10:00:00Z' }).earned, false);
  assert.equal(taskEarnsGold({ ...base, dueDate: null, completedAt: '2026-07-19T10:00:00Z' }).reason, 'no_deadline');
  // hoàn thành đúng ngày hạn vẫn tính là đúng hạn
  assert.equal(taskEarnsGold({ ...base, completedAt: '2026-07-20T23:00:00Z' }).earned, true);
});

test('không cộng Gold hai lần cho việc đã xong từ trước', () => {
  const task = { id: 't1', title: 'X', status: 'done', dueDate: '2026-07-20', completedAt: '2026-07-19T10:00:00Z' };
  assert.equal(taskEarnsGold(task, { status: 'done' }), null); // sửa việc đã done → không cộng lại
  assert.ok(taskEarnsGold(task, { status: 'doing' }).earned); // vừa chuyển sang done → có cộng
  assert.equal(taskEarnsGold({ ...task, status: 'doing' }), null); // chưa xong → không xét
});

test('ngày công đủ giờ mới có Gold; thiếu giờ/thiếu chấm ra thì không', () => {
  const full = attendanceEarnsGold({ date: '2026-07-20', status: 'present', checkIn: '09:00', checkOut: '18:00' });
  assert.equal(full.earned, true);
  assert.equal(full.source, GOLD_SOURCE.FULL_ATTENDANCE);
  assert.equal(full.sourceId, '2026-07-20');

  assert.equal(attendanceEarnsGold({ date: '2026-07-20', status: 'present', checkIn: '09:00', checkOut: '12:00' }).reason, 'short_day');
  assert.equal(attendanceEarnsGold({ date: '2026-07-20', status: 'present', checkIn: '09:00' }), null); // chưa tan ca
  assert.equal(attendanceEarnsGold({ date: '2026-07-20', status: 'off', checkIn: '09:00', checkOut: '18:00' }), null); // ngày nghỉ
  // remote đủ giờ vẫn được — không phân biệt đối xử người làm từ xa
  assert.equal(attendanceEarnsGold({ date: '2026-07-20', status: 'remote', checkIn: '08:30', checkOut: '17:40' }).earned, true);
});

test('khóa chống trùng ổn định + trần Gold mỗi ngày', () => {
  const key = goldIdempotencyKey('u1', GOLD_SOURCE.ON_TIME_TASK, 't1');
  assert.equal(key, goldIdempotencyKey('u1', GOLD_SOURCE.ON_TIME_TASK, 't1'));
  assert.notEqual(key, goldIdempotencyKey('u2', GOLD_SOURCE.ON_TIME_TASK, 't1'));

  assert.equal(capDailyGold(10, 0, 60), 10);
  assert.equal(capDailyGold(10, 55, 60), 5); // chỉ còn 5 trong hạn mức
  assert.equal(capDailyGold(10, 60, 60), 0); // đã chạm trần
  assert.equal(capDailyGold(10, 100, 0), 10); // không đặt trần → không giới hạn
});
