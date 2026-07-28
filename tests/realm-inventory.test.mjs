import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmInventory, parseRealmLoadoutEntry, realmLoadoutSourceId, realmTavernItem } from '../lib/realm-inventory.js';

test('inventory suy ra ownership và loadout mới nhất từ journal append-only', () => {
  const entries = [
    { id: 'purchase', type: 'shop_spend', sourceType: 'shop', sourceId: 'guild-banner', createdAt: '2026-07-17T09:00:00.000Z' },
    { id: 'equip-old', type: 'loadout_equip', sourceType: 'loadout', sourceId: 'banner:guild-banner:first', createdAt: '2026-07-17T09:05:00.000Z' },
    { id: 'equip-new', type: 'loadout_equip', sourceType: 'loadout', sourceId: 'banner:guild-banner:second', createdAt: '2026-07-17T09:10:00.000Z' },
  ];
  const result = createRealmInventory(entries);
  assert.equal(result.inventory.length, 1);
  assert.equal(result.inventory[0].equipped, true);
  assert.equal(result.loadout.banner.id, 'guild-banner');
  assert.equal(result.loadout.title, null);
});

test('loadout bỏ qua event giả mạo hoặc vật phẩm chưa sở hữu', () => {
  const forged = { type: 'loadout_equip', sourceType: 'loadout', sourceId: 'title:iron-scribe-title:forged', createdAt: '2026-07-17T09:10:00.000Z' };
  assert.equal(parseRealmLoadoutEntry({ ...forged, sourceId: 'seal:iron-scribe-title:forged' }), null);
  assert.equal(createRealmInventory([forged]).loadout.title, null);
});

test('source id của loadout bị giới hạn về ký tự an toàn', () => {
  const item = realmTavernItem('emerald-seal');
  assert.equal(realmLoadoutSourceId(item, 'realm-equip:abc/../../123'), 'seal:emerald-seal:realm-equipabc123');
});
