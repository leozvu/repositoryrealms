import { REALM_TREASURY_CATALOG } from '@/lib/realm-treasury';

export const WORLD = { cols: 38, rows: 24, tile: 32 };

export const ROOMS = [
  { id: 'guild', name: 'Guild Hall', subtitle: 'Nhân sự & đội nhóm', x: 1, y: 1, w: 11, h: 9, floor: '#2d4a3d' },
  { id: 'war', name: 'War Room', subtitle: 'Dự án & chiến dịch', x: 13, y: 1, w: 12, h: 9, floor: '#3d3a48' },
  { id: 'treasury', name: 'Royal Treasury', subtitle: 'Gold & tài chính', x: 26, y: 1, w: 11, h: 9, floor: '#4b3c2a' },
  { id: 'tavern', name: 'The Lantern Tavern', subtitle: 'Chat & gặp gỡ', x: 1, y: 11, w: 11, h: 12, floor: '#49362f' },
  { id: 'hall', name: 'Great Hall', subtitle: 'Quest Board', x: 13, y: 11, w: 12, h: 12, floor: '#33443d' },
  { id: 'forge', name: 'Arcane Forge', subtitle: 'Shop & tự động hóa', x: 26, y: 11, w: 11, h: 12, floor: '#44333b' },
];

export const PRIVATE_ZONES = [
  { id: 'guild-pod', name: 'Bàn Guild', x: 3, y: 3, w: 7, h: 4 },
  { id: 'war-council', name: 'Hội đồng Chiến dịch', x: 15, y: 3, w: 8, h: 4 },
  { id: 'treasury-audit', name: 'Phòng Đối soát', x: 28, y: 3, w: 7, h: 4 },
  { id: 'tavern-booth', name: 'Bàn riêng Tavern', x: 3, y: 14, w: 7, h: 5 },
];

export const WORLD_OBJECTS = [
  { id: 'guild-roster', panel: 'guild', name: 'Sổ bộ Guild', hint: 'Mở hồ sơ nhân sự', kind: 'roster', x: 5.5, y: 5.5 },
  { id: 'war-table', panel: 'campaigns', name: 'Bàn chiến dịch', hint: 'Mở dự án và tiến độ', kind: 'table', x: 19, y: 5.5 },
  { id: 'treasury-chest', panel: 'treasury', name: 'Rương Hoàng gia', hint: 'Mở ví Gold và sổ cái', kind: 'chest', x: 31.5, y: 5.5 },
  { id: 'tavern-board', panel: 'chat', name: 'Bảng Tavern', hint: 'Mở chat khu vực', kind: 'tavern', x: 5.5, y: 16.5 },
  { id: 'quest-board', panel: 'quests', name: 'Quest Board', hint: 'Xem nhiệm vụ hôm nay', kind: 'board', x: 18.5, y: 15 },
  { id: 'realm-gate', panel: 'briefing', name: 'Cổng Realm', hint: 'Mở tổng quan ngày làm việc', kind: 'portal', x: 18.5, y: 21 },
  { id: 'arcane-forge', panel: 'shop', name: 'Arcane Forge', hint: 'Đổi Gold lấy vật phẩm', kind: 'forge', x: 31.5, y: 16.5 },
];

export const STAFF = [
  { id: 'minh-quan', name: 'Minh Quân', role: 'Quest Master', status: 'available', statusText: 'Đang rà soát campaign', color: '#4f9f73', x: 20.5, y: 6.8 },
  { id: 'mai-anh', name: 'Mai Anh', role: 'Guild Keeper', status: 'busy', statusText: 'Đang onboarding', color: '#b7686b', x: 7.5, y: 6.5 },
  { id: 'quang-vo', name: 'Quang Võ', role: 'Bard / Account', status: 'available', statusText: 'Rảnh để trao đổi', color: '#6e8ec7', x: 7.5, y: 17.5 },
  { id: 'nghia-nguyen', name: 'Nghĩa Nguyễn', role: 'Arcane Engineer', status: 'focus', statusText: 'Focus tới 15:30', color: '#946fc7', x: 30.5, y: 17.5 },
  { id: 'lan-pham', name: 'Lan Phạm', role: 'Royal Accountant', status: 'dnd', statusText: 'Đang khóa sổ', color: '#c58a4c', x: 33, y: 6.8 },
];

export const QUESTS = [
  {
    id: 'q-close-campaign', title: 'Khóa sổ chiến dịch Rồng Xanh', project: 'Campaign Rồng Xanh',
    businessRef: 'TASK-247', module: 'Projects', owner: 'Minh Quân', approval: 'Đã duyệt',
    reward: 5, renown: 120, status: 'ready', priority: 'Epic', due: 'Hôm nay, 16:00',
    progress: 4, total: 4, reviewer: 'Minh Quân',
  },
  {
    id: 'q-lead-review', title: 'Phân loại 12 lead từ Hội chợ phương Bắc', project: 'CRM / Sales',
    businessRef: 'LEAD-086', module: 'CRM', owner: 'Quang Võ', approval: 'Theo tiêu chí',
    reward: 3, renown: 80, status: 'active', priority: 'Skilled', due: 'Hôm nay, 17:30',
    progress: 8, total: 12, reviewer: 'Quang Võ',
  },
  {
    id: 'q-landing', title: 'Hoàn thiện landing page Nhà Giả Kim', project: 'Website Egoric',
    businessRef: 'TASK-251', module: 'Delivery', owner: 'Nghĩa Nguyễn', approval: 'Chờ review',
    reward: 2, renown: 60, status: 'active', priority: 'Common', due: 'Ngày mai',
    progress: 2, total: 5, reviewer: 'Nghĩa Nguyễn',
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

  for (const x of [12, 25]) {
    for (let y = 1; y < WORLD.rows - 1; y += 1) {
      if (![5, 6, 16, 17].includes(y)) add(x, y);
    }
  }

  for (let x = 1; x < WORLD.cols - 1; x += 1) {
    if (![5, 6, 18, 19, 31, 32].includes(x)) add(x, 10);
  }

  return walls;
}

export const WALLS = makeWallSet();

export function roomAt(x, y) {
  return ROOMS.find((room) => x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) || null;
}

export function privateZoneAt(x, y) {
  return PRIVATE_ZONES.find((zone) => x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) || null;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
