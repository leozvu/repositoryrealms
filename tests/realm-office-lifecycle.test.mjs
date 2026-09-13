import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import * as THREE from 'three';
import { buildGuildhallScene } from '../components/realm/three/guildhallScene.js';
import { officeToPresence, officeWalkable } from '../lib/realm-office-3d.js';
import { mergeRealmPresencePeople } from '../lib/realm-protocol.js';
import { attachRealmCallAudio, realmCaptureControls, realmPersonPanelState, restoreRealmOfficePosition, scheduleRealmOfficeMove } from '../lib/realm-office-lifecycle.js';

test('3D command-desk position survives reload even where legacy architecture is blocked', async () => {
  const source = await readFile(new URL('../components/realm/world.js', import.meta.url), 'utf8');
  const legacy = await import(`data:text/javascript;base64,${Buffer.from(source.replace("import { REALM_TREASURY_CATALOG } from '@/lib/realm-treasury';", 'const REALM_TREASURY_CATALOG = [];')).toString('base64')}`);
  const scene = buildGuildhallScene(THREE);
  try {
    const point = scene.interactables.find(item => item.id === 'command-center').position;
    assert.ok(officeWalkable(point, scene.colliders));
    const saved = officeToPresence(point);
    assert.deepEqual(saved, { x: 24, y: 13.9, zoneId: null });
    assert.equal(legacy.isWorldPositionWalkable(saved), false, 'this is an actual old-map collision, not a mocked normalizer');
    assert.deepEqual(restoreRealmOfficePosition(saved, { worldVersion: '3d', legacyNormalize: legacy.normalizeWorldPosition }), saved);
    assert.deepEqual(restoreRealmOfficePosition(saved, { worldVersion: 'v3', legacyNormalize: legacy.normalizeWorldPosition }), legacy.DEFAULT_WORLD_POSITION);
  } finally { scene.dispose(); }
});

test('same-name authenticated colleague remains selectable and selected identity survives session reconnect', () => {
  const self = { name: 'Nguyễn Minh An', userId: 'employee-a' };
  const remote = { id: 'session-b1', userId: 'employee-b', name: self.name, isRemote: true, seenAt: 1 };
  assert.deepEqual(mergeRealmPresencePeople({ selfProfile: { name: self.name }, remotePlayers: [remote] }), []);
  const people = mergeRealmPresencePeople({ selfProfile: self, remotePlayers: [remote] });
  assert.equal(people.length, 1);
  const panel = realmPersonPanelState(people[0]);
  assert.deepEqual(panel, { selectedPersonId: 'employee-b', mode: 'world', activePanel: 'person', surfaceOpen: true });
  const reconnected = mergeRealmPresencePeople({ selfProfile: self, remotePlayers: [{ ...remote, id: 'session-b2', seenAt: 2 }] });
  assert.equal(reconnected.find(person => (person.userId || person.id) === panel.selectedPersonId).id, 'session-b2');
});

function frameHarness() {
  let next = 0;
  let time = 0;
  const frames = new Map();
  return { requestFrame: fn => { frames.set(++next, fn); return next; }, cancelFrame: id => frames.delete(id), now: () => time,
    step(ms = 16) { time += ms; const current = [...frames.values()]; frames.clear(); current.forEach(fn => fn()); }, size: () => frames.size };
}

test('move intent waits for inspector unpause AND asynchronous world readiness, then dispatches only once', () => {
  const frames = frameHarness();
  let paused = true;
  let loaded = false;
  const sent = [];
  scheduleRealmOfficeMove({ objectId: 'quest-board' }, { ...frames, ready: () => !paused && loaded, dispatch: detail => sent.push(detail) });
  frames.step(); assert.equal(sent.length, 0);
  paused = false; frames.step(); assert.equal(sent.length, 0);
  loaded = true; frames.step(); frames.step();
  assert.deepEqual(sent, [{ objectId: 'quest-board' }]);
  assert.equal(frames.size(), 0);
});

test('cancelled navigation cannot replay after another panel opens; failed mount times out once', () => {
  const frames = frameHarness();
  let timeouts = 0;
  const stop = scheduleRealmOfficeMove({ x: 1 }, { ...frames, ready: () => true, dispatch: () => assert.fail('cancelled move dispatched') });
  stop(); frames.step();
  scheduleRealmOfficeMove({ x: 2 }, { ...frames, ready: () => false, dispatch: () => assert.fail('world never mounted'), maxWaitMs: 100, onTimeout: () => timeouts++ });
  frames.step(101); frames.step(101);
  assert.equal(timeouts, 1); assert.equal(frames.size(), 0);
});

test('capture controls reveal every active device without muting or stopping a task-side call', () => {
  assert.deepEqual(realmCaptureControls({ micOn: true, cameraOn: false, sharing: false }).map(item => item.id), ['mic']);
  assert.deepEqual(realmCaptureControls({ micOn: true, cameraOn: true, sharing: true }).map(item => item.id), ['mic', 'camera', 'share']);
  assert.deepEqual(realmCaptureControls({ micOn: false, cameraOn: false, sharing: false }), []);
});

test('audio playback owns no tracks and prompts after autoplay denial, with cleanup suppressing stale prompt', async () => {
  let stops = 0;
  let prompts = 0;
  let pauses = 0;
  const stream = { getTracks: () => [{ stop: () => stops++ }] };
  const element = { srcObject: null, play: () => Promise.reject(new Error('autoplay denied')), pause: () => pauses++ };
  const cleanup = attachRealmCallAudio(element, stream, () => prompts++);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(element.srcObject, stream); assert.equal(prompts, 1);
  cleanup(); assert.equal(element.srcObject, null); assert.equal(pauses, 1); assert.equal(stops, 0);
  const immediateCleanup = attachRealmCallAudio(element, stream, () => prompts++);
  immediateCleanup(); await Promise.resolve(); await Promise.resolve();
  assert.equal(prompts, 1); assert.equal(stops, 0);
});

test('actual JSX mounts call audio outside world/ledger/tray conditions and remote video is muted', async () => {
  const source = await readFile(new URL('../components/realm/RealmOffice.jsx', import.meta.url), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const walk = (node, visit, parents = []) => {
    if (!node || typeof node !== 'object') return;
    visit(node, parents);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, visit, [...parents, node]));
      else if (value && typeof value === 'object') walk(value, visit, [...parents, node]);
    }
  };
  let sinks = 0;
  let remoteVideos = 0;
  walk(ast, (node, parents) => {
    if (node.type !== 'JSXOpeningElement') return;
    if (node.name.name === 'RealmCallAudio') {
      sinks++;
      assert.ok(!parents.some(parent => ['ConditionalExpression', 'LogicalExpression', 'IfStatement'].includes(parent.type)), 'call sink is conditionally removed by UI state');
    }
    const inRemoteTile = parents.some(parent => parent.type === 'FunctionDeclaration' && parent.id.name === 'RemoteVideoTile');
    if (inRemoteTile && node.name.name === 'video') {
      remoteVideos++;
      assert.ok(node.attributes.some(attribute => attribute.name?.name === 'muted'), 'audio would play twice with the persistent sink');
    }
  });
  assert.equal(sinks, 1); assert.equal(remoteVideos, 1);
});
