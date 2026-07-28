import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPlace, evaluateAttendanceContext, maskIp, normalizeStrictness, parseOfficeNetworks } from '../lib/attendance-context.js';

test('phân loại nơi bấm theo mạng công ty đã khai', () => {
  const networks = ['113.161.10.', '27.72.88.145'];
  assert.equal(classifyPlace('113.161.10.55', networks), 'office');
  assert.equal(classifyPlace('27.72.88.145', networks), 'office');
  assert.equal(classifyPlace('1.2.3.4', networks), 'remote');
  // công ty chưa khai mạng → hệ thống không phán xét
  assert.equal(classifyPlace('1.2.3.4', []), 'unknown');
  assert.equal(classifyPlace('', networks), 'unknown');
  assert.deepEqual(parseOfficeNetworks('113.161.10.\n27.72.88.145'), ['113.161.10.', '27.72.88.145']);
  assert.equal(normalizeStrictness('bừa'), 'off');
});

test('che phần cuối IP — đủ đối chiếu mạng, không thành hồ sơ theo dõi', () => {
  assert.equal(maskIp('113.161.10.55'), '113.161.10.x');
  assert.equal(maskIp('2001:db8:85a3:1::9'), '2001:db8:85a3::');
  assert.equal(maskIp(''), '');
});

test('mức off giữ nguyên hành vi cũ: ai bấm ở đâu cũng được, chỉ ghi nhận', () => {
  const result = evaluateAttendanceContext({ ip: '1.2.3.4', settings: { attendanceStrictness: 'off', officeNetworks: ['113.161.10.'] } });
  assert.equal(result.allowed, true);
  assert.equal(result.place, 'remote');
  assert.equal(result.note, null);
  assert.equal(result.ip, '1.2.3.x');
});

test('mức warn vẫn cho bấm nhưng ghi chú; mức strict chặn khai đi-làm từ ngoài', () => {
  const settings = { attendanceStrictness: 'warn', officeNetworks: ['113.161.10.'] };
  const warn = evaluateAttendanceContext({ ip: '1.2.3.4', settings, status: 'present' });
  assert.equal(warn.allowed, true);
  assert.match(warn.note, /ngoài mạng công ty/);

  const strict = evaluateAttendanceContext({ ip: '1.2.3.4', settings: { ...settings, attendanceStrictness: 'strict' }, status: 'present' });
  assert.equal(strict.allowed, false);

  // người khai làm từ xa hôm đó KHÔNG bị chặn — chỉ chặn khai có mặt tại văn phòng
  const remoteWorker = evaluateAttendanceContext({ ip: '1.2.3.4', settings: { ...settings, attendanceStrictness: 'strict' }, status: 'remote' });
  assert.equal(remoteWorker.allowed, true);

  // bấm trong mạng công ty luôn qua
  const onsite = evaluateAttendanceContext({ ip: '113.161.10.9', settings: { ...settings, attendanceStrictness: 'strict' }, status: 'present' });
  assert.equal(onsite.allowed, true);
  assert.equal(onsite.place, 'office');
});
