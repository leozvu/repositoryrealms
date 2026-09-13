// Exercise the actual summary route and insights with no DB/network/auth session.
export async function resolve(specifier, context, nextResolve) {
  if (['@/lib/prisma', './prisma.js', '@/lib/apiauth'].includes(specifier)) {
    return { url: new URL('./stub-financial-report-boundaries.mjs', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === 'next/server') return { url: new URL('./stub-next-server.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    return { url: new URL('../../' + specifier.slice(2) + (specifier.endsWith('.js') ? '' : '.js'), import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
