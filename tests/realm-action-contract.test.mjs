import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRealmFollowupDraft,
  normalizeRealmTaskCommentDraft,
  realmLeadTransitions,
  realmStateLabel,
  realmTaskTransitions,
} from '../lib/realm-action-contract.js';

test('Quest transition graph chỉ cho luồng vận hành an toàn và khóa trạng thái done', () => {
  assert.deepEqual(realmTaskTransitions('todo'), ['in_progress', 'blocked']);
  assert.deepEqual(realmTaskTransitions('review'), ['done', 'in_progress', 'blocked']);
  assert.deepEqual(realmTaskTransitions('done'), []);
  assert.deepEqual(realmTaskTransitions('unknown'), []);
});

test('Lead transition graph đi xuôi pipeline và khóa hồ sơ đã quyết định', () => {
  assert.deepEqual(realmLeadTransitions('new'), ['contacted', 'lost']);
  assert.deepEqual(realmLeadTransitions('negotiation'), ['won', 'lost']);
  assert.deepEqual(realmLeadTransitions('won'), []);
  assert.deepEqual(realmLeadTransitions('lost'), []);
});

test('Realm labels không biến giá trị lạ thành HTML hoặc copy nghiệp vụ giả', () => {
  assert.equal(realmStateLabel('in_progress'), 'Đang thực hiện');
  assert.equal(realmStateLabel('custom_state'), 'custom_state');
});

test('Action Center normalizes comment và follow-up drafts bằng allowlist', () => {
  assert.equal(normalizeRealmTaskCommentDraft('  Quyết định\r\n mới  '), 'Quyết định\n mới');
  assert.deepEqual(normalizeRealmFollowupDraft({ kind: 'MEETING', title: '  Chốt\nproposal  ', date: '2026-07-21' }), {
    kind: 'meeting', title: 'Chốt proposal', date: '2026-07-21',
  });
  assert.equal(normalizeRealmFollowupDraft({ kind: 'visit' }).kind, '');
});
