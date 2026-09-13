import { createHash, randomUUID } from 'node:crypto';

export const OUTBOX_PAYLOAD_VERSION = 1;
export const OUTBOX_LEASE_MS = 60_000;
export const OUTBOX_MAX_ATTEMPTS = 8;

export class OutboxError extends Error {
  constructor(code, { permanent = false } = {}) {
    super(code);
    this.code = code;
    this.permanent = permanent;
  }
}

// Only allow known classification codes into logs/database; never URLs, response
// bodies, SQL, payloads or arbitrary exception messages (which can contain secrets).
export function outboxErrorCode(error) {
  const code = String(error?.code || '');
  if (/^(?:OUTBOX_[A-Z_]+|HTTP_[1-5]\d\d|P\d{4})$/.test(code)) return code;
  if (['TimeoutError', 'AbortError'].includes(error?.name)) return 'OUTBOX_TIMEOUT';
  return 'OUTBOX_DELIVERY_FAILED';
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export const outboxHash = value => createHash('sha256').update(value).digest('hex');
const serialize = value => JSON.stringify(canonical(JSON.parse(JSON.stringify(value))));
const SECRET_FIELDS = new Set(['password', 'passwordhash', 'totpsecret', 'secret', 'accesstoken', 'refreshtoken', 'apikey', 'authorization', 'token', 'credential']);
function eventSnapshot(value) {
  // Preserve Prisma Decimal's public JSON representation, not its internal
  // coefficient/exponent fields, before recursively removing credential keys.
  if (value && typeof value.toJSON === 'function') return eventSnapshot(value.toJSON());
  if (Array.isArray(value)) return value.map(eventSnapshot);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_FIELDS.has(key.toLowerCase().replace(/[_-]/g, ''))).map(([key, field]) => [key, eventSnapshot(field)]));
  }
  return value;
}
const token = (value, name) => {
  const result = String(value || '');
  if (!/^[a-zA-Z0-9:_-]{1,180}$/.test(result)) throw new OutboxError(`OUTBOX_INVALID_${name}`, { permanent: true });
  return result;
};

async function insertJob(db, { occurrenceId, deliveryKey, kind, resource, event, payload, now }) {
  const encoded = serialize(payload);
  if (Buffer.byteLength(encoded, 'utf8') > 1_000_000) throw new OutboxError('OUTBOX_PAYLOAD_TOO_LARGE', { permanent: true });
  const requestHash = outboxHash(encoded);
  const id = `evt_${outboxHash(`${occurrenceId}\n${deliveryKey}`).slice(0, 48)}`;
  // Empty-update Prisma upserts can race through a read followed by INSERT.
  // Let PostgreSQL arbitrate unique keys with INSERT ... ON CONFLICT DO NOTHING;
  // duplicates must preserve the original payload and delivery/lease state.
  await db.eventOutbox.createMany({
    data: [{
      id, occurrenceId, deliveryKey, kind, resource, event,
      payloadVersion: OUTBOX_PAYLOAD_VERSION, payload: encoded, requestHash,
      status: 'pending', attempts: 0, maxAttempts: OUTBOX_MAX_ATTEMPTS,
      availableAt: now, createdAt: now,
    }],
    skipDuplicates: true,
  });
  // Under ReadCommitted this statement sees a concurrent winner after INSERT
  // waits for its commit. Stronger isolation can abort the caller's transaction;
  // let its existing transaction retry policy handle that outside the tx.
  const row = await db.eventOutbox.findUnique({
    where: { occurrenceId_deliveryKey: { occurrenceId, deliveryKey } },
    select: { id: true, occurrenceId: true, requestHash: true },
  });
  if (!row) throw new OutboxError('OUTBOX_ENQUEUE_MISSING');
  if (row.requestHash !== requestHash) throw new OutboxError('OUTBOX_OCCURRENCE_CONFLICT', { permanent: true });
  return { id: row.id, occurrenceId: row.occurrenceId };
}

/** Call inside the SAME transaction as the mutation and audit. Failure must roll
 * back that transaction. A supplied occurrenceId identifies one occurrence,
 * never a whole entity. Client request retries still need command idempotency. */
export async function enqueueEvent(db, { resource, event, row, old = null, user = null, occurrenceId = randomUUID() }, { now = new Date() } = {}) {
  return insertJob(db, {
    occurrenceId: token(occurrenceId, 'OCCURRENCE'), deliveryKey: 'event', kind: 'event',
    resource: token(resource, 'RESOURCE'), event: token(event, 'EVENT'), now,
    payload: { resource, event, row: eventSnapshot(row ?? null), old: eventSnapshot(old), user: user ? { id: user.id || null, name: user.name || null } : null },
  });
}

/** Worker-only fanout, inside the local-effects transaction. Secrets are read
 * from the webhook record at send time and are never copied to the outbox. */
export async function enqueueWebhook(db, parent, { deliveryKey, url, hookId = null, eventName, body }) {
  return insertJob(db, {
    occurrenceId: parent.occurrenceId, deliveryKey, kind: 'webhook',
    resource: parent.resource, event: parent.event, now: new Date(parent.createdAt),
    payload: { url, hookId, eventName, body },
  });
}

export function readOutboxPayload(job) {
  if (job.payloadVersion !== OUTBOX_PAYLOAD_VERSION) throw new OutboxError('OUTBOX_UNSUPPORTED_VERSION', { permanent: true });
  if (outboxHash(job.payload) !== job.requestHash) throw new OutboxError('OUTBOX_HASH_MISMATCH', { permanent: true });
  try { return JSON.parse(job.payload); } catch { throw new OutboxError('OUTBOX_INVALID_PAYLOAD', { permanent: true }); }
}

export function retryDelayMs(attempts) {
  return Math.min(3_600_000, 5_000 * 2 ** Math.max(0, attempts - 1));
}

/** Claims are compare-and-swap, so concurrent workers cannot own the same lease.
 * An abandoned lease is eligible again; each claim counts against the budget. */
export async function claimOutboxJob(db, { now = new Date(), leaseMs = OUTBOX_LEASE_MS } = {}) {
  const eligible = { OR: [
    { status: 'pending', availableAt: { lte: now } },
    { status: 'processing', leaseUntil: { lte: now } },
  ] };
  const candidates = await db.eventOutbox.findMany({ where: eligible, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 25 });
  for (const job of candidates) {
    const where = { id: job.id, attempts: job.attempts, ...eligible };
    if (job.attempts >= job.maxAttempts) {
      await db.eventOutbox.updateMany({ where, data: { status: 'dead', lastErrorCode: 'OUTBOX_ATTEMPTS_EXHAUSTED', leaseToken: null, leaseUntil: null } });
      continue;
    }
    const leaseToken = randomUUID();
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const result = await db.eventOutbox.updateMany({ where, data: { status: 'processing', attempts: { increment: 1 }, leaseToken, leaseUntil } });
    if (result.count === 1) return { ...job, status: 'processing', attempts: job.attempts + 1, leaseToken, leaseUntil };
  }
  return null;
}

const owned = job => ({ id: job.id, status: 'processing', leaseToken: job.leaseToken });

async function failJob(db, job, error, now) {
  const dead = error?.permanent === true || job.attempts >= job.maxAttempts;
  const lastErrorCode = outboxErrorCode(error);
  const result = await db.eventOutbox.updateMany({
    where: owned(job), data: {
      status: dead ? 'dead' : 'pending', lastErrorCode,
      availableAt: new Date(now.getTime() + retryDelayMs(job.attempts)), leaseToken: null, leaseUntil: null,
    },
  });
  return { id: job.id, status: result.count ? (dead ? 'dead' : 'pending') : 'lease_lost', errorCode: lastErrorCode };
}

/** processLocal MUST use only the supplied tx; no HTTP or global client writes.
 * Local effects, fanout and completion therefore commit once or roll back together.
 * sendWebhook is outside a DB transaction: after an uncertain HTTP response a
 * retry can duplicate delivery. Stable IDs/body let receivers deduplicate. */
export async function processOutboxJob(db, job, { processLocal, sendWebhook, clock = () => new Date() }) {
  try {
    const payload = readOutboxPayload(job);
    if (job.kind === 'event') {
      const done = await db.$transaction(async tx => {
        // This write obtains the row lock before any effects. A stale worker
        // cannot pass it once another worker has acquired a newer lease.
        const lock = await tx.eventOutbox.updateMany({ where: { ...owned(job), leaseUntil: { gt: clock() } }, data: { leaseToken: job.leaseToken } });
        if (!lock.count) return false;
        await processLocal(tx, payload, job);
        await tx.eventOutbox.updateMany({ where: owned(job), data: { status: 'delivered', completedAt: clock(), leaseToken: null, leaseUntil: null, lastErrorCode: null } });
        return true;
      }, { timeout: 30_000, isolationLevel: 'Serializable' });
      return { id: job.id, status: done ? 'delivered' : 'lease_lost' };
    }
    if (job.kind !== 'webhook') throw new OutboxError('OUTBOX_UNKNOWN_KIND', { permanent: true });
    // Verify ownership immediately before HTTP; another claim after lease expiry
    // remains possible, so external delivery is expressly at-least-once.
    const lock = await db.eventOutbox.updateMany({ where: { ...owned(job), leaseUntil: { gt: clock() } }, data: { leaseToken: job.leaseToken } });
    if (!lock.count) return { id: job.id, status: 'lease_lost' };
    await sendWebhook(payload, job);
    const result = await db.eventOutbox.updateMany({ where: owned(job), data: { status: 'delivered', completedAt: clock(), leaseToken: null, leaseUntil: null, lastErrorCode: null } });
    return { id: job.id, status: result.count ? 'delivered' : 'lease_lost' };
  } catch (error) {
    return failJob(db, job, error, clock());
  }
}

export async function runOutboxBatch(db, handlers, { limit = 100, clock = () => new Date(), signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new OutboxError('OUTBOX_INVALID_LIMIT');
  const results = [];
  for (let i = 0; i < limit; i++) {
    if (signal?.aborted) break;
    const job = await claimOutboxJob(db, { now: clock() });
    if (!job) break;
    results.push(await processOutboxJob(db, job, { ...handlers, clock }));
  }
  return results;
}

/** Explicit operator retry only; delivered occurrences are never replayed. */
export async function retryDeadOutboxJob(db, id, { now = new Date() } = {}) {
  return db.eventOutbox.updateMany({ where: { id: token(id, 'ID'), status: 'dead' }, data: {
    status: 'pending', attempts: 0, availableAt: now, leaseToken: null, leaseUntil: null, lastErrorCode: null,
  } });
}
