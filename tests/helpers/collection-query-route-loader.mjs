const boundaries = new Set(['@/lib/prisma', '@/lib/auth', '@/lib/apiauth', '@/lib/approvals', '@/lib/module-guard']);
export async function resolve(specifier, context, nextResolve) {
  if (boundaries.has(specifier)) return { url: new URL('./stub-collection-query-route.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'next/server') return { url: new URL('./stub-next-server.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const relative = specifier.slice(2) + (specifier.endsWith('.js') ? '' : '.js');
    return { url: new URL('../../' + relative, import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
