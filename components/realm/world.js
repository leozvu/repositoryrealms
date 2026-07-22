import { REALM_TREASURY_CATALOG } from '@/lib/realm-treasury';

// The Realm is deliberately larger than the viewport. Camera follow and the
// minimap keep navigation legible while each business room gets enough space
// for people, functional objects and generated environment props.
export const WORLD = { cols: 58, rows: 36, tile: 32 };

export const DEFAULT_WORLD_POSITION = Object.freeze({ x: 29, y: 30.5 });

export const ROOMS = [
  { id: 'guild', name: 'Guild Hall', subtitle: 'Nhân sự & đội nhóm', x: 1, y: 1, w: 17, h: 15, floor: '#2d4a3d' },
  { id: 'war', name: 'War Room', subtitle: 'Dự án & chiến dịch', x: 19, y: 1, w: 20, h: 15, floor: '#3d3a48' },
  { id: 'treasury', name: 'Royal Treasury', subtitle: 'Gold & tài chính', x: 40, y: 1, w: 17, h: 15, floor: '#4b3c2a' },
  { id: 'tavern', name: 'The Lantern Tavern', subtitle: 'Chat & gặp gỡ', x: 1, y: 17, w: 17, h: 18, floor: '#49362f' },
  { id: 'hall', name: 'Great Hall', subtitle: 'Quest Board', x: 19, y: 17, w: 20, h: 18, floor: '#33443d' },
  { id: 'forge', name: 'Arcane Forge', subtitle: 'Shop & tự động hóa', x: 40, y: 17, w: 17, h: 18, floor: '#44333b' },
];

export const PRIVATE_ZONES = [
  { id: 'guild-pod', name: 'Bàn Guild', x: 4, y: 4, w: 10, h: 6 },
  { id: 'war-council', name: 'Hội đồng Chiến dịch', x: 23, y: 4, w: 12, h: 6 },
  { id: 'treasury-audit', name: 'Phòng Đối soát', x: 43, y: 4, w: 10, h: 6 },
  { id: 'tavern-booth', name: 'Bàn riêng Tavern', x: 4, y: 22, w: 10, h: 8 },
];

export const WORLD_OBJECTS = [
  { id: 'guild-roster', panel: 'guild', name: 'Sổ bộ Guild', hint: 'Mở hồ sơ nhân sự', kind: 'roster', x: 9, y: 8 },
  { id: 'war-table', panel: 'campaigns', name: 'Bàn chiến dịch', hint: 'Mở dự án và tiến độ', kind: 'table', x: 29, y: 8 },
  { id: 'treasury-chest', panel: 'treasury', name: 'Rương Hoàng gia', hint: 'Mở ví Gold và sổ cái', kind: 'chest', x: 48.5, y: 8 },
  { id: 'tavern-board', panel: 'chat', name: 'Bảng Tavern', hint: 'Mở chat khu vực', kind: 'tavern', x: 9, y: 26 },
  { id: 'quest-board', panel: 'quests', name: 'Quest Board', hint: 'Xem nhiệm vụ hôm nay', kind: 'board', x: 29, y: 23 },
  { id: 'realm-gate', panel: 'briefing', name: 'Cổng Realm', hint: 'Mở tổng quan ngày làm việc', kind: 'portal', x: 29, y: 32.5 },
  { id: 'arcane-forge', panel: 'shop', name: 'Arcane Forge', hint: 'Đổi Gold lấy vật phẩm', kind: 'forge', x: 48.5, y: 26 },
];

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

  for (const x of [18, 39]) {
    for (let y = 1; y < WORLD.rows - 1; y += 1) {
      if (![7, 8, 25, 26].includes(y)) add(x, y);
    }
  }

  for (let x = 1; x < WORLD.cols - 1; x += 1) {
    if (![8, 9, 28, 29, 48, 49].includes(x)) add(x, 16);
  }

  return walls;
}

export const WALLS = makeWallSet();

export function isWorldPositionWalkable(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const radius = 0.24;
  return ![
    [x - radius, y - radius], [x + radius, y - radius],
    [x - radius, y + radius], [x + radius, y + radius],
  ].some(([px, py]) => WALLS.has(`${Math.floor(px)},${Math.floor(py)}`));
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
