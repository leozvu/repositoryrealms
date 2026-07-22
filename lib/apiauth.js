// v3.3: Xác thực API mở — Bearer key hoạt động như một "user ảo" có vai trò,
// đi qua đúng RBAC trong registry như user thật.
import crypto from 'crypto';
import { prisma } from './prisma.js';

export const hashKey = raw => crypto.createHash('sha256').update(raw).digest('hex');

// Sinh key mới: ak_ + 40 hex — trả raw đúng 1 lần lúc tạo
export const generateKey = () => 'ak_' + crypto.randomBytes(20).toString('hex');

function parseScopes(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((scope) => typeof scope === 'string' && scope.trim()) : [];
  } catch {
    return [];
  }
}

// Trả về user ảo {id, name, roles} hoặc null nếu key sai/đã khóa
export async function apiUser(req) {
  const auth = req.headers.get('authorization') || '';
  const raw = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!raw) return null;
  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(raw) } });
  if (!key || !key.active || (key.expiresAt && new Date(key.expiresAt) <= new Date())) return null;
  // CEO service credentials are intentionally unusable on the generic ERP API.
  // Legacy keys have no scopes/audience and retain their existing RBAC behaviour.
  if (parseScopes(key.scopes).length || key.audience) return null;
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsed: new Date() } }).catch(() => {});
  let roles = ['PM'];
  try { roles = JSON.parse(key.roles); } catch {}
  return { id: 'apikey:' + key.id, name: 'API ' + key.name, roles, teamId: null };
}
