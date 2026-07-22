export const REALM_LOADOUT_SLOTS = Object.freeze(['title', 'seal', 'banner']);

export const REALM_TAVERN_CATALOG = Object.freeze([
  Object.freeze({
    id: 'guild-banner',
    name: 'Banner Guild cá nhân',
    equipName: 'Guild Banner',
    note: 'Trang trí hồ sơ và góc làm việc trong Realm.',
    price: 8,
    kind: 'cosmetic',
    slot: 'banner',
    slotLabel: 'Banner',
    fulfillment: 'Mở khóa vĩnh viễn trong Realm',
    icon: 'shield',
  }),
  Object.freeze({
    id: 'iron-scribe-title',
    name: 'Danh hiệu Iron Scribe',
    equipName: 'Iron Scribe',
    note: 'Danh hiệu hiển thị dưới avatar và hồ sơ nhân vật.',
    price: 12,
    kind: 'cosmetic',
    slot: 'title',
    slotLabel: 'Danh hiệu',
    fulfillment: 'Mở khóa vĩnh viễn trong Realm',
    icon: 'edit',
  }),
  Object.freeze({
    id: 'emerald-seal',
    name: 'Ấn tín Emerald Guild',
    equipName: 'Emerald Guild',
    note: 'Huy hiệu hồ sơ phiên bản giới hạn của mùa.',
    price: 6,
    kind: 'cosmetic',
    slot: 'seal',
    slotLabel: 'Ấn tín',
    fulfillment: 'Mở khóa vĩnh viễn trong Realm',
    icon: 'tag',
  }),
  Object.freeze({
    id: 'learning-pass-300',
    name: 'Learning Pass 300.000đ',
    note: 'Yêu cầu ngân sách học tập; HR kiểm tra policy trước khi cấp.',
    price: 20,
    kind: 'benefit',
    approvalRole: 'HR',
    fulfillment: 'HR xác nhận chứng từ và cách sử dụng',
    icon: 'reports',
  }),
  Object.freeze({
    id: 'mentor-session',
    name: 'Mentor Session chuyên môn',
    note: 'Một phiên mentoring nội bộ; phụ thuộc lịch mentor và nhu cầu phát triển.',
    price: 16,
    kind: 'benefit',
    approvalRole: 'HR',
    fulfillment: 'People Guild sắp lịch sau phê duyệt',
    icon: 'staff',
  }),
]);

const ITEM_BY_ID = new Map(REALM_TAVERN_CATALOG.map((item) => [item.id, item]));
const SLOT_SET = new Set(REALM_LOADOUT_SLOTS);

export function realmTavernItem(itemId) {
  return ITEM_BY_ID.get(String(itemId || '').trim()) || null;
}

export function realmLoadoutSourceId(item, nonce) {
  return `${item.slot}:${item.id}:${String(nonce || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(-48) || 'event'}`;
}

export function parseRealmLoadoutEntry(entry) {
  if (entry?.type !== 'loadout_equip' || entry?.sourceType !== 'loadout') return null;
  const [slot, itemId] = String(entry.sourceId || '').split(':');
  const item = realmTavernItem(itemId);
  if (!SLOT_SET.has(slot) || !item || item.kind !== 'cosmetic' || item.slot !== slot) return null;
  return { slot, item, entry };
}

export function createRealmInventory(entries = []) {
  const ownedIds = new Set(entries
    .filter((entry) => entry?.type === 'shop_spend' && entry?.sourceType === 'shop' && realmTavernItem(entry.sourceId)?.kind === 'cosmetic')
    .map((entry) => entry.sourceId));
  const equipped = {};
  const loadoutEntries = entries
    .map(parseRealmLoadoutEntry)
    .filter(Boolean)
    .sort((a, b) => {
      const time = new Date(b.entry.createdAt || 0).getTime() - new Date(a.entry.createdAt || 0).getTime();
      return time || String(b.entry.id || '').localeCompare(String(a.entry.id || ''));
    });
  for (const event of loadoutEntries) {
    if (!equipped[event.slot] && ownedIds.has(event.item.id)) equipped[event.slot] = event.item;
  }
  const inventory = REALM_TAVERN_CATALOG
    .filter((item) => item.kind === 'cosmetic' && ownedIds.has(item.id))
    .map((item) => ({ ...item, equipped: equipped[item.slot]?.id === item.id }));
  return {
    inventory,
    loadout: Object.fromEntries(REALM_LOADOUT_SLOTS.map((slot) => [slot, equipped[slot] || null])),
  };
}

