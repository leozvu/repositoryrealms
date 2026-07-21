import { isDirector } from './perm.js';
import {
  CeoRegistryError,
  ceoCircuitAvailability,
  normalizeCeoCredentialRotation,
  normalizeCeoRegistryEntityId,
  normalizeCeoRegistryUpdate,
  planCeoRegistryFailure,
  serializeCeoRegistryEntity,
} from './ceo-entity-registry.js';

const resolveServerSecret = (name) => process.env[name];

function requireDirector(user) {
  if (!user) throw new CeoRegistryError('Authentication required.', 401, 'unauthorized');
  if (!isDirector(user)) throw new CeoRegistryError('Director scope required.', 403, 'ceo_registry_director_required');
}

function missingEntity() {
  return new CeoRegistryError('Entity is not registered.', 404, 'ceo_registry_entity_not_found');
}

function versionConflict() {
  return new CeoRegistryError('Registry record changed. Reload before retrying.', 409, 'ceo_registry_version_conflict');
}

export async function listCeoRegistryEntities(db, user, { secretResolver = resolveServerSecret } = {}) {
  requireDirector(user);
  const rows = await db.ceoEntityRegistry.findMany({ orderBy: [{ environment: 'asc' }, { displayName: 'asc' }] });
  return {
    registryVersion: 1,
    entities: rows.map((row) => serializeCeoRegistryEntity(row, { secretResolver })),
    commands: ['entity.update', 'credential.rotate'],
    destructiveCommands: [],
  };
}

export async function updateCeoRegistryEntity(
  db,
  user,
  entityId,
  input,
  { now = new Date(), secretResolver = resolveServerSecret } = {},
) {
  requireDirector(user);
  entityId = normalizeCeoRegistryEntityId(entityId);
  const command = normalizeCeoRegistryUpdate(input);
  const updated = await db.$transaction(async (tx) => {
    const current = await tx.ceoEntityRegistry.findUnique({ where: { id: entityId } });
    if (!current) throw missingEntity();
    if (command.data.enabled === true && !secretResolver(current.credentialRef)) {
      throw new CeoRegistryError(
        'Provision the referenced server secret before enabling this entity.',
        422,
        'ceo_registry_credential_missing',
      );
    }
    const data = {
      ...command.data,
      ...(command.data.capabilities ? { capabilities: JSON.stringify(command.data.capabilities) } : {}),
      recordVersion: { increment: 1 },
    };
    if (command.data.enabled === false) data.status = 'disabled';
    if (command.data.enabled === true && current.status === 'disabled') data.status = 'unverified';
    const result = await tx.ceoEntityRegistry.updateMany({
      where: { id: entityId, recordVersion: command.expectedVersion },
      data,
    });
    if (result.count !== 1) throw versionConflict();
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: 'ceo_registry_update',
        entity: 'ceo_entity_registry',
        refId: entityId,
        detail: `fields=${Object.keys(command.data).sort().join(',')}; expectedVersion=${command.expectedVersion}`,
      },
    });
    return tx.ceoEntityRegistry.findUnique({ where: { id: entityId } });
  }, { isolationLevel: 'Serializable' });
  return serializeCeoRegistryEntity(updated, { secretResolver });
}

export async function rotateCeoRegistryCredential(
  db,
  user,
  entityId,
  input,
  { now = new Date(), secretResolver = resolveServerSecret } = {},
) {
  requireDirector(user);
  entityId = normalizeCeoRegistryEntityId(entityId);
  const command = normalizeCeoCredentialRotation(input);
  if (!secretResolver(command.credentialRef)) {
    throw new CeoRegistryError(
      'The new server secret reference is not provisioned.',
      422,
      'ceo_registry_rotation_secret_missing',
    );
  }
  const updated = await db.$transaction(async (tx) => {
    const current = await tx.ceoEntityRegistry.findUnique({ where: { id: entityId } });
    if (!current) throw missingEntity();
    const nextCredentialVersion = Number(current.credentialVersion || 1) + 1;
    const result = await tx.ceoEntityRegistry.updateMany({
      where: { id: entityId, recordVersion: command.expectedVersion },
      data: {
        credentialRef: command.credentialRef,
        credentialVersion: nextCredentialVersion,
        rotatedAt: now,
        recordVersion: { increment: 1 },
        status: current.enabled ? 'unverified' : 'disabled',
        consecutiveErrors: 0,
        lastErrorCode: null,
        circuitState: 'closed',
        circuitOpenedAt: null,
        circuitRetryAt: null,
      },
    });
    if (result.count !== 1) throw versionConflict();
    await tx.auditLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        action: 'ceo_registry_credential_rotated',
        entity: 'ceo_entity_registry',
        refId: entityId,
        detail: `credentialVersion=${nextCredentialVersion}; expectedVersion=${command.expectedVersion}`,
      },
    });
    return tx.ceoEntityRegistry.findUnique({ where: { id: entityId } });
  }, { isolationLevel: 'Serializable' });
  return serializeCeoRegistryEntity(updated, { secretResolver });
}

export async function recordCeoRegistrySyncSuccess(db, entityId, now = new Date()) {
  entityId = normalizeCeoRegistryEntityId(entityId);
  return db.ceoEntityRegistry.update({
    where: { id: entityId },
    data: {
      status: 'ready',
      lastSyncAttemptAt: now,
      lastSuccessfulSyncAt: now,
      consecutiveErrors: 0,
      lastErrorCode: null,
      circuitState: 'closed',
      circuitOpenedAt: null,
      circuitRetryAt: null,
    },
  });
}

export async function recordCeoRegistrySyncFailure(db, entityId, errorCode, now = new Date()) {
  entityId = normalizeCeoRegistryEntityId(entityId);
  return db.$transaction(async (tx) => {
    const current = await tx.ceoEntityRegistry.findUnique({ where: { id: entityId } });
    if (!current) throw missingEntity();
    const plan = planCeoRegistryFailure(current, { now, errorCode });
    const result = await tx.ceoEntityRegistry.updateMany({
      where: { id: entityId, consecutiveErrors: current.consecutiveErrors },
      data: plan,
    });
    if (result.count !== 1) {
      throw new CeoRegistryError('Concurrent sync state update.', 409, 'ceo_registry_sync_state_conflict');
    }
    return tx.ceoEntityRegistry.findUnique({ where: { id: entityId } });
  }, { isolationLevel: 'Serializable' });
}

export async function prepareCeoRegistrySync(
  db,
  entityId,
  { now = new Date(), secretResolver = resolveServerSecret } = {},
) {
  entityId = normalizeCeoRegistryEntityId(entityId);
  const row = await db.ceoEntityRegistry.findUnique({ where: { id: entityId } });
  if (!row) throw missingEntity();
  const availability = ceoCircuitAvailability(row, now);
  if (!availability.allowed) {
    throw new CeoRegistryError('Entity sync is not currently available.', 503, availability.code);
  }
  const credential = secretResolver(row.credentialRef);
  if (!credential) {
    throw new CeoRegistryError('Entity credential is unavailable.', 503, 'ceo_registry_credential_missing');
  }
  if (availability.mode === 'probe') {
    await db.ceoEntityRegistry.update({
      where: { id: entityId },
      data: { circuitState: 'half_open', lastSyncAttemptAt: now },
    });
  }
  return {
    entity: { id: row.id, baseUrl: row.baseUrl, contractVersion: row.contractVersion, schemaVersion: row.schemaVersion },
    credential,
    mode: availability.mode,
  };
}
