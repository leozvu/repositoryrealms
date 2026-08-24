export const REALM_WORLD_V3_VERSION = 3;
export const REALM_WORLD_V3_FLAG = 'NEXT_PUBLIC_REALM_WORLD_V3';
export const REALM_WORLD_FIXED_STEP = 1 / 60;

export const REALM_RACES = Object.freeze([
  Object.freeze({ id: 'elf', label: 'Elf', scale: 1.05, shoulder: .82, head: .9, ears: 1.32, gait: 1.08 }),
  Object.freeze({ id: 'dwarf', label: 'Dwarf', scale: .82, shoulder: 1.24, head: 1.08, ears: .86, gait: .88 }),
  Object.freeze({ id: 'human', label: 'Human', scale: 1, shoulder: 1, head: 1, ears: 1, gait: 1 }),
  Object.freeze({ id: 'half-orc', label: 'Half-Orc', scale: 1.08, shoulder: 1.28, head: 1.04, ears: 1.06, gait: .94 }),
  Object.freeze({ id: 'tiefling', label: 'Tiefling', scale: 1.02, shoulder: .94, head: .96, ears: 1.08, gait: 1.03 }),
]);

export const REALM_GUILD_CLASSES = Object.freeze([
  Object.freeze({ id: 'steward', label: 'Guild Steward', primary: '#496f61', secondary: '#c8a75b', tool: 'staff' }),
  Object.freeze({ id: 'warden', label: 'Project Warden', primary: '#4c5871', secondary: '#b7a26b', tool: 'sword' }),
  Object.freeze({ id: 'goldkeeper', label: 'Goldkeeper', primary: '#705638', secondary: '#d4ad4f', tool: 'ledger' }),
  Object.freeze({ id: 'archivist', label: 'Archivist', primary: '#5c4f71', secondary: '#b9a4d0', tool: 'book' }),
  Object.freeze({ id: 'engineer', label: 'Forge Engineer', primary: '#704438', secondary: '#d07b4d', tool: 'hammer' }),
]);

export const REALM_INTERACTION_PHASES = Object.freeze([
  'idle', 'discovered', 'targeted', 'approached', 'ready', 'acting', 'pending', 'succeeded', 'failed', 'restored',
]);

const PHASE_TRANSITIONS = Object.freeze({
  idle: new Set(['discovered', 'targeted']),
  discovered: new Set(['idle', 'targeted', 'approached']),
  targeted: new Set(['idle', 'approached']),
  approached: new Set(['idle', 'ready', 'targeted']),
  ready: new Set(['idle', 'acting', 'targeted']),
  acting: new Set(['pending', 'succeeded', 'failed']),
  pending: new Set(['succeeded', 'failed']),
  succeeded: new Set(['restored']),
  failed: new Set(['ready', 'restored']),
  restored: new Set(['idle', 'discovered']),
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizedText(value) {
  return String(value || '').trim().normalize('NFKC').toLocaleLowerCase('vi-VN');
}

export function realmWorldV3Enabled(value = process.env.NEXT_PUBLIC_REALM_WORLD_V3) {
  return value !== '0' && value !== 'false' && value !== 'off';
}

export function stableRealmHash(value) {
  const text = String(value || 'realm').normalize('NFKC');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function requestedRace(value) {
  const text = normalizedText(value);
  if (text.includes('dwarf')) return 'dwarf';
  if (text.includes('half-orc') || text.includes('half orc') || text.includes('orc')) return 'half-orc';
  if (text.includes('tiefling')) return 'tiefling';
  if (text.includes('elf')) return 'elf';
  if (text.includes('human')) return 'human';
  return null;
}

function requestedClass(value) {
  const text = normalizedText(value);
  if (text.includes('forge') || text.includes('engineer') || text.includes('smith')) return 'engineer';
  if (text.includes('gold') || text.includes('treasury') || text.includes('finance')) return 'goldkeeper';
  if (text.includes('archive') || text.includes('research') || text.includes('record')) return 'archivist';
  if (text.includes('warden') || text.includes('project') || text.includes('delivery')) return 'warden';
  if (text.includes('steward') || text.includes('people') || text.includes('community')) return 'steward';
  return null;
}

export function realmWorldIdentity(person = {}, entityId = '') {
  const entity = String(person.entityId || entityId || '').trim().slice(0, 100);
  const user = String(person.userId || person.identityId || person.id || '').trim().slice(0, 100);
  if (entity && user) return `${entity}:${user}`;
  if (user) return `user:${user}`;
  const name = normalizedText(person.name);
  return name ? `demo-name:${name}` : '';
}

export function classifyRealmActor(person = {}, entityId = '') {
  const identity = realmWorldIdentity(person, entityId) || normalizedText(person.name) || 'realm-actor';
  const hash = stableRealmHash(identity);
  const raceId = requestedRace(`${person.race || ''} ${person.role || ''}`) || REALM_RACES[hash % REALM_RACES.length].id;
  const classId = requestedClass(`${person.guildClass || ''} ${person.role || ''}`) || REALM_GUILD_CLASSES[Math.floor(hash / 7) % REALM_GUILD_CLASSES.length].id;
  const race = REALM_RACES.find((item) => item.id === raceId) || REALM_RACES[2];
  const guildClass = REALM_GUILD_CLASSES.find((item) => item.id === classId) || REALM_GUILD_CLASSES[0];
  const skinPalettes = ['#d8aa7b', '#b9805f', '#8fb08b', '#c79674', '#9a6e68', '#d4b48d'];
  const hairPalettes = ['#31271f', '#6a3f2d', '#c0aa78', '#d8d3c2', '#422f4d', '#241f28'];
  return Object.freeze({
    identity,
    race,
    guildClass,
    skin: person.skin || skinPalettes[Math.floor(hash / 13) % skinPalettes.length],
    hair: person.hair || hairPalettes[Math.floor(hash / 29) % hairPalettes.length],
    accent: person.color || guildClass.secondary,
    variant: Math.floor(hash / 43) % 4,
  });
}

export function normalizeRealmWorldPeople({ people = [], self = null, entityId = '' } = {}) {
  const selfIdentity = realmWorldIdentity(self || {}, entityId);
  const selfName = normalizedText(self?.name);
  const byIdentity = new Map();
  for (const person of Array.isArray(people) ? people : []) {
    const identity = realmWorldIdentity(person, entityId);
    if (!identity || identity === selfIdentity || (selfName && normalizedText(person?.name) === selfName)) continue;
    const current = byIdentity.get(identity);
    if (!current || Number(person?.seenAt || 0) >= Number(current?.seenAt || 0)) byIdentity.set(identity, person);
  }
  return [...byIdentity.entries()].map(([identity, person]) => ({
    ...person,
    realmIdentity: identity,
    archetype: classifyRealmActor(person, entityId),
  }));
}

export function createRealmMotionState(position = { x: 0, y: 0 }) {
  return {
    x: Number(position.x) || 0,
    y: Number(position.y) || 0,
    vx: 0,
    vy: 0,
    facing: 'down',
    locomotion: 'idle',
    gaitTime: 0,
    distanceTravelled: 0,
  };
}

function facingFromVelocity(vx, vy, fallback = 'down') {
  if (Math.hypot(vx, vy) < .05) return fallback;
  const angle = Math.atan2(vy, vx);
  const directions = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
  return directions[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

export function stepRealmMotion(state, input = {}, dt = REALM_WORLD_FIXED_STEP, options = {}) {
  const delta = clamp(Number(dt) || REALM_WORLD_FIXED_STEP, 1 / 240, 1 / 20);
  const acceleration = Number(options.acceleration) || 27;
  const deceleration = Number(options.deceleration) || 34;
  const maxSpeed = Number(options.maxSpeed) || 4.65;
  const isWalkable = typeof options.isWalkable === 'function' ? options.isWalkable : () => true;
  let ix = clamp(Number(input.x) || 0, -1, 1);
  let iy = clamp(Number(input.y) || 0, -1, 1);
  const inputLength = Math.hypot(ix, iy);
  if (inputLength > 1) {
    ix /= inputLength;
    iy /= inputLength;
  }
  let vx = Number(state.vx) || 0;
  let vy = Number(state.vy) || 0;
  if (Math.hypot(ix, iy) > .001) {
    vx += ix * acceleration * delta;
    vy += iy * acceleration * delta;
  } else {
    const speed = Math.hypot(vx, vy);
    const nextSpeed = Math.max(0, speed - deceleration * delta);
    if (speed > 0) {
      vx *= nextSpeed / speed;
      vy *= nextSpeed / speed;
    }
  }
  const speed = Math.hypot(vx, vy);
  if (speed > maxSpeed) {
    vx = vx / speed * maxSpeed;
    vy = vy / speed * maxSpeed;
  }
  let x = Number(state.x) || 0;
  let y = Number(state.y) || 0;
  const intendedX = x + vx * delta;
  const intendedY = y + vy * delta;
  if (isWalkable({ x: intendedX, y })) x = intendedX;
  else vx = 0;
  if (isWalkable({ x, y: intendedY })) y = intendedY;
  else vy = 0;
  const finalSpeed = Math.hypot(vx, vy);
  const moved = Math.hypot(x - state.x, y - state.y);
  const wasMoving = Math.hypot(Number(state.vx) || 0, Number(state.vy) || 0) > .12;
  const moving = finalSpeed > .12;
  const locomotion = moving ? (wasMoving ? 'walk' : 'start') : (wasMoving ? 'stop' : 'idle');
  return {
    x,
    y,
    vx,
    vy,
    facing: facingFromVelocity(vx, vy, state.facing),
    locomotion,
    gaitTime: (Number(state.gaitTime) || 0) + finalSpeed * delta,
    distanceTravelled: (Number(state.distanceTravelled) || 0) + moved,
  };
}

export function createRealmCameraState(position = { x: 0, y: 0 }) {
  return { x: Number(position.x) || 0, y: Number(position.y) || 0, vx: 0, vy: 0 };
}

export function stepRealmCamera(camera, target, dt = REALM_WORLD_FIXED_STEP, options = {}) {
  const delta = clamp(Number(dt) || REALM_WORLD_FIXED_STEP, 1 / 240, 1 / 20);
  const frequency = Number(options.frequency) || 4.6;
  const damping = Number(options.damping) || .9;
  const omega = Math.PI * 2 * frequency;
  const ax = (Number(target.x) - camera.x) * omega * omega - 2 * damping * omega * camera.vx;
  const ay = (Number(target.y) - camera.y) * omega * omega - 2 * damping * omega * camera.vy;
  const maxVelocity = Number(options.maxVelocity) || 18;
  const vx = clamp(camera.vx + ax * delta, -maxVelocity, maxVelocity);
  const vy = clamp(camera.vy + ay * delta, -maxVelocity, maxVelocity);
  return { x: camera.x + vx * delta, y: camera.y + vy * delta, vx, vy };
}

export function transitionRealmInteraction(current = 'idle', next = 'idle') {
  if (!REALM_INTERACTION_PHASES.includes(current) || !REALM_INTERACTION_PHASES.includes(next)) return current;
  return PHASE_TRANSITIONS[current]?.has(next) ? next : current;
}

export function realmQualityTier({ width = 1280, devicePixelRatio = 1, reducedMotion = false, saveData = false } = {}) {
  if (reducedMotion || saveData || width < 520) return Object.freeze({ id: 'low', dpr: 1, particles: 12, lights: 5, ambientActors: 2 });
  if (width < 1024 || devicePixelRatio > 2) return Object.freeze({ id: 'medium', dpr: Math.min(1.5, devicePixelRatio), particles: 28, lights: 10, ambientActors: 2 });
  return Object.freeze({ id: 'high', dpr: Math.min(2, devicePixelRatio), particles: 54, lights: 18, ambientActors: 5 });
}

export function realmFrameBudget(samples = []) {
  const safe = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (!safe.length) return { average: 0, p95: 0, fps: 0 };
  const average = safe.reduce((sum, value) => sum + value, 0) / safe.length;
  const p95 = safe[Math.min(safe.length - 1, Math.floor(safe.length * .95))];
  return { average, p95, fps: average ? 1000 / average : 0 };
}
