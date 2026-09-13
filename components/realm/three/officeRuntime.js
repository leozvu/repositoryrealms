import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildGuildhallScene } from './guildhallScene.js';
import { createOfficeAvatar } from './officeAvatar.js';
import { createOfficeAudio } from './officeAudio.js';
import { createOfficeQuality, createOfficeFrameBudget, officePixelRatio, nextOfficeRenderBudget, officeResolutionFloor } from './officeQuality.js';
import { constrainOfficeCamera } from '../../../lib/realm-office-camera.js';
import {
  OFFICE_SPAWN, OFFICE_PORTALS, officeDistance, officeWalkable, moveOfficeActor,
  nearestOfficePoint, findOfficePath, officeKeyVector, officeToPresence, presenceToOffice, officePortalForLegacy, officeArrivalReady,
} from '../../../lib/realm-office-3d.js';
import { mergeRealmPresencePeople } from '../../../lib/realm-protocol.js';

const CAMERA_PRESETS = { follow: { distance: 6.8, height: 2.9, targetHeight: 1.12 },
  overview: { distance: 21, height: 22, targetHeight: 0 }, first: { distance: .04, height: 1.65, targetHeight: 1.65 } };
const editable = target => Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]'));
const lerpAngle = (from, to, blend) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * blend;
const QUALITY_STORAGE_KEY = 'realm:3d:graphics:v1';
const RESOLUTION_STORAGE_KEY = 'realm:3d:resolution:v1';
// Keep the observed pixel budget through Chronicle/office remounts within this
// document. A page reload starts fresh; this is not a saved device benchmark.
let lastResolutionScale = 1;
function freeScene(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
}

export function createOfficeRuntime({ canvas, host, onUpdate, onError, props }) {
  let current = props, destroyed = false, lastTime = 0, tick = 0, animationId;
  const mobile = matchMedia('(pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const audio = createOfficeAudio();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(mobile ? 1 : Math.min(devicePixelRatio, 1.65));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8d9694');
  scene.fog = new THREE.FogExp2('#8d9694', .005);
  const camera = new THREE.PerspectiveCamera(52, 1, .1, 150);
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const environmentRoom = new RoomEnvironment();
  const environment = environmentGenerator.fromScene(environmentRoom, .04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .22;
  environmentRoom.dispose();
  environmentGenerator.dispose();
  const hemi = new THREE.HemisphereLight('#dce7ec', '#514638', 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d7', 2.65);
  sun.position.set(-10, 16, -14);
  sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 18, bottom: -18, near: 1, far: 60 });
  sun.shadow.normalBias = .015; sun.shadow.bias = -.00008;
  sun.target.position.set(0, 0, 1);
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#bccfda', .38);
  fill.position.set(7, 7, 12); scene.add(fill);
  const hall = buildGuildhallScene(THREE);
  scene.add(hall.group);
  host.dataset.materials = 'loading';
  let materialsSettled = false;
  hall.materialsReady.then(({ failed }) => {
    if (!destroyed) { materialsSettled = true; host.dataset.materials = failed ? 'fallback' : 'ready'; }
  });
  const colliders = hall.colliders || [];
  const portals = (hall.interactables || []).map(item => ({ ...item, ...(OFFICE_PORTALS[item.id] || {}),
    name: OFFICE_PORTALS[item.id]?.name || item.label, radius: item.radius || 2.5 }));
  const player = createOfficeAvatar(THREE, { color: props.playerProfile?.color || '#306c59', name: props.playerProfile?.name, self: true });
  scene.add(player.group);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.42, .48, 48),
    new THREE.MeshBasicMaterial({ color: '#c9b98c', transparent: true, opacity: .32, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .17; scene.add(ring);
  const targetMarker = new THREE.Mesh(new THREE.RingGeometry(.14, .2, 32),
    new THREE.MeshBasicMaterial({ color: '#efd4a0', transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false }));
  targetMarker.rotation.x = -Math.PI / 2; targetMarker.visible = false; scene.add(targetMarker);
  const start = nearestOfficePoint(presenceToOffice(props.position), colliders) || { ...OFFICE_SPAWN };
  let point = start, yaw = .38, pitch = -.04, cameraMode = 'follow', zoom = 1, path = [], selected = null, pendingOpen = null;
  let nearest = null, nearestSignature = '', hudAt = 0, publishAt = 0, motionAt = 0, hiddenAt = 0;
  let moving = false, paused = Boolean(props.workspaceOpen), pointer = null, quality = mobile ? 'balanced' : 'high', snapCamera = true;
  let savedQuality = null;
  let resolutionPreference = 'auto';
  try {
    savedQuality = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (localStorage.getItem(RESOLUTION_STORAGE_KEY) === 'clarity') resolutionPreference = 'clarity';
  } catch { /* Storage is optional. */ }
  if (savedQuality === 'high' || savedQuality === 'balanced') quality = savedQuality;
  const keys = new Set(), remotes = new Map(), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), target = new THREE.Vector3();
  const followAt = new THREE.Vector3(point.x, 1, point.z), desiredCamera = new THREE.Vector3();
  const projected = new THREE.Vector3(), frameSamples = [];
  const graphics = createOfficeQuality(scene), frameBudget = createOfficeFrameBudget();
  let resolutionScale = Math.max(officeResolutionFloor(quality, resolutionPreference), lastResolutionScale), qualityChangedAt = performance.now(), lastRenderAt = 0, manualHigh = false;
  player.group.position.set(point.x, .105, point.z);
  camera.position.set(point.x, CAMERA_PRESETS.follow.height, point.z);
  camera.lookAt(followAt);

  const resize = () => {
    const box = host.getBoundingClientRect();
    if (!box.width || !box.height) return;
    camera.aspect = box.width / box.height; camera.updateProjectionMatrix();
    renderer.setPixelRatio(officePixelRatio({ mode: quality, width: box.width, height: box.height, deviceRatio: devicePixelRatio, scale: resolutionScale }));
    renderer.setSize(box.width, box.height, false);
    host.dataset.renderScale = resolutionScale.toFixed(2);
    host.dataset.resolutionPreference = resolutionPreference;
    onUpdate?.({ resolutionScale, resolutionPreference });
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const announce = (message) => onUpdate?.({ announcement: message });
  const accessible = item => !current.allowedPanels || current.allowedPanels.includes(item.panel);
  function walkTo(idOrPoint, openWhenArrived = false) {
    if (paused) return false;
    const object = typeof idOrPoint === 'string' ? portals.find(item => item.id === idOrPoint) : null;
    if (object && !accessible(object)) { announce('Bạn chưa có quyền sử dụng khu vực này.'); return false; }
    const goal = object?.position || idOrPoint;
    if (!goal || !Number.isFinite(goal.x)) return false;
    const nextPath = findOfficePath(point, goal, colliders);
    if (!nextPath.length) { announce('Chưa tìm được lối đi. Hãy chọn vị trí gần đó.'); return false; }
    path = nextPath; selected = object; pendingOpen = openWhenArrived ? object : null;
    const last = path[path.length - 1]; targetMarker.position.set(last.x, .17, last.z); targetMarker.visible = true;
    canvas.focus({ preventScroll: true });
    announce(object ? 'Đang đi tới ' + object.name : 'Đã chọn điểm đến');
    return true;
  }
  function interact(place = nearest) {
    if (paused || !place || !accessible(place)) return false;
    path = []; pendingOpen = null; targetMarker.visible = false;
    const opened = current.onObjectOpen?.({ ...place, id: place.legacyId || place.id });
    if (opened === false) return false;
    announce('Đã mở ' + place.name);
    return true;
  }
  function changeCamera(mode) {
    const previousMode = cameraMode;
    cameraMode = CAMERA_PRESETS[mode] ? mode : 'follow';
    // Restore an interior pose before rendering the roof again. Interpolating
    // down from overview would briefly put the opaque roof in front of the camera.
    snapCamera ||= previousMode === 'overview' && cameraMode !== 'overview';
    hall.setCameraMode(cameraMode);
    player.group.visible = cameraMode !== 'first';
    onUpdate?.({ cameraMode }); canvas.focus({ preventScroll: true });
  }
  function resetCamera() { yaw = .38; pitch = -.04; zoom = 1; changeCamera('follow'); }
  function setQuality(value, manual = true) {
    quality = value === 'balanced' ? 'balanced' : 'high';
    manualHigh = manual && quality === 'high';
    if (manual) try { localStorage.setItem(QUALITY_STORAGE_KEY, quality); } catch { /* Continue without persistence. */ }
    resolutionScale = Math.max(officeResolutionFloor(quality, resolutionPreference), resolutionScale);
    qualityChangedAt = performance.now(); frameBudget.reset();
    graphics.setMode(quality); renderer.shadowMap.enabled = quality === 'high';
    resize(); onUpdate?.({ quality });
  }
  function setResolutionPreference(value) {
    resolutionPreference = value === 'clarity' ? 'clarity' : 'auto';
    try { localStorage.setItem(RESOLUTION_STORAGE_KEY, resolutionPreference); } catch { /* Preference still works for this visit. */ }
    resolutionScale = Math.max(officeResolutionFloor(quality, resolutionPreference), resolutionScale);
    lastResolutionScale = resolutionScale;
    qualityChangedAt = performance.now(); frameBudget.reset(); resize();
  }
  function selectPerson(id) { const entry = remotes.get(id); if (entry && !paused) current.onPerson?.(entry.person); }
  function syncPeople() {
    const source = mergeRealmPresencePeople({ staff: current.demoMode ? current.staff : [],
      remotePlayers: current.remotePlayers, selfProfile: current.playerProfile });
    const active = new Set();
    source.slice(0, 32).forEach((person, index) => {
      const id = person.userId || person.id || person.name;
      if (!id || id === current.sessionId) return;
      active.add(id);
      let entry = remotes.get(id);
      if (!entry) {
        const avatar = createOfficeAvatar(THREE, { color: person.color || '#657a87', name: person.name, index });
        scene.add(avatar.group);
        entry = { ...avatar, person, point: null, target: null };
        remotes.set(id, entry);
      }
      entry.person = person;
      entry.setColor?.(person.color);
      const raw = presenceToOffice(person.position || person);
      entry.target = nearestOfficePoint(raw, colliders) || start;
      if (!entry.point) { entry.point = { ...entry.target }; entry.group.position.set(entry.point.x, .105, entry.point.z); }
    });
    for (const [id, entry] of remotes) if (!active.has(id)) { scene.remove(entry.group); entry.dispose?.(); freeScene(entry.group); remotes.delete(id); }
    graphics.sync();
  }
  syncPeople();
  setQuality(quality, Boolean(savedQuality));
  function keyDown(event) {
    if (paused || editable(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
      if (event.target !== canvas && document.activeElement !== canvas) return;
      event.preventDefault(); keys.add(key); path = []; pendingOpen = null; targetMarker.visible = false;
    }
    if (event.target !== canvas) return;
    if (key === 'e' && !event.repeat) { event.preventDefault(); interact(); }
    if (key === 'c' && !event.repeat) { event.preventDefault(); changeCamera(cameraMode === 'follow' ? 'first' : 'follow'); }
    if (key === 'm' && !event.repeat) { event.preventDefault(); changeCamera(cameraMode === 'overview' ? 'follow' : 'overview'); }
    if (key === 'escape') { keys.clear(); path = []; targetMarker.visible = false; pendingOpen = null; }
  }
  const keyUp = event => keys.delete(event.key.toLowerCase());
  const blur = () => { keys.clear(); pointer = null; };
  const visibility = () => { blur(); lastTime = 0; frameBudget.reset(); if (document.hidden) { hiddenAt = performance.now(); audio.suspend(); } else { hiddenAt = 0; audio.resume(); } };
  function pointerDown(event) {
    if (paused || event.button === 1) return;
    canvas.focus({ preventScroll: true });
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY,
      rotate: event.button === 2 || (event.pointerType === 'touch' && cameraMode === 'first'), dragged: false };
    canvas.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.lastX, dy = event.clientY - pointer.lastY;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 7) pointer.dragged = true;
    if (pointer.rotate || pointer.dragged) {
      yaw -= dx * .006;
      if (cameraMode === 'first') pitch = Math.max(-1.05, Math.min(.95, pitch - dy * .004));
      else zoom = Math.max(.65, Math.min(1.8, zoom + dy * .002));
    }
    pointer.lastX = event.clientX; pointer.lastY = event.clientY;
  }
  function pointerUp(event) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const clicked = !pointer.dragged && !pointer.rotate;
    pointer = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!clicked || paused) return;
    const box = canvas.getBoundingClientRect();
    ndc.set((event.clientX - box.left) / box.width * 2 - 1, -((event.clientY - box.top) / box.height * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const personHits = ray.intersectObjects([...remotes.values()].map(entry => entry.group), true);
    if (personHits.length) {
      let hit = personHits[0].object;
      while (hit.parent && hit.parent !== scene) hit = hit.parent;
      const entry = [...remotes.entries()].find(([, value]) => value.group === hit);
      if (entry && personHits[0].distance < (ray.intersectObject(hall.group, true)[0]?.distance ?? Infinity)) { selectPerson(entry[0]); return; }
    }
    const hits = ray.intersectObject(hall.group, true);
    let objectId = null;
    for (const hit of hits) {
      let object = hit.object;
      while (object && !object.userData?.interactableId) object = object.parent;
      if (object?.userData?.interactableId) objectId = object.userData.interactableId;
      break;
    }
    if (objectId && portals.some(item => item.id === objectId)) { walkTo(objectId, true); return; }
    if (ray.ray.intersectPlane(floor, target)) walkTo({ x: target.x, z: target.z });
  }
  const wheel = event => { if (!paused) { event.preventDefault(); zoom = Math.max(.65, Math.min(1.8, zoom + event.deltaY * .0008)); } };
  const contextMenu = event => event.preventDefault();
  const movementEvent = event => {
    if (paused) return;
    const id = officePortalForLegacy(event.detail?.objectId, event.detail?.panel);
    if (id) walkTo(id, true);
    else if (Number.isFinite(event.detail?.x)) walkTo(presenceToOffice(event.detail));
  };
  const contextLost = event => { event.preventDefault(); onError?.('Đồ họa 3D đã tạm ngắt. Bạn có thể tải lại thế giới hoặc mở chế độ tương thích.'); };
  window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);
  window.addEventListener('realm:move', movementEvent); document.addEventListener('visibilitychange', visibility);
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', blur);
  canvas.addEventListener('contextmenu', contextMenu); canvas.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('webglcontextlost', contextLost);

  function frame(now) {
    if (destroyed) return;
    animationId = requestAnimationFrame(frame);
    if (document.hidden || hiddenAt) return;
    // An open work panel should not spend the laptop's GPU budget animating its backdrop.
    if (now - lastRenderAt < (paused ? 200 : materialsSettled ? 0 : 100)) return;
    lastRenderAt = now;
    const rawDt = lastTime ? (now - lastTime) / 1000 : 1 / 60;
    const dt = Math.min(rawDt, .25), movementDt = Math.min(rawDt, 1); lastTime = now;
    if (!paused && materialsSettled && now - qualityChangedAt > 2000) {
      const overloaded = frameBudget.sample(rawDt * 1000);
      const next = overloaded
        ? nextOfficeRenderBudget({ mode: quality, manualHigh, scale: resolutionScale, urgent: rawDt > .25, preference: resolutionPreference })
        : frameBudget.takeRecovery() ? { mode: quality, scale: Math.min(1, resolutionScale + .1) } : null;
      if (next?.mode !== undefined && next.mode !== quality) { setQuality(next.mode, false); announce('Đã chuyển sang đồ họa nhẹ để giữ thao tác ổn định.'); }
      else if (next && next.scale !== resolutionScale) {
        resolutionScale = next.scale; lastResolutionScale = resolutionScale; qualityChangedAt = now; frameBudget.reset(); resize();
      }
    }
    // Exclude the intentional 5 FPS workspace backdrop and texture-loading cap.
    if (!paused && materialsSettled) { frameSamples.push(rawDt * 1000); if (frameSamples.length > 180) frameSamples.shift(); }
    tick += dt;
    let direction = { x: 0, z: 0 }, distanceToStep = Infinity;
    if (!paused) {
      direction = officeKeyVector(keys, yaw);
      if (!direction.x && !direction.z && path.length) {
        const step = path[0], distance = officeDistance(point, step);
        if (distance < .14) path.shift();
        else { distanceToStep = distance; direction = { x: (step.x - point.x) / distance, z: (step.z - point.z) / distance }; }
      }
    }
    const speed = keys.has('shift') ? 5 : 3.1, previous = point;
    // Collision movement already substeps at 15 cm. Keep navigation responsive
    // at low frame rates while limiting recovery after a long foreground stall.
    const travel = Math.min(movementDt * speed, distanceToStep);
    point = moveOfficeActor(point, { x: direction.x * travel, z: direction.z * travel }, colliders);
    moving = officeDistance(previous, point) > .0001;
    if (moving) {
      motionAt = now;
      player.group.rotation.y = lerpAngle(player.group.rotation.y, Math.atan2(-direction.x, -direction.z), Math.min(1, dt * 12));
    }
    player.group.position.set(point.x, .105, point.z);
    player.update?.(dt, { moving, speed, time: tick });
    audio.update({ moving, speed, time: tick, paused });
    ring.position.set(point.x, .17, point.z);
    ring.visible = cameraMode !== 'first';
    if (!path.length) targetMarker.visible = false;
    const preset = CAMERA_PRESETS[cameraMode], anchor = cameraMode === 'overview' ? { x: 0, z: 1 } : point;
    const targetCamera = new THREE.Vector3(anchor.x, preset.targetHeight, anchor.z);
    followAt.lerp(targetCamera, reduced || snapCamera ? 1 : 1 - Math.exp(-dt * 8));
    if (cameraMode === 'first') {
      desiredCamera.set(point.x, 1.65, point.z);
      camera.position.copy(desiredCamera);
      camera.lookAt(point.x - Math.sin(yaw) * Math.cos(pitch) * 10, 1.65 + Math.sin(pitch) * 10, point.z - Math.cos(yaw) * Math.cos(pitch) * 10);
    } else {
      // Zooming out must stay below the lowest overhead beam in walking view.
      const cameraHeight = cameraMode === 'follow' ? Math.min(4.5, preset.height * zoom) : preset.height * zoom;
      desiredCamera.set(anchor.x + Math.sin(yaw) * preset.distance * zoom, cameraHeight, anchor.z + Math.cos(yaw) * preset.distance * zoom);
      if (cameraMode === 'follow') {
        // Keep the shoulder camera within the open hall instead of looking through its walls.
        const limitX = 15.25;
        const dx = desiredCamera.x - point.x, dz = desiredCamera.z - point.z;
        const tx = dx ? ((dx > 0 ? limitX : -limitX) - point.x) / dx : 1;
        // The entrance is intentionally open for a clear arrival view.
        const tz = dz ? ((dz > 0 ? 23 : -11.1) - point.z) / dz : 1;
        const travel = Math.max(.12, Math.min(1, tx, tz));
        desiredCamera.set(point.x + dx * travel, 1.75 + (cameraHeight - 1.75) * travel, point.z + dz * travel);
      }
      camera.position.lerp(desiredCamera, reduced || snapCamera ? 1 : 1 - Math.exp(-dt * 6));
      if (cameraMode === 'follow') {
        // Clip after the spring as well: interpolating across a blocked corner
        // must not put the camera inside a bookcase while its target is clear.
        const clipped = constrainOfficeCamera(targetCamera, camera.position, colliders);
        camera.position.set(clipped.x, clipped.y, clipped.z);
      }
      camera.lookAt(followAt);
    }
    snapCamera = false;
    hall.update?.(dt, { time: tick, reducedMotion: reduced });
    for (const entry of remotes.values()) {
      const was = { ...entry.point };
      const blend = 1 - Math.exp(-dt * 8);
      entry.point.x += (entry.target.x - entry.point.x) * blend; entry.point.z += (entry.target.z - entry.point.z) * blend;
      const stride = officeDistance(was, entry.point);
      entry.group.position.set(entry.point.x, .105, entry.point.z);
      if (stride > .0005) entry.group.rotation.y = lerpAngle(entry.group.rotation.y, Math.atan2(was.x - entry.point.x, was.z - entry.point.z), Math.min(1, dt * 8));
      entry.update?.(dt, { moving: stride > .001, speed: stride / Math.max(dt, .001), time: tick });
    }
    nearest = portals.filter(item => accessible(item) && officeDistance(point, item.position) < item.radius)
      .sort((a, b) => officeDistance(point, a.position) - officeDistance(point, b.position))[0] || null;
    if (pendingOpen && !paused && officeArrivalReady(point, pendingOpen.position)) {
      const arrived = pendingOpen;
      if (arrived.focus) {
        yaw = Math.atan2(point.x - arrived.focus.x, point.z - arrived.focus.z);
        player.group.rotation.y = yaw;
      }
      current.onPosition?.(officeToPresence(point), { ...arrived, id: arrived.legacyId });
      interact(arrived);
      pendingOpen = null;
    }
    if (now - publishAt > 120) {
      publishAt = now;
      const nearby = [...remotes.values()].filter(entry => entry.person.isRemote && entry.person.status !== 'dnd' && officeDistance(point, entry.point) < 4).map(entry => entry.person);
      current.onPosition?.(officeToPresence(point), nearest ? { ...nearest, id: nearest.legacyId } : null);
      const sig = nearby.map(person => person.id || person.name).join('|');
      if (sig !== nearestSignature) { nearestSignature = sig; current.onNearby?.(nearby, null); }
    }
    if (now - hudAt > 250) {
      hudAt = now;
      const rect = host.getBoundingClientRect();
      const labels = portals.filter(accessible).map(item => {
        projected.set(item.position.x, 1.3, item.position.z).project(camera);
        return { id: item.id, name: item.name, x: (projected.x * .5 + .5) * rect.width,
          y: (-projected.y * .5 + .5) * rect.height, visible: projected.z < 1 && projected.z > -1,
          distance: officeDistance(point, item.position) };
      });
      const sorted = [...frameSamples].sort((a, b) => a - b);
      host.dataset.playerX = point.x.toFixed(2); host.dataset.playerZ = point.z.toFixed(2);
      host.dataset.frameP95 = String(Math.round(sorted[Math.floor(sorted.length * .95)] || 0));
      host.dataset.renderScale = resolutionScale.toFixed(2);
      host.dataset.cameraX = camera.position.x.toFixed(3); host.dataset.cameraY = camera.position.y.toFixed(3); host.dataset.cameraZ = camera.position.z.toFixed(3);
      host.dataset.drawCalls = String(renderer.info.render.calls); host.dataset.triangles = String(renderer.info.render.triangles);
      onUpdate?.({ position: { ...point }, nearest: nearest ? { id: nearest.id, name: nearest.name, hint: nearest.hint } : null,
        labels, cameraMode, moving, quality, people: [...remotes.entries()].map(([id, entry]) => {
          projected.set(entry.point.x, 2.3, entry.point.z).project(camera);
          return { ...entry.point, id, name: entry.person.name, color: entry.person.color, status: entry.person.status,
            screenX: (projected.x * .5 + .5) * rect.width, screenY: (-projected.y * .5 + .5) * rect.height,
            visible: projected.z < 1 && projected.z > -1 && officeDistance(point, entry.point) < 12 };
        }),
        selected: selected?.id || null, ready: true });
    }
    renderer.render(scene, camera);
  }
  animationId = requestAnimationFrame(frame);
  return {
    walkTo, interact, changeCamera, resetCamera, selectPerson,
    async toggleAudio() { try { const sound = await audio.toggle(); onUpdate?.({ sound }); return sound; } catch { announce('Thiết bị chưa mở được âm thanh. Bạn vẫn có thể tiếp tục làm việc.'); return false; } },
    updateProps(next) {
      const changed = current.remotePlayers !== next.remotePlayers || current.staff !== next.staff || current.playerProfile?.userId !== next.playerProfile?.userId;
      if (current.playerProfile?.color !== next.playerProfile?.color) player.setColor?.(next.playerProfile?.color);
      current = next;
      if (paused !== Boolean(next.workspaceOpen)) { lastTime = 0; frameBudget.reset(); frameSamples.length = 0; }
      paused = Boolean(next.workspaceOpen);
      if (paused) { keys.clear(); path = []; pendingOpen = null; }
      if (changed) syncPeople();
    },
    direction(key, down) { if (paused) return; if (down) { keys.add(key); path = []; pendingOpen = null; } else keys.delete(key); },
    setQuality, setResolutionPreference,
    destroy() {
      destroyed = true; cancelAnimationFrame(animationId); observer.disconnect(); audio.dispose();
      window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur);
      window.removeEventListener('realm:move', movementEvent); document.removeEventListener('visibilitychange', visibility);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', blur);
      canvas.removeEventListener('contextmenu', contextMenu); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('webglcontextlost', contextLost);
      graphics.setMode('high'); graphics.dispose();
      hall.dispose?.(); player.dispose?.(); for (const entry of remotes.values()) entry.dispose?.();
      freeScene(scene); environment.dispose(); renderer.dispose();
      // Chronicle/remount creates a new canvas. Release this context's GPU
      // allocation immediately instead of waiting for browser garbage collection.
      renderer.forceContextLoss();
    },
  };
}
