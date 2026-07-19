// Test-only ESM loader (registered via node:module register()) that lets
// `node --test` execute the REAL Next.js route modules prisma-free:
//   * '@/...'          -> resolved to the repo root (mirrors jsconfig.json)
//   * 'next/server'    -> minimal NextResponse stub (next is not installed)
//   * '@prisma/client' -> recording stub whose lookups MISS like a real DB
//                         with no provisioned row (see stub-prisma-client.mjs)
// Nothing else is intercepted — every lib/ and app/ module under test is the
// real production source.

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return { url: new URL('./stub-next-server.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === '@prisma/client') {
    return { url: new URL('./stub-prisma-client.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    let rel = specifier.slice(2);
    if (!/\.(m?js|json)$/.test(rel)) rel += '.js';
    return { url: new URL('../../' + rel, import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
