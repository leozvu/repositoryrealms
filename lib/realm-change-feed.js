import { RealmOperationError } from './realm-operation.js';

export const REALM_CHANGE_RETENTION_DAYS = 14;
export const REALM_CHANGE_POLL_MS = 5_000;
export const REALM_CHANGE_MAX_BATCH = 100;

const DOMAIN_MAP = Object.freeze({
  tasks: ['operations', 'guild', 'campaigns', 'command', 'rewards'],
  timelogs: ['operations', 'command'],
  approvals: ['command', 'notifications'],
  taskcomments: ['operations', 'campaigns'],
  activities: ['embassy'],
  taskevents: ['operations', 'campaigns'],
  projects: ['guild', 'campaigns'],
  phases: ['campaigns'],
  milestones: ['campaigns'],
  users: ['directory', 'guild', 'command'],
  teams: ['directory', 'guild', 'campaigns'],
  leads: ['embassy'],
  clients: ['embassy'],
  contacts: ['embassy'],
  settings: ['access', 'operations', 'guild', 'campaigns', 'command', 'embassy', 'rewards'],
  realm_profile: ['operations', 'directory'],
  realm_gold: ['operations', 'treasury', 'rewards'],
  realm_rewards: ['operations', 'guild', 'rewards'],
  realm_treasury: ['operations', 'treasury'],
  notifications: ['notifications'],
  messages: ['communications'],
  collaboration: ['collaboration', 'notifications', 'communications'],
});

const safeToken = (value, max = 100) => String(value ?? '').trim().replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, max);

export function realmChangeDomains(resource) {
  return [...(DOMAIN_MAP[safeToken(resource).toLowerCase()] || [])];
}

export function encodeRealmChangeCursor({ createdAt, id = '' } = {}) {
  const date = new Date(createdAt || '');
  const safeId = safeToken(id);
  if (Number.isNaN(date.getTime())) throw new RealmOperationError('Cursor change-feed không hợp lệ.', 400, 'realm_change_cursor_invalid');
  return Buffer.from(JSON.stringify({ v: 1, at: date.toISOString(), id: safeId }), 'utf8').toString('base64url');
}

export function decodeRealmChangeCursor(value) {
  try {
    const parsed = JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
    const date = new Date(parsed?.at || '');
    const id = safeToken(parsed?.id);
    if (parsed?.v !== 1 || Number.isNaN(date.getTime()) || parsed?.id !== id) throw new Error('invalid');
    return { createdAt: date, id };
  } catch {
    throw new RealmOperationError('Cursor change-feed không hợp lệ.', 400, 'realm_change_cursor_invalid');
  }
}

export async function publishRealmChange(db, {
  resource,
  action = 'update',
  entityId = null,
  actorId = null,
  audienceUserId = null,
  createdAt = new Date(),
} = {}) {
  const normalizedResource = safeToken(resource).toLowerCase();
  const domains = realmChangeDomains(normalizedResource);
  if (!domains.length) return null;
  const row = await db.realmChangeEvent.create({
    data: {
      resource: normalizedResource,
      action: safeToken(action, 30).toLowerCase() || 'update',
      entityId: safeToken(entityId) || null,
      actorId: safeToken(actorId) || null,
      audienceUserId: safeToken(audienceUserId) || null,
      domains: JSON.stringify(domains),
      createdAt,
    },
  });
  const retentionCutoff = new Date(createdAt.getTime() - REALM_CHANGE_RETENTION_DAYS * 86_400_000);
  await db.realmChangeEvent.deleteMany({ where: { createdAt: { lt: retentionCutoff } } });
  return row;
}

export async function loadRealmChangeFeed(db, user, { cursor = null, limit = REALM_CHANGE_MAX_BATCH } = {}, now = new Date()) {
  if (!user?.id) throw new RealmOperationError('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  const take = Math.max(1, Math.min(Number(limit) || REALM_CHANGE_MAX_BATCH, REALM_CHANGE_MAX_BATCH));

  const audience = { OR: [{ audienceUserId: null }, { audienceUserId: user.id }] };

  if (!cursor) {
    const latest = await db.realmChangeEvent.findFirst({
      where: audience,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, createdAt: true },
    });
    return {
      source: 'erp',
      cursor: encodeRealmChangeCursor(latest || { createdAt: now, id: '' }),
      changed: false,
      domains: [],
      eventCount: 0,
      generatedAt: now.toISOString(),
      pollAfterMs: REALM_CHANGE_POLL_MS,
    };
  }

  const decoded = decodeRealmChangeCursor(cursor);
  const afterCursor = decoded.id
    ? { OR: [{ createdAt: { gt: decoded.createdAt } }, { createdAt: decoded.createdAt, id: { gt: decoded.id } }] }
    : { createdAt: { gt: decoded.createdAt } };
  const rows = await db.realmChangeEvent.findMany({
    where: { AND: [audience, afterCursor] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, createdAt: true, domains: true },
    take,
  });
  const domainSet = new Set();
  for (const row of rows) {
    try {
      for (const domain of JSON.parse(row.domains || '[]')) {
        if (/^[a-z][a-z0-9_-]{1,30}$/.test(domain)) domainSet.add(domain);
      }
    } catch { /* malformed legacy event is ignored */ }
  }
  const latest = rows.at(-1);
  return {
    source: 'erp',
    cursor: latest ? encodeRealmChangeCursor(latest) : cursor,
    changed: rows.length > 0,
    domains: [...domainSet].sort(),
    eventCount: rows.length,
    hasMore: rows.length === take,
    generatedAt: now.toISOString(),
    pollAfterMs: REALM_CHANGE_POLL_MS,
  };
}

export async function safelyPublishRealmChange(db, input, logger = console.error) {
  try {
    return await publishRealmChange(db, input);
  } catch (error) {
    logger(`[realm-change-feed] ${String(error?.message || error).slice(0, 200)}`);
    return null;
  }
}
