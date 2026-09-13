// Spatial presentation only. Business records and actions stay in the ERP.
export const OFFICE_BOUNDS = Object.freeze({ minX: -15.2, maxX: 15.2, minZ: -10.8, maxZ: 10.8 });
export const OFFICE_SPAWN = Object.freeze({ x: 0, z: 8.5 });
export const OFFICE_ACTOR_RADIUS = 0.32;
export const OFFICE_PORTALS = Object.freeze({
  'quest-board': { panel: 'quests', legacyId: 'quest-board', name: 'Bàn công việc', hint: 'Nhận việc, cập nhật tiến độ và gửi review' },
  'project-table': { panel: 'campaigns', legacyId: 'war-table', name: 'Bàn dự án', hint: 'Mở dự án và phối hợp cùng nhóm' },
  treasury: { panel: 'treasury', legacyId: 'treasury-chest', name: 'Kho bạc', hint: 'Xem số dư và lịch sử Gold' },
  archive: { panel: 'briefing', legacyId: 'realm-gate', name: 'Thư viện', hint: 'Xem tổng quan ngày làm việc' },
  'guild-hall': { panel: 'guild', legacyId: 'guild-roster', name: 'Phòng đội nhóm', hint: 'Gặp đồng đội và xem hồ sơ' },
  'command-center': { panel: 'command', legacyId: 'command-dais', name: 'Phòng điều hành', hint: 'Xem ưu tiên và quyết định cần xử lý' },
  chronicle: { panel: 'profile', legacyId: 'arcane-forge', name: 'Góc cá nhân', hint: 'Mở hồ sơ và hành trình của bạn' },
  embassy: { panel: 'party', legacyId: 'tavern-board', name: 'Phòng họp', hint: 'Mở cuộc gọi và chia sẻ màn hình' },
});
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export function normalizeOfficePosition(value, fallback = OFFICE_SPAWN) {
  return { x: clamp(Number.isFinite(value?.x) ? value.x : fallback.x, OFFICE_BOUNDS.minX, OFFICE_BOUNDS.maxX),
    z: clamp(Number.isFinite(value?.z) ? value.z : fallback.z, OFFICE_BOUNDS.minZ, OFFICE_BOUNDS.maxZ) };
}
export function officeToPresence(point) {
  const p = normalizeOfficePosition(point);
  return { x: 24 + p.x * 1.2, y: 22 + p.z * 1.2, zoneId: null };
}
export function presenceToOffice(point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return { ...OFFICE_SPAWN };
  return normalizeOfficePosition({ x: (point.x - 24) / 1.2, z: (point.y - 22) / 1.2 });
}
export function officeDistance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
export function officeArrivalReady(point, destination) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.z)
    && Number.isFinite(destination?.x) && Number.isFinite(destination?.z)
    && officeDistance(point, destination) <= .18;
}
export function officeWalkable(point, colliders = [], radius = OFFICE_ACTOR_RADIUS) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return false;
  if (point.x < OFFICE_BOUNDS.minX + radius || point.x > OFFICE_BOUNDS.maxX - radius
    || point.z < OFFICE_BOUNDS.minZ + radius || point.z > OFFICE_BOUNDS.maxZ - radius) return false;
  return !colliders.some(c => point.x > c.minX - radius && point.x < c.maxX + radius
    && point.z > c.minZ - radius && point.z < c.maxZ + radius);
}
export function nearestOfficePoint(point, colliders = []) {
  const p = normalizeOfficePosition(point);
  if (officeWalkable(p, colliders)) return p;
  for (let radius = .4; radius <= 5; radius += .3) {
    for (let i = 0; i < 24; i++) {
      const candidate = { x: p.x + Math.cos(i * Math.PI / 12) * radius, z: p.z + Math.sin(i * Math.PI / 12) * radius };
      if (officeWalkable(candidate, colliders)) return candidate;
    }
  }
  return officeWalkable(OFFICE_SPAWN, colliders) ? { ...OFFICE_SPAWN } : null;
}
export function moveOfficeActor(point, delta, colliders = []) {
  let p = { ...point };
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / .15));
  for (let i = 0; i < steps; i++) {
    const x = { x: p.x + delta.x / steps, z: p.z };
    if (officeWalkable(x, colliders)) p = x;
    const z = { x: p.x, z: p.z + delta.z / steps };
    if (officeWalkable(z, colliders)) p = z;
  }
  return p;
}
export function officeSegmentClear(a, b, colliders = []) {
  const steps = Math.max(1, Math.ceil(officeDistance(a, b) / .2));
  for (let i = 1; i <= steps; i++) {
    if (!officeWalkable({ x: a.x + (b.x - a.x) * i / steps, z: a.z + (b.z - a.z) * i / steps }, colliders)) return false;
  }
  return true;
}
// Bounded A* on a half-metre grid. Every edge is collision checked, including diagonals.
export function findOfficePath(start, goal, colliders = []) {
  const target = nearestOfficePoint(goal, colliders);
  if (!target || !officeWalkable(start, colliders)) return [];
  if (officeSegmentClear(start, target, colliders)) return [target];
  const cell = .5;
  const node = p => ({ x: Math.round(p.x / cell), z: Math.round(p.z / cell) });
  const position = p => ({ x: p.x * cell, z: p.z * cell });
  const key = p => p.x + ':' + p.z;
  const origin = node(start), open = [], best = new Map(), closed = new Set();
  // A valid foot position can round inside furniture. Connect it to all nearby
  // reachable grid vertices instead of treating that rounding artifact as a wall.
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const seed = { x: origin.x + dx, z: origin.z + dz }, seedPoint = position(seed);
    if (!officeWalkable(seedPoint, colliders) || !officeSegmentClear(start, seedPoint, colliders)) continue;
    const g = officeDistance(start, seedPoint);
    const first = { ...seed, g, f: g + officeDistance(seedPoint, target), parent: null };
    open.push(first); best.set(key(first), g);
  }
  if (!open.length) return [];
  let end = null, visited = 0;
  while (open.length && visited++ < 5000) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestIndex].f) bestIndex = i;
    const current = open.splice(bestIndex, 1)[0], k = key(current), p = position(current);
    if (closed.has(k)) continue;
    closed.add(k);
    if (officeDistance(p, target) < .8 && officeSegmentClear(p, target, colliders)) { end = current; break; }
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const next = { x: current.x + dx, z: current.z + dz }, np = position(next), nk = key(next);
      if (closed.has(nk) || !officeWalkable(np, colliders) || !officeSegmentClear(p, np, colliders)) continue;
      const g = current.g + Math.hypot(dx, dz) * cell;
      if ((best.get(nk) ?? Infinity) <= g) continue;
      best.set(nk, g);
      open.push({ ...next, g, f: g + officeDistance(np, target), parent: current });
    }
  }
  if (!end) return [];
  const reversed = [target];
  while (end) { reversed.push(position(end)); end = end.parent; }
  const path = reversed.reverse(), simplified = [];
  let cursor = start;
  for (let index = 0; index < path.length;) {
    let farthest = index;
    for (let j = index + 1; j < path.length; j++) {
      if (officeSegmentClear(cursor, path[j], colliders)) farthest = j; else break;
    }
    simplified.push(path[farthest]); cursor = path[farthest]; index = farthest + 1;
  }
  return simplified;
}
export function officeKeyVector(keys, yaw) {
  const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
  const right = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  const length = Math.hypot(forward, right) || 1;
  return { x: (right * Math.cos(yaw) - forward * Math.sin(yaw)) / length,
    z: (-forward * Math.cos(yaw) - right * Math.sin(yaw)) / length };
}
export function officePortalForLegacy(id, panel) {
  const ids = Object.keys(OFFICE_PORTALS);
  return ids.find(key => OFFICE_PORTALS[key].legacyId === id)
    || ids.find(key => OFFICE_PORTALS[key].panel === panel) || null;
}
