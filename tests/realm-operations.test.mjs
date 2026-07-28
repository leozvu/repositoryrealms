import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceRealmQuest,
  claimRealmQuest,
  createRealmOperations,
  normalizeRealmOperations,
  spendRealmGold,
  summarizeRealmCareer,
} from '../lib/realm-operations.js';

const QUEST = {
  id: 'q-1',
  businessRef: 'TASK-1',
  title: 'Hoàn tất báo cáo',
  progress: 1,
  total: 2,
  status: 'active',
  reward: 5,
  renown: 120,
};

test('ERP progress và Realm Quest dùng chung một state transition', () => {
  const state = createRealmOperations({ quests: [QUEST], wallet: 10, renown: 1280 });
  const next = advanceRealmQuest(state, QUEST.id);
  assert.equal(next.quests[0].progress, 2);
  assert.equal(next.quests[0].status, 'ready');
  assert.equal(state.quests[0].progress, 1);
});

test('claim Quest ghi Gold/Renown đúng một lần và tạo journal có business ref', () => {
  const ready = createRealmOperations({ quests: [{ ...QUEST, progress: 2, status: 'ready' }], wallet: 10, renown: 1280, completedQuests: 7 });
  const claimed = claimRealmQuest(ready, QUEST.id, { entryId: 'entry-1', at: '10:30' });
  const repeated = claimRealmQuest(claimed, QUEST.id, { entryId: 'entry-2' });
  assert.equal(claimed.wallet, 15);
  assert.equal(claimed.renown, 1400);
  assert.equal(claimed.completedQuests, 8);
  assert.deepEqual(claimed.ledger[0], {
    id: 'entry-1', at: '10:30', type: 'earn', amount: 5,
    label: 'Quest: Hoàn tất báo cáo', sourceId: 'TASK-1',
  });
  assert.equal(repeated, claimed);
});

test('Gold shop không thể chi vượt wallet và career summary phản ánh nghiệp vụ', () => {
  const state = createRealmOperations({ quests: [QUEST], wallet: 4, renown: 1280, completedQuests: 7, streakDays: 8 });
  assert.equal(spendRealmGold(state, { id: 'pass', name: 'Learning pass', price: 5 }), state);
  const summary = summarizeRealmCareer(state);
  assert.equal(summary.level, 12);
  assert.equal(summary.openQuests, 1);
  assert.equal(summary.completedQuests, 7);
  assert.equal(summary.streakDays, 8);
});

test('saved demo state được merge theo danh mục Quest hiện hành và chặn số liệu rác', () => {
  const fallback = { quests: [QUEST], wallet: 10, renown: 1280 };
  const normalized = normalizeRealmOperations({
    quests: [{ id: 'q-1', progress: 99, total: 99, status: 'ready' }, { id: 'removed', progress: 1, total: 1 }],
    wallet: -20,
    renown: 'bad',
  }, fallback);
  assert.equal(normalized.quests.length, 1);
  assert.equal(normalized.quests[0].total, 2);
  assert.equal(normalized.quests[0].progress, 2);
  assert.equal(normalized.wallet, 0);
  assert.equal(normalized.renown, 1280);
});
