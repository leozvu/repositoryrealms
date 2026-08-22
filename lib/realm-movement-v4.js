export const REALM_MOVEMENT_VERSION = 4;

export const REALM_MOVEMENT_INTENTS = Object.freeze([
  'idle', 'manual', 'interact', 'social', 'remote', 'commute', 'waygate',
]);

export const REALM_INTENT_PRIORITY = Object.freeze({
  idle: 0,
  commute: 20,
  remote: 50,
  social: 60,
  interact: 80,
  manual: 100,
  waygate: 120,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const magnitude = (vector) => Math.hypot(Number(vector?.x) || 0, Number(vector?.y) || 0);
const normalize = (vector) => {
  const length = magnitude(vector);
  return length > .0001 ? { x: vector.x / length, y: vector.y / length } : { x: 0, y: 0 };
};

export function createMovementIntent(type = 'idle', target = null, metadata = {}) {
  const safeType = REALM_MOVEMENT_INTENTS.includes(type) ? type : 'idle';
  return Object.freeze({
    type: safeType,
    priority: REALM_INTENT_PRIORITY[safeType],
    target: target && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))
      ? Object.freeze({ x: Number(target.x), y: Number(target.y) })
      : null,
    issuedAt: Number(metadata.issuedAt) || 0,
    source: metadata.source || safeType,
    objectId: metadata.objectId || null,
  });
}

export function canReplaceMovementIntent(current, next) {
  if (!current) return true;
  if (!next) return false;
  if (next.type === current.type) return true;
  return (next.priority ?? REALM_INTENT_PRIORITY[next.type] ?? 0)
    >= (current.priority ?? REALM_INTENT_PRIORITY[current.type] ?? 0);
}

export function movementProfile(kind = 'player', overrides = {}) {
  const profiles = {
    player: { maxSpeed: 4.35, acceleration: 20, deceleration: 25, turnRate: Math.PI * 3.2, radius: .3, priority: 100 },
    remote: { maxSpeed: 4.5, acceleration: 18, deceleration: 24, turnRate: Math.PI * 3, radius: .3, priority: 70 },
    npc: { maxSpeed: 1.32, acceleration: 5.8, deceleration: 8.5, turnRate: Math.PI * 2.25, radius: .3, priority: 25 },
  };
  return Object.freeze({ ...(profiles[kind] || profiles.player), ...overrides, kind });
}

export function personalSpaceOverlap(actor, other, padding = .16) {
  const radius = (Number(actor?.radius) || .3) + (Number(other?.radius) || .3) + Math.max(0, padding);
  return Math.hypot((actor?.x || 0) - (other?.x || 0), (actor?.y || 0) - (other?.y || 0)) < radius;
}

export function portalForSegment(start, target, portals = []) {
  if (!start || !target) return null;
  const length = Math.hypot(target.x - start.x, target.y - start.y);
  const samples = Math.max(2, Math.ceil(length / .25));
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const point = {
      x: start.x + (target.x - start.x) * progress,
      y: start.y + (target.y - start.y) * progress,
    };
    const portal = portals.find((item) => point.x >= item.minX && point.x <= item.maxX && point.y >= item.minY && point.y <= item.maxY);
    if (portal) return portal;
  }
  return null;
}

export function reservePortalPassage(book, actor, portal, now = 0, ttl = 1400) {
  if (!(book instanceof Map) || !actor || !portal) return { granted: true, portalId: portal?.id || null };
  const active = (book.get(portal.id) || []).filter((entry) => entry.expiresAt > now && entry.actorId !== actor.id);
  const capacity = Math.max(1, Number(portal.capacity) || 1);
  if (active.length < capacity) {
    active.push({ actorId: actor.id, priority: Number(actor.priority) || 0, expiresAt: now + ttl });
    book.set(portal.id, active);
    return { granted: true, portalId: portal.id };
  }
  const lowest = [...active].sort((left, right) => left.priority - right.priority)[0];
  if ((Number(actor.priority) || 0) > lowest.priority) {
    const next = active.filter((entry) => entry !== lowest);
    next.push({ actorId: actor.id, priority: Number(actor.priority) || 0, expiresAt: now + ttl });
    book.set(portal.id, next);
    return { granted: true, portalId: portal.id, preempted: lowest.actorId };
  }
  book.set(portal.id, active);
  return { granted: false, portalId: portal.id };
}

export function releasePortalPassage(book, actorId) {
  if (!(book instanceof Map)) return;
  for (const [portalId, entries] of book) {
    const next = entries.filter((entry) => entry.actorId !== actorId);
    if (next.length) book.set(portalId, next);
    else book.delete(portalId);
  }
}

export function computeLocalAvoidance(actor, neighbors = [], options = {}) {
  const horizon = Number(options.horizon) || .72;
  const padding = Number(options.padding) || .2;
  const actorPriority = Number(actor?.priority) || 0;
  let pushX = 0;
  let pushY = 0;
  let speedFactor = 1;
  let overlaps = 0;
  let yielding = false;

  for (const other of neighbors) {
    if (!other || other === actor || other.id === actor?.id) continue;
    const dx = (actor.x || 0) - (other.x || 0);
    const dy = (actor.y || 0) - (other.y || 0);
    const distance = Math.max(.001, Math.hypot(dx, dy));
    const safe = (Number(actor.radius) || .3) + (Number(other.radius) || .3) + padding;
    const predictedDx = dx + ((actor.vx || 0) - (other.vx || 0)) * horizon;
    const predictedDy = dy + ((actor.vy || 0) - (other.vy || 0)) * horizon;
    const predictedDistance = Math.hypot(predictedDx, predictedDy);
    const otherPriority = Number(other.priority) || 0;

    if (distance < safe) {
      overlaps += 1;
      const strength = clamp((safe - distance) / safe, 0, 1);
      pushX += dx / distance * (1.1 + strength * 2.2);
      pushY += dy / distance * (1.1 + strength * 2.2);
      if (otherPriority > actorPriority) {
        speedFactor = Math.min(speedFactor, .18);
        yielding = true;
      }
    } else if (predictedDistance < safe * 1.12 && distance < safe * 3.5) {
      const side = Math.sign((actor.vx || 0) * dy - (actor.vy || 0) * dx) || (String(actor.id) < String(other.id) ? -1 : 1);
      pushX += -dy / distance * side * .72;
      pushY += dx / distance * side * .72;
      if (otherPriority > actorPriority) {
        speedFactor = Math.min(speedFactor, .48);
        yielding = true;
      }
    }
  }

  return { x: pushX, y: pushY, speedFactor, overlaps, yielding };
}

function rotateToward(current, desired, maxDelta) {
  if (magnitude(current) < .04 || magnitude(desired) < .04) return normalize(desired);
  const currentAngle = Math.atan2(current.y, current.x);
  const desiredAngle = Math.atan2(desired.y, desired.x);
  let difference = desiredAngle - currentAngle;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  const angle = currentAngle + clamp(difference, -maxDelta, maxDelta);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function facingFromVector(vector, fallback = 'down') {
  if (magnitude(vector) < .045) return fallback;
  const angle = Math.atan2(vector.y, vector.x);
  const directions = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
  return directions[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

function sweptAdvance(position, velocity, delta, isWalkable, maxSweep = .12) {
  const travel = magnitude(velocity) * delta;
  const steps = Math.max(1, Math.ceil(travel / maxSweep));
  const stepDelta = delta / steps;
  let x = Number(position.x) || 0;
  let y = Number(position.y) || 0;
  let vx = Number(velocity.x) || 0;
  let vy = Number(velocity.y) || 0;
  let collisions = 0;

  for (let index = 0; index < steps; index += 1) {
    const next = { x: x + vx * stepDelta, y: y + vy * stepDelta };
    if (isWalkable(next)) {
      x = next.x;
      y = next.y;
      continue;
    }
    collisions += 1;
    const slideX = { x: next.x, y };
    const slideY = { x, y: next.y };
    const xAllowed = isWalkable(slideX);
    const yAllowed = isWalkable(slideY);
    if (xAllowed && (!yAllowed || Math.abs(vx) >= Math.abs(vy))) {
      x = slideX.x;
      vy = 0;
    } else if (yAllowed) {
      y = slideY.y;
      vx = 0;
    } else {
      vx = 0;
      vy = 0;
      break;
    }
  }
  return { x, y, vx, vy, collisions };
}

export function stepSteeredMotion(state, target, dt = 1 / 60, options = {}) {
  const delta = clamp(Number(dt) || 1 / 60, 1 / 240, 1 / 20);
  const profile = movementProfile(options.kind || 'player', options.profile || options);
  const isWalkable = typeof options.isWalkable === 'function' ? options.isWalkable : () => true;
  const current = {
    x: Number(state?.x) || 0,
    y: Number(state?.y) || 0,
    vx: Number(state?.vx) || 0,
    vy: Number(state?.vy) || 0,
  };
  const toTarget = target ? { x: Number(target.x) - current.x, y: Number(target.y) - current.y } : { x: 0, y: 0 };
  const distance = magnitude(toTarget);
  const arrivalRadius = Number(options.arrivalRadius) || .14;
  const slowRadius = Number(options.slowRadius) || Math.max(.8, profile.maxSpeed * .42);
  const direction = normalize(toTarget);
  const avoidance = computeLocalAvoidance({ ...current, id: options.id, radius: profile.radius, priority: profile.priority }, options.neighbors, options.avoidance);
  const composed = normalize({ x: direction.x + avoidance.x, y: direction.y + avoidance.y });
  const desiredDirection = rotateToward({ x: current.vx, y: current.vy }, composed, profile.turnRate * delta);
  const currentDirection = normalize({ x: current.vx, y: current.vy });
  const turnAlignment = currentDirection.x * desiredDirection.x + currentDirection.y * desiredDirection.y;
  const brakingSpeed = Math.sqrt(Math.max(0, 2 * profile.deceleration * Math.max(0, distance - arrivalRadius)));
  const proximitySpeed = profile.maxSpeed * clamp(distance / slowRadius, 0, 1);
  const desiredSpeed = distance <= arrivalRadius ? 0 : Math.min(profile.maxSpeed, brakingSpeed, proximitySpeed) * avoidance.speedFactor;
  const desiredVelocity = { x: desiredDirection.x * desiredSpeed, y: desiredDirection.y * desiredSpeed };
  let velocityDelta = { x: desiredVelocity.x - current.vx, y: desiredVelocity.y - current.vy };
  const accelerating = desiredSpeed > magnitude(current);
  const maxVelocityDelta = (accelerating ? profile.acceleration : profile.deceleration) * delta;
  const deltaLength = magnitude(velocityDelta);
  if (deltaLength > maxVelocityDelta) {
    velocityDelta = { x: velocityDelta.x / deltaLength * maxVelocityDelta, y: velocityDelta.y / deltaLength * maxVelocityDelta };
  }
  const velocity = { x: current.vx + velocityDelta.x, y: current.vy + velocityDelta.y };
  const advanced = sweptAdvance(current, velocity, delta, isWalkable, options.maxSweep);
  const moved = Math.hypot(advanced.x - current.x, advanced.y - current.y);
  const speed = Math.hypot(advanced.vx, advanced.vy);
  const previousMoving = Math.hypot(current.vx, current.vy) > .1;
  const moving = speed > .1;
  const arriving = distance <= slowRadius && distance > arrivalRadius;
  const turningInPlace = distance > arrivalRadius && turnAlignment < .2 && speed < .42;
  const locomotion = turningInPlace ? 'turn' : moving
    ? previousMoving ? arriving ? 'arrive' : avoidance.yielding ? 'yield' : 'walk' : 'start'
    : previousMoving ? 'stop' : 'idle';

  return {
    ...state,
    x: advanced.x,
    y: advanced.y,
    vx: advanced.vx,
    vy: advanced.vy,
    facing: facingFromVector(moving ? advanced : direction, state?.facing || 'down'),
    locomotion,
    gaitTime: (Number(state?.gaitTime) || 0) + moved,
    distanceTravelled: (Number(state?.distanceTravelled) || 0) + moved,
    arrivalDistance: distance,
    collisionCount: (Number(state?.collisionCount) || 0) + advanced.collisions,
    overlapCount: avoidance.overlaps,
    yielding: avoidance.yielding,
  };
}

export function createRemoteSnapshotBuffer(initial = null) {
  const snapshots = [];
  if (initial && Number.isFinite(Number(initial.x)) && Number.isFinite(Number(initial.y))) {
    snapshots.push({ x: Number(initial.x), y: Number(initial.y), at: Number(initial.at) || 0 });
  }
  return snapshots;
}

export function pushRemoteSnapshot(buffer, snapshot, maxSnapshots = 14) {
  if (!Array.isArray(buffer) || !snapshot) return buffer;
  const next = { x: Number(snapshot.x), y: Number(snapshot.y), at: Number(snapshot.at) || 0 };
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) return buffer;
  const last = buffer.at(-1);
  if (last && last.x === next.x && last.y === next.y && last.at === next.at) return buffer;
  buffer.push(next);
  buffer.sort((left, right) => left.at - right.at);
  if (buffer.length > maxSnapshots) buffer.splice(0, buffer.length - maxSnapshots);
  return buffer;
}

export function sampleRemoteSnapshot(buffer, now, options = {}) {
  if (!Array.isArray(buffer) || !buffer.length) return null;
  const interpolationDelay = Number(options.interpolationDelay) || 140;
  const renderAt = Number(now) - interpolationDelay;
  let previous = buffer[0];
  for (let index = 1; index < buffer.length; index += 1) {
    const next = buffer[index];
    if (next.at >= renderAt) {
      const span = Math.max(1, next.at - previous.at);
      const progress = clamp((renderAt - previous.at) / span, 0, 1);
      return { x: previous.x + (next.x - previous.x) * progress, y: previous.y + (next.y - previous.y) * progress, mode: 'interpolate' };
    }
    previous = next;
  }
  const before = buffer.at(-2);
  if (!before) return { x: previous.x, y: previous.y, mode: 'hold' };
  const elapsed = clamp(renderAt - previous.at, 0, Number(options.maxPredictionMs) || 220);
  const span = Math.max(1, previous.at - before.at);
  return {
    x: previous.x + (previous.x - before.x) / span * elapsed,
    y: previous.y + (previous.y - before.y) / span * elapsed,
    mode: elapsed > 0 ? 'predict' : 'hold',
  };
}

export function reconcileRemoteTarget(current, target, dt = 1 / 60, options = {}) {
  if (!target) return { target: current, mode: 'hold', correction: 0 };
  const distance = Math.hypot(target.x - current.x, target.y - current.y);
  const teleportDistance = Number(options.teleportDistance) || 5.5;
  if (distance >= teleportDistance) return { target: { x: target.x, y: target.y }, mode: 'waygate', correction: distance };
  const rate = Number(options.rate) || 9;
  const alpha = 1 - Math.exp(-rate * clamp(Number(dt) || 1 / 60, 1 / 240, 1 / 20));
  const maxCorrection = Number(options.maxCorrection) || .35;
  const correction = Math.min(distance * alpha, maxCorrection);
  if (distance < .001) return { target: { x: target.x, y: target.y }, mode: target.mode || 'hold', correction: 0 };
  return {
    target: { x: current.x + (target.x - current.x) / distance * correction, y: current.y + (target.y - current.y) / distance * correction },
    mode: target.mode || 'soft',
    correction,
  };
}

export function createActivityState(actor, now = 0) {
  const seed = [...String(actor?.id || 'actor')].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return {
    phase: 'idle',
    activityIndex: seed % Math.max(1, actor?.routine?.length || 1),
    nextDecisionAt: Number(now) + 3200 + seed % 2600,
    dwellMs: 0,
    objectId: null,
  };
}

export function advanceActivityState(state, now, options = {}) {
  if (Number(now) < Number(state?.nextDecisionAt || 0)) return state;
  const routineLength = Math.max(1, Number(options.routineLength) || 1);
  if (state.phase === 'commute') {
    const dwellMs = Number(options.dwellMs) || 6200;
    return { ...state, phase: 'interact', nextDecisionAt: Number(now) + dwellMs, dwellMs };
  }
  const activityIndex = (Number(state.activityIndex) + 1) % routineLength;
  return { ...state, phase: 'commute', activityIndex, nextDecisionAt: Number.POSITIVE_INFINITY, dwellMs: 0 };
}

export function cameraTargetWithDeadZone(camera, actor, viewport = {}, options = {}) {
  const halfW = Math.max(1, Number(viewport.halfW) || 8);
  const halfH = Math.max(1, Number(viewport.halfH) || 6);
  const deadX = halfW * (Number(options.deadZoneX) || .16);
  const deadY = halfH * (Number(options.deadZoneY) || .13);
  const lookAhead = Number(options.lookAhead) || .22;
  const desired = {
    x: Number(actor.x) + (Number(actor.vx) || 0) * lookAhead,
    y: Number(actor.y) + (Number(actor.vy) || 0) * lookAhead,
  };
  const dx = desired.x - Number(camera.x);
  const dy = desired.y - Number(camera.y);
  return {
    x: Math.abs(dx) <= deadX ? Number(camera.x) : desired.x - Math.sign(dx) * deadX,
    y: Math.abs(dy) <= deadY ? Number(camera.y) : desired.y - Math.sign(dy) * deadY,
  };
}
