// v3.21: guard API theo phân hệ bật/tắt (defense-in-depth). Chỉ ẩn menu là chưa đủ —
// resource thuộc phân hệ TẮT phải bị chặn ở cả API, không để deep-link/gọi thẳng lọt qua.
import { prisma } from './prisma.js';
import { cached } from './cache.js';
import { resourceMod, modOn } from './modules.js';

// true = resource này được phép (phân hệ của nó đang bật, hoặc là lõi).
export async function resourceEnabled(resource) {
  const mod = resourceMod(resource);
  if (!mod) return true; // lõi — không bao giờ chặn theo module
  // cache 30s: Setting.modules đổi hiếm, nhưng /api/data gọi liên tục
  const modules = await cached('company-modules', 30_000, async () => {
    const row = await prisma.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    try { const m = JSON.parse(row?.json || '{}').modules; return Array.isArray(m) ? m : null; }
    catch { return null; }
  });
  return modOn(mod, modules);
}
