'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, ToastProvider, useToast } from '@/components/ui';
import {
  DEFAULT_WORLD_POSITION,
  INITIAL_LEDGER,
  PRIVATE_ZONES,
  QUESTS,
  ROOMS,
  SHOP_ITEMS,
  STAFF,
  WALLS,
  WORLD,
  WORLD_OBJECTS,
  distance,
  isWorldPositionWalkable,
  normalizeWorldPosition,
  privateZoneAt,
  roomAt,
} from './world';
import { createRealmDemoGuestProfile, DEFAULT_PROFILE, isInVoiceRange, mergeRealmPresencePeople, normalizeProfile } from '@/lib/realm-protocol';
import {
  REALM_OPERATIONS_STORAGE_KEY,
  advanceRealmQuest,
  claimRealmQuest,
  createRealmOperations,
  normalizeRealmOperations,
  spendRealmGold,
  summarizeRealmCareer,
} from '@/lib/realm-operations';
import { createRealmRewardDemoDashboard } from '@/lib/realm-rewards';
import {
  REALM_TREASURY_STORAGE_KEY,
  createRealmTreasuryDemoDashboard,
  restoreRealmTreasuryDemoDashboard,
  serializeRealmTreasuryDemoState,
} from '@/lib/realm-treasury';
import { createRealmGuildDemoDashboard } from '@/lib/realm-guild';
import { createRealmWarRoomDemoDashboard } from '@/lib/realm-war-room';
import { createRealmEmbassyDemoDashboard } from '@/lib/realm-embassy';
import { createRealmCommandCenterDemoDashboard } from '@/lib/realm-command-center';
import { createRealmChronicleDemoDashboard } from '@/lib/realm-chronicle';
import { normalizeRealmText, realmEmote, REALM_EMOTES } from '@/lib/realm-social';
import { REALM_CORE_PORTALS, createRealmErpBridge, realmRecordHref } from '@/lib/realm-business-bridge';
import { realmAccessForPanel, realmAccessForSurface } from '@/lib/realm-access';
import { realmDataSourceMode, realmInitialMessages, realmInitialOperations, realmLocalFixture } from '@/lib/realm-data-source';
import {
  realmArtDirectionFromDelta,
  realmGeneratedArtEnabled,
  realmGeneratedCharacterAssets,
  realmGeneratedCharacterKey,
  realmGeneratedCharacterPortraitUrl,
  realmGeneratedDecorAssets,
  realmGeneratedEnvironmentAssets,
  realmGeneratedEnvironmentEnabled,
  realmGeneratedErpUiAssets,
  realmGeneratedPropAssets,
  realmGeneratedPropBinding,
  realmGeneratedPropEnabled,
  realmGeneratedUiAssets,
  realmGeneratedUiEnabled,
  realmMapStyle,
  normalizeRealmMapStyle,
  REALM_MAP_STYLES,
  REALM_MAP_STYLE_DEFAULT,
  REALM_MAP_STYLE_STORAGE_KEY,
} from '@/lib/realm-generated-art';
import RewardControlCenter from './RewardControlCenter';
import GoldEconomyObservatory from './GoldEconomyObservatory';
import RoyalTreasuryExchange from './RoyalTreasuryExchange';
import GuildHall from './GuildHall';
import WarRoom from './WarRoom';
import RoyalEmbassy from './RoyalEmbassy';
import RoyalCommandCenter from './RoyalCommandCenter';
import AdventurerChronicle from './AdventurerChronicle';
import { useProximityMedia } from './useProximityMedia';
import { usePartySfuMedia } from './usePartySfuMedia';
import { useRealmParty } from './useRealmParty';
import { useRealmPresence } from './useRealmPresence';
import { useRealmChangeFeed } from './useRealmChangeFeed';
import RealmNotificationBell from './RealmNotificationBell';
import { useCollaborationDirectory } from '@/components/collaboration/useCollaborationDirectory';
import { LanguageSwitch } from '@/components/LanguageProvider';
import {
  preferredCollaborationAvailability,
  persistWorkspaceSurface,
  rememberCollaborationAvailability,
} from '@/lib/collaboration';
import {
  REALM_EXPERIENCE_STORAGE_KEY,
  normalizeRealmExperienceContext,
  parseRealmExperienceContext,
  realmJourneyForContext,
} from '@/lib/realm-experience';
import styles from './realm-office.module.css';

const PROFILE_STORAGE_KEY = 'crmegoric-realms-profile-v1';
const GUEST_ID_STORAGE_KEY = 'crmegoric-realms-guest-id-v1';
const PROFILE_ROLES = ['Realm Builder', 'Questsmith', 'Guild Master', 'Alchemist', 'Scout'];
const ERP_SYNC_REQUESTED = process.env.NEXT_PUBLIC_REALM_ERP_SYNC === '1';
const GENERATED_ART_REQUESTED = realmGeneratedArtEnabled();
const ENVIRONMENT_ART_REQUESTED = realmGeneratedEnvironmentEnabled();
const PROP_ART_REQUESTED = realmGeneratedPropEnabled();
const UI_ART_REQUESTED = realmGeneratedUiEnabled();
const GENERATED_UI_ART_ASSETS = Object.freeze([
  ...realmGeneratedUiAssets(),
  ...realmGeneratedErpUiAssets(),
]);
const GENERATED_UI_ART_STYLE = Object.freeze(Object.fromEntries([
  ...realmGeneratedUiAssets().map((asset) => [
    `--realm-ui-${asset.surface}`,
    `url("${asset.url}")`,
  ]),
  ...realmGeneratedErpUiAssets().map((asset) => [
    `--realm-erp-ui-${asset.surface}`,
    `url("${asset.url}")`,
  ]),
]));
const REALM_REMOTE_REFRESH_MS = 60_000;
const EMPTY_SYNC_META = {
  revision: null,
  profileVersion: null,
  serverGeneratedAt: null,
  lastSyncedAt: null,
  lastCheckedAt: null,
  requestId: null,
  latencyMs: null,
  outcome: null,
  error: null,
};

function sendRealmExperienceSignal(enabled, event, surface = 'realm', journey = null) {
  if (!enabled || typeof window === 'undefined') return;
  window.fetch('/api/realm-demo/experience', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, surface, journey }),
    keepalive: true,
  }).catch(() => null);
}

function realmTraceFromResponse(response, payload = {}) {
  const requestId = response?.headers?.get('X-Realm-Request-Id') || payload?.requestId || null;
  const durationHeader = response?.headers?.get('X-Realm-Duration-Ms');
  const duration = durationHeader === null ? null : Number(durationHeader);
  return {
    requestId,
    latencyMs: Number.isFinite(duration) ? duration : null,
    outcome: response?.headers?.get('X-Realm-Outcome') || null,
  };
}
const TRANSPORT = {
  'gateway-ready': { label: 'Gateway đa máy · token xác thực', short: 'Gateway online' },
  'gateway-connecting': { label: 'Đang xác thực gateway…', short: 'Đang kết nối' },
  'gateway-reconnecting': { label: 'Mất kết nối · đang tự thử lại', short: 'Đang reconnect' },
  'gateway-degraded': { label: 'Gateway mất · đang chuyển local fallback', short: 'Đang fallback' },
  'local-ready': { label: 'P2P demo · signaling nội bộ', short: 'Local fallback' },
  unsupported: { label: 'Trình duyệt không hỗ trợ signaling', short: 'Solo mode' },
  connecting: { label: 'Đang chuẩn bị kênh signaling…', short: 'Đang kết nối' },
};

const STATUS = {
  available: { label: 'Sẵn sàng', color: '#64c48d' },
  busy: { label: 'Đang bận', color: '#e7ad58' },
  focus: { label: 'Tập trung', color: '#9a83e6' },
  dnd: { label: 'Không làm phiền', color: '#dc6b72' },
};

const NAV = [
  { id: 'briefing', label: 'Đại sảnh', icon: 'dashboard' },
  { id: 'quests', label: 'Quest Board', icon: 'tasks' },
  { id: 'command', label: 'Royal Command', icon: 'shield' },
  { id: 'campaigns', label: 'Chiến dịch', icon: 'projects' },
  { id: 'guild', label: 'Guild', icon: 'staff' },
  { id: 'treasury', label: 'Royal Treasury', icon: 'wallet' },
  { id: 'shop', label: 'Arcane Forge', icon: 'settings' },
  { id: 'chat', label: 'Lantern Chat', icon: 'meeting' },
  { id: 'party', label: 'Party Voice', icon: 'phone' },
];

const CAMPAIGNS = [
  { id: 'campaign-1', name: 'Campaign Rồng Xanh', owner: 'Nguyễn Minh An', progress: 78, health: 'Ổn định', color: '#64c48d' },
  { id: 'campaign-2', name: 'Website Nhà Giả Kim', owner: 'Đỗ Quốc Anh', progress: 46, health: 'Cần chú ý', color: '#e7ad58' },
  { id: 'campaign-3', name: 'Hội chợ phương Bắc', owner: 'Trần Khánh Linh', progress: 63, health: 'Ổn định', color: '#64c48d' },
];

const ERP_DESK_POSITIONS = [
  ...STAFF.map(({ x, y }) => ({ x, y })),
  { x: 5, y: 4 }, { x: 15, y: 4 }, { x: 23, y: 12 }, { x: 37, y: 12 },
  { x: 44, y: 4 }, { x: 54, y: 4 }, { x: 5, y: 32 }, { x: 15, y: 32 },
  { x: 23, y: 29 }, { x: 36, y: 29 }, { x: 43, y: 32 }, { x: 54, y: 32 },
];
const ERP_AVATAR_COLORS = ['#4f9f73', '#b7686b', '#6e8ec7', '#946fc7', '#c58a4c', '#4c8f91', '#8b6d53'];

function collaborationPeopleForRealm(people = []) {
  return people.map((person, index) => ({
    ...person,
    id: person.userId || person.id,
    userId: person.userId || person.id,
    role: person.role || 'Guild Member',
    status: person.online ? person.availability : 'away',
    statusText: person.online
      ? `Online tại ${person.surfaces?.includes('realm') ? 'Realm' : 'ERP'}`
      : 'Không online lúc này · vẫn nhận Lantern Mail',
    color: ERP_AVATAR_COLORS[index % ERP_AVATAR_COLORS.length],
    ...ERP_DESK_POSITIONS[index % ERP_DESK_POSITIONS.length],
    isErpDirectory: true,
    isRemote: false,
  }));
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const initials = (name) => name.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase();

function loadRealmImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`realm_generated_art_unavailable:${url}`));
    image.src = url;
  });
}

function canStand(x, y) {
  return isWorldPositionWalkable({ x, y });
}

function generatedMaterialPattern(ctx, image, tile, material, cache) {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null;
  const key = `${material}:${tile}`;
  if (cache.has(key)) return cache.get(key);
  const pattern = ctx.createPattern(image, 'repeat');
  if (!pattern) return null;
  if (typeof pattern.setTransform === 'function' && typeof DOMMatrix !== 'undefined') {
    const scale = tile * 9 / image.naturalWidth;
    pattern.setTransform(new DOMMatrix().scale(scale));
  }
  cache.set(key, pattern);
  return pattern;
}

function drawFloor(ctx, x, y, tile, room, materials, patternCache, materialOverride = null) {
  const px = x * tile;
  const py = y * tile;
  const material = materialOverride || room?.id || 'threshold';
  const pattern = generatedMaterialPattern(ctx, materials.get(material), tile, material, patternCache);
  ctx.fillStyle = pattern || room?.floor || '#26362f';
  ctx.fillRect(px, py, tile, tile);
  if (pattern) {
    ctx.fillStyle = 'rgba(4, 11, 8, .12)';
    ctx.fillRect(px, py, tile, tile);
  }
  ctx.strokeStyle = pattern ? 'rgba(245, 222, 154, .035)' : 'rgba(245, 222, 154, .055)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if ((x + y) % 2 === 0) {
    ctx.moveTo(px + 4, py + tile - 3);
    ctx.lineTo(px + tile - 4, py + 3);
  } else {
    ctx.moveTo(px + 4, py + 3);
    ctx.lineTo(px + tile - 4, py + tile - 3);
  }
  ctx.stroke();
  if (!pattern && (x * 7 + y * 11) % 13 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,.035)';
    ctx.fillRect(px + 6, py + 7, 2, 2);
  }
}

function drawWall(ctx, x, y, tile, materials, patternCache) {
  const px = x * tile;
  const py = y * tile;
  const pattern = generatedMaterialPattern(ctx, materials.get('wall'), tile, 'wall', patternCache);
  ctx.fillStyle = '#182720';
  ctx.fillRect(px, py, tile, tile);
  ctx.fillStyle = pattern || ((x + y) % 2 === 0 ? '#405147' : '#35483e');
  ctx.fillRect(px + 2, py + 2, tile - 4, tile - 5);
  ctx.fillStyle = pattern ? 'rgba(201, 191, 153, .18)' : '#53665a';
  ctx.fillRect(px + 3, py + 3, tile - 6, Math.max(3, tile * 0.12));
  ctx.strokeStyle = '#22352c';
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, tile - 2, tile - 2);
  ctx.beginPath();
  ctx.moveTo(px + tile / 2, py + 2);
  ctx.lineTo(px + tile / 2, py + tile - 3);
  ctx.stroke();
}

function drawRoomDecor(ctx, tile) {
  for (const zone of PRIVATE_ZONES) {
    ctx.fillStyle = 'rgba(219, 183, 92, .10)';
    ctx.fillRect(zone.x * tile, zone.y * tile, zone.w * tile, zone.h * tile);
    ctx.strokeStyle = 'rgba(232, 195, 102, .35)';
    ctx.setLineDash([Math.max(4, tile * 0.22), Math.max(3, tile * 0.15)]);
    ctx.strokeRect(zone.x * tile, zone.y * tile, zone.w * tile, zone.h * tile);
    ctx.setLineDash([]);
  }

  for (const room of ROOMS) {
    ctx.fillStyle = 'rgba(5, 12, 9, .46)';
    const width = Math.min(room.name.length * tile * 0.33 + 24, room.w * tile - 20);
    ctx.fillRect((room.x + 0.5) * tile, (room.y + 0.5) * tile, width, tile * 0.72);
    ctx.fillStyle = '#ead79a';
    ctx.font = `700 ${Math.max(9, tile * 0.31)}px ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(room.name.toUpperCase(), (room.x + 0.78) * tile, (room.y + 0.86) * tile);
  }

  const torchSpots = [
    [2.2, 16.5], [15.8, 16.5], [20.2, 16.5], [37.8, 16.5], [41.2, 16.5], [55.8, 16.5],
    [18.5, 2.3], [18.5, 14.5], [18.5, 18.5], [18.5, 33.4],
    [39.5, 2.3], [39.5, 14.5], [39.5, 18.5], [39.5, 33.4],
  ];
  for (const [x, y] of torchSpots) {
    const gradient = ctx.createRadialGradient(x * tile, y * tile, 0, x * tile, y * tile, tile * 2.2);
    gradient.addColorStop(0, 'rgba(255, 190, 77, .28)');
    gradient.addColorStop(1, 'rgba(255, 190, 77, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect((x - 2.2) * tile, (y - 2.2) * tile, tile * 4.4, tile * 4.4);
    ctx.fillStyle = '#f1b84d';
    ctx.fillRect(x * tile - 3, y * tile - 7, 6, 10);
    ctx.fillStyle = '#ffdf82';
    ctx.fillRect(x * tile - 1, y * tile - 9, 3, 5);
  }
}

function drawProceduralObject(ctx, object, tile, pulse) {
  if (object.kind === 'board' || object.kind === 'roster' || object.kind === 'tavern') {
    ctx.fillStyle = '#3a271d';
    ctx.fillRect(-tile * 0.48, -tile * 0.48, tile * 0.96, tile * 0.84);
    ctx.fillStyle = object.kind === 'board' ? '#dfc17d' : '#b98e56';
    ctx.fillRect(-tile * 0.38, -tile * 0.39, tile * 0.76, tile * 0.58);
    ctx.fillStyle = '#5a3a25';
    ctx.fillRect(-tile * 0.27, -tile * 0.24, tile * 0.38, 2);
    ctx.fillRect(-tile * 0.2, -tile * 0.1, tile * 0.43, 2);
    ctx.fillStyle = '#6c4528';
    ctx.fillRect(-tile * 0.37, tile * 0.36, tile * 0.12, tile * 0.42);
    ctx.fillRect(tile * 0.25, tile * 0.36, tile * 0.12, tile * 0.42);
  } else if (object.kind === 'table') {
    ctx.fillStyle = '#573b27';
    ctx.fillRect(-tile * 0.8, -tile * 0.43, tile * 1.6, tile * 0.86);
    ctx.fillStyle = '#8a6540';
    ctx.fillRect(-tile * 0.72, -tile * 0.34, tile * 1.44, tile * 0.54);
    ctx.fillStyle = '#c7b06f';
    ctx.fillRect(-tile * 0.25, -tile * 0.25, tile * 0.5, tile * 0.36);
    ctx.strokeStyle = '#7f5b38';
    ctx.strokeRect(-tile * 0.25, -tile * 0.25, tile * 0.5, tile * 0.36);
  } else if (object.kind === 'chest') {
    ctx.fillStyle = '#5b361e';
    ctx.fillRect(-tile * 0.58, -tile * 0.34, tile * 1.16, tile * 0.72);
    ctx.fillStyle = '#9b6a2f';
    ctx.fillRect(-tile * 0.58, -tile * 0.38, tile * 1.16, tile * 0.25);
    ctx.fillStyle = '#e7b94d';
    ctx.fillRect(-tile * 0.09, -tile * 0.08, tile * 0.18, tile * 0.28);
  } else if (object.kind === 'forge') {
    ctx.fillStyle = '#2a2729';
    ctx.fillRect(-tile * 0.55, -tile * 0.5, tile * 1.1, tile);
    ctx.fillStyle = '#aa4a35';
    ctx.fillRect(-tile * 0.34, -tile * 0.24, tile * 0.68, tile * 0.48);
    ctx.fillStyle = '#f1b84d';
    ctx.fillRect(-tile * 0.17, -tile * 0.12, tile * 0.34, tile * 0.28);
    ctx.fillStyle = '#6f7d78';
    ctx.fillRect(-tile * 0.74, tile * 0.25, tile * 0.55, tile * 0.18);
  } else if (object.kind === 'portal') {
    ctx.strokeStyle = '#5e9279';
    ctx.lineWidth = Math.max(3, tile * 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, tile * 0.48, Math.PI, 0);
    ctx.lineTo(tile * 0.48, tile * 0.48);
    ctx.moveTo(-tile * 0.48, 0);
    ctx.lineTo(-tile * 0.48, tile * 0.48);
    ctx.stroke();
    ctx.fillStyle = `rgba(104, 190, 169, ${0.18 + pulse * 0.2})`;
    ctx.fillRect(-tile * 0.34, -tile * 0.02, tile * 0.68, tile * 0.5);
  }
}

function drawObject(ctx, object, tile, interaction, time, sprite = null, binding = null) {
  const x = object.x * tile;
  const y = object.y * tile;
  const pulse = 0.5 + Math.sin(time / 420) * 0.18;
  const extent = Math.max(0.78, (binding?.scale || 1.35) * 0.53);
  const left = x - tile * extent;
  const top = y - tile * extent;
  const size = tile * extent * 2;

  if (interaction.hovered) {
    ctx.strokeStyle = 'rgba(126, 205, 177, .82)';
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, size, size);
  }
  if (interaction.nearby) {
    ctx.strokeStyle = `rgba(245, 196, 76, ${pulse})`;
    ctx.lineWidth = interaction.active ? 4 : 3;
    const corner = tile * 0.32;
    for (const [startX, startY, directionX, directionY] of [
      [left, top, 1, 1],
      [left + size, top, -1, 1],
      [left, top + size, 1, -1],
      [left + size, top + size, -1, -1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(startX + directionX * corner, startY);
      ctx.lineTo(startX, startY);
      ctx.lineTo(startX, startY + directionY * corner);
      ctx.stroke();
    }
  }
  if (interaction.active) {
    ctx.fillStyle = `rgba(245, 196, 76, ${0.08 + pulse * 0.06})`;
    ctx.fillRect(left, top, size, size);
    ctx.fillStyle = '#f1ca62';
    ctx.beginPath();
    ctx.moveTo(x, top - tile * 0.2);
    ctx.lineTo(x + tile * 0.12, top - tile * 0.08);
    ctx.lineTo(x, top + tile * 0.04);
    ctx.lineTo(x - tile * 0.12, top - tile * 0.08);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(x, y);
  const spriteReady = Boolean(sprite?.complete && sprite.naturalWidth && sprite.naturalHeight);
  if (binding?.proceduralUnderlay && spriteReady) drawProceduralObject(ctx, object, tile, pulse);
  if (spriteReady) {
    const maxSize = tile * binding.scale;
    const aspect = sprite.naturalWidth / sprite.naturalHeight;
    const width = aspect >= 1 ? maxSize : maxSize * aspect;
    const height = aspect >= 1 ? maxSize / aspect : maxSize;
    ctx.fillStyle = 'rgba(3, 8, 6, .30)';
    ctx.beginPath();
    ctx.ellipse(0, height * 0.34, width * 0.32, Math.max(3, height * 0.11), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
  } else {
    drawProceduralObject(ctx, object, tile, pulse);
  }
  ctx.restore();
}

function drawDecoration(ctx, decoration, tile, sprite = null) {
  const spriteReady = Boolean(sprite?.complete && sprite.naturalWidth && sprite.naturalHeight);
  if (!spriteReady) return;
  const x = decoration.x * tile;
  const y = decoration.y * tile;
  const maxSize = tile * decoration.scale;
  const aspect = sprite.naturalWidth / sprite.naturalHeight;
  const width = aspect >= 1 ? maxSize : maxSize * aspect;
  const height = aspect >= 1 ? maxSize / aspect : maxSize;
  const centered = decoration.floor || aspect >= 1;
  const top = centered ? y - height / 2 : y - height * .82;

  ctx.save();
  ctx.globalAlpha = decoration.opacity || .9;
  if (!decoration.floor) {
    ctx.fillStyle = 'rgba(3, 8, 6, .24)';
    ctx.beginPath();
    ctx.ellipse(x, y, width * .3, Math.max(2, height * .08), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sprite, x - width / 2, top, width, height);
  ctx.restore();
}

function drawAvatar(ctx, person, tile, isPlayer = false, time = 0, emote, sprite = null) {
  const bob = Math.sin(time / 330 + person.x) * tile * 0.025;
  const x = person.x * tile;
  const y = person.y * tile + bob;
  const color = person.color || '#4f9f73';
  const spriteReady = Boolean(sprite?.complete && sprite.naturalWidth && sprite.naturalHeight);
  const spriteHeight = spriteReady ? tile * 2.3 : tile * 0.9;
  const spriteWidth = spriteReady
    ? Math.min(tile * 1.45, spriteHeight * (sprite.naturalWidth / sprite.naturalHeight))
    : tile * 0.54;
  const spriteFeetY = y + tile * 0.44;
  const spriteTop = spriteFeetY - spriteHeight;

  ctx.fillStyle = 'rgba(3, 8, 6, .38)';
  ctx.beginPath();
  ctx.ellipse(x, spriteFeetY, tile * 0.44, tile * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  if (spriteReady) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sprite, x - spriteWidth / 2, spriteTop, spriteWidth, spriteHeight);
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(x - tile * 0.27, y - tile * 0.02, tile * 0.54, tile * 0.5);
    ctx.fillStyle = isPlayer ? '#e4c56f' : '#d5a985';
    ctx.fillRect(x - tile * 0.22, y - tile * 0.4, tile * 0.44, tile * 0.38);
    ctx.fillStyle = isPlayer ? '#4c3022' : '#31261f';
    ctx.fillRect(x - tile * 0.22, y - tile * 0.45, tile * 0.44, tile * 0.13);
    ctx.fillRect(x - tile * 0.26, y - tile * 0.34, tile * 0.08, tile * 0.22);
    ctx.fillRect(x + tile * 0.18, y - tile * 0.34, tile * 0.08, tile * 0.22);
    ctx.fillStyle = '#1d2722';
    ctx.fillRect(x - tile * 0.12, y - tile * 0.23, 2, 2);
    ctx.fillRect(x + tile * 0.09, y - tile * 0.23, 2, 2);
  }

  if (isPlayer) {
    ctx.fillStyle = 'rgba(240, 201, 93, .13)';
    ctx.beginPath();
    ctx.ellipse(x, spriteFeetY, tile * 0.58, tile * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f0c95d';
    ctx.lineWidth = Math.max(2, tile * 0.07);
    ctx.beginPath();
    ctx.ellipse(x, spriteFeetY, tile * 0.58, tile * 0.24, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const name = person.name || 'Adventurer';
  const nameY = spriteReady ? spriteTop - tile * 0.18 : y - tile * 0.68;
  const nameHeight = Math.max(14, tile * 0.34);
  ctx.font = `800 ${Math.max(10, tile * 0.31)}px "Be Vietnam Pro", sans-serif`;
  const textWidth = ctx.measureText(name).width;
  ctx.fillStyle = 'rgba(7, 15, 12, .80)';
  ctx.fillRect(x - textWidth / 2 - 7, nameY - nameHeight / 2, textWidth + 14, nameHeight);
  ctx.fillStyle = '#f7edd0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x, nameY);
  const status = STATUS[person.status] || STATUS.available;
  ctx.fillStyle = status.color;
  ctx.beginPath();
  ctx.arc(x + textWidth / 2 + 6, nameY, Math.max(3, tile * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#14231c';
  ctx.lineWidth = 2;
  ctx.stroke();
  const equippedTitle = person.loadout?.title?.equipName;
  if (equippedTitle) {
    ctx.font = `700 ${Math.max(8, tile * 0.22)}px "Be Vietnam Pro", sans-serif`;
    const titleWidth = ctx.measureText(equippedTitle).width;
    const titleY = nameY - nameHeight * 0.9;
    ctx.fillStyle = 'rgba(50, 37, 20, .92)';
    ctx.fillRect(x - titleWidth / 2 - 5, titleY - tile * 0.12, titleWidth + 10, tile * 0.24);
    ctx.fillStyle = '#e6c775';
    ctx.fillText(equippedTitle, x, titleY);
  }
  ctx.textAlign = 'left';

  if (emote) {
    const bubbleY = nameY - tile * (equippedTitle ? 1.05 : 0.72) - Math.sin(time / 180) * 2;
    const bubbleWidth = Math.max(tile * 0.82, ctx.measureText(emote.mark).width + 18);
    ctx.fillStyle = '#f4ead0';
    ctx.fillRect(x - bubbleWidth / 2, bubbleY - tile * 0.34, bubbleWidth, tile * 0.56);
    ctx.fillStyle = '#f4ead0';
    ctx.beginPath();
    ctx.moveTo(x - 5, bubbleY + tile * 0.22);
    ctx.lineTo(x + 3, bubbleY + tile * 0.42);
    ctx.lineTo(x + 9, bubbleY + tile * 0.22);
    ctx.fill();
    ctx.strokeStyle = '#5c4b30';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - bubbleWidth / 2, bubbleY - tile * 0.34, bubbleWidth, tile * 0.56);
    ctx.fillStyle = '#2a2d22';
    ctx.font = `900 ${Math.max(10, tile * 0.34)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emote.mark, x, bubbleY - tile * 0.05);
    ctx.textAlign = 'left';
  }
}

function drawMinimap(ctx, width, height, player, staff, remotes, camera) {
  const mapW = width < 620 ? 132 : Math.min(190, Math.max(154, width * 0.18));
  const mapH = Math.round(mapW * WORLD.rows / WORLD.cols);
  const x0 = width - mapW - 14;
  const y0 = 14;
  const sx = mapW / WORLD.cols;
  const sy = mapH / WORLD.rows;
  ctx.fillStyle = 'rgba(8, 17, 13, .88)';
  ctx.fillRect(x0 - 4, y0 - 4, mapW + 8, mapH + 8);
  ctx.strokeStyle = '#917843';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 - 4, y0 - 4, mapW + 8, mapH + 8);
  for (const room of ROOMS) {
    ctx.fillStyle = room.floor;
    ctx.fillRect(x0 + room.x * sx, y0 + room.y * sy, room.w * sx, room.h * sy);
  }
  if (camera?.tile) {
    const viewX = camera.x / camera.tile;
    const viewY = camera.y / camera.tile;
    const viewW = Math.min(WORLD.cols, width / camera.tile);
    const viewH = Math.min(WORLD.rows, height / camera.tile);
    ctx.strokeStyle = 'rgba(247, 236, 196, .82)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + viewX * sx, y0 + viewY * sy, viewW * sx, viewH * sy);
  }
  ctx.fillStyle = '#e9c65d';
  ctx.fillRect(x0 + player.x * sx - 2, y0 + player.y * sy - 2, 5, 5);
  ctx.fillStyle = '#79b79a';
  for (const person of [...staff, ...remotes]) {
    ctx.fillRect(x0 + person.x * sx - 1, y0 + person.y * sy - 1, 3, 3);
  }
}

function WorldCanvas({
  onObjectOpen,
  onEmote,
  activePanel,
  playerStatus,
  playerProfile,
  onPosition,
  onNearby,
  staff,
  remotePlayers,
  activeEmotes,
  sessionId,
  mapStyle,
  position,
}) {
  const canvasRef = useRef(null);
  const positionRef = useRef(normalizeWorldPosition(position));
  const targetRef = useRef(null);
  const keysRef = useRef(new Set());
  const facingRef = useRef('down');
  const cameraRef = useRef({ x: 0, y: 0, tile: 32, width: 800, height: 600 });
  const activeObjectRef = useRef(null);
  const hoveredObjectRef = useRef(null);
  const motionAllowedRef = useRef(true);
  const staffRef = useRef(staff);
  const remoteRef = useRef(remotePlayers);
  const emotesRef = useRef(activeEmotes);
  const onObjectOpenRef = useRef(onObjectOpen);
  const generatedArtRef = useRef({ status: GENERATED_ART_REQUESTED ? 'loading' : 'procedural', sprites: new Map() });
  const [generatedArtState, setGeneratedArtState] = useState(GENERATED_ART_REQUESTED ? 'loading' : 'procedural');
  const environmentArtRef = useRef({
    status: ENVIRONMENT_ART_REQUESTED ? 'loading' : 'procedural',
    materials: new Map(),
    patterns: new Map(),
  });
  const [environmentArtState, setEnvironmentArtState] = useState(
    ENVIRONMENT_ART_REQUESTED ? 'loading' : 'procedural',
  );
  const propArtRef = useRef({
    status: PROP_ART_REQUESTED ? 'loading' : 'procedural',
    sprites: new Map(),
  });
  const [propArtState, setPropArtState] = useState(PROP_ART_REQUESTED ? 'loading' : 'procedural');

  useEffect(() => { staffRef.current = staff; }, [staff]);
  useEffect(() => { remoteRef.current = remotePlayers; }, [remotePlayers]);
  useEffect(() => { emotesRef.current = activeEmotes; }, [activeEmotes]);
  useEffect(() => { onObjectOpenRef.current = onObjectOpen; }, [onObjectOpen]);
  useEffect(() => {
    const next = normalizeWorldPosition(position);
    if (distance(positionRef.current, next) > 0.03) positionRef.current = next;
  }, [position]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { motionAllowedRef.current = !query.matches; };
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!GENERATED_ART_REQUESTED) return undefined;
    let cancelled = false;
    Promise.all(realmGeneratedCharacterAssets().map(async (asset) => [asset.key, await loadRealmImage(asset.url)]))
      .then((entries) => {
        if (cancelled) return;
        generatedArtRef.current = { status: 'ready', sprites: new Map(entries) };
        setGeneratedArtState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        generatedArtRef.current = { status: 'fallback', sprites: new Map() };
        setGeneratedArtState('fallback');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ENVIRONMENT_ART_REQUESTED) return undefined;
    let cancelled = false;
    Promise.all(realmGeneratedEnvironmentAssets().map(async (asset) => [asset.key, await loadRealmImage(asset.url)]))
      .then((entries) => {
        if (cancelled) return;
        environmentArtRef.current = {
          status: 'ready',
          materials: new Map(entries),
          patterns: new Map(),
        };
        setEnvironmentArtState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        environmentArtRef.current = { status: 'fallback', materials: new Map(), patterns: new Map() };
        setEnvironmentArtState('fallback');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!PROP_ART_REQUESTED) return undefined;
    let cancelled = false;
    const assets = [...realmGeneratedPropAssets(), ...realmGeneratedDecorAssets()];
    Promise.all(assets.map(async (asset) => [asset.key, await loadRealmImage(asset.url)]))
      .then((entries) => {
        if (cancelled) return;
        propArtRef.current = { status: 'ready', sprites: new Map(entries) };
        setPropArtState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        propArtRef.current = { status: 'fallback', sprites: new Map() };
        setPropArtState('fallback');
      });
    return () => { cancelled = true; };
  }, []);

  const moveTo = useCallback((x, y) => {
    targetRef.current = { x: clamp(x, 1, WORLD.cols - 2), y: clamp(y, 1, WORLD.rows - 2) };
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.x != null) moveTo(event.detail.x, event.detail.y);
    };
    window.addEventListener('realm:move', handler);
    return () => window.removeEventListener('realm:move', handler);
  }, [moveTo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.dataset.dpr = String(dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const isTyping = (event) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName);
    const down = (event) => {
      if (isTyping(event)) return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
        targetRef.current = null;
        keysRef.current.add(key);
      }
      if (key === 'e' && activeObjectRef.current) {
        event.preventDefault();
        onObjectOpenRef.current(activeObjectRef.current);
      }
    };
    const up = (event) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    let frame;
    let previous = performance.now();
    let lastUiSync = 0;

    const updatePosition = (dt) => {
      const keys = keysRef.current;
      let dx = 0;
      let dy = 0;
      if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
      if (keys.has('d') || keys.has('arrowright')) dx += 1;
      if (keys.has('w') || keys.has('arrowup')) dy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) dy += 1;

      const target = targetRef.current;
      if (!dx && !dy && target) {
        const tx = target.x - positionRef.current.x;
        const ty = target.y - positionRef.current.y;
        const d = Math.hypot(tx, ty);
        if (d < 0.12) targetRef.current = null;
        else {
          dx = tx / d;
          dy = ty / d;
        }
      }
      if (!dx && !dy) return;

      facingRef.current = realmArtDirectionFromDelta(dx, dy, facingRef.current);

      const length = Math.hypot(dx, dy) || 1;
      const speed = 4.45 * dt;
      dx = dx / length * speed;
      dy = dy / length * speed;
      const current = positionRef.current;
      let nextX = current.x;
      let nextY = current.y;
      if (canStand(current.x + dx, current.y)) nextX += dx;
      else if (target) targetRef.current = null;
      if (canStand(nextX, current.y + dy)) nextY += dy;
      else if (target) targetRef.current = null;
      positionRef.current = { x: nextX, y: nextY };
    };

    const render = (now) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      updatePosition(dt);
      const visualTime = motionAllowedRef.current ? now : 0;

      const dpr = Number(canvas.dataset.dpr || 1);
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const tile = width < 620 ? 38 : width < 960 ? 34 : 31;
      const worldW = WORLD.cols * tile;
      const worldH = WORLD.rows * tile;
      const player = positionRef.current;
      const cameraX = clamp(player.x * tile - width / 2, 0, Math.max(0, worldW - width));
      const cameraY = clamp(player.y * tile - height / 2, 0, Math.max(0, worldH - height));
      cameraRef.current = { x: cameraX, y: cameraY, tile, width, height };

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#0b1611';
      context.fillRect(0, 0, width, height);
      context.save();
      context.translate(-cameraX, -cameraY);

      const environmentMaterials = environmentArtRef.current.materials;
      const environmentPatterns = environmentArtRef.current.patterns;
      const activeMapStyle = realmMapStyle(mapStyle);
      for (let y = 0; y < WORLD.rows; y += 1) {
        for (let x = 0; x < WORLD.cols; x += 1) {
          if (WALLS.has(`${x},${y}`)) {
            drawWall(context, x, y, tile, environmentMaterials, environmentPatterns);
          } else {
            const room = roomAt(x, y);
            drawFloor(
              context,
              x,
              y,
              tile,
              room,
              environmentMaterials,
              environmentPatterns,
              activeMapStyle.materials[room?.id] || null,
            );
          }
        }
      }
      const propSprites = propArtRef.current.sprites;
      for (const decoration of activeMapStyle.decorations.filter((item) => item.floor)) {
        drawDecoration(context, decoration, tile, propSprites.get(`decor:${decoration.asset}`) || null);
      }
      drawRoomDecor(context, tile);
      for (const decoration of activeMapStyle.decorations.filter((item) => !item.floor)) {
        drawDecoration(context, decoration, tile, propSprites.get(`decor:${decoration.asset}`) || null);
      }

      const nearest = WORLD_OBJECTS.reduce((best, object) => {
        const d = distance(player, object);
        return !best || d < best.distance ? { object, distance: d } : best;
      }, null);
      const activeObject = nearest?.distance <= 1.75 ? nearest.object : null;
      activeObjectRef.current = activeObject;
      const generatedSprites = generatedArtRef.current.sprites;
      const spriteFor = (person, direction = 'down') => generatedSprites.get(
        realmGeneratedCharacterKey(person.id || person.userId || person.name, direction),
      ) || null;
      for (const object of WORLD_OBJECTS) {
        const binding = realmGeneratedPropBinding(object.id);
        const nearby = activeObject?.id === object.id;
        drawObject(
          context,
          object,
          tile,
          {
            nearby,
            hovered: hoveredObjectRef.current?.id === object.id,
            active: nearby && activePanel === object.panel,
          },
          visualTime,
          propSprites.get(object.id) || null,
          binding,
        );
      }
      for (const person of staffRef.current) {
        drawAvatar(context, person, tile, false, visualTime, emotesRef.current[person.id], spriteFor(person));
      }
      for (const person of remoteRef.current) {
        drawAvatar(context, person, tile, false, visualTime, emotesRef.current[person.id], spriteFor(person));
      }
      drawAvatar(
        context,
        { ...player, name: playerProfile.name, status: playerStatus, color: playerProfile.color, loadout: playerProfile.loadout },
        tile,
        true,
        visualTime,
        emotesRef.current[sessionId],
        spriteFor({ id: sessionId, name: playerProfile.name }, facingRef.current),
      );
      context.restore();
      drawMinimap(context, width, height, player, staffRef.current, remoteRef.current, cameraRef.current);

      if (now - lastUiSync > 110) {
        lastUiSync = now;
        const zone = privateZoneAt(player.x, player.y);
        onPosition({ ...player, zoneId: zone?.id || null }, activeObject);
        const nearby = [...staffRef.current, ...remoteRef.current].filter((person) => {
          const personZoneId = person.zoneId || privateZoneAt(person.x, person.y)?.id || null;
          return isInVoiceRange(
            { ...player, zoneId: zone?.id || null },
            { ...person, zoneId: personZoneId },
          );
        });
        onNearby(nearby, zone);
      }
      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [activePanel, mapStyle, onNearby, onPosition, playerProfile, playerStatus]);

  const pointerWorldPosition = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const camera = cameraRef.current;
    return {
      x: (event.clientX - rect.left + camera.x) / camera.tile,
      y: (event.clientY - rect.top + camera.y) / camera.tile,
    };
  };

  const pointerMove = (event) => {
    const point = pointerWorldPosition(event);
    moveTo(point.x, point.y);
  };

  const pointerHover = (event) => {
    const point = pointerWorldPosition(event);
    const hovered = WORLD_OBJECTS.find((object) => {
      const binding = realmGeneratedPropBinding(object.id);
      return distance(point, object) <= Math.max(0.85, (binding?.scale || 1.35) * 0.46);
    }) || null;
    hoveredObjectRef.current = hovered;
  };

  const pressDirection = (key, pressed) => {
    targetRef.current = null;
    if (pressed) keysRef.current.add(key);
    else keysRef.current.delete(key);
  };

  return (
    <div className={styles.worldWrap}>
      <canvas
        ref={canvasRef}
        className={styles.worldCanvas}
        onPointerDown={pointerMove}
        onPointerMove={pointerHover}
        onPointerLeave={() => { hoveredObjectRef.current = null; }}
        aria-label="Bản đồ văn phòng ảo CRMegoric Realms. Dùng WASD hoặc phím mũi tên để di chuyển."
        role="img"
        data-realm-art={generatedArtState}
        data-realm-environment-art={environmentArtState}
        data-realm-prop-art={propArtState}
        data-realm-map-style={mapStyle}
        data-realm-world-size={`${WORLD.cols}x${WORLD.rows}`}
      />
      <div className={styles.mapLegend} aria-hidden="true">
        <span><i className={styles.playerDot} /> Bạn</span>
        <span><i className={styles.staffDot} /> Đồng đội</span>
      </div>
      <div className={styles.quickEmotes} aria-label="Biểu cảm nhanh">
        <span>Emote</span>
        {REALM_EMOTES.map((emote) => (
          <button type="button" key={emote.id} onClick={() => onEmote(emote.id)} aria-label={emote.label} title={emote.label}>
            {emote.mark}
          </button>
        ))}
      </div>
      <div className={styles.dpad} aria-label="Điều khiển di chuyển">
        <button type="button" aria-label="Đi lên" onPointerDown={() => pressDirection('w', true)} onPointerUp={() => pressDirection('w', false)} onPointerLeave={() => pressDirection('w', false)}>W</button>
        <button type="button" aria-label="Đi sang trái" onPointerDown={() => pressDirection('a', true)} onPointerUp={() => pressDirection('a', false)} onPointerLeave={() => pressDirection('a', false)}>A</button>
        <button type="button" aria-label="Đi xuống" onPointerDown={() => pressDirection('s', true)} onPointerUp={() => pressDirection('s', false)} onPointerLeave={() => pressDirection('s', false)}>S</button>
        <button type="button" aria-label="Đi sang phải" onPointerDown={() => pressDirection('d', true)} onPointerUp={() => pressDirection('d', false)} onPointerLeave={() => pressDirection('d', false)}>D</button>
      </div>
    </div>
  );
}

function RemoteVideoTile({ person, stream, connectionState, onSelect }) {
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream || null;
  }, [stream]);

  const connectionLabel = connectionState === 'connected'
    ? 'WebRTC đã kết nối'
    : person.isRemote ? 'Đang bắt tay P2P' : person.isErpDirectory ? 'Nhân sự ERP' : 'Người chơi Realm';

  return (
    <button type="button" className={`${styles.videoTile} ${styles.videoTileButton}`} onClick={() => onSelect(person)} aria-label={`Mở tương tác với ${person.name}`} title={`${person.name} · ${connectionLabel}`}>
      {stream
        ? <video ref={remoteVideoRef} autoPlay playsInline />
        : <span className={styles.videoAvatar} style={{ '--avatar-color': person.color }}>{initials(person.name)}</span>}
      <span className={`${styles.connectionPip} ${connectionState === 'connected' ? styles.connectionLive : ''}`} aria-label={connectionLabel} />
      <span className={styles.videoName}>{person.name}</span>
    </button>
  );
}

function MediaDock({
  nearby,
  cameraOn,
  micOn,
  sharing,
  videoRef,
  profile,
  transportState,
  remoteStreams,
  connectionStates,
  mediaSupported,
  party,
  mediaTopology,
  mediaStatus,
  onCamera,
  onMic,
  onShare,
  onPerson,
}) {
  const remotePeers = nearby.filter((person) => person.isRemote);
  const connectedPeers = remotePeers.filter((person) => connectionStates[person.id] === 'connected').length;
  const topologyLabel = mediaTopology === 'sfu'
    ? mediaStatus === 'reconnecting' ? 'LiveKit SFU · đang nối lại' : 'LiveKit SFU · media server'
    : mediaTopology === 'mesh-fallback'
      ? 'P2P mesh fallback · SFU đang thử lại'
      : mediaTopology === 'mesh-warming'
        ? 'P2P mesh · đang làm nóng SFU'
        : 'P2P mesh';
  const transportLabel = !mediaSupported
    ? 'WebRTC không hỗ trợ'
    : party
      ? party.authoritative
        ? `Party Room · ${party.members.length}/${party.maxMembers} · ${topologyLabel}`
        : 'Party Voice · local fallback'
      : (TRANSPORT[transportState]?.label || 'Solo mode');
  const badgeLabel = party
    ? mediaTopology === 'sfu'
      ? mediaStatus === 'reconnecting' ? 'SFU · đang nối lại' : `SFU live · ${connectedPeers}`
      : mediaTopology === 'mesh-fallback'
        ? connectedPeers ? `P2P fallback · ${connectedPeers}` : 'P2P fallback'
        : connectedPeers ? `Party · ${connectedPeers} P2P` : remotePeers.length ? 'Party · đang kết nối' : 'Party · chờ thành viên'
    : connectedPeers ? `${connectedPeers} P2P live` : remotePeers.length ? 'Đang kết nối' : 'Yên tĩnh';

  return (
    <section className={styles.mediaDock} aria-label="Vùng trò chuyện theo khoảng cách">
      <div className={styles.mediaHeader}>
        <div>
          <span className={styles.eyebrow}>Spatial party</span>
          <strong>{nearby.length ? `${nearby.length} người trong tầm thoại` : 'Chưa có ai trong tầm thoại'}</strong>
          <small>{transportLabel}</small>
        </div>
        <span className={connectedPeers || mediaTopology === 'sfu' ? styles.liveBadge : styles.quietBadge} aria-live="polite">{badgeLabel}</span>
      </div>
      <div className={styles.videoRail}>
        <div className={styles.videoTile}>
          {cameraOn ? <video ref={videoRef} autoPlay muted playsInline /> : <span className={styles.videoAvatar} style={{ '--avatar-color': profile.color }}>{initials(profile.name)}</span>}
          <span className={`${styles.connectionPip} ${styles.connectionLive}`} aria-label="Bạn đang online" />
          <span className={styles.videoName}>{profile.name}</span>
        </div>
        {nearby.slice(0, 5).map((person) => <RemoteVideoTile key={person.id} person={person} stream={remoteStreams[person.id]} connectionState={connectionStates[person.id]} onSelect={onPerson} />)}
      </div>
      <div className={styles.mediaActions}>
        <button type="button" className={micOn ? styles.mediaActive : ''} aria-pressed={micOn} onClick={onMic}><Icon name="mic" size={17} />{micOn ? 'Tắt mic' : 'Bật mic'}</button>
        <button type="button" className={cameraOn ? styles.mediaActive : ''} aria-pressed={cameraOn} onClick={onCamera}><Icon name="camera" size={17} />{cameraOn ? 'Tắt camera' : 'Camera'}</button>
        <button type="button" className={sharing ? styles.mediaActive : ''} aria-pressed={sharing} onClick={onShare}><Icon name="screen" size={17} />{sharing ? 'Dừng chia sẻ' : 'Chia sẻ'}</button>
      </div>
    </section>
  );
}

function RealmOfficeInner({ erpHref = '/dashboard', demoMode = false, workspaceLabel = 'Demo entity', initialBridge = null, pilotFeatures = null, initialMode = 'world' }) {
  const toast = useToast();
  const tavernEnabled = pilotFeatures?.tavern !== false;
  const realmNav = useMemo(() => tavernEnabled ? NAV : NAV.filter((item) => !['treasury', 'shop'].includes(item.id)), [tavernEnabled]);
  const dataSource = useMemo(
    () => realmDataSourceMode({ erpHref: demoMode ? null : erpHref, syncEnabled: ERP_SYNC_REQUESTED }),
    [demoMode, erpHref],
  );
  const initialProfile = useMemo(() => normalizeProfile(dataSource.isErp && initialBridge?.actor
    ? { name: initialBridge.actor.name, role: initialBridge.actor.title || 'Realm Builder' }
    : DEFAULT_PROFILE), [dataSource.isErp, initialBridge]);
  const [mode, setMode] = useState(initialMode === 'ledger' ? 'ledger' : 'world');
  const [activePanel, setActivePanel] = useState('briefing');
  const [ledgerView, setLedgerView] = useState('personal');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [profile, setProfile] = useState(initialProfile);
  const [profileDraft, setProfileDraft] = useState(initialProfile);
  const [playerStatus, setPlayerStatus] = useState('available');
  const [mapStyle, setMapStyle] = useState(REALM_MAP_STYLE_DEFAULT);
  const [position, setPosition] = useState({ ...DEFAULT_WORLD_POSITION, zoneId: null });
  const positionRef = useRef(position);
  const [activeObject, setActiveObject] = useState(null);
  const [nearby, setNearby] = useState([]);
  const [privateZone, setPrivateZone] = useState(null);
  const [operations, setOperations] = useState(() => createRealmOperations(realmInitialOperations(dataSource, { quests: QUESTS, ledger: INITIAL_LEDGER, wallet: 28 })));
  const [operationsReady, setOperationsReady] = useState(dataSource.isErp);
  const [operationsSource, setOperationsSource] = useState(dataSource.operationsSource);
  const [operationsSyncState, setOperationsSyncState] = useState(dataSource.initialSyncState);
  const [operationsSyncMeta, setOperationsSyncMeta] = useState(EMPTY_SYNC_META);
  const [realmDataRevision, setRealmDataRevision] = useState(0);
  const operationsSyncEtagRef = useRef(null);
  const operationsSyncRequestRef = useRef(null);
  const operationsSyncAbortRef = useRef(null);
  const [businessBridge, setBusinessBridge] = useState(() => initialBridge || ({
    ...createRealmErpBridge({ demo: dataSource.allowDemoFixtures, sourceOfTruth: dataSource.isErp ? 'erp' : 'local' }),
    counters: dataSource.isErp
      ? { quests: 0, openQuests: 0, campaigns: 0 }
      : { quests: QUESTS.length, openQuests: QUESTS.filter((quest) => quest.status !== 'claimed').length, campaigns: CAMPAIGNS.length },
  }));
  const [rewardDashboard, setRewardDashboard] = useState(() => createRealmRewardDemoDashboard(dataSource.allowDemoFixtures ? QUESTS : []));
  const [treasuryDashboard, setTreasuryDashboard] = useState(() => createRealmTreasuryDemoDashboard(dataSource.allowDemoFixtures ? 28 : 0));
  const [treasuryReady, setTreasuryReady] = useState(dataSource.isErp);
  const { wallet, quests, ledger } = operations;
  const career = useMemo(() => summarizeRealmCareer(operations), [operations]);
  const [messages, setMessages] = useState(() => realmInitialMessages(dataSource, [
    { id: 'm1', name: 'Trần Khánh Linh', text: 'Mọi người qua Tavern lúc 15:00 nhé, review campaign 10 phút.', at: '10:12' },
    { id: 'm2', name: 'Lê Ngọc Mai', text: 'Đã ghim checklist onboarding lên Sổ bộ Guild.', at: '10:18' },
  ]));
  const [chatText, setChatText] = useState('');
  const [whisperText, setWhisperText] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactReceipt, setContactReceipt] = useState(null);
  const [uiArtState, setUiArtState] = useState(UI_ART_REQUESTED ? 'loading' : 'procedural');
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [activeEmotes, setActiveEmotes] = useState({});
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [partyConfirm, setPartyConfirm] = useState(null);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [experienceReady, setExperienceReady] = useState(false);
  const [navigationAnnouncement, setNavigationAnnouncement] = useState('');
  const [erpHandoffState, setErpHandoffState] = useState('idle');
  const mediaRef = useRef(null);
  const screenRef = useRef(null);
  const videoRef = useRef(null);
  const emoteTimersRef = useRef(new Map());
  const mainStageRef = useRef(null);
  const inspectorRef = useRef(null);
  const experienceHydratedRef = useRef(false);
  const previousExperienceRef = useRef(null);
  const previousSyncStateRef = useRef(null);
  const collaborationDirectory = useCollaborationDirectory({ enabled: dataSource.isErp });

  const handoffToErp = useCallback(async (event) => {
    persistWorkspaceSurface('erp');
    sendRealmExperienceSignal(dataSource.isErp, 'erp_handoff', 'erp', realmJourneyForContext({ mode, panel: activePanel, ledgerView }));
    if (!demoMode || erpHandoffState === 'loading') return;

    event.preventDefault();
    setErpHandoffState('loading');
    setNavigationAnnouncement('Đang mở ERP · CRM bằng phiên demo dùng chung.');
    try {
      const response = await fetch('/api/realm-demo/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`realm_demo_session_${response.status}`);
      window.location.assign(erpHref);
    } catch {
      setErpHandoffState('fallback');
      setNavigationAnnouncement('Không thể tạo phiên demo tự động. Đang chuyển tới trang đăng nhập ERP · CRM.');
      window.location.assign(erpHref);
    }
  }, [activePanel, dataSource.isErp, demoMode, erpHandoffState, erpHref, ledgerView, mode]);

  useEffect(() => { setPlayerStatus(preferredCollaborationAvailability()); }, []);
  useEffect(() => {
    let stored = null;
    try { stored = window.localStorage.getItem(REALM_MAP_STYLE_STORAGE_KEY); } catch {}
    setMapStyle(normalizeRealmMapStyle(stored));
  }, []);

  const changeMapStyle = useCallback((event) => {
    const nextStyle = normalizeRealmMapStyle(event.target.value);
    setMapStyle(nextStyle);
    try { window.localStorage.setItem(REALM_MAP_STYLE_STORAGE_KEY, nextStyle); } catch {}
    const preset = realmMapStyle(nextStyle);
    toast(`Đã đổi cảnh quan lâu đài: ${preset.label}. Dữ liệu nghiệp vụ không thay đổi.`);
  }, [toast]);
  useEffect(() => {
    if (experienceHydratedRef.current) return;
    experienceHydratedRef.current = true;
    let restored = null;
    try { restored = parseRealmExperienceContext(window.localStorage.getItem(REALM_EXPERIENCE_STORAGE_KEY)); } catch {}
    if (restored) {
      const restoredPanel = restored.panel === 'profile' || (realmNav.some((item) => item.id === restored.panel) && realmAccessForPanel(businessBridge?.access, restored.panel).allowed)
        ? restored.panel
        : 'briefing';
      const restoredLedgerView = realmAccessForSurface(businessBridge?.access, restored.ledgerView).allowed
        ? restored.ledgerView
        : 'personal';
      const restoredMode = restored.mode === 'ledger' && realmAccessForSurface(businessBridge?.access, restoredLedgerView).allowed
        ? 'ledger'
        : 'world';
      // A deliberate deep-link to the ledger wins over a previously remembered
      // world position. This keeps /realm?view=ledger stable for bookmarks, demos
      // and the ERP navigation entry that restores Sổ Realm discoverability.
      setMode(initialMode === 'ledger' ? 'ledger' : restoredMode);
      setActivePanel(restoredPanel);
      setLedgerView(restoredLedgerView);
      if (restored.position) setPosition((current) => ({ ...current, ...normalizeWorldPosition(restored.position) }));
      setNavigationAnnouncement('Đã khôi phục khu vực làm việc gần nhất trong Realm.');
      toast('Đã khôi phục khu vực Realm gần nhất.');
      sendRealmExperienceSignal(dataSource.isErp, 'continuity_restored', restoredMode === 'ledger' ? 'ledger' : 'realm', realmJourneyForContext({ ...restored, mode: restoredMode, panel: restoredPanel, ledgerView: restoredLedgerView }));
    }
    sendRealmExperienceSignal(dataSource.isErp, 'realm_opened', restored?.mode === 'ledger' ? 'ledger' : 'realm', restored ? realmJourneyForContext(restored) : null);
    setExperienceReady(true);
  }, [businessBridge?.access, dataSource.isErp, initialMode, realmNav, toast]);
  useEffect(() => {
    if (!experienceReady) return undefined;
    const timer = window.setTimeout(() => {
      const context = normalizeRealmExperienceContext({
        mode,
        panel: activePanel,
        ledgerView,
        position,
      });
      try { window.localStorage.setItem(REALM_EXPERIENCE_STORAGE_KEY, JSON.stringify(context)); } catch {}
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activePanel, experienceReady, ledgerView, mode, position]);
  useEffect(() => {
    if (!experienceReady) return;
    const context = normalizeRealmExperienceContext({ mode, panel: activePanel, ledgerView });
    const journey = realmJourneyForContext(context);
    const previous = previousExperienceRef.current;
    if (previous && previous.mode !== context.mode) {
      sendRealmExperienceSignal(dataSource.isErp, 'mode_changed', context.mode === 'ledger' ? 'ledger' : 'realm', journey);
    }
    if (journey && journey !== previous?.journey) {
      sendRealmExperienceSignal(dataSource.isErp, 'journey_opened', context.mode === 'ledger' ? 'ledger' : 'realm', journey);
    }
    previousExperienceRef.current = { ...context, journey };
    const panelLabel = mode === 'ledger'
      ? `Sổ Realm · ${ledgerView}`
      : realmNav.find((item) => item.id === activePanel)?.label || (activePanel === 'profile' ? 'Hồ sơ nhân vật' : 'Realm');
    setNavigationAnnouncement(`Đã mở ${panelLabel}.`);
    const target = mode === 'world' && activePanel !== 'briefing' ? inspectorRef.current : mainStageRef.current;
    if (target) {
      target.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 900px)').matches) {
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    }
  }, [activePanel, dataSource.isErp, experienceReady, ledgerView, mode, realmNav]);
  useEffect(() => {
    if (!dataSource.isErp) return;
    const degraded = ['fallback', 'stale', 'offline', 'error'].includes(operationsSyncState);
    const previouslyDegraded = ['fallback', 'stale', 'offline', 'error'].includes(previousSyncStateRef.current);
    if (degraded && !previouslyDegraded) sendRealmExperienceSignal(true, 'sync_degraded', mode === 'ledger' ? 'ledger' : 'realm', realmJourneyForContext({ mode, panel: activePanel, ledgerView }));
    if (!degraded && previouslyDegraded && operationsSyncState === 'ready') sendRealmExperienceSignal(true, 'sync_recovered', mode === 'ledger' ? 'ledger' : 'realm', realmJourneyForContext({ mode, panel: activePanel, ledgerView }));
    previousSyncStateRef.current = operationsSyncState;
  }, [activePanel, dataSource.isErp, ledgerView, mode, operationsSyncState]);

  const applyRemoteOperations = useCallback((snapshot, responseEtag = null, trace = {}) => {
    if (snapshot?.source !== 'erp' || !snapshot.operations || !snapshot.profile || !snapshot.sync?.revision) {
      throw new Error('ERP trả về snapshot không hợp lệ.');
    }
    const appliedAt = new Date().toISOString();
    const nextProfile = normalizeProfile(snapshot.profile);
    setOperations(createRealmOperations(snapshot.operations));
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    setOperationsSource('erp');
    setBusinessBridge(snapshot.bridge || initialBridge || {
      ...createRealmErpBridge({ demo: false, sourceOfTruth: 'erp' }),
      counters: { quests: snapshot.operations.quests.length, openQuests: snapshot.operations.quests.filter((quest) => quest.status !== 'claimed').length, campaigns: 0 },
    });
    operationsSyncEtagRef.current = responseEtag || `"realm-${snapshot.sync.revision}"`;
    setOperationsSyncMeta({
      revision: snapshot.sync.revision,
      profileVersion: snapshot.sync.entities?.profileVersion ?? null,
      serverGeneratedAt: snapshot.sync.generatedAt || appliedAt,
      lastSyncedAt: appliedAt,
      lastCheckedAt: appliedAt,
      requestId: trace.requestId || null,
      latencyMs: trace.latencyMs ?? null,
      outcome: trace.outcome || 'success',
      error: null,
    });
    setOperationsReady(true);
    setOperationsSyncState('ready');
  }, [initialBridge]);

  const fetchRealmSnapshot = useCallback(async ({ intent = 'background' } = {}) => {
    if (operationsSyncRequestRef.current) return operationsSyncRequestRef.current;
    const checkedAt = new Date().toISOString();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      const offlineError = new Error('Thiết bị đang ngoại tuyến. Snapshot hiện tại được giữ nguyên.');
      offlineError.code = 'realm_offline';
      setOperationsSyncState(operationsSyncEtagRef.current ? 'offline' : 'fallback');
      setOperationsSyncMeta((current) => ({ ...current, lastCheckedAt: checkedAt, outcome: 'offline', error: { code: offlineError.code, message: offlineError.message, at: checkedAt } }));
      throw offlineError;
    }

    setOperationsSyncState(intent === 'initial' ? 'connecting' : 'checking');
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, intent === 'initial' ? 6500 : 10_000);
    operationsSyncAbortRef.current = controller;
    const requestPromise = (async () => {
      try {
        const response = await fetch('/api/realm-demo/operations', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
          headers: operationsSyncEtagRef.current ? { 'If-None-Match': operationsSyncEtagRef.current } : {},
        });
        const responseAt = new Date().toISOString();
        const responseTrace = realmTraceFromResponse(response);
        if (response.status === 304) {
          setOperationsSyncMeta((current) => ({ ...current, ...responseTrace, lastCheckedAt: responseAt, error: null }));
          setOperationsSyncState('ready');
          return { notModified: true };
        }
        const payload = await response.json().catch(() => ({}));
        const payloadTrace = realmTraceFromResponse(response, payload);
        if (!response.ok) {
          const responseError = new Error(payload.error || 'Không thể kết nối ERP.');
          responseError.code = payload.code || `realm_http_${response.status}`;
          Object.assign(responseError, payloadTrace);
          throw responseError;
        }
        applyRemoteOperations(payload, response.headers.get('ETag'), payloadTrace);
        return payload;
      } catch (error) {
        const failedAt = new Date().toISOString();
        const message = timedOut
          ? 'ERP phản hồi quá lâu. Snapshot hiện tại được giữ nguyên.'
          : error?.message || 'Không thể đồng bộ Realm với ERP.';
        const syncError = new Error(message);
        syncError.code = timedOut ? 'realm_sync_timeout' : error?.code || (navigator.onLine === false ? 'realm_offline' : 'realm_sync_failed');
        syncError.requestId = error?.requestId || null;
        syncError.latencyMs = error?.latencyMs ?? null;
        syncError.outcome = error?.outcome || (timedOut ? 'timeout' : 'error');
        const hasRemoteSnapshot = Boolean(operationsSyncEtagRef.current);
        setOperationsSyncState(syncError.code === 'realm_offline' ? (hasRemoteSnapshot ? 'offline' : 'fallback') : (hasRemoteSnapshot ? 'stale' : 'fallback'));
        setOperationsSyncMeta((current) => ({
          ...current,
          requestId: syncError.requestId || current.requestId,
          latencyMs: syncError.latencyMs ?? current.latencyMs,
          outcome: syncError.outcome,
          lastCheckedAt: failedAt,
          error: { code: syncError.code, message, at: failedAt },
        }));
        throw syncError;
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    operationsSyncRequestRef.current = requestPromise;
    try {
      return await requestPromise;
    } finally {
      if (operationsSyncRequestRef.current === requestPromise) operationsSyncRequestRef.current = null;
      if (operationsSyncAbortRef.current === controller) operationsSyncAbortRef.current = null;
    }
  }, [applyRemoteOperations]);

  const receiveChat = useCallback((message) => {
    if (!message.text) return;
    setMessages((current) => [...current, message]);
    if (message.private) toast(`${message.name} vừa gửi một lời thì thầm`);
  }, [toast]);

  const showEmote = useCallback(({ senderId, emoteId }) => {
    const emote = realmEmote(emoteId);
    if (!senderId || !emote) return;
    const previousTimer = emoteTimersRef.current.get(senderId);
    if (previousTimer) window.clearTimeout(previousTimer);
    setActiveEmotes((current) => ({ ...current, [senderId]: emote }));
    const timer = window.setTimeout(() => {
      setActiveEmotes((current) => {
        if (!current[senderId]) return current;
        const next = { ...current };
        delete next[senderId];
        return next;
      });
      emoteTimersRef.current.delete(senderId);
    }, 2600);
    emoteTimersRef.current.set(senderId, timer);
  }, []);

  const {
    sessionId,
    remotePlayers,
    transportState,
    networkInfo,
    iceServers,
    sendChat: broadcastChat,
    sendWhisper: broadcastWhisper,
    sendEmote: broadcastEmote,
    sendSignal,
    sendParty,
    subscribeSignal,
    subscribeParty,
  } = useRealmPresence({ positionRef, profile, status: playerStatus, onChat: receiveChat, onEmote: showEmote });
  const {
    party,
    incomingInvite,
    outgoingInvite,
    notice: partyNotice,
    invite: inviteToParty,
    acceptInvite,
    declineInvite,
    cancelInvite,
    leaveParty,
    kickMember,
  } = useRealmParty({
    sessionId,
    profile,
    partyAuthority: networkInfo.partyAuthority === true,
    sendParty,
    subscribeParty,
  });
  const partyMemberIds = useMemo(
    () => new Set((party?.members || []).filter((member) => member.id !== sessionId).map((member) => member.id)),
    [party?.members, sessionId],
  );
  const partyPeers = useMemo(
    () => remotePlayers.filter((person) => partyMemberIds.has(person.id)),
    [partyMemberIds, remotePlayers],
  );
  const voiceNearby = useMemo(() => {
    const next = [...nearby];
    const known = new Set(next.map((person) => person.id));
    for (const peer of partyPeers) {
      if (!known.has(peer.id)) next.push({ ...peer, inParty: true });
    }
    return next;
  }, [nearby, partyPeers]);
  const sfuMedia = usePartySfuMedia({
    party,
    sessionId,
    mediaRef,
    screenRef,
    mediaRevision,
  });
  const meshNearby = useMemo(
    () => sfuMedia.active ? voiceNearby.filter((person) => !partyMemberIds.has(person.id)) : voiceNearby,
    [partyMemberIds, sfuMedia.active, voiceNearby],
  );
  const meshMedia = useProximityMedia({
    sessionId,
    nearbyPlayers: meshNearby,
    mediaRef,
    screenRef,
    mediaRevision,
    iceServers,
    sendSignal,
    subscribeSignal,
  });
  const remoteStreams = useMemo(
    () => sfuMedia.active ? { ...meshMedia.remoteStreams, ...sfuMedia.remoteStreams } : meshMedia.remoteStreams,
    [meshMedia.remoteStreams, sfuMedia.active, sfuMedia.remoteStreams],
  );
  const connectionStates = useMemo(
    () => sfuMedia.active ? { ...meshMedia.connectionStates, ...sfuMedia.connectionStates } : meshMedia.connectionStates,
    [meshMedia.connectionStates, sfuMedia.active, sfuMedia.connectionStates],
  );
  const mediaSupported = meshMedia.supported || sfuMedia.supported;
  const mediaTopology = !party?.media
    ? 'mesh'
    : sfuMedia.active
      ? 'sfu'
      : ['failed', 'unsupported'].includes(sfuMedia.status)
        ? 'mesh-fallback'
        : 'mesh-warming';

  useEffect(() => {
    if (partyNotice) toast(partyNotice.text, partyNotice.tone);
  }, [partyNotice, toast]);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => {
    if (dataSource.isErp) return;
    try {
      let guestId = localStorage.getItem(GUEST_ID_STORAGE_KEY);
      if (!guestId) {
        guestId = crypto.randomUUID();
        localStorage.setItem(GUEST_ID_STORAGE_KEY, guestId);
      }
      const saved = createRealmDemoGuestProfile(
        JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}'),
        guestId,
      );
      setProfile(saved);
      setProfileDraft(saved);
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      localStorage.removeItem(PROFILE_STORAGE_KEY);
      localStorage.removeItem(GUEST_ID_STORAGE_KEY);
    }
  }, [dataSource.isErp]);
  useEffect(() => {
    if (dataSource.isErp) return;
    const fallback = { quests: QUESTS, ledger: INITIAL_LEDGER, wallet: 28 };
    try {
      const saved = JSON.parse(localStorage.getItem(REALM_OPERATIONS_STORAGE_KEY) || 'null');
      setOperations(normalizeRealmOperations(saved, fallback));
    } catch {
      localStorage.removeItem(REALM_OPERATIONS_STORAGE_KEY);
      setOperations(createRealmOperations(fallback));
    } finally {
      setOperationsReady(true);
    }
  }, [dataSource.isErp]);
  useEffect(() => {
    if (!UI_ART_REQUESTED) return undefined;
    let cancelled = false;
    Promise.all(GENERATED_UI_ART_ASSETS.map((asset) => loadRealmImage(asset.url)))
      .then(() => {
        if (!cancelled) setUiArtState('ready');
      })
      .catch(() => {
        if (!cancelled) setUiArtState('fallback');
      });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (operationsReady && operationsSource === 'local') {
      localStorage.setItem(REALM_OPERATIONS_STORAGE_KEY, JSON.stringify(operations));
    }
  }, [operations, operationsReady, operationsSource]);
  useEffect(() => {
    if (dataSource.isErp) return;
    try {
      const saved = JSON.parse(localStorage.getItem(REALM_TREASURY_STORAGE_KEY) || 'null');
      setTreasuryDashboard((current) => restoreRealmTreasuryDemoDashboard(saved, current.wallet));
    } catch {
      localStorage.removeItem(REALM_TREASURY_STORAGE_KEY);
    } finally {
      setTreasuryReady(true);
    }
  }, [dataSource.isErp]);
  useEffect(() => {
    if (treasuryReady && operationsSource === 'local') {
      localStorage.setItem(REALM_TREASURY_STORAGE_KEY, JSON.stringify(serializeRealmTreasuryDemoState(treasuryDashboard)));
    }
  }, [operationsSource, treasuryDashboard, treasuryReady]);
  useEffect(() => {
    if (operationsSource !== 'local') return;
    const ownedIds = new Set(ledger
      .filter((entry) => ['shop_spend', 'spend'].includes(entry.type) && entry.sourceId)
      .map((entry) => entry.sourceId));
    const inventory = SHOP_ITEMS
      .filter((item) => item.kind === 'cosmetic' && ownedIds.has(item.id))
      .map((item) => ({ ...item, equipped: profile.loadout?.[item.slot]?.id === item.id }));
    setTreasuryDashboard((current) => ({
      ...current,
      wallet,
      inventory,
      loadout: profile.loadout,
      catalog: current.catalog.map((item) => ({
        ...item,
        owned: item.kind === 'cosmetic' && ownedIds.has(item.id),
        affordable: wallet >= item.price,
      })),
    }));
  }, [ledger, operationsSource, profile.loadout, wallet]);
  useEffect(() => {
    if (!dataSource.syncRequested) return undefined;
    fetchRealmSnapshot({ intent: 'initial' }).catch(() => {});
    return () => {
      operationsSyncAbortRef.current?.abort();
    };
  }, [dataSource.syncRequested, fetchRealmSnapshot]);
  useEffect(() => {
    if (!dataSource.syncRequested || operationsSource !== 'erp') return undefined;
    const revalidate = () => fetchRealmSnapshot({ intent: 'background' }).catch(() => {});
    const onVisibility = () => {
      if (document.visibilityState === 'visible') revalidate();
    };
    const onOnline = () => revalidate();
    const onOffline = () => {
      const at = new Date().toISOString();
      const message = 'Thiết bị đang ngoại tuyến. Snapshot ERP gần nhất vẫn được giữ nguyên.';
      setOperationsSyncState('offline');
      setOperationsSyncMeta((current) => ({ ...current, outcome: 'offline', lastCheckedAt: at, error: { code: 'realm_offline', message, at } }));
    };
    const interval = window.setInterval(revalidate, REALM_REMOTE_REFRESH_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', revalidate);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [dataSource.syncRequested, fetchRealmSnapshot, operationsSource]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = mediaRef.current;
  }, [cameraOn]);

  useEffect(() => () => {
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    screenRef.current?.getTracks().forEach((track) => track.stop());
    for (const timer of emoteTimersRef.current.values()) window.clearTimeout(timer);
    emoteTimersRef.current.clear();
  }, []);

  const triggerEmote = useCallback((emoteId, targetId) => {
    const emote = realmEmote(emoteId);
    if (!emote) return;
    showEmote({ senderId: sessionId, emoteId: emote.id });
    const sent = broadcastEmote(emote.id, targetId);
    toast(sent ? `Đã gửi biểu cảm: ${emote.label}` : 'Kênh realtime chưa sẵn sàng', sent ? 'success' : 'error');
  }, [broadcastEmote, sessionId, showEmote, toast]);

  const handlePosition = useCallback((next, object) => {
    setPosition((current) => (Math.abs(current.x - next.x) + Math.abs(current.y - next.y) > 0.03 ? { ...next } : current));
    setActiveObject((current) => (current?.id === object?.id ? current : object));
  }, []);

  const handleNearby = useCallback((people, zone) => {
    const signature = (items) => items.map((person) => [
      person.id,
      person.name,
      person.role,
      person.status,
      Number(person.x).toFixed(2),
      Number(person.y).toFixed(2),
    ].join(':')).join('|');
    setNearby((current) => signature(current) === signature(people) ? current : people);
    setPrivateZone((current) => current?.id === zone?.id ? current : zone);
  }, []);

  const openAuthorizedPanel = useCallback((panel, { campaign = null, announce = '' } = {}) => {
    if (!tavernEnabled && ['treasury', 'shop'].includes(panel)) {
      toast('Tavern đang tạm tắt theo release policy.', 'error');
      return false;
    }
    const access = realmAccessForPanel(businessBridge?.access, panel);
    if (!access.allowed) {
      toast(access.reason || 'Session ERP không có quyền mở khu vực này.', 'error');
      return false;
    }
    if (campaign) setSelectedCampaign(campaign);
    setMode('world');
    setActivePanel(panel);
    if (announce) toast(announce);
    return true;
  }, [businessBridge, tavernEnabled, toast]);

  const openObject = useCallback((object) => {
    openAuthorizedPanel(object.panel, { announce: `Đã mở ${object.name}` });
  }, [openAuthorizedPanel]);

  const moveToObject = (panel) => {
    if (!openAuthorizedPanel(panel)) return;
    const object = WORLD_OBJECTS.find((item) => item.panel === panel);
    if (object) window.dispatchEvent(new CustomEvent('realm:move', { detail: { x: object.x, y: object.y + 1.1 } }));
  };

  useEffect(() => {
    const access = realmAccessForPanel(businessBridge?.access, activePanel);
    if (!access.allowed) {
      setActivePanel('briefing');
      toast(access.reason || 'Quyền truy cập Realm vừa thay đổi.', 'error');
    }
  }, [activePanel, businessBridge, toast]);

  const postRealmErpAction = useCallback(async (body, idempotencyKey) => {
    setOperationsSyncState('syncing');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/realm-demo/operations', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      const responseTrace = realmTraceFromResponse(response, payload);
      if (!response.ok) {
        const responseError = new Error(payload.error || 'ERP từ chối thao tác.');
        responseError.code = payload.code || `realm_http_${response.status}`;
        Object.assign(responseError, responseTrace);
        throw responseError;
      }
      applyRemoteOperations(payload, response.headers.get('ETag'), responseTrace);
      return payload;
    } catch (error) {
      const failedAt = new Date().toISOString();
      const writeError = error?.name === 'AbortError'
        ? new Error('ERP phản hồi quá lâu. Chưa có thay đổi nào được xác nhận.')
        : error;
      writeError.code ||= error?.name === 'AbortError' ? 'realm_write_timeout' : 'realm_write_failed';
      writeError.outcome ||= error?.name === 'AbortError' ? 'timeout' : 'error';
      setOperationsSyncState(navigator.onLine === false ? 'offline' : 'stale');
      setOperationsSyncMeta((current) => ({
        ...current,
        requestId: writeError.requestId || current.requestId,
        latencyMs: writeError.latencyMs ?? current.latencyMs,
        outcome: navigator.onLine === false ? 'offline' : writeError.outcome,
        lastCheckedAt: failedAt,
        error: { code: writeError.code, message: writeError.message, at: failedAt },
      }));
      throw writeError;
    } finally {
      window.clearTimeout(timeout);
    }
  }, [applyRemoteOperations]);

  const refreshRealmOperations = useCallback(async () => {
    if (!dataSource.syncRequested && operationsSource !== 'erp') return null;
    if (!dataSource.syncRequested) {
      toast('Realm ERP sync chưa được bật cho môi trường này.', 'error');
      return null;
    }
    try {
      return await fetchRealmSnapshot({ intent: 'manual' });
    } catch (refreshError) {
      toast(refreshError.message || 'Tavern đã xử lý nhưng chưa thể làm mới ví Realm.', 'error');
      return null;
    }
  }, [dataSource.syncRequested, fetchRealmSnapshot, operationsSource, toast]);

  const handleRealmChanges = useCallback(async (feed) => {
    const domains = new Set(feed?.domains || []);
    if (!domains.size) return;
    setRealmDataRevision((current) => current + 1);
    const refreshes = [];
    if (['operations', 'access', 'treasury', 'rewards'].some((domain) => domains.has(domain))) {
      refreshes.push(fetchRealmSnapshot({ intent: 'background' }).catch(() => null));
    }
    if (domains.has('directory')) refreshes.push(collaborationDirectory.refresh().catch(() => null));
    await Promise.all(refreshes);
  }, [collaborationDirectory.refresh, fetchRealmSnapshot]);

  const changeFeed = useRealmChangeFeed({
    enabled: dataSource.syncRequested,
    onChanges: handleRealmChanges,
  });

  const copyRealmSupportId = useCallback(async (requestId) => {
    if (!requestId) return;
    try {
      await navigator.clipboard.writeText(requestId);
      toast(`Đã copy mã hỗ trợ ${requestId.slice(0, 14)}`, 'success');
    } catch {
      toast('Trình duyệt không cho phép copy mã hỗ trợ. Hãy chọn mã và copy thủ công.', 'error');
    }
  }, [toast]);

  const handleLocalTreasuryChange = useCallback(async (nextDashboard) => {
    const action = nextDashboard?.action;
    const walletDelta = Number(action?.walletDelta || 0);
    setTreasuryDashboard({ ...nextDashboard, action: null });
    if (action?.outcome === 'equipped') {
      const nextProfile = normalizeProfile({ ...profile, loadout: nextDashboard.loadout });
      setProfile(nextProfile);
      setProfileDraft(nextProfile);
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    }
    if (!walletDelta && !['fulfilled', 'equipped'].includes(action?.outcome)) return;
    const itemName = action?.item?.name || 'Tavern redemption';
    const label = action?.outcome === 'equipped'
      ? `Trang bị: ${itemName}`
      : action?.outcome === 'rejected'
      ? `Hoàn giữ: ${itemName}`
      : action?.outcome === 'pending'
        ? `Giữ chờ duyệt: ${itemName}`
        : action?.type === 'demo-fulfill'
          ? `Tavern đã trao: ${itemName}`
        : `Đổi: ${itemName}`;
    setOperations((current) => ({
      ...current,
      wallet: Math.max(0, current.wallet + walletDelta),
      ledger: [{
        id: crypto.randomUUID(),
        at: 'Vừa xong',
        type: action?.outcome === 'equipped' ? 'loadout_equip' : action?.type === 'demo-fulfill' ? 'fulfillment' : walletDelta > 0 ? 'release' : action?.outcome === 'pending' ? 'hold' : 'shop_spend',
        amount: walletDelta,
        label,
        sourceId: action?.item?.id,
      }, ...current.ledger].slice(0, 100),
    }));
  }, [profile]);

  const handleRewardChanged = useCallback(async (reward) => {
    if (!reward) return;
    if (operationsSource === 'local') {
      setOperations((current) => ({
        ...current,
        quests: current.quests.map((quest) => {
          if ((quest.businessRef || quest.id) !== reward.taskId || quest.status === 'claimed') return quest;
          const approved = reward.status === 'approved';
          const status = approved && quest.progress >= quest.total ? 'ready' : 'active';
          return {
            ...quest,
            reward: reward.gold,
            renown: reward.renown,
            status,
            rewardApproved: approved,
            approval: approved
              ? `Đã duyệt bởi ${reward.approvedBy || 'checker'}`
              : reward.status === 'pending'
                ? 'Đang chờ duyệt reward'
                : reward.status === 'rejected'
                  ? 'Reward cần điều chỉnh'
                  : 'Reward draft',
          };
        }),
      }));
      return;
    }
    await refreshRealmOperations();
  }, [operationsSource, refreshRealmOperations]);

  const claimQuest = async (quest) => {
    if (quest.status !== 'ready') return;
    if (operationsSource === 'erp') {
      try {
        const result = await postRealmErpAction(
          { action: 'claim-reward', taskId: quest.businessRef },
          `realm-claim:${quest.businessRef}`,
        );
        toast(result.action?.idempotent ? 'Reward này đã có trong Gold journal' : `Đã ghi ${quest.reward} Gold và ${quest.renown} Renown vào ERP`);
      } catch (error) {
        toast(error.message || 'Không thể ghi reward vào ERP.', 'error');
      }
      return;
    }
    setOperations((current) => claimRealmQuest(current, quest.id, { entryId: crypto.randomUUID() }));
    toast(`Nhận ${quest.reward} Gold và ${quest.renown} Renown`);
  };

  const advanceQuest = (quest) => {
    if (quest.status !== 'active') return;
    if (operationsSource === 'erp') {
      toast('Tiến độ thật được cập nhật tại Tasks; Realm chỉ đọc snapshot đã kiểm soát.');
      window.location.assign(quest.links?.task || realmRecordHref('task', quest.businessRef));
      return;
    }
    setOperations((current) => advanceRealmQuest(current, quest.id));
    toast(quest.progress + 1 >= quest.total ? 'Quest đã đủ điều kiện nhận thưởng' : 'Đã cập nhật tiến độ demo');
  };

  const buyItem = (item) => {
    if (item.kind === 'benefit') {
      toast('Quyền lợi thật phải gửi qua Sổ Realm → Tavern để checker duyệt.');
      setMode('ledger');
      return;
    }
    if (operationsSource === 'erp') {
      toast('Mở Sổ Realm → Tavern để ghi cosmetic vào Gold journal.');
      setMode('ledger');
      return;
    }
    if (wallet < item.price) {
      toast('Chưa đủ Gold cho vật phẩm này', 'error');
      return;
    }
    setOperations((current) => spendRealmGold(current, item, { entryId: crypto.randomUUID() }));
    toast(`Đã gửi yêu cầu đổi ${item.name}`);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const nextProfile = normalizeProfile(profileDraft);
    if (operationsSource === 'erp') {
      try {
        await postRealmErpAction({
          action: 'update-profile',
          profile: { role: nextProfile.role, color: nextProfile.color },
          profileVersion: operationsSyncMeta.profileVersion,
        });
        toast('Đã đồng bộ class và huy hiệu vào hồ sơ ERP');
      } catch (error) {
        toast(error.message || 'Không thể cập nhật hồ sơ ERP.', 'error');
      }
      return;
    }
    setProfile(nextProfile);
    setProfileDraft(nextProfile);
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    toast('Đã cập nhật danh tính trong Realm');
  };

  const sendChat = (event) => {
    event.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    const at = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setMessages((items) => [...items, { id: crypto.randomUUID(), name: profile.name, text, at }]);
    broadcastChat(text, at);
    setChatText('');
  };

  const getTrack = async (kind) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Trình duyệt không hỗ trợ media');
    let stream = mediaRef.current;
    let track = stream?.getTracks().find((item) => item.kind === kind);
    if (!track) {
      const added = await navigator.mediaDevices.getUserMedia({ video: kind === 'video', audio: kind === 'audio' });
      if (!stream) stream = new MediaStream();
      for (const nextTrack of added.getTracks()) stream.addTrack(nextTrack);
      mediaRef.current = stream;
      track = stream.getTracks().find((item) => item.kind === kind);
      if (videoRef.current) videoRef.current.srcObject = stream;
    }
    return track;
  };

  const toggleCamera = async () => {
    try {
      const track = await getTrack('video');
      track.enabled = !cameraOn;
      setCameraOn(track.enabled);
      setMediaRevision((value) => value + 1);
    } catch {
      toast('Không thể mở camera. Hãy cấp quyền trình duyệt rồi thử lại.', 'error');
    }
  };

  const toggleMic = async () => {
    try {
      const track = await getTrack('audio');
      track.enabled = !micOn;
      setMicOn(track.enabled);
      setMediaRevision((value) => value + 1);
    } catch {
      toast('Không thể mở microphone. Hãy cấp quyền trình duyệt rồi thử lại.', 'error');
    }
  };

  const toggleShare = async () => {
    if (sharing) {
      screenRef.current?.getTracks().forEach((track) => track.stop());
      screenRef.current = null;
      setSharing(false);
      setMediaRevision((value) => value + 1);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      screenRef.current = stream;
      setSharing(true);
      setMediaRevision((value) => value + 1);
      stream.getVideoTracks()[0].onended = () => {
        screenRef.current = null;
        setSharing(false);
        setMediaRevision((value) => value + 1);
      };
    } catch {
      toast('Đã hủy hoặc không thể chia sẻ màn hình', 'error');
    }
  };

  const currentRoom = roomAt(position.x, position.y);
  const erpDirectoryPeople = useMemo(
    () => collaborationPeopleForRealm(collaborationDirectory.people),
    [collaborationDirectory.people],
  );
  const realmPeople = useMemo(
    () => mergeRealmPresencePeople({ staff: dataSource.isErp ? erpDirectoryPeople : STAFF, remotePlayers, selfProfile: profile }),
    [dataSource.isErp, erpDirectoryPeople, profile, remotePlayers],
  );
  const worldStaff = useMemo(() => realmPeople.filter((person) => !person.isRemote), [realmPeople]);
  const onlineCount = realmPeople.filter((person) => person.isRemote || person.online || !dataSource.isErp).length + 1;
  const guildDashboard = useMemo(
    () => realmLocalFixture(dataSource, createRealmGuildDemoDashboard({ members: realmPeople, quests, campaigns: CAMPAIGNS })),
    [dataSource, quests, realmPeople],
  );
  const commandDashboard = useMemo(
    () => realmLocalFixture(dataSource, createRealmCommandCenterDemoDashboard({ members: realmPeople, quests })),
    [dataSource, quests, realmPeople],
  );
  const chronicleDashboard = useMemo(
    () => realmLocalFixture(dataSource, createRealmChronicleDemoDashboard({ profile, career, quests, ledger, wallet })),
    [career, dataSource, ledger, profile, quests, wallet],
  );
  const embassyDashboard = useMemo(() => realmLocalFixture(dataSource, createRealmEmbassyDemoDashboard()), [dataSource]);
  const localWarRoom = useMemo(
    () => realmLocalFixture(dataSource, createRealmWarRoomDemoDashboard({ campaign: selectedCampaign || CAMPAIGNS[0], quests })),
    [dataSource, quests, selectedCampaign],
  );
  const selectedPerson = realmPeople.find((person) => person.id === selectedPersonId) || null;

  const selectPerson = useCallback((person) => {
    setSelectedPersonId(person.id);
    setWhisperText('');
    setContactReceipt(null);
    setMode('world');
    setActivePanel('person');
  }, []);

  const moveToSelectedPerson = useCallback(() => {
    if (!selectedPerson) return;
    window.dispatchEvent(new CustomEvent('realm:move', {
      detail: { x: selectedPerson.x, y: selectedPerson.y + 0.9 },
    }));
    toast(`Đang đi tới ${selectedPerson.name}`);
  }, [selectedPerson, toast]);

  const sendWhisperToSelected = useCallback((event) => {
    event.preventDefault();
    if (!selectedPerson?.isRemote) return;
    const text = normalizeRealmText(whisperText);
    if (!text) return;
    const at = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (!broadcastWhisper(selectedPerson.id, text, at)) {
      toast('Chưa gửi được lời thì thầm. Hãy chờ gateway kết nối lại.', 'error');
      return;
    }
    setMessages((items) => [...items, {
      id: crypto.randomUUID(),
      name: profile.name,
      text,
      at,
      private: true,
      targetName: selectedPerson.name,
    }]);
    setWhisperText('');
    toast(`Đã thì thầm với ${selectedPerson.name}`);
  }, [broadcastWhisper, profile.name, selectedPerson, toast, whisperText]);

  const sendContactToSelected = useCallback(async (event) => {
    event.preventDefault();
    const targetUserId = selectedPerson?.userId;
    if (!targetUserId || contactSending) return;
    const message = normalizeRealmText(whisperText);
    setContactSending(true);
    try {
      const idempotencyKey = `contact:${crypto.randomUUID()}`;
      const response = await fetch('/api/collaboration/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ targetUserId, kind: 'chat', sourceSurface: 'realm', message }),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Không thể gửi lời mời tới ERP.');
      setContactReceipt(payload.contact);
      setWhisperText('');
      toast(selectedPerson.online
        ? `${selectedPerson.name} sẽ nhận lời mời ngay trong ERP.`
        : `Đã lưu Lantern Mail cho ${selectedPerson.name}; họ sẽ thấy khi online.`);
    } catch (error) {
      toast(error.message || 'Không thể gửi lời mời tới ERP.', 'error');
    } finally {
      setContactSending(false);
    }
  }, [contactSending, selectedPerson, toast, whisperText]);

  const acceptPartyInvite = useCallback(() => {
    if (!acceptInvite()) return;
    setMode('world');
    setActivePanel('party');
  }, [acceptInvite]);

  const confirmPartyAction = useCallback(() => {
    if (!partyConfirm) return;
    if (partyConfirm.type === 'kick') kickMember(partyConfirm.targetId);
    else leaveParty();
    setPartyConfirm(null);
  }, [kickMember, leaveParty, partyConfirm]);

  useEffect(() => { setPartyConfirm(null); }, [party?.id]);

  const panel = useMemo(() => {
    if (activePanel === 'party') {
      const pendingInvites = party?.pendingInvites || (outgoingInvite ? [{
        targetId: outgoingInvite.targetId,
        targetProfile: outgoingInvite.targetProfile,
      }] : []);
      const memberIds = new Set((party?.members || []).map((member) => member.id));
      const pendingIds = new Set(pendingInvites.map((invite) => invite.targetId));
      const candidates = remotePlayers.filter((person) => !memberIds.has(person.id) && !pendingIds.has(person.id));
      const hostMember = party?.members.find((member) => member.id === party.hostId);
      const hasCapacity = party ? party.members.length + pendingInvites.length < party.maxMembers : true;
      const confirmTarget = partyConfirm?.type === 'kick'
        ? party?.members.find((member) => member.id === partyConfirm.targetId)
        : null;
      return (
        <>
          <PanelHeading eyebrow="Private meeting" title="Party Voice" text="Room nhiều thành viên giữ voice hoạt động ngoài bán kính spatial 5 ô; gateway quản lý host, roster và lời mời." />
          {party ? (
            <>
              <div className={styles.partyStatusCard}>
                <span><Icon name="shield" size={18} /></span>
                <div>
                  <strong>{party.authoritative ? 'Party Room được gateway quản lý' : 'Party local fallback'}</strong>
                  <p>{party.role === 'host' ? 'Bạn là host: có thể mời, loại thành viên hoặc kết thúc room.' : `${hostMember?.profile.name || 'Một thành viên'} đang làm host.`}</p>
                </div>
                <b>{party.members.length}/{party.maxMembers}</b>
              </div>
              <div className={styles.partyRoster} aria-label="Thành viên Party">
                {party.members.map((member) => {
                  const remote = remotePlayers.find((person) => person.id === member.id);
                  const isSelf = member.id === sessionId;
                  const online = isSelf || Boolean(remote);
                  return (
                    <article className={styles.partyMember} key={member.id}>
                      <span className={styles.personAvatar} style={{ '--avatar-color': member.profile.color }}>{initials(member.profile.name)}</span>
                      <span>
                        <strong>{member.profile.name}</strong>
                        <small>{member.id === party.hostId ? 'Host' : 'Member'}{isSelf ? ' · Bạn' : ''}</small>
                      </span>
                      <span className={online ? styles.liveBadge : styles.quietBadge}>{online ? 'Online' : 'Đang nối lại'}</span>
                      {party.role === 'host' && !isSelf && party.authoritative && (
                        <button type="button" className={styles.partyKickButton} onClick={() => setPartyConfirm({ type: 'kick', targetId: member.id })} aria-label={`Loại ${member.profile.name} khỏi Party`}>
                          <Icon name="x" size={15} />Loại
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              {pendingInvites.length > 0 && (
                <section className={styles.partyPendingList} aria-label="Lời mời đang chờ">
                  <strong>Đang chờ phản hồi · {pendingInvites.length}</strong>
                  {pendingInvites.map((inviteState) => (
                    <article className={styles.partyPendingCard} key={inviteState.targetId}>
                      <span className={styles.playerHeroAvatar} style={{ '--avatar-color': inviteState.targetProfile.color }}>{initials(inviteState.targetProfile.name)}</span>
                      <div><strong>{inviteState.targetProfile.name}</strong><p>Đã gửi lời mời; chỗ được giữ đến khi họ phản hồi.</p></div>
                      <button type="button" className={styles.secondaryButton} onClick={() => cancelInvite(inviteState.targetId)}>Thu hồi</button>
                    </article>
                  ))}
                </section>
              )}
              {party.role === 'host' && hasCapacity && candidates.length > 0 && (
                <section className={styles.partyAddMembers} aria-label="Mời thêm thành viên">
                  <strong>Mời thêm thành viên</strong>
                  <div className={styles.partyCandidates}>
                    {candidates.map((person) => (
                      <button type="button" key={person.id} onClick={() => inviteToParty(person)}>
                        <span className={styles.personAvatar} style={{ '--avatar-color': person.color }}>{initials(person.name)}</span>
                        <span><strong>{person.name}</strong><small>{person.role}</small></span>
                        <Icon name="plus" size={17} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
              <div className={styles.connectionNote}>
                <Icon name="phone" size={18} />
                <div>
                  <strong>{mediaTopology === 'sfu' ? sfuMedia.status === 'reconnecting' ? 'LiveKit SFU đang nối lại' : 'LiveKit SFU đang phục vụ Party' : mediaTopology === 'mesh-fallback' ? 'P2P mesh đã tự tiếp quản' : mediaTopology === 'mesh-warming' ? 'Đang làm nóng LiveKit SFU' : party.authoritative ? 'P2P mesh demo đang bật' : 'Party override local'}</strong>
                  <p>{party.media ? mediaTopology === 'mesh-fallback' ? 'Media server chưa sẵn sàng; voice vẫn hoạt động qua mesh và hệ thống sẽ tự thử lại sau 15 giây.' : 'Gateway cấp token ngắn hạn riêng cho từng thành viên; spatial voice ngoài Party vẫn giữ kết nối P2P.' : `Thành viên online được giữ trong voice rail ngoài spatial range. Room tối đa ${party.maxMembers} người.`}</p>
                </div>
              </div>
              {partyConfirm ? (
                <div className={styles.partyConfirmCard} role="alert">
                  <div>
                    <strong>{partyConfirm.type === 'kick' ? `Loại ${confirmTarget?.profile.name || 'thành viên'}?` : party.role === 'host' ? 'Kết thúc Party cho tất cả?' : 'Rời Party này?'}</strong>
                    <p>{partyConfirm.type === 'kick' ? 'Người này sẽ mất voice room ngay lập tức.' : party.role === 'host' ? 'Room, lời mời đang chờ và voice mesh sẽ bị đóng.' : 'Bạn có thể tham gia lại khi host gửi lời mời mới.'}</p>
                  </div>
                  <div className={styles.partyConfirmActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setPartyConfirm(null)}>Hủy</button>
                    <button type="button" className={styles.partyLeaveButton} onClick={confirmPartyAction}>Xác nhận</button>
                  </div>
                </div>
              ) : (
                <button type="button" className={styles.partyLeaveButton} onClick={() => setPartyConfirm({ type: 'leave' })}><Icon name="x" size={17} />{party.role === 'host' ? 'Kết thúc Party' : 'Rời Party'}</button>
              )}
            </>
          ) : outgoingInvite ? (
            <div className={styles.partyPendingCard}>
              <span className={styles.playerHeroAvatar} style={{ '--avatar-color': outgoingInvite.targetProfile.color }}>{initials(outgoingInvite.targetProfile.name)}</span>
              <div><strong>Đang chờ {outgoingInvite.targetProfile.name}</strong><p>Họ có thể chấp nhận hoặc từ chối lời mời. Bạn vẫn dùng spatial voice bình thường trong lúc chờ.</p></div>
              <button type="button" className={styles.secondaryButton} onClick={() => cancelInvite(outgoingInvite.targetId)}>Thu hồi lời mời</button>
            </div>
          ) : (
            <div className={styles.partyEmpty}>
              <span><Icon name="phone" size={24} /></span>
              <h3>Chưa có Party riêng</h3>
              <p>Mời một người chơi online để gateway tạo room. Sau đó host có thể mời thêm tối đa {networkInfo.maxPartySize || 6} thành viên.</p>
              {remotePlayers.length > 0 && (
                <div className={styles.partyCandidates}>
                  {remotePlayers.map((person) => (
                    <button type="button" key={person.id} onClick={() => inviteToParty(person)}>
                      <span className={styles.personAvatar} style={{ '--avatar-color': person.color }}>{initials(person.name)}</span>
                      <span><strong>{person.name}</strong><small>{person.role}</small></span>
                      <Icon name="plus" size={17} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      );
    }

    if (activePanel === 'person' && selectedPerson) {
      const selectedRoom = roomAt(selectedPerson.x, selectedPerson.y);
      const selectedStatus = STATUS[selectedPerson.status] || STATUS.available;
      const tilesAway = Math.round(distance(position, selectedPerson));
      const alreadyInParty = party?.members.some((member) => member.id === selectedPerson.id);
      const pendingForPerson = party?.pendingInvites.some((inviteState) => inviteState.targetId === selectedPerson.id)
        || outgoingInvite?.targetId === selectedPerson.id;
      const partyAtCapacity = party && party.members.length + party.pendingInvites.length >= party.maxMembers;
      const canInviteSelected = !incomingInvite
        && !alreadyInParty
        && !pendingForPerson
        && !outgoingInvite
        && (!party || (party.role === 'host' && !partyAtCapacity));
      const partyActionLabel = alreadyInParty
        ? 'Đang cùng Party Voice'
        : pendingForPerson
          ? 'Đang chờ phản hồi'
          : incomingInvite
            ? 'Hãy xử lý lời mời đang chờ'
            : party?.role === 'member'
              ? 'Chỉ host có thể mời'
              : partyAtCapacity
                ? 'Party đã đầy'
                : outgoingInvite
                  ? 'Đang chờ lời mời khác'
                  : 'Mời vào Party Voice';
      return (
        <>
          <PanelHeading
            eyebrow="Player interaction"
            title={selectedPerson.name}
            text={`${selectedPerson.role} · ${selectedPerson.isRemote ? 'Đang ở trong Realm' : selectedPerson.isErpDirectory ? selectedPerson.online ? `Đang online tại ${(selectedPerson.surfaces || []).map((surface) => surface === 'realm' ? 'Realm' : 'ERP').join(' + ')}` : 'Nhân sự ERP · hiện đang offline' : 'Người chơi Realm'}`}
          />
          <div className={styles.playerHero}>
            <span className={styles.playerHeroAvatar} style={{ '--avatar-color': selectedPerson.color }}>{initials(selectedPerson.name)}</span>
            <div>
              <strong>{selectedStatus.label}</strong>
              <span>{selectedRoom?.name || 'Hành lang lâu đài'} · cách {tilesAway} ô</span>
            </div>
          </div>
          <div className={styles.playerActions}>
            <button type="button" className={styles.primaryButton} onClick={moveToSelectedPerson}><Icon name="meeting" size={17} />Đi tới</button>
            <button type="button" className={styles.secondaryButton} onClick={() => triggerEmote('wave', selectedPerson.isRemote ? selectedPerson.id : undefined)}><b>HI</b>Vẫy chào</button>
          </div>
          {selectedPerson.isRemote && (
            <button
              type="button"
              className={styles.partyActionButton}
              disabled={!canInviteSelected}
              onClick={() => inviteToParty(selectedPerson)}
            >
              <Icon name="phone" size={17} />
              {partyActionLabel}
            </button>
          )}
          {selectedPerson.isRemote ? (
            <form className={styles.whisperForm} onSubmit={sendWhisperToSelected}>
              <label htmlFor="realm-whisper">Thì thầm riêng</label>
              <p>Chỉ {selectedPerson.name} nhận được tin nhắn này.</p>
              <div>
                <input id="realm-whisper" value={whisperText} maxLength={500} onChange={(event) => setWhisperText(event.target.value)} placeholder="Viết lời nhắn riêng…" />
                <button type="submit" aria-label={`Gửi lời thì thầm tới ${selectedPerson.name}`}><Icon name="mail" size={17} /></button>
              </div>
            </form>
          ) : selectedPerson.isErpDirectory ? (
            <>
              <form className={styles.whisperForm} aria-busy={contactSending || undefined} onSubmit={sendContactToSelected}>
                <label htmlFor="realm-erp-contact">Gõ cửa ERP</label>
                <p>{selectedPerson.online
                  ? `${selectedPerson.name} đang online nhưng không cần mở Realm để nhận lời mời.`
                  : 'Người nhận đang offline; lời nhắn vẫn được lưu trong Notification và Lantern Mail.'}</p>
                <div>
                  <input
                    id="realm-erp-contact"
                    value={whisperText}
                    maxLength={280}
                    onChange={(event) => setWhisperText(event.target.value)}
                    placeholder="Bạn muốn trao đổi việc gì?"
                  />
                  <button type="submit" disabled={contactSending} aria-label={`Gửi lời mời tới ${selectedPerson.name} trong ERP`}>
                    <Icon name="meeting" size={17} />
                  </button>
                </div>
              </form>
              {contactReceipt && (
                <div className={styles.contactReceipt} role="status">
                  <Icon name="check" size={17} />
                  <div>
                    <strong>Đã chuyển tới ERP · CRM</strong>
                    <p>Yêu cầu đang chờ {selectedPerson.name} phản hồi. Tin nhắn đã được ghi vào hội thoại chuẩn.</p>
                    <Link href={contactReceipt.route || '/messages'} onClick={() => rememberWorkspaceSurface('erp')}>Mở Lantern Mail</Link>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className={styles.connectionNote}>
              <Icon name="staff" size={18} />
              <div><strong>Hồ sơ demo</strong><p>Khi nối dữ liệu ERP, khu vực này sẽ mở hồ sơ nhân sự theo đúng RBAC hiện hữu.</p></div>
            </div>
          )}
        </>
      );
    }

    if (activePanel === 'profile') return (
      <>
        <PanelHeading eyebrow="Player identity" title="Hồ sơ nhân vật" text={dataSource.isErp
          ? 'Tên lấy từ hồ sơ nhân sự ERP; class và huy hiệu được lưu vào cùng tài khoản Realm.'
          : 'Danh tính này được lưu trong trình duyệt demo và phát cho người chơi thuộc cùng Realm/map.'} />
        <form className={styles.profileForm} aria-busy={operationsSyncState === 'syncing' || undefined} onSubmit={saveProfile}>
          <div className={styles.profilePreview}>
            <span className={styles.profileAvatar} style={{ '--avatar-color': profileDraft.color }}>
              <span className={styles.portraitFallback}>{initials(profileDraft.name || DEFAULT_PROFILE.name)}</span>
              <img className={styles.portraitImage} src={realmGeneratedCharacterPortraitUrl(profileDraft.name || DEFAULT_PROFILE.name)} alt="" aria-hidden="true" />
            </span>
            <span><strong>{profileDraft.name || DEFAULT_PROFILE.name}</strong><small>{profileDraft.role}</small></span>
          </div>
          <label htmlFor="realm-profile-name">Tên hiển thị</label>
          <input id="realm-profile-name" maxLength={40} required readOnly={operationsSource === 'erp'} value={profileDraft.name} onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))} />
          {operationsSource === 'erp' && <small className={styles.fieldNote}>Tên hiển thị được quản lý từ hồ sơ nhân sự ERP.</small>}
          <label htmlFor="realm-profile-role">Class trong Realm</label>
          <select id="realm-profile-role" value={profileDraft.role} onChange={(event) => setProfileDraft((current) => ({ ...current, role: event.target.value }))}>
            {PROFILE_ROLES.map((role) => <option value={role} key={role}>{role}</option>)}
          </select>
          <label htmlFor="realm-profile-color">Màu huy hiệu</label>
          <div className={styles.colorField}>
            <input id="realm-profile-color" type="color" value={profileDraft.color} onChange={(event) => setProfileDraft((current) => ({ ...current, color: event.target.value }))} />
            <code>{profileDraft.color}</code>
          </div>
          <button type="submit" className={styles.primaryButton} disabled={operationsSyncState === 'syncing'}>{operationsSyncState === 'syncing' ? 'Đang đồng bộ…' : 'Lưu hồ sơ'}</button>
        </form>
        <div className={styles.connectionNote}>
          <Icon name="shield" size={18} />
          <div>
            <strong>{transportState === 'gateway-ready' ? 'Gateway đa máy đã xác thực' : dataSource.isErp ? 'Kênh realtime đang dùng fallback cục bộ' : 'Session demo riêng tư'}</strong>
            <p>Realm {networkInfo.realmId} · Map {networkInfo.mapId} · {TRANSPORT[transportState]?.short || 'Solo mode'}. ID tạm thời: {sessionId.slice(0, 8)}…</p>
          </div>
        </div>
      </>
    );

    if (activePanel === 'command') return (
      <RoyalCommandCenter
        compact
        operationsSource={operationsSource}
        localDashboard={commandDashboard}
        dataRevision={realmDataRevision}
      />
    );

    if (activePanel === 'quests') return (
      <>
        <PanelHeading eyebrow="Quest Board" title="Nhiệm vụ hôm nay" text="Gold chỉ được ghi khi nhiệm vụ đủ tiêu chí và qua bước duyệt." />
        <div className={styles.stack}>
          {!quests.length && <div className={styles.connectionNote}><Icon name="tasks" size={18} /><div><strong>Chưa có Quest trong phạm vi của bạn</strong><p>{operationsSyncState === 'connecting' ? 'Đang đồng bộ Task từ ERP…' : 'Realm chỉ hiển thị Task được giao trong ERP; không chèn nhiệm vụ mẫu.'}</p></div></div>}
          {quests.map((quest) => (
            <article className={styles.questCard} key={quest.id}>
              <div className={styles.questTop}>
                <span className={styles.priority}>{quest.priority}</span>
                <Gold amount={quest.reward} />
              </div>
              <h3>{quest.title}</h3>
              <p>{quest.project} · Duyệt bởi {quest.reviewer}</p>
              <div className={styles.progressLabel}><span>{quest.progress}/{quest.total} tiêu chí</span><span>{quest.due}</span></div>
              <div className={styles.progress}><i style={{ width: `${quest.progress / quest.total * 100}%` }} /></div>
              {quest.status === 'ready' && <button type="button" className={styles.primaryButton} disabled={operationsSyncState === 'syncing'} onClick={() => claimQuest(quest)}>Nhận {quest.reward} Gold</button>}
              {quest.status === 'active' && (operationsSource === 'erp'
                ? <Link className={styles.secondaryButton} href={quest.links?.task || realmRecordHref('task', quest.businessRef)}>Mở Task ERP</Link>
                : <button type="button" className={styles.secondaryButton} onClick={() => advanceQuest(quest)}>Cập nhật tiến độ demo</button>)}
              {quest.status === 'claimed' && <span className={styles.claimed}><Icon name="check" size={15} /> Đã ghi vào sổ Gold</span>}
            </article>
          ))}
        </div>
      </>
    );

    if (activePanel === 'campaigns') return (
      <WarRoom
        compact
        operationsSource={operationsSource}
        projectId={operationsSource === 'erp' ? selectedCampaign?.id : (selectedCampaign || CAMPAIGNS[0]).id}
        localDashboard={localWarRoom}
        onBack={() => setActivePanel('guild')}
        onOpenProject={() => window.location.assign(realmRecordHref('project', selectedCampaign?.id))}
        onOpenTask={(task) => window.location.assign(realmRecordHref('task', task.id))}
        dataRevision={realmDataRevision}
      />
    );

    if (activePanel === 'guild') return (
      <>
        <GuildHall
          compact
          operationsSource={operationsSource}
          localDashboard={guildDashboard}
          presence={realmPeople}
          onSelectMember={(member) => {
            const person = realmPeople.find((item) => item.id === member.id || item.name === member.name);
            if (person) selectPerson(person);
            else if (operationsSource === 'erp') window.location.assign(realmRecordHref('staff', member.id));
          }}
          onOpenCampaign={realmAccessForPanel(businessBridge?.access, 'campaigns').allowed
            ? (campaign) => openAuthorizedPanel('campaigns', { campaign })
            : undefined}
          onOpenEmbassy={realmAccessForPanel(businessBridge?.access, 'embassy').allowed
            ? () => openAuthorizedPanel('embassy')
            : undefined}
          dataRevision={realmDataRevision}
        />
      </>
    );

    if (activePanel === 'embassy') return (
      <RoyalEmbassy
        compact
        operationsSource={operationsSource}
        localDashboard={embassyDashboard}
        onBack={() => setActivePanel('guild')}
        onOpenLeads={() => window.location.assign('/leads')}
        onOpenLead={(lead) => window.location.assign(realmRecordHref('lead', lead.id))}
        onOpenClient={(client) => window.location.assign(realmRecordHref('client', client.id))}
        dataRevision={realmDataRevision}
      />
    );

    if (activePanel === 'treasury') return (
      <section className={styles.treasurySurface} data-realm-business-surface="treasury">
        <PanelHeading eyebrow="Royal Treasury" title="Ví & sổ Gold" text="Wallet dùng để đổi vật phẩm; lịch sử Gold đã kiếm không bị giảm khi chi tiêu." />
        <div className={styles.balanceCard}><span>Gold khả dụng</span><strong>{wallet}</strong><small>Renown mùa này: {career.renown.toLocaleString('vi-VN')} XP · Level {career.level}</small></div>
        <LedgerList ledger={ledger} />
      </section>
    );

    if (activePanel === 'shop' && operationsSource === 'erp') return (
      <RoyalTreasuryExchange
        operationsSource={operationsSource}
        localDashboard={treasuryDashboard}
        onLocalDashboardChange={handleLocalTreasuryChange}
        onOperationsRefresh={refreshRealmOperations}
        dataRevision={realmDataRevision}
      />
    );

    if (activePanel === 'shop') return (
      <>
        <PanelHeading eyebrow="Arcane Forge" title="Đổi vật phẩm" text="Demo ưu tiên cosmetic và quyền lợi nhỏ; không đổi lương hay phép luật định." />
        <div className={styles.stack}>
          {SHOP_ITEMS.map((item) => (
            <article className={styles.shopCard} key={item.id}>
              <span className={styles.itemGlyph}><Icon name={item.kind === 'benefit' ? 'calendar' : 'shield'} size={20} /></span>
              <div><strong>{item.name}</strong><p>{item.note}</p></div>
              <button type="button" onClick={() => buyItem(item)} aria-label={`Đổi ${item.name} với giá ${item.price} Gold`}><Gold amount={item.price} /></button>
            </article>
          ))}
        </div>
      </>
    );

    if (activePanel === 'chat') return (
      <>
        <PanelHeading
          eyebrow="Lantern Commons"
          title="Chat khu vực"
          text={transportState === 'gateway-ready'
            ? 'Tin nhắn và WebRTC signaling đang đi qua gateway đa máy có token xác thực.'
            : transportState === 'local-ready'
              ? 'Gateway chưa sẵn sàng; Lantern Chat đang dùng BroadcastChannel cục bộ để không gián đoạn demo.'
              : 'Lantern Chat đang kết nối lại kênh chat và WebRTC signaling.'}
        />
        <div className={styles.chatLog} aria-live="polite">
          {!messages.length && <div className={styles.connectionNote}><Icon name="meeting" size={18} /><div><strong>Lantern Commons chưa có tin nhắn</strong><p>Realm không chèn hội thoại mẫu vào workspace ERP. Hãy gửi tin đầu tiên hoặc dùng Lantern Mail để lưu trao đổi nghiệp vụ.</p></div></div>}
          {messages.map((message) => (
            <div className={styles.chatMessage} key={message.id}>
              <span className={styles.personAvatar}>{initials(message.name)}</span>
              <div><strong>{message.name}<small>{message.at}</small></strong>{message.private && <span className={styles.whisperBadge}>{message.targetName ? `Tới ${message.targetName}` : 'Thì thầm riêng'}</span>}<p>{message.text}</p></div>
            </div>
          ))}
        </div>
        <form className={styles.chatForm} onSubmit={sendChat}>
          <label htmlFor="realm-chat">Nhắn vào Tavern</label>
          <div><input id="realm-chat" value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Viết tin nhắn..." /><button type="submit" aria-label="Gửi tin nhắn"><Icon name="check" size={17} /></button></div>
        </form>
      </>
    );

    return (
      <>
        <PanelHeading eyebrow="Daily briefing" title={`Chào mừng trở lại, ${profile.name}`} text="Văn phòng là bản đồ sống của CRMegoric: người, công việc và cuộc trò chuyện cùng tồn tại trong một ngữ cảnh." />
        <div className={styles.briefGrid}>
          <div><span>Vị trí</span><strong>{currentRoom?.name || 'Hành lang lâu đài'}</strong></div>
          <div><span>Trong tầm thoại</span><strong>{`${nearby.length} đồng đội`}</strong></div>
          <div><span>Quest sẵn sàng</span><strong>{`${quests.filter((quest) => quest.status === 'ready').length} nhiệm vụ`}</strong></div>
          <div><span>Nhân vật</span><strong>Level {career.level} · {wallet} Gold</strong></div>
        </div>
        <div className={styles.notice}>
          <Icon name="tasks" size={18} />
          <div><strong>Ưu tiên tiếp theo</strong><p>{quests[0]
            ? `${quests[0].title} · ${quests[0].project}`
            : dataSource.isErp
              ? 'Chưa có Task ERP nào được giao cho bạn.'
              : 'Đến Quest Board ở Great Hall để nhận thưởng cho chiến dịch Rồng Xanh.'}</p></div>
          <button type="button" onClick={() => moveToObject('quests')}>Đi tới</button>
        </div>
        <div className={styles.controlsHelp}>
          <strong>Cách di chuyển</strong>
          <p>Dùng WASD, phím mũi tên, cụm nút điều khiển hoặc nhấp vào vị trí trên bản đồ. Khi đứng gần object, nhấn E để mở.</p>
        </div>
      </>
    );
  }, [activePanel, businessBridge, cancelInvite, career.level, career.renown, chatText, commandDashboard, confirmPartyAction, contactReceipt, contactSending, currentRoom?.name, dataSource.isErp, embassyDashboard, guildDashboard, handleLocalTreasuryChange, incomingInvite, inviteToParty, ledger, localWarRoom, mediaTopology, messages, moveToSelectedPerson, nearby.length, networkInfo, onlineCount, openAuthorizedPanel, operationsSource, operationsSyncState, outgoingInvite, party, partyConfirm, position, profile.color, profile.name, profileDraft, quests, realmDataRevision, realmPeople, refreshRealmOperations, remotePlayers, selectPerson, selectedCampaign, selectedPerson, sendContactToSelected, sendWhisperToSelected, sessionId, sfuMedia.status, transportState, treasuryDashboard, triggerEmote, wallet, whisperText]);

  return (
    <main
      className={`${styles.realmShell} ${mode === 'ledger' ? styles.ledgerShell : ''}`}
      data-realm-ui-art={uiArtState}
      style={UI_ART_REQUESTED ? GENERATED_UI_ART_STYLE : undefined}
    >
      <a className={styles.skipLink} href="#realm-main-content">Bỏ qua điều hướng, tới nội dung Realm</a>
      <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">{navigationAnnouncement}</span>
      <header className={styles.topbar}>
        <div className={styles.brandCompact}>
          <span className={styles.brandShield}><Icon name="shield" size={20} /></span>
          <span><strong>CRMegoric Realms</strong><small>Virtual Medieval Office · {workspaceLabel}</small></span>
        </div>
        <div className={styles.topbarCenter}>
          <button type="button" className={mode === 'world' ? styles.activeMode : ''} onClick={() => setMode('world')} aria-pressed={mode === 'world'}><Icon name="dashboard" size={16} />Realm</button>
          {erpHref && <Link className={styles.erpGateway} href={erpHref} onClick={handoffToErp} aria-label="Mở workspace ERP CRM gốc" title="Mở đầy đủ menu và chức năng ERP · CRM" aria-busy={erpHandoffState === 'loading' || undefined}><Icon name="reports" size={16} />{erpHandoffState === 'loading' ? 'Đang mở…' : 'ERP · CRM'}</Link>}
          <button type="button" className={mode === 'ledger' ? styles.activeMode : ''} onClick={() => setMode('ledger')} aria-pressed={mode === 'ledger'} title="Sổ gamified chỉ thuộc Realm"><Icon name="wallet" size={16} />Sổ Realm</button>
        </div>
        <div className={styles.topbarRight}>
          <LanguageSwitch compact className={styles.realmLanguageSwitch} />
          {dataSource.isErp && <span className={`${styles.feedBadge} ${styles[`feedBadge_${changeFeed.state}`] || ''}`} title={`ERP change-feed · ${changeFeed.eventCount} sự kiện đã nhận`} aria-label={`ERP change-feed ${changeFeed.state}`}><i />{changeFeed.state === 'ready' ? 'ERP live' : changeFeed.state === 'connecting' ? 'Đang nối' : 'Feed chậm'}</span>}
          {dataSource.isErp && <RealmNotificationBell dataRevision={realmDataRevision} />}
          <label className={styles.statusSelect}>
            <span className={styles.statusDot} style={{ '--status-color': STATUS[playerStatus].color }} />
            <select value={playerStatus} onChange={(event) => {
              const nextStatus = rememberCollaborationAvailability(event.target.value);
              setPlayerStatus(nextStatus);
            }} aria-label="Trạng thái hiện diện">
              {Object.entries(STATUS).map(([value, item]) => <option value={value} key={value}>{item.label}</option>)}
            </select>
          </label>
          <span className={styles.walletPill}><Gold amount={wallet} /></span>
        </div>
      </header>

      {incomingInvite && (
        <section className={styles.partyInviteBanner} role="alertdialog" aria-labelledby="party-invite-title" aria-describedby="party-invite-copy">
          <span className={styles.partyInviteIcon}><Icon name="phone" size={22} /></span>
          <div>
            <strong id="party-invite-title">{incomingInvite.hostProfile.name} mời bạn vào Party Voice</strong>
            <p id="party-invite-copy">Room hiện có {incomingInvite.memberCount}/{incomingInvite.maxMembers} người và giữ voice hoạt động khi bạn sang phòng khác.</p>
          </div>
          <div className={styles.partyInviteActions}>
            <button type="button" className={styles.inviteDecline} onClick={declineInvite}>Từ chối</button>
            <button type="button" className={styles.inviteAccept} onClick={acceptPartyInvite}>Tham gia</button>
          </div>
        </section>
      )}

      <div className={styles.appGrid}>
        <aside className={styles.sidebar} aria-label="Điều hướng Realm">
          <button type="button" className={`${styles.profileCard} ${activePanel === 'profile' ? styles.profileCardActive : ''}`} onClick={() => { setMode('world'); setActivePanel('profile'); }}>
            <span className={styles.profileAvatar} style={{ '--avatar-color': profile.color }}>
              <span className={styles.portraitFallback}>{initials(profile.name)}</span>
              <img className={styles.portraitImage} src={realmGeneratedCharacterPortraitUrl(profile.name || DEFAULT_PROFILE.name)} alt="" aria-hidden="true" />
            </span>
            <span><strong>{profile.name}</strong><small>Level {career.level} · {profile.role}</small></span>
            <Icon name="settings" size={15} />
          </button>
          <label className={styles.mobileNavigator} htmlFor="realm-mobile-destination">
            <span><Icon name="dashboard" size={17} />Khu vực</span>
            <select id="realm-mobile-destination" value={mode === 'ledger' ? `ledger:${ledgerView}` : `world:${activePanel}`} onChange={(event) => {
              const [nextMode, destination] = event.target.value.split(':');
              if (nextMode === 'ledger') {
                setMode('ledger');
                setLedgerView(destination || 'personal');
              } else {
                moveToObject(destination || 'briefing');
              }
            }}>
              {realmNav.map((item) => {
                const access = realmAccessForPanel(businessBridge?.access, item.id);
                return <option key={item.id} value={`world:${item.id}`} disabled={!access.allowed}>{item.label}{!access.allowed ? ' · khóa' : ''}</option>;
              })}
              <option value="world:profile">Hồ sơ nhân vật</option>
              {mode === 'world' && !realmNav.some((item) => item.id === activePanel) && activePanel !== 'profile' && (
                <option value={`world:${activePanel}`} disabled>Ngữ cảnh đang mở</option>
              )}
              <option value="ledger:personal">Sổ nhân vật</option>
              <option value="ledger:guild">Guild Hall · Sổ Realm</option>
              {tavernEnabled && <option value="ledger:treasury">Tavern · Sổ Realm</option>}
            </select>
          </label>
          <nav>
            <span className={styles.navLabel}>Vương quốc</span>
            {realmNav.map((item) => {
              const access = realmAccessForPanel(businessBridge?.access, item.id);
              return (
                <button type="button" key={item.id} disabled={!access.allowed} title={!access.allowed ? access.reason : undefined}
                  className={activePanel === item.id && mode === 'world' ? styles.navActive : ''} onClick={() => moveToObject(item.id)}>
                  <Icon name={item.icon} size={18} /><span>{item.label}</span>
                  {!access.allowed && <b className={styles.navLock} aria-label="Không khả dụng"><Icon name="shield" size={12} /></b>}
                  {access.allowed && item.id === 'quests' && <b>{quests.filter((quest) => quest.status !== 'claimed').length}</b>}
                  {access.allowed && item.id === 'party' && (party || incomingInvite || outgoingInvite) && <b>{party ? party.members.length : '1'}</b>}
                </button>
              );
            })}
            <span className={styles.navLabel}>Hệ thống</span>
            <button type="button" className={activePanel === 'profile' && mode === 'world' ? styles.navActive : ''} onClick={() => { setMode('world'); setActivePanel('profile'); }}><Icon name="staff" size={18} /><span>Hồ sơ nhân vật</span></button>
            {erpHref && <Link href={erpHref} onClick={handoffToErp} aria-busy={erpHandoffState === 'loading' || undefined}><Icon name="reports" size={18} /><span>{erpHandoffState === 'loading' ? 'Đang mở ERP · CRM…' : 'Mở ERP · CRM gốc'}</span></Link>}
            <button type="button" className={mode === 'ledger' ? styles.navActive : ''} onClick={() => setMode('ledger')} title="Giao diện gamified, không thay thế ERP"><Icon name="wallet" size={18} /><span>{tavernEnabled ? 'Sổ Realm & Tavern' : 'Sổ Realm'}</span></button>
          </nav>
          <div className={styles.onlineSummary}><span><i />{onlineCount} online</span><small>{TRANSPORT[transportState]?.short || 'Solo mode'}</small></div>
        </aside>

        <section id="realm-main-content" ref={mainStageRef} tabIndex={-1} className={styles.mainStage}>
          {mode === 'world' ? (
            <>
              <div className={styles.worldTopline}>
                <div><span className={styles.eyebrow}>Bạn đang ở</span><h1>{currentRoom?.name || 'Hành lang lâu đài'}</h1></div>
                <div className={styles.worldToplineActions}>
                  <label className={styles.mapStylePicker}>
                    <Icon name="settings" size={17} />
                    <span><small>Cảnh quan</small><select value={mapStyle} onChange={changeMapStyle} aria-label="Đổi phong cách bản đồ lâu đài">
                      {REALM_MAP_STYLES.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select></span>
                  </label>
                  <div className={styles.zoneInfo}><Icon name={privateZone || party ? 'shield' : 'meeting'} size={17} /><span>{party ? 'Party Voice: kết nối xuyên phòng' : privateZone ? `Phòng riêng: ${privateZone.name}` : 'Spatial audio: bán kính 5 ô'}</span></div>
                </div>
              </div>
              <WorldCanvas
                onObjectOpen={openObject}
                onEmote={triggerEmote}
                activePanel={activePanel}
                playerStatus={playerStatus}
                playerProfile={profile}
                onPosition={handlePosition}
                onNearby={handleNearby}
                staff={worldStaff}
                remotePlayers={remotePlayers}
                activeEmotes={activeEmotes}
                sessionId={sessionId}
                mapStyle={mapStyle}
                position={position}
              />
              {activeObject && (
                <button type="button" className={styles.interactPrompt} onClick={() => openObject(activeObject)}>
                  <kbd>E</kbd><span><strong>{activeObject.name}</strong><small>{activeObject.hint}</small></span>
                </button>
              )}
              <MediaDock
                nearby={voiceNearby}
                cameraOn={cameraOn}
                micOn={micOn}
                sharing={sharing}
                videoRef={videoRef}
                profile={profile}
                transportState={transportState}
                remoteStreams={remoteStreams}
                connectionStates={connectionStates}
                mediaSupported={mediaSupported}
                party={party}
                mediaTopology={mediaTopology}
                mediaStatus={sfuMedia.status}
                onCamera={toggleCamera}
                onMic={toggleMic}
                onShare={toggleShare}
                onPerson={selectPerson}
              />
            </>
          ) : (
            <LedgerMode
              profile={profile}
              playerStatus={playerStatus}
              career={career}
              quests={quests}
              ledger={ledger}
              staff={realmPeople}
              wallet={wallet}
              onAdvanceQuest={advanceQuest}
              onClaimQuest={claimQuest}
              operationsSource={operationsSource}
              operationsSyncState={operationsSyncState}
              operationsSyncMeta={operationsSyncMeta}
              rewardDashboard={rewardDashboard}
              onRewardDashboardChange={setRewardDashboard}
              onRewardChanged={handleRewardChanged}
              treasuryDashboard={treasuryDashboard}
              onTreasuryDashboardChange={handleLocalTreasuryChange}
              onOperationsRefresh={refreshRealmOperations}
              onCopySupportId={copyRealmSupportId}
              guildDashboard={guildDashboard}
              commandDashboard={commandDashboard}
              chronicleDashboard={chronicleDashboard}
              guildPresence={realmPeople}
              embassyDashboard={embassyDashboard}
              businessBridge={businessBridge}
              dataRevision={realmDataRevision}
              ledgerView={ledgerView}
              onLedgerViewChange={setLedgerView}
            />
          )}
        </section>

        <aside ref={inspectorRef} tabIndex={-1} className={styles.inspector} aria-label="Bảng thông tin CRMegoric">
          <div className={styles.inspectorScroll}>{mode === 'ledger'
            ? <CharacterDossier profile={profile} playerStatus={playerStatus} career={career} wallet={wallet} operationsSource={operationsSource} operationsSyncState={operationsSyncState} operationsSyncMeta={operationsSyncMeta} businessBridge={businessBridge} onOperationsRefresh={refreshRealmOperations} onCopySupportId={copyRealmSupportId} onOpenRealm={() => { setMode('world'); setActivePanel('briefing'); }} />
            : panel}</div>
        </aside>
      </div>
    </main>
  );
}

function PanelHeading({ eyebrow, title, text }) {
  return <header className={styles.panelHeading}><span>{eyebrow}</span><h2>{title}</h2><p>{text}</p></header>;
}

function Gold({ amount }) {
  return <span className={styles.gold}><i>G</i><b>{amount}</b></span>;
}

function LedgerList({ ledger }) {
  return (
    <div className={styles.ledgerList}>
      {ledger.map((entry) => (
        <div key={entry.id}><span><strong>{entry.label}</strong><small>{entry.at}</small></span><b className={entry.amount > 0 ? styles.earn : entry.amount < 0 ? styles.spend : styles.neutral}>{entry.amount > 0 ? '+' : ''}{entry.amount} G</b></div>
      ))}
    </div>
  );
}

function formatRealmSyncTime(value) {
  if (!value) return 'chưa có';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'không xác định';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function operationsSyncCopy(source, state, meta = EMPTY_SYNC_META) {
  if (state === 'connecting') return { icon: 'clock', label: 'Đang kết nối ERP…', tone: 'pending' };
  if (state === 'checking') return { icon: 'repeat', label: 'Đang kiểm tra dữ liệu mới…', tone: 'pending' };
  if (state === 'syncing') return { icon: 'repeat', label: 'Đang ghi vào ERP…', tone: 'pending' };
  if (state === 'offline') return { icon: 'alert', label: 'Ngoại tuyến · giữ snapshot gần nhất', tone: 'warning' };
  if (state === 'stale' || state === 'error') return { icon: 'alert', label: 'Snapshot có thể cũ · cần thử lại', tone: 'warning' };
  if (state === 'fallback') return { icon: 'alert', label: 'Local fallback · không ghi DB', tone: 'warning' };
  if (source === 'erp') return { icon: 'check', label: `ERP live · rev ${String(meta.revision || '').slice(0, 8) || 'đã xác thực'}`, tone: 'ready' };
  return { icon: 'shield', label: 'Demo cục bộ · không ghi DB', tone: 'local' };
}

function SyncIntegrityCard({ source, state, meta, onRefresh, onCopySupportId, compact = false }) {
  if (!ERP_SYNC_REQUESTED && source !== 'erp') return null;
  const sync = operationsSyncCopy(source, state, meta);
  const busy = ['connecting', 'checking', 'syncing'].includes(state);
  const canRefresh = source === 'erp' || ['fallback', 'stale', 'offline', 'error'].includes(state);
  const hasRemoteSnapshot = source === 'erp' && meta?.revision;
  const preservation = hasRemoteSnapshot
    ? 'Snapshot ERP gần nhất được giữ nguyên; hệ thống không thay bằng dữ liệu demo.'
    : 'Đang hiển thị dữ liệu demo cục bộ; mọi thay đổi tại đây không được ghi vào ERP.';
  const detail = meta?.error?.message
    ? `${meta.error.message} ${preservation}`
    : hasRemoteSnapshot
      ? `ERP tạo lúc ${formatRealmSyncTime(meta.serverGeneratedAt)} · kiểm tra lúc ${formatRealmSyncTime(meta.lastCheckedAt)} · revision ${meta.revision.slice(0, 12)}`
      : preservation;
  return (
    <section className={`${styles.syncIntegrity} ${styles[`syncIntegrity_${sync.tone}`] || ''} ${compact ? styles.syncIntegrityCompact : ''}`} aria-label="Tình trạng đồng bộ Realm với ERP" aria-live="polite">
      <span className={styles.syncIntegrityIcon}><Icon name={sync.icon} size={18} /></span>
      <div>
        <strong>{sync.label}</strong><small>{detail}</small>
        {meta?.requestId && <small className={styles.syncTrace}>Mã hỗ trợ <code>{meta.requestId}</code>{meta.latencyMs !== null ? ` · ${meta.latencyMs} ms` : ''}</small>}
      </div>
      <div className={styles.syncIntegrityActions}>
        {canRefresh && onRefresh && <button type="button" disabled={busy} onClick={onRefresh}><Icon name="repeat" size={15} />{busy ? 'Đang kiểm tra' : 'Thử đồng bộ'}</button>}
        {meta?.requestId && onCopySupportId && <button type="button" aria-label={`Copy mã hỗ trợ ${meta.requestId}`} onClick={() => onCopySupportId(meta.requestId)}><Icon name="note" size={15} />Copy mã</button>}
      </div>
    </section>
  );
}

function LedgerMode({
  profile,
  playerStatus,
  career,
  quests,
  ledger,
  staff,
  wallet,
  onAdvanceQuest,
  onClaimQuest,
  operationsSource,
  operationsSyncState,
  operationsSyncMeta,
  rewardDashboard,
  onRewardDashboardChange,
  onRewardChanged,
  treasuryDashboard,
  onTreasuryDashboardChange,
  onOperationsRefresh,
  onCopySupportId,
  guildDashboard,
  commandDashboard,
  chronicleDashboard,
  guildPresence,
  embassyDashboard,
  businessBridge,
  dataRevision = 0,
  ledgerView,
  onLedgerViewChange,
}) {
  const status = STATUS[playerStatus] || STATUS.available;
  const sync = operationsSyncCopy(operationsSource, operationsSyncState, operationsSyncMeta);
  const [warRoomCampaign, setWarRoomCampaign] = useState(null);
  const [embassyOpen, setEmbassyOpen] = useState(false);
  const accessManifest = businessBridge?.access;
  const ledgerTabs = [
    { key: 'personal', label: 'Sổ nhân vật', icon: 'staff' },
    { key: 'command', label: 'Royal Command', icon: 'shield' },
    { key: 'guild', label: 'Guild Hall', icon: 'projects' },
    { key: 'rewards', label: 'Hội đồng Gold', icon: 'shield' },
    { key: 'economy', label: 'Đài quan sát Gold', icon: 'reports' },
    { key: 'treasury', label: 'Tavern', icon: 'wallet' },
  ];
  const grantedSurfaces = Object.values(accessManifest?.surfaces || {}).filter((item) => item.allowed).length;
  const totalSurfaces = Object.keys(accessManifest?.surfaces || {}).length;
  const ledgerWarRoom = useMemo(
    () => warRoomCampaign ? createRealmWarRoomDemoDashboard({ campaign: warRoomCampaign, quests }) : null,
    [quests, warRoomCampaign],
  );
  useEffect(() => {
    if (!realmAccessForSurface(accessManifest, ledgerView).allowed) {
      onLedgerViewChange('personal');
      setWarRoomCampaign(null);
      setEmbassyOpen(false);
    }
  }, [accessManifest, ledgerView, onLedgerViewChange]);
  return (
    <div className={styles.ledgerMode}>
      <header className={styles.ledgerHero}>
        <div>
          <span className={styles.eyebrow}>Royal operations · ERP & CRM</span>
          <h1>Sổ điều hành CRMegoric</h1>
          <p>Cùng một nguồn dữ liệu với Realm: công việc là Quest, phần thưởng đi vào Gold journal và hồ sơ nhân sự trở thành trạng thái nhân vật.</p>
        </div>
        <span className={`${styles.syncBadge} ${styles[`syncBadge_${sync.tone}`] || ''}`} aria-live="polite"><Icon name={sync.icon} size={16} /> {sync.label}</span>
      </header>

      <nav className={styles.ledgerViewTabs} aria-label="Chọn khu vực điều hành ERP">
        {ledgerTabs.map((tab) => {
          const access = realmAccessForSurface(accessManifest, tab.key);
          return <button type="button" key={tab.key} disabled={!access.allowed} title={!access.allowed ? access.reason : undefined}
            aria-pressed={ledgerView === tab.key} className={ledgerView === tab.key ? styles.ledgerViewActive : ''}
            onClick={() => { onLedgerViewChange(tab.key); if (tab.key === 'guild') { setWarRoomCampaign(null); setEmbassyOpen(false); } }}>
            <Icon name={tab.icon} size={16} />{tab.label}{!access.allowed && <Icon name="shield" size={12} />}
          </button>;
        })}
      </nav>

      <SyncIntegrityCard source={operationsSource} state={operationsSyncState} meta={operationsSyncMeta} onRefresh={onOperationsRefresh} onCopySupportId={onCopySupportId} />

      {accessManifest && (
        <section className={styles.accessManifest} aria-label="Quyền truy cập phiên ERP">
          <span><Icon name="shield" size={17} /></span>
          <div><strong>Quyền phiên ERP đã đồng bộ</strong><small>{accessManifest.roles.join(' + ')} · {grantedSurfaces}/{totalSurfaces} khu vực khả dụng · {accessManifest.moduleMode === 'configured' ? 'module theo cấu hình công ty' : accessManifest.moduleMode === 'demo' ? 'quyền mô phỏng staging' : 'module theo mặc định tương thích'}</small></div>
        </section>
      )}

      {ledgerView === 'command' ? (
        <RoyalCommandCenter operationsSource={operationsSource} localDashboard={commandDashboard} dataRevision={dataRevision} />
      ) : ledgerView === 'guild' ? (
        warRoomCampaign ? (
          <WarRoom
            operationsSource={operationsSource}
            projectId={warRoomCampaign.id}
            localDashboard={ledgerWarRoom}
            onBack={() => setWarRoomCampaign(null)}
            onOpenProject={() => window.location.assign(`/projects/${encodeURIComponent(warRoomCampaign.id)}`)}
            onOpenTask={(task) => window.location.assign(realmRecordHref('task', task.id))}
            dataRevision={dataRevision}
          />
        ) : embassyOpen ? (
          <RoyalEmbassy
            operationsSource={operationsSource}
            localDashboard={embassyDashboard}
            onBack={() => setEmbassyOpen(false)}
            onOpenLeads={() => window.location.assign('/leads')}
            onOpenLead={(lead) => window.location.assign(realmRecordHref('lead', lead.id))}
            onOpenClient={(client) => window.location.assign(realmRecordHref('client', client.id))}
            dataRevision={dataRevision}
          />
        ) : (
          <GuildHall
            operationsSource={operationsSource}
            localDashboard={guildDashboard}
            presence={guildPresence}
            onSelectMember={operationsSource === 'erp' ? (member) => window.location.assign(realmRecordHref('staff', member.id)) : undefined}
            onOpenCampaign={realmAccessForSurface(accessManifest, 'campaigns').allowed ? setWarRoomCampaign : undefined}
            onOpenEmbassy={realmAccessForSurface(accessManifest, 'embassy').allowed ? () => setEmbassyOpen(true) : undefined}
            dataRevision={dataRevision}
          />
        )
      ) : ledgerView === 'treasury' ? (
        <RoyalTreasuryExchange
          operationsSource={operationsSource}
          localDashboard={treasuryDashboard}
          onLocalDashboardChange={onTreasuryDashboardChange}
          onOperationsRefresh={onOperationsRefresh}
          dataRevision={dataRevision}
        />
      ) : ledgerView === 'economy' ? (
        <GoldEconomyObservatory operationsSource={operationsSource} rewardDashboard={rewardDashboard} dataRevision={dataRevision} />
      ) : ledgerView === 'rewards' ? (
        <RewardControlCenter
          operationsSource={operationsSource}
          localDashboard={rewardDashboard}
          onLocalDashboardChange={onRewardDashboardChange}
          onRewardChanged={onRewardChanged}
          dataRevision={dataRevision}
        />
      ) : <>
      <section className={styles.identityBridge} aria-label="Hồ sơ nhân sự kết nối nhân vật">
        <span className={styles.dossierCrest} style={{ '--avatar-color': profile.color }}><Icon name="shield" size={25} /></span>
        <div className={styles.identityCopy}>
          <span>ERP profile · Hồ sơ nhân sự / Character profile</span>
          <h2>{profile.name}</h2>
          <p>{profile.role} · Level {career.level} · <i style={{ '--status-color': status.color }} /> {status.label}</p>
        </div>
        <div className={styles.ledgerKpis}>
          <span><small>Gold khả dụng</small><strong>{wallet} G</strong></span>
          <span><small>Renown</small><strong>{career.renown.toLocaleString('vi-VN')}</strong></span>
          <span><small>Quest mở</small><strong>{career.openQuests}</strong></span>
          <span><small>Tiến độ tiêu chí</small><strong>{career.completionPercent}%</strong></span>
        </div>
        {operationsSource === 'erp' && <Link className={styles.profileErpLink} href={businessBridge?.profileHref || '/staff'}><Icon name="staff" size={15} />Mở hồ sơ ERP</Link>}
      </section>

      <AdventurerChronicle
        operationsSource={operationsSource}
        localDashboard={chronicleDashboard}
        dataRevision={dataRevision}
      />

      <section className={styles.ledgerSection} aria-labelledby="realm-erp-portals-title">
        <div className={styles.sectionHead}><div><span>Business bridge</span><h2 id="realm-erp-portals-title">Cổng nghiệp vụ ERP/CRM</h2></div><p>Medieval label chỉ là lớp giao diện; route, dữ liệu và RBAC vẫn thuộc ERP gốc.</p></div>
        <div className={styles.bridgePortalGrid}>
          {(businessBridge?.portals || REALM_CORE_PORTALS).map((portal) => (
            <Link href={portal.href} className={styles.bridgePortal} key={portal.key}>
              <span><Icon name={portal.icon} size={18} /></span>
              <span><strong>{portal.realmLabel}</strong><small>{portal.erpLabel} · {portal.realmSurface}</small></span>
              <Icon name="repeat" size={14} />
            </Link>
          ))}
          {(businessBridge?.unavailablePortals || []).map((portal) => (
            <article className={`${styles.bridgePortal} ${styles.bridgePortalLocked}`} key={portal.key} aria-disabled="true" title={portal.access?.reason}>
              <span><Icon name={portal.icon} size={18} /></span>
              <span><strong>{portal.realmLabel}</strong><small>{portal.access?.reason || 'Không khả dụng trong phiên này'}</small></span>
              <Icon name="shield" size={14} />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.ledgerSection}>
        <div className={styles.sectionHead}><div><span>Work registry</span><h2>Quest ↔ công việc ERP/CRM</h2></div><p>Thao tác ở bảng này cập nhật ngay nhân vật trong Realm.</p></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Mã / phân hệ</th><th>Công việc</th><th>Tiến độ</th><th>Phê duyệt</th><th className={styles.num}>Gold</th><th>Thao tác</th></tr></thead>
            <tbody>{quests.map((quest) => (
              <tr key={quest.id}>
                <td><strong>{quest.businessRef || quest.id}</strong><small>{quest.module || 'Tasks'}</small></td>
                <td><strong>{quest.title}</strong><small>{quest.project} · {quest.due}</small></td>
                <td><span className={styles.progressText}>{quest.progress}/{quest.total}</span><small>{quest.status === 'ready' ? 'Đủ điều kiện' : quest.status === 'claimed' ? 'Đã hoàn tất' : 'Đang thực hiện'}</small></td>
                <td><span className={styles.tableStatus}>{quest.approval || `Duyệt bởi ${quest.reviewer}`}</span></td>
                <td className={styles.num}><strong>+{quest.reward} G</strong><small>+{quest.renown} XP</small></td>
                <td>
                  {quest.status === 'active' && (operationsSource === 'erp'
                    ? <Link className={styles.tableAction} href={quest.links?.task || realmRecordHref('task', quest.businessRef)}>Mở Task ERP</Link>
                    : <button type="button" className={styles.tableAction} onClick={() => onAdvanceQuest(quest)}>Cập nhật +1</button>)}
                  {quest.status === 'ready' && <button type="button" disabled={operationsSyncState === 'syncing'} className={`${styles.tableAction} ${styles.tableActionPrimary}`} onClick={() => onClaimQuest(quest)}>{operationsSyncState === 'syncing' ? 'Đang ghi…' : 'Ghi nhận Gold'}</button>}
                  {quest.status === 'claimed' && <span className={styles.tableComplete}><Icon name="check" size={14} /> Đã ghi sổ</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <div className={styles.ledgerColumns}>
        <section className={styles.ledgerSection}><div className={styles.sectionHead}><div><span>Reward accounting</span><h2>Gold journal</h2></div><p>Append-only demo</p></div><LedgerList ledger={ledger} /></section>
        <section className={styles.ledgerSection}><div className={styles.sectionHead}><div><span>Team availability</span><h2>Presence</h2></div><p>Trạng thái tự nguyện</p></div><div className={styles.roster}>{staff.map((person) => {
          const personStatus = STATUS[person.status] || STATUS.available;
          return <article key={person.id} className={styles.personRow}><span className={styles.personAvatar} style={{ '--avatar-color': person.color }}>{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.role}</small></span><span className={styles.presenceLabel}><i style={{ '--status-color': personStatus.color }} />{personStatus.label}</span></article>;
        })}</div></section>
      </div>
      </>}
    </div>
  );
}

function CharacterDossier({ profile, playerStatus, career, wallet, operationsSource, operationsSyncState, operationsSyncMeta, businessBridge, onOperationsRefresh, onCopySupportId, onOpenRealm }) {
  const status = STATUS[playerStatus] || STATUS.available;
  const sync = operationsSyncCopy(operationsSource, operationsSyncState, operationsSyncMeta);
  return (
    <section className={styles.characterDossier} aria-labelledby="character-dossier-title">
      <span className={styles.eyebrow}>Live employee status</span>
      <div className={styles.dossierIdentity}>
        <span className={styles.dossierCrest} style={{ '--avatar-color': profile.color }}><Icon name="shield" size={27} /></span>
        <div><h2 id="character-dossier-title">{profile.name}</h2><p>STAFF-001 · {profile.role}</p></div>
      </div>
      <div className={styles.levelRow}><span>Level {career.level}</span><strong>{career.renown.toLocaleString('vi-VN')} / {career.nextLevelRenown.toLocaleString('vi-VN')} XP</strong></div>
      <div className={styles.careerProgress} role="progressbar" aria-label="Tiến độ level nhân vật" aria-valuemin="0" aria-valuemax="100" aria-valuenow={career.levelProgress}><i style={{ width: `${career.levelProgress}%` }} /></div>
      <dl className={styles.dossierStats}>
        <div><dt>Hiện diện</dt><dd><i style={{ '--status-color': status.color }} />{status.label}</dd></div>
        <div><dt>Gold</dt><dd>{wallet} G</dd></div>
        <div><dt>Quest hoàn tất</dt><dd>{career.completedQuests}</dd></div>
        <div><dt>Chuỗi hoạt động</dt><dd>{career.streakDays} ngày</dd></div>
      </dl>
      <div className={styles.dossierLoadout} aria-label="Trang bị nhân vật">
        <strong>Adventurer loadout</strong>
        {[
          ['title', 'Danh hiệu'],
          ['seal', 'Ấn tín'],
          ['banner', 'Banner'],
        ].map(([slot, label]) => {
          const item = profile.loadout?.[slot];
          return <span key={slot}><Icon name={item?.icon || 'shield'} size={15} /><small>{label}</small><b>{item?.equipName || 'Chưa trang bị'}</b></span>;
        })}
      </div>
      <div className={styles.mappingCard}>
        <strong>Một dữ liệu, hai cách nhìn</strong>
        <small className={styles.dossierSource}><Icon name={sync.icon} size={14} />{sync.label}</small>
        <span><Icon name="tasks" size={16} /> Task / Lead <b>→</b> Quest</span>
        <span><Icon name="wallet" size={16} /> Reward ledger <b>→</b> Gold</span>
        <span><Icon name="staff" size={16} /> Availability <b>→</b> Player status</span>
        <span><Icon name="shield" size={16} /> Tavern Inventory <b>→</b> Loadout</span>
      </div>
      <SyncIntegrityCard source={operationsSource} state={operationsSyncState} meta={operationsSyncMeta} onRefresh={onOperationsRefresh} onCopySupportId={onCopySupportId} compact />
      {operationsSource === 'erp' && <Link className={styles.dossierErpLink} href={businessBridge?.profileHref || '/staff'}><Icon name="staff" size={16} /> Mở hồ sơ nhân sự gốc</Link>}
      <button type="button" className={styles.openRealmButton} onClick={onOpenRealm}><Icon name="dashboard" size={17} /> Mở góc nhìn Realm</button>
    </section>
  );
}

export default function RealmOffice({ erpHref = '/dashboard', demoMode = false, workspaceLabel = 'Demo entity', initialBridge = null, pilotFeatures = null, initialMode = 'world' }) {
  return <ToastProvider><RealmOfficeInner erpHref={erpHref} demoMode={demoMode} workspaceLabel={workspaceLabel} initialBridge={initialBridge} pilotFeatures={pilotFeatures} initialMode={initialMode} /></ToastProvider>;
}
