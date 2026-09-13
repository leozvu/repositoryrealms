export const prisma = new Proxy({}, { get(_target, model) {
  return {
    findMany: async () => structuredClone(globalThis.__financialReportFixture?.[model] || []),
    findUnique: async () => model === 'setting' ? { json: '{}' } : null,
    count: async () => 0,
  };
} });
export const apiUser = async () => globalThis.__financialReportUser;
