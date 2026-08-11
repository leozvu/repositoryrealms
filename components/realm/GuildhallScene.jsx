'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { useLanguage } from '@/components/LanguageProvider';
import { isInVoiceRange } from '@/lib/realm-protocol';
import { realmGeneratedCharacterArchetype, realmGeneratedCharacterUrl } from '@/lib/realm-generated-art';
import { REALM_EMOTES } from '@/lib/realm-social';
import { GuildhallAtmosphere, RealmActorMotion } from './GuildhallRemotion';
import {
  ROOMS,
  WORLD,
  WORLD_OBJECTS,
  distance,
  isWorldPositionWalkable,
  normalizeWorldPosition,
  privateZoneAt,
  roomAt,
} from './world';
import scene from './guildhall-shell.module.css';

const SCENE_ROOMS = Object.freeze({
  guild: Object.freeze({ x: 75, y: 41, w: 13, h: 21 }),
  war: Object.freeze({ x: 53, y: 28, w: 27, h: 32 }),
  treasury: Object.freeze({ x: 15, y: 49, w: 18, h: 27 }),
  tavern: Object.freeze({ x: 37, y: 25, w: 13, h: 13 }),
  hall: Object.freeze({ x: 28, y: 65, w: 32, h: 14 }),
  forge: Object.freeze({ x: 67, y: 60, w: 19, h: 17 }),
});

const OBJECT_COPY = Object.freeze({
  'command-dais': Object.freeze({ title: 'Phòng điều hành', detail: 'Ưu tiên & quyết định', icon: 'shield' }),
  'guild-roster': Object.freeze({ title: 'Sổ bộ Guild', detail: 'Nhân sự & quyền truy cập', icon: 'people' }),
  'war-table': Object.freeze({ title: 'Bàn dự án', detail: 'Lập kế hoạch & thực thi', icon: 'projects' }),
  'treasury-chest': Object.freeze({ title: 'Kho bạc Gold', detail: 'Ghi nhận đóng góp', icon: 'wallet' }),
  'tavern-board': Object.freeze({ title: 'Quảng trường Đèn', detail: 'Tin nhắn & gặp gỡ', icon: 'chat' }),
  'quest-board': Object.freeze({ title: 'Bàn hội đồng', detail: 'Công việc & voice không gian', icon: 'meeting' }),
  'realm-gate': Object.freeze({ title: 'Lối vào Guildhall', detail: 'Bắt đầu ngày làm việc', icon: 'home' }),
  'arcane-forge': Object.freeze({ title: 'Xưởng Guild', detail: 'Dùng Gold đã kiếm', icon: 'work' }),
});

const ROOM_COPY = Object.freeze({
  guild: 'Sảnh Guild',
  war: 'Phòng dự án',
  treasury: 'Kho bạc Hoàng gia',
  tavern: 'Quảng trường Đèn',
  hall: 'Đại sảnh',
  forge: 'Xưởng Guild',
});

const OBJECT_SCENE_POINTS = Object.freeze({
  'command-dais': Object.freeze({ x: 55, y: 20 }),
  'guild-roster': Object.freeze({ x: 85, y: 25 }),
  'war-table': Object.freeze({ x: 66, y: 37 }),
  'treasury-chest': Object.freeze({ x: 20, y: 50 }),
  'tavern-board': Object.freeze({ x: 37, y: 22 }),
  'quest-board': Object.freeze({ x: 50, y: 44 }),
  'realm-gate': Object.freeze({ x: 27, y: 81 }),
  'arcane-forge': Object.freeze({ x: 78, y: 66 }),
});

const COMMAND_OBJECT = Object.freeze({
  id: 'command-dais',
  panel: 'command',
  name: 'Phòng điều hành',
  hint: 'Mở ưu tiên và quyết định vận hành',
  x: 29,
  y: 4.5,
});

const SCENE_OBJECTS = Object.freeze([COMMAND_OBJECT, ...WORLD_OBJECTS]);

const STATUS_COLORS = Object.freeze({
  available: '#7cc39b',
  busy: '#d7a456',
  focus: '#aa9bd6',
  dnd: '#cf7278',
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function projectPosition(position) {
  const safe = normalizeWorldPosition(position);
  const room = roomAt(safe.x, safe.y) || ROOMS[4];
  const rect = SCENE_ROOMS[room.id] || SCENE_ROOMS.hall;
  const localX = clamp((safe.x - room.x) / Math.max(1, room.w), 0, 1);
  const localY = clamp((safe.y - room.y) / Math.max(1, room.h), 0, 1);
  return {
    x: rect.x + localX * rect.w,
    y: rect.y + localY * rect.h,
    room,
  };
}

function sceneToWorld(point) {
  const candidates = ROOMS.map((room) => {
    const rect = SCENE_ROOMS[room.id] || SCENE_ROOMS.hall;
    const inside = point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
    const centerX = rect.x + rect.w / 2;
    const centerY = rect.y + rect.h / 2;
    return { room, rect, inside, score: Math.hypot(point.x - centerX, point.y - centerY) };
  }).sort((a, b) => Number(b.inside) - Number(a.inside) || a.score - b.score);
  const { room, rect } = candidates[0];
  return normalizeWorldPosition({
    x: room.x + clamp((point.x - rect.x) / rect.w, 0.04, 0.96) * room.w,
    y: room.y + clamp((point.y - rect.y) / rect.h, 0.04, 0.96) * room.h,
  });
}

function directionFromDelta(dx, dy, fallback = 'down') {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reducedMotion;
}

function RealmFigure({ person, player = false, moving = false, facing = 'down', emote, onSelect, interactionLabel, reducedMotion }) {
  const projected = projectPosition(person);
  const identity = person;
  const archetype = realmGeneratedCharacterArchetype(identity);
  const accent = STATUS_COLORS[person.status] || STATUS_COLORS.available;
  const depthScale = clamp(0.76 + projected.y * 0.0042, 0.88, 1.12);
  const content = (
    <>
      <RealmActorMotion
        spriteUrl={realmGeneratedCharacterUrl(identity, facing)}
        moving={moving}
        facing={facing}
        player={player}
        accent={accent}
        reducedMotion={reducedMotion}
      />
      <span className={scene.figureIdentity}>
        <span className={scene.figureStatus} style={{ '--figure-status': accent }} />
        <strong>{player ? 'Bạn' : person.name}</strong>
        <small>{archetype.race} · {archetype.role}</small>
      </span>
      {emote && <span className={scene.figureEmote}>{emote.mark || emote.label}</span>}
    </>
  );
  const style = {
    '--figure-x': `${projected.x}%`,
    '--figure-y': `${projected.y}%`,
    '--figure-scale': depthScale,
    zIndex: 20 + Math.round(projected.y),
  };
  const className = `${scene.figure} ${player ? scene.figurePlayer : ''} ${moving ? scene.figureMoving : ''}`;
  if (!onSelect) return <span className={className} style={style} data-room={projected.room.id}>{content}</span>;
  return <button type="button" className={className} style={style} data-room={projected.room.id} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onSelect(person); }} aria-label={interactionLabel || `Mở tương tác với ${person.name}`}>{content}</button>;
}

export default function GuildhallScene({
  activePanel,
  playerStatus,
  playerProfile,
  position,
  staff,
  remotePlayers,
  activeEmotes,
  sessionId,
  onPosition,
  onNearby,
  onObjectOpen,
  onPerson,
  onEmote,
}) {
  const { t } = useLanguage();
  const reducedMotion = usePrefersReducedMotion();
  const plateRef = useRef(null);
  const positionRef = useRef(normalizeWorldPosition(position));
  const targetRef = useRef(null);
  const keysRef = useRef(new Set());
  const facingRef = useRef('down');
  const activeObjectRef = useRef(null);
  const callbacksRef = useRef({ onPosition, onNearby, onObjectOpen });
  const peopleRef = useRef({ staff, remotePlayers });
  const [visualPosition, setVisualPosition] = useState(positionRef.current);
  const [moving, setMoving] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  useEffect(() => { callbacksRef.current = { onPosition, onNearby, onObjectOpen }; }, [onNearby, onObjectOpen, onPosition]);
  useEffect(() => { peopleRef.current = { staff, remotePlayers }; }, [remotePlayers, staff]);
  useEffect(() => {
    const next = normalizeWorldPosition(position);
    if (distance(positionRef.current, next) > 0.08) {
      positionRef.current = next;
      setVisualPosition(next);
    }
  }, [position]);

  useEffect(() => {
    const moveTo = (event) => {
      if (event.detail?.x == null || event.detail?.y == null) return;
      targetRef.current = normalizeWorldPosition(event.detail);
    };
    window.addEventListener('realm:move', moveTo);
    return () => window.removeEventListener('realm:move', moveTo);
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
        callbacksRef.current.onObjectOpen(activeObjectRef.current);
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
    let frame = 0;
    let previous = performance.now();
    let lastVisual = 0;
    let lastSync = 0;
    const tick = (now) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const keys = keysRef.current;
      let dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      let dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
      const target = targetRef.current;
      if (!dx && !dy && target) {
        const tx = target.x - positionRef.current.x;
        const ty = target.y - positionRef.current.y;
        const remaining = Math.hypot(tx, ty);
        if (remaining < 0.14) targetRef.current = null;
        else {
          dx = tx / remaining;
          dy = ty / remaining;
        }
      }
      const isMoving = Boolean(dx || dy);
      if (isMoving) {
        const length = Math.hypot(dx, dy) || 1;
        const speed = 4.5 * dt;
        const current = positionRef.current;
        const nextX = current.x + dx / length * speed;
        const nextY = current.y + dy / length * speed;
        const xCandidate = { x: nextX, y: current.y };
        const yCandidate = { x: isWorldPositionWalkable(xCandidate) ? nextX : current.x, y: nextY };
        positionRef.current = {
          x: isWorldPositionWalkable(xCandidate) ? nextX : current.x,
          y: isWorldPositionWalkable(yCandidate) ? nextY : current.y,
        };
        facingRef.current = directionFromDelta(dx, dy, facingRef.current);
      }
      if (now - lastVisual > 34) {
        lastVisual = now;
        setVisualPosition({ ...positionRef.current });
        setMoving(isMoving);
      }
      if (now - lastSync > 115) {
        lastSync = now;
        const player = positionRef.current;
        const nearest = WORLD_OBJECTS.reduce((best, object) => {
          const objectDistance = distance(player, object);
          return !best || objectDistance < best.distance ? { object, distance: objectDistance } : best;
        }, null);
        const activeObject = nearest?.distance <= 1.8 ? nearest.object : null;
        activeObjectRef.current = activeObject;
        const zone = privateZoneAt(player.x, player.y);
        const people = [...peopleRef.current.staff, ...peopleRef.current.remotePlayers].filter((person) => {
          const personZone = person.zoneId || privateZoneAt(person.x, person.y)?.id || null;
          return isInVoiceRange({ ...player, zoneId: zone?.id || null }, { ...person, zoneId: personZone });
        });
        callbacksRef.current.onPosition({ ...player, zoneId: zone?.id || null }, activeObject);
        callbacksRef.current.onNearby(people, zone);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const allPeople = useMemo(() => {
    const seen = new Set();
    return [...staff, ...remotePlayers].filter((person) => {
      const key = person.id || person.userId || person.name;
      if (!key || key === sessionId || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [remotePlayers, sessionId, staff]);

  const projectedPlayer = projectPosition(visualPosition);
  const activeObject = WORLD_OBJECTS.find((object) => object.id === activeObjectRef.current?.id) || null;

  const moveOnPlate = (event) => {
    if (event.button !== 0 || !plateRef.current) return;
    const rect = plateRef.current.getBoundingClientRect();
    targetRef.current = sceneToWorld({
      x: (event.clientX - rect.left) / rect.width * 100,
      y: (event.clientY - rect.top) / rect.height * 100,
    });
  };

  const pressDirection = (key, pressed) => {
    targetRef.current = null;
    if (pressed) keysRef.current.add(key);
    else keysRef.current.delete(key);
  };

  return (
    <section className={scene.sceneStage} aria-label={t('Không gian Guildhall tương tác')}>
      <div ref={plateRef} className={scene.scenePlate} onPointerDown={moveOnPlate} data-room={projectedPlayer.room.id}>
        <GuildhallAtmosphere
          imageUrl="/realms/assets/guildhall-reforged/guildhall-environment.png"
          imageAlt={t('Đại sảnh Guildhall nhìn từ trên cao với bàn hội đồng, bàn dự án, kho bạc và khu nhân sự')}
          reducedMotion={reducedMotion}
        />
        <span className={scene.environmentShade} aria-hidden="true" />
        {SCENE_OBJECTS.map((object) => {
          const projected = OBJECT_SCENE_POINTS[object.id] || projectPosition(object);
          const copy = OBJECT_COPY[object.id] || { title: object.name, detail: object.hint, icon: 'work' };
          return (
            <button
              type="button"
              key={object.id}
              className={`${scene.hotspot} ${activePanel === object.panel ? scene.hotspotActive : ''}`}
              style={{ '--hotspot-x': `${projected.x}%`, '--hotspot-y': `${projected.y}%` }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                targetRef.current = normalizeWorldPosition({ x: object.x, y: object.y + 1.1 });
                onObjectOpen(object);
              }}
              aria-label={`${t(copy.title)}: ${t(copy.detail)}`}
            >
              <span><Icon name={copy.icon} size={16} /></span>
              <span><strong>{copy.title}</strong><small>{copy.detail}</small></span>
            </button>
          );
        })}
        {allPeople.map((person) => (
          <RealmFigure
            key={person.id || person.userId || person.name}
            person={person}
            emote={activeEmotes[person.id]}
            onSelect={onPerson}
            interactionLabel={`${t('Mở tương tác với')} ${person.name}`}
            reducedMotion={reducedMotion}
          />
        ))}
        <RealmFigure
          person={{ ...visualPosition, id: sessionId, name: playerProfile.name, role: playerProfile.role, status: playerStatus }}
          player
          moving={moving}
          facing={facingRef.current}
          emote={activeEmotes[sessionId]}
          reducedMotion={reducedMotion}
        />
        <span className={`${scene.sceneOcclusion} ${scene.occlusionStrategy}`} aria-hidden="true" />
        <span className={`${scene.sceneOcclusion} ${scene.occlusionCouncil}`} aria-hidden="true" />
        <span className={`${scene.sceneOcclusion} ${scene.occlusionTreasury}`} aria-hidden="true" />
      </div>

      <div className={scene.sceneHint}>
        <span><i />{ROOM_COPY[projectedPlayer.room.id] || projectedPlayer.room.name}</span>
        <small>Nhấp để đi · WASD để di chuyển · E để mở bàn gần nhất</small>
      </div>

      {activeObject && (
        <button type="button" className={scene.nearbyPrompt} onClick={() => onObjectOpen(activeObject)}>
          <kbd>E</kbd><span><strong>{activeObject.name}</strong><small>{activeObject.hint}</small></span>
        </button>
      )}

      <div className={scene.signalControl}>
        <button type="button" aria-expanded={signalOpen} onClick={() => { setSignalOpen((open) => !open); setLocationOpen(false); }}><Icon name="bolt" size={17} /><span>Ra hiệu</span></button>
        {signalOpen && (
          <div className={scene.signalMenu}>
            {REALM_EMOTES.map((emote) => <button type="button" key={emote.id} onClick={() => { onEmote(emote.id); setSignalOpen(false); }}>{emote.label}</button>)}
          </div>
        )}
      </div>

      <div className={scene.locationControl}>
        <button type="button" aria-label={t('Mở danh sách địa điểm')} aria-expanded={locationOpen} onClick={() => { setLocationOpen((open) => !open); setSignalOpen(false); }}><Icon name="map" size={17} /><span>Địa điểm</span></button>
        {locationOpen && (
          <div className={scene.locationMenu}>
            <header><span>Guildhall</span><strong>Đi thẳng tới bàn làm việc</strong></header>
            {SCENE_OBJECTS.map((object) => {
              const copy = OBJECT_COPY[object.id] || { title: object.name, detail: object.hint, icon: 'work' };
              return (
                <button
                  type="button"
                  key={object.id}
                  aria-label={`${t('Mở')} ${t(copy.title)}`}
                  onClick={() => {
                    targetRef.current = normalizeWorldPosition({ x: object.x, y: object.y + 1.1 });
                    onObjectOpen(object);
                    setLocationOpen(false);
                  }}
                >
                  <Icon name={copy.icon} size={16} /><span><strong>{copy.title}</strong><small>{copy.detail}</small></span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={scene.mobileDpad} aria-label="Điều khiển di chuyển">
        <button type="button" aria-label="Đi lên" onPointerDown={() => pressDirection('w', true)} onPointerUp={() => pressDirection('w', false)} onPointerLeave={() => pressDirection('w', false)}>W</button>
        <button type="button" aria-label="Đi sang trái" onPointerDown={() => pressDirection('a', true)} onPointerUp={() => pressDirection('a', false)} onPointerLeave={() => pressDirection('a', false)}>A</button>
        <button type="button" aria-label="Đi xuống" onPointerDown={() => pressDirection('s', true)} onPointerUp={() => pressDirection('s', false)} onPointerLeave={() => pressDirection('s', false)}>S</button>
        <button type="button" aria-label="Đi sang phải" onPointerDown={() => pressDirection('d', true)} onPointerUp={() => pressDirection('d', false)} onPointerLeave={() => pressDirection('d', false)}>D</button>
      </div>
    </section>
  );
}
