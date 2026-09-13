import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nextTaskAction, taskSnapshotFreshness } from '../lib/task-presentation.js';
import { REALM_TASK_TRANSITIONS, realmTaskTransitions } from '../lib/realm-action-contract.js';

test('primary task action follows the canonical review workflow on both legacy active states', () => {
  const transitions = [];
  let status = 'todo';
  while (nextTaskAction({ status })) {
    const action = nextTaskAction({ status });
    transitions.push([status, action.nextState]);
    status = action.nextState;
  }
  assert.deepEqual(transitions, [['todo', 'doing'], ['doing', 'review'], ['review', 'done']]);
  assert.deepEqual(nextTaskAction({ status: 'in_progress' }), { nextState: 'review', label: 'Gửi review' });
  assert.equal(nextTaskAction({ status: 'waiting' }).nextState, 'doing');
});

test('every offered action is accepted by the backend graph; blocked and unknown work cannot skip resolution', () => {
  for (const status of Object.keys(REALM_TASK_TRANSITIONS)) {
    const action = nextTaskAction({ status });
    if (action) assert.ok(realmTaskTransitions(status).includes(action.nextState), `${status} → ${action.nextState}`);
  }
  for (const status of ['blocked', 'done', 'merged', 'future-state', undefined]) assert.equal(nextTaskAction({ status }), null);
  assert.equal(nextTaskAction(null), null);
});

test('task freshness describes a fetched snapshot and does not claim a live connection', () => {
  assert.equal(taskSnapshotFreshness(null), 'Chưa rõ thời điểm cập nhật');
  assert.equal(taskSnapshotFreshness('invalid'), 'Chưa rõ thời điểm cập nhật');
  assert.equal(taskSnapshotFreshness('2026-09-08T10:00:00Z', { loading: true }), 'Đang cập nhật…');
  assert.match(taskSnapshotFreshness('2026-09-08T10:00:00Z'), /^Cập nhật /);
  assert.doesNotMatch(taskSnapshotFreshness('2026-09-08T10:00:00Z'), /Live/);
});

test('all personal and team task presenters consume the shared transition policy', async () => {
  for (const relative of ['app/(app)/myday/page.jsx', 'components/realm-v2/CanonicalRealmScreens.jsx', 'components/realm-v2/CanonicalRealmOperationsScreens.jsx']) {
    const source = await readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
    assert.match(source, /nextTaskAction\(task\)/, relative);
    assert.doesNotMatch(source, /\['doing', 'in_progress', 'review'\]\.includes\(task.status\)\s*\?\s*'done'/, relative);
  }
});
