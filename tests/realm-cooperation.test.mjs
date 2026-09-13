import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyRealmWorkSessionAction,
  createRealmWorkSession,
  normalizeRealmWorkAction,
  normalizeRealmWorkSession,
  realmWorkSessionTaskComment,
  realmWorkSessionProgress,
  RealmCooperationError,
  syncRealmWorkSessionMembers,
} from '../lib/realm-cooperation.js';
import { createEnvelope, isRealmMessage } from '../lib/realm-protocol.js';
import { translateUiCopy } from '../lib/i18n.js';

const party = {
  id: 'party-cooperation-1234',
  hostId: 'host-100',
  members: [
    { id: 'host-100', profile: { name: 'Mai Anh', role: 'Guild Steward', color: '#3b8061' }, joinedAt: 1 },
    { id: 'member-200', profile: { name: 'Quang Võ', role: 'Project Warden', color: '#8b624b' }, joinedAt: 2 },
  ],
};

const candidate = {
  work: { kind: 'task', id: 'task-42', title: 'Chốt proposal Rồng Xanh', context: 'Campaign Rồng Xanh', status: 'active' },
  anchor: { objectId: 'quest-board', x: 38, y: 22.85 },
  agenda: ['Chốt kết quả', 'Xử lý phần việc chính', 'Review và bàn giao'],
};

test('work session binds a real work reference to one Party without copying ERP state', () => {
  const session = createRealmWorkSession({ party, hostId: party.hostId, ...candidate }, 1000);
  assert.equal(session.partyId, party.id);
  assert.equal(session.work.id, 'task-42');
  assert.equal(session.members.length, 2);
  assert.equal(session.phase, 'forming');
  assert.deepEqual(realmWorkSessionProgress(session), { ready: 0, members: 2, done: 0, agenda: 3 });
  assert.equal('reward' in session, false);
  assert.equal('gold' in session, false);
  assert.equal('taskStatus' in session, false);
});

test('the empty meeting room has zero progress before a work session exists', () => {
  for (const value of [null, undefined, {}, { session: null }, [], false, 0]) {
    assert.equal(normalizeRealmWorkSession(value), null);
    assert.deepEqual(realmWorkSessionProgress(value), { ready: 0, members: 0, done: 0, agenda: 0 });
  }
});

test('malformed nested meeting references are rejected without crashing the receiver', () => {
  const session = createRealmWorkSession({ party, hostId: party.hostId, ...candidate }, 1000);
  for (const key of ['work', 'anchor']) for (const value of [null, [], false]) {
    assert.equal(normalizeRealmWorkSession({ session: { ...session, [key]: value } }), null);
  }
});

test('every member can ready, update agenda and write a bounded shared log', () => {
  let session = createRealmWorkSession({ party, hostId: party.hostId, ...candidate }, 1000);
  session = applyRealmWorkSessionAction(session, party.members[1], {
    type: 'set-ready', sessionId: session.id, payload: { ready: true },
  }, party, 1100);
  session = applyRealmWorkSessionAction(session, party.members[1], {
    type: 'toggle-agenda', sessionId: session.id, payload: { itemId: session.agenda[0].id },
  }, party, 1200);
  session = applyRealmWorkSessionAction(session, party.members[1], {
    type: 'add-note', sessionId: session.id, payload: { id: 'entry-blocker-1', kind: 'blocker', text: '  Chờ khách xác nhận ngân sách\u0000  ' },
  }, party, 1300);

  assert.equal(session.members.find((member) => member.id === 'member-200').ready, true);
  assert.equal(session.agenda[0].done, true);
  assert.equal(session.agenda[0].completedBy, 'member-200');
  assert.deepEqual(session.notes[0], {
    id: 'entry-blocker-1',
    kind: 'blocker',
    text: 'Chờ khách xác nhận ngân sách',
    authorId: 'member-200',
    authorName: 'Quang Võ',
    at: 1300,
  });
});

test('only the facilitator controls phase, anchor and finish lifecycle', () => {
  const session = createRealmWorkSession({ party, hostId: party.hostId, ...candidate }, 1000);
  assert.throws(() => applyRealmWorkSessionAction(session, party.members[1], {
    type: 'set-phase', sessionId: session.id, payload: { phase: 'focus' },
  }, party, 1200), (error) => error instanceof RealmCooperationError && error.code === 'work_session_facilitator_required');

  const focused = applyRealmWorkSessionAction(session, party.members[0], {
    type: 'set-phase', sessionId: session.id, payload: { phase: 'focus' },
  }, party, 1200);
  assert.equal(focused.phase, 'focus');
  assert.equal(focused.focusStartedAt, 1200);

  const finished = applyRealmWorkSessionAction(focused, party.members[0], {
    type: 'finish', sessionId: session.id, payload: {},
  }, party, 1500);
  assert.equal(finished.finished, true);
  assert.equal(finished.phase, 'review');
});

test('party membership reconciliation preserves readiness and removes departed users', () => {
  let session = createRealmWorkSession({ party, hostId: party.hostId, ...candidate }, 1000);
  session = applyRealmWorkSessionAction(session, party.members[1], {
    type: 'set-ready', sessionId: session.id, payload: { ready: true },
  }, party, 1100);
  const expandedParty = {
    ...party,
    members: [...party.members, { id: 'member-300', profile: { name: 'Linh Trần', role: 'Archivist', color: '#6e7199' }, joinedAt: 3 }],
  };
  const expanded = syncRealmWorkSessionMembers(session, expandedParty, 1300);
  assert.equal(expanded.members.length, 3);
  assert.equal(expanded.members.find((member) => member.id === 'member-200').ready, true);
  assert.equal(expanded.members.find((member) => member.id === 'member-300').ready, false);
  assert.equal(syncRealmWorkSessionMembers(expanded, { ...expandedParty, members: [expandedParty.members[0]] }, 1400), null);
});

test('cooperation protocol rejects malformed state and allows only bounded actions', () => {
  assert.equal(normalizeRealmWorkSession({ id: 'work-bad', partyId: 'bad', hostId: 'x' }), null);
  assert.equal(normalizeRealmWorkAction({ type: 'add-note', sessionId: 'work-cooperation-1234', payload: { kind: 'blocker', text: '' } }), null);
  assert.equal(normalizeRealmWorkAction({ type: 'set-ready', sessionId: 'work-cooperation-1234', payload: { ready: true } })?.type, 'set-ready');
  assert.equal(isRealmMessage(createEnvelope('coop-action', 'member-200', { partyId: party.id }, 'host-100')), true);
  assert.equal(isRealmMessage(createEnvelope('unknown-coop', 'member-200', {}, 'host-100')), false);
});

test('shared session remains bounded through a six-member action soak', () => {
  const crowdParty = {
    ...party,
    members: Array.from({ length: 6 }, (_, index) => ({
      id: index ? `member-${index + 200}` : party.hostId,
      profile: { name: index ? `Guild Member ${index}` : 'Mai Anh', role: 'Contributor', color: '#3b8061' },
      joinedAt: index + 1,
    })),
  };
  let session = createRealmWorkSession({ party: crowdParty, hostId: crowdParty.hostId, ...candidate }, 1000);
  for (let index = 0; index < 120; index += 1) {
    const actor = crowdParty.members[index % crowdParty.members.length];
    const action = index % 3 === 0
      ? { type: 'set-ready', sessionId: session.id, payload: { ready: index % 2 === 0 } }
      : index % 3 === 1
        ? { type: 'toggle-agenda', sessionId: session.id, payload: { itemId: session.agenda[index % session.agenda.length].id } }
        : { type: 'add-note', sessionId: session.id, payload: { id: `entry-soak-${index}`, kind: index % 2 ? 'note' : 'decision', text: `Update ${index}` } };
    session = applyRealmWorkSessionAction(session, actor, action, crowdParty, 1100 + index);
  }
  assert.equal(session.members.length, 6);
  assert.ok(session.notes.length <= 18);
  assert.ok(session.agenda.length <= 6);
  assert.ok(session.version > 100);
});

test('gateway keeps cooperation payloads Party-targeted and UI has bilingual safeguards', () => {
  const gatewaySource = readFileSync(new URL('../scripts/realm-signal-server.mjs', import.meta.url), 'utf8');
  assert.match(gatewaySource, /COOPERATION_MESSAGE_TYPES\.includes\(message\.type\) && !message\.targetId/);
  assert.equal(translateUiCopy('Làm việc cùng nhau, ngay trong Realm', 'en'), 'Work together, directly in Realm');
  assert.equal(translateUiCopy('Phiên phối hợp không tự thay đổi Task, Gold hoặc phê duyệt trong ERP.', 'en'), 'A collaboration session never changes ERP Tasks, Gold, or approvals by itself.');
});

test('publishing a shared-log entry builds one bounded receipted ERP Task command', () => {
  let session = createRealmWorkSession({ party, hostId: party.hostId, ...candidate }, 1000);
  session = applyRealmWorkSessionAction(session, party.members[1], {
    type: 'add-note', sessionId: session.id, payload: { id: 'entry-decision-1', kind: 'decision', text: 'Duyệt phương án B' },
  }, party, 1200);
  const command = realmWorkSessionTaskComment(session, session.notes[0]);
  assert.ok(command.idempotencyKey.length >= 12 && command.idempotencyKey.length <= 120);
  assert.deepEqual(command.body, {
    action: 'task.comment.create',
    entityId: 'task-42',
    content: '[Guild Work Session · Quyết định] Duyệt phương án B',
  });
  assert.throws(() => realmWorkSessionTaskComment(session, { id: 'missing-note' }), RealmCooperationError);
});
