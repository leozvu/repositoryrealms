import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEnvelope,
  DEFAULT_PROFILE,
  isInVoiceRange,
  isRealmMessage,
  mergeRealmPresencePeople,
  normalizeProfile,
  REALM_PROTOCOL_VERSION,
} from '../lib/realm-protocol.js';
import { normalizeRealmText, realmEmote, REALM_EMOTES } from '../lib/realm-social.js';
import {
  normalizePartyId,
  normalizePartyInvite,
  normalizePartyResponse,
  normalizePartyState,
  normalizePartyMedia,
} from '../lib/realm-party.js';
import { RealmPartyDirectory } from '../lib/realm-party-directory.js';
import { TokenVerifier } from 'livekit-server-sdk';
import { issueRealmSfuGrant, loadRealmSfuConfig, probeRealmSfu, realmLiveKitRoomName, realmSfuHealthUrl } from '../lib/realm-sfu-server.js';

test('normalizeProfile trims and validates identity fields', () => {
  assert.deepEqual(normalizeProfile({ name: '  Sơn Vũ  ', role: 'Questsmith', color: '#AABBCC' }), {
    name: 'Sơn Vũ',
    role: 'Questsmith',
    color: '#aabbcc',
    loadout: { title: null, seal: null, banner: null },
  });
  assert.equal(normalizeProfile({ name: '', role: '', color: 'red' }).name, DEFAULT_PROFILE.name);
  assert.equal(normalizeProfile({ color: 'red' }).color, DEFAULT_PROFILE.color);
});

test('normalizeProfile chỉ phát loadout hợp lệ qua presence protocol', () => {
  const profile = normalizeProfile({
    loadout: {
      title: { id: 'iron-scribe-title', name: 'Danh hiệu Iron Scribe', equipName: 'Iron Scribe', slot: 'title', slotLabel: 'Danh hiệu', icon: 'edit' },
      seal: { id: '../forged', name: 'Forged', equipName: 'Admin', slot: 'seal', icon: 'script' },
    },
  });
  assert.equal(profile.loadout.title.equipName, 'Iron Scribe');
  assert.equal(profile.loadout.title.icon, 'edit');
  assert.equal(profile.loadout.seal, null);
  assert.equal(profile.loadout.banner, null);
});

test('presence roster gộp nhiều tab của cùng một người và ưu tiên trạng thái live', () => {
  const staff = [
    { id: 'minh-static', name: 'Minh Quân', status: 'available' },
    { id: 'mai-static', name: 'Mai Anh', status: 'busy' },
  ];
  const remotes = [
    { id: 'minh-tab-1', name: 'Minh Quân', status: 'focus', isRemote: true, seenAt: 20 },
    { id: 'son-tab-old', name: 'Sơn Vũ', status: 'available', isRemote: true, seenAt: 10 },
    { id: 'son-tab-new', name: 'Sơn Vũ', status: 'busy', isRemote: true, seenAt: 30 },
  ];
  const people = mergeRealmPresencePeople({ staff, remotePlayers: remotes, selfProfile: { name: 'Adventurer Zero' } });
  assert.deepEqual(people.map((person) => person.id), ['son-tab-new', 'minh-tab-1', 'mai-static']);

  const withoutSelfDuplicate = mergeRealmPresencePeople({ staff, remotePlayers: remotes, selfProfile: { name: 'Minh Quân' } });
  assert.equal(withoutSelfDuplicate.some((person) => person.name === 'Minh Quân'), false);
  assert.deepEqual(withoutSelfDuplicate.map((person) => person.id), ['son-tab-new', 'mai-static']);
});

test('presence roster gộp gateway identity với ERP directory fallback theo tên', () => {
  const people = mergeRealmPresencePeople({
    remotePlayers: [{ id: 'session-1', name: 'Mai Anh', seenAt: 20, isRemote: true }],
    staff: [{ id: 'user-2', userId: 'user-2', name: 'Mai Anh', online: true }],
  });
  assert.equal(people.length, 1);
  assert.equal(people[0].id, 'session-1');
});

test('realm protocol only accepts the current typed envelope', () => {
  const message = createEnvelope('presence', 'player-1', { x: 1, y: 2 });
  assert.equal(message.version, REALM_PROTOCOL_VERSION);
  assert.equal(isRealmMessage(message), true);
  assert.equal(isRealmMessage({ ...message, version: 1 }), false);
  assert.equal(isRealmMessage({ ...message, type: 'unknown' }), false);
  assert.equal(isRealmMessage(createEnvelope('whisper', 'player-1', { text: 'bí mật' }, 'player-2')), true);
  assert.equal(isRealmMessage(createEnvelope('emote', 'player-1', { emoteId: 'wave' })), true);
});

test('realm social payloads use allowlisted emotes and bounded text', () => {
  assert.equal(REALM_EMOTES.length, 4);
  assert.equal(realmEmote(' WAVE ')?.mark, 'HI');
  assert.equal(realmEmote('not-allowed'), null);
  assert.equal(normalizeRealmText('  xin   chào  '), 'xin chào');
  assert.equal(normalizeRealmText('abcdef', 4), 'abcd');
});

test('party protocol validates ids, sender identity and explicit decisions', () => {
  assert.equal(normalizePartyId('party-12345678'), 'party-12345678');
  assert.equal(normalizePartyId('bad id'), '');
  assert.deepEqual(normalizePartyInvite({ partyId: 'party-12345678', hostProfile: { name: ' Host ' } }, 'host-1'), {
    partyId: 'party-12345678',
    hostId: 'host-1',
    hostProfile: { ...DEFAULT_PROFILE, name: 'Host' },
    memberCount: 1,
    maxMembers: 6,
    authoritative: false,
  });
  assert.equal(normalizePartyInvite({ partyId: 'bad' }, 'host-1'), null);
  assert.equal(normalizePartyResponse({ partyId: 'party-12345678', accepted: 'yes' }, 'member-1'), null);
  assert.equal(normalizePartyResponse({ partyId: 'party-12345678', accepted: true }, 'member-1')?.accepted, true);
  assert.equal(normalizePartyState({ party: null }), null);
  assert.equal(normalizePartyState({
    party: {
      id: 'party-12345678',
      hostId: 'host-1',
      members: [{ id: 'host-1', profile: { name: 'Host' }, joinedAt: 1 }],
      maxMembers: 6,
      authoritative: true,
    },
  })?.members.length, 1);
});

test('party media only accepts bounded LiveKit connection grants', () => {
  const media = normalizePartyMedia({
    provider: 'livekit',
    url: 'wss://media.example.test/',
    roomName: 'realm-12345678',
    token: 'x'.repeat(64),
    expiresAt: 123456,
  });
  assert.deepEqual(media, {
    provider: 'livekit',
    url: 'wss://media.example.test',
    roomName: 'realm-12345678',
    token: 'x'.repeat(64),
    expiresAt: 123456,
  });
  assert.equal(normalizePartyMedia({ ...media, url: 'https://media.example.test' }), null);
  assert.equal(normalizePartyMedia({ ...media, token: 'short' }), null);
});

test('gateway issues a short-lived room-scoped LiveKit grant only to party members', async () => {
  const config = loadRealmSfuConfig({
    REALM_SFU_PROVIDER: 'livekit',
    REALM_SFU_URL: 'ws://127.0.0.1:7880',
    REALM_SFU_API_KEY: 'test-key',
    REALM_SFU_API_SECRET: 'test-secret-that-is-long-enough',
    REALM_SFU_TOKEN_TTL_SECONDS: '180',
  });
  const party = {
    id: 'party-12345678',
    hostId: 'host-1',
    members: [{ id: 'host-1', profile: { name: 'Host' } }],
  };
  const grant = await issueRealmSfuGrant({ config, roomKey: 'realm:castle', party, targetId: 'host-1', now: 1000 });
  const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(grant.token);
  assert.equal(grant.roomName, realmLiveKitRoomName('realm:castle', party.id));
  assert.equal(grant.expiresAt, 181000);
  assert.equal(claims.sub, 'host-1');
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.room, grant.roomName);
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.canSubscribe, true);
  assert.equal(await issueRealmSfuGrant({ config, roomKey: 'realm:castle', party, targetId: 'outsider-1' }), null);
});

test('gateway probes LiveKit health without exposing credentials', async () => {
  assert.equal(realmSfuHealthUrl('wss://media.example.test/rtc?token=ignored'), 'https://media.example.test/');
  let requestedUrl = '';
  const config = loadRealmSfuConfig({
    REALM_SFU_PROVIDER: 'livekit',
    REALM_SFU_URL: 'ws://127.0.0.1:7880',
    REALM_SFU_API_KEY: 'test-key',
    REALM_SFU_API_SECRET: 'test-secret',
  });
  let tick = 100;
  const health = await probeRealmSfu(config, {
    now: () => ++tick,
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, text: async () => 'OK' };
    },
  });
  assert.equal(requestedUrl, 'http://127.0.0.1:7880/');
  assert.equal(health.status, 'up');
  assert.equal(Object.hasOwn(health, 'url'), false);
  assert.equal(Object.hasOwn(health, 'apiSecret'), false);
  assert.equal((await probeRealmSfu(config, { fetchImpl: async () => { throw new Error('offline'); } })).status, 'down');
});

test('gateway party directory owns multi-member room state and host controls', () => {
  let now = 100;
  const directory = new RealmPartyDirectory({
    maxPartySize: 4,
    now: () => ++now,
    makePartyId: () => 'party-12345678',
  });
  const roomKey = 'realm:castle';
  const invite = directory.invite({
    roomKey,
    senderId: 'host-1',
    senderProfile: { name: 'Host' },
    targetId: 'member-1',
    targetProfile: { name: 'Member One' },
  });
  assert.equal(directory.size, 1);
  assert.equal(invite.some((item) => item.targetId === 'member-1' && item.type === 'party-invite'), true);
  assert.equal(directory.sync(roomKey, 'host-1')[0].payload.party.pendingInvites.length, 1);

  directory.respond({
    roomKey,
    senderId: 'member-1',
    senderProfile: { name: 'Member One' },
    partyId: 'party-12345678',
    accepted: true,
  });
  assert.equal(directory.partyFor(roomKey, 'host-1').members.size, 2);
  assert.equal(directory.partyFor(roomKey, 'member-1').hostId, 'host-1');

  const denied = directory.invite({
    roomKey,
    senderId: 'member-1',
    senderProfile: { name: 'Member One' },
    targetId: 'member-2',
    targetProfile: { name: 'Member Two' },
  });
  assert.equal(denied[0].payload.code, 'host-only');

  directory.invite({
    roomKey,
    senderId: 'host-1',
    senderProfile: { name: 'Host' },
    targetId: 'member-2',
    targetProfile: { name: 'Member Two' },
  });
  directory.respond({
    roomKey,
    senderId: 'member-2',
    senderProfile: { name: 'Member Two' },
    partyId: 'party-12345678',
    accepted: true,
  });
  assert.equal(directory.partyFor(roomKey, 'host-1').members.size, 3);

  const kicked = directory.kick({ roomKey, senderId: 'host-1', targetId: 'member-1' });
  assert.equal(directory.partyFor(roomKey, 'member-1'), null);
  assert.equal(kicked.some((item) => item.targetId === 'member-1' && item.type === 'party-state' && item.payload.party === null), true);

  directory.disconnect(roomKey, 'host-1');
  assert.equal(directory.partyFor(roomKey, 'member-2').hostId, 'member-2');
  directory.end({ roomKey, senderId: 'member-2' });
  assert.equal(directory.size, 0);
  assert.equal(directory.partyFor(roomKey, 'member-2'), null);
});

test('voice range uses five tiles and lets matching private areas override distance', () => {
  assert.equal(isInVoiceRange({ x: 0, y: 0 }, { x: 3, y: 4, status: 'available' }), true);
  assert.equal(isInVoiceRange({ x: 0, y: 0 }, { x: 5.1, y: 0, status: 'available' }), false);
  assert.equal(isInVoiceRange({ x: 0, y: 0, zoneId: 'war' }, { x: 20, y: 20, zoneId: 'war', status: 'available' }), true);
  assert.equal(isInVoiceRange({ x: 0, y: 0 }, { x: 1, y: 1, status: 'dnd' }), false);
});
