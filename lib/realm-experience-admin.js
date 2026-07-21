import {
  applyRealmExperienceTelemetryEvent,
  normalizeRealmExperienceEvent,
  normalizeRealmExperienceTelemetry,
} from './realm-experience.js';
import { RealmOperationError } from './realm-operation.js';

const MAX_TELEMETRY_RETRIES = 3;

function parseSettings(json) {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}

export async function loadRealmExperienceTelemetry(db) {
  const row = await db.setting.findUnique({ where: { id: 1 }, select: { json: true } });
  return normalizeRealmExperienceTelemetry(parseSettings(row?.json).realmExperienceTelemetry);
}

export async function recordRealmExperienceEvent(db, input, now = new Date()) {
  const event = normalizeRealmExperienceEvent(input);
  if (!event) throw new RealmOperationError('Experience event không hợp lệ.', 400, 'realm_experience_event_invalid');
  let lastError = null;
  for (let attempt = 0; attempt < MAX_TELEMETRY_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        const row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
        const settings = parseSettings(row?.json);
        const telemetry = applyRealmExperienceTelemetryEvent(settings.realmExperienceTelemetry, event, now);
        const json = JSON.stringify({ ...settings, realmExperienceTelemetry: telemetry });
        await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, json }, update: { json } });
        return telemetry;
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      lastError = error;
      if (!['P2034', 'P2028'].includes(error?.code) || attempt === MAX_TELEMETRY_RETRIES - 1) throw error;
    }
  }
  throw lastError;
}
