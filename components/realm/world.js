import { REALM_TREASURY_CATALOG } from '@/lib/realm-treasury';

// One continuous Guildhall replaces the former six-room tile collage. The
// aspect ratio intentionally matches the graduated 1536x1024 environment plate
// after the 2.5D Y projection, so actors, landmarks and architecture share one
// camera and one perspective.
export const WORLD = { cols: 48, rows: 44, tile: 32 };

// Spawn just inside the raised portcullis, clear of both its artwork and its
// interaction radius. The former y=36.5 position sat inside the gate artwork;
// y=31.8 immediately opened the gate action ribbon and hid primary HUD tools.
export const DEFAULT_WORLD_POSITION = Object.freeze({ x: 27.2, y: 31.2 });

// These are semantic work zones, not separately rendered rooms. They preserve
// room/presence semantics while the presentation remains one coherent hall.
export const ROOMS = [
  { id: 'guild', name: 'Guild Registry', subtitle: 'Nhân sự & đội nhóm', x: 3, y: 5, w: 14, h: 12, floor: '#26362f' },
  { id: 'war', name: 'Command Gallery', subtitle: 'Dự án & chiến dịch', x: 17, y: 2, w: 14, h: 13, floor: '#302d35' },
  { id: 'treasury', name: 'Royal Treasury', subtitle: 'Gold & tài chính', x: 31, y: 5, w: 14, h: 12, floor: '#3b3124' },
  { id: 'tavern', name: 'The Lantern Commons', subtitle: 'Chat & gặp gỡ', x: 3, y: 18, w: 14, h: 16, floor: '#3a2e29' },
  { id: 'hall', name: 'Great Hall', subtitle: 'Điều phối công việc', x: 17, y: 14, w: 14, h: 29, floor: '#293832' },
  { id: 'forge', name: 'Guild Forge', subtitle: 'Shop & tự động hóa', x: 31, y: 18, w: 14, h: 16, floor: '#382d30' },
];

export const PRIVATE_ZONES = [
  { id: 'guild-pod', name: 'Bàn Guild', x: 6, y: 8, w: 9, h: 6 },
  { id: 'war-council', name: 'Hội đồng Chiến dịch', x: 19, y: 16, w: 10, h: 8 },
  { id: 'treasury-audit', name: 'Phòng Đối soát', x: 34, y: 8, w: 8, h: 6 },
  { id: 'tavern-booth', name: 'Bàn riêng Tavern', x: 33, y: 25, w: 9, h: 7 },
];

export const WORLD_OBJECTS = [
  { id: 'command-dais', panel: 'command', name: 'Phòng điều hành', hint: 'Mở ưu tiên và quyết định vận hành', kind: 'command', x: 24, y: 8, footprint: { rx: 1.25, ry: .72 } },
  { id: 'guild-roster', panel: 'guild', name: 'Sổ bộ Guild', hint: 'Mở hồ sơ nhân sự', kind: 'roster', x: 10, y: 11.5, footprint: { rx: 1.18, ry: .68 } },
  { id: 'war-table', panel: 'campaigns', name: 'Bàn chiến dịch', hint: 'Mở dự án và tiến độ', kind: 'table', x: 24, y: 20.5, footprint: { rx: 1.38, ry: .72 } },
  { id: 'treasury-chest', panel: 'treasury', name: 'Rương Hoàng gia', hint: 'Mở ví Gold và sổ cái', kind: 'chest', x: 38, y: 11.5, footprint: { rx: 1.32, ry: .75 } },
  { id: 'tavern-board', panel: 'chat', name: 'Bảng Tavern', hint: 'Mở chat khu vực', kind: 'tavern', x: 38, y: 29, footprint: { rx: 1.3, ry: .78 } },
  { id: 'quest-board', panel: 'quests', name: 'Quest Board', hint: 'Xem nhiệm vụ hôm nay', kind: 'board', x: 38, y: 21.5, footprint: { rx: 1.24, ry: .72 } },
  { id: 'realm-gate', panel: 'briefing', name: 'Cổng Realm', hint: 'Mở tổng quan ngày làm việc', kind: 'portal', x: 24, y: 33.6, footprint: { rx: 1.18, ry: .72 } },
  { id: 'arcane-forge', panel: 'shop', name: 'Arcane Forge', hint: 'Đổi Gold lấy vật phẩm', kind: 'forge', x: 10, y: 29, footprint: { rx: 1.38, ry: .78 } },
];

export const REALM_ACTOR_RADIUS = .28;

// Geometry is authored in the same 48x44 world coordinates as the unified
// scene plate. These colliders are the spatial contract used by local input,
// click-to-walk, ambient actors and remote presence interpolation.
export const REALM_ARCHITECTURE_COLLIDERS = Object.freeze([
  Object.freeze({ id: 'command-balustrade', type: 'rect', minX: 18.15, maxX: 29.85, minY: 12.05, maxY: 14.75 }),
  Object.freeze({
    id: 'council-ring', type: 'ellipse-ring', cx: 24, cy: 19.35,
    outerRx: 7.8, outerRy: 7.05, innerRx: 4.55, innerRy: 4.35,
    portals: Object.freeze([{ minX: 22.35, maxX: 25.65, minY: 22.9, maxY: 27.2 }]),
  }),
  Object.freeze({
    id: 'eastern-chamber-ring', type: 'ellipse-ring', cx: 39.45, cy: 19.6,
    outerRx: 6.25, outerRy: 7.05, innerRx: 4.35, innerRy: 4.55,
    portals: Object.freeze([{ minX: 37.75, maxX: 41.25, minY: 23.05, maxY: 27.4 }]),
  }),
  Object.freeze({ id: 'western-gallery-wall', type: 'rect', minX: 1.8, maxX: 13.65, minY: 14.65, maxY: 16.85 }),
  Object.freeze({ id: 'south-wall-west', type: 'rect', minX: .8, maxX: 20.25, minY: 33.75, maxY: 37.25 }),
  Object.freeze({ id: 'south-wall-east', type: 'rect', minX: 27.75, maxX: 47.2, minY: 33.75, maxY: 37.25 }),
  ...[
    [13.75, 14.5], [34.25, 14.25], [15.15, 25.75], [32.85, 25.65],
    [19.15, 30.35], [28.85, 30.35],
  ].map(([cx, cy], index) => Object.freeze({ id: `stone-pillar-${index + 1}`, type: 'ellipse', cx, cy, rx: .58, ry: .78 })),
]);

// Foreground pieces are depth-sorted alongside actors instead of being drawn
// as opaque rectangular screenshots after the whole scene. Annulus entries
// trace the actual curved masonry; polygon entries trace straight walls.
export const REALM_ARCHITECTURE_OCCLUDERS = Object.freeze([
  Object.freeze({ id: 'command-front-rail', type: 'annulus', cx: 24, cy: 8.55, outerRx: 6.75, outerRy: 6.45, innerRx: 5.15, innerRy: 4.8, start: 0, end: Math.PI, depthY: 14.7 }),
  Object.freeze({ id: 'council-north-rail', type: 'annulus', cx: 24, cy: 19.35, outerRx: 7.8, outerRy: 7.05, innerRx: 4.55, innerRy: 4.35, start: Math.PI, end: Math.PI * 2, depthY: 15.1 }),
  Object.freeze({ id: 'council-south-rail', type: 'annulus', cx: 24, cy: 19.35, outerRx: 7.8, outerRy: 7.05, innerRx: 4.55, innerRy: 4.35, start: 0, end: Math.PI, depthY: 25.1 }),
  Object.freeze({ id: 'eastern-north-rail', type: 'annulus', cx: 39.45, cy: 19.6, outerRx: 6.25, outerRy: 7.05, innerRx: 4.35, innerRy: 4.55, start: Math.PI, end: Math.PI * 2, depthY: 15.2 }),
  Object.freeze({ id: 'eastern-south-rail', type: 'annulus', cx: 39.45, cy: 19.6, outerRx: 6.25, outerRy: 7.05, innerRx: 4.35, innerRy: 4.55, start: 0, end: Math.PI, depthY: 25.5 }),
  Object.freeze({ id: 'western-gallery-front', type: 'polygon', points: Object.freeze([[1.8, 14.55], [13.7, 14.55], [13.7, 16.9], [1.8, 16.9]]), depthY: 16.9 }),
  Object.freeze({ id: 'south-wall-west-front', type: 'polygon', points: Object.freeze([[.7, 33.65], [20.3, 33.65], [20.3, 39.4], [.7, 39.4]]), depthY: 36.8 }),
  Object.freeze({ id: 'south-wall-east-front', type: 'polygon', points: Object.freeze([[27.7, 33.65], [47.3, 33.65], [47.3, 39.4], [27.7, 39.4]]), depthY: 36.8 }),
]);

// Không dựng NPC giả. Bản đồ chỉ hiển thị nhân sự thật từ ERP directory
// và người chơi đang online qua Realm presence.
export const STAFF = [];

export const QUESTS = [
  {
    id: 'q-close-campaign', title: 'Khóa sổ chiến dịch Rồng Xanh', project: 'Campaign Rồng Xanh',
    businessRef: 'TASK-247', module: 'Projects', owner: 'Nguyễn Minh An', approval: 'Đã duyệt',
    reward: 5, renown: 120, status: 'ready', priority: 'Epic', due: 'Hôm nay, 16:00',
    progress: 4, total: 4, reviewer: 'Nguyễn Minh An',
  },
  {
    id: 'q-lead-review', title: 'Phân loại 12 lead từ Hội chợ phương Bắc', project: 'CRM / Sales',
    businessRef: 'LEAD-086', module: 'CRM', owner: 'Trần Khánh Linh', approval: 'Theo tiêu chí',
    reward: 3, renown: 80, status: 'active', priority: 'Skilled', due: 'Hôm nay, 17:30',
    progress: 8, total: 12, reviewer: 'Trần Khánh Linh',
  },
  {
    id: 'q-landing', title: 'Hoàn thiện landing page Nhà Giả Kim', project: 'Website Egoric',
    businessRef: 'TASK-251', module: 'Delivery', owner: 'Đỗ Quốc Anh', approval: 'Chờ review',
    reward: 2, renown: 60, status: 'active', priority: 'Common', due: 'Ngày mai',
    progress: 2, total: 5, reviewer: 'Đỗ Quốc Anh',
  },
];

export const SHOP_ITEMS = REALM_TREASURY_CATALOG;

export const INITIAL_LEDGER = [
  { id: 'l1', at: '09:42', type: 'earn', amount: 3, label: 'Duyệt xong: Báo giá Lumen' },
  { id: 'l2', at: 'Hôm qua', type: 'earn', amount: 2, label: 'Quest: Báo cáo tuần Guild' },
  { id: 'l3', at: 'Thứ Hai', type: 'spend', amount: -6, label: 'Đổi: Khung avatar Đồng' },
];

export function makeWallSet() {
  const walls = new Set();
  const add = (x, y) => walls.add(`${x},${y}`);

  for (let x = 0; x < WORLD.cols; x += 1) {
    add(x, 0);
    add(x, WORLD.rows - 1);
  }
  for (let y = 0; y < WORLD.rows; y += 1) {
    add(0, y);
    add(WORLD.cols - 1, y);
  }

  // Match the octagonal shell and the narrow southern gate of the art plate.
  // Internal business zones stay connected; architecture never creates six
  // isolated boxes again.
  for (let y = 1; y < WORLD.rows - 1; y += 1) {
    let minX = 2;
    let maxX = WORLD.cols - 3;
    if (y < 5) { minX = 11 - y; maxX = WORLD.cols - minX - 1; }
    else if (y < 9) { minX = 6 - Math.floor((y - 5) / 2); maxX = WORLD.cols - minX - 1; }
    else if (y >= 37) { minX = 20; maxX = 27; }
    for (let x = 1; x < WORLD.cols - 1; x += 1) {
      if (x < minX || x > maxX) add(x, y);
    }
  }

  return walls;
}

export const WALLS = makeWallSet();

function pointInsideRect(position, rect, padding = 0) {
  return position.x >= rect.minX - padding
    && position.x <= rect.maxX + padding
    && position.y >= rect.minY - padding
    && position.y <= rect.maxY + padding;
}

function pointInsideEllipse(position, ellipse, padding = 0) {
  const rx = Math.max(.01, Number(ellipse.rx) + padding);
  const ry = Math.max(.01, Number(ellipse.ry) + padding);
  const dx = (position.x - ellipse.cx) / rx;
  const dy = (position.y - ellipse.cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function pointInsideRing(position, ring, padding = 0) {
  if (ring.portals?.some((portal) => pointInsideRect(position, portal, -Math.min(padding, .18)))) return false;
  const outerX = (position.x - ring.cx) / Math.max(.01, ring.outerRx + padding);
  const outerY = (position.y - ring.cy) / Math.max(.01, ring.outerRy + padding);
  if (outerX * outerX + outerY * outerY > 1) return false;
  const innerX = (position.x - ring.cx) / Math.max(.01, ring.innerRx - padding);
  const innerY = (position.y - ring.cy) / Math.max(.01, ring.innerRy - padding);
  return innerX * innerX + innerY * innerY >= 1;
}

export function worldCollisionAt(position, options = {}) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { id: 'invalid-position', type: 'invalid' };
  const point = { x, y };
  const radius = Number.isFinite(options.radius) ? Math.max(0, options.radius) : REALM_ACTOR_RADIUS;
  const shellCollision = [
    [x - radius, y - radius], [x + radius, y - radius],
    [x - radius, y + radius], [x + radius, y + radius],
  ].some(([px, py]) => WALLS.has(`${Math.floor(px)},${Math.floor(py)}`));
  if (shellCollision) return { id: 'guildhall-shell', type: 'shell' };

  for (const collider of REALM_ARCHITECTURE_COLLIDERS) {
    const hit = collider.type === 'rect'
      ? pointInsideRect(point, collider, radius)
      : collider.type === 'ellipse'
        ? pointInsideEllipse(point, collider, radius)
        : pointInsideRing(point, collider, radius);
    if (hit) return collider;
  }

  if (options.includeObjects !== false) {
    for (const object of WORLD_OBJECTS) {
      if (pointInsideEllipse(point, {
        cx: object.x,
        cy: object.y,
        rx: object.footprint?.rx || 1.2,
        ry: object.footprint?.ry || .72,
      }, radius)) return { id: object.id, type: 'object', object };
    }
  }

  return null;
}

export function isWorldPositionWalkable(position, options) {
  return worldCollisionAt(position, options) == null;
}

export function objectInteractionPoints(object) {
  if (!object) return [];
  const rx = object.footprint?.rx || 1.2;
  const ry = object.footprint?.ry || .72;
  const candidates = [
    { x: object.x, y: object.y + ry + .72 },
    { x: object.x + rx + .72, y: object.y },
    { x: object.x - rx - .72, y: object.y },
    { x: object.x, y: object.y - ry - .72 },
  ];
  return candidates.filter(isWorldPositionWalkable);
}

export function nearestWalkableWorldPosition(position, fallback = DEFAULT_WORLD_POSITION, maxRadius = 6) {
  const candidate = {
    x: Math.max(1, Math.min(WORLD.cols - 2, Number(position?.x))),
    y: Math.max(1, Math.min(WORLD.rows - 2, Number(position?.y))),
  };
  if (Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && isWorldPositionWalkable(candidate)) return candidate;

  for (let radius = .5; radius <= maxRadius; radius += .5) {
    const steps = Math.max(12, Math.ceil(radius * 12));
    for (let index = 0; index < steps; index += 1) {
      const angle = index / steps * Math.PI * 2;
      const point = {
        x: Math.max(1, Math.min(WORLD.cols - 2, candidate.x + Math.cos(angle) * radius)),
        y: Math.max(1, Math.min(WORLD.rows - 2, candidate.y + Math.sin(angle) * radius)),
      };
      if (isWorldPositionWalkable(point)) return point;
    }
  }

  return isWorldPositionWalkable(fallback) ? { ...fallback } : { ...DEFAULT_WORLD_POSITION };
}

export function normalizeWorldPosition(position, fallback = DEFAULT_WORLD_POSITION) {
  const candidate = {
    x: Math.max(1, Math.min(WORLD.cols - 2, Number(position?.x))),
    y: Math.max(1, Math.min(WORLD.rows - 2, Number(position?.y))),
  };
  return isWorldPositionWalkable(candidate) ? candidate : { ...fallback };
}

export function roomAt(x, y) {
  return ROOMS.find((room) => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) || null;
}

export function privateZoneAt(x, y) {
  return PRIVATE_ZONES.find((zone) => x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) || null;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
