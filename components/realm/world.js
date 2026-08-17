import { REALM_TREASURY_CATALOG } from '@/lib/realm-treasury';

// One continuous Guildhall replaces the former six-room tile collage. The
// aspect ratio intentionally matches the graduated 1536x1024 environment plate
// after the 2.5D Y projection, so actors, landmarks and architecture share one
// camera and one perspective.
export const WORLD = { cols: 48, rows: 44, tile: 32 };

export const DEFAULT_WORLD_POSITION = Object.freeze({ x: 24, y: 36.5 });

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
  { id: 'command-dais', panel: 'command', name: 'Phòng điều hành', hint: 'Mở ưu tiên và quyết định vận hành', kind: 'command', x: 24, y: 8 },
  { id: 'guild-roster', panel: 'guild', name: 'Sổ bộ Guild', hint: 'Mở hồ sơ nhân sự', kind: 'roster', x: 10, y: 11.5 },
  { id: 'war-table', panel: 'campaigns', name: 'Bàn chiến dịch', hint: 'Mở dự án và tiến độ', kind: 'table', x: 24, y: 20.5 },
  { id: 'treasury-chest', panel: 'treasury', name: 'Rương Hoàng gia', hint: 'Mở ví Gold và sổ cái', kind: 'chest', x: 38, y: 11.5 },
  { id: 'tavern-board', panel: 'chat', name: 'Bảng Tavern', hint: 'Mở chat khu vực', kind: 'tavern', x: 38, y: 29 },
  { id: 'quest-board', panel: 'quests', name: 'Quest Board', hint: 'Xem nhiệm vụ hôm nay', kind: 'board', x: 38, y: 21.5 },
  { id: 'realm-gate', panel: 'briefing', name: 'Cổng Realm', hint: 'Mở tổng quan ngày làm việc', kind: 'portal', x: 24, y: 33.6 },
  { id: 'arcane-forge', panel: 'shop', name: 'Arcane Forge', hint: 'Đổi Gold lấy vật phẩm', kind: 'forge', x: 10, y: 29 },
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
