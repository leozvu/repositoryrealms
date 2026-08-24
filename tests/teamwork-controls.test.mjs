import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { createExecutionIdempotencyKey } from '../lib/execution-client.js';

test('team-work action keys satisfy the RepositoryRealms idempotency contract', () => {
  const key = createExecutionIdempotencyKey('team-work', 'task.reprioritize', () => '5f5d882e-0707-4f3e-a6de-bdf76d72c781');
  assert.equal(key, 'team-work:task-reprioritize:5f5d882e-0707-4f3e-a6de-bdf76d72c781');
  assert.match(key, /^[a-zA-Z0-9:_-]{12,120}$/);
  assert.ok(!key.includes('.'));
});

test('team-work controls keep click actions outside the draggable surface', () => {
  const page = fs.readFileSync(new URL('../app/(app)/teamwork/page.jsx', import.meta.url), 'utf8');
  assert.match(page, /className=\{styles\.taskOrder\}[\s\S]*?draggable=\{draggable\}/);
  assert.match(page, /className=\{styles\.taskActions\} draggable=\{false\}/);
  assert.match(page, /role="dialog"[\s\S]*?tabIndex=\{-1\}/);
  assert.match(page, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});
