import { RESOURCES, canRead } from './registry.js';
import { hasAny, isFreelancer } from './perm.js';
import { modOn, resourceMod } from './modules.js';

export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 20;
const GROUPS = {
  clients: { search: ['name', 'contact', 'industry', 'phone'], display: ['name', 'industry'] },
  leads: { search: ['name', 'company', 'phone', 'email'], display: ['name', 'company'] },
  projects: { search: ['name', 'service'], display: ['name', 'service'] },
  tasks: { search: ['title', 'note'], display: ['title', 'status'] },
  invoices: { search: ['code'], display: ['code', 'date'] },
  tickets: { search: ['code', 'title'], display: ['code', 'title', 'status'] },
  vendors: { search: ['name', 'type'], display: ['name', 'type'] },
  contracts: { search: ['code', 'partner'], display: ['code', 'partner', 'endDate'] },
  users: { search: ['name', 'email', 'title'], display: ['name', 'title'] },
};

export class SearchError extends Error {
  constructor(message, status = 400, code = 'search_invalid') { super(message); this.status = status; this.code = code; }
}
const fail = (message, status, code) => { throw new SearchError(message, status, code); };
const normalizeQuery = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
// Prisma's PostgreSQL contains filter uses LIKE. Treat user %/_ as text, not
// wildcards which could turn a two-character query into a whole-table match.
const literalContains = value => value.replace(/[\\%_]/g, '\\$&');

function decodeCursor(value, { query, resource, userId }) {
  if (!value) return null;
  try {
    if (!resource || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (cursor.v !== 1 || cursor.q !== query || cursor.r !== resource || cursor.u !== userId
      || typeof cursor.id !== 'string' || !cursor.id || cursor.id.length > 200) throw new Error();
    return cursor.id;
  } catch { fail('Trang tìm kiếm không còn hợp lệ. Hãy tìm lại từ đầu.', 400, 'search_cursor_invalid'); }
}

export function parseSearchRequest(params, user) {
  if (!user?.id) fail('Bạn cần đăng nhập ERP.', 401, 'unauthorized');
  if (isFreelancer(user) || (user.status && user.status !== 'active')) fail('Không có quyền tìm kiếm dữ liệu nội bộ.', 403, 'forbidden');
  const query = normalizeQuery(params.get('q'));
  if (query.length < 2 || query.length > 100) fail('Từ khóa cần từ 2 đến 100 ký tự.', 400, 'search_query_invalid');
  const resource = params.get('resource') || null;
  if (resource && !Object.hasOwn(GROUPS, resource)) fail('Nhóm tìm kiếm không hợp lệ.', 400, 'search_resource_invalid');
  const requested = params.has('limit') ? Number(params.get('limit')) : SEARCH_DEFAULT_LIMIT;
  if (!Number.isSafeInteger(requested) || requested < 1) fail('Giới hạn tìm kiếm không hợp lệ.', 400, 'search_limit_invalid');
  const limit = Math.min(requested, SEARCH_MAX_LIMIT);
  const afterId = decodeCursor(params.get('cursor'), { query, resource, userId: user.id });
  return { query, resource, limit, afterId };
}

export async function searchRecords(db, user, params, modules = null) {
  const request = parseSearchRequest(params, user);
  const allowed = resource => canRead(resource, user) && modOn(resourceMod(resource), modules);
  if (request.resource && !allowed(request.resource)) fail('Bạn không có quyền tìm trong nhóm này.', 403, 'forbidden');
  const resources = (request.resource ? [request.resource] : Object.keys(GROUPS)).filter(allowed);
  const groups = await Promise.all(resources.map(async resource => {
    const config = RESOURCES[resource];
    const descriptor = GROUPS[resource];
    // Matching itself must not reveal a hidden contact field via result presence.
    const fields = resource === 'clients' && !hasAny(user, ['AM', 'PM', 'ACCOUNTANT'])
      ? ['name', 'industry'] : descriptor.search;
    const scope = config.scope ? await config.scope(user, db) : {};
    const terms = request.query.split(' ');
    const where = { AND: [scope, ...terms.map(term => ({ OR: fields.map(field => ({ [field]: { contains: literalContains(term), mode: 'insensitive' } })) })),
      ...(request.afterId ? [{ id: { gt: request.afterId } }] : [])] };
    const displayFields = ['id', ...descriptor.display];
    const rows = await db[config.model].findMany({ where, select: Object.fromEntries(displayFields.map(field => [field, true])), orderBy: { id: 'asc' }, take: request.limit + 1 });
    const hasMore = rows.length > request.limit;
    const page = rows.slice(0, request.limit);
    const items = page.map(row => {
      const safe = config.sanitize ? config.sanitize(row, user) : row;
      return Object.fromEntries(displayFields.filter(field => Object.hasOwn(safe, field)).map(field => [field, typeof safe[field] === 'string' && field !== 'id' ? safe[field].slice(0, 300) : safe[field]]));
    });
    const nextCursor = hasMore ? Buffer.from(JSON.stringify({ v: 1, q: request.query, r: resource, u: user.id, id: page.at(-1).id })).toString('base64url') : null;
    return { resource, items, hasMore, nextCursor };
  }));
  return { query: request.query, limit: request.limit, groups, capped: groups.some(group => group.hasMore) };
}
