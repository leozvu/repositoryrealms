export const REALM_WORLD_Y_SCALE = 0.72;

export const REALM_RUNTIME_ASSET_URLS = Object.freeze({
  landmarks: '/realms/assets/runtime/v3-2_5d/business-landmarks.webp',
  occluders: '/realms/assets/runtime/v3-2_5d/foreground-occluders.webp',
  lighting: '/realms/assets/runtime/v3-2_5d/lighting-atmosphere.webp',
  materials: '/realms/assets/runtime/v3-2_5d/material-trims.webp',
});

export const REALM_RUNTIME_CHARACTER_URLS = Object.freeze({
  characterTurnaround: '/realms/assets/runtime/v3-2_5d/character-turnaround.png',
  characterInteractions: '/realms/assets/runtime/v3-2_5d/character-interactions.png',
});

export const REALM_CHARACTER_ATLAS_ROWS = Object.freeze({
  elf: 0,
  dwarf: 1,
  human: 2,
  'half-orc': 3,
  tiefling: 4,
});

export const REALM_OBJECT_VISUALS = Object.freeze({
  'command-dais': Object.freeze({ frame: 0, width: 3.8, height: 3.9, lightFrame: 0, response: 'seal' }),
  'guild-roster': Object.freeze({ frame: 1, width: 3.7, height: 3.8, lightFrame: 1, response: 'drawer' }),
  'war-table': Object.freeze({ frame: 2, width: 4.2, height: 3.8, lightFrame: 5, response: 'map' }),
  'treasury-chest': Object.freeze({ frame: 3, width: 4.1, height: 4.1, lightFrame: 4, response: 'vault' }),
  'tavern-board': Object.freeze({ frame: 4, width: 4.1, height: 4.1, lightFrame: 5, response: 'lantern' }),
  'quest-board': Object.freeze({ frame: 5, width: 3.9, height: 3.9, lightFrame: 6, response: 'council' }),
  'realm-gate': Object.freeze({ frame: 6, width: 3.8, height: 4.2, lightFrame: 7, response: 'gate' }),
  'arcane-forge': Object.freeze({ frame: 7, width: 4.2, height: 4.2, lightFrame: 2, response: 'forge' }),
});

export const REALM_ROOM_MATERIAL_FRAMES = Object.freeze({
  guild: 0,
  war: 1,
  treasury: 3,
  tavern: 2,
  hall: 0,
  forge: 13,
});

export const REALM_OCCLUDER_NODES = Object.freeze([
  Object.freeze({ id: 'arch-guild-north', frame: 0, x: 18.45, y: 8.7, width: 2.9, height: 3.6 }),
  Object.freeze({ id: 'arch-war-north', frame: 1, x: 39.45, y: 8.7, width: 2.9, height: 3.6 }),
  Object.freeze({ id: 'arch-guild-south', frame: 0, x: 18.45, y: 26.7, width: 2.9, height: 3.6 }),
  Object.freeze({ id: 'arch-war-south', frame: 1, x: 39.45, y: 26.7, width: 2.9, height: 3.6 }),
  Object.freeze({ id: 'arch-tavern', frame: 0, x: 9, y: 16.8, width: 2.9, height: 3.6 }),
  Object.freeze({ id: 'arch-hall', frame: 1, x: 29, y: 16.8, width: 2.9, height: 3.6 }),
  Object.freeze({ id: 'arch-forge', frame: 0, x: 49, y: 16.8, width: 2.9, height: 3.6 }),
  Object.freeze({ id: 'command-balustrade', frame: 6, x: 29, y: 6.25, width: 4.2, height: 2.2 }),
  Object.freeze({ id: 'roster-bookcase', frame: 7, x: 4.15, y: 12.8, width: 2.1, height: 3.5, highDetail: true }),
  Object.freeze({ id: 'forge-chimney', frame: 8, x: 54.4, y: 22.4, width: 2.8, height: 4.3 }),
  Object.freeze({ id: 'treasury-gate', frame: 9, x: 54.1, y: 6.1, width: 2.8, height: 4.0, highDetail: true }),
  Object.freeze({ id: 'lantern-chain', frame: 10, x: 14.4, y: 22.4, width: 2.7, height: 3.3, highDetail: true }),
  Object.freeze({ id: 'hall-planter', frame: 11, x: 35, y: 31.6, width: 3.4, height: 2.2, highDetail: true }),
]);

export function projectRealmY(y, tile) {
  return Number(y || 0) * Number(tile || 0) * REALM_WORLD_Y_SCALE;
}

export function unprojectRealmY(y, tile) {
  const scale = Number(tile || 0) * REALM_WORLD_Y_SCALE;
  return scale ? Number(y || 0) / scale : 0;
}

export function realmAtlasFrame(index, columns, rows) {
  const safeColumns = Math.max(1, Number(columns) || 1);
  const safeRows = Math.max(1, Number(rows) || 1);
  const safeIndex = Math.max(0, Math.min(safeColumns * safeRows - 1, Number(index) || 0));
  return Object.freeze({
    column: safeIndex % safeColumns,
    row: Math.floor(safeIndex / safeColumns),
    columns: safeColumns,
    rows: safeRows,
  });
}

export function realmInteractionEnvelope(startedAt, now, phase = 'acting') {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now) || now < startedAt) return 0;
  const elapsed = (now - startedAt) / 1000;
  if (phase === 'succeeded') return Math.max(0, 1 - Math.max(0, elapsed - 0.22) / 1.15);
  return Math.sin(Math.min(1, elapsed / 0.28) * Math.PI * 0.5);
}

export function realmObjectFacing(actor, object) {
  const dx = Number(object?.x) - Number(actor?.x);
  const dy = Number(object?.y) - Number(actor?.y);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return actor?.facing || 'down';
  if (Math.abs(dx) > Math.abs(dy) * 1.35) return dx >= 0 ? 'right' : 'left';
  if (Math.abs(dy) > Math.abs(dx) * 1.35) return dy >= 0 ? 'down' : 'up';
  return `${dy >= 0 ? 'down' : 'up'}-${dx >= 0 ? 'right' : 'left'}`;
}
