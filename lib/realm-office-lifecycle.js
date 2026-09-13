import { officeToPresence, presenceToOffice } from './realm-office-3d.js';

export function restoreRealmOfficePosition(position, { worldVersion, legacyNormalize }) {
  return worldVersion === '3d' ? officeToPresence(presenceToOffice(position)) : legacyNormalize(position);
}

export function realmPersonPanelState(person) {
  if (!person?.id) return null;
  return { selectedPersonId: person.userId || person.id, mode: 'world', activePanel: 'person', surfaceOpen: true };
}

/** Deliver only after the mounted world is ready and its inspector pause has
 * cleared. A newer intent/unmount can cancel an old one; it is never replayed. */
export function scheduleRealmOfficeMove(detail, {
  ready, dispatch, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame,
  now = () => performance.now(), maxWaitMs = 15_000, onTimeout = () => {},
}) {
  let stopped = false;
  let frame;
  const started = now();
  const tick = () => {
    if (stopped) return;
    if (ready()) { stopped = true; dispatch({ ...detail }); return; }
    if (now() - started >= maxWaitMs) { stopped = true; onTimeout(); return; }
    frame = requestFrame(tick);
  };
  frame = requestFrame(tick);
  return () => { stopped = true; cancelFrame(frame); };
}

export function realmCaptureControls({ micOn, cameraOn, sharing }) {
  return [
    micOn && { id: 'mic', icon: 'mic', label: 'Mic đang bật · Tắt mic' },
    cameraOn && { id: 'camera', icon: 'camera', label: 'Camera đang bật · Tắt camera' },
    sharing && { id: 'share', icon: 'screen', label: 'Đang chia sẻ · Dừng chia sẻ' },
  ].filter(Boolean);
}

/** Audio owns playback only, never the remote MediaStream tracks. Mount this
 * independently of video previews/workspace panels to preserve two-way calls. */
export function attachRealmCallAudio(element, stream, onBlocked = () => {}) {
  if (!element) return () => {};
  let active = true;
  element.srcObject = stream || null;
  if (stream) Promise.resolve(element.play()).catch(() => { if (active) onBlocked(); });
  return () => { active = false; element.pause(); element.srcObject = null; };
}
