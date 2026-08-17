'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Icon } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { isInVoiceRange } from '@/lib/realm-protocol';
import { findRealmPath } from '@/lib/realm-navigation';
import { REALM_EMOTES } from '@/lib/realm-social';
import {
  REALM_WORLD_FIXED_STEP,
  classifyRealmActor,
  createRealmCameraState,
  createRealmMotionState,
  normalizeRealmWorldPeople,
  realmFrameBudget,
  realmQualityTier,
  stepRealmCamera,
  stepRealmMotion,
} from '@/lib/realm-world-v3';
import {
  REALM_CHARACTER_ATLAS_ROWS,
  REALM_OCCLUDER_NODES,
  REALM_OBJECT_VISUALS,
  REALM_ROOM_MATERIAL_FRAMES,
  REALM_RUNTIME_ASSET_URLS,
  REALM_RUNTIME_CHARACTER_URLS,
  REALM_WORLD_Y_SCALE,
  projectRealmY,
  realmAtlasFrame,
  realmInteractionEnvelope,
  realmObjectFacing,
  unprojectRealmY,
} from '@/lib/realm-visual-runtime';
import {
  PRIVATE_ZONES,
  ROOMS,
  WALLS,
  WORLD,
  WORLD_OBJECTS,
  distance,
  isWorldPositionWalkable,
  normalizeWorldPosition,
  privateZoneAt,
  roomAt,
} from './world';
import worldStyles from './realm-world-v3.module.css';

const RealmRewardRemotion = dynamic(() => import('./RealmRewardRemotion'), { ssr: false });

const OBJECT_COPY = Object.freeze({
  'command-dais': Object.freeze({ title: 'Phòng điều hành', detail: 'Ưu tiên và quyết định', icon: 'shield', verb: 'Trình diện', accent: '#d8b866' }),
  'guild-roster': Object.freeze({ title: 'Sổ bộ Guild', detail: 'Nhân sự và quyền truy cập', icon: 'people', verb: 'Tra sổ bộ', accent: '#7fbd99' }),
  'war-table': Object.freeze({ title: 'Bàn dự án', detail: 'Kế hoạch và thực thi', icon: 'projects', verb: 'Mở bản đồ', accent: '#a99bc8' }),
  'treasury-chest': Object.freeze({ title: 'Kho bạc Gold', detail: 'Ghi nhận đóng góp', icon: 'wallet', verb: 'Đối chiếu Gold', accent: '#e3bb5b' }),
  'tavern-board': Object.freeze({ title: 'Quảng trường Đèn', detail: 'Tin nhắn và gặp gỡ', icon: 'chat', verb: 'Thắp tín hiệu', accent: '#cb7778' }),
  'quest-board': Object.freeze({ title: 'Bàn hội đồng', detail: 'Công việc và voice', icon: 'meeting', verb: 'Xem công việc', accent: '#79aec7' }),
  'realm-gate': Object.freeze({ title: 'Lối vào Guildhall', detail: 'Khôi phục ngày làm việc', icon: 'home', verb: 'Mở cổng', accent: '#76bfa9' }),
  'arcane-forge': Object.freeze({ title: 'Xưởng Guild', detail: 'Sử dụng Gold đã kiếm', icon: 'work', verb: 'Nhóm lò', accent: '#db8953' }),
});

const ROOM_COPY = Object.freeze({
  guild: 'Sảnh Sổ bộ',
  war: 'Phòng Chiến lược',
  treasury: 'Kho bạc Hoàng gia',
  tavern: 'Quảng trường Đèn',
  hall: 'Đại sảnh Hội đồng',
  forge: 'Xưởng Guild',
});

const ROOM_THEME = Object.freeze({
  guild: Object.freeze({ floor: '#2b4035', inset: '#314b3d', line: '#66836e', rug: '#455f4b', metal: '#b99c5c' }),
  war: Object.freeze({ floor: '#34343e', inset: '#3e3d4a', line: '#77748a', rug: '#4d4a61', metal: '#b3a37a' }),
  treasury: Object.freeze({ floor: '#463927', inset: '#55442e', line: '#8d7040', rug: '#614923', metal: '#d0a847' }),
  tavern: Object.freeze({ floor: '#44332c', inset: '#513a30', line: '#8b6250', rug: '#623d38', metal: '#c78e61' }),
  hall: Object.freeze({ floor: '#2e4038', inset: '#354a40', line: '#668479', rug: '#3d5a50', metal: '#c6aa69' }),
  forge: Object.freeze({ floor: '#3e3033', inset: '#4d3434', line: '#80514b', rug: '#5f3833', metal: '#c67548' }),
});

const AMBIENT_PROPS = Object.freeze([
  { type: 'banner', x: 4, y: 2.3, hue: '#668b70' }, { type: 'banner', x: 14.8, y: 2.3, hue: '#668b70' },
  { type: 'hourglass', x: 4.2, y: 13.2 }, { type: 'quill', x: 14.4, y: 12.8 },
  { type: 'banner', x: 22, y: 2.3, hue: '#6a6583' }, { type: 'banner', x: 36.2, y: 2.3, hue: '#6a6583' },
  { type: 'map', x: 35.6, y: 12.3 }, { type: 'astrolabe', x: 22.4, y: 12.4 },
  { type: 'vault', x: 43.2, y: 3.1 }, { type: 'coinmill', x: 54.2, y: 11.8 },
  { type: 'hearth', x: 3.4, y: 20.4 }, { type: 'lanterns', x: 14.5, y: 20.1 },
  { type: 'fountain', x: 23, y: 21.1 }, { type: 'clock', x: 36, y: 20.6 },
  { type: 'papers', x: 23, y: 32.2 }, { type: 'banner', x: 36, y: 32.1, hue: '#4c7669' },
  { type: 'bellows', x: 43.3, y: 20.8 }, { type: 'gear', x: 54.2, y: 20.7 },
  { type: 'anvil', x: 43.3, y: 32.1 }, { type: 'crucible', x: 54, y: 32 },
]);

const STATIC_FURNITURE = Object.freeze([
  { type: 'shelf', x: 3.2, y: 3.5, w: 2.4 }, { type: 'shelf', x: 15.8, y: 3.5, w: 2.4 },
  { type: 'desk', x: 4.3, y: 11.7, w: 2.2 }, { type: 'bench', x: 14.4, y: 12.6, w: 2.5 },
  { type: 'cabinet', x: 22.2, y: 3.5, w: 2.2 }, { type: 'cabinet', x: 36.4, y: 3.5, w: 2.2 },
  { type: 'bench', x: 22.7, y: 13.1, w: 2.6 }, { type: 'bench', x: 35.5, y: 13.1, w: 2.6 },
  { type: 'vault', x: 43.1, y: 12.8, w: 2.1 }, { type: 'vault', x: 54.1, y: 3.7, w: 2.1 },
  { type: 'crate', x: 43.3, y: 4.2, w: 1.7 }, { type: 'crate', x: 54.2, y: 12.8, w: 1.7 },
  { type: 'table', x: 4.2, y: 20.8, w: 2.4 }, { type: 'table', x: 14.1, y: 31.7, w: 2.4 },
  { type: 'bar', x: 14.8, y: 20.8, w: 3.2 }, { type: 'barrel', x: 3.1, y: 32.2, w: 1.8 },
  { type: 'bench', x: 22.5, y: 29.7, w: 2.8 }, { type: 'bench', x: 35.5, y: 29.7, w: 2.8 },
  { type: 'desk', x: 22.7, y: 20.5, w: 2.3 }, { type: 'desk', x: 35.3, y: 32.4, w: 2.3 },
  { type: 'rack', x: 43, y: 20.5, w: 2.2 }, { type: 'rack', x: 54.4, y: 20.5, w: 2.2 },
  { type: 'crate', x: 43.2, y: 32.3, w: 1.8 }, { type: 'barrel', x: 54.2, y: 32.2, w: 1.8 },
]);

const TORCHES = Object.freeze([
  [2.2, 16.45], [15.8, 16.45], [20.2, 16.45], [37.8, 16.45], [41.2, 16.45], [55.8, 16.45],
  [18.48, 2.5], [18.48, 14.3], [18.48, 18.7], [18.48, 33.3],
  [39.48, 2.5], [39.48, 14.3], [39.48, 18.7], [39.48, 33.3],
]);

const DEMO_ACTORS = Object.freeze([
  Object.freeze({ id: 'demo-elf', name: 'Lyra · Elf Steward · demo', role: 'Elf · Guild Steward', status: 'available', x: 26.5, y: 26.5, waypoints: [[26.5, 26.5], [32.5, 26.5], [32.5, 30.5], [26.5, 30.5]] }),
  Object.freeze({ id: 'demo-dwarf', name: 'Brom · Dwarf Engineer · demo', role: 'Dwarf · Forge Engineer', status: 'busy', x: 45.5, y: 27.5, waypoints: [[45.5, 27.5], [51.5, 27.5], [51.5, 31.2], [45.5, 31.2]] }),
  Object.freeze({ id: 'demo-orc', name: 'Kael · Half-Orc Warden · demo', role: 'Half-Orc · Project Warden', status: 'focus', x: 25.5, y: 9.5, waypoints: [[25.5, 9.5], [32.5, 9.5], [32.5, 12.5], [25.5, 12.5]] }),
  Object.freeze({ id: 'demo-tiefling', name: 'Vexa · Tiefling Archivist · demo', role: 'Tiefling · Archivist', status: 'away', x: 6.5, y: 8.5, waypoints: [[6.5, 8.5], [13.5, 8.5], [13.5, 12.5], [6.5, 12.5]] }),
  Object.freeze({ id: 'demo-human', name: 'Eira · Human Goldkeeper · demo', role: 'Human · Goldkeeper', status: 'available', x: 47.5, y: 8.5, waypoints: [[47.5, 8.5], [52.5, 8.5], [52.5, 12.3], [47.5, 12.3]] }),
]);

const STATUS_COLORS = Object.freeze({ available: '#7cc39b', busy: '#d6a455', focus: '#aa9bd6', dnd: '#cf7278', away: '#87948d' });
const OBJECT_RADIUS = 1.25;
const INTERACTION_RADIUS = 1.85;
const WALK_SPEED = 4.65;
const ROUTE_ARRIVAL = .2;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function seededNoise(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function loadRealmImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load Realm visual asset: ${source}`));
    image.src = source;
  });
}

async function loadRealmRuntimeArt() {
  const entries = await Promise.all([
    ...Object.entries(REALM_RUNTIME_ASSET_URLS),
    ...Object.entries(REALM_RUNTIME_CHARACTER_URLS),
  ].map(async ([key, source]) => {
    const image = await loadRealmImage(source);
    return [key, key.startsWith('character') ? removeWhiteMatte(image) : image];
  }));
  return Object.freeze(Object.fromEntries(entries));
}

function removeWhiteMatte(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueueMatte = (pixel) => {
    if (pixel < 0 || pixel >= visited.length || visited[pixel]) return;
    const index = pixel * 4;
    const red = pixels.data[index];
    const green = pixels.data[index + 1];
    const blue = pixels.data[index + 2];
    const minimum = Math.min(red, green, blue);
    const spread = Math.max(red, green, blue) - minimum;
    if (minimum <= 116 || spread >= 36) return;
    visited[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    enqueueMatte(x);
    enqueueMatte((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueueMatte(y * width);
    enqueueMatte(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    pixels.data[pixel * 4 + 3] = 0;
    const x = pixel % width;
    if (x > 0) enqueueMatte(pixel - 1);
    if (x < width - 1) enqueueMatte(pixel + 1);
    if (pixel >= width) enqueueMatte(pixel - width);
    if (pixel < width * (height - 1)) enqueueMatte(pixel + width);
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function drawAtlasFrame(ctx, image, index, columns, rows, x, y, width, height, alpha = 1) {
  const imageWidth = image?.naturalWidth || image?.width;
  const imageHeight = image?.naturalHeight || image?.height;
  if (!imageWidth || !imageHeight) return false;
  const frame = realmAtlasFrame(index, columns, rows);
  const sourceWidth = imageWidth / frame.columns;
  const sourceHeight = imageHeight / frame.rows;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(
    image,
    frame.column * sourceWidth,
    frame.row * sourceHeight,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
  ctx.restore();
  return true;
}

function buildMaterialPatterns(ctx, image, tile) {
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null;
  const patterns = [];
  const sourceWidth = image.naturalWidth / 4;
  const sourceHeight = image.naturalHeight / 4;
  for (let index = 0; index < 16; index += 1) {
    const frame = realmAtlasFrame(index, 4, 4);
    const sample = document.createElement('canvas');
    sample.width = Math.max(64, Math.ceil(tile * 3.2));
    sample.height = Math.max(46, Math.ceil(tile * 3.2 * REALM_WORLD_Y_SCALE));
    sample.getContext('2d').drawImage(
      image,
      frame.column * sourceWidth,
      frame.row * sourceHeight,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sample.width,
      sample.height,
    );
    patterns.push(ctx.createPattern(sample, 'repeat'));
  }
  return patterns;
}

function pathToObject(object) {
  const candidates = [
    { x: object.x, y: object.y + 1.45 },
    { x: object.x + 1.45, y: object.y },
    { x: object.x - 1.45, y: object.y },
    { x: object.x, y: object.y - 1.45 },
  ];
  return candidates.find(isWorldPositionWalkable) || normalizeWorldPosition(object);
}

function roomTheme(room) {
  return ROOM_THEME[room?.id] || ROOM_THEME.hall;
}

function drawStaticFloor(ctx, room, tile, materialPatterns) {
  const theme = roomTheme(room);
  const x = room.x * tile;
  const y = projectRealmY(room.y, tile);
  const width = room.w * tile;
  const height = room.h * tile * REALM_WORLD_Y_SCALE;
  ctx.fillStyle = theme.floor;
  ctx.fillRect(x, y, width, height);

  const materialFrame = REALM_ROOM_MATERIAL_FRAMES[room.id] ?? 0;
  if (materialPatterns?.[materialFrame]) {
    ctx.save();
    ctx.globalAlpha = room.id === 'tavern' || room.id === 'forge' ? .62 : .48;
    ctx.fillStyle = materialPatterns[materialFrame];
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  const gradient = ctx.createRadialGradient(x + width * .5, y + height * .45, 0, x + width * .5, y + height * .45, Math.max(width, height) * .72);
  gradient.addColorStop(0, 'rgba(232, 210, 158, .08)');
  gradient.addColorStop(.65, 'rgba(18, 25, 21, .02)');
  gradient.addColorStop(1, 'rgba(4, 8, 7, .28)');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);

  ctx.lineWidth = 1;
  for (let tx = room.x; tx < room.x + room.w; tx += 1) {
    for (let ty = room.y; ty < room.y + room.h; ty += 1) {
      const px = tx * tile;
      const py = projectRealmY(ty, tile);
      const grain = seededNoise(tx, ty);
      ctx.strokeStyle = `rgba(226, 211, 173, ${.018 + grain * .025})`;
      ctx.beginPath();
      if ((tx + ty) % 2) {
        ctx.moveTo(px + tile * .12, py + tile * .18 * REALM_WORLD_Y_SCALE);
        ctx.lineTo(px + tile * .88, py + tile * .82 * REALM_WORLD_Y_SCALE);
      } else {
        ctx.moveTo(px + tile * .12, py + tile * .82 * REALM_WORLD_Y_SCALE);
        ctx.lineTo(px + tile * .88, py + tile * .18 * REALM_WORLD_Y_SCALE);
      }
      ctx.stroke();
      if (grain > .83) {
        ctx.fillStyle = 'rgba(238, 220, 174, .05)';
        ctx.fillRect(px + tile * grain * .7, py + tile * (1 - grain) * .7 * REALM_WORLD_Y_SCALE, 2, 2);
      }
    }
  }

  const rugW = Math.min(room.w * .36, 6.4) * tile;
  const rugH = Math.min(room.h * .24, 3.8) * tile * REALM_WORLD_Y_SCALE;
  const rugX = x + width / 2 - rugW / 2;
  const rugY = y + height / 2 - rugH / 2;
  const inset = Math.min(tile * .34, rugW * .08);
  ctx.save();
  ctx.fillStyle = 'rgba(2, 5, 4, .34)';
  ctx.beginPath();
  ctx.moveTo(rugX + inset, rugY + tile * .13);
  ctx.lineTo(rugX + rugW - inset, rugY + tile * .13);
  ctx.lineTo(rugX + rugW + tile * .1, rugY + rugH + tile * .13);
  ctx.lineTo(rugX - tile * .1, rugY + rugH + tile * .13);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = .82;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = theme.rug;
  ctx.beginPath();
  ctx.moveTo(rugX + inset, rugY);
  ctx.lineTo(rugX + rugW - inset, rugY);
  ctx.lineTo(rugX + rugW, rugY + rugH);
  ctx.lineTo(rugX, rugY + rugH);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = .4;
  ctx.strokeStyle = theme.metal;
  ctx.lineWidth = Math.max(1, tile * .035);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(244, 225, 177, .2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rugX + inset + tile * .12, rugY + tile * .1);
  ctx.lineTo(rugX + rugW - inset - tile * .12, rugY + tile * .1);
  ctx.lineTo(rugX + rugW - tile * .16, rugY + rugH - tile * .1);
  ctx.lineTo(rugX + tile * .16, rugY + rugH - tile * .1);
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = .12;
  ctx.strokeStyle = theme.line;
  for (let stripe = .18; stripe < 1; stripe += .18) {
    const stripeY = rugY + rugH * stripe;
    const sideInset = inset * (1 - stripe);
    ctx.beginPath();
    ctx.moveTo(rugX + sideInset, stripeY);
    ctx.lineTo(rugX + rugW - sideInset, stripeY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStaticWall(ctx, x, y, tile, wallPattern) {
  const px = x * tile;
  const groundY = projectRealmY(y + 1, tile);
  const faceHeight = tile * .72;
  const topDepth = tile * .32;
  const topY = groundY - faceHeight - topDepth * .5;
  ctx.fillStyle = 'rgba(4, 8, 7, .55)';
  ctx.fillRect(px + tile * .05, groundY - tile * .04, tile * .9, tile * .22);
  ctx.fillStyle = wallPattern || (seededNoise(x, y) > .5 ? '#59625d' : '#4d5852');
  ctx.fillRect(px + 1, topY + topDepth * .42, tile - 2, faceHeight);
  ctx.fillStyle = 'rgba(224, 210, 174, .11)';
  ctx.fillRect(px + 3, topY + topDepth * .42 + 2, tile - 6, tile * .1);
  ctx.fillStyle = '#5b625d';
  ctx.beginPath();
  ctx.moveTo(px + 1, topY + topDepth * .42);
  ctx.lineTo(px + tile * .18, topY);
  ctx.lineTo(px + tile - 1, topY);
  ctx.lineTo(px + tile - tile * .18, topY + topDepth * .42);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(14, 21, 18, .72)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 1, topY + topDepth * .42, tile - 2, faceHeight);
  ctx.beginPath();
  ctx.moveTo(px + ((x + y) % 2 ? tile * .38 : tile * .62), topY + topDepth * .42 + 2);
  ctx.lineTo(px + ((x + y) % 2 ? tile * .38 : tile * .62), groundY - 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(1, 4, 3, .26)';
  ctx.fillRect(px + 2, groundY - tile * .18, tile - 4, tile * .18);
}

function drawStaticFurniture(ctx, prop, tile) {
  const x = prop.x * tile;
  const y = projectRealmY(prop.y, tile);
  const width = prop.w * tile;
  const wood = prop.type === 'vault' || prop.type === 'rack' ? '#464a45' : '#563d29';
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(1, 4, 3, .38)';
  ctx.beginPath();
  ctx.ellipse(0, tile * .24, width * .46, tile * .18, 0, 0, Math.PI * 2);
  ctx.fill();
  if (prop.type === 'barrel') {
    ctx.fillStyle = '#684329';
    ctx.beginPath();
    ctx.ellipse(0, 0, width * .34, tile * .42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9b7544';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, width * .34, tile * .31, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prop.type === 'shelf' || prop.type === 'cabinet' || prop.type === 'rack') {
    ctx.fillStyle = wood;
    roundRect(ctx, -width / 2, -tile * .5, width, tile * .88, tile * .06);
    ctx.fill();
    ctx.strokeStyle = 'rgba(205, 175, 111, .3)';
    ctx.stroke();
    for (let row = 0; row < 3; row += 1) {
      ctx.fillStyle = 'rgba(13, 19, 16, .62)';
      ctx.fillRect(-width * .4, -tile * .38 + row * tile * .24, width * .8, tile * .15);
      if (prop.type === 'shelf') {
        const colors = ['#7b4d42', '#6a6f4d', '#79603d', '#4f586f'];
        for (let book = 0; book < 7; book += 1) {
          ctx.fillStyle = colors[(row * 3 + book) % colors.length];
          ctx.fillRect(-width * .35 + book * width * .1, -tile * .35 + row * tile * .24, width * .065, tile * .11);
        }
      }
    }
  } else if (prop.type === 'crate' || prop.type === 'vault') {
    ctx.fillStyle = wood;
    roundRect(ctx, -width / 2, -tile * .32, width, tile * .62, tile * .07);
    ctx.fill();
    ctx.strokeStyle = prop.type === 'vault' ? '#aa9057' : '#806146';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-width * .35, -tile * .22);
    ctx.lineTo(width * .35, tile * .2);
    ctx.moveTo(width * .35, -tile * .22);
    ctx.lineTo(-width * .35, tile * .2);
    ctx.stroke();
  } else {
    ctx.fillStyle = wood;
    roundRect(ctx, -width / 2, -tile * .26, width, tile * .46, tile * .07);
    ctx.fill();
    ctx.fillStyle = 'rgba(216, 184, 116, .18)';
    ctx.fillRect(-width * .43, -tile * .2, width * .86, tile * .07);
    ctx.fillStyle = '#34271d';
    ctx.fillRect(-width * .39, tile * .18, tile * .12, tile * .34);
    ctx.fillRect(width * .27, tile * .18, tile * .12, tile * .34);
    if (prop.type === 'desk' || prop.type === 'table') {
      ctx.fillStyle = '#c9ba8b';
      ctx.save();
      ctx.rotate(-.04);
      ctx.fillRect(-width * .2, -tile * .18, width * .4, tile * .22);
      ctx.restore();
    }
  }
  ctx.restore();
}

function buildStaticWorld(tile, art) {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD.cols * tile;
  canvas.height = Math.ceil(WORLD.rows * tile * REALM_WORLD_Y_SCALE + tile * .5);
  const ctx = canvas.getContext('2d');
  const materialPatterns = buildMaterialPatterns(ctx, art?.materials, tile);
  ctx.fillStyle = '#080e0c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const room of ROOMS) drawStaticFloor(ctx, room, tile, materialPatterns);
  for (let y = 0; y < WORLD.rows; y += 1) {
    for (let x = 0; x < WORLD.cols; x += 1) if (WALLS.has(`${x},${y}`)) drawStaticWall(ctx, x, y, tile, materialPatterns?.[1]);
  }
  for (const zone of PRIVATE_ZONES) {
    ctx.strokeStyle = 'rgba(224, 188, 98, .24)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([tile * .22, tile * .15]);
    ctx.strokeRect(zone.x * tile, projectRealmY(zone.y, tile), zone.w * tile, zone.h * tile * REALM_WORLD_Y_SCALE);
  }
  ctx.setLineDash([]);
  return canvas;
}

function buildTorchLight(tile) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(tile * 3.8);
  canvas.height = Math.ceil(tile * 3.8);
  const ctx = canvas.getContext('2d');
  const center = canvas.width / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255, 221, 139, .34)');
  gradient.addColorStop(.2, 'rgba(246, 164, 66, .16)');
  gradient.addColorStop(1, 'rgba(246, 164, 66, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawTorch(ctx, x, y, tile, time, quality, lightSprite) {
  const flicker = .88 + Math.sin(time * .012 + x * 1.7) * .1 + Math.sin(time * .027 + y) * .05;
  ctx.save();
  ctx.translate(x * tile, projectRealmY(y, tile));
  ctx.fillStyle = '#60452b';
  ctx.fillRect(-tile * .045, -tile * .1, tile * .09, tile * .35);
  if (lightSprite) {
    ctx.globalAlpha = flicker;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(lightSprite, -lightSprite.width / 2, -lightSprite.height / 2 - tile * .15);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#f6a642';
  ctx.beginPath();
  ctx.moveTo(0, -tile * .36 * flicker);
  ctx.quadraticCurveTo(tile * .17, -tile * .12, 0, tile * .02);
  ctx.quadraticCurveTo(-tile * .17, -tile * .12, 0, -tile * .36 * flicker);
  ctx.fill();
  ctx.fillStyle = '#ffe6a0';
  ctx.beginPath();
  ctx.ellipse(0, -tile * .1, tile * .055, tile * .12 * flicker, 0, 0, Math.PI * 2);
  ctx.fill();
  if (quality.id !== 'low') {
    ctx.fillStyle = 'rgba(255, 213, 121, .7)';
    for (let index = 0; index < 2; index += 1) {
      const seed = (time * .0004 + index * .47 + x * .11) % 1;
      ctx.fillRect(Math.sin(seed * 19) * tile * .14, -tile * (.25 + seed * .72), 2, 2);
    }
  }
  ctx.restore();
}

function drawAmbientProp(ctx, prop, tile, time, reducedMotion) {
  const x = prop.x * tile;
  const y = projectRealmY(prop.y, tile);
  const phase = reducedMotion ? 0 : time * .001;
  ctx.save();
  ctx.translate(x, y);
  if (prop.type === 'banner') {
    ctx.fillStyle = '#25261f';
    ctx.fillRect(-tile * .5, -tile * .62, tile, tile * .08);
    ctx.fillStyle = prop.hue;
    ctx.beginPath();
    ctx.moveTo(-tile * .36, -tile * .52);
    ctx.quadraticCurveTo(Math.sin(phase * 1.7 + prop.x) * tile * .08, tile * .05, tile * .32, tile * .48);
    ctx.lineTo(0, tile * .3);
    ctx.lineTo(-tile * .32, tile * .48);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(225, 193, 111, .48)';
    ctx.stroke();
  } else if (prop.type === 'hearth' || prop.type === 'crucible') {
    ctx.fillStyle = '#272827';
    roundRect(ctx, -tile * .5, -tile * .28, tile, tile * .58, tile * .08);
    ctx.fill();
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, tile * 1.2);
    glow.addColorStop(0, 'rgba(244, 122, 52, .28)');
    glow.addColorStop(1, 'rgba(244, 122, 52, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-tile * 1.2, -tile * 1.2, tile * 2.4, tile * 2.4);
    ctx.fillStyle = '#ed8245';
    ctx.beginPath();
    ctx.ellipse(0, -tile * .05, tile * .3, tile * (.14 + Math.sin(phase * 6) * .025), 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (prop.type === 'gear' || prop.type === 'coinmill' || prop.type === 'clock' || prop.type === 'astrolabe') {
    ctx.strokeStyle = prop.type === 'coinmill' ? '#c49a42' : '#87918b';
    ctx.lineWidth = tile * .07;
    ctx.beginPath();
    ctx.arc(0, 0, tile * .34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.rotate(phase * (prop.type === 'clock' ? .35 : .8));
    for (let index = 0; index < 8; index += 1) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(tile * .26, -tile * .05, tile * .19, tile * .1);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(phase) * tile * .2, -tile * .23);
    ctx.stroke();
  } else if (prop.type === 'fountain') {
    ctx.fillStyle = '#526d68';
    ctx.beginPath();
    ctx.ellipse(0, tile * .12, tile * .56, tile * .28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6a9b9b';
    ctx.beginPath();
    ctx.ellipse(0, tile * .08, tile * .42, tile * .2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(174, 226, 221, .65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, tile * .04);
    ctx.quadraticCurveTo(Math.sin(phase * 2) * tile * .09, -tile * .44, tile * .25, tile * .02);
    ctx.moveTo(0, tile * .04);
    ctx.quadraticCurveTo(-Math.sin(phase * 2 + 1) * tile * .09, -tile * .44, -tile * .25, tile * .02);
    ctx.stroke();
  } else if (prop.type === 'papers' || prop.type === 'map' || prop.type === 'quill' || prop.type === 'hourglass') {
    ctx.fillStyle = '#5a422d';
    roundRect(ctx, -tile * .55, -tile * .24, tile * 1.1, tile * .48, tile * .05);
    ctx.fill();
    ctx.save();
    ctx.rotate(Math.sin(phase * 1.3 + prop.x) * .035);
    ctx.fillStyle = '#cbbd91';
    ctx.fillRect(-tile * .34, -tile * .18, tile * .68, tile * .34);
    ctx.strokeStyle = '#7e6c4d';
    ctx.beginPath();
    ctx.moveTo(-tile * .22, -tile * .06);
    ctx.lineTo(tile * .18, -tile * .06);
    ctx.moveTo(-tile * .16, tile * .04);
    ctx.lineTo(tile * .23, tile * .04);
    ctx.stroke();
    ctx.restore();
  } else if (prop.type === 'anvil' || prop.type === 'bellows' || prop.type === 'vault' || prop.type === 'lanterns') {
    ctx.fillStyle = prop.type === 'vault' ? '#4d4a40' : '#4d4034';
    roundRect(ctx, -tile * .48, -tile * .3, tile * .96, tile * .62, tile * .09);
    ctx.fill();
    ctx.strokeStyle = '#a88b55';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (prop.type === 'lanterns') {
      ctx.fillStyle = 'rgba(242, 177, 77, .55)';
      ctx.beginPath();
      ctx.arc(0, 0, tile * (.18 + Math.sin(phase * 2) * .02), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawObjectBase(ctx, object, tile, time, state) {
  const copy = OBJECT_COPY[object.id] || { accent: '#c8ab68' };
  const phase = time * .001;
  const selected = state.selected || state.nearby || state.hovered;
  ctx.save();
  ctx.translate(object.x * tile, projectRealmY(object.y, tile));
  ctx.fillStyle = 'rgba(2, 5, 4, .45)';
  ctx.beginPath();
  ctx.ellipse(0, tile * .36, tile * .7, tile * .23, 0, 0, Math.PI * 2);
  ctx.fill();

  if (selected) {
    const pulse = .75 + Math.sin(phase * 4) * .16;
    ctx.strokeStyle = copy.accent;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = state.nearby ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(0, tile * .28, tile * .82, tile * .36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (state.rewarded) {
    const rewardPulse = .58 + Math.sin(phase * 7) * .18;
    ctx.strokeStyle = `rgba(245, 205, 99, ${rewardPulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, tile * .18, tile * 1.05, tile * .48, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (object.kind === 'command') {
    ctx.fillStyle = '#39443d';
    ctx.beginPath();
    ctx.ellipse(0, tile * .18, tile * .9, tile * .52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#bda25e';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#7b3e38';
    ctx.beginPath();
    ctx.moveTo(-tile * .4, tile * .12);
    ctx.lineTo(0, -tile * .72);
    ctx.lineTo(tile * .4, tile * .12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d1b86d';
    ctx.fillRect(-tile * .06, -tile * .55, tile * .12, tile * .42);
  } else if (object.kind === 'table') {
    ctx.fillStyle = '#523923';
    roundRect(ctx, -tile * .88, -tile * .48, tile * 1.76, tile * .88, tile * .14);
    ctx.fill();
    ctx.fillStyle = '#c4b783';
    ctx.save();
    ctx.rotate(Math.sin(phase * .8) * .018);
    ctx.fillRect(-tile * .6, -tile * .34, tile * 1.2, tile * .5);
    ctx.strokeStyle = '#6a7d68';
    ctx.beginPath();
    ctx.moveTo(-tile * .48, -tile * .2);
    ctx.lineTo(tile * .35, tile * .03);
    ctx.moveTo(-tile * .2, tile * .1);
    ctx.lineTo(tile * .42, -tile * .2);
    ctx.stroke();
    ctx.restore();
    for (const offset of [-.7, .7]) {
      ctx.fillStyle = '#dbad55';
      ctx.beginPath();
      ctx.arc(tile * offset, -tile * .45, tile * .05, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (object.kind === 'chest') {
    ctx.fillStyle = '#58371e';
    roundRect(ctx, -tile * .62, -tile * .32, tile * 1.24, tile * .72, tile * .12);
    ctx.fill();
    ctx.fillStyle = '#9e6d2d';
    ctx.fillRect(-tile * .62, -tile * .18, tile * 1.24, tile * .16);
    ctx.fillStyle = '#e0b64e';
    ctx.fillRect(-tile * .08, -tile * .08, tile * .16, tile * .32);
    ctx.globalAlpha = .45 + Math.sin(phase * 2.4) * .2;
    ctx.fillStyle = '#ffe196';
    ctx.beginPath();
    ctx.arc(tile * .22, -tile * .42, tile * .05, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (object.kind === 'forge') {
    ctx.fillStyle = '#292a29';
    roundRect(ctx, -tile * .64, -tile * .55, tile * 1.28, tile * 1.12, tile * .08);
    ctx.fill();
    ctx.fillStyle = '#9b4635';
    ctx.beginPath();
    ctx.arc(0, 0, tile * .37, 0, Math.PI * 2);
    ctx.fill();
    const forgeGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, tile * .85);
    forgeGlow.addColorStop(0, 'rgba(255, 198, 85, .72)');
    forgeGlow.addColorStop(1, 'rgba(230, 97, 48, 0)');
    ctx.fillStyle = forgeGlow;
    ctx.fillRect(-tile, -tile, tile * 2, tile * 2);
    ctx.fillStyle = '#ffd47c';
    ctx.beginPath();
    ctx.arc(0, 0, tile * (.15 + Math.sin(phase * 7) * .02), 0, Math.PI * 2);
    ctx.fill();
  } else if (object.kind === 'portal') {
    ctx.strokeStyle = '#5d9a83';
    ctx.lineWidth = tile * .16;
    ctx.beginPath();
    ctx.arc(0, 0, tile * .52, Math.PI, 0);
    ctx.lineTo(tile * .52, tile * .5);
    ctx.moveTo(-tile * .52, 0);
    ctx.lineTo(-tile * .52, tile * .5);
    ctx.stroke();
    const portal = ctx.createRadialGradient(0, tile * .12, 0, 0, tile * .12, tile * .7);
    portal.addColorStop(0, `rgba(120, 211, 187, ${.25 + Math.sin(phase * 2) * .08})`);
    portal.addColorStop(1, 'rgba(70, 135, 119, 0)');
    ctx.fillStyle = portal;
    ctx.fillRect(-tile * .65, -tile * .55, tile * 1.3, tile * 1.2);
  } else {
    ctx.fillStyle = object.kind === 'roster' ? '#6a4b2c' : object.kind === 'tavern' ? '#553029' : '#473326';
    roundRect(ctx, -tile * .52, -tile * .58, tile * 1.04, tile * 1.02, tile * .08);
    ctx.fill();
    ctx.fillStyle = object.kind === 'roster' ? '#c7b88a' : object.kind === 'tavern' ? '#c67b61' : '#d1bd83';
    ctx.fillRect(-tile * .39, -tile * .45, tile * .78, tile * .62);
    ctx.strokeStyle = '#695136';
    ctx.beginPath();
    ctx.moveTo(-tile * .28, -tile * .28);
    ctx.lineTo(tile * .27, -tile * .28);
    ctx.moveTo(-tile * .2, -tile * .12);
    ctx.lineTo(tile * .3, -tile * .12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLightOverlay(ctx, art, frame, x, y, width, height, alpha = 1) {
  if (!art?.lighting) return false;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const drawn = drawAtlasFrame(ctx, art.lighting, frame, 4, 3, x, y, width, height, alpha);
  ctx.restore();
  return drawn;
}

function drawObjectReaction(ctx, visual, tile, time, strength) {
  if (!strength) return;
  const pulse = .72 + Math.sin(time * .009) * .28;
  ctx.save();
  ctx.globalAlpha = Math.min(1, strength * .9);
  ctx.lineWidth = Math.max(1.5, tile * .035);
  if (visual.response === 'seal') {
    ctx.strokeStyle = '#dfc276';
    ctx.beginPath();
    ctx.arc(0, -tile * .95, tile * (.2 + strength * .06), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(139, 52, 43, .72)';
    ctx.beginPath();
    ctx.arc(0, -tile * .95, tile * .1, 0, Math.PI * 2);
    ctx.fill();
  } else if (visual.response === 'drawer') {
    ctx.strokeStyle = '#d8c895';
    for (let row = 0; row < 3; row += 1) {
      const slide = (row % 2 ? -1 : 1) * strength * tile * .12;
      ctx.strokeRect(-tile * .34 + slide, -tile * (1.24 - row * .18), tile * .68, tile * .12);
    }
  } else if (visual.response === 'map') {
    ctx.strokeStyle = '#d8c783';
    ctx.beginPath();
    ctx.moveTo(-tile * .55, -tile * .72);
    ctx.quadraticCurveTo(0, -tile * (.9 + strength * .1), tile * .55, -tile * .72);
    ctx.stroke();
    for (const offset of [-.34, 0, .34]) {
      ctx.fillStyle = offset ? '#728a75' : '#b9a05c';
      ctx.beginPath();
      ctx.arc(offset * tile * (1 - strength * .18), -tile * .67, tile * .055, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (visual.response === 'vault') {
    ctx.strokeStyle = `rgba(241, 202, 98, ${pulse})`;
    ctx.beginPath();
    ctx.arc(0, -tile * .82, tile * (.31 + strength * .06), -.7, Math.PI * 1.7);
    ctx.stroke();
    ctx.fillStyle = '#e5b64f';
    for (let index = 0; index < 4; index += 1) {
      const angle = time * .004 + index * Math.PI / 2;
      ctx.fillRect(Math.cos(angle) * tile * .31 - 2, -tile * .82 + Math.sin(angle) * tile * .2 - 2, 4, 4);
    }
  } else if (visual.response === 'lantern') {
    const glow = ctx.createRadialGradient(0, -tile * .78, 0, 0, -tile * .78, tile * 1.15);
    glow.addColorStop(0, `rgba(246, 181, 77, ${.3 * strength * pulse})`);
    glow.addColorStop(1, 'rgba(246, 181, 77, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-tile * 1.2, -tile * 1.95, tile * 2.4, tile * 2.4);
  } else if (visual.response === 'council') {
    ctx.strokeStyle = `rgba(150, 187, 183, ${.78 * pulse})`;
    for (let ring = 0; ring < 3; ring += 1) {
      ctx.beginPath();
      ctx.ellipse(0, -tile * .18, tile * (.42 + ring * .18 + strength * .08), tile * (.14 + ring * .06), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (visual.response === 'gate') {
    ctx.strokeStyle = `rgba(132, 205, 183, ${.82 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(-tile * .4, -tile * .1);
    ctx.quadraticCurveTo(0, -tile * (1.6 + strength * .12), tile * .4, -tile * .1);
    ctx.stroke();
  } else if (visual.response === 'forge') {
    ctx.fillStyle = `rgba(255, 156, 64, ${.42 * pulse})`;
    for (let ember = 0; ember < 6; ember += 1) {
      const seed = (time * .0012 + ember * .173) % 1;
      ctx.fillRect(Math.sin(seed * 17) * tile * .42, -tile * (.52 + seed * 1.05), 3, 3);
    }
  }
  ctx.restore();
}

function drawObjectVisual(ctx, object, tile, time, state, art) {
  const visual = REALM_OBJECT_VISUALS[object.id];
  if (!visual || !art?.landmarks) {
    drawObjectBase(ctx, object, tile, time, state);
    return;
  }
  const copy = OBJECT_COPY[object.id] || { accent: '#c8ab68' };
  const selected = state.selected || state.nearby || state.hovered;
  const interactionStrength = state.interaction
    ? realmInteractionEnvelope(state.interaction.startedAt, time, state.interaction.phase)
    : 0;
  const width = tile * visual.width;
  const height = tile * visual.height;
  ctx.save();
  ctx.translate(object.x * tile, projectRealmY(object.y, tile));

  ctx.fillStyle = 'rgba(1, 4, 3, .56)';
  ctx.beginPath();
  ctx.ellipse(0, tile * .2, width * .31, tile * .27, 0, 0, Math.PI * 2);
  ctx.fill();
  if (selected || interactionStrength) {
    ctx.strokeStyle = copy.accent;
    ctx.globalAlpha = .46 + interactionStrength * .38 + Math.sin(time * .004) * .08;
    ctx.lineWidth = state.nearby ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.ellipse(0, tile * .16, width * .34, tile * .3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const lightAlpha = selected ? .2 : .09;
  drawLightOverlay(ctx, art, visual.lightFrame, -width * .56, -height * .52, width * 1.12, height * .72, lightAlpha + interactionStrength * .32);

  ctx.save();
  ctx.translate(0, -tile * .04 * interactionStrength);
  const objectScale = 1 + interactionStrength * .024;
  ctx.scale(objectScale, objectScale);
  drawAtlasFrame(ctx, art.landmarks, visual.frame, 4, 2, -width / 2, -height * .87, width, height, 1);
  drawObjectReaction(ctx, visual, tile, time, interactionStrength);
  ctx.restore();

  if (state.rewarded) {
    ctx.strokeStyle = `rgba(245, 205, 99, ${.55 + Math.sin(time * .008) * .16})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, tile * .1, width * .38, tile * .34, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOccluder(ctx, node, tile, art) {
  if (!art?.occluders) return;
  const width = node.width * tile;
  const height = node.height * tile;
  drawAtlasFrame(
    ctx,
    art.occluders,
    node.frame,
    4,
    3,
    node.x * tile - width / 2,
    projectRealmY(node.y, tile) - height * .9,
    width,
    height,
    .98,
  );
}

function facingVector(facing) {
  const map = {
    up: [0, -1], 'up-right': [.7, -.7], right: [1, 0], 'down-right': [.7, .7],
    down: [0, 1], 'down-left': [-.7, .7], left: [-1, 0], 'up-left': [-.7, -.7],
  };
  return map[facing] || map.down;
}

function actorFacingColumn(faceX, faceY) {
  if (Math.abs(faceX) > Math.abs(faceY) * .72) return faceX >= 0 ? 3 : 1;
  return faceY < 0 ? 2 : 0;
}

function drawForgedActorSkin(ctx, art, race, base, faceX, faceY, gait, bounce, interactionStrength, rewarded) {
  const row = REALM_CHARACTER_ATLAS_ROWS[race.id];
  if (!Number.isFinite(row) || !art?.characterTurnaround) return false;
  const actionPose = interactionStrength > .08 || rewarded;
  const sheet = actionPose && art.characterInteractions ? art.characterInteractions : art.characterTurnaround;
  const column = actionPose ? (rewarded && interactionStrength <= .08 ? 3 : 2) : actorFacingColumn(faceX, faceY);
  const frame = row * 4 + column;
  const height = base * (race.id === 'dwarf' ? 2.18 : 2.42);
  const width = height * 1.25;
  ctx.save();
  ctx.translate(gait * base * .018, base * .16 - bounce * .22 - interactionStrength * base * .035);
  ctx.rotate(gait * .012 + faceX * interactionStrength * .018);
  ctx.scale(1 - Math.abs(gait) * .012, 1 + Math.abs(gait) * .01);
  if (actionPose && faceX < -.25) ctx.scale(-1, 1);
  const drawn = drawAtlasFrame(ctx, sheet, frame, 4, 5, -width / 2, -height * .92, width, height, 1);
  ctx.restore();
  return drawn;
}

function drawActor(ctx, actor, tile, time, options = {}) {
  const archetype = actor.archetype || classifyRealmActor(actor);
  const race = archetype.race;
  const guildClass = archetype.guildClass;
  const motion = actor.motion || createRealmMotionState(actor);
  const interaction = options.interaction;
  const interactionStrength = interaction
    ? realmInteractionEnvelope(interaction.startedAt, time, interaction.phase)
    : 0;
  const moving = !interactionStrength && (motion.locomotion === 'walk' || motion.locomotion === 'start');
  const gait = moving ? Math.sin(motion.gaitTime * Math.PI * 2.25 * race.gait) : Math.sin(time * .0018 + actor.x) * .05;
  const bounce = options.reducedMotion ? 0 : moving ? Math.abs(gait) * tile * .045 : Math.sin(time * .0015 + actor.y) * tile * .015;
  const facing = interactionStrength ? realmObjectFacing(actor, interaction.object) : motion.facing;
  const [faceX, faceY] = facingVector(facing);
  const side = Math.abs(faceX) > .4 ? Math.sign(faceX) : 1;
  const scale = race.scale * (options.player ? 1.07 : 1);
  const base = tile * scale;
  const x = actor.x * tile;
  const y = projectRealmY(actor.y, tile);
  const status = STATUS_COLORS[actor.status] || STATUS_COLORS.available;
  const emote = options.emote;
  ctx.save();
  ctx.translate(
    x + faceX * base * .085 * interactionStrength,
    y - bounce + faceY * base * .03 * interactionStrength,
  );

  const contactShadowWidth = base * (race.id === 'dwarf' ? .82 : .94);
  const contactShadowHeight = base * .36;
  const drewContactShadow = drawAtlasFrame(
    ctx,
    options.art?.lighting,
    race.id === 'dwarf' ? 8 : 9,
    4,
    3,
    -contactShadowWidth / 2,
    tile * .02,
    contactShadowWidth,
    contactShadowHeight,
    .64,
  );
  if (!drewContactShadow) {
    ctx.fillStyle = 'rgba(1, 4, 3, .52)';
    ctx.beginPath();
    ctx.ellipse(0, tile * .16 + bounce, base * .32, base * .12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (options.player) {
    ctx.strokeStyle = '#e5bd61';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, tile * .17 + bounce, base * .46, base * .18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (options.voice) {
    const pulse = .82 + Math.sin(time * .006) * .14;
    ctx.strokeStyle = `rgba(111, 202, 171, ${pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, tile * .17 + bounce, base * .58, base * .23, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (options.rewarded) {
    const aura = .36 + Math.sin(time * .009) * .1;
    ctx.strokeStyle = `rgba(246, 207, 108, ${aura})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -base * .55, base * (.72 + Math.sin(time * .006) * .04), 0, Math.PI * 2);
    ctx.stroke();
  }

  const headY = -base * 1.13;
  const headRadius = base * .24 * race.head;
  const forgedActor = drawForgedActorSkin(
    ctx,
    options.art,
    race,
    base,
    faceX,
    faceY,
    gait,
    bounce,
    interactionStrength,
    options.rewarded,
  );
  if (!forgedActor) {
  if (race.id === 'tiefling') {
    ctx.strokeStyle = archetype.skin;
    ctx.lineWidth = base * .09;
    ctx.beginPath();
    ctx.moveTo(base * .12, -base * .4);
    ctx.bezierCurveTo(base * .62, -base * .18, base * .58, base * .2, base * .86, base * .04);
    ctx.stroke();
    ctx.fillStyle = archetype.skin;
    ctx.beginPath();
    ctx.moveTo(base * .84, base * .04);
    ctx.lineTo(base * 1.03, -base * .04);
    ctx.lineTo(base * .9, base * .18);
    ctx.closePath();
    ctx.fill();
  }

  const legSwing = options.reducedMotion ? 0 : gait * base * .14;
  const hipY = -base * .43;
  const footY = base * .07;
  ctx.lineCap = 'round';
  ctx.lineWidth = base * .13;
  ctx.strokeStyle = '#242621';
  ctx.beginPath();
  ctx.moveTo(-base * .12, hipY);
  ctx.lineTo(-base * .12 + legSwing, footY);
  ctx.moveTo(base * .12, hipY);
  ctx.lineTo(base * .12 - legSwing, footY);
  ctx.stroke();
  ctx.strokeStyle = '#171b18';
  ctx.lineWidth = base * .16;
  ctx.beginPath();
  ctx.moveTo(-base * .12 + legSwing, footY);
  ctx.lineTo(-base * .18 + legSwing + faceX * base * .05, footY + base * .02);
  ctx.moveTo(base * .12 - legSwing, footY);
  ctx.lineTo(base * .18 - legSwing + faceX * base * .05, footY + base * .02);
  ctx.stroke();

  const torsoTop = -base * .93;
  const torsoBottom = -base * .38;
  const shoulder = base * .31 * race.shoulder;
  if (guildClass.id === 'steward' || guildClass.id === 'archivist') {
    ctx.fillStyle = guildClass.id === 'steward' ? '#27493e' : '#3c334e';
    ctx.beginPath();
    ctx.moveTo(-shoulder * .72, torsoTop + base * .08);
    ctx.lineTo(-base * .34, torsoBottom + base * .28);
    ctx.quadraticCurveTo(0, torsoBottom + base * .4 + gait * base * .04, base * .34, torsoBottom + base * .28);
    ctx.lineTo(shoulder * .72, torsoTop + base * .08);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = guildClass.primary;
  ctx.beginPath();
  ctx.moveTo(-shoulder, torsoTop + base * .08);
  ctx.quadraticCurveTo(-shoulder * .88, torsoBottom, -base * .18, torsoBottom);
  ctx.lineTo(base * .18, torsoBottom);
  ctx.quadraticCurveTo(shoulder * .88, torsoBottom, shoulder, torsoTop + base * .08);
  ctx.quadraticCurveTo(0, torsoTop - base * .04, -shoulder, torsoTop + base * .08);
  ctx.fill();
  ctx.strokeStyle = 'rgba(235, 222, 185, .2)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = guildClass.secondary;
  ctx.fillRect(-base * .2, torsoBottom - base * .09, base * .4, base * .1);
  if (guildClass.id === 'warden' || guildClass.id === 'engineer') {
    ctx.fillStyle = guildClass.secondary;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(dir * shoulder * .82, torsoTop + base * .12, base * .15, base * .1, dir * .24, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (guildClass.id === 'goldkeeper') {
    ctx.fillStyle = '#f0ca68';
    ctx.beginPath();
    ctx.arc(0, torsoTop + base * .22, base * .075, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#72501f';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  let leftArm = -gait * .44;
  let rightArm = gait * .44;
  if (emote?.id === 'wave') rightArm = -1.35 + Math.sin(time * .012) * .35;
  if (emote?.id === 'celebrate') { leftArm = 1.45; rightArm = -1.45; }
  if (emote?.id === 'thanks') { leftArm = -.28; rightArm = .28; }
  if (emote?.id === 'help') rightArm = -1.55;
  if (interactionStrength) {
    if (Math.abs(faceX) > .45) {
      rightArm = faceX > 0 ? 1.32 : -.18;
      leftArm = faceX < 0 ? -1.32 : .18;
    } else if (faceY < 0) {
      leftArm = 2.25;
      rightArm = -2.25;
    } else {
      leftArm = -.68;
      rightArm = .68;
    }
  }
  const armLength = base * .48;
  ctx.strokeStyle = guildClass.primary;
  ctx.lineWidth = base * .13;
  ctx.beginPath();
  ctx.moveTo(-shoulder * .82, torsoTop + base * .14);
  ctx.lineTo(-shoulder * .82 + Math.sin(leftArm) * armLength * .45, torsoTop + base * .14 + Math.cos(leftArm) * armLength);
  ctx.moveTo(shoulder * .82, torsoTop + base * .14);
  ctx.lineTo(shoulder * .82 + Math.sin(rightArm) * armLength * .45, torsoTop + base * .14 + Math.cos(rightArm) * armLength);
  ctx.stroke();

  if (race.id === 'elf' || race.id === 'half-orc' || race.id === 'tiefling') {
    ctx.fillStyle = archetype.skin;
    const ear = base * .21 * race.ears;
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(dir * headRadius * .6, headY);
      ctx.lineTo(dir * (headRadius + ear), headY - base * .04);
      ctx.lineTo(dir * headRadius * .63, headY + base * .12);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = archetype.skin;
  ctx.beginPath();
  ctx.ellipse(faceX * base * .035, headY, headRadius * (Math.abs(faceX) > .5 ? .82 : 1), headRadius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = archetype.hair;
  ctx.beginPath();
  ctx.arc(faceX * base * .02, headY - headRadius * .18, headRadius * .95, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineTo(headRadius * .7, headY - headRadius * .1);
  ctx.quadraticCurveTo(0, headY - headRadius * 1.15, -headRadius * .7, headY - headRadius * .1);
  ctx.fill();
  if (race.id === 'dwarf') {
    ctx.fillStyle = archetype.hair;
    ctx.beginPath();
    ctx.moveTo(-headRadius * .72, headY + headRadius * .22);
    ctx.quadraticCurveTo(0, headY + headRadius * 1.6, headRadius * .72, headY + headRadius * .22);
    ctx.quadraticCurveTo(0, headY + headRadius * .82, -headRadius * .72, headY + headRadius * .22);
    ctx.fill();
  }
  if (race.id === 'tiefling') {
    ctx.strokeStyle = '#403029';
    ctx.lineWidth = base * .07;
    ctx.beginPath();
    ctx.moveTo(-headRadius * .42, headY - headRadius * .72);
    ctx.quadraticCurveTo(-headRadius * .8, headY - headRadius * 1.45, -headRadius * .18, headY - headRadius * 1.6);
    ctx.moveTo(headRadius * .42, headY - headRadius * .72);
    ctx.quadraticCurveTo(headRadius * .8, headY - headRadius * 1.45, headRadius * .18, headY - headRadius * 1.6);
    ctx.stroke();
  }
  if (race.id === 'half-orc') {
    ctx.fillStyle = '#ead7b6';
    ctx.beginPath();
    ctx.moveTo(-headRadius * .42, headY + headRadius * .48);
    ctx.lineTo(-headRadius * .25, headY + headRadius * .9);
    ctx.lineTo(-headRadius * .12, headY + headRadius * .45);
    ctx.moveTo(headRadius * .42, headY + headRadius * .48);
    ctx.lineTo(headRadius * .25, headY + headRadius * .9);
    ctx.lineTo(headRadius * .12, headY + headRadius * .45);
    ctx.fill();
  }

  if (guildClass.id === 'engineer') {
    ctx.strokeStyle = '#d8a35c';
    ctx.lineWidth = Math.max(1.5, base * .045);
    ctx.beginPath();
    ctx.arc(-headRadius * .34, headY, headRadius * .26, 0, Math.PI * 2);
    ctx.arc(headRadius * .34, headY, headRadius * .26, 0, Math.PI * 2);
    ctx.moveTo(-headRadius * .08, headY);
    ctx.lineTo(headRadius * .08, headY);
    ctx.stroke();
  } else if (guildClass.id === 'warden') {
    ctx.fillStyle = 'rgba(63, 72, 91, .9)';
    ctx.fillRect(-headRadius * .82, headY - headRadius * .75, headRadius * 1.64, headRadius * .28);
    ctx.fillStyle = guildClass.secondary;
    ctx.fillRect(-base * .035, headY - headRadius * .96, base * .07, headRadius * .46);
  }

  ctx.fillStyle = '#1c2420';
  const eyeY = headY - headRadius * .03;
  ctx.beginPath();
  ctx.arc(faceX * base * .055 - headRadius * .34, eyeY + faceY * base * .02, Math.max(1.2, base * .022), 0, Math.PI * 2);
  ctx.arc(faceX * base * .055 + headRadius * .34, eyeY + faceY * base * .02, Math.max(1.2, base * .022), 0, Math.PI * 2);
  ctx.fill();

  if (guildClass.tool === 'sword') {
    ctx.strokeStyle = '#aeb8b3';
    ctx.lineWidth = base * .045;
    ctx.beginPath();
    ctx.moveTo(shoulder * 1.02, torsoTop + base * .05);
    ctx.lineTo(shoulder * 1.36, torsoBottom - base * .22);
    ctx.stroke();
  } else if (guildClass.tool === 'hammer') {
    ctx.strokeStyle = '#684b32';
    ctx.lineWidth = base * .055;
    ctx.beginPath();
    ctx.moveTo(shoulder * .9, torsoBottom - base * .03);
    ctx.lineTo(shoulder * 1.25, torsoBottom + base * .34);
    ctx.stroke();
    ctx.fillStyle = '#77817c';
    ctx.fillRect(shoulder * 1.04, torsoBottom + base * .25, base * .37, base * .12);
  } else if (guildClass.tool === 'book' || guildClass.tool === 'ledger') {
    ctx.fillStyle = guildClass.tool === 'ledger' ? '#7a5428' : '#44385d';
    const bookX = guildClass.tool === 'ledger' ? shoulder * .78 * side : 0;
    roundRect(ctx, bookX - base * .2, torsoBottom - base * .22, base * .4, base * .28, base * .035);
    ctx.fill();
    ctx.strokeStyle = guildClass.secondary;
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#8a6b3f';
    ctx.lineWidth = base * .055;
    ctx.beginPath();
    ctx.moveTo(-shoulder * 1.1, torsoTop - base * .05);
    ctx.lineTo(-shoulder * 1.18, footY);
    ctx.stroke();
  }
  }

  const fullLabel = actor.name || 'Guild member';
  const labelParts = fullLabel.split(' · ');
  const label = options.player
    ? 'Bạn'
    : options.compactLabel && labelParts.length > 1
      ? `${labelParts[0]}${labelParts.at(-1) === 'demo' ? ' · demo' : ''}`
      : fullLabel;
  ctx.font = `700 ${Math.max(10, tile * .22)}px "Be Vietnam Pro", system-ui, sans-serif`;
  const textWidth = ctx.measureText(label).width;
  const labelY = forgedActor
    ? -base * (race.id === 'dwarf' ? 1.65 : race.id === 'tiefling' ? 1.95 : 1.82)
    : headY - headRadius * (race.id === 'tiefling' ? 2.05 : 1.35);
  ctx.fillStyle = 'rgba(5, 10, 8, .86)';
  roundRect(ctx, -textWidth / 2 - 12, labelY - 10, textWidth + 24, 20, 5);
  ctx.fill();
  ctx.strokeStyle = options.player ? 'rgba(225, 189, 104, .5)' : 'rgba(224, 213, 183, .16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f4eee0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, labelY);
  ctx.fillStyle = status;
  ctx.beginPath();
  ctx.arc(textWidth / 2 + 7, labelY, 3.2, 0, Math.PI * 2);
  ctx.fill();

  if (emote) {
    const bubbleY = labelY - 24 - Math.sin(time * .008) * 2;
    ctx.fillStyle = '#eee7d7';
    roundRect(ctx, -20, bubbleY - 13, 40, 26, 7);
    ctx.fill();
    ctx.fillStyle = '#25251f';
    ctx.font = `900 ${Math.max(10, tile * .24)}px ui-monospace, monospace`;
    ctx.fillText(emote.mark || '?', 0, bubbleY);
  }
  ctx.restore();
}

function drawRoute(ctx, route, tile, time) {
  if (!route?.path?.length) return;
  const start = route.origin;
  ctx.save();
  ctx.strokeStyle = 'rgba(229, 194, 111, .7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([tile * .14, tile * .2]);
  ctx.lineDashOffset = -(time * .015) % (tile * .34);
  ctx.beginPath();
  ctx.moveTo(start.x * tile, projectRealmY(start.y, tile));
  for (let index = route.index; index < route.path.length; index += 1) ctx.lineTo(route.path[index].x * tile, projectRealmY(route.path[index].y, tile));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawParticles(ctx, effects, tile) {
  for (const particle of effects) {
    ctx.save();
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.translate(particle.x * tile, projectRealmY(particle.y, tile));
    if (particle.kind === 'gold') {
      ctx.fillStyle = '#e7bd51';
      ctx.beginPath();
      ctx.ellipse(0, 0, tile * .075, tile * .04, particle.spin, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff0a8';
      ctx.stroke();
    } else if (particle.kind === 'dust') {
      ctx.fillStyle = particle.color || '#b7aa86';
      ctx.beginPath();
      ctx.ellipse(0, 0, tile * .04, tile * .018, particle.spin, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = particle.color || '#e18853';
      ctx.fillRect(-2, -2, 4, 4);
    }
    ctx.restore();
  }
}

function drawScreenTreatment(ctx, width, height) {
  const vignette = ctx.createRadialGradient(width / 2, height * .46, Math.min(width, height) * .2, width / 2, height * .46, Math.max(width, height) * .68);
  vignette.addColorStop(0, 'rgba(2, 6, 4, 0)');
  vignette.addColorStop(.72, 'rgba(2, 6, 4, .12)');
  vignette.addColorStop(1, 'rgba(1, 3, 2, .65)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  const topShade = ctx.createLinearGradient(0, 0, 0, height);
  topShade.addColorStop(0, 'rgba(3, 7, 5, .5)');
  topShade.addColorStop(.22, 'rgba(3, 7, 5, 0)');
  topShade.addColorStop(.78, 'rgba(3, 7, 5, 0)');
  topShade.addColorStop(1, 'rgba(3, 7, 5, .48)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, width, height);
}

function buildScreenTreatment(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  drawScreenTreatment(canvas.getContext('2d'), width, height);
  return canvas;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);
  return reduced;
}

function createAudioEngine() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = .075;
  master.connect(context.destination);
  const drone = context.createOscillator();
  const droneGain = context.createGain();
  drone.type = 'sine';
  drone.frequency.value = 73;
  droneGain.gain.value = .055;
  drone.connect(droneGain).connect(master);
  drone.start();
  return {
    context,
    master,
    tone(kind = 'step') {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === 'gold' ? 'triangle' : kind === 'interact' ? 'sine' : 'square';
      oscillator.frequency.value = kind === 'gold' ? 660 : kind === 'interact' ? 280 : 92;
      gain.gain.setValueAtTime(kind === 'step' ? .018 : .05, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + (kind === 'gold' ? .24 : .1));
      oscillator.connect(gain).connect(master);
      oscillator.start();
      oscillator.stop(context.currentTime + (kind === 'gold' ? .25 : .11));
    },
    close() { drone.stop(); context.close(); },
  };
}

export default function RealmWorldV3({
  activePanel,
  playerStatus,
  playerProfile,
  position,
  staff = [],
  remotePlayers = [],
  activeEmotes = {},
  sessionId,
  onPosition,
  onNearby,
  onObjectOpen,
  onPerson,
  onEmote,
  wallet = 0,
  demoMode = false,
}) {
  const { t } = useLanguage();
  const reducedMotion = useReducedMotion();
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const staticLayerRef = useRef({ tile: 0, canvas: null, artReady: false });
  const artRef = useRef(null);
  const torchLightRef = useRef({ tile: 0, canvas: null });
  const screenLayerRef = useRef({ width: 0, height: 0, canvas: null });
  const keysRef = useRef(new Set());
  const callbacksRef = useRef({ onPosition, onNearby, onObjectOpen, onPerson });
  const audioRef = useRef(null);
  const timersRef = useRef(new Set());
  const walletRef = useRef(Number(wallet) || 0);
  const runtimeRef = useRef({
    motion: createRealmMotionState(normalizeWorldPosition(position)),
    camera: createRealmCameraState(normalizeWorldPosition(position)),
    route: null,
    selectedObject: null,
    hoveredObject: null,
    interaction: null,
    remotes: new Map(),
    demoActors: new Map(),
    effects: [],
    frameSamples: [],
    renderSamples: [],
    lastFootstep: 0,
    viewport: { width: 1, height: 1, dpr: 1, tile: 46, offsetX: 0, offsetY: 0 },
  });
  const people = useMemo(() => normalizeRealmWorldPeople({
    people: [...staff, ...remotePlayers],
    self: { ...playerProfile, id: sessionId },
  }), [playerProfile, remotePlayers, sessionId, staff]);
  const peopleRef = useRef(people);
  const playerArchetype = useMemo(() => classifyRealmActor({ ...playerProfile, id: sessionId }), [playerProfile, sessionId]);
  const [nearbyObject, setNearbyObject] = useState(null);
  const [selectedObject, setSelectedObject] = useState(null);
  const [nearbyPerson, setNearbyPerson] = useState(null);
  const [journey, setJourney] = useState(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  const [touchOpen, setTouchOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [rewardCallout, setRewardCallout] = useState(null);
  const [waygate, setWaygate] = useState(false);
  const [arrival, setArrival] = useState(!reducedMotion);
  const [artReady, setArtReady] = useState(false);
  const [quality, setQuality] = useState(() => ({ id: 'medium', dpr: 1, particles: 28, lights: 10, ambientActors: 2 }));
  const [metrics, setMetrics] = useState({ fps: 0, p95: 0, renderP95: 0 });
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    let active = true;
    loadRealmRuntimeArt().then((art) => {
      if (!active) return;
      artRef.current = art;
      staticLayerRef.current = { tile: 0, canvas: null, artReady: true };
      setArtReady(true);
    }).catch(() => {
      if (active) setArtReady(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.demoActors.clear();
    if (!demoMode) return;
    for (const actor of DEMO_ACTORS) runtime.demoActors.set(actor.id, {
      ...actor,
      waypointIndex: 1,
      archetype: classifyRealmActor(actor),
      motion: createRealmMotionState(actor),
    });
  }, [demoMode]);

  useEffect(() => { callbacksRef.current = { onPosition, onNearby, onObjectOpen, onPerson }; }, [onNearby, onObjectOpen, onPerson, onPosition]);
  useEffect(() => { peopleRef.current = people; }, [people]);
  useEffect(() => {
    const current = runtimeRef.current.motion;
    const next = normalizeWorldPosition(position);
    if (distance(current, next) > 1.5) {
      runtimeRef.current.motion = createRealmMotionState(next);
      runtimeRef.current.camera = createRealmCameraState(next);
      runtimeRef.current.route = null;
    }
  }, [position]);
  useEffect(() => {
    setDebug(new URLSearchParams(window.location.search).get('realmDebug') === '1');
    if (reducedMotion) setArrival(false);
    const timer = window.setTimeout(() => setArrival(false), 720);
    timersRef.current.add(timer);
    return () => {
      window.clearTimeout(timer);
      timersRef.current.delete(timer);
    };
  }, [reducedMotion]);

  const spawnEffect = useCallback((kind, count, origin) => {
    const runtime = runtimeRef.current;
    const capped = Math.min(count, quality.particles);
    for (let index = 0; index < capped; index += 1) {
      const angle = Math.PI * 2 * index / Math.max(1, capped) + (index % 3) * .17;
      const speed = .8 + (index % 7) * .14;
      runtime.effects.push({
        kind,
        x: origin.x,
        y: origin.y - .35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        gravity: kind === 'gold' ? 2.2 : .8,
        life: 1.1 + (index % 5) * .08,
        maxLife: 1.5,
        spin: angle,
        color: kind === 'gold' ? '#e7bd51' : '#df8951',
      });
    }
  }, [quality.particles]);

  useEffect(() => {
    const previous = walletRef.current;
    const next = Number(wallet) || 0;
    walletRef.current = next;
    if (next <= previous) return;
    const amount = next - previous;
    const actor = runtimeRef.current.motion;
    const sourceObject = runtimeRef.current.interaction?.object
      || WORLD_OBJECTS.find((object) => object.panel === activePanel)
      || null;
    const source = sourceObject || actor;
    const rewardedUntil = performance.now() + (reducedMotion ? 900 : 2400);
    runtimeRef.current.rewardedUntil = rewardedUntil;
    runtimeRef.current.rewardObject = sourceObject ? { id: sourceObject.id, until: rewardedUntil } : null;
    spawnEffect('gold', 18 + Math.min(16, amount * 2), source);
    audioRef.current?.tone('gold');
    setRewardCallout({ amount, id: Date.now() });
    const timer = window.setTimeout(() => setRewardCallout(null), reducedMotion ? 1500 : 2600);
    timersRef.current.add(timer);
    return () => {
      window.clearTimeout(timer);
      timersRef.current.delete(timer);
    };
  }, [activePanel, reducedMotion, spawnEffect, wallet]);

  const beginInteraction = useCallback((object) => {
    if (!object || runtimeRef.current.interaction?.object?.id === object.id) return;
    const copy = OBJECT_COPY[object.id];
    runtimeRef.current.route = null;
    runtimeRef.current.motion.vx = 0;
    runtimeRef.current.motion.vy = 0;
    runtimeRef.current.motion.locomotion = 'idle';
    runtimeRef.current.motion.facing = realmObjectFacing(runtimeRef.current.motion, object);
    runtimeRef.current.interaction = { object, phase: 'acting', startedAt: performance.now() };
    setJourney({ object, phase: 'acting', progress: copy?.verb || object.name });
    setSelectedObject(object);
    audioRef.current?.tone('interact');
    spawnEffect(object.kind === 'chest' ? 'gold' : 'spark', object.kind === 'chest' ? 14 : 8, object);
    const openTimer = window.setTimeout(() => {
      const interaction = runtimeRef.current.interaction;
      if (!interaction || interaction.object.id !== object.id) return;
      interaction.phase = 'succeeded';
      setJourney({ object, phase: 'succeeded', progress: 'Bàn làm việc đã sẵn sàng' });
      callbacksRef.current.onObjectOpen(object);
    }, reducedMotion ? 40 : 520);
    const restoreTimer = window.setTimeout(() => {
      if (runtimeRef.current.interaction?.object?.id === object.id) runtimeRef.current.interaction = null;
      setJourney((current) => current?.object?.id === object.id ? null : current);
    }, reducedMotion ? 240 : 1500);
    timersRef.current.add(openTimer);
    timersRef.current.add(restoreTimer);
  }, [reducedMotion, spawnEffect]);

  const routeTo = useCallback((target, object = null) => {
    const runtime = runtimeRef.current;
    const safeTarget = normalizeWorldPosition(target);
    const path = findRealmPath({
      start: runtime.motion,
      target: safeTarget,
      cols: WORLD.cols,
      rows: WORLD.rows,
      isWalkable: isWorldPositionWalkable,
    });
    if (!path.length) return false;
    runtime.route = { path, index: 0, object, origin: { x: runtime.motion.x, y: runtime.motion.y } };
    runtime.selectedObject = object;
    setSelectedObject(object);
    setJourney(object ? { object, phase: 'traveling', progress: 'Đang tìm đường' } : null);
    return true;
  }, []);

  const waygateTo = useCallback((object) => {
    if (!object || waygate) return;
    setLocationOpen(false);
    setSelectedObject(object);
    setWaygate(true);
    setJourney({ object, phase: 'waygate', progress: 'Đang đi qua Waygate' });
    const moveTimer = window.setTimeout(() => {
      const target = pathToObject(object);
      runtimeRef.current.motion = createRealmMotionState(target);
      runtimeRef.current.camera = createRealmCameraState(target);
      runtimeRef.current.route = null;
      callbacksRef.current.onPosition(target, object);
    }, reducedMotion ? 20 : 180);
    const openTimer = window.setTimeout(() => {
      setWaygate(false);
      beginInteraction(object);
    }, reducedMotion ? 50 : 430);
    timersRef.current.add(moveTimer);
    timersRef.current.add(openTimer);
  }, [beginInteraction, reducedMotion, waygate]);

  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.objectId) {
        const object = WORLD_OBJECTS.find((item) => item.id === event.detail.objectId);
        if (object) return event.detail.direct ? waygateTo(object) : routeTo(pathToObject(object), object);
      }
      if (event.detail?.x == null || event.detail?.y == null) return;
      const object = WORLD_OBJECTS.find((item) => distance(item, event.detail) < .8) || null;
      if (event.detail.direct && object) waygateTo(object);
      else routeTo(object ? pathToObject(object) : event.detail, object);
    };
    window.addEventListener('realm:move', handler);
    return () => window.removeEventListener('realm:move', handler);
  }, [routeTo, waygateTo]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return undefined;
    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const tier = realmQualityTier({
        width: rect.width,
        devicePixelRatio: window.devicePixelRatio || 1,
        reducedMotion,
        saveData: navigator.connection?.saveData === true,
      });
      const tile = rect.width < 520 ? 43 : rect.width < 980 ? 45 : 48;
      canvas.width = Math.max(1, Math.round(rect.width * tier.dpr));
      canvas.height = Math.max(1, Math.round(rect.height * tier.dpr));
      runtimeRef.current.viewport = { ...runtimeRef.current.viewport, width: rect.width, height: rect.height, dpr: tier.dpr, tile };
      if (staticLayerRef.current.tile !== tile || staticLayerRef.current.artReady !== artReady) {
        staticLayerRef.current = { tile, canvas: buildStaticWorld(tile, artRef.current), artReady };
      }
      if (torchLightRef.current.tile !== tile) torchLightRef.current = { tile, canvas: buildTorchLight(tile) };
      if (screenLayerRef.current.width !== Math.ceil(rect.width) || screenLayerRef.current.height !== Math.ceil(rect.height)) {
        screenLayerRef.current = { width: Math.ceil(rect.width), height: Math.ceil(rect.height), canvas: buildScreenTreatment(rect.width, rect.height) };
      }
      setQuality((current) => current.id === tier.id && current.dpr === tier.dpr ? current : tier);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [artReady, reducedMotion]);

  useEffect(() => {
    const isTyping = (event) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName);
    const down = (event) => {
      if (isTyping(event)) return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
        runtimeRef.current.route = null;
        runtimeRef.current.interaction = null;
        setJourney(null);
        keysRef.current.add(key);
      }
      if (key === 'e') {
        const object = nearbyObject || selectedObject;
        if (object && distance(runtimeRef.current.motion, object) <= INTERACTION_RADIUS + .35) beginInteraction(object);
      }
      if (key === 'escape') {
        setLocationOpen(false);
        setSignalOpen(false);
        setTouchOpen(false);
        runtimeRef.current.route = null;
        setJourney(null);
      }
    };
    const up = (event) => keysRef.current.delete(event.key.toLowerCase());
    const reset = () => {
      keysRef.current.clear();
      runtimeRef.current.route = null;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
    };
  }, [beginInteraction, nearbyObject, selectedObject]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    let lastUiSync = 0;
    let lastMetricsSync = 0;

    const updateRemoteActors = (delta) => {
      const runtime = runtimeRef.current;
      const eligible = new Set();
      for (const person of peopleRef.current) {
        const key = person.realmIdentity;
        eligible.add(key);
        const targetX = Number(person.x);
        const targetY = Number(person.y);
        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) continue;
        let actor = runtime.remotes.get(key);
        if (!actor) {
          actor = { ...person, x: targetX, y: targetY, targetX, targetY, motion: createRealmMotionState({ x: targetX, y: targetY }) };
          runtime.remotes.set(key, actor);
        }
        actor.targetX = targetX;
        actor.targetY = targetY;
        actor.name = person.name;
        actor.status = person.status;
        actor.archetype = person.archetype;
        const beforeX = actor.x;
        const beforeY = actor.y;
        const smoothing = 1 - Math.exp(-delta * 9);
        actor.x = lerp(actor.x, actor.targetX, smoothing);
        actor.y = lerp(actor.y, actor.targetY, smoothing);
        const dx = actor.x - beforeX;
        const dy = actor.y - beforeY;
        actor.motion = stepRealmMotion(actor.motion, { x: dx * 20, y: dy * 20 }, delta, { maxSpeed: WALK_SPEED, acceleration: 20, isWalkable: () => true });
        actor.motion.x = actor.x;
        actor.motion.y = actor.y;
      }
      for (const key of runtime.remotes.keys()) if (!eligible.has(key)) runtime.remotes.delete(key);
    };

    const update = (delta, now) => {
      const runtime = runtimeRef.current;
      const keys = keysRef.current;
      let inputX = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      let inputY = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
      let route = runtime.route;
      if (!inputX && !inputY && route) {
        let waypoint = route.path[route.index];
        while (waypoint && distance(runtime.motion, waypoint) <= ROUTE_ARRIVAL) {
          route.index += 1;
          waypoint = route.path[route.index];
        }
        if (!waypoint) {
          runtime.route = null;
          if (route.object) beginInteraction(route.object);
          route = null;
        } else {
          const length = distance(runtime.motion, waypoint) || 1;
          inputX = (waypoint.x - runtime.motion.x) / length;
          inputY = (waypoint.y - runtime.motion.y) / length;
        }
      }
      const previousDistance = runtime.motion.distanceTravelled;
      runtime.motion = stepRealmMotion(runtime.motion, { x: inputX, y: inputY }, delta, {
        maxSpeed: WALK_SPEED,
        acceleration: route ? 25 : 28,
        deceleration: 36,
        isWalkable: isWorldPositionWalkable,
      });
      if (runtime.motion.distanceTravelled - runtime.lastFootstep >= .62) {
        runtime.lastFootstep = runtime.motion.distanceTravelled;
        if (soundOn) audioRef.current?.tone('step');
        if (!reducedMotion) {
          const side = Math.sin(runtime.motion.gaitTime * Math.PI * 2) > 0 ? 1 : -1;
          runtime.effects.push({
            kind: 'dust',
            x: runtime.motion.x + side * .11,
            y: runtime.motion.y + .12,
            vx: -runtime.motion.vx * .035,
            vy: -.08,
            gravity: -.02,
            life: .34,
            maxLife: .34,
            spin: side * .3,
            color: '#b8aa83',
          });
        }
      } else if (runtime.motion.distanceTravelled < previousDistance) runtime.lastFootstep = runtime.motion.distanceTravelled;
      const viewport = runtime.viewport;
      const halfW = viewport.width / viewport.tile / 2;
      const halfH = viewport.height / (viewport.tile * REALM_WORLD_Y_SCALE) / 2;
      const targetCamera = {
        x: clamp(runtime.motion.x, Math.min(WORLD.cols / 2, halfW), Math.max(WORLD.cols / 2, WORLD.cols - halfW)),
        y: clamp(runtime.motion.y, Math.min(WORLD.rows / 2, halfH), Math.max(WORLD.rows / 2, WORLD.rows - halfH)),
      };
      runtime.camera = stepRealmCamera(runtime.camera, targetCamera, delta, { frequency: reducedMotion ? 12 : 4.2, damping: .92, maxVelocity: reducedMotion ? 40 : 17 });
      updateRemoteActors(delta);
      for (const particle of runtime.effects) {
        particle.life -= delta;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vy += particle.gravity * delta;
        particle.spin += delta * 4;
      }
      runtime.effects = runtime.effects.filter((particle) => particle.life > 0);
      for (const actor of [...runtime.demoActors.values()].slice(0, quality.ambientActors)) {
        const target = actor.waypoints[actor.waypointIndex] || actor.waypoints[0];
        const remaining = Math.hypot(target[0] - actor.motion.x, target[1] - actor.motion.y);
        if (remaining < .22) {
          actor.waypointIndex = (actor.waypointIndex + 1) % actor.waypoints.length;
          continue;
        }
        actor.motion = stepRealmMotion(actor.motion, { x: (target[0] - actor.motion.x) / remaining, y: (target[1] - actor.motion.y) / remaining }, delta, {
          maxSpeed: 1.45,
          acceleration: 8,
          deceleration: 12,
          isWalkable: isWorldPositionWalkable,
        });
        actor.x = actor.motion.x;
        actor.y = actor.motion.y;
      }

      if (now - lastUiSync >= 100) {
        lastUiSync = now;
        const actor = runtime.motion;
        const nearestObject = WORLD_OBJECTS.reduce((best, object) => {
          const objectDistance = distance(actor, object);
          return !best || objectDistance < best.distance ? { object, distance: objectDistance } : best;
        }, null);
        const nearObject = nearestObject?.distance <= INTERACTION_RADIUS ? nearestObject.object : null;
        const zone = privateZoneAt(actor.x, actor.y);
        const nearbyPeople = [...runtime.remotes.values()].filter((person) => {
          const personZone = person.zoneId || privateZoneAt(person.x, person.y)?.id || null;
          return isInVoiceRange({ ...actor, zoneId: zone?.id || null }, { ...person, zoneId: personZone });
        });
        const nearestPerson = nearbyPeople.sort((a, b) => distance(actor, a) - distance(actor, b))[0] || null;
        setNearbyObject((current) => current?.id === nearObject?.id ? current : nearObject);
        setNearbyPerson((current) => current?.realmIdentity === nearestPerson?.realmIdentity ? current : nearestPerson);
        callbacksRef.current.onPosition({ x: actor.x, y: actor.y, zoneId: zone?.id || null }, nearObject);
        callbacksRef.current.onNearby(nearbyPeople, zone);
        if (canvasRef.current) {
          canvasRef.current.dataset.realmX = actor.x.toFixed(3);
          canvasRef.current.dataset.realmY = actor.y.toFixed(3);
          canvasRef.current.dataset.realmCameraX = runtime.camera.x.toFixed(3);
          canvasRef.current.dataset.realmCameraY = runtime.camera.y.toFixed(3);
          canvasRef.current.dataset.realmPlayerScreenX = (runtime.viewport.width / 2 + (actor.x - runtime.camera.x) * runtime.viewport.tile).toFixed(2);
          canvasRef.current.dataset.realmPlayerScreenY = (runtime.viewport.height / 2 + (actor.y - runtime.camera.y) * runtime.viewport.tile * REALM_WORLD_Y_SCALE).toFixed(2);
          canvasRef.current.dataset.realmLocomotion = actor.locomotion;
          canvasRef.current.dataset.realmInteraction = runtime.interaction?.phase || 'idle';
        }
      }
    };

    const render = (now) => {
      const runtime = runtimeRef.current;
      const viewport = runtime.viewport;
      const dpr = viewport.dpr;
      const width = viewport.width;
      const height = viewport.height;
      const tile = viewport.tile;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#070c0a';
      ctx.fillRect(0, 0, width, height);
      const offsetX = width / 2 - runtime.camera.x * tile;
      const offsetY = height / 2 - projectRealmY(runtime.camera.y, tile);
      viewport.offsetX = offsetX;
      viewport.offsetY = offsetY;
      ctx.save();
      ctx.translate(offsetX, offsetY);
      const staticWorld = staticLayerRef.current.canvas;
      if (staticWorld) {
        const sourceX = clamp(-offsetX, 0, Math.max(0, staticWorld.width - 1));
        const sourceY = clamp(-offsetY, 0, Math.max(0, staticWorld.height - 1));
        const sourceWidth = Math.min(width, staticWorld.width - sourceX);
        const sourceHeight = Math.min(height, staticWorld.height - sourceY);
        if (sourceWidth > 0 && sourceHeight > 0) ctx.drawImage(staticWorld, sourceX, sourceY, sourceWidth, sourceHeight, sourceX, sourceY, sourceWidth, sourceHeight);
      }
      drawRoute(ctx, runtime.route, tile, now);
      for (const [x, y] of TORCHES.slice(0, quality.lights)) drawTorch(ctx, x, y, tile, now, quality, torchLightRef.current.canvas);
      const actors = [...runtime.remotes.values(), ...[...runtime.demoActors.values()].slice(0, quality.ambientActors), {
        ...runtime.motion,
        id: sessionId,
        name: playerProfile.name,
        status: playerStatus,
        archetype: playerArchetype,
        motion: runtime.motion,
        player: true,
      }];
      const sceneNodes = [
        ...STATIC_FURNITURE.map((value) => ({ type: 'furniture', y: value.y, value })),
        ...AMBIENT_PROPS.map((value) => ({ type: 'ambient', y: value.y, value })),
        ...WORLD_OBJECTS.map((value) => ({ type: 'object', y: value.y, value })),
        ...actors.map((value) => ({ type: 'actor', y: value.y, value })),
        ...REALM_OCCLUDER_NODES
          .filter((value) => quality.id !== 'low' || !value.highDetail)
          .map((value) => ({ type: 'occluder', y: value.y, value })),
      ].sort((a, b) => {
        const priority = { ambient: 0, furniture: 1, object: 2, actor: 3, occluder: 4 };
        return a.y - b.y || priority[a.type] - priority[b.type];
      });
      for (const node of sceneNodes) {
        if (node.type === 'furniture') drawStaticFurniture(ctx, node.value, tile);
        else if (node.type === 'ambient') drawAmbientProp(ctx, node.value, tile, now, reducedMotion);
        else if (node.type === 'occluder') drawOccluder(ctx, node.value, tile, artRef.current);
        else if (node.type === 'object') {
          const object = node.value;
          drawObjectVisual(ctx, object, tile, now, {
            nearby: nearbyObject?.id === object.id,
            selected: selectedObject?.id === object.id || activePanel === object.panel,
            hovered: runtime.hoveredObject?.id === object.id,
            rewarded: runtime.rewardObject?.id === object.id && runtime.rewardObject.until > now,
            interaction: runtime.interaction?.object?.id === object.id ? runtime.interaction : null,
          }, artRef.current);
        } else {
          const actor = node.value;
          const emote = activeEmotes[actor.id] || activeEmotes[actor.userId] || activeEmotes[actor.realmIdentity];
          drawActor(ctx, actor, tile, now, {
            player: actor.player,
            emote,
            voice: !actor.player && nearbyPerson?.realmIdentity === actor.realmIdentity,
            rewarded: actor.player && runtime.rewardedUntil > now,
            compactLabel: quality.id === 'low',
            reducedMotion,
            interaction: actor.player ? runtime.interaction : null,
            art: artRef.current,
          });
        }
      }
      drawParticles(ctx, runtime.effects, tile);
      ctx.restore();
      if (screenLayerRef.current.canvas) ctx.drawImage(screenLayerRef.current.canvas, 0, 0, width, height);
    };

    const tick = (now) => {
      if (document.hidden) {
        previous = now;
        accumulator = 0;
        frame = requestAnimationFrame(tick);
        return;
      }
      const elapsedMs = Math.min(100, now - previous);
      previous = now;
      accumulator += elapsedMs / 1000;
      runtimeRef.current.frameSamples.push(elapsedMs);
      if (runtimeRef.current.frameSamples.length > 180) runtimeRef.current.frameSamples.shift();
      while (accumulator >= REALM_WORLD_FIXED_STEP) {
        update(REALM_WORLD_FIXED_STEP, now);
        accumulator -= REALM_WORLD_FIXED_STEP;
      }
      const renderStarted = performance.now();
      render(reducedMotion ? 0 : now);
      runtimeRef.current.renderSamples.push(performance.now() - renderStarted);
      if (runtimeRef.current.renderSamples.length > 180) runtimeRef.current.renderSamples.shift();
      if (now - lastMetricsSync >= 1000) {
        lastMetricsSync = now;
        const budget = realmFrameBudget(runtimeRef.current.frameSamples);
        const renderBudget = realmFrameBudget(runtimeRef.current.renderSamples);
        if (canvasRef.current) {
          canvasRef.current.dataset.realmFrameP95 = budget.p95.toFixed(2);
          canvasRef.current.dataset.realmRenderP95 = renderBudget.p95.toFixed(2);
        }
        setMetrics({ fps: budget.fps, p95: budget.p95, renderP95: renderBudget.p95 });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeEmotes, activePanel, beginInteraction, nearbyObject, nearbyPerson, playerArchetype, playerProfile, playerStatus, quality, reducedMotion, sessionId, soundOn]);

  useEffect(() => () => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current.clear();
    audioRef.current?.close();
  }, []);

  const canvasPoint = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const viewport = runtimeRef.current.viewport;
    return {
      x: (event.clientX - rect.left - viewport.offsetX) / viewport.tile,
      y: unprojectRealmY(event.clientY - rect.top - viewport.offsetY, viewport.tile),
    };
  };

  const onPointerMove = (event) => {
    const point = canvasPoint(event);
    const runtime = runtimeRef.current;
    const object = WORLD_OBJECTS.find((item) => distance(item, point) <= OBJECT_RADIUS) || null;
    runtime.hoveredObject = object;
    canvasRef.current.style.cursor = object ? 'pointer' : 'crosshair';
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    const point = canvasPoint(event);
    const runtime = runtimeRef.current;
    const person = [...runtime.remotes.values()].find((item) => distance(item, point) <= .75);
    if (person) {
      callbacksRef.current.onPerson(person);
      return;
    }
    const object = WORLD_OBJECTS.find((item) => distance(item, point) <= OBJECT_RADIUS);
    if (object) {
      routeTo(pathToObject(object), object);
      return;
    }
    routeTo(point);
  };

  const pressDirection = (key, pressed) => {
    runtimeRef.current.route = null;
    if (pressed) keysRef.current.add(key);
    else keysRef.current.delete(key);
  };

  const nudgeDirection = (key) => {
    const motion = runtimeRef.current.motion;
    const vector = key === 'w' ? { x: 0, y: -1 } : key === 's' ? { x: 0, y: 1 } : key === 'a' ? { x: -1, y: 0 } : { x: 1, y: 0 };
    routeTo({ x: motion.x + vector.x * .9, y: motion.y + vector.y * .9 });
  };

  const toggleSound = async () => {
    if (soundOn) {
      audioRef.current?.close();
      audioRef.current = null;
      setSoundOn(false);
      return;
    }
    const engine = createAudioEngine();
    if (!engine) return;
    await engine.context.resume();
    audioRef.current = engine;
    setSoundOn(true);
    engine.tone('interact');
  };

  const focusedObject = nearbyObject || selectedObject;
  const focusedCopy = focusedObject ? OBJECT_COPY[focusedObject.id] : null;
  const currentRoom = roomAt(runtimeRef.current.motion.x, runtimeRef.current.motion.y) || ROOMS[4];

  return (
    <section
      ref={stageRef}
      className={worldStyles.stage}
      aria-label={t('Không gian Guildhall tương tác')}
      data-realm-world-version="3"
      data-realm-quality={quality.id}
      data-realm-depth="2.5d"
      data-realm-art-ready={artReady ? 'true' : 'false'}
    >
      <canvas
        ref={canvasRef}
        className={worldStyles.canvas}
        role="img"
        tabIndex={0}
        aria-label={t('Guildhall nhiều lớp. Dùng WASD, phím mũi tên hoặc nhấp để di chuyển; đến gần đồ vật và nhấn E để tương tác.')}
        onPointerMove={onPointerMove}
        onPointerLeave={() => { runtimeRef.current.hoveredObject = null; }}
        onPointerDown={onPointerDown}
        data-realm-runtime="canvas-2d-fixed-step"
        data-realm-renderer="canvas2d"
      />

      <div className={worldStyles.locationReadout} aria-live="polite">
        <i />
        <span><strong>{t(ROOM_COPY[currentRoom.id] || currentRoom.name)}</strong><small>{t('Thế giới trực tiếp · không gian và công việc cùng một ngữ cảnh')}</small></span>
      </div>

      <div className={worldStyles.worldControls}>
        <button type="button" className={worldStyles.soundControl} aria-label={t(soundOn ? 'Tắt âm thanh Realm' : 'Bật âm thanh Realm')} aria-pressed={soundOn} onClick={toggleSound}><Icon name={soundOn ? 'bolt' : 'mic'} size={17} /><span>{t(soundOn ? 'Âm thanh bật' : 'Âm thanh')}</span></button>
        <button type="button" aria-label={t('Mở danh sách địa điểm')} aria-expanded={locationOpen} onClick={() => { setLocationOpen((open) => !open); setSignalOpen(false); setTouchOpen(false); }}><Icon name="map" size={17} /><span>{t('Waygate')}</span></button>
        <button type="button" aria-label={t('Ra hiệu')} aria-expanded={signalOpen} onClick={() => { setSignalOpen((open) => !open); setLocationOpen(false); setTouchOpen(false); }}><Icon name="bolt" size={17} /><span>{t('Ra hiệu')}</span></button>
        <button type="button" className={worldStyles.touchToggle} aria-label={t(touchOpen ? 'Đóng điều khiển di chuyển' : 'Mở điều khiển di chuyển')} aria-expanded={touchOpen} onClick={() => { setTouchOpen((open) => !open); setLocationOpen(false); setSignalOpen(false); }}><span aria-hidden="true">✥</span><span>{t('Điều khiển')}</span></button>
      </div>

      {locationOpen && (
        <div className={worldStyles.locationMenu}>
          <header><span>{t('Mạng Waygate')}</span><strong>{t('Đi thẳng tới nơi làm việc')}</strong><small>{t('Chuyển cảnh ngắn giúp bỏ qua quãng đường mà không mất ngữ cảnh.')}</small></header>
          {WORLD_OBJECTS.map((object) => {
            const copy = OBJECT_COPY[object.id];
            return <button type="button" key={object.id} aria-label={`${t('Mở')} ${t(copy.title)}`} onClick={() => waygateTo(object)}><Icon name={copy.icon} size={17} /><span><strong>{t(copy.title)}</strong><small>{t(copy.detail)}</small></span><i /></button>;
          })}
        </div>
      )}

      {signalOpen && (
        <div className={worldStyles.signalMenu}>
          <header><span>{t('Ra hiệu bằng nhân vật')}</span><small>{t('Cử chỉ xuất hiện trên cơ thể, không chỉ là thông báo.')}</small></header>
          {REALM_EMOTES.map((emote) => <button type="button" key={emote.id} aria-label={t(emote.label)} onClick={() => { onEmote(emote.id); setSignalOpen(false); }}><span aria-hidden="true">{emote.mark}</span>{t(emote.label)}</button>)}
        </div>
      )}

      {focusedObject && focusedCopy && (
        <div className={worldStyles.actionRibbon} data-nearby={Boolean(nearbyObject)} role="group" aria-label={`${t(focusedCopy.title)} · ${t(focusedCopy.detail)}`}>
          <span className={worldStyles.actionGlyph} style={{ '--object-accent': focusedCopy.accent }}><Icon name={focusedCopy.icon} size={20} /></span>
          <span><small>{t(nearbyObject ? 'Trong tầm tương tác' : 'Đã chọn')}</small><strong>{t(focusedCopy.title)}</strong><em>{t(focusedCopy.detail)}</em></span>
          {nearbyObject
            ? <button type="button" onClick={() => beginInteraction(focusedObject)}><kbd>E</kbd>{t(focusedCopy.verb)}</button>
            : <button type="button" onClick={() => routeTo(pathToObject(focusedObject), focusedObject)}><Icon name="map" size={16} />{t('Đi tới')}</button>}
        </div>
      )}

      {nearbyPerson && !focusedObject && (
        <button type="button" className={worldStyles.personRibbon} onClick={() => onPerson(nearbyPerson)}>
          <span style={{ '--person-status': STATUS_COLORS[nearbyPerson.status] || STATUS_COLORS.available }}>{String(nearbyPerson.name || '?').slice(0, 1)}</span>
          <span><small>{t('Đồng đội trong tầm thoại')}</small><strong data-no-i18n>{nearbyPerson.name}</strong></span>
          <Icon name="chat" size={18} />
        </button>
      )}

      {journey && (
        <div className={worldStyles.journey} role="status" aria-live="polite" data-realm-journey data-realm-target={journey.object.id} data-phase={journey.phase}>
          <i style={{ '--journey-accent': OBJECT_COPY[journey.object.id]?.accent }} />
          <span><small>{t(journey.phase === 'traveling' ? 'Đang di chuyển' : journey.phase === 'waygate' ? 'Waygate' : journey.phase === 'succeeded' ? 'Đã kết nối' : 'Đang tương tác')}</small><strong>{t(OBJECT_COPY[journey.object.id]?.title || journey.object.name)}</strong></span>
          <em>{t(journey.progress)}</em>
        </div>
      )}

      {rewardCallout && (
        <div className={worldStyles.reward} role="status" aria-live="polite">
          <RealmRewardRemotion key={rewardCallout.id} amount={rewardCallout.amount} reducedMotion={reducedMotion} />
          <span>G</span><div><small>{t('Canonical receipt đã xác nhận')}</small><strong>+{rewardCallout.amount} Gold</strong><em>{t('Ví và Chronicle đã cập nhật cùng nguồn')}</em></div>
        </div>
      )}

      <div className={worldStyles.touchControls} data-open={touchOpen || undefined} aria-label={t('Điều khiển di chuyển')} aria-hidden={!touchOpen}>
        {[
          ['w', 'up', 'Đi lên'], ['a', 'left', 'Đi sang trái'], ['s', 'down', 'Đi xuống'], ['d', 'right', 'Đi sang phải'],
        ].map(([key, direction, label]) => (
          <button
            type="button"
            key={key}
            data-direction={direction}
            aria-label={t(label)}
            disabled={!touchOpen}
            tabIndex={touchOpen ? 0 : -1}
            onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); pressDirection(key, true); }}
            onPointerUp={(event) => { pressDirection(key, false); event.currentTarget.releasePointerCapture?.(event.pointerId); }}
            onPointerCancel={() => pressDirection(key, false)}
            onLostPointerCapture={() => pressDirection(key, false)}
            onClick={() => nudgeDirection(key)}
          ><span aria-hidden="true">{direction === 'up' ? '↑' : direction === 'down' ? '↓' : direction === 'left' ? '←' : '→'}</span></button>
        ))}
        <span aria-hidden="true" />
      </div>

      {debug && <output className={worldStyles.debug}>V3 · {quality.id} · {metrics.fps.toFixed(0)} fps · frame {metrics.p95.toFixed(1)} ms · render {metrics.renderP95.toFixed(1)} ms · {people.length} remote</output>}
      {arrival && <button type="button" className={worldStyles.skipArrival} onClick={() => setArrival(false)}>{t('Bỏ qua chuyển cảnh')}</button>}
      <span className={`${worldStyles.waygateTransition} ${waygate || arrival ? worldStyles.waygateTransitionActive : ''}`} aria-hidden="true" />
    </section>
  );
}
