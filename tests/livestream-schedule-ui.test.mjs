import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(ROOT, 'app/(app)/live/page.jsx'), 'utf8');
const nav = fs.readFileSync(path.join(ROOT, 'lib/erp-navigation.js'), 'utf8');

test('livestream workspace names Egolive as an Egoric department', () => {
  assert.match(page, /Phòng Livestream Egolive/);
  assert.match(nav, /Lịch live Egolive/);
});

test('livestream workspace provides week and operations views over the same sessions', () => {
  assert.match(page, /Lịch tuần/);
  assert.match(page, /Vận hành & đối soát/);
  assert.match(page, /weekDays/);
});

test('schedule form captures host crew studio products brief and rehearsal', () => {
  for (const field of ['scheduleStatus', 'operatorId', 'moderatorId', 'studio', 'productCount', 'briefUrl', 'rehearsalAt']) {
    assert.match(page, new RegExp(`key: '${field}'`));
  }
});

test('schedule board exposes pre-live readiness', () => {
  assert.match(page, /liveScheduleReadiness/);
  assert.match(page, /Độ sẵn sàng/);
});
