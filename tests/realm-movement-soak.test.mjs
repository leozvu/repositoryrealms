import assert from 'node:assert/strict';
import test from 'node:test';

import { movementProfile, personalSpaceOverlap, stepSteeredMotion } from '../lib/realm-movement-v4.js';

test('movement v4 remains finite and bounded through a deterministic twenty-minute crowd soak', () => {
  const profiles = {
    player: movementProfile('player'),
    remote: movementProfile('remote'),
    npc: movementProfile('npc'),
  };
  const actors = [
    { id: 'player', kind: 'player', priority: 100, radius: .3, x: 0, y: 0, vx: 0, vy: 0, facing: 'right', gaitTime: 0, distanceTravelled: 0, target: { x: 10, y: 0 } },
    { id: 'remote', kind: 'remote', priority: 70, radius: .3, x: 10, y: .9, vx: 0, vy: 0, facing: 'left', gaitTime: 0, distanceTravelled: 0, target: { x: 0, y: .9 } },
    { id: 'npc-a', kind: 'npc', priority: 25, radius: .3, x: 5, y: -4, vx: 0, vy: 0, facing: 'down', gaitTime: 0, distanceTravelled: 0, target: { x: 5, y: 4 } },
    { id: 'npc-b', kind: 'npc', priority: 25, radius: .3, x: 6, y: 4, vx: 0, vy: 0, facing: 'up', gaitTime: 0, distanceTravelled: 0, target: { x: 6, y: -4 } },
  ];
  let overlapRun = 0;
  let longestOverlapRun = 0;
  let yieldFrames = 0;
  let maxStep = 0;

  for (let frame = 0; frame < 20 * 60 * 60; frame += 1) {
    const previous = actors.map((actor) => ({ ...actor }));
    for (let index = 0; index < actors.length; index += 1) {
      const actor = actors[index];
      const before = previous[index];
      const next = stepSteeredMotion(actor, actor.target, 1 / 60, {
        id: actor.id,
        kind: actor.kind,
        profile: profiles[actor.kind],
        neighbors: previous.filter((item) => item.id !== actor.id),
        isWalkable: (point) => point.x >= -1 && point.x <= 11 && point.y >= -5 && point.y <= 5,
      });
      Object.assign(actor, next);
      maxStep = Math.max(maxStep, Math.hypot(actor.x - before.x, actor.y - before.y));
      if (actor.locomotion === 'yield') yieldFrames += 1;
      if (Math.hypot(actor.x - actor.target.x, actor.y - actor.target.y) < .18) {
        actor.target = actor.target.x > 5 || actor.target.y > 1
          ? { x: actor.id === 'npc-b' ? 6 : actor.id === 'npc-a' ? 5 : 0, y: actor.id === 'remote' ? .9 : actor.id.startsWith('npc') ? -4 : 0 }
          : { x: actor.id === 'npc-b' ? 6 : actor.id === 'npc-a' ? 5 : 10, y: actor.id === 'remote' ? .9 : actor.id.startsWith('npc') ? 4 : 0 };
      }
    }
    const overlaps = actors.some((actor, left) => actors.slice(left + 1).some((other) => personalSpaceOverlap(actor, other, .02)));
    overlapRun = overlaps ? overlapRun + 1 : 0;
    longestOverlapRun = Math.max(longestOverlapRun, overlapRun);
    for (const actor of actors) {
      assert.ok([actor.x, actor.y, actor.vx, actor.vy, actor.distanceTravelled].every(Number.isFinite));
    }
  }

  const fastestProfile = Math.max(...Object.values(profiles).map((profile) => profile.maxSpeed));
  assert.ok(maxStep <= fastestProfile / 60 + .002, `max step ${maxStep} exceeded the actor budget`);
  assert.ok(longestOverlapRun < 120, `actors overlapped for ${longestOverlapRun} consecutive frames`);
  assert.ok(yieldFrames > 0, 'crowd simulation must exercise yielding');
});
