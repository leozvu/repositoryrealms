export async function resolve(specifier, context, nextResolve) {
  if (specifier === './prisma.js' && context.parentURL?.includes('/lib/')) {
    return { url: new URL('./stub-event-outbox-prisma.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
