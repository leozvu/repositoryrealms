import bcrypt from 'bcryptjs';
import { isDirector, rolesOf } from './perm.js';
import { verifyTotp } from './totp.js';
import {
  CEO_PORTAL_IDLE_TTL_MS,
  CEO_PORTAL_SESSION_TTL_MS,
  CEO_RECOVERY_CODE_COUNT,
  CEO_SSO_ASSERTION_TTL_MS,
  CEO_SSO_CODE_TTL_MS,
  CeoIdentityError,
  capabilitiesToCeoScopes,
  ceoEntityCredentialMatches,
  ceoPortalSessionState,
  createCeoEntityAssertion,
  hashCeoIdentityMetadata,
  hashCeoIdentitySecret,
  newCeoOpaqueToken,
  newCeoRecoveryCode,
  newCeoSubject,
  normalizeCeoDeviceLabel,
  normalizeCeoEmail,
  normalizeCeoRedirectPath,
  normalizeCeoScopes,
  normalizeCeoSsoArtifact,
  requireCeoStepUp,
  serializeCeoPortalSession,
} from './ceo-identity.js';
import { normalizeCeoRegistryEntityId, parseCeoRegistryCapabilities } from './ceo-entity-registry.js';
import { assertCeoRolloutCapability } from './ceo-rollout.js';

const MAX_RECOVERY_FAILURES = 5;
const RECOVERY_LOCK_MS = 30 * 60_000;
export const CEO_CONTROL_PLANE_SUSPEND_CONFIRMATION = 'SUSPEND CEO PORTAL';
export const CEO_CONTROL_PLANE_RESTORE_CONFIRMATION = 'RESTORE CEO PORTAL';

function requireDirector(user) {
  if (!user) throw new CeoIdentityError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoIdentityError('Director scope required.', 403, 'ceo_identity_director_required');
}

function sessionDates(now) {
  return {
    lastSeenAt: now,
    idleExpiresAt: new Date(now.getTime() + CEO_PORTAL_IDLE_TTL_MS),
    expiresAt: new Date(now.getTime() + CEO_PORTAL_SESSION_TTL_MS),
  };
}

function parseBearer(request) {
  const header = request?.headers?.get?.('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function audit(tx, user, action, refId, detail) {
  return tx.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      action,
      entity: 'ceo_identity',
      refId,
      detail,
    },
  });
}

async function ensureIdentity(tx, user, now) {
  let identity = await tx.ceoGlobalIdentity.findUnique({ where: { userId: user.id } });
  if (!identity) {
    identity = await tx.ceoGlobalIdentity.create({
      data: {
        subject: newCeoSubject(),
        userId: user.id,
        email: normalizeCeoEmail(user.email),
        displayName: String(user.name || 'CEO').trim().slice(0, 100),
        status: 'active',
        createdAt: now,
      },
    });
  }
  if (identity.status !== 'active') {
    throw new CeoIdentityError('Global CEO identity is not active.', 403, 'ceo_identity_inactive');
  }
  const entities = await tx.ceoEntityRegistry.findMany({ orderBy: { id: 'asc' } });
  const existing = await tx.ceoEntityMembership.findMany({ where: { identityId: identity.id } });
  const membershipByEntity = new Map(existing.map((membership) => [membership.entityId, membership]));
  for (const entity of entities) {
    const desiredScopes = capabilitiesToCeoScopes(parseCeoRegistryCapabilities(entity.capabilities));
    const current = membershipByEntity.get(entity.id);
    if (current) {
      const currentScopes = normalizeCeoScopes(current.scopes);
      if (desiredScopes.some((scope) => !currentScopes.includes(scope))) {
        await tx.ceoEntityMembership.update({
          where: { id: current.id },
          data: { scopes: JSON.stringify([...new Set([...currentScopes, ...desiredScopes])]), recordVersion: { increment: 1 } },
        });
      }
      continue;
    }
    await tx.ceoEntityMembership.create({
      data: {
        identityId: identity.id,
        entityId: entity.id,
        localUserEmail: identity.email,
        localRole: 'DIRECTOR',
        scopes: JSON.stringify(desiredScopes),
        status: 'active',
      },
    });
  }
  return identity;
}

async function createSession(tx, identity, {
  now,
  hashSecret,
  deviceLabel,
  userAgent,
  ip,
  assuranceLevel = 'mfa',
  stepUp = true,
}) {
  const rawToken = newCeoOpaqueToken();
  const session = await tx.ceoPortalSession.create({
    data: {
      identityId: identity.id,
      tokenHash: hashCeoIdentitySecret(rawToken, hashSecret),
      deviceLabel: normalizeCeoDeviceLabel(deviceLabel),
      userAgentHash: hashCeoIdentityMetadata(userAgent),
      ipHash: hashCeoIdentityMetadata(ip),
      assuranceLevel,
      stepUpAt: stepUp ? now : null,
      ...sessionDates(now),
    },
  });
  return { rawToken, session };
}

async function recordRecoveryFailure(db, user, now) {
  if (!user?.id) return;
  const failures = Math.max(0, Number(user.loginFails || 0)) + 1;
  const locked = failures >= MAX_RECOVERY_FAILURES;
  await db.user.update({
    where: { id: user.id },
    data: {
      loginFails: locked ? 0 : failures,
      lockedUntil: locked ? new Date(now.getTime() + RECOVERY_LOCK_MS) : user.lockedUntil,
    },
  }).catch(() => {});
  if (locked) {
    await db.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_recovery_locked', entity: 'ceo_identity', refId: user.id, detail: `failures=${MAX_RECOVERY_FAILURES}; lockMinutes=${RECOVERY_LOCK_MS / 60_000}` } }).catch(() => {});
  }
}

export async function bootstrapCeoPortalSession(db, user, input = {}, context = {}) {
  requireDirector(user);
  const now = context.now || new Date();
  const local = await db.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, name: true, role: true, roles: true, status: true, totpSecret: true },
  });
  if (!local || local.status !== 'active' || !isDirector(local)) {
    throw new CeoIdentityError('Director account is unavailable.', 403, 'ceo_identity_director_unavailable');
  }
  if (!local.totpSecret) {
    throw new CeoIdentityError('Enable TOTP before activating CEO SSO.', 428, 'ceo_identity_totp_required');
  }
  if (!verifyTotp(local.totpSecret, input.otp)) {
    throw new CeoIdentityError('TOTP verification failed.', 401, 'ceo_identity_totp_invalid');
  }
  return db.$transaction(async (tx) => {
    const identity = await ensureIdentity(tx, { ...user, ...local }, now);
    const created = await createSession(tx, identity, { ...context, now, deviceLabel: input.deviceLabel });
    await audit(tx, user, 'ceo_session_started', created.session.id, 'assurance=mfa; memberships=provisioned_if_missing');
    return { token: created.rawToken, identity, session: serializeCeoPortalSession({ ...created.session, identity }, now) };
  }, { isolationLevel: 'Serializable' });
}

export async function requireCeoPortalSession(db, user, rawToken, context = {}) {
  requireDirector(user);
  const now = context.now || new Date();
  const tokenHash = hashCeoIdentitySecret(normalizeCeoSsoArtifact(rawToken, 'session'), context.hashSecret);
  const session = await db.ceoPortalSession.findUnique({ where: { tokenHash }, include: { identity: true } });
  const state = ceoPortalSessionState(session, now);
  if (!state.active || session.identity.userId !== user.id) {
    throw new CeoIdentityError('CEO session is unavailable.', 401, state.code || 'ceo_session_subject_mismatch');
  }
  const touchBefore = new Date(now.getTime() - 5 * 60_000);
  if (context.touch !== false && new Date(session.lastSeenAt) < touchBefore) {
    await db.ceoPortalSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastSeenAt: now, idleExpiresAt: new Date(now.getTime() + CEO_PORTAL_IDLE_TTL_MS) },
    });
    session.lastSeenAt = now;
    session.idleExpiresAt = new Date(now.getTime() + CEO_PORTAL_IDLE_TTL_MS);
  }
  return session;
}

export async function readCeoIdentityState(db, user, rawToken, context = {}) {
  requireDirector(user);
  if (!rawToken) {
    const identity = await db.ceoGlobalIdentity.findUnique({ where: { userId: user.id } });
    return { enrolled: Boolean(identity), active: false, stepUp: false, identity: identity ? { subject: identity.subject, status: identity.status } : null, memberships: [], sessions: [], recoveryCodesRemaining: 0 };
  }
  const current = await requireCeoPortalSession(db, user, rawToken, context);
  const [memberships, sessions, recoveryCodesRemaining] = await Promise.all([
    db.ceoEntityMembership.findMany({ where: { identityId: current.identityId }, orderBy: { entityId: 'asc' } }),
    db.ceoPortalSession.findMany({ where: { identityId: current.identityId }, orderBy: { createdAt: 'desc' } }),
    db.ceoRecoveryCode.count({ where: { identityId: current.identityId, version: current.identity.recoveryVersion, usedAt: null } }),
  ]);
  const state = ceoPortalSessionState(current, context.now || new Date());
  return {
    enrolled: true,
    active: true,
    stepUp: state.stepUp,
    identity: { subject: current.identity.subject, email: current.identity.email, displayName: current.identity.displayName, status: current.identity.status },
    memberships: memberships.map((membership) => ({ entityId: membership.entityId, localRole: membership.localRole, localUserEmail: membership.localUserEmail, scopes: normalizeCeoScopes(membership.scopes), status: membership.status, recordVersion: membership.recordVersion })),
    sessions: sessions.map((session) => serializeCeoPortalSession({ ...session, identity: current.identity, current: session.id === current.id }, context.now || new Date())),
    recoveryCodesRemaining,
  };
}

export async function stepUpCeoPortalSession(db, user, rawToken, otp, context = {}) {
  const now = context.now || new Date();
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now, touch: false });
  const local = await db.user.findUnique({ where: { id: user.id }, select: { totpSecret: true } });
  if (!local?.totpSecret || !verifyTotp(local.totpSecret, otp)) {
    throw new CeoIdentityError('TOTP verification failed.', 401, 'ceo_identity_totp_invalid');
  }
  await db.$transaction(async (tx) => {
    const result = await tx.ceoPortalSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { stepUpAt: now, lastSeenAt: now } });
    if (result.count !== 1) throw new CeoIdentityError('CEO session changed.', 409, 'ceo_session_conflict');
    await audit(tx, user, 'ceo_session_step_up', session.id, 'assurance=totp');
  });
  return { ok: true, stepUpAt: now };
}

export async function revokeCeoPortalSession(db, user, rawToken, sessionId, context = {}) {
  const current = await requireCeoPortalSession(db, user, rawToken, { ...context, touch: false });
  const now = context.now || new Date();
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.ceoPortalSession.updateMany({
      where: { id: String(sessionId || ''), identityId: current.identityId, revokedAt: null },
      data: { revokedAt: now, revokeReason: sessionId === current.id ? 'self_revoked' : 'remote_revoked' },
    });
    if (updated.count !== 1) throw new CeoIdentityError('Session is not active.', 404, 'ceo_session_not_found');
    await audit(tx, user, 'ceo_session_revoked', String(sessionId), sessionId === current.id ? 'mode=self' : 'mode=remote');
    return updated;
  });
  return { ok: result.count === 1, currentRevoked: sessionId === current.id };
}

export async function rotateCeoRecoveryCodes(db, user, rawToken, context = {}) {
  const now = context.now || new Date();
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now, touch: false });
  requireCeoStepUp(session, now);
  const codes = Array.from({ length: CEO_RECOVERY_CODE_COUNT }, () => newCeoRecoveryCode());
  const version = Number(session.identity.recoveryVersion || 0) + 1;
  await db.$transaction(async (tx) => {
    await tx.ceoGlobalIdentity.update({ where: { id: session.identityId }, data: { recoveryVersion: version } });
    await tx.ceoRecoveryCode.createMany({ data: codes.map((code) => ({ identityId: session.identityId, codeHash: hashCeoIdentitySecret(code, context.hashSecret), version, createdAt: now })) });
    await audit(tx, user, 'ceo_recovery_codes_rotated', session.identityId, `version=${version}; count=${codes.length}`);
  }, { isolationLevel: 'Serializable' });
  return { version, codes };
}

export async function recoverCeoPortalAccount(db, input = {}, context = {}) {
  const now = context.now || new Date();
  const email = normalizeCeoEmail(input.email);
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, passwordHash: true, role: true, roles: true, teamId: true, userType: true, status: true, loginFails: true, lockedUntil: true } });
  const generic = () => new CeoIdentityError('Recovery credentials are invalid.', 401, 'ceo_recovery_invalid');
  if (!user || user.status !== 'active' || !isDirector(user) || (user.lockedUntil && new Date(user.lockedUntil) > now)) throw generic();
  if (!(await bcrypt.compare(String(input.password || ''), user.passwordHash))) {
    await recordRecoveryFailure(db, user, now);
    throw generic();
  }
  const identity = await db.ceoGlobalIdentity.findUnique({ where: { userId: user.id } });
  const restoringSuspended = identity?.status === 'suspended';
  if (
    !identity
    || !['active', 'suspended'].includes(identity.status)
    || (restoringSuspended && (input.reactivate !== true || input.confirmation !== CEO_CONTROL_PLANE_RESTORE_CONFIRMATION))
  ) {
    await recordRecoveryFailure(db, user, now);
    throw generic();
  }
  let codeHash;
  try { codeHash = hashCeoIdentitySecret(String(input.recoveryCode || '').trim().toUpperCase(), context.hashSecret); } catch { throw generic(); }
  const recovery = await db.ceoRecoveryCode.findUnique({ where: { codeHash } });
  if (!recovery || recovery.identityId !== identity.id || recovery.version !== identity.recoveryVersion || recovery.usedAt) {
    await recordRecoveryFailure(db, user, now);
    throw generic();
  }
  const created = await db.$transaction(async (tx) => {
    const consumed = await tx.ceoRecoveryCode.updateMany({ where: { id: recovery.id, usedAt: null, version: identity.recoveryVersion }, data: { usedAt: now } });
    if (consumed.count !== 1) throw generic();
    await tx.user.update({ where: { id: user.id }, data: { loginFails: 0, lockedUntil: null } });
    if (restoringSuspended) {
      await tx.ceoGlobalIdentity.update({ where: { id: identity.id }, data: { status: 'active' } });
      await tx.ceoPortalSession.updateMany({
        where: { identityId: identity.id, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'control_plane_restore_rotation' },
      });
    }
    const activeIdentity = restoringSuspended ? { ...identity, status: 'active' } : identity;
    const next = await createSession(tx, activeIdentity, { ...context, now, deviceLabel: input.deviceLabel, assuranceLevel: 'recovery', stepUp: false });
    await audit(tx, user, restoringSuspended ? 'ceo_control_plane_restored' : 'ceo_recovery_used', next.session.id, `recoveryVersion=${identity.recoveryVersion}; assurance=recovery; stepUp=false`);
    return { ...next, identity: activeIdentity };
  }, { isolationLevel: 'Serializable' });
  return { user: { id: user.id, email: user.email, name: user.name, role: user.role, roles: rolesOf(user), teamId: user.teamId, userType: user.userType }, token: created.rawToken, identity: created.identity || identity, session: created.session };
}

export async function suspendCeoPortalControlPlane(db, user, rawToken, input = {}, context = {}) {
  const now = context.now || new Date();
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now, touch: false });
  requireCeoStepUp(session, now);
  if (input.confirmation !== CEO_CONTROL_PLANE_SUSPEND_CONFIRMATION) {
    throw new CeoIdentityError('Type the exact control-plane suspension confirmation.', 400, 'ceo_control_plane_confirmation_invalid');
  }
  const reason = String(input.reason || '').trim().replace(/\s+/g, ' ').slice(0, 180);
  if (reason.length < 8) throw new CeoIdentityError('A suspension reason is required.', 400, 'ceo_control_plane_reason_required');
  return db.$transaction(async (tx) => {
    const changed = await tx.ceoGlobalIdentity.updateMany({
      where: { id: session.identityId, status: 'active' },
      data: { status: 'suspended' },
    });
    if (changed.count !== 1) throw new CeoIdentityError('CEO control plane changed before suspension.', 409, 'ceo_control_plane_conflict');
    const revoked = await tx.ceoPortalSession.updateMany({
      where: { identityId: session.identityId, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'control_plane_suspended' },
    });
    const invalidated = await tx.ceoSsoAuthorizationCode.updateMany({
      where: { identityId: session.identityId, consumedAt: null },
      data: { consumedAt: now },
    });
    await audit(tx, user, 'ceo_control_plane_suspended', session.identityId, `sessionsRevoked=${revoked.count}; codesInvalidated=${invalidated.count}; reason=${reason}`);
    return {
      ok: true,
      status: 'suspended',
      sessionsRevoked: revoked.count,
      authorizationCodesInvalidated: invalidated.count,
      localErpLoginPreserved: true,
      entityBusinessDatabasesTouched: false,
    };
  }, { isolationLevel: 'Serializable' });
}

export async function readCeoSecurityPosture(db, user, context = {}) {
  requireDirector(user);
  const now = context.now || new Date();
  const identity = await db.ceoGlobalIdentity.findUnique({ where: { userId: user.id } });
  const [local, entities, activeSessions, unexpiredCredentials] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { status: true, email: true } }),
    db.ceoEntityRegistry.findMany({ orderBy: { id: 'asc' } }),
    identity ? db.ceoPortalSession.count({ where: { identityId: identity.id, revokedAt: null, expiresAt: { gt: now }, idleExpiresAt: { gt: now } } }) : 0,
    db.apiKey.count({ where: { active: true, audience: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
  ]);
  return {
    version: 1,
    controlPlane: {
      enrolled: Boolean(identity),
      status: identity?.status || 'not_enrolled',
      activeSessions,
      killSwitchAvailable: identity?.status === 'active',
      recoveryRequires: ['local password', 'unused recovery code', CEO_CONTROL_PLANE_RESTORE_CONFIRMATION, 'fresh TOTP step-up'],
    },
    localErp: { loginPreserved: local?.status === 'active', email: local?.email || user.email || null },
    serviceCredentials: {
      active: unexpiredCredentials,
      policy: 'scope + audience + expiry + per-entity rate limit',
      rawSecretsPersisted: false,
    },
    entities: entities.map((entity) => ({
      id: entity.id,
      displayName: entity.displayName,
      enabled: entity.enabled,
      status: entity.status,
      circuitState: entity.circuitState,
      retryAt: entity.circuitRetryAt || null,
      ssoCredentialConfigured: Boolean(entity.credentialRef && context.secretResolver?.(entity.credentialRef)),
      serviceCredentialConfigured: Boolean(entity.serviceCredentialRef && context.secretResolver?.(entity.serviceCredentialRef)),
      credentialsSeparated: Boolean(entity.serviceCredentialRef && entity.serviceCredentialRef !== entity.credentialRef),
    })),
    recovery: {
      strategy: 'restore-control-plane-only',
      entityBusinessDatabasesIncluded: false,
      targetRpoHours: 24,
      targetRtoHours: 4,
    },
  };
}

export async function issueCeoAuthorizationCode(db, user, rawToken, input = {}, context = {}) {
  const now = context.now || new Date();
  const session = await requireCeoPortalSession(db, user, rawToken, { ...context, now });
  requireCeoStepUp(session, now);
  const entityId = normalizeCeoRegistryEntityId(input.entityId);
  const redirectPath = normalizeCeoRedirectPath(input.redirectPath);
  const [entity, membership] = await Promise.all([
    db.ceoEntityRegistry.findUnique({ where: { id: entityId } }),
    db.ceoEntityMembership.findUnique({ where: { identityId_entityId: { identityId: session.identityId, entityId } } }),
  ]);
  if (!entity || !entity.enabled) throw new CeoIdentityError('Target entity is not enabled.', 403, 'ceo_sso_entity_disabled');
  if (!membership || membership.status !== 'active' || membership.localRole !== 'DIRECTOR') {
    throw new CeoIdentityError('Active Director membership is required.', 403, 'ceo_sso_membership_required');
  }
  try {
    await assertCeoRolloutCapability(db, entityId, 'sso.issue', { now });
  } catch (error) {
    throw new CeoIdentityError(error.message, error.status || 423, error.code || 'ceo_rollout_capability_hold');
  }
  const code = newCeoOpaqueToken();
  const state = newCeoOpaqueToken(24);
  const nonce = newCeoOpaqueToken(24);
  const expiresAt = new Date(now.getTime() + CEO_SSO_CODE_TTL_MS);
  const row = await db.ceoSsoAuthorizationCode.create({
    data: {
      codeHash: hashCeoIdentitySecret(code, context.hashSecret),
      stateHash: hashCeoIdentitySecret(state, context.hashSecret),
      nonce,
      identityId: session.identityId,
      sessionId: session.id,
      entityId,
      audience: entityId,
      scopes: JSON.stringify(normalizeCeoScopes(membership.scopes)),
      localUserEmail: membership.localUserEmail,
      redirectPath,
      expiresAt,
      createdAt: now,
    },
  });
  await db.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'ceo_sso_code_issued', entity: 'ceo_identity', refId: row.id, detail: `entity=${entityId}; expiresIn=${CEO_SSO_CODE_TTL_MS / 1000}s` } });
  const destination = new URL('/api/ceo/v1/sso/callback', entity.baseUrl);
  destination.searchParams.set('code', code);
  destination.searchParams.set('state', state);
  return { destination: destination.toString(), expiresAt, entityId };
}

export async function exchangeCeoAuthorizationCode(db, request, input = {}, context = {}) {
  const now = context.now || new Date();
  const entityId = normalizeCeoRegistryEntityId(input.entityId);
  const code = normalizeCeoSsoArtifact(input.code, 'code');
  const state = normalizeCeoSsoArtifact(input.state, 'state');
  const entity = await db.ceoEntityRegistry.findUnique({ where: { id: entityId } });
  const expectedCredential = entity?.credentialRef ? context.secretResolver(entity.credentialRef) : '';
  if (!entity?.enabled || !ceoEntityCredentialMatches(parseBearer(request), expectedCredential)) {
    throw new CeoIdentityError('Entity authentication failed.', 401, 'ceo_sso_entity_unauthorized');
  }
  const codeHash = hashCeoIdentitySecret(code, context.hashSecret);
  const row = await db.ceoSsoAuthorizationCode.findUnique({ where: { codeHash }, include: { identity: true, session: { include: { identity: true } } } });
  if (row?.consumedAt) {
    throw new CeoIdentityError('Authorization code was already consumed.', 409, 'ceo_sso_code_replayed');
  }
  if (!row || row.entityId !== entityId || row.audience !== entityId || new Date(row.expiresAt) <= now) {
    throw new CeoIdentityError('Authorization code is invalid or expired.', 401, 'ceo_sso_code_invalid');
  }
  if (row.stateHash !== hashCeoIdentitySecret(state, context.hashSecret)) {
    throw new CeoIdentityError('SSO state is invalid.', 401, 'ceo_sso_state_invalid');
  }
  const sessionState = ceoPortalSessionState(row.session, now);
  if (!sessionState.active || !sessionState.stepUp || row.identity.status !== 'active') {
    throw new CeoIdentityError('Issuing CEO session is no longer valid.', 401, 'ceo_sso_session_invalid');
  }
  const membership = await db.ceoEntityMembership.findUnique({ where: { identityId_entityId: { identityId: row.identityId, entityId } } });
  if (!membership || membership.status !== 'active' || membership.localRole !== 'DIRECTOR') {
    throw new CeoIdentityError('Director membership is no longer active.', 403, 'ceo_sso_membership_required');
  }
  const consumed = await db.$transaction(async (tx) => {
    const result = await tx.ceoSsoAuthorizationCode.updateMany({ where: { id: row.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
    if (result.count !== 1) throw new CeoIdentityError('Authorization code was already consumed.', 409, 'ceo_sso_code_replayed');
    await tx.auditLog.create({ data: { userId: row.identity.userId, userName: row.identity.displayName, action: 'ceo_sso_code_consumed', entity: 'ceo_identity', refId: row.id, detail: `entity=${entityId}` } });
    return result;
  }, { isolationLevel: 'Serializable' });
  if (consumed.count !== 1) throw new CeoIdentityError('Authorization code exchange failed.', 409, 'ceo_sso_code_replayed');
  const issuedAt = Math.floor(now.getTime() / 1000);
  const assertion = createCeoEntityAssertion({
    entitySecret: expectedCredential,
    payload: {
      iss: 'repositoryrealms-ceo-portal',
      aud: entityId,
      sub: row.identity.subject,
      role: 'DIRECTOR',
      localUserEmail: membership.localUserEmail,
      scopes: normalizeCeoScopes(membership.scopes),
      nonce: row.nonce,
      redirectPath: row.redirectPath,
      iat: issuedAt,
      exp: Math.floor((now.getTime() + CEO_SSO_ASSERTION_TTL_MS) / 1000),
    },
  });
  return { assertion, tokenType: 'RepositoryRealms-SSO', expiresIn: CEO_SSO_ASSERTION_TTL_MS / 1000 };
}
