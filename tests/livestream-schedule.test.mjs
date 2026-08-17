import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_SCHEDULE_STATUSES,
  liveScheduleReadiness,
  sessionInterval,
  scheduleConflicts,
  validateLiveSchedule,
} from '../lib/livestream.js';

const base = {
  id: 'live-1',
  title: 'Mega live 8.8',
  platform: 'tiktok',
  date: '2026-08-20',
  startAt: '09:00',
  durationMin: 120,
  hostId: 'host-1',
  assistantId: 'assistant-1',
  operatorId: 'operator-1',
  moderatorId: 'moderator-1',
  studio: 'Studio A',
  productCount: 12,
  briefUrl: 'https://docs.example/live-88',
  rehearsalAt: '2026-08-19T15:00',
  scheduleStatus: 'confirmed',
  status: 'scheduled',
};

test('live schedule exposes an explicit draft to confirmed lifecycle', () => {
  assert.deepEqual(LIVE_SCHEDULE_STATUSES.map(([value]) => value), ['draft', 'confirmed']);
});

test('sessionInterval converts a local schedule into comparable minutes', () => {
  assert.deepEqual(sessionInterval(base), {
    date: '2026-08-20', start: 540, end: 660,
  });
});

test('scheduleConflicts blocks overlapping assignments for the same talent', () => {
  const conflicts = scheduleConflicts(
    { ...base, id: 'new-live', startAt: '10:30', hostId: 'host-2', assistantId: 'host-1', studio: 'Studio B' },
    [base],
  );
  assert.equal(conflicts[0]?.kind, 'person');
});

test('scheduleConflicts blocks overlapping use of the same studio', () => {
  const conflicts = scheduleConflicts(
    { ...base, id: 'new-live', startAt: '10:00', hostId: 'host-2', assistantId: null, operatorId: 'operator-2', moderatorId: null },
    [base],
  );
  assert.equal(conflicts.some((item) => item.kind === 'studio'), true);
});

test('scheduleConflicts allows adjacent sessions and cancelled sessions', () => {
  const adjacent = scheduleConflicts({ ...base, id: 'new-live', startAt: '11:00' }, [base]);
  const cancelled = scheduleConflicts({ ...base, id: 'new-live', startAt: '10:00' }, [{ ...base, status: 'cancelled' }]);
  assert.deepEqual({ adjacent, cancelled }, { adjacent: [], cancelled: [] });
});

test('confirmed TikTok schedule requires host, time, studio and at least one product', () => {
  const errors = validateLiveSchedule({
    ...base,
    hostId: null,
    startAt: null,
    durationMin: 0,
    studio: null,
    productCount: 0,
  });
  assert.deepEqual(errors.map((item) => item.code), [
    'title_required',
    'start_required',
    'duration_required',
    'host_required',
    'studio_required',
    'products_required',
  ].filter((code) => code !== 'title_required'));
});

test('draft schedule can be incomplete but rejects malformed time and excessive duration', () => {
  const errors = validateLiveSchedule({ ...base, scheduleStatus: 'draft', startAt: '25:90', durationMin: 900 });
  assert.deepEqual(errors.map((item) => item.code), ['start_invalid', 'duration_invalid']);
});

test('liveScheduleReadiness reports the missing pre-live work without blocking drafts', () => {
  const readiness = liveScheduleReadiness({
    ...base,
    operatorId: null,
    moderatorId: null,
    briefUrl: null,
    rehearsalAt: null,
  });
  assert.deepEqual(readiness.missing.map((item) => item.key), ['crew', 'brief', 'rehearsal']);
});
