import { COLLABORATION_PRESENCE_TTL_MS } from './collaboration.js';
import {
  CEO_FEDERATION_SCOPE,
  CeoFederationError,
  buildCeoFederationPresenceEnvelope,
  normalizeCeoFederationPolicy,
  normalizeCeoFederationPolicyUpdate,
} from './ceo-federation.js';
import { parseCeoSettings } from './ceo-entity-contract.js';
import { isDirector } from './perm.js';

function requireDirector(user) {
  if (!user) throw new CeoFederationError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoFederationError('Director scope required.', 403, 'ceo_federation_director_required');
}

async function readSettings(db) {
  const row = await db.setting.findUnique({ where: { id: 1 }, select: { json: true } });
  let settings = {};
  try { settings = parseCeoSettings(row); } catch { settings = {}; }
  return { row, settings };
}

export async function readLocalCeoFederationPolicy(db, user) {
  requireDirector(user);
  const { settings } = await readSettings(db);
  return normalizeCeoFederationPolicy(settings.ceoFederation);
}

export async function updateLocalCeoFederationPolicy(db, user, input = {}, now = new Date()) {
  requireDirector(user);
  const draft = normalizeCeoFederationPolicyUpdate(input);
  return db.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    let settings = {};
    try { settings = parseCeoSettings(row); } catch { settings = {}; }
    const current = normalizeCeoFederationPolicy(settings.ceoFederation);
    if (current.version !== draft.expectedVersion) throw new CeoFederationError('Federation policy changed. Reload before saving.', 409, 'ceo_federation_policy_conflict');
    const next = { version: current.version + 1, presenceEnabled: draft.presenceEnabled, updatedAt: now.toISOString() };
    const json = JSON.stringify({ ...settings, ceoFederation: next });
    await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, json }, update: { json } });
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_federation_policy_updated', entity: 'settings', refId: 'ceoFederation', detail: `version=${next.version}; presenceEnabled=${next.presenceEnabled}` } });
    return next;
  }, { isolationLevel: 'Serializable' });
}

export async function buildLocalCeoFederationPresence(db, user, entity, asOf = new Date()) {
  requireDirector(user);
  const { settings } = await readSettings(db);
  const policy = normalizeCeoFederationPolicy(settings.ceoFederation);
  if (!policy.presenceEnabled) return buildCeoFederationPresenceEnvelope({ entity, policy, asOf });
  const threshold = new Date(asOf.getTime() - COLLABORATION_PRESENCE_TTL_MS);
  const [profiles, sessions] = await Promise.all([
    db.ceoEntityDirectoryProfile.findMany({
      where: { sharedWithCeoPortal: true, sharePresence: true, user: { status: 'active', userType: 'employee' } },
      include: { user: { select: { id: true, name: true, title: true, status: true, userType: true } } },
      orderBy: { updatedAt: 'asc' }, take: 200,
    }),
    db.collaborationPresenceSession.findMany({
      where: { lastSeen: { gte: threshold }, user: { status: 'active', userType: 'employee', ceoDirectoryProfile: { sharedWithCeoPortal: true, sharePresence: true } } },
      select: { userId: true, surface: true, availability: true, lastSeen: true },
      orderBy: { lastSeen: 'desc' }, take: 1_000,
    }),
  ]);
  return buildCeoFederationPresenceEnvelope({ entity, policy, profiles, sessions, asOf });
}

export function assertCeoFederationHeaders(request, entityId) {
  const audience = String(request.headers.get('x-ceo-entity-id') || '').trim().toLowerCase();
  const scope = String(request.headers.get('x-ceo-federation-scope') || '').trim().toLowerCase();
  const subject = String(request.headers.get('x-ceo-actor-subject') || '').trim();
  if (audience !== entityId) throw new CeoFederationError('Federation audience mismatch.', 403, 'ceo_federation_audience_mismatch');
  if (scope !== CEO_FEDERATION_SCOPE) throw new CeoFederationError('Federation scope mismatch.', 403, 'ceo_federation_scope_mismatch');
  if (!/^ceo_[A-Za-z0-9_-]{12,100}$/.test(subject)) throw new CeoFederationError('Federation actor subject is invalid.', 403, 'ceo_federation_subject_invalid');
  return { audience, scope, subject };
}
