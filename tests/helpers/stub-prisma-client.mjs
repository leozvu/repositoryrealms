// Test stub for '@prisma/client'. Two jobs:
//   1. Mimic the REAL database result for a key that was never provisioned:
//      every lookup (including apiKey.findUnique) MISSES -> resolves null.
//      That is exactly what production Prisma returns for the LEOZOPS key,
//      which T2 guarantees is never written to the ApiKey table.
//   2. Record every model.operation call in `prismaOps` so tests can prove
//      that a denied request performed ONLY the auth lookup and never reached
//      any business handler (no lead/auditLog/notification/... access).
export const prismaOps = [];
export function _resetPrismaOps() {
  prismaOps.length = 0;
}

export class PrismaClient {
  constructor() {
    return new Proxy({}, {
      get(_target, model) {
        if (typeof model !== 'string' || model === 'then') return undefined;
        if (model.startsWith('$')) return () => Promise.resolve(); // $connect etc.
        return new Proxy({}, {
          get(_t, op) {
            if (typeof op !== 'string' || op === 'then') return undefined;
            return (...args) => {
              prismaOps.push({ call: `${model}.${op}`, args });
              return Promise.resolve(null); // unprovisioned key: every lookup misses
            };
          },
        });
      },
    });
  }
}
