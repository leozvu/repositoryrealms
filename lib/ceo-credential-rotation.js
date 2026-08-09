import { timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { deploymentBackupSchema } from './ceo-backup-export.js';
import { isDirector } from './perm.js';
import { normalizeCeoEmail } from './ceo-identity.js';
import { withSchema } from '../scripts/lib/ceo-production-truth.mjs';

export const CEO_CREDENTIAL_ROTATION_HEADER = 'x-ceo-credential-rotation-key';
const HEX_64 = /^[a-f0-9]{64}$/;
const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const TOTP_SECRET = /^[A-Z2-7]{32}$/;

export class CeoCredentialRotationError extends Error {
  constructor(message, status = 404, code = 'ceo_credential_rotation_unavailable') {
    super(message);
    this.name = 'CeoCredentialRotationError';
    this.status = status;
    this.code = code;
  }
}

function equalSecret(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeCeoCredentialRotation(request, body, env = process.env, now = new Date()) {
  const secret = String(env.CEO_CREDENTIAL_ROTATION_SECRET || '');
  const supplied = request?.headers?.get?.(CEO_CREDENTIAL_ROTATION_HEADER) || '';
  const expiresAt = new Date(String(env.CEO_CREDENTIAL_ROTATION_EXPIRES_AT || ''));
  const expectedEmail = normalizeCeoEmail(env.CEO_CREDENTIAL_ROTATION_EMAIL || '');
  const backupSha256 = String(env.CEO_CREDENTIAL_ROTATION_BACKUP_SHA256 || '');
  const userId = String(body?.userId || '');
  const email = normalizeCeoEmail(body?.email || '');
  if (env.CEO_CREDENTIAL_ROTATION_APPROVED !== 'true'
    || deploymentBackupSchema(env) !== 'ceoportal'
    || secret.length < 48
    || !equalSecret(secret, supplied)
    || Number.isNaN(expiresAt.getTime())
    || expiresAt <= now
    || expectedEmail !== email
    || userId.length < 12
    || body?.confirmation !== `ROTATE CEO CREDENTIALS ${userId}`
    || !HEX_64.test(backupSha256)
    || body?.backupSha256 !== backupSha256
    || !BCRYPT.test(String(body?.passwordHash || ''))
    || !TOTP_SECRET.test(String(body?.totpSecret || ''))) {
    throw new CeoCredentialRotationError('Credential rotation is unavailable.');
  }
  return { userId, email, passwordHash: body.passwordHash, totpSecret: body.totpSecret };
}

export async function rotateCeoCredential({ db, authorization, now = new Date() }) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: authorization.userId } });
    if (!user || normalizeCeoEmail(user.email) !== authorization.email || user.status !== 'active' || !isDirector(user)) {
      throw new CeoCredentialRotationError('CEO Director mapping is unavailable.', 409, 'ceo_credential_mapping_invalid');
    }
    const identity = await tx.ceoGlobalIdentity.findUnique({ where: { userId: user.id } });
    if (!identity || identity.status !== 'active') {
      throw new CeoCredentialRotationError('CEO identity is unavailable.', 409, 'ceo_credential_identity_invalid');
    }
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: authorization.passwordHash,
        totpSecret: authorization.totpSecret,
        loginFails: 0,
        lockedUntil: null,
      },
    });
    const sessions = await tx.ceoPortalSession.updateMany({
      where: { identityId: identity.id, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'credential_rotation' },
    });
    const codes = await tx.ceoSsoAuthorizationCode.updateMany({
      where: { identityId: identity.id, consumedAt: null },
      data: { consumedAt: now },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: 'ceo_credential_rotated',
        entity: 'ceo_identity',
        refId: identity.subject,
        detail: `sessionsRevoked=${sessions.count}; authorizationCodesInvalidated=${codes.count}; totpRotated=true`,
      },
    });
    return {
      userId: user.id,
      email: user.email,
      sessionsRevoked: sessions.count,
      authorizationCodesInvalidated: codes.count,
      localEntityPasswordsChanged: false,
    };
  }, { isolationLevel: 'Serializable', maxWait: 15_000, timeout: 30_000 });
}

export async function rotateDeploymentCeoCredential({ request, body, env = process.env }) {
  const authorization = authorizeCeoCredentialRotation(request, body, env);
  const directUrl = String(env.DIRECT_URL || '');
  if (!directUrl) throw new CeoCredentialRotationError('Credential connection is unavailable.');
  const db = new PrismaClient({ datasources: { db: { url: withSchema(directUrl, 'ceoportal') } } });
  try {
    return await rotateCeoCredential({ db, authorization });
  } finally {
    await db.$disconnect();
  }
}
