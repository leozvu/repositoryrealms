export const REALM_GENERATED_ART_VERSION = 'phase-22-v2-characters';
export const REALM_GENERATED_ART_ROOT = '/realms/assets/generated/phase-22';
export const REALM_GENERATED_CHARACTER_ROOT = `${REALM_GENERATED_ART_ROOT}/characters-v2/directions-v2`;
export const REALM_GENERATED_CHARACTER_PORTRAIT_ROOT = `${REALM_GENERATED_ART_ROOT}/characters/directions`;
export const REALM_GENERATED_ERP_UI_ROOT = `${REALM_GENERATED_ART_ROOT}/erp-ui/elements-webp-v2`;
export const REALM_GENERATED_CHARACTER_COUNT = 6;
export const REALM_GENERATED_DIRECTIONS = Object.freeze(['down', 'left', 'right', 'up']);
export const REALM_GENERATED_ENVIRONMENT_MATERIALS = Object.freeze([
  'guild',
  'war',
  'treasury',
  'tavern',
  'hall',
  'forge',
  'wall',
  'threshold',
]);
export const REALM_GENERATED_PROP_BINDINGS = Object.freeze({
  'guild-roster': Object.freeze({ asset: '011', scale: 1.45 }),
  'war-table': Object.freeze({ asset: '004', scale: 2.05 }),
  'treasury-chest': Object.freeze({ asset: '018', scale: 1.5 }),
  'tavern-board': Object.freeze({ asset: '009', scale: 1.55 }),
  'quest-board': Object.freeze({ asset: '010', scale: 1.5 }),
  'arcane-forge': Object.freeze({ asset: '002', scale: 2.15 }),
  'realm-gate': Object.freeze({ asset: '015', scale: 1.45, proceduralUnderlay: true }),
});
export const REALM_MAP_STYLE_STORAGE_KEY = 'crmegoric-realm-map-style-v1';
export const REALM_MAP_STYLE_DEFAULT = 'royal-office';
export const REALM_MAP_STYLES = Object.freeze([
  Object.freeze({
    id: 'royal-office',
    label: 'Royal Office',
    description: 'Bàn làm việc, thư viện và phòng họp trang trọng.',
    materials: Object.freeze({}),
    decorations: Object.freeze([
      { key: 'royal-guild-desk', asset: '003', x: 4.2, y: 3.2, scale: 2.25 },
      { key: 'royal-guild-library', asset: '008', x: 15.6, y: 3.3, scale: 1.65 },
      { key: 'royal-guild-rug', asset: '025', x: 9, y: 8.3, scale: 4.2, floor: true },
      { key: 'royal-guild-files', asset: '013', x: 15.6, y: 13.4, scale: 1.55 },
      { key: 'royal-war-rug', asset: '025', x: 29, y: 8.3, scale: 4.7, floor: true },
      { key: 'royal-war-desk', asset: '005', x: 22.3, y: 3.3, scale: 2.1 },
      { key: 'royal-war-cabinet', asset: '013', x: 37.2, y: 3.4, scale: 1.55 },
      { key: 'royal-war-map', asset: '032', x: 36, y: 13.1, scale: 1.85 },
      { key: 'royal-treasury-desk', asset: '005', x: 43.2, y: 3.3, scale: 2.1 },
      { key: 'royal-treasury-files', asset: '013', x: 55.2, y: 3.4, scale: 1.45 },
      { key: 'royal-treasury-rug', asset: '025', x: 48.5, y: 8.4, scale: 4.1, floor: true },
      { key: 'royal-treasury-book', asset: '020', x: 54.4, y: 13.3, scale: 1.55 },
      { key: 'royal-tavern-desk', asset: '003', x: 4.1, y: 19.6, scale: 2.2 },
      { key: 'royal-tavern-library', asset: '008', x: 15.6, y: 19.8, scale: 1.65 },
      { key: 'royal-tavern-rug', asset: '025', x: 9, y: 26.4, scale: 4.3, floor: true },
      { key: 'royal-tavern-couch', asset: '024', x: 14.2, y: 32.5, scale: 2.25 },
      { key: 'royal-hall-desk', asset: '005', x: 22.1, y: 19.7, scale: 2.05 },
      { key: 'royal-hall-rug', asset: '025', x: 29, y: 26.4, scale: 4.8, floor: true },
      { key: 'royal-hall-book', asset: '020', x: 36.3, y: 32.4, scale: 1.55 },
      { key: 'royal-hall-cabinet', asset: '013', x: 21.2, y: 32.5, scale: 1.5 },
      { key: 'royal-forge-desk', asset: '003', x: 43.2, y: 19.7, scale: 2.15 },
      { key: 'royal-forge-divider', asset: '029', x: 55.1, y: 20, scale: 1.85 },
      { key: 'royal-forge-rug', asset: '025', x: 48.5, y: 26.5, scale: 4.2, floor: true },
      { key: 'royal-forge-map', asset: '032', x: 54.2, y: 32.2, scale: 1.85 },
    ]),
  }),
  Object.freeze({
    id: 'emerald-court',
    label: 'Emerald Court',
    description: 'Cây xanh, ghế nghỉ và đèn lồng cho một lâu đài thoáng hơn.',
    materials: Object.freeze({ war: 'hall', treasury: 'guild', tavern: 'guild', forge: 'hall' }),
    decorations: Object.freeze([
      { key: 'garden-guild-rug', asset: '025', x: 9, y: 8.3, scale: 4.4, floor: true },
      { key: 'garden-guild-tree', asset: '022', x: 15.5, y: 13.2, scale: 1.75 },
      { key: 'garden-guild-plant', asset: '023', x: 2.4, y: 13.4, scale: 1.35 },
      { key: 'garden-guild-bench', asset: '027', x: 9.2, y: 13.3, scale: 2.05 },
      { key: 'garden-war-rug', asset: '025', x: 29, y: 8.3, scale: 4.8, floor: true },
      { key: 'garden-war-bench', asset: '027', x: 22.5, y: 13.2, scale: 2.0 },
      { key: 'garden-war-tree', asset: '022', x: 37.2, y: 13.15, scale: 1.65 },
      { key: 'garden-war-lantern', asset: '015', x: 21.3, y: 3.1, scale: 1.5 },
      { key: 'garden-treasury-rug', asset: '025', x: 48.5, y: 8.3, scale: 4.2, floor: true },
      { key: 'garden-treasury-plant', asset: '023', x: 42.1, y: 13.3, scale: 1.35 },
      { key: 'garden-treasury-lantern', asset: '015', x: 55.1, y: 13.15, scale: 1.5 },
      { key: 'garden-treasury-tree', asset: '022', x: 54.8, y: 3.4, scale: 1.65 },
      { key: 'garden-tavern-rug', asset: '025', x: 9, y: 26.4, scale: 4.4, floor: true },
      { key: 'garden-tavern-tree', asset: '022', x: 15.3, y: 32.4, scale: 1.75 },
      { key: 'garden-tavern-bench', asset: '027', x: 4.4, y: 32.3, scale: 2.0 },
      { key: 'garden-tavern-plant', asset: '023', x: 2.4, y: 19.5, scale: 1.35 },
      { key: 'garden-hall-rug', asset: '025', x: 29, y: 26.4, scale: 4.9, floor: true },
      { key: 'garden-hall-plants', asset: '023', x: 36.4, y: 32.3, scale: 1.35 },
      { key: 'garden-hall-bench', asset: '027', x: 22.2, y: 32.3, scale: 2.05 },
      { key: 'garden-hall-tree', asset: '022', x: 37.1, y: 19.5, scale: 1.7 },
      { key: 'garden-forge-rug', asset: '025', x: 48.5, y: 26.5, scale: 4.3, floor: true },
      { key: 'garden-forge-divider', asset: '029', x: 55.1, y: 32, scale: 1.85 },
      { key: 'garden-forge-plant', asset: '023', x: 42.1, y: 32.4, scale: 1.35 },
      { key: 'garden-forge-lantern', asset: '015', x: 54.8, y: 19.5, scale: 1.5 },
    ]),
  }),
  Object.freeze({
    id: 'lantern-festival',
    label: 'Lantern Festival',
    description: 'Bàn tiệc, nến và đèn lồng cho những ngày hội của Guild.',
    materials: Object.freeze({ guild: 'tavern', war: 'treasury', hall: 'tavern', forge: 'treasury' }),
    decorations: Object.freeze([
      { key: 'festival-guild-rug', asset: '025', x: 9, y: 8.3, scale: 4.4, floor: true },
      { key: 'festival-guild-table', asset: '026', x: 4.2, y: 12.8, scale: 2.1 },
      { key: 'festival-guild-lantern', asset: '017', x: 15.4, y: 3.1, scale: 1.35 },
      { key: 'festival-guild-candles', asset: '021', x: 15.2, y: 13.2, scale: 1.2 },
      { key: 'festival-war-rug', asset: '025', x: 29, y: 8.3, scale: 4.8, floor: true },
      { key: 'festival-war-candles', asset: '021', x: 21.3, y: 13.2, scale: 1.2 },
      { key: 'festival-war-table', asset: '026', x: 36.3, y: 12.8, scale: 2.1 },
      { key: 'festival-war-lantern', asset: '017', x: 37.1, y: 3.1, scale: 1.35 },
      { key: 'festival-treasury-rug', asset: '025', x: 48.5, y: 8.3, scale: 4.3, floor: true },
      { key: 'festival-treasury-lantern', asset: '017', x: 55.1, y: 3.1, scale: 1.35 },
      { key: 'festival-treasury-candles', asset: '021', x: 42.2, y: 13.15, scale: 1.2 },
      { key: 'festival-treasury-table', asset: '026', x: 54.1, y: 12.8, scale: 2.1 },
      { key: 'festival-tavern-rug', asset: '025', x: 9, y: 26.4, scale: 4.5, floor: true },
      { key: 'festival-tavern-barrels', asset: '031', x: 2.6, y: 32.5, scale: 1.65 },
      { key: 'festival-tavern-table', asset: '026', x: 14.4, y: 32.1, scale: 2.1 },
      { key: 'festival-tavern-cart', asset: '033', x: 4.2, y: 19.8, scale: 1.75 },
      { key: 'festival-hall-rug', asset: '025', x: 29, y: 26.4, scale: 4.9, floor: true },
      { key: 'festival-hall-lantern', asset: '017', x: 36.5, y: 32.2, scale: 1.35 },
      { key: 'festival-hall-table', asset: '026', x: 22.4, y: 32, scale: 2.1 },
      { key: 'festival-hall-candles', asset: '021', x: 36.7, y: 19.6, scale: 1.2 },
      { key: 'festival-forge-rug', asset: '025', x: 48.5, y: 26.5, scale: 4.4, floor: true },
      { key: 'festival-forge-table', asset: '026', x: 54.2, y: 32.1, scale: 2.05 },
      { key: 'festival-forge-barrels', asset: '031', x: 42.1, y: 32.5, scale: 1.65 },
      { key: 'festival-forge-cart', asset: '033', x: 54.2, y: 19.8, scale: 1.75 },
    ]),
  }),
]);
export const REALM_GENERATED_UI_BINDINGS = Object.freeze({
  inspector: Object.freeze({ asset: '001' }),
  'quest-card': Object.freeze({ asset: '004' }),
  dialog: Object.freeze({ asset: '005' }),
  'profile-ring': Object.freeze({ asset: '006' }),
  'notice-corner-tl': Object.freeze({ asset: '008' }),
  'notice-corner-tr': Object.freeze({ asset: '009' }),
  'interact-prompt': Object.freeze({ asset: '010' }),
  'panel-divider': Object.freeze({ asset: '011' }),
  'notice-corner-bl': Object.freeze({ asset: '012' }),
  'notice-corner-br': Object.freeze({ asset: '013' }),
  'tavern-nameplate': Object.freeze({ asset: '015' }),
});
export const REALM_GENERATED_ERP_UI_BINDINGS = Object.freeze({
  'header-crest': Object.freeze({ asset: 'header-crest' }),
  'title-plaque': Object.freeze({ asset: 'title-plaque' }),
  'manuscript-divider': Object.freeze({ asset: 'manuscript-divider' }),
  'table-finials': Object.freeze({ asset: 'table-finials' }),
  'card-corners': Object.freeze({ asset: 'card-corners' }),
  'kpi-medallion': Object.freeze({ asset: 'kpi-medallion' }),
  'approval-seal': Object.freeze({ asset: 'approval-seal' }),
  'quest-ribbon': Object.freeze({ asset: 'quest-ribbon' }),
  'tab-endcaps': Object.freeze({ asset: 'tab-endcaps' }),
  'ledger-flourish': Object.freeze({ asset: 'ledger-flourish' }),
  'status-ornaments': Object.freeze({ asset: 'status-ornaments' }),
  'footer-flourish': Object.freeze({ asset: 'footer-flourish' }),
});

function realmGeneratedLayerEnabled(value) {
  if (value === undefined || value === null || value === '') return true;
  return value === '1' || value === 'true';
}

export function realmGeneratedArtEnabled(value = process.env.NEXT_PUBLIC_REALM_GENERATED_ART) {
  return realmGeneratedLayerEnabled(value);
}

export function realmGeneratedEnvironmentEnabled(
  value = process.env.NEXT_PUBLIC_REALM_ENVIRONMENT_ART,
) {
  return realmGeneratedLayerEnabled(value);
}

export function realmGeneratedPropEnabled(value = process.env.NEXT_PUBLIC_REALM_PROP_ART) {
  return realmGeneratedLayerEnabled(value);
}

export function realmGeneratedUiEnabled(value = process.env.NEXT_PUBLIC_REALM_UI_ART) {
  return realmGeneratedLayerEnabled(value);
}

export function realmGeneratedEnvironmentUrl(material) {
  const normalized = REALM_GENERATED_ENVIRONMENT_MATERIALS.includes(material)
    ? material
    : 'threshold';
  return `${REALM_GENERATED_ART_ROOT}/maps/materials-webp/material-${normalized}.webp`;
}

export function realmGeneratedEnvironmentAssets() {
  return REALM_GENERATED_ENVIRONMENT_MATERIALS.map((material) => ({
    key: material,
    material,
    url: realmGeneratedEnvironmentUrl(material),
  }));
}

export function realmGeneratedPropUrl(asset) {
  const id = String(asset || '').padStart(3, '0');
  return `${REALM_GENERATED_ART_ROOT}/props/items-webp/prop-${id}.webp`;
}

export function realmGeneratedPropBinding(objectId) {
  const binding = REALM_GENERATED_PROP_BINDINGS[objectId];
  if (!binding) return null;
  return {
    ...binding,
    key: objectId,
    objectId,
    url: realmGeneratedPropUrl(binding.asset),
  };
}

export function realmGeneratedPropAssets() {
  return Object.keys(REALM_GENERATED_PROP_BINDINGS).map(realmGeneratedPropBinding);
}

export function normalizeRealmMapStyle(value) {
  return REALM_MAP_STYLES.some((style) => style.id === value) ? value : REALM_MAP_STYLE_DEFAULT;
}

export function realmMapStyle(value) {
  const normalized = normalizeRealmMapStyle(value);
  return REALM_MAP_STYLES.find((style) => style.id === normalized) || REALM_MAP_STYLES[0];
}

export function realmGeneratedDecorAssets() {
  const assets = new Set();
  for (const style of REALM_MAP_STYLES) {
    for (const decoration of style.decorations) assets.add(decoration.asset);
  }
  return [...assets].map((asset) => ({
    key: `decor:${asset}`,
    asset,
    url: realmGeneratedPropUrl(asset),
  }));
}

export function realmGeneratedUiUrl(asset) {
  const id = String(asset || '').padStart(3, '0');
  return `${REALM_GENERATED_ART_ROOT}/ui/frames-webp/frame-${id}.webp`;
}

export function realmGeneratedUiBinding(surface) {
  const binding = REALM_GENERATED_UI_BINDINGS[surface];
  if (!binding) return null;
  return {
    ...binding,
    key: surface,
    surface,
    url: realmGeneratedUiUrl(binding.asset),
  };
}

export function realmGeneratedUiAssets() {
  return Object.keys(REALM_GENERATED_UI_BINDINGS).map(realmGeneratedUiBinding);
}

export function realmGeneratedErpUiUrl(asset) {
  const normalized = REALM_GENERATED_ERP_UI_BINDINGS[asset]?.asset || 'manuscript-divider';
  return `${REALM_GENERATED_ERP_UI_ROOT}/erp-ui-${normalized}.webp`;
}

export function realmGeneratedErpUiBinding(surface) {
  const binding = REALM_GENERATED_ERP_UI_BINDINGS[surface];
  if (!binding) return null;
  return {
    ...binding,
    key: `erp-ui:${surface}`,
    surface,
    url: realmGeneratedErpUiUrl(surface),
  };
}

export function realmGeneratedErpUiAssets() {
  return Object.keys(REALM_GENERATED_ERP_UI_BINDINGS).map(realmGeneratedErpUiBinding);
}

export function normalizeRealmArtDirection(direction) {
  return REALM_GENERATED_DIRECTIONS.includes(direction) ? direction : 'down';
}

export function realmArtDirectionFromDelta(dx, dy, fallback = 'down') {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) {
    return normalizeRealmArtDirection(fallback);
  }
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

function stableRealmIdentityHash(identity) {
  const text = String(identity || 'realm-adventurer');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function realmGeneratedCharacterSlot(identity) {
  return stableRealmIdentityHash(identity) % REALM_GENERATED_CHARACTER_COUNT + 1;
}

export function realmGeneratedCharacterUrl(identity, direction = 'down') {
  const slot = String(realmGeneratedCharacterSlot(identity)).padStart(2, '0');
  const facing = normalizeRealmArtDirection(direction);
  return `${REALM_GENERATED_CHARACTER_ROOT}/character-${slot}-${facing}.png`;
}

export function realmGeneratedCharacterPortraitUrl(identity) {
  const slot = String(realmGeneratedCharacterSlot(identity)).padStart(2, '0');
  return `${REALM_GENERATED_CHARACTER_PORTRAIT_ROOT}/character-${slot}-down.png`;
}

export function realmGeneratedCharacterAssets() {
  const assets = [];
  for (let slot = 1; slot <= REALM_GENERATED_CHARACTER_COUNT; slot += 1) {
    const id = String(slot).padStart(2, '0');
    for (const direction of REALM_GENERATED_DIRECTIONS) {
      assets.push({
        key: `${id}:${direction}`,
        slot,
        direction,
        url: `${REALM_GENERATED_CHARACTER_ROOT}/character-${id}-${direction}.png`,
      });
    }
  }
  return assets;
}

export function realmGeneratedCharacterKey(identity, direction = 'down') {
  const slot = String(realmGeneratedCharacterSlot(identity)).padStart(2, '0');
  return `${slot}:${normalizeRealmArtDirection(direction)}`;
}
