import { createHash } from 'node:crypto';
import { filterableOf } from './registry.js';
import { rolesOf } from './perm.js';

export const COLLECTION_MAX_LIMIT = 2000;
export const COLLECTION_MAX_PAGE_SIZE = 200;

export class CollectionQueryError extends Error {
  constructor(message, code = 'collection_query_invalid', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function singleValue(params, key) {
  if (params.getAll(key).length > 1) throw new CollectionQueryError(`Tham số ${key} chỉ được truyền một lần.`);
  return params.get(key);
}

function positiveLimit(value, maximum) {
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new CollectionQueryError('Giới hạn danh sách phải là số nguyên dương.', 'collection_limit_invalid');
  }
  return Math.min(Number(value), maximum);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  }
  return value;
}

function cursorBinding(resource, user, where, orderBy, size) {
  return createHash('sha256').update(JSON.stringify(stableValue({
    resource, userId: user.id, roles: [...rolesOf(user)].sort(), teamId: user.teamId ?? null, where, orderBy, size,
  }))).digest('base64url');
}

function decodeCursor(value, binding) {
  try {
    if (!value || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (cursor.v !== 1 || cursor.binding !== binding || typeof cursor.id !== 'string' || !cursor.id || cursor.id.length > 200) throw new Error();
    return cursor.id;
  } catch {
    throw new CollectionQueryError('Trang dữ liệu không còn phù hợp. Hãy tải lại từ trang đầu.', 'collection_cursor_invalid');
  }
}

// No pagination parameters preserves the array/full-list contract used by existing
// dashboards. New list clients opt in with pageSize and follow the response cursor.
// Both transports use the same allowlisted filters; request filters only narrow scope.
export async function readCollection(db, { resource, cfg, user, params }) {
  const rawLimit = singleValue(params, 'limit');
  const rawPageSize = singleValue(params, 'pageSize');
  const rawCursor = singleValue(params, 'cursor');
  if (rawLimit !== null && rawPageSize !== null) throw new CollectionQueryError('Chỉ dùng một trong limit hoặc pageSize.');
  if (rawCursor !== null && rawPageSize === null) throw new CollectionQueryError('Phân trang bằng cursor cần pageSize.', 'collection_cursor_invalid');
  const size = rawPageSize !== null ? positiveLimit(rawPageSize, COLLECTION_MAX_PAGE_SIZE) : null;
  const limit = rawLimit !== null ? positiveLimit(rawLimit, COLLECTION_MAX_LIMIT) : undefined;
  const extra = {};
  for (const field of filterableOf(resource)) {
    const value = singleValue(params, field);
    if (value !== null && value !== '') extra[field] = value === '__null__' ? null : value;
  }
  const scope = cfg.scope ? await cfg.scope(user, db) : {};
  const where = Object.keys(extra).length ? { AND: [scope, extra] } : scope;
  if (size === null) {
    const rows = await db[cfg.model].findMany({ where, orderBy: cfg.orderBy, ...(limit ? { take: limit } : {}) });
    return { rows: cfg.sanitize ? rows.map(row => cfg.sanitize(row, user)) : rows, page: null };
  }

  // Registry sorts can contain ties or nulls. A unique final sort makes every
  // page deterministic while Prisma retains the resource's existing null order.
  const orderBy = [...(Array.isArray(cfg.orderBy) ? cfg.orderBy : cfg.orderBy ? [cfg.orderBy] : [])];
  if (!orderBy.some(order => Object.hasOwn(order, 'id'))) orderBy.push({ id: 'asc' });
  const binding = cursorBinding(resource, user, where, orderBy, size);
  const afterId = rawCursor !== null ? decodeCursor(rawCursor, binding) : null;
  if (afterId) {
    // A cursor is a position, never authorization. Verify the anchor against the
    // current scope/filter too; a deleted or reassigned row requires a refresh.
    const anchor = await db[cfg.model].findFirst({ where: { AND: [where, { id: afterId }] }, select: { id: true } });
    if (!anchor) throw new CollectionQueryError('Danh sách đã thay đổi. Hãy tải lại từ trang đầu.', 'collection_cursor_expired', 409);
  }
  const rows = await db[cfg.model].findMany({
    where, orderBy, take: size + 1, ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
  });
  const hasMore = rows.length > size;
  const visible = rows.slice(0, size);
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ v: 1, binding, id: visible.at(-1).id })).toString('base64url') : null;
  return {
    rows: cfg.sanitize ? visible.map(row => cfg.sanitize(row, user)) : visible,
    page: { size, hasMore, nextCursor },
  };
}

export function collectionHeaders(page = null) {
  return {
    'Cache-Control': 'private, no-store',
    ...(page ? {
      'X-Collection-Page-Size': String(page.size),
      'X-Collection-Has-More': String(page.hasMore),
      ...(page.nextCursor ? { 'X-Collection-Next-Cursor': page.nextCursor } : {}),
    } : {}),
  };
}
