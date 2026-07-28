import { generateKey, hashKey } from './apiauth.js';
import { CeoIdentityError, requireCeoStepUp } from './ceo-identity.js';
import { requireCeoPortalSession } from './ceo-identity-admin.js';
import { CEO_SERVICE_SCOPE_ALLOWLIST, normalizeCeoServiceAudience, parseCeoServiceScopes } from './ceo-service-auth.js';

const DEFAULT_TTL_DAYS = 90;
const MAX_TTL_DAYS = 180;

function normalizeTtlDays(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_TTL_DAYS;
  const ttl = Number(value);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_DAYS) {
    throw new CeoIdentityError('Credential TTL must be between 1 and 180 days.', 400, 'ceo_service_ttl_invalid');
  }
  return ttl;
}

export async function listLocalCeoServiceCredentials(db, user, rawToken, audience, context = {}) {
  const now = context.now || new Date();
  await requireCeoPortalSession(db, user, rawToken, { ...context, now });
  audience = normalizeCeoServiceAudience(audience);
  const rows = await db.apiKey.findMany({ where: { audience }, orderBy: { createdAt: 'desc' } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    audience: row.audience,
    scopes: parseCeoServiceScopes(row.scopes),
    active: Boolean(row.active),
    expired: Boolean(row.expiresAt && new Date(row.expiresAt) <= now),
    expiresAt: row.expiresAt || null,
    rotatedAt: row.rotatedAt || null,
    createdAt: row.createdAt,
    lastUsed: row.lastUsed || null,
  }));
}

export async function rotateLocalCeoServiceCredential(db, user, rawToken, audience, input = {}, context = {}) {
  const now = context.now || new Date();
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now, touch: false });
  requireCeoStepUp(session, now);
  audience = normalizeCeoServiceAudience(audience);
  const ttlDays = normalizeTtlDays(input.ttlDays);
  const raw = generateKey();
  const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60_000);
  const name = `CEO Portal service · ${audience}`;
  const row = await db.$transaction(async (tx) => {
    await tx.apiKey.updateMany({
      where: { audience, active: true },
      data: { active: false, rotatedAt: now },
    });
    const created = await tx.apiKey.create({ data: {
      name,
      prefix: raw.slice(0, 10),
      keyHash: hashKey(raw),
      roles: JSON.stringify(['DIRECTOR']),
      scopes: JSON.stringify(CEO_SERVICE_SCOPE_ALLOWLIST),
      audience,
      active: true,
      expiresAt,
      rotatedAt: now,
    } });
    await tx.auditLog.create({ data: {
      userId: user.id,
      userName: user.name,
      action: 'ceo_service_credential_rotated',
      entity: 'apikeys',
      refId: created.id,
      detail: `audience=${audience}; prefix=${created.prefix}; ttlDays=${ttlDays}; scopes=${CEO_SERVICE_SCOPE_ALLOWLIST.length}`,
    } });
    return created;
  }, { isolationLevel: 'Serializable' });
  return {
    credential: {
      id: row.id,
      key: raw,
      prefix: row.prefix,
      audience,
      scopes: CEO_SERVICE_SCOPE_ALLOWLIST,
      expiresAt,
    },
    warning: 'This credential is shown once. Store it only in the deployment secret manager.',
  };
}
