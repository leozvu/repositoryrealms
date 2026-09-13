// Real payroll handlers; isolated persistence/auth, no Prisma or environment load.
export async function resolve(specifier, context, nextResolve) {
  if (['@/lib/prisma', '@/lib/auth'].includes(specifier)) return { url: new URL('./stub-payroll-boundaries.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier === 'next/server') return { url: new URL('./stub-next-server.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('@/')) return { url: new URL('../../' + specifier.slice(2) + '.js', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
