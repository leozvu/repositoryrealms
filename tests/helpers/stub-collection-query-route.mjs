export const state = { user: null, db: null, enabled: true };
export const prisma = new Proxy({}, { get: (_target, key) => state.db[key] });
export const currentUser = async () => state.user;
export const apiUser = async () => state.user;
export const resourceEnabled = async () => state.enabled;
export const interceptWrite = async () => null;
